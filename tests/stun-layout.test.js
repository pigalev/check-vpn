import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('long diagnostic labels cannot overflow into their values', async () => {
  const css = await readFile(new URL('../assets/styles.css', import.meta.url), 'utf8');

  assert.match(css, /\.detail-label\s*\{[^}]*min-width:\s*0[^}]*overflow-wrap:\s*anywhere[^}]*word-break:\s*break-word[^}]*\}/s);
  assert.match(css, /\.detail-value\s*\{[^}]*min-width:\s*0[^}]*overflow-wrap:\s*anywhere[^}]*word-break:\s*break-word[^}]*\}/s);
  assert.match(css, /@media\s*\(max-width:\s*620px\)[\s\S]*\.detail-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
});
