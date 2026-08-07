import test from 'node:test';
import assert from 'node:assert/strict';
import { appConfig } from '../assets/config.js';
import { assessResults } from '../assets/assessment.js';
import { applyObservation, createLeakState, finalizeLeakResult } from '../assets/leak-observation.js';

function protectedCore(extra = {}) {
  return assessResults({
    ipv4: { family: 4, address: '77.110.99.186', agreement: { agree: true }, geo: {} },
    ipv6: { family: 6, address: null, agreement: { agree: true }, geo: {} },
    webrtc: { status: 'complete', publicAddresses: [] },
    privacy: { findings: [] },
    ...extra
  });
}

test('aggressive timing defaults stay at approved values', () => {
  assert.equal(appConfig.aggressiveDurationMs, 60000);
  assert.equal(appConfig.aggressiveHttpIntervalMs, 2000);
  assert.equal(appConfig.aggressiveStunIntervalMs, 5000);
  assert.equal(appConfig.aggressiveEchoIntervalMs, 10000);
  assert.equal(appConfig.aggressiveTlsIntervalMs, 15000);
  assert.equal(appConfig.aggressiveMinHttpAttempts, 10);
  assert.equal(appConfig.aggressiveMinSuccessfulHttpSamples, 6);
});

test('local WebRTC, CGNAT, metadata and coverage-only signals cannot become a leak', () => {
  for (const finding of [
    { id: 'cgnat', severity: 'info', category: 'webrtc', summary: 'CGNAT candidate exposed', details: '', sources: ['webrtc'] },
    { id: 'local', severity: 'info', category: 'webrtc', summary: 'Private address exposed', details: '', sources: ['webrtc'] },
    { id: 'asn', severity: 'review', category: 'network', summary: 'ASN differs', details: '', sources: ['geoip'] },
    { id: 'coverage', severity: 'review', category: 'aggressive', summary: 'Aggressive leak test was inconclusive', details: '', sources: ['aggressive-test'] }
  ]) {
    const result = protectedCore({ networkFindings: [finding] });
    assert.notEqual(result.status, 'leak');
  }
});

test('unexpected public IPv4 or IPv6 observation is hard leak evidence', () => {
  let state = createLeakState({ baseline: { 4: ['77.110.99.186'], 6: [] }, startedAt: 0, durationMs: 60000 });
  state = applyObservation(state, { timestampMs: 3000, family: 4, address: '8.8.8.8', channel: 'http', source: 'HTTP IPv4', trigger: 'scheduled', successful: true });
  assert.equal(finalizeLeakResult(state, appConfig, 4000).result, 'leak');

  let ipv6State = createLeakState({ baseline: { 4: ['77.110.99.186'], 6: [] }, startedAt: 0, durationMs: 60000 });
  ipv6State = applyObservation(ipv6State, { timestampMs: 3000, family: 6, address: '2606:4700:4700::1111', channel: 'stun', source: 'Google STUN', trigger: 'scheduled', successful: true });
  assert.equal(finalizeLeakResult(ipv6State, appConfig, 4000).result, 'leak');
});

test('aggressive leak finding elevates overall assessment to leak', () => {
  const result = protectedCore({
    aggressiveFindings: [{ id: 'aggressive-public-ip', severity: 'leak', category: 'aggressive', summary: 'Unexpected public IP observed', details: '8.8.8.8', sources: ['aggressive-test'] }]
  });
  assert.equal(result.status, 'leak');
});
