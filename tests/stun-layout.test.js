import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('STUN comparison uses a dedicated layout that cannot overlap server address or port', async () => {
  const [app, css] = await Promise.all([
    readFile(new URL('../assets/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../assets/styles.css', import.meta.url), 'utf8')
  ]);

  assert.match(app, /stun-result-list/);
  assert.match(app, /stun-result-row/);
  assert.match(app, /stun-server/);
  assert.match(app, /stun-address/);
  assert.match(app, /stun-port/);
  assert.doesNotMatch(app, /rows\(stunCard,\s*\[\[item\.server/);

  assert.match(css, /\.stun-result-row\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(0,\s*1\.25fr\)\s+minmax\(0,\s*1fr\)\s+minmax\(90px,\s*\.7fr\)[^}]*gap:/s);
  assert.match(css, /\.stun-server\s*\{[^}]*min-width:\s*0[^}]*overflow-wrap:\s*anywhere[^}]*word-break:\s*break-word/s);
  assert.match(css, /\.stun-address,\.stun-port\s*\{[^}]*min-width:\s*0[^}]*overflow-wrap:\s*anywhere[^}]*word-break:\s*break-word/s);
  assert.match(css, /@media\s*\(max-width:\s*620px\)[\s\S]*\.stun-result-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
});
