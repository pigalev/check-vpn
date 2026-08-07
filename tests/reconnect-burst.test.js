import test from 'node:test';
import assert from 'node:assert/strict';
import { createReconnectBurst } from '../assets/reconnect-burst.js';

function clockHarness() {
  let nowMs = 0;
  let seq = 0;
  const timers = new Map();
  return {
    now: () => nowMs,
    setTimeoutImpl(fn, delay = 0) { seq += 1; timers.set(seq, { fn, due: nowMs + Math.max(0, delay) }); return seq; },
    clearTimeoutImpl(id) { timers.delete(id); },
    async advanceTo(target) {
      while (true) {
        const next = [...timers.entries()].filter(([, t]) => t.due <= target).sort((a,b) => a[1].due - b[1].due || a[0]-b[0])[0];
        if (!next) break;
        const [id, timer] = next; timers.delete(id); nowMs = timer.due; timer.fn(); await Promise.resolve(); await Promise.resolve();
      }
      nowMs = target;
    }
  };
}

test('burst keeps approved schedule and coalesces repeats', async () => {
  const clock = clockHarness();
  const http = [], rtc = [];
  const burst = createReconnectBurst({
    offsetsMs: [0,250,500,1000,2000,4000],
    webRtcOffsetsMs: [0,500,2000,4000],
    now: clock.now,
    setTimeoutImpl: clock.setTimeoutImpl,
    clearTimeoutImpl: clock.clearTimeoutImpl,
    onHttp: ({ offsetMs }) => http.push(offsetMs),
    onWebRtc: ({ offsetMs }) => rtc.push(offsetMs)
  });
  burst.trigger('online');
  burst.trigger('connection-change');
  await clock.advanceTo(4000);
  assert.deepEqual(http, [0,250,500,1000,2000,4000]);
  assert.deepEqual(rtc, [0,500,2000,4000]);
  assert.equal(burst.getState().coalescedTriggers, 1);
  assert.deepEqual(burst.getState().reasons.sort(), ['connection-change', 'online']);
});

test('stop prevents late callbacks', async () => {
  const clock = clockHarness();
  const http = [];
  const burst = createReconnectBurst({
    offsetsMs: [0,250,500], webRtcOffsetsMs: [], now: clock.now,
    setTimeoutImpl: clock.setTimeoutImpl, clearTimeoutImpl: clock.clearTimeoutImpl,
    onHttp: ({ offsetMs }) => http.push(offsetMs), onWebRtc: () => {}
  });
  burst.trigger('online');
  await clock.advanceTo(0);
  burst.stop();
  await clock.advanceTo(1000);
  assert.deepEqual(http, [0]);
});
