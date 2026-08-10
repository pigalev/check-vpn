import { buildGuidedTestView } from './active-test-view.js';

function clear(node) { node?.replaceChildren?.(); }
function add(parent, text, className = '') {
  if (!parent) return null;
  const node = document.createElement('div');
  if (className) node.className = className;
  node.textContent = text;
  parent.append(node);
  return node;
}

export function getGuidedPrimaryLabel({ step = 'real', busy = false } = {}) {
  if (busy) return 'Running…';
  if (step === 'vpn') return 'Capture VPN IP';
  if (step === 'stress') return 'Start 60s stress test';
  return 'Capture real IP';
}

export function getGuidedResultLabel({ result } = {}) {
  const labels = {
    'real-leak': 'REAL IP LEAK DETECTED',
    'unexpected-leak': 'UNEXPECTED PUBLIC IP DETECTED',
    review: 'REVIEW',
    inconclusive: 'TEST INCONCLUSIVE',
    clean: 'NO KNOWN REAL IP OBSERVED'
  };
  return labels[result] ?? 'Not run';
}

function addressLine(profile, bucket, family, emptyLabel = 'Not captured') {
  const values = profile?.[bucket]?.[family] ?? [];
  return values.length ? values.join(', ') : emptyLabel;
}

function relationLabel(relation) {
  if (relation === 'known-real') return 'KNOWN REAL LEAK';
  if (relation === 'known-vpn') return 'Known VPN';
  if (relation === 'unknown-public') return 'Unexpected / review';
  return 'Not detected';
}

function guidedView(viewModel, nowMs) {
  return buildGuidedTestView({
    profile: viewModel.profile ?? { step: viewModel.step ?? 'real' },
    stressState: viewModel.stressState ?? null,
    stressIsGuided: viewModel.stressIsGuided === true,
    verdict: viewModel.verdict ?? null
  }, nowMs);
}

function renderResultPanel(parent, view) {
  clear(parent);
  if (!parent || !view?.resultLabel) return;
  const panel = document.createElement('div');
  panel.className = `test-result-panel test-result-${view.resultTone ?? 'neutral'}`;
  add(panel, 'RESULT', 'test-result-kicker');
  const title = add(panel, view.resultLabel, 'test-result-title');
  title?.setAttribute('data-result', view.resultTone ?? 'neutral');
  if (view.resultMessage) add(panel, view.resultMessage, 'test-result-message');
  parent.append(panel);
}

export function renderGuidedTimer(elements, viewModel = {}, nowMs = Date.now()) {
  const view = guidedView(viewModel, nowMs);
  if (elements.summaryStatus) elements.summaryStatus.textContent = view.summaryStatus;
  if (elements.timer) {
    elements.timer.textContent = view.remainingText ?? (view.phase === 'preparing' ? 'Preparing baseline…' : '');
  }
  if (elements.progressBar) elements.progressBar.style.width = `${Math.round((view.progress ?? 0) * 100)}%`;
  return view;
}

export function renderGuidedLeak(elements, viewModel = {}, nowMs = Date.now()) {
  const {
    step, instructions, real, vpn, primary, secondary, result, exposures, paths, coverage,
    mediaStatus, mediaResult
  } = elements;
  const currentStep = viewModel.step ?? 'real';
  const profile = viewModel.profile ?? {};
  const view = renderGuidedTimer(elements, viewModel, nowMs);

  if (step) step.textContent = currentStep === 'real' ? 'Step 1 of 3' : currentStep === 'vpn' ? 'Step 2 of 3' : 'Step 3 of 3';
  if (instructions) {
    instructions.textContent = currentStep === 'real'
      ? 'Turn VPN off, then capture your real connection.'
      : currentStep === 'vpn'
        ? 'Turn VPN on, wait for it to connect, then capture the VPN connection.'
        : view.phase === 'preparing'
          ? 'Preparing baseline checks. The 60-second observation window starts after this finishes.'
          : view.phase === 'running'
            ? 'Keep the VPN connected and reproduce the transition during the 60-second stress test.'
            : 'Keep the VPN connected and run the 60-second stress test.';
  }
  if (primary) {
    primary.textContent = getGuidedPrimaryLabel({ step: currentStep, busy: viewModel.busy });
    primary.disabled = viewModel.busy === true;
  }
  if (secondary) {
    secondary.hidden = !(currentStep === 'vpn' && viewModel.vpnUnconfirmed);
    secondary.textContent = 'Continue anyway';
    secondary.disabled = viewModel.busy === true;
  }

  clear(real);
  add(real, 'Real connection', 'guided-card-title');
  add(real, `IPv4 · ${addressLine(profile, 'knownReal', 4)}`, 'guided-address');
  add(real, `IPv6 · ${addressLine(profile, 'knownReal', 6, 'Not detected')}`, 'guided-address');

  clear(vpn);
  add(vpn, 'VPN connection', 'guided-card-title');
  add(vpn, `IPv4 · ${addressLine(profile, 'knownVpn', 4)}`, 'guided-address');
  add(vpn, `IPv6 · ${addressLine(profile, 'knownVpn', 6, 'Not detected')}`, 'guided-address');
  if (viewModel.vpnUnconfirmed) add(vpn, 'VPN connection not confirmed. Current public address still matches the captured real address.', 'inline-warning');

  renderResultPanel(result, view);

  clear(exposures);
  for (const exposure of viewModel.exposures ?? []) {
    const card = document.createElement('article');
    card.className = `guided-exposure guided-exposure-${exposure.relation ?? 'unknown'}`;
    add(card, exposure.address ?? 'Unknown address', 'guided-exposure-address');
    add(card, exposure.relation === 'known-real' ? `Known real IPv${exposure.family} exposed` : 'Unexpected public IP', 'guided-exposure-title');
    add(card, `Observed ${exposure.observationCount ?? 0} time(s) · ${(exposure.channels ?? []).join(', ') || 'Unknown path'}`, 'guided-meta');
    if (exposure.approxExposureMs == null) add(card, 'Exposure duration: unknown / below sampling resolution', 'guided-meta');
    else add(card, `Observed window: ~${(exposure.approxExposureMs / 1000).toFixed(1)} s`, 'guided-meta');
    exposures.append(card);
  }

  clear(paths);
  for (const row of viewModel.paths ?? []) {
    const path = document.createElement('div');
    path.className = 'guided-path-row';
    add(path, row.label ?? row.pathId, 'guided-path-label');
    add(path, row.address ?? row.status ?? 'Unavailable', 'guided-path-address');
    add(path, relationLabel(row.relation), `guided-path-relation guided-path-${row.relation ?? 'none'}`);
    paths.append(path);
  }

  clear(coverage);
  if (viewModel.coverage) {
    add(coverage, `${viewModel.coverage.attemptedFastSamples ?? 0} scheduled HTTP cycles · ${viewModel.coverage.webRtcSessionsCompleted ?? 0} WebRTC sessions`, 'guided-meta');
    if (Number.isFinite(viewModel.coverage.largestGapMs)) add(coverage, `Largest scheduler gap: ~${(viewModel.coverage.largestGapMs / 1000).toFixed(1)} s`, 'guided-meta');
  }

  if (mediaStatus) mediaStatus.textContent = viewModel.media?.status ? `Media WebRTC: ${viewModel.media.status}` : 'Not run';
  clear(mediaResult);
  if (viewModel.media?.newlyVisible?.length) {
    for (const candidate of viewModel.media.newlyVisible) add(mediaResult, `${candidate.address} · ${candidate.classification ?? 'unknown'} · ${(candidate.protocol ?? 'unknown').toUpperCase()}`, 'guided-media-candidate');
  }
}
