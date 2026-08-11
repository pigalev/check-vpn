import { buildGeoIpEvidence } from './geoip-evidence.js';

function add(parent, tag, value, className = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = value;
  parent.append(node);
  return node;
}

function stateLabel(state) {
  return state === 'agree' ? 'Agree'
    : state === 'single-source' ? 'Single source'
      : state === 'disagree' ? 'Disagree'
        : 'Unavailable';
}

function relationLabel(label, relation) {
  if (relation === 'selected') return `${label} selected`;
  if (relation === 'differs') return `${label} differs`;
  if (relation === 'missing') return `${label} missing`;
  if (relation === 'unavailable') return 'Unavailable';
  return `${label} observed`;
}

function overviewRow(parent, label, value) {
  const row = document.createElement('div');
  row.className = 'detail-row';
  add(row, 'span', label, 'detail-label');
  add(row, 'span', value, 'detail-value');
  parent.append(row);
}

function providerValue(row) {
  const country = row.country ?? row.countryCode ?? 'Country unavailable';
  const location = [row.city, row.region].filter(Boolean).join(', ') || 'Location unavailable';
  const timezone = row.timezone ?? 'Timezone unavailable';
  return { country, location, timezone };
}

export function renderGeoIpEvidence(parent, result) {
  if (!parent || !result) return null;
  const view = buildGeoIpEvidence(result);
  const section = document.createElement('section');
  section.className = 'geoip-evidence';
  add(section, 'h4', 'GeoIP sources', 'geoip-evidence-title');

  const overview = document.createElement('div');
  overview.className = 'detail-list geoip-evidence-overview';
  overviewRow(overview, 'Selected IP', view.selectedIp ?? 'Unavailable');
  overviewRow(overview, 'Responded providers', `${view.responded}/${view.total}`);
  overviewRow(overview, 'Country state', stateLabel(view.countryState));
  overviewRow(overview, 'Location state', stateLabel(view.locationState));
  overviewRow(overview, 'Selected country', view.selectedCountry ?? 'Unavailable');
  overviewRow(overview, 'Selected location', view.selectedLocation ?? 'Unavailable');
  section.append(overview);

  const list = document.createElement('div');
  list.className = 'geoip-source-list';
  for (const row of view.rows) {
    const item = document.createElement('div');
    const differs = row.countryRelation === 'differs' || row.locationRelation === 'differs';
    item.className = `geoip-source-row${row.status !== 'complete' ? ' geoip-source-unavailable' : differs ? ' geoip-source-differs' : ''}`;
    add(item, 'strong', row.label, 'geoip-source-name');

    if (row.status !== 'complete') {
      add(item, 'span', 'Unavailable', 'geoip-source-status');
      add(item, 'span', row.error ?? 'Location unavailable.', 'geoip-source-error');
    } else {
      const values = providerValue(row);
      add(item, 'span', values.country, `geoip-source-country geoip-relation-${row.countryRelation}`);
      add(item, 'span', values.location, `geoip-source-location geoip-relation-${row.locationRelation}`);
      add(item, 'span', values.timezone, 'geoip-source-timezone');
      const network = [row.asn, row.org].filter(Boolean).join(' · ');
      if (network) add(item, 'span', network, 'geoip-source-network');
      add(item, 'span', `${relationLabel('Country', row.countryRelation)} · ${relationLabel('Location', row.locationRelation)}`, 'geoip-source-relations');
    }
    add(item, 'span', row.latencyMs == null ? '—' : `${Math.round(row.latencyMs)} ms`, 'geoip-source-latency');
    list.append(item);
  }
  section.append(list);
  parent.append(section);
  return section;
}
