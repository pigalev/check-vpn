import { buildIpProviderEvidence } from './provider-evidence.js';

function add(parent, tag, text, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  parent.append(node);
  return node;
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
    ['Consensus IP', view.selectedAddress ?? 'Unavailable'],
    ['Agreement', view.summary],
    ['Different values', String(view.differentValues)]
  ]) {
    const row = document.createElement('div');
    row.className = 'detail-row';
    add(row, 'span', label, 'detail-label');
    add(row, 'span', value, 'detail-value');
    overview.append(row);
  }
  section.append(overview);

  const list = document.createElement('div');
  list.className = 'provider-source-list';
  for (const source of view.sources) {
    const row = document.createElement('div');
    row.className = `provider-source-row provider-source-${source.relation}`;
    add(row, 'span', source.label, 'provider-source-name');
    add(row, 'span', source.address ?? source.error ?? 'Unavailable', 'provider-source-address');
    add(row, 'span', source.relation === 'consensus' ? 'agrees' : source.relation, 'provider-source-relation');
    add(row, 'span', source.latencyMs == null ? '—' : `${Math.round(source.latencyMs)} ms`, 'provider-source-latency');
    list.append(row);
  }
  section.append(list);
  parent.append(section);
  return section;
}
