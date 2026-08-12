import test from 'node:test';
import assert from 'node:assert/strict';
import { runIpConsensus } from '../assets/ip-consensus.js';

function text(value) {
  return { ok:true, status:200, text:async () => value, json:async () => ({ ip:value.trim() }) };
}

function group(id) {
  return {
    id,
    group:id,
    label:id,
    family:4,
    tier:'primary',
    endpoints:[{ id:`${id}-endpoint`, kind:'text', url:`https://${id}.test/` }]
  };
}

function fixtureFetch(values) {
  return async (url) => {
    const host = new URL(url).hostname.split('.')[0];
    const value = values[host];
    if (value == null) throw new TypeError('offline');
    return text(value);
  };
}

test('2-1 with exactly three successful groups is not Strong', async () => {
  const result = await runIpConsensus({
    family:4,
    primaryGroups:['a','b','c'].map(group),
    reserveGroups:[],
    timeoutMs:100,
    fetchImpl:fixtureFetch({ a:'203.0.113.1', b:'203.0.113.1', c:'203.0.113.2' })
  });
  assert.equal(result.confidence, 'no-consensus');
  assert.equal(result.address, null);
  assert.equal(result.agreement.selectedVotes, 2);
  assert.equal(result.agreement.winningShare, 2 / 3);
});
