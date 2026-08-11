import test from 'node:test';
import assert from 'node:assert/strict';
import { runIpConsensus, runIpConsensusProgressive } from '../assets/ip-consensus.js';

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

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function hangingFetch(values, calls = [], aborted = []) {
  return async (url, options = {}) => {
    calls.push(url);
    const host = new URL(url).hostname.split('.')[0];
    const value = values[host];
    if (value === 'hang') {
      return new Promise((_resolve, reject) => {
        const onAbort = () => {
          aborted.push(host);
          reject(options.signal?.reason instanceof Error ? options.signal.reason : new DOMException('Aborted', 'AbortError'));
        };
        if (options.signal?.aborted) onAbort();
        else options.signal?.addEventListener('abort', onAbort, { once:true });
      });
    }
    if (value instanceof Error) throw value;
    if (value == null) throw new TypeError('offline');
    return text(value);
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

test('matching groups may finish Strong before every configured source settles', async () => {
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
  assert.ok(result.agreement.selectedVotes >= 4);
  assert.ok(result.sources.some((source) => source.status === 'not-needed'));
  assert.ok(calls.length >= 4);
});

test('4 matching responses can lock Strong before a later conflicting source settles', async () => {
  const result = await runIpConsensus({
    family: 4,
    primaryGroups: ['a','b','c','d','e'].map((id) => group(id)),
    reserveGroups: [group('reserve', 'reserve')],
    timeoutMs: 100,
    fetchImpl: fixtureFetch({ a:'203.0.113.1', b:'203.0.113.1', c:'203.0.113.1', d:'203.0.113.1', e:'203.0.113.2', reserve:'203.0.113.2' })
  });
  assert.equal(result.confidence, 'strong');
  assert.equal(result.address, '203.0.113.1');
  assert.ok(result.agreement.selectedVotes >= 4);
  assert.ok(result.agreement.winningShare >= (2 / 3));
});

test('3-2 primary plus reserve can strengthen it to 4-2', async () => {
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

test('2-1 with exactly three successful groups is Strong under two-thirds rule', async () => {
  const result = await runIpConsensus({
    family: 4,
    primaryGroups: ['a','b','c'].map((id) => group(id)),
    reserveGroups: [],
    timeoutMs: 100,
    fetchImpl: fixtureFetch({ a:'203.0.113.1', b:'203.0.113.1', c:'203.0.113.2' })
  });
  assert.equal(result.confidence, 'strong');
  assert.equal(result.address, '203.0.113.1');
  assert.equal(result.agreement.winningShare, 2 / 3);
});

test('two agreeing primary groups plus failed reserve remain partial', async () => {
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

test('2-2 plus one agreeing reserve is still no-consensus under two-thirds rule', async () => {
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

test('disabled reserve is never fetched, never used, and never inflates agreement totals', async () => {
  const calls = [];
  const disabled = { ...group('reserve', 'reserve'), enabled:false, disabledReason:'Browser CORS unavailable' };
  const result = await runIpConsensus({
    family:4,
    primaryGroups:[group('a'), group('b')],
    reserveGroups:[disabled],
    timeoutMs:100,
    fetchImpl:fixtureFetch({ a:'203.0.113.1', b:'203.0.113.1', reserve:'203.0.113.1' }, calls)
  });
  assert.equal(result.confidence, 'partial');
  assert.equal(result.agreement.available, 2);
  assert.equal(result.agreement.total, 2);
  assert.equal(result.reserve.used, false);
  assert.equal(result.reserve.sources[0].status, 'disabled');
  assert.match(result.reserve.sources[0].error, /CORS/i);
  assert.ok(!calls.some((url) => url.includes('reserve.test')));
});

test('4 equal of 6 finishes before two pending groups settle and marks them not-needed', async () => {
  const aborted = [];
  const run = runIpConsensusProgressive({
    family:4,
    primaryGroups:['a','b','c','d','e','f'].map((id) => group(id)),
    reserveGroups:[],
    timeoutMs:500,
    fetchImpl:hangingFetch({ a:'31.76.17.233', b:'31.76.17.233', c:'31.76.17.233', d:'31.76.17.233', e:'hang', f:'hang' }, [], aborted)
  });
  const first = await Promise.race([run, sleep(80).then(() => 'still-pending')]);
  assert.notEqual(first, 'still-pending');
  assert.equal(first.confidence, 'strong');
  assert.equal(first.address, '31.76.17.233');
  assert.equal(first.agreement.available, 4);
  assert.equal(first.sources.filter((source) => source.status === 'not-needed').length, 2);
  assert.ok(first.sources.filter((source) => source.status === 'not-needed').every((source) => /guaranteed/i.test(source.error)));
  assert.deepEqual(new Set(aborted), new Set(['e','f']));
});

test('3 equal of 5 does not early finish while two groups are pending', async () => {
  const d = deferred();
  const e = deferred();
  const fetchImpl = async (url) => {
    const host = new URL(url).hostname.split('.')[0];
    if (['a','b','c'].includes(host)) return text('31.76.17.233');
    if (host === 'd') return d.promise;
    if (host === 'e') return e.promise;
    throw new TypeError('offline');
  };
  const run = runIpConsensusProgressive({
    family:4,
    primaryGroups:['a','b','c','d','e'].map((id) => group(id)),
    reserveGroups:[], timeoutMs:500, fetchImpl
  });
  const early = await Promise.race([run, sleep(40).then(() => 'still-pending')]);
  assert.equal(early, 'still-pending');
  d.resolve(text('203.0.113.8'));
  e.resolve(text('203.0.113.8'));
  const final = await run;
  assert.equal(final.confidence, 'no-consensus');
  assert.equal(final.address, null);
});

test('one settled provider failure does not count against a safe 3-of-4 guarantee', async () => {
  const aborted = [];
  const result = await runIpConsensusProgressive({
    family:4,
    primaryGroups:['a','b','c','d','e'].map((id) => group(id)),
    reserveGroups:[], timeoutMs:500,
    fetchImpl:hangingFetch({ a:'31.76.17.233', b:'31.76.17.233', c:'31.76.17.233', d:new TypeError('offline'), e:'hang' }, [], aborted)
  });
  assert.equal(result.confidence, 'strong');
  assert.equal(result.agreement.available, 3);
  assert.ok(aborted.includes('e'));
});
