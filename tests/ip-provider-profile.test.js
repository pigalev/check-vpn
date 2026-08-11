import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { collectProviderObservations } from '../assets/provider-observations.js';
import { networkConfig } from '../assets/config.js';

const app = await readFile(new URL('../assets/app.js', import.meta.url), 'utf8');
const guided = await readFile(new URL('../assets/guided-app-runtime.js', import.meta.url), 'utf8');

function text(value) {
  return { ok: true, status: 200, text: async () => value, json: async () => ({ ip: value.trim() }) };
}

test('runtime separates broad Core from repeated stress sampling', () => {
  assert.match(app, /coreIpProviderGroups/);
  assert.match(app, /reserveIpProviderGroups/);
  assert.match(app, /stressIpProviderGroups/);
  assert.doesNotMatch(app, /networkConfig\.ipProviders/);
  assert.match(guided, /coreIpProviderGroups/);
  assert.doesNotMatch(guided, /networkConfig\.ipProviders/);
});

test('reserve providers are never part of repeated stress profile', () => {
  for (const family of [4, 6]) {
    const reserveGroups = new Set(networkConfig.reserveIpProviderGroups[family].map((item) => item.group));
    assert.ok(networkConfig.stressIpProviderGroups[family].every((item) => !reserveGroups.has(item.group)));
  }
});

test('provider observations return one row for a group even when mirror fallback is used', async () => {
  const ident = {
    id: 'ident4', group: 'ident', label: 'ident.me', family: 4, tier: 'stress',
    endpoints: [
      { id:'ident-primary', kind:'text', url:'https://ident-primary.test/' },
      { id:'ident-mirror', kind:'text', url:'https://ident-mirror.test/' }
    ]
  };
  const rows = await collectProviderObservations({
    family: 4,
    groups: [ident],
    timeoutMs: 100,
    now: () => 1234,
    fetchImpl: async (url) => {
      if (url.includes('primary')) throw new TypeError('offline');
      return text('203.0.113.10');
    }
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].providerGroup, 'ident');
  assert.equal(rows[0].address, '203.0.113.10');
  assert.equal(rows[0].attempts.length, 2);
});
