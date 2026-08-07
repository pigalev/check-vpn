import test from 'node:test';
import assert from 'node:assert/strict';
import { collectProviderObservations } from '../assets/provider-observations.js';

test('minority provider address is preserved instead of hidden by consensus', async () => {
  const observations = await collectProviderObservations({
    family: 4,
    providers: [
      { id: 'a', label: 'A', group: 'a', kind: 'text', url: 'https://a.test' },
      { id: 'b', label: 'B', group: 'b', kind: 'text', url: 'https://b.test' },
      { id: 'c', label: 'C', group: 'c', kind: 'text', url: 'https://c.test' }
    ],
    timeoutMs: 100,
    fetchImpl: async (url) => ({ ok: true, text: async () => url.includes('c.test') ? '95.25.1.2' : '77.110.1.1' }),
    now: () => 1234,
    trigger: 'scheduled'
  });
  assert.deepEqual(observations.filter((x) => x.status === 'complete').map((x) => x.address), ['77.110.1.1', '77.110.1.1', '95.25.1.2']);
  assert.equal(observations[2].providerGroup, 'c');
  assert.equal(observations[2].timestampMs, 1234);
  assert.equal(observations[2].trigger, 'scheduled');
});

test('provider failures are retained as unavailable observations', async () => {
  const observations = await collectProviderObservations({
    family: 4,
    providers: [{ id: 'a', label: 'A', group: 'a', kind: 'text', url: 'https://a.test' }],
    timeoutMs: 100,
    fetchImpl: async () => { throw new Error('offline'); },
    now: () => 2000
  });
  assert.equal(observations[0].status, 'unavailable');
  assert.equal(observations[0].address, null);
  assert.match(observations[0].error, /offline|failed|request/i);
});
