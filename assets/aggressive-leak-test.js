import { applyNetworkEvent, applyObservation, createLeakState, finalizeLeakResult } from './leak-observation.js';
import { classifyIpAddress } from './ip-classification.js';

function copyState(state) {
  return {
    ...state,
    baseline: { 4: [...state.baseline[4]], 6: [...state.baseline[6]] },
    samples: [...state.samples],
    networkEvents: [...state.networkEvents],
    exposures: state.exposures.map((item) => ({ ...item, sources: [...item.sources], channels: [...item.channels], timestampsMs: [...item.timestampsMs] })),
    schedulerAttempts: [...state.schedulerAttempts]
  };
}

export function createAggressiveLeakTest({
  config,
  initialBaseline = { 4: [], 6: [] },
  sampleHttp,
  sampleStun,
  sampleEcho,
  sampleTls,
  now = () => Date.now(),
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
  environment = globalThis,
  onUpdate = () => {}
}) {
  let runSequence = 0;
  let currentRunId = 0;
  let state = { ...createLeakState({ baseline: initialBaseline, startedAt: 0, durationMs: config.aggressiveDurationMs }), status: 'idle', result: null, reasons: [], coverage: null, runId: 0, endsAt: null };
  const timers = new Set();
  const listenerRecords = [];
  let lastBurstAt = -Infinity;

  function emit() { onUpdate(copyState(state)); }
  function active(runId = currentRunId) { return state.status === 'running' && runId === currentRunId; }
  function schedule(fn, delay, runId) {
    const id = setTimeoutImpl(async () => {
      timers.delete(id);
      if (!active(runId)) return;
      await fn(runId);
    }, delay);
    timers.add(id);
    return id;
  }

  function recordObservation(observation, runId) {
    if (!active(runId)) return;
    state = { ...applyObservation(state, observation), status: state.status, result: state.result, reasons: state.reasons, coverage: state.coverage, runId: state.runId, endsAt: state.endsAt };
  }

  async function runHttp(trigger, runId, intendedMs = null) {
    if (!active(runId)) return;
    const actualMs = now();
    if (trigger !== 'baseline') {
      state = { ...state, schedulerAttempts: [...state.schedulerAttempts, { intendedMs: intendedMs ?? actualMs, actualMs }] };
    }
    let results = [];
    try { results = await sampleHttp(); } catch { results = []; }
    if (!active(runId)) return;
    for (const result of results ?? []) {
      const family = result?.family;
      if (trigger === 'baseline' && result?.address && [4, 6].includes(family) && state.baseline[family].length === 0) {
        state = { ...state, baseline: { ...state.baseline, [family]: [result.address] } };
      }
      recordObservation({
        timestampMs: now(), family, address: result?.address ?? null, channel: 'http',
        source: family === 6 ? 'HTTP IPv6' : 'HTTP IPv4', trigger, successful: Boolean(result?.address),
        providerCoverage: result?.agreement ?? null
      }, runId);
    }
    emit();
  }

  async function runStun(trigger, runId) {
    let records = [];
    try { records = await sampleStun(); } catch { records = []; }
    if (!active(runId)) return;
    for (const entry of records ?? []) {
      const result = entry?.result ?? entry;
      const source = entry?.server ? entry.server.replace(/^stun:/, '') : 'STUN';
      for (const candidate of result?.candidates ?? []) {
        if (candidate?.type !== 'srflx' || candidate?.classification !== 'public') continue;
        recordObservation({ timestampMs: now(), family: candidate.family, address: candidate.address, channel: 'stun', source, trigger, successful: true, port: candidate.port, protocol: candidate.protocol }, runId);
      }
    }
    emit();
  }

  async function runEcho(trigger, runId) {
    let result = null;
    try { result = await sampleEcho(); } catch {}
    if (!active(runId)) return;
    const address = result?.observedIp ?? null;
    const family = classifyIpAddress(address).family;
    recordObservation({ timestampMs: now(), family, address, channel: 'echo', source: 'HTTP echo', trigger, successful: Boolean(address) }, runId);
    emit();
  }

  async function runTls(trigger, runId) {
    let result = null;
    try { result = await sampleTls(); } catch {}
    if (!active(runId)) return;
    const address = result?.observedIp ?? null;
    const family = classifyIpAddress(address).family;
    recordObservation({ timestampMs: now(), family, address, channel: 'tls', source: 'TLS reflector', trigger, successful: Boolean(address) }, runId);
    emit();
  }

  function recurring(task, interval, runId, startedAt) {
    let sequence = 1;
    const scheduleNext = () => {
      if (!active(runId)) return;
      const intended = startedAt + sequence * interval;
      if (intended >= startedAt + config.aggressiveDurationMs) return;
      const delay = Math.max(0, intended - now());
      schedule(() => {
        if (!active(runId)) return;
        sequence += 1;
        scheduleNext();
        void Promise.resolve(task('scheduled', runId, intended)).catch(() => {});
      }, delay, runId);
    };
    scheduleNext();
  }

  async function networkBurst(runId) {
    if (!active(runId)) return;
    await Promise.allSettled([runHttp('network-burst', runId), runStun('network-burst', runId)]);
  }

  function handleNetworkEvent(type) {
    if (state.status !== 'running') return;
    const timestampMs = now();
    state = applyNetworkEvent(state, { timestampMs, type, visibilityState: environment.document?.visibilityState ?? null });
    emit();
    if (type === 'offline' || type === 'visibilitychange') return;
    if (timestampMs - lastBurstAt < config.aggressiveBurstCooldownMs) return;
    lastBurstAt = timestampMs;
    schedule(networkBurst, 0, currentRunId);
  }

  function addListener(target, type, handler) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, handler);
    listenerRecords.push([target, type, handler]);
  }

  function registerListeners() {
    addListener(environment, 'online', () => handleNetworkEvent('online'));
    addListener(environment, 'offline', () => handleNetworkEvent('offline'));
    addListener(environment, 'visibilitychange', () => handleNetworkEvent('visibilitychange'));
    addListener(environment.navigator?.connection, 'change', () => handleNetworkEvent('connection-change'));
  }

  function cleanup() {
    for (const id of timers) clearTimeoutImpl(id);
    timers.clear();
    for (const [target, type, handler] of listenerRecords.splice(0)) target.removeEventListener?.(type, handler);
  }

  function finish(runId, manual = false) {
    if (!active(runId)) return;
    cleanup();
    if (manual) state = { ...state, stoppedEarly: now() < state.endsAt };
    const final = finalizeLeakResult(state, config, now());
    state = { ...state, status: manual ? 'stopped' : 'complete', result: final.result, resultLabel: final.label, reasons: final.reasons, exposures: final.exposures, coverage: final.coverage };
    emit();
  }

  async function start() {
    cleanup();
    runSequence += 1;
    currentRunId = runSequence;
    const runId = currentRunId;
    lastBurstAt = -Infinity;
    state = {
      ...createLeakState({ baseline: initialBaseline, startedAt: now(), durationMs: config.aggressiveDurationMs }),
      status: 'running', result: null, resultLabel: null, reasons: [], coverage: null,
      runId, endsAt: null
    };
    registerListeners();
    emit();
    await Promise.allSettled([
      runHttp('baseline', runId), runStun('baseline', runId), runEcho('baseline', runId), runTls('baseline', runId)
    ]);
    if (!active(runId)) return copyState(state);

    const startedAt = now();
    state = {
      ...state,
      startedAt,
      durationMs: config.aggressiveDurationMs,
      endsAt: startedAt + config.aggressiveDurationMs,
      schedulerAttempts: []
    };
    emit();

    recurring(runHttp, config.aggressiveHttpIntervalMs, runId, startedAt);
    recurring(runStun, config.aggressiveStunIntervalMs, runId, startedAt);
    recurring(runEcho, config.aggressiveEchoIntervalMs, runId, startedAt);
    recurring(runTls, config.aggressiveTlsIntervalMs, runId, startedAt);
    schedule(() => finish(runId, false), config.aggressiveDurationMs, runId);
    return copyState(state);
  }

  function stop() {
    if (state.status !== 'running') return copyState(state);
    finish(currentRunId, true);
    return copyState(state);
  }

  function replaceExposure(nextExposure, expectedRunId = currentRunId) {
    if (!nextExposure?.key || expectedRunId !== currentRunId) return false;
    const index = state.exposures.findIndex((item) => item.key === nextExposure.key);
    if (index < 0) return false;
    const exposures = state.exposures.map((item, itemIndex) => itemIndex === index ? { ...item, ...nextExposure } : item);
    state = { ...state, exposures };
    emit();
    return true;
  }

  return { start, stop, getState: () => copyState(state), handleNetworkEvent, replaceExposure };
}
