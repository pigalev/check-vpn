import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getGuidedPrimaryLabel, getGuidedResultLabel } from '../assets/guided-leak-render.js';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('page exposes the three-step guided VPN leak wizard and tab-only privacy copy', () => {
  for (const id of ['guided-section','guided-step','guided-instructions','guided-real','guided-vpn','guided-primary','guided-secondary','guided-clear','guided-result','guided-exposures','guided-paths','guided-coverage']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /Guided VPN Leak Test/);
  assert.match(html, /Saved for this tab only/);
  assert.match(html, /Clear captured IPs/);
});

test('media permission test is explicit and explains privacy before prompting', () => {
  assert.match(html, /id="media-webrtc-button"/);
  assert.match(html, /id="media-webrtc-status"/);
  assert.match(html, /id="media-webrtc-result"/);
  assert.match(html, /camera\/microphone permission/i);
  assert.match(html, /not recorded/i);
  assert.match(html, /not uploaded/i);
});

test('wizard labels follow the approved three-step flow', () => {
  assert.equal(getGuidedPrimaryLabel({ step: 'real' }), 'Capture real IP');
  assert.equal(getGuidedPrimaryLabel({ step: 'vpn' }), 'Capture VPN IP');
  assert.equal(getGuidedPrimaryLabel({ step: 'stress' }), 'Start 60s stress test');
});

test('result labels preserve explicit real leak and not-observed wording', () => {
  assert.equal(getGuidedResultLabel({ result: 'real-leak' }), 'REAL IP LEAK DETECTED');
  assert.equal(getGuidedResultLabel({ result: 'clean' }), 'NO KNOWN REAL IP OBSERVED');
  assert.equal(getGuidedResultLabel({ result: 'inconclusive' }), 'TEST INCONCLUSIVE');
});
