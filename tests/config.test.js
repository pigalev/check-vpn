import test from 'node:test';
import assert from 'node:assert/strict';
import { appConfig, features, getEnabledChecks, networkConfig } from '../assets/config.js';

test('only GitHub Pages-capable checks are independently runnable', () => {
  assert.deepEqual(getEnabledChecks(features), ['ipv4', 'ipv6', 'webrtc']);
  assert.equal(features.geoip, true);
  assert.equal(features.dns, false);
  assert.equal(features.torrent, false);
  assert.equal(features.email, false);
});

test('network endpoints and timeouts are configured', () => {
  assert.match(networkConfig.ipv4Endpoint, /^https:\/\//);
  assert.match(networkConfig.ipv6Endpoint, /^https:\/\//);
  assert.match(networkConfig.geoIpUrlTemplate, /\{ip\}/);
  assert.ok(networkConfig.stunUrls.every((url) => url.startsWith('stun:')));
  assert.ok(networkConfig.requestTimeoutMs >= 3000);
  assert.ok(networkConfig.geoIpTimeoutMs >= 3000);
  assert.ok(networkConfig.webrtcTimeoutMs >= 3000);
});

test('automatic checks are enabled', () => {
  assert.equal(appConfig.autoRun, true);
});
