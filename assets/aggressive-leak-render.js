function clear(node) { node?.replaceChildren?.(); }
function appendText(parent, text, className) {
  if (!parent) return null;
  const node = document.createElement('div');
  if (className) node.className = className;
  node.textContent = text;
  parent.append(node);
  return node;
}

function formatMs(ms) {
  if (!Number.isFinite(ms)) return 'Unknown';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `~${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s`;
}

function resultLabel(state) {
  if (state.status === 'running') return 'Running';
  return state.resultLabel ?? (state.result === 'leak' ? 'Leak detected' : state.result === 'clean' ? 'No unexpected IP observed' : state.result === 'inconclusive' ? 'Inconclusive' : 'Not running');
}

export function renderAggressiveLeakTest(elements, state, nowMs = Date.now()) {
  const { toggle, status, progress, summary, timeline, exposures } = elements;
  if (!state) return;
  if (toggle) toggle.textContent = state.status === 'running' ? 'Stop test' : 'Start 60s test';
  if (status) {
    status.textContent = resultLabel(state);
    status.dataset.status = state.result ?? state.status;
  }

  clear(progress);
  if (state.status === 'running') {
    const remaining = Math.max(0, (state.endsAt ?? nowMs) - nowMs);
    appendText(progress, `${Math.ceil(remaining / 1000)} s remaining`, 'aggressive-remaining');
  } else if (state.coverage) {
    appendText(progress, `Coverage: ${state.coverage.successfulHttpSamples}/${state.coverage.attemptedFastSamples} successful HTTP observations · largest gap ${formatMs(state.coverage.largestGapMs)}`, 'aggressive-coverage');
  }

  clear(summary);
  if (state.resultLabel) appendText(summary, state.resultLabel, `aggressive-result aggressive-result-${state.result ?? 'unknown'}`);
  for (const reason of state.reasons ?? []) appendText(summary, reason, 'aggressive-reason');

  clear(exposures);
  for (const exposure of state.exposures ?? []) {
    const card = document.createElement('article');
    card.className = 'aggressive-exposure';
    const address = appendText(card, exposure.address, 'aggressive-address');
    address?.setAttribute('data-family', `ipv${exposure.family}`);
    appendText(card, exposure.explanation ?? exposure.reason ?? 'Unexpected public IP', 'aggressive-explanation');
    appendText(card, `Sources: ${(exposure.sources ?? []).join(', ') || 'Unknown'}`, 'aggressive-sources');
    const restored = exposure.baselineRestoredAtMs != null ? ' · baseline restored' : '';
    appendText(card, `First seen ${new Date(exposure.firstSeenAtMs).toLocaleTimeString()} · observed ${formatMs(exposure.approxExposureMs)}${restored}`, 'aggressive-timing');
    const network = [exposure.intelligence?.asn ?? exposure.geo?.asn, exposure.intelligence?.organization ?? exposure.geo?.org, exposure.geo?.countryCode].filter(Boolean).join(' · ');
    if (network) appendText(card, network, 'aggressive-network');
    exposures.append(card);
  }

  clear(timeline);
  const events = [
    ...(state.networkEvents ?? []).map((event) => ({ timestampMs: event.timestampMs, text: `Network: ${event.type}` })),
    ...(state.samples ?? []).filter((sample) => sample.successful && sample.address).map((sample) => ({ timestampMs: sample.timestampMs, text: `${sample.source}: ${sample.address}` }))
  ].sort((a, b) => b.timestampMs - a.timestampMs).slice(0, 40);
  for (const event of events) appendText(timeline, `${new Date(event.timestampMs).toLocaleTimeString()} · ${event.text}`, 'monitor-event');
}
