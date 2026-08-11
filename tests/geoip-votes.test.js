import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeFieldVotes } from '../assets/geoip-votes.js';

const identity = (value) => value;

test('3-1 produces a majority winner with an outlier', () => {
  const result = summarizeFieldVotes(['DE','DE','DE','GB'], { keyOf:identity, labelOf:identity });
  assert.equal(result.state, 'majority');
  assert.equal(result.winnerKey, 'DE');
  assert.equal(result.winnerLabel, 'DE');
  assert.equal(result.winnerVotes, 3);
  assert.equal(result.usable, 4);
  assert.equal(result.winnerShare, 0.75);
  assert.deepEqual(result.outliers, [{ key:'GB', label:'GB', votes:1 }]);
});

test('2-2 is unresolved and selects nothing', () => {
  const result = summarizeFieldVotes(['DE','DE','GB','GB'], { keyOf:identity, labelOf:identity });
  assert.equal(result.state, 'unresolved');
  assert.equal(result.winnerKey, null);
  assert.equal(result.winnerVotes, 0);
  assert.equal(result.usable, 4);
});

test('2-1-1 is unresolved because plurality is not a strict majority', () => {
  const result = summarizeFieldVotes(['DE','DE','GB','FR'], { keyOf:identity, labelOf:identity });
  assert.equal(result.state, 'unresolved');
  assert.equal(result.winnerKey, null);
  assert.equal(result.winnerShare, 0.5);
});

test('one usable value is single-source and all equal values agree', () => {
  assert.equal(summarizeFieldVotes(['DE'], { keyOf:identity, labelOf:identity }).state, 'single-source');
  const all = summarizeFieldVotes(['DE','DE','DE'], { keyOf:identity, labelOf:identity });
  assert.equal(all.state, 'agree');
  assert.equal(all.winnerVotes, 3);
});

test('no usable values are unavailable', () => {
  const result = summarizeFieldVotes([null, undefined, ''], { keyOf:identity, labelOf:identity });
  assert.equal(result.state, 'unavailable');
  assert.equal(result.usable, 0);
  assert.equal(result.winnerKey, null);
});
