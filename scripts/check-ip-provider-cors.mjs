import { ipProviderSmokeCandidates } from '../assets/config.js';

const originArg = process.argv.find((arg) => arg.startsWith('--origin='));
const origin = originArg?.split('=').slice(1).join('=') || 'https://pigalev.github.io';
const strict = process.argv.includes('--strict');

function familyOf(value) {
  if (typeof value !== 'string') return null;
  const address = value.trim();
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address)) return 4;
  if (address.includes(':')) return 6;
  return null;
}

function extractAddress(payload) {
  if (typeof payload === 'string') return payload.trim();
  return payload?.ip ?? payload?.address ?? null;
}

const rows = [];
for (const group of ipProviderSmokeCandidates) {
  for (const endpoint of group.endpoints) {
    const row = {
      group: group.group,
      label: group.label,
      tier: group.tier,
      configuredEnabled: group.enabled !== false,
      family: group.family,
      endpointId: endpoint.id,
      url: endpoint.url,
      ok: false,
      cors: false,
      address: null,
      observedFamily: null,
      status: null,
      error: null
    };
    try {
      const response = await fetch(endpoint.url, {
        headers: {
          Origin: origin,
          'User-Agent': 'Mozilla/5.0 check-vpn provider smoke',
          ...(endpoint.kind === 'text' ? {} : { Accept: 'application/json' })
        },
        redirect: 'follow'
      });
      row.status = response.status;
      const allowOrigin = response.headers.get('access-control-allow-origin');
      row.cors = allowOrigin === '*' || allowOrigin === origin;
      const payload = endpoint.kind === 'text' ? await response.text() : await response.json();
      row.address = extractAddress(payload);
      row.observedFamily = familyOf(row.address);
      row.ok = response.ok && row.cors && row.observedFamily === group.family;
      if (!response.ok) row.error = `HTTP ${response.status}`;
      else if (!row.cors) row.error = `CORS missing for ${origin}`;
      else if (row.observedFamily !== group.family) row.error = `Expected IPv${group.family}, got ${row.address ?? 'no address'}`;
    } catch (error) {
      row.error = error?.message ?? 'Request failed';
    }
    rows.push(row);
    console.log(JSON.stringify(row));
  }
}

if (strict && rows.some((row) => row.configuredEnabled && !row.ok)) process.exitCode = 1;
