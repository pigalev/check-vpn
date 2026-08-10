import { buildMediaWebRtcTestView } from './active-test-view.js';

function clear(node) { node?.replaceChildren?.(); }
function add(parent, value, className = '') {
  if (!parent) return null;
  const node = document.createElement('div');
  if (className) node.className = className;
  node.textContent = value;
  parent.append(node);
  return node;
}

function buildView(viewModel, nowMs) {
  return buildMediaWebRtcTestView({
    profile: viewModel.profile,
    media: viewModel.media,
    mediaRun: viewModel.mediaRun,
    mediaExposures: viewModel.mediaClassifications
  }, nowMs);
}

function renderResult(parent, view, media) {
  clear(parent);
  if (!parent || !view.resultLabel) return;
  const panel = document.createElement('div');
  panel.className = `test-result-panel test-result-${view.resultTone ?? 'neutral'}`;
  add(panel, 'RESULT', 'test-result-kicker');
  add(panel, view.resultLabel, 'test-result-title');
  if (view.resultMessage) add(panel, view.resultMessage, 'test-result-message');
  parent.append(panel);

  for (const candidate of media?.newlyVisible ?? []) {
    const evidence = document.createElement('div');
    evidence.className = 'webrtc-media-evidence';
    add(evidence, candidate.address ?? 'Unknown address', 'webrtc-media-address');
    add(evidence, `${candidate.classification ?? 'unknown'} · ${(candidate.protocol ?? 'unknown').toUpperCase()}`, 'guided-meta');
    parent.append(evidence);
  }
}

export function renderMediaWebRtcTimer(elements, viewModel = {}, nowMs = Date.now()) {
  const view = buildView(viewModel, nowMs);
  if (elements.summaryStatus) elements.summaryStatus.textContent = view.summaryStatus;
  if (elements.timer) elements.timer.textContent = view.phase === 'running' ? view.elapsedText ?? '' : '';
  return view;
}

export function renderMediaWebRtc(elements, viewModel = {}, nowMs = Date.now()) {
  const view = renderMediaWebRtcTimer(elements, viewModel, nowMs);
  if (elements.baseline) {
    clear(elements.baseline);
    add(elements.baseline, view.baselineMode === 'guided' ? 'Baseline: Guided VPN Leak Test' : 'Standalone mode', 'test-baseline-title');
    add(elements.baseline, view.baselineMessage, 'test-baseline-message');
    if (view.baselineMode === 'standalone') add(elements.baseline, 'Run Guided VPN Leak Test first for stronger Known Real / Known VPN classification.', 'test-baseline-hint');
  }
  if (elements.status) elements.status.textContent = viewModel.mediaRun?.running ? 'Running WebRTC permission check' : viewModel.media?.status ? `WebRTC permission check: ${viewModel.media.status}` : 'Not run';
  renderResult(elements.result, view, viewModel.media);
  return view;
}
