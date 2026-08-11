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
  assert.ok(Array.isArray(networkConfig.geoIpProviders));
  assert.equal(networkConfig.geoIpProviders.length, 4);
  assert.deepEqual(networkConfig.geoIpProviders.map((provider) => provider.id), ['ipapi', 'ipwhois', 'freeipapi', 'ipapiis']);
  assert.ok(networkConfig.stunUrls.every((url) => url.startsWith('stun:')));
  assert.ok(networkConfig.requestTimeoutMs >= 3000);
  assert.ok(networkConfig.geoIpTimeoutMs >= 3000);
  assert.ok(networkConfig.webrtcTimeoutMs >= 3000);
});

test('core, reserve and stress IP provider profiles are independent', () => {
  for (const family of [4, 6]) {
    assert.equal(networkConfig.coreIpProviderGroups[family].length, 5);
    assert.deepEqual(networkConfig.coreIpProviderGroups[family].map((group) => group.group), ['ipify', 'ident', 'seeip', 'icanhazip', 'ipsb']);
    assert.deepEqual(networkConfig.reserveIpProviderGroups[family].map((group) => group.group), ['ippubblico']);
    assert.ok(networkConfig.stressIpProviderGroups[family].length <= networkConfig.coreIpProviderGroups[family].length);
    assert.ok(!networkConfig.stressIpProviderGroups[family].some((group) => ['ippubblico', 'myip', 'ipsb'].includes(group.group)));
    assert.ok(!networkConfig.coreIpProviderGroups[family].some((group) => ['ipwhois', 'myip'].includes(group.group)));
  }
});

test('IPPubblico remains configured as a disabled reserve after failed browser CORS smoke', () => {
  for (const family of [4, 6]) {
    const reserve = networkConfig.reserveIpProviderGroups[family][0];
    assert.equal(reserve.group, 'ippubblico');
    assert.equal(reserve.enabled, false);
    assert.match(reserve.disabledReason, /CORS/i);
  }
});

test('ident redundancy lives inside one voting group', () => {
  for (const family of [4, 6]) {
    const ident = networkConfig.coreIpProviderGroups[family].find((group) => group.group === 'ident');
    assert.ok(ident);
    assert.equal(ident.endpoints.length, 2);
    assert.match(ident.endpoints[0].url, /ident\.me/);
    assert.match(ident.endpoints[1].url, /tnedi\.me/);
  }
});

test('IP.SB uses dedicated family endpoints', () => {
  const v4 = networkConfig.coreIpProviderGroups[4].find((group) => group.group === 'ipsb');
  const v6 = networkConfig.coreIpProviderGroups[6].find((group) => group.group === 'ipsb');
  assert.equal(v4.endpoints[0].url, 'https://api-ipv4.ip.sb/ip');
  assert.equal(v6.endpoints[0].url, 'https://api-ipv6.ip.sb/ip');
});

test('stress STUN destinations retain operator grouping', () => {
  assert.equal(networkConfig.stunDestinations.length, 4);
  assert.deepEqual(networkConfig.stunDestinations.map((item) => item.id), ['cloudflare', 'google-0', 'google-1', 'twilio']);
  assert.deepEqual([...new Set(networkConfig.stunDestinations.map((item) => item.group))], ['cloudflare', 'google', 'twilio']);
});

test('reconnect burst keeps approved sub-two-second offsets', () => {
  assert.deepEqual([...appConfig.reconnectBurstOffsetsMs], [0, 250, 500, 1000, 2000, 4000]);
  assert.deepEqual([...appConfig.reconnectWebRtcOffsetsMs], [0, 500, 2000, 4000]);
});

test('automatic checks are enabled', () => {
  assert.equal(appConfig.autoRun, true);
});
