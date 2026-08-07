import test from 'node:test';
import assert from 'node:assert/strict';
import { captureGuidedConnection } from '../assets/guided-leak-capture.js';

test('trusted capture uses unique HTTP winner but retains disagreement diagnostics', async () => {
  const result = await captureGuidedConnection({
    collectFamily: async (family) => family === 4 ? [
      { status: 'complete', family: 4, address: '95.25.1.2', providerId: 'a', providerGroup: 'a' },
      { status: 'complete', family: 4, address: '95.25.1.2', providerId: 'b', providerGroup: 'b' },
      { status: 'complete', family: 4, address: '8.8.8.8', providerId: 'c', providerGroup: 'c' }
    ] : [],
    sampleStun: async () => [{ server: 'stun:test', result: { status: 'complete', candidates: [] } }],
    sampleEcho: async () => ({ status: 'complete', observedIp: '95.25.1.2' }),
    sampleTls: async () => ({ status: 'complete', observedIp: '95.25.1.2' }),
    now: () => 5000
  });
  assert.deepEqual(result.trusted[4], ['95.25.1.2']);
  assert.equal(result.families[4].agree, false);
  assert.equal(result.families[4].available, 3);
  assert.equal(result.capturedAt, 5000);
  assert.equal(result.diagnostics.echo.observedIp, '95.25.1.2');
});

test('trusted capture refuses a tied HTTP family', async () => {
  const result = await captureGuidedConnection({
    collectFamily: async (family) => family === 4 ? [
      { status: 'complete', family: 4, address: '95.25.1.2', providerId: 'a', providerGroup: 'a' },
      { status: 'complete', family: 4, address: '8.8.8.8', providerId: 'b', providerGroup: 'b' }
    ] : [],
    sampleStun: async () => [], sampleEcho: async () => null, sampleTls: async () => null, now: () => 6000
  });
  assert.deepEqual(result.trusted[4], []);
  assert.equal(result.families[4].trusted, null);
  assert.equal(result.status, 'unreliable');
});

test('one successful HTTP source is accepted when it is the only complete observation', async () => {
  const result = await captureGuidedConnection({
    collectFamily: async (family) => family === 6 ? [
      { status: 'unavailable', family: 6, address: null, providerId: 'a', providerGroup: 'a' },
      { status: 'complete', family: 6, address: '2a00:1450:4001::1', providerId: 'b', providerGroup: 'b' }
    ] : [],
    sampleStun: async () => [], sampleEcho: async () => null, sampleTls: async () => null, now: () => 7000
  });
  assert.deepEqual(result.trusted[6], ['2a00:1450:4001::1']);
  assert.equal(result.status, 'complete');
});
