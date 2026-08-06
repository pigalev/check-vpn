import test from 'node:test';
import assert from 'node:assert/strict';
import { features, getEnabledChecks, networkConfig } from '../assets/config.js';
test('only GitHub Pages-capable checks are enabled', () => {
  assert.deepEqual(getEnabledChecks(features), ['ipv4', 'ipv6', 'webrtc']);
  assert.equal(features.dns, false); assert.equal(features.torrent, false); assert.equal(features.email, false);
});
test('network endpoints and timeouts are configured', () => {
  assert.match(networkConfig.ipv4Endpoint, /^https:\/\//); assert.match(networkConfig.ipv6Endpoint, /^https:\/\//);
  assert.ok(networkConfig.stunUrls.every((url) => url.startsWith('stun:'))); assert.ok(networkConfig.requestTimeoutMs >= 3000); assert.ok(networkConfig.webrtcTimeoutMs >= 3000);
});
