import test from 'node:test';
import assert from 'node:assert/strict';
import { runIpConsensus, runIpConsensusProgressive } from '../assets/ip-consensus.js';

function responseJson(payload) {
  return { ok: true, status: 200, json: async () => payload };
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

test('progressive IP emits first valid address before slower providers finish', async () => {
  const slow = deferred();
  const providers = [
    { id: 'fast', label: 'Fast', kind: 'ipify', url: 'https://fast.test' },
    { id: 'slow', label: 'Slow', kind: 'ipify', url: 'https://slow.test' }
  ];
  const seen = [];
  const promise = runIpConsensusProgressive({
    family: 4,
    providers,
    timeoutMs: 1000,
    fetchImpl: async (url) => url.includes('fast.test')
      ? responseJson({ ip: '203.0.113.10' })
      : slow.promise,
    onFirstValid: (source) => seen.push(source.address)
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(seen, ['203.0.113.10']);

  slow.resolve(responseJson({ ip: '203.0.113.10' }));
  const final = await promise;
  assert.equal(final.address, '203.0.113.10');
  assert.equal(final.agreement.available, 2);
});

test('failed and wrong-family providers never block or win first-valid', async () => {
  const providers = [
    { id: 'fail', label: 'Fail', kind: 'ipify', url: 'https://fail.test' },
    { id: 'wrong', label: 'Wrong', kind: 'ipify', url: 'https://wrong.test' },
    { id: 'good', label: 'Good', kind: 'ipify', url: 'https://good.test' }
  ];
  const seen = [];
  const final = await runIpConsensusProgressive({
    family: 4,
    providers,
    timeoutMs: 100,
    fetchImpl: async (url) => {
      if (url.includes('fail.test')) throw new TypeError('offline');
      if (url.includes('wrong.test')) return responseJson({ ip: '2001:db8::10' });
      return responseJson({ ip: '203.0.113.10' });
    },
    onFirstValid: (source) => seen.push(source.address)
  });

  assert.deepEqual(seen, ['203.0.113.10']);
  assert.equal(final.address, '203.0.113.10');
});

test('legacy runIpConsensus keeps the same final result shape', async () => {
  const providers = [
    { id: 'a', label: 'A', kind: 'ipify', url: 'https://a.test' },
    { id: 'b', label: 'B', kind: 'ipify', url: 'https://b.test' }
  ];
  const result = await runIpConsensus({
    family: 4,
    providers,
    timeoutMs: 100,
    fetchImpl: async () => responseJson({ ip: '203.0.113.10' })
  });

  assert.equal(result.status, 'complete');
  assert.equal(result.family, 4);
  assert.equal(result.address, '203.0.113.10');
  assert.deepEqual(result.agreement, {
    available: 2,
    total: 2,
    agree: true,
    counts: { '203.0.113.10': 2 }
  });
});
