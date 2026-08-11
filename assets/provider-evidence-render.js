import { buildIpProviderEvidence } from './provider-evidence.js';

function add(parent, tag, text, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  parent.append(node);
  return node;
}

function relationLabel(relation) {
  return relation === 'agrees' ? 'agrees'
    : relation === 'not-needed' ? 'not needed'
      : relation;
}

function renderAttempts(parent, attempts = []) {
  if (attempts.length <= 1) return;
  const list = document.createElement('div');
  list.className = 'provider-attempt-list';
  for (const attempt of attempts) {
    const row = document.createElement('div');
    row.className = 'provider-attempt-row';
    add(row, 'span', attempt.endpointId ?? 'endpoint', 'provider-attempt-name');
    const value = attempt.status === 'complete'
      ? `${attempt.address ?? 'success'} · success`
      : attempt.status === 'not-needed'
        ? `${attempt.error ?? 'Not needed'} · not needed`
        : `${attempt.error ?? 'Unavailable'} · unavailable`;
    add(row, 'span', value, 'provider-attempt-value');
    list.append(row);
  }
  parent.append(list);
}

function renderSourceRows(parent, title, rows) {
  const block = document.createElement('div');
  block.className = 'provider-tier';
  add(block, 'h5', title, 'provider-tier-title');
  const list = document.createElement('div');
  list.className = 'provider-source-list';
  if (!rows.length) add(list, 'span', 'None', 'card-detail');
  for (const source of rows) {
    const wrap = document.createElement('div');
    wrap.className = 'provider-source-wrap';
    const row = document.createElement('div');
    row.className = `provider-source-row provider-source-${source.relation}`;
    add(row, 'span', source.label, 'provider-source-name');
    const value = source.relation === 'not-needed'
      ? source.error ?? 'Consensus already guaranteed'
      : source.address ?? source.error ?? 'Unavailable';
    add(row, 'span', value, 'provider-source-address');
    add(row, 'span', relationLabel(source.relation), 'provider-source-relation');
    add(row, 'span', source.latencyMs == null || source.relation === 'not-needed' ? '—' : `${Math.round(source.latencyMs)} ms`, 'provider-source-latency');
    wrap.append(row);
    renderAttempts(wrap, source.attempts);
    list.append(wrap);
  }
  block.append(list);
  parent.append(block);
}

export function renderIpProviderEvidence(parent, result) {
  if (!parent || !result) return null;
  const view = buildIpProviderEvidence(result);
  const section = document.createElement('section');
  section.className = 'provider-evidence';
  add(section, 'h4', 'Public IP sources', 'provider-evidence-title');

  const overview = document.createElement('div');
  overview.className = 'detail-list provider-evidence-overview';
  for (const [label, value] of [
    ['Selected IP', view.selectedAddress ?? 'No authoritative address'],
    ['Confidence', view.confidence === 'no-consensus' ? 'No consensus' : view.confidence === 'strong' ? 'Strong consensus' : view.confidence === 'partial' ? 'Partial' : 'Unavailable'],
    ['Agreement', view.summary],
    ['Primary groups', `${view.primary.available}/${view.primary.total} responded`]
  ]) {
    const row = document.createElement('div');
    row.className = 'detail-row';
    add(row, 'span', label, 'detail-label');
    add(row, 'span', value, 'detail-value');
    overview.append(row);
  }
  section.append(overview);

  renderSourceRows(section, 'Primary', view.primary.rows);
  renderSourceRows(section, 'Reserve', view.reserve.rows);
  parent.append(section);
  return section;
}
