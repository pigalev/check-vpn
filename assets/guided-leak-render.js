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

export function renderGuidedLeak(elements, viewModel = {}) {
  const {
    step, instructions, real, vpn, primary, secondary, result, exposures, paths, coverage,
    mediaStatus, mediaResult
  } = elements;
  const currentStep = viewModel.step ?? 'real';
  const profile = viewModel.profile ?? {};

  if (step) step.textContent = currentStep === 'real' ? 'Step 1 of 3' : currentStep === 'vpn' ? 'Step 2 of 3' : 'Step 3 of 3';
  if (instructions) {
    instructions.textContent = currentStep === 'real'
      ? 'Turn VPN off, then capture your real connection.'
      : currentStep === 'vpn'
        ? 'Turn VPN on, wait for it to connect, then capture the VPN connection.'
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

  clear(result);
  if (viewModel.verdict) {
    const label = add(result, getGuidedResultLabel(viewModel.verdict), `guided-verdict guided-verdict-${viewModel.verdict.result}`);
    label?.setAttribute('data-result', viewModel.verdict.result);
    for (const reason of viewModel.verdict.reasons ?? []) add(result, reason, 'guided-reason');
  }

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
