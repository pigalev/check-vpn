import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../assets/app.js', import.meta.url), 'utf8');
const providerEvidence = await readFile(new URL('../assets/provider-evidence.js', import.meta.url), 'utf8');

test('connection hero prefers quantitative short diagnostic summary when available', () => {
  assert.match(app, /notice\?\.shortSummary\s*\?\?\s*notice\?\.summary/);
});

test('production UI contains no reserve-used wording', () => {
  assert.doesNotMatch(app, /reserve used/i);
  assert.doesNotMatch(providerEvidence, /reserve used/i);
});

test('PTR resolver copy is driven by explicit record state', () => {
  assert.match(app, /function\s+ptrResolverSummary\s*\(/);
  assert.match(app, /PTR record not found/);
  assert.doesNotMatch(app, /agreement\?\.agree\s*\?\s*['"] · agree['"]\s*:\s*['"] · differ['"]/);
});
