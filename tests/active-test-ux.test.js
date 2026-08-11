import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../assets/app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../assets/dashboard.css', import.meta.url), 'utf8');
const aggressiveRender = await readFile(new URL('../assets/aggressive-leak-render.js', import.meta.url), 'utf8');
const guidedRender = await readFile(new URL('../assets/guided-leak-render.js', import.meta.url), 'utf8');
const guidedRuntime = await readFile(new URL('../assets/guided-app-runtime.js', import.meta.url), 'utf8');
const providerRender = await readFile(new URL('../assets/provider-evidence-render.js', import.meta.url), 'utf8');

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

test('WebRTC Permission Check is a separate fourth Active test and explains Guided baseline sharing', async () => {
  for (const id of ['webrtc-test-disclosure','webrtc-test-summary-status','media-webrtc-baseline','media-webrtc-timer','media-webrtc-button','media-webrtc-result']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  const guidedStart = html.indexOf('id="guided-test-disclosure"');
  const aggressiveStart = html.indexOf('id="aggressive-test-disclosure"');
  const monitorStart = html.indexOf('id="monitor-test-disclosure"');
  const webrtcStart = html.indexOf('id="webrtc-test-disclosure"');
  assert.ok(guidedStart >= 0 && aggressiveStart > guidedStart && monitorStart > aggressiveStart && webrtcStart > monitorStart);
  assert.doesNotMatch(html.slice(guidedStart, aggressiveStart), /media-webrtc-button/);
  assert.match(html, /Baseline: Guided VPN Leak Test/);
  assert.match(html, /Standalone mode/);
  const mediaRender = await readFile(new URL('../assets/webrtc-media-render.js', import.meta.url), 'utf8');
  assert.match(mediaRender, /buildMediaWebRtcTestView/);
  assert.match(mediaRender, /renderMediaWebRtcTimer/);
});

test('WebRTC Permission Check remains explicit and not the 60-second stress test', () => {
  assert.match(html, /specialized WebRTC privacy path check/i);
  assert.match(html, /not the 60-second VPN stress test/i);
  assert.match(html, /camera\/microphone permission/i);
  assert.match(html, /not recorded/i);
  assert.match(html, /not uploaded/i);
});

test('Advanced network rows render already-collected public IP provider evidence', () => {
  assert.match(app, /renderIpProviderEvidence/);
  assert.match(app, /const familyEntries = \[currentReport\.ipv4, currentReport\.ipv6\]/);
  assert.match(app, /renderIpProviderEvidence\(row\.body, entry\)/);
  assert.match(app, /result\.sources/);
  assert.match(providerRender, /Public IP sources/);
  assert.match(providerRender, /buildIpProviderEvidence/);
  assert.match(providerRender, /result/);
  assert.doesNotMatch(providerRender, /\bfetch\s*\(/);
  assert.doesNotMatch(providerRender, /runIpConsensus/);
});

test('provider evidence has compact desktop rows and mobile stacking', () => {
  assert.match(css, /\.provider-evidence\{/);
  assert.match(css, /\.provider-source-row\{/);
  assert.match(css, /\.provider-source-address\{/);
  assert.match(css, /@media\(max-width:620px\)[\s\S]*\.provider-source-row\{grid-template-columns:1fr/);
});

test('all four active tests expose persistent collapsed statuses and result surfaces', () => {
  for (const id of [
    'guided-test-summary-status','guided-result',
    'aggressive-test-summary-status','aggressive-result-panel',
    'monitor-test-summary-status','monitor-result-panel',
    'webrtc-test-summary-status','media-webrtc-result'
  ]) assert.match(html, new RegExp(`id=["']${id}["']`));
});

test('copy report still reads Guided runtime state including media results', () => {
  assert.match(app, /currentReport\.guidedLeak\s*=\s*guidedRuntime\?\.getReport/);
  assert.match(guidedRuntime, /buildGuidedLeakReport\(\{ profile, captures, aggressive, media, observations \}\)/);
});

test('collapsing Active test disclosures remains presentation-only', () => {
  assert.doesNotMatch(app, /guided-test-disclosure[^\n]*addEventListener\(['"]toggle/);
  assert.doesNotMatch(app, /aggressive-test-disclosure[^\n]*addEventListener\(['"]toggle/);
  assert.doesNotMatch(app, /monitor-test-disclosure[^\n]*addEventListener\(['"]toggle/);
  assert.doesNotMatch(app, /webrtc-test-disclosure[^\n]*addEventListener\(['"]toggle/);
});
