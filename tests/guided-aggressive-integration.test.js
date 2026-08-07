import test from 'node:test';
import assert from 'node:assert/strict';
import { appConfig } from '../assets/config.js';
import { createAggressiveLeakTest } from '../assets/aggressive-leak-test.js';

function fakeEnvironment() {
  const listeners = new Map();
  const connectionListeners = new Map();
  return {
    listeners,
    navigator: {
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

function baseOptions(overrides = {}) {
  return {
    config: appConfig,
    initialBaseline: { 4: ['77.110.1.1'], 6: [] },
    guidedProfile: { knownReal: { 4: ['95.25.1.2'], 6: [] }, knownVpn: { 4: ['77.110.1.1'], 6: [] } },
    sampleHttp: async () => [{ family: 4, address: '77.110.1.1', agreement: { available: 3, total: 3, agree: false } }],
    sampleHttpObservations: async () => [
      { status: 'complete', family: 4, address: '77.110.1.1', providerId: 'a', providerLabel: 'A', providerGroup: 'a' },
      { status: 'complete', family: 4, address: '77.110.1.1', providerId: 'b', providerLabel: 'B', providerGroup: 'b' },
      { status: 'complete', family: 4, address: '95.25.1.2', providerId: 'c', providerLabel: 'C', providerGroup: 'c' }
    ],
    sampleStun: async () => [],
    sampleWebRtcStress: async () => ({ status: 'complete', candidates: [] }),
    sampleEcho: async () => ({ status: 'unavailable', observedIp: null }),
    sampleTls: async () => ({ status: 'unavailable', observedIp: null }),
    environment: fakeEnvironment(),
    ...overrides
  };
}

test('known real from one minority HTTP provider is not hidden by consensus', async () => {
  const controller = createAggressiveLeakTest(baseOptions());
  await controller.start();
  const exposure = controller.getState().exposures.find((item) => item.address === '95.25.1.2');
  assert.equal(exposure.relation, 'known-real');
  assert.equal(exposure.confirmationLevel, 'known-real');
  assert.deepEqual(exposure.providerGroups, ['c']);
  controller.stop();
});

test('one unknown provider observation stays unconfirmed instead of becoming real leak', async () => {
  const controller = createAggressiveLeakTest(baseOptions({
    sampleHttpObservations: async () => [{ status: 'complete', family: 4, address: '8.8.8.8', providerId: 'x', providerLabel: 'X', providerGroup: 'x' }]
  }));
  await controller.start();
  const exposure = controller.getState().exposures.find((item) => item.address === '8.8.8.8');
  assert.equal(exposure.relation, 'unknown-public');
  assert.equal(exposure.confirmationLevel, 'unconfirmed-unknown');
  controller.stop();
});

test('network event triggers injected reconnect burst and stress candidate can expose known real IP', async () => {
  let burstOptions = null;
  const fakeBurst = { triggerCalls: [], stopCalls: 0, trigger(reason) { this.triggerCalls.push(reason); }, stop() { this.stopCalls++; }, getState() { return { active: false }; } };
  const controller = createAggressiveLeakTest(baseOptions({
    createBurst: (options) => { burstOptions = options; return fakeBurst; },
    sampleHttpObservations: async () => [{ status: 'complete', family: 4, address: '77.110.1.1', providerId: 'a', providerLabel: 'A', providerGroup: 'a' }],
    sampleWebRtcStress: async () => ({ status: 'complete', candidates: [{ address: '95.25.1.2', family: 4, classification: 'public', type: 'srflx', protocol: 'udp', serverId: 'google-0', serverGroup: 'google', serverLabel: 'Google', sessionId: 's1' }] })
  }));
  await controller.start();
  controller.handleNetworkEvent('online');
  assert.deepEqual(fakeBurst.triggerCalls, ['online']);
  await burstOptions.onWebRtc({ offsetMs: 500, reason: 'online', timestampMs: 500 });
  const exposure = controller.getState().exposures.find((item) => item.address === '95.25.1.2');
  assert.equal(exposure.relation, 'known-real');
  assert.ok(exposure.transportClasses.includes('webrtc-stress'));
  controller.stop();
  assert.equal(fakeBurst.stopCalls, 1);
});
