import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../assets/app.js', import.meta.url), 'utf8');
const aggressiveRender = await readFile(new URL('../assets/aggressive-leak-render.js', import.meta.url), 'utf8');
const guidedRender = await readFile(new URL('../assets/guided-leak-render.js', import.meta.url), 'utf8');
const guidedRuntime = await readFile(new URL('../assets/guided-app-runtime.js', import.meta.url), 'utf8');

test('Aggressive and Kill Switch expose live summary status and result timer containers', () => {
  for (const id of [
    'aggressive-test-summary-status','aggressive-timer','aggressive-progress-bar','aggressive-result-panel',
    'monitor-test-summary-status','monitor-timer','monitor-result-panel'
  ]) assert.match(html, new RegExp(`id=["']${id}["']`));
});

test('presentation ticker is UI-only wiring and Aggressive has timer-only renderer', () => {
  assert.match(app, /createPresentationTicker/);
  assert.match(app, /syncPresentationTicker/);
  assert.match(aggressiveRender, /renderAggressiveTimer/);
});

test('Aggressive and Kill Switch explain their different purposes in the collapsed UI', () => {
  assert.match(html, /Catches brief unexpected public IP changes/i);
  assert.match(html, /Monitors public IP while you manually disconnect or reconnect the VPN/i);
});

test('Guided exposes purpose live summary countdown progress and prominent result slot', () => {
  for (const id of ['guided-test-summary-status','guided-timer','guided-progress-bar','guided-result']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /known pre-VPN public IP appears again/i);
  assert.match(html, /What this test checks:[\s\S]*60-second stress test/i);
});

test('Guided timer is presentation-only and derives from existing stress state', () => {
  assert.match(guidedRender, /buildGuidedTestView/);
  assert.match(guidedRender, /renderGuidedTimer/);
  assert.match(guidedRuntime, /stressState/);
  assert.match(guidedRuntime, /renderTimer/);
  assert.match(guidedRuntime, /hasPresentationTimer/);
});

test('collapsing Active test disclosures remains presentation-only', () => {
  assert.doesNotMatch(app, /guided-test-disclosure[^\n]*addEventListener\(['"]toggle/);
  assert.doesNotMatch(app, /aggressive-test-disclosure[^\n]*addEventListener\(['"]toggle/);
  assert.doesNotMatch(app, /monitor-test-disclosure[^\n]*addEventListener\(['"]toggle/);
});
