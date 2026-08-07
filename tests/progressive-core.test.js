import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../assets/app.js', import.meta.url), 'utf8');

test('core imports progressive IP and GeoIP runners', () => {
  assert.match(app, /runIpConsensusProgressive/);
  assert.match(app, /runGeoIpConsensusProgressive/);
});

test('core no longer waits for one Promise.all of IP4 IP6 and WebRTC before rendering', () => {
  assert.doesNotMatch(app, /const \[r4, r6, webrtc\] = await Promise\.all\(\[/);
});

test('early callbacks are guarded by current run id and address', () => {
  assert.match(app, /expectedRunId/);
  assert.match(app, /currentRunId\s*!==\s*expectedRunId/);
  assert.match(app, /displayedAddress\[family\]\s*!==\s*address/);
});

test('progressive dashboard renders first IP and first location through shared live family state', () => {
  assert.match(app, /const liveIp = \{/);
  assert.match(app, /function handleFirstIp\(family, source\)/);
  assert.match(app, /liveIp\[family\] = \{ family, address: source\.address/);
  assert.match(app, /renderLiveConnection\(\)/);
  assert.match(app, /geoPending:\s*true/);
  assert.match(app, /Locating…/);
  assert.match(app, /Checking…/);
});

test('late first GeoIP result preserves completed IP state instead of reverting to provisional', () => {
  assert.match(app, /finalIpByFamily/);
  assert.match(app, /const finalIp = finalIpByFamily\[family\]/);
  assert.match(app, /ipFinal:\s*Boolean\(finalIp\)/);
});

test('final report is built from completed family consensus rather than provisional values', () => {
  assert.match(app, /const \[ipv4, ipv6, webrtc\] = await Promise\.all/);
  assert.match(app, /currentReport = \{ startedAt:[\s\S]*ipv4, ipv6, webrtc/);
  assert.match(app, /runId:\s*expectedRunId/);
});
