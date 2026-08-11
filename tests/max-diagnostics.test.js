import test from 'node:test';
import assert from 'node:assert/strict';
import { runIpConsensus } from '../assets/ip-consensus.js';
import { assessPrivacy } from '../assets/privacy-assessment.js';
import { assessAddressFamilies } from '../assets/network-assessment.js';
import { normalizeNetworkIntelligence } from '../assets/network-intelligence.js';
import { toReverseDnsName, runReverseDns } from '../assets/reverse-dns.js';
import { normalizeHttpInspection } from '../assets/http-inspection.js';
import { createMonitorState, reduceMonitorState, monitorFindings } from '../assets/monitor.js';
import { summarizeCandidates } from '../assets/webrtc-test.js';

function responseJson(payload) { return { ok: true, status: 200, json: async () => payload }; }
function responseText(payload) { return { ok: true, status: 200, text: async () => payload }; }

test('IP consensus survives a failure and selects a strong majority address', async () => {
  const providers = [
    { id: 'a', label: 'A', kind: 'ipify', url: 'https://a.test' },
    { id: 'b', label: 'B', kind: 'ipapi', url: 'https://b.test' },
    { id: 'c', label: 'C', kind: 'text', url: 'https://c.test' },
    { id: 'd', label: 'D', kind: 'text', url: 'https://d.test' },
    { id: 'e', label: 'E', kind: 'text', url: 'https://e.test' }
  ];
  const fetchImpl = async (url) => {
    if (url.includes('a.test')) return responseJson({ ip: '203.0.113.10' });
    if (url.includes('b.test')) return responseJson({ ip: '203.0.113.10' });
    if (url.includes('c.test')) return responseText('203.0.113.10\n');
    if (url.includes('d.test')) return responseText('198.51.100.4\n');
    throw new TypeError('offline');
  };
  const result = await runIpConsensus({ family: 4, providers, timeoutMs: 100, fetchImpl });
  assert.equal(result.confidence, 'strong');
  assert.equal(result.address, '203.0.113.10');
  assert.equal(result.agreement.available, 4);
  assert.equal(result.agreement.selectedVotes, 3);
  assert.equal(result.agreement.winningShare, 3 / 4);
  assert.equal(result.agreement.agree, false);
});

test('IP consensus uses one successful source when others fail', async () => {
  const providers = [
    { id: 'a', label: 'A', kind: 'ipify', url: 'https://a.test' },
    { id: 'b', label: 'B', kind: 'ipify', url: 'https://b.test' }
  ];
  const fetchImpl = async (url) => {
    if (url.includes('a.test')) return responseJson({ ip: '203.0.113.10' });
    throw new TypeError('offline');
  };
  const result = await runIpConsensus({ family: 4, providers, timeoutMs: 100, fetchImpl });
  assert.equal(result.status, 'complete');
  assert.equal(result.address, '203.0.113.10');
  assert.equal(result.agreement.available, 1);
});

test('privacy assessment reports timezone mismatch as review only', () => {
  const result = assessPrivacy({ browser: { timezone: 'Europe/Moscow' }, ipv4: { geo: { timezone: 'Europe/Berlin' } }, ipv6: null });
  assert.equal(result.timezoneMatch, false);
  assert.equal(result.findings[0].severity, 'review');
});

test('cross-family metadata difference is review rather than confirmed leak', () => {
  const findings = assessAddressFamilies({
    ipv4: { address: '203.0.113.10', geo: { countryCode: 'DE', asn: 'AS1', org: 'VPN A' } },
    ipv6: { address: '2001:db8::10', geo: { countryCode: 'RU', asn: 'AS2', org: 'ISP B' } },
    webrtc: { publicAddresses: ['203.0.113.10'] }
  });
  const finding = findings.find((f) => f.id === 'possible-ipv6-bypass');
  assert.equal(finding?.severity, 'review');
  assert.equal(findings.some((f) => f.severity === 'leak'), false);
});

test('network intelligence normalizes security and ASN fields', () => {
  const result = normalizeNetworkIntelligence({
    is_vpn: true, is_proxy: false, is_tor: false, is_datacenter: true,
    asn: { asn: 64500, org: 'Example ASN', route: '203.0.113.0/24', rir: 'RIPE' },
    company: { name: 'Example Co', type: 'hosting' }
  }, '203.0.113.10');
  assert.equal(result.isVpn, true);
  assert.equal(result.asn, 'AS64500');
  assert.equal(result.prefix, '203.0.113.0/24');
  assert.equal(result.networkType, 'hosting');
});

test('reverse DNS name generation supports IPv4 and compressed IPv6', () => {
  assert.equal(toReverseDnsName('203.0.113.10'), '10.113.0.203.in-addr.arpa');
  const reverse6 = toReverseDnsName('2001:db8::1');
  assert.ok(reverse6.endsWith('.ip6.arpa'));
  assert.ok(reverse6.startsWith('1.0.0.0.0.0.0.0.'));
});

