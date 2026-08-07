import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const app = await readFile(new URL('../assets/app.js', import.meta.url), 'utf8');
const runtime = await readFile(new URL('../assets/guided-app-runtime.js', import.meta.url), 'utf8');
const guidedWiring = `${app}\n${runtime}`;

test('app and guided runtime wire all guided diagnostics primitives', () => {
  for (const name of [
    'createGuidedLeakProfileStore',
    'captureGuidedConnection',
    'collectProviderObservations',
    'classifyLeakAddress',
    'runWebRtcStress',
    'runWebRtcMediaPermissionTest',
    'buildGuidedLeakReport',
    'renderGuidedLeak'
  ]) assert.match(guidedWiring, new RegExp(name));
  assert.match(app, /createGuidedAppRuntime/);
  assert.match(app, /guidedFindings/);
});

test('media permission test is only entered from its explicit runtime button handler', () => {
  assert.match(runtime, /mediaWebRtcButton\.addEventListener\(['"]click['"]/);
  assert.match(runtime, /navigator\.mediaDevices\?\.getUserMedia/);
  assert.doesNotMatch(app, /runWebRtcMediaPermissionTest\s*\(/);
});

test('copyable report includes guidedLeak state and guided stress stays separate from unguided aggressive findings', () => {
  assert.match(app, /currentReport\.guidedLeak/);
  assert.match(app, /aggressiveMode\s*===\s*['"]guided['"]/);
});
