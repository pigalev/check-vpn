import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('app wires aggressive leak controller renderer and enrichment', async () => {
  const app = await readFile(new URL('../assets/app.js', import.meta.url), 'utf8');
  assert.match(app, /createAggressiveLeakTest/);
  assert.match(app, /renderAggressiveLeakTest/);
  assert.match(app, /createAggressiveLeakEnricher/);
  assert.match(app, /aggressiveFindings/);
  assert.match(app, /sampleHttp/);
  assert.match(app, /sampleStun/);
  assert.match(app, /sampleEcho/);
  assert.match(app, /sampleTls/);
});
