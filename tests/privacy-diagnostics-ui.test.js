import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Advanced UI exposes compact TLS fingerprint, local fingerprint, consistency and STUN disclosures', async () => {
  const app = await readFile(new URL('../assets/app.js', import.meta.url), 'utf8');
  for (const title of ['TLS fingerprint', 'Fingerprint exposure', 'Environment consistency', 'STUN mapping']) {
    assert.match(app, new RegExp(title));
  }
  assert.match(app, /advancedDisclosure/);
  assert.match(app, /External reflector could not be reached/);
  assert.match(app, /Canvas/);
  assert.match(app, /WebGL/);
  assert.match(app, /WebGPU/);
  assert.match(app, /Audio/);
  assert.match(app, /transitionLabel/);
  assert.match(app, /stun-port/);
  assert.doesNotMatch(app, /\['JA3 hash', tlsFingerprint\.ja3Hash \|\| 'Unavailable'\]/);
  assert.doesNotMatch(app, /\['JA4', tlsFingerprint\.ja4 \|\| 'Unavailable'\]/);
});
