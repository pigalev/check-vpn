import test from 'node:test';
import assert from 'node:assert/strict';
import { runWebRtcMediaPermissionTest } from '../assets/webrtc-media-test.js';

test('all media tracks stop even when after-permission WebRTC fails', async () => {
  let stopped = 0;
  const stream = { getTracks: () => [{ stop: () => stopped++ }, { stop: () => stopped++ }] };
  const result = await runWebRtcMediaPermissionTest({
    getUserMedia: async () => stream,
    runBefore: async () => ({ status: 'complete', candidates: [] }),
    runAfter: async () => { throw new Error('ICE failed'); }
  });
  assert.equal(stopped, 2);
  assert.equal(result.status, 'error');
});

test('permission denial is isolated', async () => {
  const denied = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
  const result = await runWebRtcMediaPermissionTest({
    getUserMedia: async () => { throw denied; },
    runBefore: async () => ({ status: 'complete', candidates: [] }),
    runAfter: async () => ({ status: 'complete', candidates: [] })
  });
  assert.equal(result.status, 'denied');
  assert.deepEqual(result.newlyVisible, []);
});

test('only new candidate identities are returned after permission', async () => {
  let receivedStream = null;
  const stream = { getTracks: () => [{ stop() {} }] };
  const common = { address: '77.110.1.1', family: 4, classification: 'public', type: 'srflx', protocol: 'udp' };
  const added = { address: '192.168.1.15', family: 4, classification: 'private', type: 'host', protocol: 'udp' };
  const result = await runWebRtcMediaPermissionTest({
    getUserMedia: async (constraints) => {
      assert.deepEqual(constraints, { audio: true, video: true });
      return stream;
    },
    runBefore: async () => ({ status: 'complete', candidates: [common] }),
    runAfter: async (activeStream) => { receivedStream = activeStream; return { status: 'complete', candidates: [common, added] }; }
  });
  assert.equal(receivedStream, stream);
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.newlyVisible, [added]);
});

test('missing getUserMedia reports unavailable without running after step', async () => {
  let afterCalls = 0;
  const result = await runWebRtcMediaPermissionTest({
    getUserMedia: null,
    runBefore: async () => ({ status: 'complete', candidates: [] }),
    runAfter: async () => { afterCalls++; return { status: 'complete', candidates: [] }; }
  });
  assert.equal(result.status, 'unavailable');
  assert.equal(afterCalls, 0);
});
