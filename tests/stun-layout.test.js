import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('STUN comparison uses a dedicated non-overlapping responsive layout', async () => {
  const [app, css] = await Promise.all([
    readFile(new URL('../assets/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../assets/styles.css', import.meta.url), 'utf8')
  ]);

  assert.match(app, /stun-result-list/);
  assert.match(app, /stun-result-row/);
  assert.match(app, /stun-server/);
  assert.match(app, /stun-address/);

  assert.match(css, /\.stun-result-row\s*\{/);
  assert.match(css, /\.stun-server[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /\.stun-address[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /@media\s*\(max-width:\s*620px\)[\s\S]*\.stun-result-row[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
});
