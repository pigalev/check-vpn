import { createGuidedLeakProfileStore } from './guided-leak-profile.js';
import { captureGuidedConnection } from './guided-leak-capture.js';
import { collectProviderObservations } from './provider-observations.js';
import { classifyLeakAddress } from './leak-classifier.js';
import { runWebRtcStress } from './webrtc-stress.js';
import { runWebRtcMediaPermissionTest } from './webrtc-media-test.js';
import { buildGuidedLeakReport } from './leak-report.js';
import { renderGuidedLeak, renderGuidedTimer } from './guided-leak-render.js';
import { renderMediaWebRtc, renderMediaWebRtcTimer } from './webrtc-media-render.js';

function unique(values) { return [...new Set((values ?? []).filter(Boolean))]; }
function hasAddresses(bucket) { return (bucket?.[4]?.length ?? 0) > 0 || (bucket?.[6]?.length ?? 0) > 0; }
function matchingFamilies(profile, captured) {
  return [4, 6].filter((family) => (captured?.[family] ?? []).some((address) => (profile.knownReal?.[family] ?? []).includes(address)));
}

export function createGuidedAppRuntime({
  storage,
  networkConfig,
  document,
  navigator,
  runWebRtcTest,
  runHttpInspection,
  runTlsFingerprint,
  ensureCore,
  startStress,
  stopStress,
  getStressState,
  onChange = () => {}
}) {
  const store = createGuidedLeakProfileStore({ storage });
  let profile = store.load();
  let captures = { real: null, vpn: null };
  let media = null;
  let mediaRun = { running: false, startedAtMs: null, completedAtMs: null };
  let observations = [];
  let busy = false;
  let vpnUnconfirmed = false;
  let stressIsGuided = false;

  const elements = {
    step: document.querySelector('#guided-step'),
    instructions: document.querySelector('#guided-instructions'),
    real: document.querySelector('#guided-real'),
    vpn: document.querySelector('#guided-vpn'),
    primary: document.querySelector('#guided-primary'),
    secondary: document.querySelector('#guided-secondary'),
    result: document.querySelector('#guided-result'),
    exposures: document.querySelector('#guided-exposures'),
    paths: document.querySelector('#guided-paths'),
    coverage: document.querySelector('#guided-coverage'),
    summaryStatus: document.querySelector('#guided-test-summary-status'),
    timer: document.querySelector('#guided-timer'),
    progressBar: document.querySelector('#guided-progress-bar')
  };
  const mediaElements = {
    summaryStatus: document.querySelector('#webrtc-test-summary-status'),
    baseline: document.querySelector('#media-webrtc-baseline'),
    timer: document.querySelector('#media-webrtc-timer'),
    status: document.querySelector('#media-webrtc-status'),
    result: document.querySelector('#media-webrtc-result')
  };
  const clearButton = document.querySelector('#guided-clear');
  const mediaWebRtcButton = document.querySelector('#media-webrtc-button');

  function stressCoverage(state = getStressState?.()) {
    const webRtcSessionsCompleted = unique(observations.filter((item) => item.transportClass === 'webrtc-stress' && item.status === 'complete').map((item) => item.sessionId)).length;
    const transportClassesReached = unique(observations.filter((item) => item.status === 'complete' || item.successful).map((item) => item.transportClass)).length;
    const reconnectHttpAttempts = state?.reconnectBurst?.completedOffsets?.length ?? 0;
    return { ...(state?.coverage ?? {}), webRtcSessionsCompleted, transportClassesReached, reconnectHttpAttempts };
  }

  function mediaClassifications() {
    const result = [];
    for (const candidate of media?.newlyVisible ?? []) {
      if (!candidate?.address) continue;
      const classification = classifyLeakAddress(candidate.address, profile);
      if (!['known-real', 'known-vpn', 'unknown-public'].includes(classification.relation)) continue;
      result.push({
        address: candidate.address,
        family: candidate.family,
        relation: classification.relation,
        candidate
      });
    }
    return result;
  }

  function mediaExposures() {
    return mediaClassifications()
      .filter((item) => ['known-real', 'unknown-public'].includes(item.relation))
      .map((item) => ({
        key: `media|${item.family}|${item.address}`,
        address: item.address,
        family: item.family,
        relation: item.relation,
        confirmationLevel: item.relation === 'known-real' ? 'known-real' : 'unconfirmed-unknown',
        observationCount: 1,
        channels: ['webrtc-media'],
        transportClasses: ['webrtc-media'],
        sources: ['Media-permission WebRTC'],
        providerGroups: [],
        perChannelCounts: { 'webrtc-media': 1 },
        firstDetector: 'Media-permission WebRTC',
        approxExposureMs: null
      }));
  }

  function getReport() {
    const state = stressIsGuided ? (getStressState?.() ?? null) : null;
    const aggressive = state ? { ...state, coverage: stressCoverage(state), exposures: [...(state.exposures ?? []), ...mediaExposures()] } : { exposures: mediaExposures(), coverage: { sufficient: false } };
    return buildGuidedLeakReport({ profile, captures, aggressive, media, observations });
  }

  function getFindings() {
    const report = getReport();
    const verdict = report.verdict;
    const mediaOnly = Boolean(media && !stressIsGuided);
    if (verdict.result === 'real-leak') return report.exposures.filter((item) => item.relation === 'known-real').map((item) => ({
      id: `${mediaOnly ? 'webrtc-media-real' : 'guided-real'}-${item.family}-${item.address}`,
      severity: 'leak', category: 'guided', summary: mediaOnly ? `Known real IPv${item.family} exposed through WebRTC` : `Known real IPv${item.family} exposed`,
      details: `${item.address} · ${(item.sources ?? []).join(', ') || 'guided test'}`, sources: ['guided-test', ...(item.channels ?? [])]
    }));
    if (verdict.result === 'unexpected-leak') return [{ id: 'guided-unexpected-public', severity: 'leak', category: 'guided', summary: 'Unexpected public IP confirmed', details: verdict.reasons.join(' '), sources: ['guided-test'] }];
    if (verdict.result === 'review') return [{
      id: mediaOnly ? 'webrtc-media-review' : 'guided-review', severity: 'review', category: 'guided',
      summary: mediaOnly ? 'Unexpected public WebRTC IP observed' : 'Guided leak test needs review',
      details: verdict.reasons.join(' '), sources: [mediaOnly ? 'webrtc-media' : 'guided-test']
    }];
    if (verdict.result === 'inconclusive' && profile.step === 'stress' && stressIsGuided) return [{ id: 'guided-inconclusive', severity: 'review', category: 'guided', summary: 'Guided leak test was inconclusive', details: verdict.reasons.join(' '), sources: ['guided-test'] }];
    return [];
  }

  function viewModel() {
    const report = getReport();
    const stressState = stressIsGuided ? (getStressState?.() ?? null) : null;
    return {
      step: profile.step,
      profile,
      busy,
      vpnUnconfirmed,
      stressIsGuided,
      stressState,
      verdict: stressIsGuided ? report.verdict : null,
      exposures: stressIsGuided ? report.exposures : [],
      paths: stressIsGuided ? report.paths : [],
      coverage: stressIsGuided ? report.coverage : null
    };
  }

  function mediaViewModel() {
    return { profile, media, mediaRun, mediaClassifications: mediaClassifications() };
  }

  function notify() {
    renderGuidedLeak(elements, viewModel());
    renderMediaWebRtc(mediaElements, mediaViewModel());
    if (mediaWebRtcButton) mediaWebRtcButton.disabled = busy || getStressState?.()?.status === 'running';
    onChange({ report: getReport(), findings: getFindings(), profile });
  }

  async function collectFamily(family, trigger = 'guided-capture') {
    const result = await collectProviderObservations({ family, providers: networkConfig.ipProviders[family], timeoutMs: networkConfig.requestTimeoutMs, trigger });
    observations.push(...result.map((item) => ({ ...item, transportClass: 'http' })));
    return result;
  }

  async function sampleStunCapture() {
    const rows = await Promise.all(networkConfig.stunDestinations.map(async (destination) => ({
      server: destination.urls[0], group: destination.group,
      result: await runWebRtcTest({ stunUrls: destination.urls, timeoutMs: networkConfig.webrtcTimeoutMs })
    })));
    for (const row of rows) {
      for (const candidate of row.result?.candidates ?? []) {
        if (candidate.classification !== 'public') continue;
        observations.push({ status: 'complete', successful: true, address: candidate.address, family: candidate.family, serverId: row.server, providerLabel: row.server.replace(/^stun:/, ''), providerGroup: row.group, transportClass: 'stun', timestampMs: Date.now() });
      }
    }
    return rows;
  }

  async function captureCurrent() {
    return captureGuidedConnection({
      collectFamily,
      sampleStun: sampleStunCapture,
      sampleEcho: async () => {
        const result = await runHttpInspection({ endpoint: networkConfig.httpEchoEndpoint, timeoutMs: networkConfig.advancedTimeoutMs });
        if (result?.observedIp) observations.push({ status: 'complete', successful: true, address: result.observedIp, family: result.observedIp.includes(':') ? 6 : 4, providerId: 'http-echo', providerLabel: 'HTTP echo', transportClass: 'echo', timestampMs: Date.now() });
        return result;
      },
      sampleTls: async () => {
        const result = await runTlsFingerprint({ endpoint: networkConfig.tlsReflectorEndpoint, timeoutMs: networkConfig.fingerprintTimeoutMs });
        if (result?.observedIp) observations.push({ status: 'complete', successful: true, address: result.observedIp, family: result.observedIp.includes(':') ? 6 : 4, providerId: 'tls-reflector', providerLabel: 'TLS reflector', transportClass: 'tls', timestampMs: Date.now() });
        return result;
      }
    });
  }

  async function handlePrimary() {
    if (busy || getStressState?.()?.status === 'running') return;
    if (profile.step === 'stress') {
      await ensureCore?.();
      observations = [];
      media = null;
      mediaRun = { running: false, startedAtMs: null, completedAtMs: null };
      stressIsGuided = true;
      await startStress?.(profile, (items) => { observations.push(...items); }, () => notify());
      notify();
      return;
    }
    busy = true; notify();
    try {
      const capture = await captureCurrent();
      if (profile.step === 'real') {
        captures.real = capture;
        if (hasAddresses(capture.trusted)) {
          profile = store.update((current) => ({ ...current, step: 'vpn', knownReal: capture.trusted, knownVpn: { 4: [], 6: [] }, capturedAt: { ...current.capturedAt, real: capture.capturedAt }, explicitContinue: { 4: false, 6: false } }));
          vpnUnconfirmed = false;
        }
      } else {
        captures.vpn = capture;
        const matching = matchingFamilies(profile, capture.trusted);
        vpnUnconfirmed = matching.length > 0;
        profile = store.update((current) => ({ ...current, step: matching.length ? 'vpn' : 'stress', knownVpn: capture.trusted, capturedAt: { ...current.capturedAt, vpn: capture.capturedAt }, explicitContinue: { 4: false, 6: false } }));
      }
    } finally { busy = false; notify(); }
  }

  function handleContinue() {
    if (profile.step !== 'vpn' || !vpnUnconfirmed) return;
    const matching = matchingFamilies(profile, profile.knownVpn);
    profile = store.update((current) => ({ ...current, step: 'stress', explicitContinue: { 4: matching.includes(4), 6: matching.includes(6) } }));
    vpnUnconfirmed = false;
    notify();
  }

  function handleClear() {
    if (stressIsGuided && getStressState?.()?.status === 'running') stopStress?.();
    profile = store.clear();
    captures = { real: null, vpn: null };
    media = null;
    mediaRun = { running: false, startedAtMs: null, completedAtMs: null };
    observations = [];
    busy = false;
    vpnUnconfirmed = false;
    stressIsGuided = false;
    notify();
  }

  async function handleMedia() {
    if (busy || getStressState?.()?.status === 'running' || mediaRun.running) return;
    busy = true;
    mediaRun = { running: true, startedAtMs: Date.now(), completedAtMs: null };
    notify();
    try {
      const getUserMedia = navigator.mediaDevices?.getUserMedia ? (constraints) => navigator.mediaDevices.getUserMedia(constraints) : null;
      const runStress = () => runWebRtcStress({ destinations: networkConfig.stunDestinations, timeoutMs: networkConfig.webrtcTimeoutMs, trigger: 'media-permission' });
      media = await runWebRtcMediaPermissionTest({ getUserMedia, runBefore: runStress, runAfter: runStress });
      for (const candidate of media?.after?.candidates ?? []) {
        observations.push({ status: 'complete', successful: true, address: candidate.address, family: candidate.family, serverId: candidate.serverId, providerLabel: candidate.serverLabel ?? 'Media WebRTC', providerGroup: candidate.serverGroup, transportClass: 'webrtc-media', timestampMs: candidate.timestampMs ?? Date.now(), sessionId: candidate.sessionId });
      }
    } finally {
      mediaRun = { running: false, startedAtMs: mediaRun.startedAtMs, completedAtMs: Date.now() };
      busy = false;
      notify();
    }
  }

  elements.primary?.addEventListener('click', handlePrimary);
  elements.secondary?.addEventListener('click', handleContinue);
  clearButton?.addEventListener('click', handleClear);
  mediaWebRtcButton?.addEventListener('click', handleMedia);
  notify();

  return {
    getProfile: () => profile,
    getReport,
    getFindings,
    isGuidedStress: () => stressIsGuided,
    hasPresentationTimer: () => (stressIsGuided && getStressState?.()?.status === 'running') || mediaRun.running,
    renderTimer(nowMs = Date.now()) {
      renderGuidedTimer(elements, viewModel(), nowMs);
      renderMediaWebRtcTimer(mediaElements, mediaViewModel(), nowMs);
    },
    recordObservations(items) { observations.push(...(items ?? [])); notify(); },
    handleStressUpdate() { notify(); },
    clear: handleClear,
    render: notify
  };
}
