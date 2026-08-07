function observedAddress(result) {
  if (!result || result.status !== 'complete') return undefined;
  return result.address ?? null;
}

function addressMap(sample) {
  return { 4: observedAddress(sample?.ipv4), 6: observedAddress(sample?.ipv6) };
}

export function createMonitorState() {
  return { running: false, startedAt: null, sampleCount: 0, baseline: { 4: null, 6: null }, current: { 4: null, 6: null }, events: [] };
}

function eventId(timestamp, family, previousAddress, address, index) {
  return `${timestamp}|${family}|${previousAddress ?? 'none'}|${address ?? 'none'}|${index}`;
}

export function reduceMonitorState(state, action) {
  if (action.type === 'start') return { ...createMonitorState(), running: true, startedAt: action.timestamp };
  if (action.type === 'stop') return { ...state, running: false };
  if (action.type === 'replace-event') return { ...state, events: state.events.map((event) => event.id === action.event?.id ? action.event : event) };
  if (action.type !== 'sample') return state;

  const observed = addressMap(action.sample);
  const next = { ...state.current };
  const baseline = { ...state.baseline };
  const events = [...state.events];

  for (const family of [4, 6]) {
    const address = observed[family];
    if (address === undefined) continue;
    const previousAddress = state.current[family];
    if (state.sampleCount === 0) baseline[family] = address;
    else if (previousAddress !== address) {
      events.push({ id: eventId(action.timestamp, family, previousAddress, address, events.length), timestamp: action.timestamp, family, previousAddress, address, enrichmentStatus: 'pending' });
    }
    next[family] = address;
  }

  return { ...state, sampleCount: state.sampleCount + 1, baseline, current: next, events };
}

export function monitorFindings(state) {
  if (!state.events.length) return [];
  const possibleIsp = state.events.some((event) => event.transitionLabel === 'Possible ISP exposure');
  return [{ id: 'monitor-ip-change', severity: 'leak', category: 'monitor', summary: possibleIsp ? 'Possible ISP exposure during monitoring' : 'Public IP changed during monitoring', details: `${state.events.length} address change event(s) were observed.`, sources: ['kill-switch-monitor'] }];
}

export function createIpMonitor({ sample, intervalMs = 5000, now = () => new Date().toISOString(), setIntervalImpl = setInterval, clearIntervalImpl = clearInterval, onUpdate = () => {} }) {
  let state = createMonitorState();
  let timer = null;
  const emit = () => onUpdate(state);
  const takeSample = async () => {
    try { state = reduceMonitorState(state, { type: 'sample', timestamp: now(), sample: await sample() }); }
    catch { state = { ...state, sampleCount: state.sampleCount + 1 }; }
    emit();
  };
  return {
    getState: () => state,
    replaceEvent(event) { state = reduceMonitorState(state, { type: 'replace-event', event }); emit(); },
    async start() {
      if (state.running) return;
      state = reduceMonitorState(state, { type: 'start', timestamp: now() }); emit();
      await takeSample();
      timer = setIntervalImpl(takeSample, intervalMs);
    },
    stop() {
      if (timer != null) clearIntervalImpl(timer);
      timer = null; state = reduceMonitorState(state, { type: 'stop' }); emit();
    }
  };
}
