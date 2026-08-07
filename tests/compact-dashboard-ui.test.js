import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../assets/app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../assets/styles.css', import.meta.url), 'utf8');

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

test('dashboard CSS includes connection hero and compact rows', () => {
  assert.match(css, /\.connection-hero/);
  assert.match(css, /\.summary-row/);
});
