import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGuidedLeakReport, buildGuidedVerdict, buildPathMatrix } from '../assets/leak-report.js';

const profile = {
  knownReal: { 4: ['95.25.1.2'], 6: [] },
  knownVpn: { 4: ['77.110.1.1'], 6: [] }
};

test('known-real leak outranks poor coverage', () => {
  const verdict = buildGuidedVerdict({
    exposures: [{ address: '95.25.1.2', family: 4, relation: 'known-real', confirmationLevel: 'known-real' }],
    coverage: { sufficient: false }, profile
  });
  assert.equal(verdict.result, 'real-leak');
  assert.equal(verdict.label, 'REAL IP LEAK DETECTED');
});

test('single unknown address remains review', () => {
  const verdict = buildGuidedVerdict({
    exposures: [{ address: '8.8.8.8', family: 4, relation: 'unknown-public', confirmationLevel: 'unconfirmed-unknown' }],
    coverage: { sufficient: true }, profile
  });
  assert.equal(verdict.result, 'review');
});

test('confirmed unknown address becomes unexpected public IP', () => {
  const verdict = buildGuidedVerdict({
    exposures: [{ address: '8.8.8.8', family: 4, relation: 'unknown-public', confirmationLevel: 'confirmed-unknown' }],
    coverage: { sufficient: true }, profile
  });
  assert.equal(verdict.result, 'unexpected-leak');
  assert.equal(verdict.label, 'UNEXPECTED PUBLIC IP DETECTED');
});

test('clean verdict uses not-observed wording and coverage counts', () => {
  const verdict = buildGuidedVerdict({
    exposures: [],
    coverage: { sufficient: true, attemptedFastSamples: 29, reconnectHttpAttempts: 24, webRtcSessionsCompleted: 41, transportClassesReached: 6 },
    profile
  });
  assert.equal(verdict.result, 'clean');
  assert.equal(verdict.label, 'NO KNOWN REAL IP OBSERVED');
  assert.match(verdict.reasons[0], /29 scheduled HTTP/i);
});

test('path matrix retains individual destinations and classifies them relative to profile', () => {
  const rows = buildPathMatrix([
    { status: 'complete', family: 4, address: '77.110.1.1', providerId: 'ipify4', providerLabel: 'ipify', transportClass: 'http', timestampMs: 1000 },
    { status: 'complete', family: 4, address: '95.25.1.2', providerId: 'google-0', providerLabel: 'Google STUN', transportClass: 'stun', timestampMs: 1100 },
    { status: 'unavailable', family: 6, address: null, providerId: 'ipify6', providerLabel: 'ipify IPv6', transportClass: 'http', timestampMs: 1200 }
  ], profile);
  assert.equal(rows.length, 3);
  assert.equal(rows.find((row) => row.pathId === 'ipify4').relation, 'known-vpn');
  assert.equal(rows.find((row) => row.pathId === 'google-0').relation, 'known-real');
  assert.equal(rows.find((row) => row.pathId === 'ipify6').status, 'unavailable');
});

test('guided report stays serializable and includes media and captures', () => {
  const report = buildGuidedLeakReport({
    profile,
    captures: { real: { status: 'complete' }, vpn: { status: 'complete' } },
    aggressive: { exposures: [], coverage: { sufficient: true } },
    media: { status: 'denied' },
    observations: []
  });
  assert.doesNotThrow(() => JSON.stringify(report));
  assert.equal(report.media.status, 'denied');
  assert.equal(report.verdict.label, 'NO KNOWN REAL IP OBSERVED');
});
