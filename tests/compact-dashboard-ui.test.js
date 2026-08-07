import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../assets/app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../assets/dashboard.css', import.meta.url), 'utf8');

test('primary dashboard uses one connection panel instead of separate IPv4 IPv6 cards', () => {
  for (const id of ['dashboard','connection-panel','connection-body','leak-panel','leak-body','privacy-panel','privacy-body']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.doesNotMatch(app, /createCard\(['"]ipv4['"]/);
  assert.doesNotMatch(app, /createCard\(['"]ipv6['"]/);
});

test('dashboard imports pure view-model helpers', () => {
  assert.match(app, /buildConnectionView/);
  assert.match(app, /buildLeakView/);
  assert.match(app, /buildPrivacyView/);
});

test('dashboard CSS includes connection hero compact rows and mobile single column', () => {
  assert.match(css, /\.connection-hero/);
  assert.match(css, /\.summary-row/);
  assert.match(css, /@media\(max-width:620px\)/);
  assert.match(css, /\.dashboard-secondary\{grid-template-columns:1fr/);
  assert.match(css, /overflow-wrap:anywhere/);
});

test('advanced diagnostics use compact disclosure rows', () => {
  assert.doesNotMatch(app, /function advancedCard\(/);
  assert.match(app, /function advancedDisclosure\(/);
  assert.match(css, /\.advanced-row/);
});

test('interactive workflows are grouped under idle-collapsed Active tests disclosures', () => {
  for (const id of ['active-tests','guided-test-disclosure','monitor-test-disclosure','aggressive-test-disclosure']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  for (const id of ['guided-primary','guided-clear','monitor-toggle','monitor-status','aggressive-toggle','aggressive-progress']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(css, /\.active-test-row/);
});

test('collapsing Active test disclosures has no diagnostic lifecycle wiring', () => {
  assert.doesNotMatch(app, /guided-test-disclosure[^\n]*addEventListener\(['"]toggle/);
  assert.doesNotMatch(app, /monitor-test-disclosure[^\n]*addEventListener\(['"]toggle/);
  assert.doesNotMatch(app, /aggressive-test-disclosure[^\n]*addEventListener\(['"]toggle/);
});
