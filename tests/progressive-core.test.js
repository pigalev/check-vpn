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
  assert.match(app, /displayedAddress/);
});

test('progressive cards expose detected locating and checking states', () => {
  assert.match(app, /Detected/);
  assert.match(app, /Locating…/);
  assert.match(app, /Checking…/);
});
