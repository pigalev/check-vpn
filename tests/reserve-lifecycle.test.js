import test from 'node:test';
import assert from 'node:assert/strict';
import { runIpConsensus, runIpConsensusProgressive } from '../assets/ip-consensus.js';

function text(value) {
  return { ok:true, status:200, text:async () => value, json:async () => ({ ip:value.trim() }) };
}

function group(id, tier = 'primary') {
  return { id, group:id, label:id, family:4, tier, endpoints:[{ id:`${id}-endpoint`, kind:'text', url:`https://${id}.test/` }] };
}

function fixtureFetch(values) {
  return async (url) => {
    const host = new URL(url).hostname.split('.')[0];
    const value = values[host];
    if (value == null) throw new TypeError('offline');
    return text(value);
  };
}

function hangingFetch(values) {
  return async (url, options = {}) => {
    const host = new URL(url).hostname.split('.')[0];
    const value = values[host];
    if (value === 'hang') {
      return new Promise((_resolve, reject) => {
        const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
        if (options.signal?.aborted) onAbort();
        else options.signal?.addEventListener('abort', onAbort, { once:true });
      });
    }
    if (value == null) throw new TypeError('offline');
    return text(value);
  };
}

test('failed reserve is attempted but does not contribute', async () => {
  const result = await runIpConsensus({
    family:4,
    primaryGroups:['a','b','c'].map(group),
    reserveGroups:[group('reserve','reserve')], timeoutMs:100,
    fetchImpl:fixtureFetch({ a:'203.0.113.1', b:'203.0.113.1' })
  });
  assert.equal(result.reserve.attempted, true);
  assert.equal(result.reserve.contributed, false);
  assert.equal(result.reserve.notNeeded, false);
});

test('successful reserve that enters final vote is contributed', async () => {
  const result = await runIpConsensus({
    family:4,
    primaryGroups:['a','b','c','d','e'].map(group),
    reserveGroups:[group('reserve','reserve')], timeoutMs:100,
    fetchImpl:fixtureFetch({
      a:'203.0.113.1', b:'203.0.113.1', c:'203.0.113.1',
      d:'203.0.113.2', e:'203.0.113.2', reserve:'203.0.113.1'
    })
  });
  assert.equal(result.reserve.attempted, true);
  assert.equal(result.reserve.contributed, true);
  assert.equal(result.reserve.notNeeded, false);
});

test('reserve aborted after guaranteed consensus is not needed', async () => {
  const result = await runIpConsensusProgressive({
    family:4,
    primaryGroups:['a','b','c','d'].map(group),
    reserveGroups:[group('reserve','reserve')], timeoutMs:500,
    fetchImpl:hangingFetch({ a:'31.76.17.233', b:'31.76.17.233', c:'31.76.17.233', d:'31.76.17.233', reserve:'hang' })
  });
  assert.equal(result.reserve.notNeeded, true);
  assert.equal(result.reserve.attempted, false);
  assert.equal(result.reserve.contributed, false);
});
