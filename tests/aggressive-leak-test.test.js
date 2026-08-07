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
