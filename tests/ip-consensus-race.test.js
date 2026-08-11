import test from 'node:test';
import assert from 'node:assert/strict';
import { countVotes, canGuaranteeStrong } from '../assets/ip-consensus-race.js';

const ok = (id, address) => ({ id, status:'complete', address });
const fail = (id) => ({ id, status:'unavailable', address:null });

test('4 equal responses with 2 pending are mathematically guaranteed Strong', () => {
  const sources = [1,2,3,4].map((n) => ok(`p${n}`, '31.76.17.233'));
  assert.equal(canGuaranteeStrong({ sources, pendingCount:2 }), true);
});

test('3 equal responses with 2 pending are not yet guaranteed', () => {
  const sources = [1,2,3].map((n) => ok(`p${n}`, '31.76.17.233'));
  assert.equal(canGuaranteeStrong({ sources, pendingCount:2 }), false);
});

test('5 equal responses with 2 pending are guaranteed', () => {
  const sources = [1,2,3,4,5].map((n) => ok(`p${n}`, '31.76.17.233'));
  assert.equal(canGuaranteeStrong({ sources, pendingCount:2 }), true);
});

test('4-1 with 1 pending is still guaranteed at exactly 4/6', () => {
  const sources = [
    ok('a','31.76.17.233'), ok('b','31.76.17.233'), ok('c','31.76.17.233'), ok('d','31.76.17.233'),
    ok('e','203.0.113.8')
  ];
  assert.equal(canGuaranteeStrong({ sources, pendingCount:1 }), true);
});

test('3-1 with 2 pending is not guaranteed', () => {
  const sources = [ok('a','31.76.17.233'), ok('b','31.76.17.233'), ok('c','31.76.17.233'), ok('d','203.0.113.8')];
  assert.equal(canGuaranteeStrong({ sources, pendingCount:2 }), false);
});

test('failed settled sources do not increase worst-case denominator', () => {
  const sources = [ok('a','31.76.17.233'), ok('b','31.76.17.233'), ok('c','31.76.17.233'), fail('x')];
  assert.equal(canGuaranteeStrong({ sources, pendingCount:1 }), true);
});

test('three votes minimum still applies with zero pending', () => {
  assert.equal(canGuaranteeStrong({ sources:[ok('a','1.1.1.1'),ok('b','1.1.1.1')], pendingCount:0 }), false);
});

test('countVotes ignores unavailable sources and reports the current leader', () => {
  const vote = countVotes([ok('a','1.1.1.1'), ok('b','1.1.1.1'), ok('c','2.2.2.2'), fail('d')]);
  assert.equal(vote.successful.length, 3);
  assert.equal(vote.winner, '1.1.1.1');
  assert.equal(vote.selectedVotes, 2);
  assert.equal(vote.winningShare, 2 / 3);
});
