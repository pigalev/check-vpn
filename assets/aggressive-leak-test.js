import { applyNetworkEvent, applyObservation, createLeakState, finalizeLeakResult } from './leak-observation.js';
import { classifyIpAddress } from './ip-classification.js';
import { classifyLeakAddress } from './leak-classifier.js';
import { createReconnectBurst } from './reconnect-burst.js';

function copyExposure(item) {
  return {
    ...item,
    sources: [...(item.sources ?? [])],
    channels: [...(item.channels ?? [])],
    timestampsMs: [...(item.timestampsMs ?? [])],
    transportClasses: [...(item.transportClasses ?? [])],
    providerGroups: [...(item.providerGroups ?? [])],
    perChannelCounts: { ...(item.perChannelCounts ?? {}) }
  };
}

function copyState(state) {
  return {
    ...state,
    baseline: { 4: [...state.baseline[4]], 6: [...state.baseline[6]] },
    samples: [...state.samples],
    networkEvents: [...state.networkEvents],
    exposures: state.exposures.map(copyExposure),
    schedulerAttempts: [...state.schedulerAttempts],
    reconnectBurst: state.reconnectBurst ? { ...state.reconnectBurst, reasons: [...(state.reconnectBurst.reasons ?? [])], completedOffsets: [...(state.reconnectBurst.completedOffsets ?? [])] } : null
  };
}

function guidedVerdict(exposures, coverage) {
  if (exposures.some((item) => item.relation === 'known-real')) {
    return { result: 'leak', guidedResult: 'real-leak', label: 'REAL IP LEAK DETECTED', reasons: ['A captured pre-VPN public address was observed during the VPN test.'] };
  }
  if (exposures.some((item) => item.confirmationLevel === 'confirmed-unknown')) {
    return { result: 'leak', guidedResult: 'unexpected-leak', label: 'UNEXPECTED PUBLIC IP DETECTED', reasons: ['An unexpected public address was confirmed during the VPN test.'] };
  }
  if (exposures.some((item) => item.confirmationLevel === 'unconfirmed-unknown')) {
    return { result: 'review', guidedResult: 'review', label: 'REVIEW', reasons: ['An unexpected public address was observed once and could not be confirmed.'] };
  }
  if (!coverage?.sufficient) {
    return { result: 'inconclusive', guidedResult: 'inconclusive', label: 'TEST INCONCLUSIVE', reasons: ['Sampling coverage was not sufficient to make a clean observation statement.'] };
  }
  return { result: 'clean', guidedResult: 'clean', label: 'NO KNOWN REAL IP OBSERVED', reasons: [] };
}

