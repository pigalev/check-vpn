import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../assets/app.js', import.meta.url), 'utf8');

test('app wires all guided diagnostics primitives', () => {
  for (const name of [
    'createGuidedLeakProfileStore',
    'captureGuidedConnection',
    'collectProviderObservations',
    'classifyLeakAddress',
    'runWebRtcStress',
    'runWebRtcMediaPermissionTest',
    'buildGuidedLeakReport',
    'renderGuidedLeak'
  ]) assert.match(app, new RegExp(name));
});

test('media permission test is only entered from its explicit button handler', () => {
  assert.match(app, /mediaWebRtcButton\.addEventListener\(['"]click['"]/);
  assert.match(app, /navigator\.mediaDevices\?\.getUserMedia/);
});

test('copyable report includes guidedLeak state', () => {
  assert.match(app, /currentReport\.guidedLeak/);
});