test('reverse DNS preserves one resolver result when another fails', async () => {
  const resolvers = [
    { id: 'a', label: 'A', kind: 'google', url: 'https://a.test' },
    { id: 'b', label: 'B', kind: 'google', url: 'https://b.test' }
  ];
  const fetchImpl = async (url) => {
    if (url.startsWith('https://a.test')) return responseJson({ Status: 0, Answer: [{ type: 12, data: 'host.example.' }] });
    throw new TypeError('offline');
  };
  const result = await runReverseDns({ ip: '203.0.113.10', resolvers, timeoutMs: 100, fetchImpl });
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.names, ['host.example']);
  assert.equal(result.agreement.available, 1);
});

test('HTTP inspection exposes only actually returned proxy headers', () => {
  const result = normalizeHttpInspection({ origin: '203.0.113.10', headers: { 'User-Agent': 'UA', Via: 'proxy-1' } });
  assert.equal(result.observedIp, '203.0.113.10');
  assert.deepEqual(result.proxyHeaders, { via: 'proxy-1' });
});

test('WebRTC summary counts candidate types and transports', () => {
  const summary = summarizeCandidates([
    { type: 'host', family: 4, protocol: 'udp', classification: 'private', address: '192.168.1.2' },
    { type: 'srflx', family: 4, protocol: 'udp', classification: 'public', address: '203.0.113.10' },
    { type: 'relay', family: 6, protocol: 'tcp', classification: 'public', address: '2001:db8::1' }
  ]);
  assert.equal(summary.host, 1);
  assert.equal(summary.srflx, 1);
  assert.equal(summary.relay, 1);
  assert.equal(summary.udp, 2);
  assert.equal(summary.tcp, 1);
  assert.deepEqual(summary.publicAddresses, ['203.0.113.10', '2001:db8::1']);
});

test('monitor records real address changes and returns leak finding', () => {
  let state = reduceMonitorState(createMonitorState(), { type: 'start', timestamp: 't0' });
  state = reduceMonitorState(state, { type: 'sample', timestamp: 't1', sample: { ipv4: { status: 'complete', address: '203.0.113.10' }, ipv6: { status: 'unavailable', address: null } } });
  state = reduceMonitorState(state, { type: 'sample', timestamp: 't2', sample: { ipv4: { status: 'complete', address: '198.51.100.5' }, ipv6: { status: 'unavailable', address: null } } });
  state = reduceMonitorState(state, { type: 'sample', timestamp: 't3', sample: { ipv4: { status: 'complete', address: '203.0.113.10' }, ipv6: { status: 'unavailable', address: null } } });
  assert.equal(state.events.length, 2);
  assert.equal(monitorFindings(state)[0].severity, 'leak');
});

test('monitor ignores transient unavailable samples instead of inventing an IP change', () => {
  let state = reduceMonitorState(createMonitorState(), { type: 'start', timestamp: 't0' });
  state = reduceMonitorState(state, { type: 'sample', timestamp: 't1', sample: { ipv4: { status: 'complete', address: '203.0.113.10' }, ipv6: { status: 'unavailable', address: null } } });
  state = reduceMonitorState(state, { type: 'sample', timestamp: 't2', sample: { ipv4: { status: 'unavailable', address: null }, ipv6: { status: 'unavailable', address: null } } });
  assert.equal(state.current[4], '203.0.113.10');
  assert.equal(state.events.length, 0);
  assert.deepEqual(monitorFindings(state), []);
});

test('monitor tracks usable samples separately and freezes stop time', () => {
  let state = createMonitorState();
  assert.equal(state.successfulSampleCount, 0);
  assert.equal(state.stoppedAt, null);
  state = reduceMonitorState(state, { type: 'start', timestamp: '2026-08-10T12:00:00.000Z' });
  state = reduceMonitorState(state, { type: 'sample', timestamp: '2026-08-10T12:00:05.000Z', sample: { ipv4: { status: 'complete', address: '203.0.113.2' }, ipv6: { status: 'unavailable', address: null } } });
  assert.equal(state.successfulSampleCount, 1);
  state = reduceMonitorState(state, { type: 'sample', timestamp: '2026-08-10T12:00:10.000Z', sample: { ipv4: { status: 'unavailable', address: null }, ipv6: { status: 'unavailable', address: null } } });
  assert.equal(state.successfulSampleCount, 1);
  state = reduceMonitorState(state, { type: 'stop', timestamp: '2026-08-10T12:00:15.000Z' });
  assert.equal(state.stoppedAt, '2026-08-10T12:00:15.000Z');
});
