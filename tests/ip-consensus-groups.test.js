import test from 'node:test';
import assert from 'node:assert/strict';
import { runIpConsensus } from '../assets/ip-consensus.js';

function text(value) {
  return { ok: true, status: 200, text: async () => value, json: async () => ({ ip: value.trim() }) };
}

function group(id, tier = 'primary', endpoints = null) {
  return {
    id,
    group: id,
    label: id,
    family: 4,
    tier,
    endpoints: endpoints ?? [{ id: `${id}-endpoint`, kind: 'text', url: `https://${id}.test/` }]
  };
}

function fixtureFetch(values, calls = []) {
  return async (url) => {
    calls.push(url);
    const host = new URL(url).hostname.split('.')[0];
    const value = values[host];
    if (value instanceof Error) throw value;
    if (value == null) throw new TypeError('offline');
    return text(value);
  };
}

test('5-0 primary is strong and reserve is not called', async () => {
  const calls = [];
  const result = await runIpConsensus({
    family: 4,
    primaryGroups: ['a','b','c','d','e'].map((id) => group(id)),
    reserveGroups: [group('reserve', 'reserve')],
    timeoutMs: 100,
    fetchImpl: fixtureFetch({ a:'203.0.113.1', b:'203.0.113.1', c:'203.0.113.1', d:'203.0.113.1', e:'203.0.113.1', reserve:'203.0.113.2' }, calls)
  });
  assert.equal(result.confidence, 'strong');
  assert.equal(result.address, '203.0.113.1');
  assert.equal(result.agreement.selectedVotes, 5);
  assert.equal(result.reserve.used, false);
  assert.ok(!calls.some((url) => url.includes('reserve.test')));
  assert.equal(result.reserve.sources[0].status, 'not-needed');
});

test('4-1 primary is strong and reserve is not called', async () => {
  const result = await runIpConsensus({
    family: 4,
    primaryGroups: ['a','b','c','d','e'].map((id) => group(id)),
    reserveGroups: [group('reserve', 'reserve')],
    timeoutMs: 100,
    fetchImpl: fixtureFetch({ a:'203.0.113.1', b:'203.0.113.1', c:'203.0.113.1', d:'203.0.113.1', e:'203.0.113.2' })
  });
  assert.equal(result.confidence, 'strong');
  assert.equal(result.agreement.selectedVotes, 4);
  assert.equal(result.agreement.winningShare, 0.8);
  assert.equal(result.reserve.used, false);
});

test('3-2 primary calls reserve and reserve can strengthen it to 4-2', async () => {
  const calls = [];
  const result = await runIpConsensus({
    family: 4,
    primaryGroups: ['a','b','c','d','e'].map((id) => group(id)),
    reserveGroups: [group('reserve', 'reserve')],
    timeoutMs: 100,
    fetchImpl: fixtureFetch({ a:'203.0.113.1', b:'203.0.113.1', c:'203.0.113.1', d:'203.0.113.2', e:'203.0.113.2', reserve:'203.0.113.1' }, calls)
  });
  assert.ok(calls.some((url) => url.includes('reserve.test')));
  assert.equal(result.confidence, 'strong');
  assert.equal(result.address, '203.0.113.1');
  assert.equal(result.agreement.selectedVotes, 4);
  assert.equal(result.agreement.available, 6);
  assert.equal(result.agreement.winningShare, 4 / 6);
});

test('2-1 with three successful groups is strong without reserve', async () => {
  const result = await runIpConsensus({
    family: 4,
    primaryGroups: ['a','b','c'].map((id) => group(id)),
    reserveGroups: [group('reserve', 'reserve')],
    timeoutMs: 100,
    fetchImpl: fixtureFetch({ a:'203.0.113.1', b:'203.0.113.1', c:'203.0.113.2', reserve:'203.0.113.2' })
  });
  assert.equal(result.confidence, 'strong');
  assert.equal(result.reserve.used, false);
});

