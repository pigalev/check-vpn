import test from 'node:test';
import assert from 'node:assert/strict';
import { appConfig } from '../assets/config.js';
import { createAggressiveLeakTest } from '../assets/aggressive-leak-test.js';

test('aggressive defaults use the approved 60 second hybrid cadence', () => {
  assert.equal(appConfig.aggressiveDurationMs, 60000);
  assert.equal(appConfig.aggressiveHttpIntervalMs, 2000);
  assert.equal(appConfig.aggressiveStunIntervalMs, 5000);
  assert.equal(appConfig.aggressiveEchoIntervalMs, 10000);
  assert.equal(appConfig.aggressiveTlsIntervalMs, 15000);
  assert.equal(appConfig.aggressiveBurstCooldownMs, 1500);
  assert.equal(appConfig.aggressiveGapMultiplier, 2.5);
});

function fakeEnvironment() {
  const listeners = new Map();
  const connectionListeners = new Map();
  return {
    listeners,
    navigator: {
      onLine: true,
      connection: {
        addEventListener(type, fn) { connectionListeners.set(type, fn); },
        removeEventListener(type) { connectionListeners.delete(type); }
      }
    },
    document: { visibilityState: 'visible' },
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
    connectionListeners
  };
}

function noopSamples() {
  return {
    sampleHttp: async () => [
      { family: 4, address: '77.110.99.186', agreement: { available: 2, total: 3, agree: true } },
      { family: 6, address: null, agreement: { available: 0, total: 3, agree: true } }
    ],
    sampleStun: async () => [],
    sampleEcho: async () => ({ status: 'complete', observedIp: '77.110.99.186' }),
    sampleTls: async () => ({ status: 'complete', observedIp: '77.110.99.186' })
  };
}

function timerHarness() {
  let nowMs = 0;
  let sequence = 0;
  const timers = new Map();

  function setTimeoutImpl(fn, delay = 0) {
    sequence += 1;
    timers.set(sequence, { fn, due: nowMs + Math.max(0, Number(delay) || 0) });
    return sequence;
  }

  function clearTimeoutImpl(id) { timers.delete(id); }

  async function advanceTo(targetMs) {
    while (true) {
      const next = [...timers.entries()]
        .filter(([, timer]) => timer.due <= targetMs)
        .sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
      if (!next) break;
      const [id, timer] = next;
      timers.delete(id);
      nowMs = timer.due;
      timer.fn();
      await Promise.resolve();
      await Promise.resolve();
    }
    nowMs = targetMs;
    await Promise.resolve();
  }

  return {
    now: () => nowMs,
    setNow(value) { nowMs = value; },
    setTimeoutImpl,
    clearTimeoutImpl,
    advanceTo,
    timers
  };
}

test('start performs immediate baseline work and registers network listeners', async () => {
  const environment = fakeEnvironment();
  const updates = [];
  const controller = createAggressiveLeakTest({
    config: appConfig,
    initialBaseline: { 4: ['77.110.99.186'], 6: [] },
    ...noopSamples(),
    environment,
    onUpdate: (state) => updates.push(state.status)
  });
  await controller.start();
  const state = controller.getState();
  assert.equal(state.status, 'running');
  assert.ok(state.samples.length >= 2);
  assert.ok(environment.listeners.has('online'));
  assert.ok(environment.listeners.has('offline'));
  assert.ok(environment.listeners.has('visibilitychange'));
  controller.stop();
  assert.equal(environment.listeners.size, 0);
  assert.equal(environment.connectionListeners.size, 0);
});

test('offline is context only and never fabricates an exposure', async () => {
  const environment = fakeEnvironment();
  const controller = createAggressiveLeakTest({ config: appConfig, initialBaseline: { 4: ['77.110.99.186'], 6: [] }, ...noopSamples(), environment });
  await controller.start();
  controller.handleNetworkEvent('offline');
  assert.equal(controller.getState().networkEvents.at(-1).type, 'offline');
  assert.equal(controller.getState().exposures.length, 0);
  controller.stop();
});

test('slow HTTP requests do not delay the next 2 second sampling launch', async () => {
  const clock = timerHarness();
  let httpCalls = 0;
  const scheduledStarts = [];
  const never = () => new Promise(() => {});
  const controller = createAggressiveLeakTest({
    config: appConfig,
    initialBaseline: { 4: ['77.110.99.186'], 6: [] },
    environment: fakeEnvironment(),
    now: clock.now,
    setTimeoutImpl: clock.setTimeoutImpl,
    clearTimeoutImpl: clock.clearTimeoutImpl,
    sampleHttp: async () => {
      httpCalls += 1;
      if (httpCalls === 1) return [{ family: 4, address: '77.110.99.186', agreement: { available: 2, total: 3, agree: true } }];
      scheduledStarts.push(clock.now());
      return never();
    },
    sampleStun: async () => [],
    sampleEcho: async () => ({ status: 'unavailable', observedIp: null }),
    sampleTls: async () => ({ status: 'unavailable', observedIp: null })
  });

  await controller.start();
  await clock.advanceTo(2000);
  await clock.advanceTo(4000);

  assert.deepEqual(scheduledStarts, [2000, 4000]);
  controller.stop();
});

test('the 60 second observation window starts after baseline work completes', async () => {
  const clock = timerHarness();
  let resolveBaseline;
  const baseline = new Promise((resolve) => { resolveBaseline = resolve; });
  const controller = createAggressiveLeakTest({
    config: appConfig,
    initialBaseline: { 4: ['77.110.99.186'], 6: [] },
    environment: fakeEnvironment(),
    now: clock.now,
    setTimeoutImpl: clock.setTimeoutImpl,
    clearTimeoutImpl: clock.clearTimeoutImpl,
    sampleHttp: () => baseline,
    sampleStun: async () => [],
    sampleEcho: async () => ({ status: 'unavailable', observedIp: null }),
    sampleTls: async () => ({ status: 'unavailable', observedIp: null })
  });

  const startPromise = controller.start();
  clock.setNow(6000);
  resolveBaseline([{ family: 4, address: '77.110.99.186', agreement: { available: 2, total: 3, agree: true } }]);
  await startPromise;

  const state = controller.getState();
  assert.equal(state.startedAt, 6000);
  assert.equal(state.endsAt, 66000);
  controller.stop();
});

test('a missing-family HTTP baseline is trusted before it is evaluated for leaks', async () => {
  const controller = createAggressiveLeakTest({
    config: appConfig,
    initialBaseline: { 4: ['77.110.99.186'], 6: [] },
    environment: fakeEnvironment(),
    sampleHttp: async () => [
      { family: 4, address: '77.110.99.186', agreement: { available: 2, total: 3, agree: true } },
      { family: 6, address: '2a00:1450:4001::1', agreement: { available: 2, total: 3, agree: true } }
    ],
    sampleStun: async () => [],
    sampleEcho: async () => ({ status: 'unavailable', observedIp: null }),
    sampleTls: async () => ({ status: 'unavailable', observedIp: null })
  });

  await controller.start();
  const state = controller.getState();
  assert.deepEqual(state.baseline[6], ['2a00:1450:4001::1']);
  assert.equal(state.exposures.length, 0);
  controller.stop();
});
