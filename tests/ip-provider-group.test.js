import test from 'node:test';
import assert from 'node:assert/strict';
import { runIpProviderGroup } from '../assets/ip-provider-group.js';

function text(value) {
  return { ok: true, status: 200, text: async () => value, json: async () => ({ ip: value.trim() }) };
}

const ident = {
  id: 'ident4',
  group: 'ident',
  label: 'ident.me',
  family: 4,
  tier: 'primary',
  endpoints: [
    { id: 'ident-primary-4', kind: 'text', url: 'https://4.ident.me/' },
    { id: 'ident-mirror-4', kind: 'text', url: 'https://4.tnedi.me/' }
  ]
};

function hedgedIdent(delay = 10) { return { ...ident, hedgeDelayMs: delay }; }

function hangUntilAbort(options = {}, aborted = []) {
  return new Promise((_resolve, reject) => {
    const onAbort = () => {
      aborted.push(true);
      reject(options.signal?.reason instanceof Error ? options.signal.reason : new DOMException('Aborted', 'AbortError'));
    };
    if (options.signal?.aborted) onAbort();
    else options.signal?.addEventListener('abort', onAbort, { once:true });
  });
}

test('provider group falls back to mirror and returns one vote', async () => {
  const result = await runIpProviderGroup({
    group: ident,
    family: 4,
    timeoutMs: 1000,
    fetchImpl: async (url) => {
      if (url.includes('4.ident.me')) throw new TypeError('offline');
      return text('203.0.113.7\n');
    }
  });
  assert.equal(result.status, 'complete');
  assert.equal(result.address, '203.0.113.7');
  assert.equal(result.endpointId, 'ident-mirror-4');
  assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts[0].status, 'unavailable');
  assert.equal(result.attempts[1].status, 'complete');
});

test('wrong-family endpoint falls through and never votes', async () => {
  const result = await runIpProviderGroup({
    group: ident,
    family: 4,
    timeoutMs: 1000,
    fetchImpl: async (url) => url.includes('4.ident.me')
      ? text('2001:db8::5')
      : text('203.0.113.8')
  });
  assert.equal(result.address, '203.0.113.8');
  assert.match(result.attempts[0].error, /family/i);
});

test('successful preferred endpoint prevents mirror request', async () => {
  const urls = [];
  const result = await runIpProviderGroup({
    group: hedgedIdent(20),
    family: 4,
    timeoutMs: 1000,
    fetchImpl: async (url) => {
      urls.push(url);
      return text('203.0.113.9');
    }
  });
  assert.equal(result.address, '203.0.113.9');
  assert.equal(urls.length, 1);
  assert.equal(result.attempts.length, 1);
});

test('stalled preferred endpoint starts mirror after hedge and mirror can win', async () => {
  const urls = [];
  const primaryAborted = [];
  const started = Date.now();
  const result = await runIpProviderGroup({
    group: hedgedIdent(10),
    family: 4,
    timeoutMs: 200,
    fetchImpl: async (url, options = {}) => {
      urls.push(url);
      if (url.includes('4.ident.me')) return hangUntilAbort(options, primaryAborted);
      return text('203.0.113.10');
    }
  });
  assert.equal(result.status, 'complete');
  assert.equal(result.address, '203.0.113.10');
  assert.equal(result.endpointId, 'ident-mirror-4');
  assert.ok(urls.some((url) => url.includes('4.tnedi.me')));
  assert.ok(Date.now() - started >= 8);
  assert.equal(primaryAborted.length, 1);
  assert.equal(result.attempts.filter((attempt) => attempt.status === 'complete').length, 1);
});

test('preferred failure starts mirror immediately instead of waiting full hedge', async () => {
  const started = Date.now();
  const result = await runIpProviderGroup({
    group: hedgedIdent(100),
    family: 4,
    timeoutMs: 500,
    fetchImpl: async (url) => {
      if (url.includes('4.ident.me')) throw new TypeError('offline');
      return text('203.0.113.11');
    }
  });
  assert.equal(result.address, '203.0.113.11');
  assert.ok(Date.now() - started < 80);
});

test('all failed endpoints produce one unavailable group result', async () => {
  const result = await runIpProviderGroup({
    group: hedgedIdent(10),
    family: 4,
    timeoutMs: 1000,
    fetchImpl: async () => { throw new TypeError('offline'); }
  });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.address, null);
  assert.equal(result.attempts.length, 2);
});

test('hedged endpoints share one total timeout budget', async () => {
  const started = Date.now();
  const result = await runIpProviderGroup({
    group: hedgedIdent(10),
    family: 4,
    timeoutMs: 40,
    fetchImpl: async (_url, options = {}) => hangUntilAbort(options)
  });
  const elapsed = Date.now() - started;
  assert.equal(result.status, 'unavailable');
  assert.ok(elapsed < 100, `group exceeded shared deadline: ${elapsed} ms`);
  assert.equal(result.attempts.length, 2);
});

test('fallback endpoints share one total timeout budget on serial groups', async () => {
  let nowMs = 0;
  const seenSignals = [];
  const result = await runIpProviderGroup({
    group: ident,
    family: 4,
    timeoutMs: 100,
    now: () => nowMs,
    fetchImpl: async (_url, options = {}) => {
      seenSignals.push(Boolean(options.signal));
      nowMs += 70;
      throw new TypeError('offline');
    }
  });
  assert.equal(result.status, 'unavailable');
  assert.ok(result.latencyMs <= 140);
  assert.ok(result.attempts.length <= 2);
  assert.ok(seenSignals.every(Boolean));
});
