import test from 'node:test';
import assert from 'node:assert/strict';
import { applyObservation, calculateCoverage, createLeakState, finalizeLeakResult } from '../assets/leak-observation.js';

const config = {
  aggressiveDurationMs: 60000,
  aggressiveHttpIntervalMs: 2000,
  aggressiveGapMultiplier: 2.5,
  aggressiveMinHttpAttempts: 10,
  aggressiveMinSuccessfulHttpSamples: 6
};

function baseState() {
  return createLeakState({ baseline: { 4: ['77.110.99.186'], 6: [] }, startedAt: 0, durationMs: 60000 });
}

function observe(state, overrides = {}) {
  return applyObservation(state, {
    timestampMs: 2000,
    family: 4,
    address: '77.110.99.186',
    channel: 'http',
    source: 'HTTP consensus',
    trigger: 'scheduled',
    successful: true,
    ...overrides
  });
}

test('baseline address does not create exposure', () => {
  const next = observe(baseState());
  assert.equal(next.exposures.length, 0);
});

test('unexpected IPv4 creates one exposure and merges independent sources', () => {
  let state = observe(baseState(), { timestampMs: 4000, address: '95.25.44.18' });
  state = observe(state, { timestampMs: 6000, address: '95.25.44.18', channel: 'stun', source: 'Google STUN' });
  assert.equal(state.exposures.length, 1);
  assert.equal(state.exposures[0].address, '95.25.44.18');
  assert.deepEqual(state.exposures[0].sources.sort(), ['Google STUN', 'HTTP consensus']);
  assert.equal(state.exposures[0].observationCount, 2);
});

test('public IPv6 appearing after absent baseline is leak evidence', () => {
  const next = observe(baseState(), {
    timestampMs: 5000,
    family: 6,
    address: '2606:4700:4700::1111',
    source: 'HTTP IPv6'
  });
  assert.equal(next.exposures.length, 1);
  assert.equal(next.exposures[0].reason, 'IPv6 appeared during VPN test');
});

test('non-public and failed observations never create exposure', () => {
  let state = baseState();
  for (const [family, address] of [[4, '100.64.1.1'], [4, '192.168.1.1'], [6, 'fd00::1'], [6, 'fe80::1']]) {
    state = observe(state, { family, address, timestampMs: state.samples.length * 1000 + 1000 });
  }
  state = observe(state, { address: '95.25.44.18', successful: false });
  assert.equal(state.exposures.length, 0);
});

test('baseline restoration closes approximate exposure window', () => {
  let state = observe(baseState(), { timestampMs: 4000, address: '95.25.44.18' });
  state = observe(state, { timestampMs: 9000, address: '77.110.99.186' });
  assert.equal(state.exposures[0].baselineRestoredAtMs, 9000);
  assert.equal(state.exposures[0].approxExposureMs, 5000);
});

test('adequate clean coverage produces clean result', () => {
  let state = baseState();
  state = { ...state, schedulerAttempts: Array.from({ length: 25 }, (_, i) => ({ intendedMs: i * 2000, actualMs: i * 2000 })) };
  for (let i = 0; i < 10; i += 1) state = observe(state, { timestampMs: i * 4000 + 1000 });
  const result = finalizeLeakResult(state, config, 60000);
  assert.equal(result.label, 'No unexpected IP observed');
  assert.equal(result.result, 'clean');
});

test('large scheduler gap makes an otherwise clean result inconclusive', () => {
  let state = baseState();
  state = { ...state, schedulerAttempts: [
    { intendedMs: 0, actualMs: 0 },
    { intendedMs: 2000, actualMs: 2000 },
    { intendedMs: 4000, actualMs: 26000 },
    ...Array.from({ length: 10 }, (_, i) => ({ intendedMs: 28000 + i * 2000, actualMs: 28000 + i * 2000 }))
  ] };
  for (let i = 0; i < 8; i += 1) state = observe(state, { timestampMs: 30000 + i * 2000 });
  const result = finalizeLeakResult(state, config, 60000);
  assert.equal(result.label, 'Inconclusive');
  assert.equal(result.coverage.throttled, true);
});

test('captured leak outranks insufficient coverage', () => {
  let state = observe(baseState(), { timestampMs: 4000, address: '95.25.44.18' });
  state = { ...state, schedulerAttempts: [{ intendedMs: 0, actualMs: 0 }] };
  const result = finalizeLeakResult(state, config, 10000);
  assert.equal(result.label, 'Leak detected');
});

test('coverage exposes expected attempts, success ratio and largest gap', () => {
  let state = baseState();
  state = { ...state, schedulerAttempts: [
    { intendedMs: 0, actualMs: 0 }, { intendedMs: 2000, actualMs: 2200 }, { intendedMs: 4000, actualMs: 4500 }
  ] };
  state = observe(state, { timestampMs: 1000 });
  const coverage = calculateCoverage(state, config);
  assert.equal(coverage.expectedFastSamples, 30);
  assert.equal(coverage.attemptedFastSamples, 3);
  assert.equal(coverage.successfulHttpSamples, 1);
  assert.equal(coverage.largestGapMs, 2300);
});
