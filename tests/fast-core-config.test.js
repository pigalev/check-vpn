import test from 'node:test';
import assert from 'node:assert/strict';
import { networkConfig } from '../assets/config.js';

test('Core uses speed-oriented deadline and ident hedge', () => {
  assert.equal(networkConfig.coreIpTimeoutMs, 3200);
  assert.equal(networkConfig.ipProviderHedgeDelayMs, 900);
  for (const family of [4,6]) {
    const ident = networkConfig.coreIpProviderGroups[family].find((group) => group.group === 'ident');
    assert.equal(ident.hedgeDelayMs, 900);
    assert.equal(ident.endpoints.length, 2);
  }
});

test('stress profile is not widened by Core speed work', () => {
  for (const family of [4,6]) {
    assert.ok(networkConfig.stressIpProviderGroups[family].every((group) => ['ipify','ident','seeip'].includes(group.group)));
  }
});

test('IPPubblico remains a reserve-tier group, not a stress source', () => {
  for (const family of [4,6]) {
    assert.equal(networkConfig.reserveIpProviderGroups[family].find((group) => group.group === 'ippubblico')?.tier, 'reserve');
    assert.ok(!networkConfig.stressIpProviderGroups[family].some((group) => group.group === 'ippubblico'));
  }
});
