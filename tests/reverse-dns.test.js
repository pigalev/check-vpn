import test from 'node:test';
import assert from 'node:assert/strict';
import { runReverseDns } from '../assets/reverse-dns.js';

function resolver(id) {
  return { id, label:id, kind:'google', url:`https://${id}.test/resolve` };
}

function response(payload) {
  return { ok:true, status:200, json:async () => payload };
}

function fixtureDns(payloads) {
  return async (url) => {
    const host = new URL(url).hostname.split('.')[0];
    const payload = payloads[host];
    if (payload instanceof Error || payload == null) throw payload ?? new TypeError('offline');
    return response(payload);
  };
}

function ptr(name) {
  return { Status:0, Answer:[{ type:12, data:`${name}.` }] };
}

test('two reachable resolvers with no PTR record are no-record, not agree', async () => {
  const result = await runReverseDns({
    ip:'203.0.113.10', resolvers:[resolver('a'),resolver('b')], timeoutMs:100,
    fetchImpl:fixtureDns({ a:{Status:0,Answer:[]}, b:{Status:0,Answer:[]} })
  });
  assert.equal(result.agreement.reached, 2);
  assert.equal(result.agreement.recordsAvailable, 0);
  assert.equal(result.agreement.state, 'no-record');
  assert.equal(result.agreement.agree, null);
});

test('one PTR-bearing resolver is single-source even if another resolver returns no record', async () => {
  const result = await runReverseDns({
    ip:'203.0.113.10', resolvers:[resolver('a'),resolver('b')], timeoutMs:100,
    fetchImpl:fixtureDns({ a:ptr('ptr.example'), b:{Status:0,Answer:[]} })
  });
  assert.equal(result.agreement.reached, 2);
  assert.equal(result.agreement.recordsAvailable, 1);
  assert.equal(result.agreement.state, 'single-source');
  assert.equal(result.agreement.agree, null);
});

test('matching PTR records from two resolvers agree', async () => {
  const result = await runReverseDns({
    ip:'203.0.113.10', resolvers:[resolver('a'),resolver('b')], timeoutMs:100,
    fetchImpl:fixtureDns({ a:ptr('ptr.example'), b:ptr('ptr.example') })
  });
  assert.equal(result.agreement.state, 'agree');
  assert.equal(result.agreement.agree, true);
});

test('different PTR records disagree', async () => {
  const result = await runReverseDns({
    ip:'203.0.113.10', resolvers:[resolver('a'),resolver('b')], timeoutMs:100,
    fetchImpl:fixtureDns({ a:ptr('a.example'), b:ptr('b.example') })
  });
  assert.equal(result.agreement.state, 'disagree');
  assert.equal(result.agreement.agree, false);
});

test('no reachable resolver is unavailable', async () => {
  const result = await runReverseDns({
    ip:'203.0.113.10', resolvers:[resolver('a'),resolver('b')], timeoutMs:100,
    fetchImpl:fixtureDns({})
  });
  assert.equal(result.agreement.reached, 0);
  assert.equal(result.agreement.state, 'unavailable');
  assert.equal(result.agreement.agree, null);
});
