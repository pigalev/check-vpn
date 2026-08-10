import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresentationTicker } from '../assets/presentation-ticker.js';

test('presentation ticker starts once, ticks without network semantics, and stops when inactive', () => {
  let callback = null;
  let clearCount = 0;
  const ticks = [];
  const ticker = createPresentationTicker({
    onTick:(nowMs) => ticks.push(nowMs),
    intervalMs:250,
    now:() => 1234,
    setIntervalImpl:(fn, ms) => { assert.equal(ms, 250); callback = fn; return 9; },
    clearIntervalImpl:(id) => { assert.equal(id, 9); clearCount += 1; }
  });

  ticker.sync(true);
  ticker.sync(true);
  assert.equal(ticker.isRunning(), true);
  callback();
  assert.deepEqual(ticks, [1234]);
  ticker.sync(false);
  assert.equal(clearCount, 1);
  assert.equal(ticker.isRunning(), false);
});
