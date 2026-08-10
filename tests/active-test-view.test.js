import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatClock,
  buildAggressiveTestView,
  buildGuidedTestView,
  buildMonitorTestView,
  buildMediaWebRtcTestView
} from '../assets/active-test-view.js';

test('formatClock renders whole-second mm:ss', () => {
  assert.equal(formatClock(0), '00:00');
  assert.equal(formatClock(42_100), '00:42');
  assert.equal(formatClock(61_000), '01:01');
});

test('Aggressive shows baseline preparation before the real 60-second window starts', () => {
  const view = buildAggressiveTestView({ status:'running', startedAt:0, endsAt:null, result:null }, 10_000);
  assert.equal(view.phase, 'preparing');
  assert.equal(view.summaryStatus, 'Preparing baseline…');
  assert.equal(view.remainingText, null);
});

test('Aggressive countdown derives from underlying endsAt', () => {
  const view = buildAggressiveTestView({ status:'running', startedAt:10_000, endsAt:70_000, durationMs:60_000, result:null }, 28_000);
  assert.equal(view.phase, 'running');
  assert.equal(view.remainingText, '00:42 remaining');
  assert.equal(view.progress, 0.3);
});

test('Guided stress uses the same stress deadline and never starts a second timer', () => {
  const view = buildGuidedTestView({
    profile:{ step:'stress' }, stressIsGuided:true,
    stressState:{ status:'running', startedAt:1000, endsAt:61_000, durationMs:60_000 }, verdict:null
  }, 21_000);
  assert.equal(view.summaryStatus, 'Running · 00:40 remaining');
  assert.equal(view.remainingText, '00:40 remaining');
});

test('monitor elapsed time freezes at stoppedAt', () => {
  const state = { running:false, startedAt:'2026-08-10T12:00:00.000Z', stoppedAt:'2026-08-10T12:01:24.000Z', successfulSampleCount:4, sampleCount:4, events:[] };
  const view = buildMonitorTestView(state, Date.parse('2026-08-10T12:10:00.000Z'));
  assert.equal(view.elapsedText, '01:24 elapsed');
  assert.equal(view.resultTone, 'clean');
  assert.equal(view.resultLabel, 'NO IP CHANGE OBSERVED');
});

test('monitor with no usable samples is inconclusive instead of clean', () => {
  const view = buildMonitorTestView({ running:false, startedAt:'2026-08-10T12:00:00.000Z', stoppedAt:'2026-08-10T12:00:15.000Z', successfulSampleCount:0, sampleCount:3, events:[] }, Date.now());
  assert.equal(view.resultTone, 'review');
  assert.equal(view.resultLabel, 'MONITORING INCONCLUSIVE');
});

test('media WebRTC explains standalone classification limits', () => {
  const view = buildMediaWebRtcTestView({
    profile:{ knownReal:{4:[],6:[]}, knownVpn:{4:[],6:[]} },
    media:{ status:'complete', newlyVisible:[{address:'203.0.113.9',classification:'public'}] },
    mediaRun:{ running:false, startedAtMs:1000, completedAtMs:5000 },
    mediaExposures:[{ address:'203.0.113.9', relation:'unknown-public' }]
  }, 5000);
  assert.equal(view.baselineMode, 'standalone');
  assert.equal(view.resultLabel, 'ADDITIONAL PUBLIC WEBRTC IP OBSERVED');
  assert.match(view.resultMessage, /cannot prove/i);
});

test('media WebRTC can identify known real exposure when Guided baseline exists', () => {
  const view = buildMediaWebRtcTestView({
    profile:{ knownReal:{4:['128.71.33.91'],6:[]}, knownVpn:{4:['203.0.113.2'],6:[]} },
    media:{ status:'complete', newlyVisible:[{address:'128.71.33.91',classification:'public'}] },
    mediaRun:{ running:false, startedAtMs:1000, completedAtMs:5000 },
    mediaExposures:[{ address:'128.71.33.91', relation:'known-real' }]
  }, 5000);
  assert.equal(view.baselineMode, 'guided');
  assert.equal(view.resultTone, 'leak');
  assert.equal(view.resultLabel, 'KNOWN REAL IP EXPOSED THROUGH WEBRTC');
});
