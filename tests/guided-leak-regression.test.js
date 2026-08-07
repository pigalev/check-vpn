import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyLeakAddress } from '../assets/leak-classifier.js';
import { applyObservation, createLeakState } from '../assets/leak-observation.js';
import { buildGuidedVerdict } from '../assets/leak-report.js';
import { runWebRtcMediaPermissionTest } from '../assets/webrtc-media-test.js';
import { runWebRtcStress } from '../assets/webrtc-stress.js';

const profile = {
  knownReal: { 4: ['8.8.8.8'], 6: ['2606:4700:4700::1111'] },
  knownVpn: { 4: ['1.1.1.1'], 6: ['2001:4860:4860::8888'] }
};

function observed(state, address, { timestampMs = 1000, channel = 'http-provider', transportClass = 'http', source = 'provider', port = null } = {}) {
  const classification = classifyLeakAddress(address, profile);
  return applyObservation(state, {
    timestampMs,
    family: classification.family,
    address,
    channel,
    transportClass,
    source,
    successful: true,
    relation: classification.relation,
    port
  });
}

function verdict(state, sufficient = true) {
  return buildGuidedVerdict({ exposures: state.exposures, coverage: { sufficient }, profile });
}

test('known real IPv4 once via HTTP is a real leak', () => {
  const state = observed(createLeakState({ baseline: profile.knownVpn }), '8.8.8.8');
  assert.equal(state.exposures[0].confirmationLevel, 'known-real');
  assert.equal(verdict(state).result, 'real-leak');
});

test('known real IPv6 via WebRTC stress is a real leak', () => {
  const state = observed(createLeakState({ baseline: profile.knownVpn }), '2606:4700:4700::1111', {
    channel: 'webrtc-stress', transportClass: 'webrtc-stress', source: 'Cloudflare'
  });
  assert.equal(verdict(state).result, 'real-leak');
});

test('two VPN provider votes do not hide one known-real provider vote', () => {
  let state = createLeakState({ baseline: profile.knownVpn });
  state = observed(state, '1.1.1.1', { source: 'vpn-a' });
  state = observed(state, '1.1.1.1', { source: 'vpn-b', timestampMs: 1001 });
  state = observed(state, '8.8.8.8', { source: 'minority-real', timestampMs: 1002 });
  assert.equal(state.exposures.length, 1);
  assert.equal(state.exposures[0].address, '8.8.8.8');
  assert.equal(verdict(state).result, 'real-leak');
});

test('one unknown public observation stays review', () => {
  const state = observed(createLeakState({ baseline: profile.knownVpn }), '9.9.9.9');
  assert.equal(state.exposures[0].confirmationLevel, 'unconfirmed-unknown');
  assert.equal(verdict(state).result, 'review');
});

test('repeated unknown on a second transport becomes confirmed unexpected public IP', () => {
  let state = observed(createLeakState({ baseline: profile.knownVpn }), '9.9.9.9', { transportClass: 'http', channel: 'http-provider' });
  state = observed(state, '9.9.9.9', { timestampMs: 1250, transportClass: 'stun', channel: 'stun', source: 'STUN' });
  assert.equal(state.exposures[0].confirmationLevel, 'confirmed-unknown');
  assert.equal(verdict(state).result, 'unexpected-leak');
});

test('private CGNAT ULA and mDNS values never create public leak exposure', () => {
  let state = createLeakState({ baseline: profile.knownVpn });
  for (const address of ['192.168.1.10', '100.64.1.2', 'fd00::1234', 'host-123.local']) {
    const classification = classifyLeakAddress(address, profile);
    state = applyObservation(state, { timestampMs: 1000, family: classification.family, address, channel: 'webrtc', transportClass: 'webrtc', source: 'WebRTC', successful: true, relation: classification.relation });
  }
  assert.equal(state.exposures.length, 0);
});

test('media private-only difference is not a public leak', async () => {
  const media = await runWebRtcMediaPermissionTest({
    getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }),
    runBefore: async () => ({ candidates: [] }),
    runAfter: async () => ({ candidates: [{ address: '192.168.1.20', family: 4, classification: 'private', type: 'host', protocol: 'udp' }] })
  });
  assert.equal(media.newlyVisible.length, 1);
  assert.equal(classifyLeakAddress(media.newlyVisible[0].address, profile).relation, 'non-public');
});

test('media known-real public difference is real leak evidence', async () => {
  const media = await runWebRtcMediaPermissionTest({
    getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }),
    runBefore: async () => ({ candidates: [] }),
    runAfter: async () => ({ candidates: [{ address: '8.8.8.8', family: 4, classification: 'public', type: 'srflx', protocol: 'udp' }] })
  });
  let state = createLeakState({ baseline: profile.knownVpn });
  const candidate = media.newlyVisible[0];
  const relation = classifyLeakAddress(candidate.address, profile).relation;
  state = applyObservation(state, { timestampMs: 1000, family: candidate.family, address: candidate.address, channel: 'webrtc-media', transportClass: 'webrtc-media', source: 'Media WebRTC', successful: true, relation });
  assert.equal(verdict(state).result, 'real-leak');
});

test('known-real leak outranks poor coverage', () => {
  const state = observed(createLeakState({ baseline: profile.knownVpn }), '8.8.8.8');
  assert.equal(verdict(state, false).result, 'real-leak');
});

test('STUN port-only changes on known VPN address do not change severity', () => {
  let state = createLeakState({ baseline: profile.knownVpn });
  state = observed(state, '1.1.1.1', { channel: 'stun', transportClass: 'stun', port: 41000 });
  state = observed(state, '1.1.1.1', { timestampMs: 1100, channel: 'stun', transportClass: 'stun', port: 42000 });
  assert.equal(state.exposures.length, 0);
});

test('single public sample keeps exposure duration unknown', () => {
  const state = observed(createLeakState({ baseline: profile.knownVpn }), '9.9.9.9');
  assert.equal(state.exposures[0].approxExposureMs, null);
});

test('TCP is reported only when a TCP candidate was actually observed', async () => {
  const destination = { id: 'test', group: 'test', label: 'Test', urls: ['stun:test.invalid:3478'] };
  const udp = await runWebRtcStress({
    destinations: [destination], timeoutMs: 10,
    runSession: async () => ({ status: 'complete', candidates: [{ address: '1.1.1.1', family: 4, classification: 'public', type: 'srflx', protocol: 'udp' }] })
  });
  assert.equal(udp.transports.tcp, false);
  const tcp = await runWebRtcStress({
    destinations: [destination], timeoutMs: 10,
    runSession: async () => ({ status: 'complete', candidates: [{ address: '1.1.1.1', family: 4, classification: 'public', type: 'srflx', protocol: 'tcp' }] })
  });
  assert.equal(tcp.transports.tcp, true);
});
