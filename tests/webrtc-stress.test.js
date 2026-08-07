import test from 'node:test';
import assert from 'node:assert/strict';
import { runWebRtcStress } from '../assets/webrtc-stress.js';

test('one dead STUN destination does not hide successful sessions', async () => {
  let tick = 1000;
  const result = await runWebRtcStress({
    destinations: [
      { id: 'a', group: 'a', label: 'A', urls: ['stun:a'] },
      { id: 'b', group: 'b', label: 'B', urls: ['stun:b'] }
    ],
    timeoutMs: 100,
    runSession: async ({ stunUrls }) => stunUrls[0] === 'stun:a'
      ? { status: 'error', candidates: [], error: 'failed' }
      : { status: 'complete', candidates: [{ address: '77.110.1.1', family: 4, port: 50000, protocol: 'udp', type: 'srflx', classification: 'public' }], error: null },
    now: () => tick++
  });
  assert.equal(result.status, 'partial');
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].serverId, 'b');
  assert.equal(result.candidates[0].serverGroup, 'b');
  assert.deepEqual(result.transports, { udp: true, tcp: false });
  assert.equal(result.destinationHealth.a.status, 'error');
  assert.equal(result.destinationHealth.b.status, 'complete');
});

test('two destinations in one operator group remain distinct destinations but one group', async () => {
  const result = await runWebRtcStress({
    destinations: [
      { id: 'google-0', group: 'google', label: 'Google', urls: ['stun:g0'] },
      { id: 'google-1', group: 'google', label: 'Google backup', urls: ['stun:g1'] }
    ],
    timeoutMs: 100,
    runSession: async () => ({ status: 'complete', candidates: [], error: null }),
    now: () => 1000
  });
  assert.equal(result.sessions.length, 2);
  assert.deepEqual(result.operatorGroups, ['google']);
});

test('TCP is reported only when an actual candidate is observed', async () => {
  const result = await runWebRtcStress({
    destinations: [{ id: 'a', group: 'a', label: 'A', urls: ['stun:a'] }],
    timeoutMs: 100,
    runSession: async () => ({ status: 'complete', candidates: [
      { address: '8.8.8.8', family: 4, port: 443, protocol: 'tcp', type: 'srflx', classification: 'public' }
    ], error: null }),
    now: () => 1000
  });
  assert.deepEqual(result.transports, { udp: false, tcp: true });
});
