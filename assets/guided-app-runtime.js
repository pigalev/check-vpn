import { createGuidedLeakProfileStore } from './guided-leak-profile.js';
import { captureGuidedConnection } from './guided-leak-capture.js';
import { collectProviderObservations } from './provider-observations.js';
import { classifyLeakAddress } from './leak-classifier.js';
import { runWebRtcStress } from './webrtc-stress.js';
import { runWebRtcMediaPermissionTest } from './webrtc-media-test.js';
import { buildGuidedLeakReport } from './leak-report.js';
import { renderGuidedLeak } from './guided-leak-render.js';

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
    mediaStatus: document.querySelector('#media-webrtc-status'),
    mediaResult: document.querySelector('#media-webrtc-result')
  };
  const clearButton = document.querySelector('#guided-clear');
  const mediaWebRtcButton = document.querySelector('#media-webrtc-button');

  function stressCoverage(state = getStressState?.()) {
    const webRtcSessionsCompleted = unique(observations.filter((item) => item.transportClass === 'webrtc-stress' && item.status === 'complete').map((item) => item.sessionId)).length;
    const transportClassesReached = unique(observations.filter((item) => item.status === 'complete' || item.successful).map((item) => item.transportClass)).length;
    const reconnectHttpAttempts = state?.reconnectBurst?.completedOffsets?.length ?? 0;
    return { ...(state?.coverage ?? {}), webRtcSessionsCompleted, transportClassesReached, reconnectHttpAttempts };
  }

  function mediaExposures() {
    const result = [];
    for (const candidate of media?.newlyVisible ?? []) {
      const classification = classifyLeakAddress(candidate.address, profile);
      if (!['known-real', 'unknown-public'].includes(classification.relation)) continue;
      result.push({
        key: `media|${candidate.family}|${candidate.address}`,
        address: candidate.address,
        family: candidate.family,
        relation: classification.relation,
        confirmationLevel: classification.relation === 'known-real' ? 'known-real' : 'unconfirmed-unknown',
        observationCount: 1,
        channels: ['webrtc-media'],
        transportClasses: ['webrtc-media'],
        sources: ['Media-permission WebRTC'],
        providerGroups: [],
        perChannelCounts: { 'webrtc-media': 1 },
        firstDetector: 'Media-permission WebRTC',
        approxExposureMs: null
      });
    }
    return result;
  }

  function getReport() {
    const state = stressIsGuided ? (getStressState?.() ?? null) : null;
    const aggressive = state ? { ...state, coverage: stressCoverage(state), exposures: [...(state.exposures ?? []), ...mediaExposures()] } : { exposures: mediaExposures(), coverage: { sufficient: false } };
    return buildGuidedLeakReport({ profile, captures, aggressive, media, observations });
  }

  function getFindings() {
    const report = getReport();
    const verdict = report.verdict;
    if (verdict.result === 'real-leak') return report.exposures.filter((item) => item.relation === 'known-real').map((item) => ({
      id: `guided-real-${item.family}-${item.address}`,
      severity: 'leak', category: 'guided', summary: `Known real IPv${item.family} exposed`,
      details: `${item.address} · ${(item.sources ?? []).join(', ') || 'guided test'}`, sources: ['guided-test', ...(item.channels ?? [])]
    }));
    if (verdict.result === 'unexpected-leak') return [{ id: 'guided-unexpected-public', severity: 'leak', category: 'guided', summary: 'Unexpected public IP confirmed', details: verdict.reasons.join(' '), sources: ['guided-test'] }];
    if (verdict.result === 'review') return [{ id: 'guided-review', severity: 'review', category: 'guided', summary: 'Guided leak test needs review', details: verdict.reasons.join(' '), sources: ['guided-test'] }];
    if (verdict.result === 'inconclusive' && profile.step === 'stress' && stressIsGuided) return [{ id: 'guided-inconclusive', severity: 'review', category: 'guided', summary: 'Guided leak test was inconclusive', details: verdict.reasons.join(' '), sources: ['guided-test'] }];
    return [];
  }

  function viewModel() {
    const report = getReport();
    return {
      step: profile.step,
      profile,
      busy,
      vpnUnconfirmed,
      verdict: (stressIsGuided || media) ? report.verdict : null,
      exposures: report.exposures,
      paths: report.paths,
      coverage: stressIsGuided ? report.coverage : null,
      media
    };
  }

  function notify() {
    renderGuidedLeak(elements, viewModel());
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
    if (busy) return;
    if (profile.step === 'stress') {
      await ensureCore?.();
      observations = [];
      media = null;
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
    observations = [];
    busy = false;
    vpnUnconfirmed = false;
    stressIsGuided = false;
    notify();
  }

  async function handleMedia() {
    if (busy || getStressState?.()?.status === 'running') return;
    busy = true; notify();
    try {
      const getUserMedia = navigator.mediaDevices?.getUserMedia ? (constraints) => navigator.mediaDevices.getUserMedia(constraints) : null;
      const runStress = () => runWebRtcStress({ destinations: networkConfig.stunDestinations, timeoutMs: networkConfig.webrtcTimeoutMs, trigger: 'media-permission' });
      media = await runWebRtcMediaPermissionTest({ getUserMedia, runBefore: runStress, runAfter: runStress });
      for (const candidate of media?.after?.candidates ?? []) {
        observations.push({ status: 'complete', successful: true, address: candidate.address, family: candidate.family, serverId: candidate.serverId, providerLabel: candidate.serverLabel ?? 'Media WebRTC', providerGroup: candidate.serverGroup, transportClass: 'webrtc-media', timestampMs: candidate.timestampMs ?? Date.now(), sessionId: candidate.sessionId });
      }
    } finally { busy = false; notify(); }
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
    recordObservations(items) { observations.push(...(items ?? [])); notify(); },
    handleStressUpdate() { notify(); },
    clear: handleClear,
    render: notify
  };
}
