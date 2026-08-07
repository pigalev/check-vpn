import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('STUN comparison uses a dedicated layout that cannot overlap hostname and address', async () => {
  const [app, css] = await Promise.all([
    readFile(new URL('../assets/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../assets/styles.css', import.meta.url), 'utf8')
  ]);

  assert.match(app, /stun-result-list/);
  assert.match(app, /stun-result-row/);
  assert.match(app, /stun-server/);
  assert.match(app, /stun-address/);
  assert.doesNotMatch(app, /rows\(stunCard,\s*\[\[item\.server/);

  assert.match(css, /\.stun-result-row\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1fr\)[^}]*gap:/s);
  assert.match(css, /\.stun-server\s*\{[^}]*min-width:\s*0[^}]*overflow-wrap:\s*anywhere[^}]*word-break:\s*break-word/s);
  assert.match(css, /\.stun-address\s*\{[^}]*min-width:\s*0[^}]*overflow-wrap:\s*anywhere[^}]*word-break:\s*break-word/s);
  assert.match(css, /@media\s*\(max-width:\s*620px\)[\s\S]*\.stun-result-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
});
