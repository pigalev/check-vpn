import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIceCandidate, summarizeWebRtcPrivacy } from '../assets/webrtc-test.js';

test('summarizes numeric local exposure without calling it a public leak', () => {
  const summary = summarizeWebRtcPrivacy([
    parseIceCandidate('candidate:1 1 udp 1 192.168.1.10 5000 typ host'),
    parseIceCandidate('candidate:2 1 udp 1 host-a.local 5001 typ host'),
    parseIceCandidate('candidate:3 1 udp 1 100.64.10.10 5002 typ host'),
    parseIceCandidate('candidate:4 1 udp 1 fd00::1 5003 typ host')
  ], new Set());
  assert.equal(summary.numericPrivateIpv4Exposed, true);
  assert.equal(summary.cgnatExposed, true);
  assert.equal(summary.privateIpv6Exposed, true);
  assert.equal(summary.mdnsProtection, true);
  assert.deepEqual(summary.publicMismatches, []);
});

test('public IPv6 absent from HTTP baseline is a mismatch', () => {
  const summary = summarizeWebRtcPrivacy([
    parseIceCandidate('candidate:1 1 udp 1 2606:4700:4700::1111 5000 typ srflx')
  ], new Set(['77.110.99.186']));
  assert.deepEqual(summary.publicMismatches, ['2606:4700:4700::1111']);
});

test('matching public candidate is not a mismatch', () => {
  const summary = summarizeWebRtcPrivacy([
    parseIceCandidate('candidate:1 1 udp 1 8.8.8.8 5000 typ srflx')
  ], new Set(['8.8.8.8']));
  assert.deepEqual(summary.publicMismatches, []);
});