test('two agreeing primary groups call reserve and remain partial if reserve fails', async () => {
  const result = await runIpConsensus({
    family: 4,
    primaryGroups: ['a','b','c'].map((id) => group(id)),
    reserveGroups: [group('reserve', 'reserve')],
    timeoutMs: 100,
    fetchImpl: fixtureFetch({ a:'203.0.113.1', b:'203.0.113.1' })
  });
  assert.equal(result.reserve.used, true);
  assert.equal(result.confidence, 'partial');
  assert.equal(result.address, '203.0.113.1');
  assert.equal(result.agreement.available, 2);
});

test('2-2 primary plus one agreeing reserve is still no-consensus under two-thirds rule', async () => {
  const result = await runIpConsensus({
    family: 4,
    primaryGroups: ['a','b','c','d'].map((id) => group(id)),
    reserveGroups: [group('reserve', 'reserve')],
    timeoutMs: 100,
    fetchImpl: fixtureFetch({ a:'203.0.113.1', b:'203.0.113.1', c:'203.0.113.2', d:'203.0.113.2', reserve:'203.0.113.1' })
  });
  assert.equal(result.confidence, 'no-consensus');
  assert.equal(result.status, 'partial');
  assert.equal(result.address, null);
  assert.equal(result.agreement.selectedVotes, 3);
  assert.equal(result.agreement.winningShare, 3 / 5);
});

test('2-2 plus reserve returning third value remains no-consensus with null address', async () => {
  const result = await runIpConsensus({
    family: 4,
    primaryGroups: ['a','b','c','d'].map((id) => group(id)),
    reserveGroups: [group('reserve', 'reserve')],
    timeoutMs: 100,
    fetchImpl: fixtureFetch({ a:'203.0.113.1', b:'203.0.113.1', c:'203.0.113.2', d:'203.0.113.2', reserve:'203.0.113.3' })
  });
  assert.equal(result.confidence, 'no-consensus');
  assert.equal(result.address, null);
  assert.deepEqual(new Set(result.observedAddresses), new Set(['203.0.113.1','203.0.113.2','203.0.113.3']));
});

test('one successful group plus failed reserve is partial', async () => {
  const result = await runIpConsensus({
    family: 4,
    primaryGroups: ['a','b'].map((id) => group(id)),
    reserveGroups: [group('reserve', 'reserve')],
    timeoutMs: 100,
    fetchImpl: fixtureFetch({ a:'203.0.113.1' })
  });
  assert.equal(result.confidence, 'partial');
  assert.equal(result.address, '203.0.113.1');
});

test('zero successful primary and reserve groups is unavailable', async () => {
  const result = await runIpConsensus({
    family: 4,
    primaryGroups: ['a','b'].map((id) => group(id)),
    reserveGroups: [group('reserve', 'reserve')],
    timeoutMs: 100,
    fetchImpl: fixtureFetch({})
  });
  assert.equal(result.confidence, 'unavailable');
  assert.equal(result.status, 'unavailable');
  assert.equal(result.address, null);
});

test('ident primary failure and mirror success casts exactly one group vote', async () => {
  const ident = group('ident', 'primary', [
    { id:'ident-primary', kind:'text', url:'https://ident-primary.test/' },
    { id:'ident-mirror', kind:'text', url:'https://ident-mirror.test/' }
  ]);
  const result = await runIpConsensus({
    family: 4,
    primaryGroups: [ident, group('b'), group('c')],
    reserveGroups: [],
    timeoutMs: 100,
    fetchImpl: fixtureFetch({ 'ident-primary':new TypeError('offline'), 'ident-mirror':'203.0.113.1', b:'203.0.113.1', c:'203.0.113.1' })
  });
  assert.equal(result.agreement.available, 3);
  assert.equal(result.agreement.counts['203.0.113.1'], 3);
  assert.equal(result.sources.filter((source) => source.group === 'ident').length, 1);
});