export function createAggressiveLeakTest({
  config,
  initialBaseline = { 4: [], 6: [] },
  guidedProfile = null,
  sampleHttp,
  sampleHttpObservations = null,
  sampleStun,
  sampleWebRtcStress = null,
  sampleEcho,
  sampleTls,
  createBurst = (options) => createReconnectBurst(options),
  now = () => Date.now(),
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
  environment = globalThis,
  onUpdate = () => {},
  onLeakObservation = () => {}
}) {
  let runSequence = 0;
  let currentRunId = 0;
  let state = { ...createLeakState({ baseline: initialBaseline, startedAt: 0, durationMs: config.aggressiveDurationMs }), status: 'idle', result: null, reasons: [], coverage: null, runId: 0, endsAt: null, reconnectBurst: null };
  const timers = new Set();
  const listenerRecords = [];
  let lastBurstAt = -Infinity;
  let burstController = null;

  function emit() {
    if (burstController?.getState) state = { ...state, reconnectBurst: burstController.getState() };
    onUpdate(copyState(state));
  }
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
    const before = state.exposures.length;
    state = { ...applyObservation(state, observation), status: state.status, result: state.result, reasons: state.reasons, coverage: state.coverage, runId: state.runId, endsAt: state.endsAt };
    if (state.exposures.length > before || state.exposures.some((item) => item.address === observation.address)) onLeakObservation(observation, copyState(state));
  }

  function classifyObservation(address) {
    return guidedProfile ? classifyLeakAddress(address, guidedProfile).relation : null;
  }

  function recordConsensusSample(result, trigger, runId) {
    const family = result?.family;
    const address = result?.address ?? null;
    const relation = address ? classifyObservation(address) : null;
    if (trigger === 'baseline' && address && [4, 6].includes(family) && state.baseline[family].length === 0 && relation !== 'known-real') {
      state = { ...state, baseline: { ...state.baseline, [family]: [address] } };
    }
    const observation = {
      timestampMs: now(), family, address, channel: 'http', transportClass: 'http',
      source: family === 6 ? 'HTTP IPv6' : 'HTTP IPv4', trigger, successful: Boolean(address),
      providerCoverage: result?.agreement ?? null,
      relation: relation ?? undefined
    };
    if (guidedProfile && sampleHttpObservations) {
      state = { ...state, samples: [...state.samples, observation] };
      return;
    }
    recordObservation(observation, runId);
  }

  async function runRawHttp(trigger, runId) {
    if (!active(runId) || typeof sampleHttpObservations !== 'function') return;
    let observations = [];
    try { observations = await sampleHttpObservations(trigger); } catch { observations = []; }
    if (!active(runId)) return;
    for (const item of observations ?? []) {
      const successful = item?.status === 'complete' && Boolean(item?.address);
      const relation = successful ? classifyObservation(item.address) : null;
      recordObservation({
        timestampMs: item?.timestampMs ?? now(),
        family: item?.family,
        address: item?.address ?? null,
        channel: 'http-provider',
        transportClass: 'http',
        source: item?.providerLabel ?? item?.providerId ?? 'HTTP provider',
        providerGroup: item?.providerGroup ?? item?.providerId ?? null,
        providerId: item?.providerId ?? null,
        trigger,
        successful,
        relation: relation ?? undefined,
        latencyMs: item?.latencyMs ?? null
      }, runId);
    }
    emit();
  }

  async function runHttp(trigger, runId, intendedMs = null) {
    if (!active(runId)) return;
    const actualMs = now();
    if (trigger !== 'baseline' && trigger !== 'reconnect-burst') {
      state = { ...state, schedulerAttempts: [...state.schedulerAttempts, { intendedMs: intendedMs ?? actualMs, actualMs }] };
    }
    const consensusPromise = Promise.resolve().then(() => sampleHttp?.()).catch(() => []);
    const rawPromise = runRawHttp(trigger, runId);
    const results = await consensusPromise;
    if (!active(runId)) return;
    for (const result of results ?? []) recordConsensusSample(result, trigger, runId);
    await rawPromise;
    if (active(runId)) emit();
  }

  async function runStun(trigger, runId) {
    let records = [];
    try { records = await sampleStun?.(); } catch { records = []; }
    if (!active(runId)) return;
    for (const entry of records ?? []) {
      const result = entry?.result ?? entry;
      const source = entry?.server ? entry.server.replace(/^stun:/, '') : 'STUN';
      for (const candidate of result?.candidates ?? []) {
        if (candidate?.type !== 'srflx' || candidate?.classification !== 'public') continue;
        recordObservation({
          timestampMs: now(), family: candidate.family, address: candidate.address,
          channel: 'stun', transportClass: 'stun', source, providerGroup: entry?.group ?? source,
          trigger, successful: true, port: candidate.port, protocol: candidate.protocol,
          relation: classifyObservation(candidate.address) ?? undefined
        }, runId);
      }
    }
    emit();
  }

  async function runStress(trigger, runId) {
    if (!active(runId) || typeof sampleWebRtcStress !== 'function') return;
    let result = null;
    try { result = await sampleWebRtcStress(trigger); } catch { result = null; }
    if (!active(runId)) return;
    for (const candidate of result?.candidates ?? []) {
      if (candidate?.classification !== 'public' || !candidate?.address) continue;
      recordObservation({
        timestampMs: candidate.timestampMs ?? now(), family: candidate.family, address: candidate.address,
        channel: 'webrtc-stress', transportClass: 'webrtc-stress',
        source: candidate.serverLabel ?? candidate.serverId ?? 'WebRTC stress',
        providerGroup: candidate.serverGroup ?? candidate.serverId ?? null,
        trigger, successful: true, port: candidate.port, protocol: candidate.protocol,
        sessionId: candidate.sessionId ?? null,
        relation: classifyObservation(candidate.address) ?? undefined
      }, runId);
    }
    emit();
  }

  async function runEcho(trigger, runId) {
    let result = null;
    try { result = await sampleEcho?.(); } catch {}
    if (!active(runId)) return;
    const address = result?.observedIp ?? null;
    const family = classifyIpAddress(address).family;
    recordObservation({
      timestampMs: now(), family, address, channel: 'echo', transportClass: 'echo', source: 'HTTP echo',
      trigger, successful: Boolean(address), relation: address ? classifyObservation(address) ?? undefined : undefined
    }, runId);
    emit();
  }

  async function runTls(trigger, runId) {
    let result = null;
    try { result = await sampleTls?.(); } catch {}
    if (!active(runId)) return;
    const address = result?.observedIp ?? null;
    const family = classifyIpAddress(address).family;
    recordObservation({
      timestampMs: now(), family, address, channel: 'tls', transportClass: 'tls', source: 'TLS reflector',
      trigger, successful: Boolean(address), relation: address ? classifyObservation(address) ?? undefined : undefined
    }, runId);
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

  function configureBurst(runId) {
    burstController?.stop?.();
    burstController = createBurst?.({
      offsetsMs: config.reconnectBurstOffsetsMs ?? [0, 250, 500, 1000, 2000, 4000],
      webRtcOffsetsMs: config.reconnectWebRtcOffsetsMs ?? [0, 500, 2000, 4000],
      now,
      setTimeoutImpl,
      clearTimeoutImpl,
      onHttp: async () => {
        if (!active(runId)) return;
        if (sampleHttpObservations) await runRawHttp('reconnect-burst', runId);
        else await runHttp('reconnect-burst', runId);
      },
      onWebRtc: async () => {
        if (!active(runId)) return;
        if (sampleWebRtcStress) await runStress('reconnect-burst', runId);
        else await runStun('reconnect-burst', runId);
      },
      onEvent: () => { if (active(runId)) emit(); }
    }) ?? null;
  }

  function handleNetworkEvent(type) {
    if (state.status !== 'running') return;
    const timestampMs = now();
    state = applyNetworkEvent(state, { timestampMs, type, visibilityState: environment.document?.visibilityState ?? null });
    emit();
    if (type === 'offline' || type === 'visibilitychange') return;
    if (timestampMs - lastBurstAt < config.aggressiveBurstCooldownMs) {
      burstController?.trigger?.(type);
      return;
    }
    lastBurstAt = timestampMs;
    burstController?.trigger?.(type);
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
    burstController?.stop?.();
    burstController = null;
    for (const id of timers) clearTimeoutImpl(id);
    timers.clear();
    for (const [target, type, handler] of listenerRecords.splice(0)) target.removeEventListener?.(type, handler);
  }

  function finish(runId, manual = false) {
    if (!active(runId)) return;
    if (burstController?.getState) state = { ...state, reconnectBurst: burstController.getState() };
    cleanup();
    if (manual) state = { ...state, stoppedEarly: state.endsAt != null && now() < state.endsAt };
    const final = finalizeLeakResult(state, config, now());
    if (guidedProfile) {
      const guided = guidedVerdict(final.exposures, final.coverage);
      state = {
        ...state, status: manual ? 'stopped' : 'complete', result: guided.result, guidedResult: guided.guidedResult,
        resultLabel: guided.label, reasons: guided.reasons, exposures: final.exposures, coverage: final.coverage
      };
    } else {
      state = { ...state, status: manual ? 'stopped' : 'complete', result: final.result, resultLabel: final.label, reasons: final.reasons, exposures: final.exposures, coverage: final.coverage };
    }
    emit();
  }

  async function start() {
    cleanup();
    runSequence += 1;
    currentRunId = runSequence;
    const runId = currentRunId;
    lastBurstAt = -Infinity;
    const profileVpnBaseline = guidedProfile ? {
      4: [...new Set([...(initialBaseline[4] ?? []), ...(guidedProfile.knownVpn?.[4] ?? [])])],
      6: [...new Set([...(initialBaseline[6] ?? []), ...(guidedProfile.knownVpn?.[6] ?? [])])]
    } : initialBaseline;
    state = {
      ...createLeakState({ baseline: profileVpnBaseline, startedAt: now(), durationMs: config.aggressiveDurationMs }),
      status: 'running', result: null, guidedResult: null, resultLabel: null, reasons: [], coverage: null,
      runId, endsAt: null, reconnectBurst: null
    };
    configureBurst(runId);
    registerListeners();
    emit();
    await Promise.allSettled([
      runHttp('baseline', runId), runStun('baseline', runId), runStress('baseline', runId), runEcho('baseline', runId), runTls('baseline', runId)
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
    if (sampleWebRtcStress) recurring(runStress, config.aggressiveStunIntervalMs, runId, startedAt);
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
