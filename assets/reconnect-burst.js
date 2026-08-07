export function createReconnectBurst({
  offsetsMs = [0, 250, 500, 1000, 2000, 4000],
  webRtcOffsetsMs = [0, 500, 2000, 4000],
  now = () => Date.now(),
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
  onHttp = () => {},
  onWebRtc = () => {},
  onEvent = () => {}
} = {}) {
  let generation = 0;
  let active = false;
  let startedAt = null;
  let coalescedTriggers = 0;
  let pendingCallbacks = 0;
  const reasons = new Set();
  const completedOffsets = [];
  const timers = new Set();

  function completeOne(runGeneration) {
    if (!active || runGeneration !== generation) return;
    pendingCallbacks = Math.max(0, pendingCallbacks - 1);
    if (pendingCallbacks !== 0) return;
    active = false;
    onEvent({ type: 'complete', timestampMs: now() });
  }

  function schedule(fn, offsetMs, runGeneration) {
    const delay = Math.max(0, startedAt + offsetMs - now());
    const id = setTimeoutImpl(() => {
      timers.delete(id);
      if (!active || runGeneration !== generation) return;
      try { fn(); }
      finally { completeOne(runGeneration); }
    }, delay);
    timers.add(id);
  }

  function trigger(reason = 'network-change') {
    reasons.add(reason);
    if (active) {
      coalescedTriggers += 1;
      onEvent({ type: 'coalesced', reason, timestampMs: now() });
      return getState();
    }

    generation += 1;
    const runGeneration = generation;
    active = true;
    startedAt = now();
    pendingCallbacks = offsetsMs.length + webRtcOffsetsMs.length;
    completedOffsets.length = 0;
    onEvent({ type: 'start', reason, timestampMs: startedAt });

    if (pendingCallbacks === 0) {
      active = false;
      onEvent({ type: 'complete', timestampMs: now() });
      return getState();
    }

    for (const offsetMs of offsetsMs) {
      schedule(() => {
        completedOffsets.push(offsetMs);
        void Promise.resolve(onHttp({ offsetMs, reason, startedAt, timestampMs: now() })).catch(() => {});
      }, offsetMs, runGeneration);
    }

    for (const offsetMs of webRtcOffsetsMs) {
      schedule(() => {
        void Promise.resolve(onWebRtc({ offsetMs, reason, startedAt, timestampMs: now() })).catch(() => {});
      }, offsetMs, runGeneration);
    }
    return getState();
  }

  function stop() {
    generation += 1;
    active = false;
    pendingCallbacks = 0;
    for (const id of timers) clearTimeoutImpl(id);
    timers.clear();
  }

  function getState() {
    return {
      active,
      startedAt,
      reasons: [...reasons],
      coalescedTriggers,
      completedOffsets: [...completedOffsets]
    };
  }

  return { trigger, stop, getState };
}
