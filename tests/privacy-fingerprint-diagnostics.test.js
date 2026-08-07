import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeTlsFingerprint } from '../assets/tls-fingerprint.js';
import { collectWebGlFingerprint } from '../assets/fingerprint-exposure.js';
import { assessEnvironmentConsistency } from '../assets/environment-consistency.js';
import { compareStunMappings } from '../assets/stun-mapping.js';
import { createMonitorEnricher, classifyMonitorTransition } from '../assets/monitor-enrichment.js';
import { parseIceCandidate } from '../assets/webrtc-test.js';


test('TLS reflector payload normalizes JA3 JA4 TLS and HTTP metadata', () => {
  const result = normalizeTlsFingerprint({
    ip: '203.0.113.10:44321',
    http_version: 'h2',
    tls: {
      tls_version_negotiated: '772',
      ja3: '771,4865-4866,0-11,29,0',
      ja3_hash: 'abc123',
      ja4: 't13d1516h2_foo_bar',
      alpn: ['h2', 'http/1.1'],
      ciphers: ['TLS_AES_128_GCM_SHA256'],
      extensions: [{ name: 'server_name' }, { name: 'supported_versions' }]
    },
    http2: { akamai_fingerprint: '1:65536;4:131072' }
  });
  assert.equal(result.status, 'complete');
  assert.equal(result.observedIp, '203.0.113.10');
  assert.equal(result.httpVersion, 'h2');
  assert.equal(result.ja3Hash, 'abc123');
  assert.equal(result.ja4, 't13d1516h2_foo_bar');
  assert.deepEqual(result.alpn, ['h2', 'http/1.1']);
});

test('TLS normalizer tolerates partial schema', () => {
  const result = normalizeTlsFingerprint({ tls: { ja3_hash: 'only-hash' } });
  assert.equal(result.status, 'partial');
  assert.equal(result.ja3Hash, 'only-hash');
  assert.equal(result.ja4, null);
});

test('WebGL collector treats hidden debug renderer as supported privacy limitation', () => {
  const gl = {
    MAX_TEXTURE_SIZE: 1,
    MAX_RENDERBUFFER_SIZE: 2,
    getExtension: () => null,
    getParameter: (key) => key === 1 ? 16384 : key === 2 ? 16384 : null,
    getSupportedExtensions: () => ['A', 'B']
  };
  const canvas = { getContext: (kind) => kind === 'webgl2' ? gl : null };
  const result = collectWebGlFingerprint({ document: { createElement: () => canvas } });
  assert.equal(result.status, 'complete');
  assert.equal(result.version, 'WebGL 2');
  assert.equal(result.debugRendererExposed, false);
  assert.equal(result.vendor, null);
  assert.equal(result.extensionCount, 2);
});

test('environment consistency flags strong platform contradiction but ignores weak GPU signal', () => {
  const result = assessEnvironmentConsistency({
    browser: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Linux x86_64', userAgentData: null, maxTouchPoints: 0 },
    fingerprint: { webgl: { renderer: 'Unusual Virtual GPU' } },
    privacy: { timezoneMatch: true }
  });
  assert.equal(result.status, 'review');
  assert.equal(result.findings.some((finding) => finding.id === 'platform-contradiction'), true);
  assert.equal(result.findings.some((finding) => /gpu/i.test(finding.summary)), false);
});

test('environment consistency stays consistent for matching Windows metadata', () => {
  const result = assessEnvironmentConsistency({
    browser: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32', userAgentData: { platform: 'Windows' }, maxTouchPoints: 0 },
    fingerprint: {},
    privacy: { timezoneMatch: true }
  });
  assert.equal(result.status, 'consistent');
  assert.equal(result.findings.length, 0);
});

test('ICE candidate parser preserves server-reflexive public port', () => {
  const parsed = parseIceCandidate('candidate:1 1 udp 2122260223 203.0.113.10 54321 typ srflx raddr 0.0.0.0 rport 9');
  assert.equal(parsed.address, '203.0.113.10');
  assert.equal(parsed.port, 54321);
  assert.equal(parsed.type, 'srflx');
});

test('STUN mapping identifies same IP with different public ports', () => {
  const result = compareStunMappings([
    { server: 'stun:a', candidates: [{ type: 'srflx', classification: 'public', address: '203.0.113.10', port: 50000, protocol: 'udp' }] },
    { server: 'stun:b', candidates: [{ type: 'srflx', classification: 'public', address: '203.0.113.10', port: 51000, protocol: 'udp' }] }
  ]);
  assert.equal(result.label, 'Same IP, different public ports');
  assert.equal(result.sameAddress, true);
  assert.equal(result.samePort, false);
  assert.equal(result.finding.severity, 'info');
});

test('monitor transition classifier recognizes probable ISP exposure', () => {
  assert.equal(classifyMonitorTransition({
    previous: { intelligence: { isVpn: true, isDatacenter: true, asn: 'AS1', organization: 'VPN' }, geo: { countryCode: 'DE' } },
    current: { intelligence: { isVpn: false, isDatacenter: false, isMobile: false, asn: 'AS2', organization: 'Residential ISP' }, geo: { countryCode: 'RU' } }
  }), 'Possible ISP exposure');
});

test('monitor enrichment caches metadata once per unique address and preserves failed events', async () => {
  let geoCalls = 0;
  let intelCalls = 0;
  const enricher = createMonitorEnricher({
    geoLookup: async (ip) => { geoCalls += 1; return { status: 'complete', ip, countryCode: 'DE', asn: 'AS1', org: 'Example' }; },
    intelligenceLookup: async (ip) => { intelCalls += 1; return { status: 'complete', ip, asn: 'AS1', organization: 'Example', isVpn: true, isDatacenter: true }; }
  });
  const eventA = { id: 'e1', family: 4, previousAddress: '198.51.100.1', address: '203.0.113.10' };
  const eventB = { id: 'e2', family: 4, previousAddress: '203.0.113.11', address: '203.0.113.10' };
  const [a, b] = await Promise.all([enricher.enrichEvent(eventA, {}), enricher.enrichEvent(eventB, {})]);
  assert.equal(geoCalls, 1);
  assert.equal(intelCalls, 1);
  assert.equal(a.enrichmentStatus, 'complete');
  assert.equal(b.geo.countryCode, 'DE');
});
