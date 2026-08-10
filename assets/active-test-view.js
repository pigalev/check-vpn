function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function arraysHaveValues(bucket) { return [4, 6].some((family) => (bucket?.[family] ?? []).length > 0); }
function publicMediaCandidates(media) { return (media?.newlyVisible ?? []).filter((item) => item?.classification === 'public' && item?.address); }

export function formatClock(ms) {
  const seconds = Math.max(0, Math.ceil((Number.isFinite(ms) ? ms : 0) / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function timedRunningView(state, nowMs) {
  if (state?.status !== 'running') return null;
  if (state.endsAt == null) return {
    phase: 'preparing',
    summaryStatus: 'Preparing baseline…',
    remainingText: null,
    progress: 0
  };
  const remainingMs = Math.max(0, state.endsAt - nowMs);
  const durationMs = Math.max(1, state.durationMs ?? (state.endsAt - state.startedAt));
  return {
    phase: 'running',
    summaryStatus: `Running · ${formatClock(remainingMs)} remaining`,
    remainingText: `${formatClock(remainingMs)} remaining`,
    progress: clamp((durationMs - remainingMs) / durationMs, 0, 1)
  };
}

export function buildAggressiveTestView(state = {}, nowMs = Date.now()) {
  const running = timedRunningView(state, nowMs);
  if (running) return { ...running, resultTone: null, resultLabel: null, resultMessage: null };
  if (state.result === 'leak') return {
    phase: 'complete', summaryStatus: '✕ Leak detected', resultTone: 'leak', resultLabel: 'LEAK DETECTED',
    resultMessage: state.reasons?.[0] ?? 'An unexpected public IP was observed.'
  };
  if (state.result === 'clean') return {
    phase: 'complete', summaryStatus: '✓ No unexpected IP observed', resultTone: 'clean', resultLabel: 'NO UNEXPECTED IP OBSERVED',
    resultMessage: state.reasons?.[0] ?? 'No unexpected public IP was observed with sufficient coverage.'
  };
  if (state.result === 'inconclusive') return {
    phase: 'complete', summaryStatus: '⚠ Inconclusive', resultTone: 'review', resultLabel: 'TEST INCONCLUSIVE',
    resultMessage: state.reasons?.[0] ?? 'Sampling coverage was insufficient for a clean result.'
  };
  return { phase: 'idle', summaryStatus: 'Ready · 60 seconds', remainingText: null, progress: 0, resultTone: null, resultLabel: null, resultMessage: null };
}

function guidedVerdictView(verdict) {
  if (!verdict) return null;
  const map = {
    'real-leak': ['leak', '✕ Real IP leak detected'],
    'unexpected-leak': ['leak', '✕ Unexpected public IP detected'],
    review: ['review', '⚠ Review'],
    inconclusive: ['review', '⚠ Inconclusive'],
    clean: ['clean', '✓ No known real IP observed']
  };
  const [tone, summary] = map[verdict.result] ?? ['review', verdict.label ?? 'Review'];
  return {
    phase: 'complete', summaryStatus: summary, resultTone: tone,
    resultLabel: verdict.label ?? null,
    resultMessage: verdict.reasons?.[0] ?? (verdict.result === 'clean' ? 'The captured pre-VPN public IP was not observed during the stress test.' : null)
  };
}

export function buildGuidedTestView({ profile = {}, stressState = null, stressIsGuided = false, verdict = null } = {}, nowMs = Date.now()) {
  if (stressIsGuided) {
    const running = timedRunningView(stressState, nowMs);
    if (running) return { ...running, resultTone: null, resultLabel: null, resultMessage: null };
    const complete = guidedVerdictView(verdict);
    if (complete) return { ...complete, remainingText: null, progress: stressState?.status === 'complete' ? 1 : 0 };
  }
  const step = profile.step ?? 'real';
  if (step === 'vpn') return { phase: 'idle', summaryStatus: 'Step 2/3 · capture VPN IP', remainingText: null, progress: 0, resultTone: null, resultLabel: null, resultMessage: null };
  if (step === 'stress') return { phase: 'idle', summaryStatus: 'Step 3/3 · ready for 60s stress', remainingText: null, progress: 0, resultTone: null, resultLabel: null, resultMessage: null };
  return { phase: 'idle', summaryStatus: 'Step 1/3 · identify your real IP', remainingText: null, progress: 0, resultTone: null, resultLabel: null, resultMessage: null };
}

function parsedTime(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildMonitorTestView(state = {}, nowMs = Date.now()) {
  const startedAtMs = parsedTime(state.startedAt);
  const stoppedAtMs = parsedTime(state.stoppedAt);
  const endMs = state.running ? nowMs : stoppedAtMs;
  const elapsedMs = startedAtMs != null && endMs != null ? Math.max(0, endMs - startedAtMs) : 0;
  const elapsedText = startedAtMs != null ? `${formatClock(elapsedMs)} elapsed` : null;
  if (state.running) return {
    phase: 'running', summaryStatus: `Monitoring · ${formatClock(elapsedMs)} elapsed`, elapsedText,
    resultTone: null, resultLabel: null, resultMessage: null
  };
  if ((state.events?.length ?? 0) > 0) return {
    phase: 'complete', summaryStatus: '⚠ IP change detected', elapsedText,
    resultTone: 'review', resultLabel: 'IP CHANGE DETECTED',
    resultMessage: `${state.events.length} public-address change event(s) were observed during monitoring.`
  };
  if ((state.successfulSampleCount ?? 0) > 0) return {
    phase: 'complete', summaryStatus: '✓ No IP change observed', elapsedText,
    resultTone: 'clean', resultLabel: 'NO IP CHANGE OBSERVED',
    resultMessage: 'No public-address transition was observed during monitoring.'
  };
  if ((state.sampleCount ?? 0) > 0) return {
    phase: 'complete', summaryStatus: '⚠ Inconclusive', elapsedText,
    resultTone: 'review', resultLabel: 'MONITORING INCONCLUSIVE',
    resultMessage: 'No usable public-IP sample was collected during monitoring.'
  };
  return { phase: 'idle', summaryStatus: 'Not running', elapsedText: null, resultTone: null, resultLabel: null, resultMessage: null };
}

export function buildMediaWebRtcTestView({ profile = {}, media = null, mediaRun = null, mediaExposures = [] } = {}, nowMs = Date.now()) {
  const baselineMode = arraysHaveValues(profile.knownReal) || arraysHaveValues(profile.knownVpn) ? 'guided' : 'standalone';
  const elapsedMs = mediaRun?.startedAtMs != null
    ? Math.max(0, (mediaRun.running ? nowMs : mediaRun.completedAtMs ?? nowMs) - mediaRun.startedAtMs)
    : 0;
  const baselineMessage = baselineMode === 'guided'
    ? 'Captured Guided real/VPN addresses are used to classify public WebRTC addresses found here.'
    : 'No Guided baseline captured. This test can detect additional public WebRTC addresses, but cannot prove that an address is your known pre-VPN IP.';
  if (mediaRun?.running) return {
    phase: 'running', baselineMode, baselineMessage,
    summaryStatus: `Running · ${formatClock(elapsedMs)} elapsed`, elapsedText: `${formatClock(elapsedMs)} elapsed`,
    resultTone: null, resultLabel: null, resultMessage: null
  };
  if (!media) return {
    phase: 'idle', baselineMode, baselineMessage,
    summaryStatus: baselineMode === 'guided' ? 'Uses Guided baseline' : 'Standalone', elapsedText: null,
    resultTone: null, resultLabel: null, resultMessage: null
  };
  if (media.status === 'denied') return { phase:'complete', baselineMode, baselineMessage, summaryStatus:'⚠ Permission denied', elapsedText:`${formatClock(elapsedMs)} elapsed`, resultTone:'review', resultLabel:'PERMISSION DENIED', resultMessage:media.error ?? 'Media permission was denied.' };
  if (media.status === 'unavailable') return { phase:'complete', baselineMode, baselineMessage, summaryStatus:'Unsupported', elapsedText:`${formatClock(elapsedMs)} elapsed`, resultTone:'neutral', resultLabel:'UNSUPPORTED', resultMessage:media.error ?? 'Media devices are not available in this browser.' };
  if (media.status === 'error') return { phase:'complete', baselineMode, baselineMessage, summaryStatus:'⚠ Test could not complete', elapsedText:`${formatClock(elapsedMs)} elapsed`, resultTone:'review', resultLabel:'TEST COULD NOT COMPLETE', resultMessage:media.error ?? 'The WebRTC permission check failed.' };

  const knownReal = mediaExposures.some((item) => item.relation === 'known-real');
  const unknownPublic = mediaExposures.some((item) => item.relation === 'unknown-public');
  const knownVpn = mediaExposures.some((item) => item.relation === 'known-vpn');
  const publicVisible = publicMediaCandidates(media).length > 0 || knownReal || unknownPublic || knownVpn;
  if (knownReal) return { phase:'complete', baselineMode, baselineMessage, summaryStatus:'✕ Known real IP exposed', elapsedText:`${formatClock(elapsedMs)} elapsed`, resultTone:'leak', resultLabel:'KNOWN REAL IP EXPOSED THROUGH WEBRTC', resultMessage:'A public WebRTC address matched the pre-VPN address captured by Guided.' };
  if (baselineMode === 'guided' && unknownPublic) return { phase:'complete', baselineMode, baselineMessage, summaryStatus:'⚠ Unexpected public WebRTC IP', elapsedText:`${formatClock(elapsedMs)} elapsed`, resultTone:'review', resultLabel:'UNEXPECTED PUBLIC WEBRTC IP OBSERVED', resultMessage:'A public WebRTC address did not match the captured Known Real or Known VPN addresses.' };
  if (baselineMode === 'guided' && knownVpn && !unknownPublic) return { phase:'complete', baselineMode, baselineMessage, summaryStatus:'✓ Only known VPN IP observed', elapsedText:`${formatClock(elapsedMs)} elapsed`, resultTone:'clean', resultLabel:'ONLY KNOWN VPN IP OBSERVED', resultMessage:'Any public WebRTC address exposed by this check matched the captured VPN address.' };
  if (baselineMode === 'standalone' && publicVisible) return { phase:'complete', baselineMode, baselineMessage, summaryStatus:'⚠ Additional public WebRTC IP', elapsedText:`${formatClock(elapsedMs)} elapsed`, resultTone:'review', resultLabel:'ADDITIONAL PUBLIC WEBRTC IP OBSERVED', resultMessage:'An additional public WebRTC address became visible, but without a Guided baseline this test cannot prove that it is your known pre-VPN IP.' };
  return { phase:'complete', baselineMode, baselineMessage, summaryStatus:'✓ No additional public IP', elapsedText:`${formatClock(elapsedMs)} elapsed`, resultTone:'clean', resultLabel:'NO ADDITIONAL PUBLIC WEBRTC IP', resultMessage:'Granting media permission did not reveal an additional public WebRTC address.' };
}
