import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('page exposes the explicit 60 second aggressive leak test controls', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  for (const token of ['Aggressive Leak Test', 'Start 60s test', 'aggressive-section', 'aggressive-toggle', 'aggressive-status', 'aggressive-progress', 'aggressive-summary', 'aggressive-timeline', 'aggressive-exposures']) {
    assert.match(html, new RegExp(token));
  }
  assert.match(html, /frequent|repeatedly/i);
  assert.match(html, /60 seconds/i);
});

test('aggressive exposure layout is isolated and wraps long IP/source content', async () => {
  const css = await readFile(new URL('../assets/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.aggressive-exposure\s*\{[^}]*min-width:\s*0/s);
  assert.match(css, /\.aggressive-address\s*\{[^}]*min-width:\s*0[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /\.aggressive-sources\s*\{[^}]*min-width:\s*0[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /\.aggressive-timing\s*\{[^}]*min-width:\s*0[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /@media\s*\(max-width:\s*620px\)[\s\S]*\.aggressive-exposure/s);
});
