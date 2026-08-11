import test from 'node:test';
import assert from 'node:assert/strict';
import { runIpConsensus, runIpConsensusProgressive } from '../assets/ip-consensus.js';

function responseText(value) {
  return { ok: true, status: 200, text: async () => value, json: async () => ({ ip: value.trim() }) };
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

function group(id) {
  return {
    id,
    group: id,
    label: id,
    family: 4,
    tier: 'primary',
    endpoints: [{ id: `${id}-endpoint`, kind: 'text', url: `https://${id}.test` }]
  };
}

test('progressive IP emits first valid address before slower groups finish', async () => {
  const slow = deferred();
  const groups = [group('fast'), group('slow')];
  const seen = [];
  const promise = runIpConsensusProgressive({
    family: 4,
    primaryGroups: groups,
    timeoutMs: 1000,
    fetchImpl: async (url) => url.includes('fast.test')
      ? responseText('203.0.113.10')
      : slow.promise,
    onFirstValid: (source) => seen.push(source.address)
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(seen, ['203.0.113.10']);

  slow.resolve(responseText('203.0.113.10'));
  const final = await promise;
  assert.equal(final.address, '203.0.113.10');
  assert.equal(final.confidence, 'partial');
  assert.equal(final.agreement.available, 2);
});

test('failed and wrong-family groups never block or win first-valid', async () => {
  const groups = [group('fail'), group('wrong'), group('good')];
  const seen = [];
  const final = await runIpConsensusProgressive({
    family: 4,
    primaryGroups: groups,
    timeoutMs: 100,
    fetchImpl: async (url) => {
      if (url.includes('fail.test')) throw new TypeError('offline');
      if (url.includes('wrong.test')) return responseText('2001:db8::10');
      return responseText('203.0.113.10');
    },
    onFirstValid: (source) => seen.push(source.address)
  });

  assert.deepEqual(seen, ['203.0.113.10']);
  assert.equal(final.address, '203.0.113.10');
  assert.equal(final.confidence, 'partial');
});

test('runIpConsensus returns group-level agreement and confidence', async () => {
  const groups = [group('a'), group('b'), group('c')];
  const result = await runIpConsensus({
    family: 4,
    primaryGroups: groups,
    timeoutMs: 100,
    fetchImpl: async () => responseText('203.0.113.10')
  });

  assert.equal(result.status, 'complete');
  assert.equal(result.confidence, 'strong');
  assert.equal(result.family, 4);
  assert.equal(result.address, '203.0.113.10');
  assert.deepEqual(result.agreement.counts, { '203.0.113.10': 3 });
  assert.equal(result.agreement.available, 3);
  assert.equal(result.agreement.total, 3);
  assert.equal(result.agreement.agree, true);
  assert.equal(result.agreement.selectedVotes, 3);
  assert.equal(result.agreement.winningShare, 1);
});

test('final no-consensus never returns first provisional address as authoritative', async () => {
  const groups = [group('a'), group('b')];
  const reserve = [{ ...group('reserve'), tier: 'reserve' }];
  const seen = [];
  const result = await runIpConsensusProgressive({
    family: 4,
    primaryGroups: groups,
    reserveGroups: reserve,
    timeoutMs: 100,
    fetchImpl: async (url) => {
      if (url.includes('a.test')) return responseText('203.0.113.1');
      if (url.includes('b.test')) return responseText('203.0.113.2');
      return responseText('203.0.113.3');
    },
    onFirstValid: (source) => seen.push(source.address)
  });

  assert.deepEqual(seen, ['203.0.113.1']);
  assert.equal(result.confidence, 'no-consensus');
  assert.equal(result.status, 'partial');
  assert.equal(result.address, null);
  assert.deepEqual(new Set(result.observedAddresses), new Set(['203.0.113.1', '203.0.113.2', '203.0.113.3']));
});
