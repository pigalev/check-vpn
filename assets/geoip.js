import { fetchJsonWithTimeout } from './network.js';

function emptyResult(ip, status, error) {
  return {
    status,
    ip,
    countryCode: null,
    country: null,
    region: null,
    city: null,
    asn: null,
    org: null,
    timezone: null,
    error
  };
}

export function buildGeoIpUrl(template, ip) {
  return template.replace('{ip}', encodeURIComponent(ip));
}

export function normalizeGeoIp(payload, expectedIp) {
  if (!payload || typeof payload !== 'object' || payload.error === true) {
    return emptyResult(expectedIp, 'error', 'Location lookup failed.');
  }

  return {
    status: 'complete',
    ip: expectedIp,
    countryCode: typeof payload.country_code === 'string' ? payload.country_code : null,
    country: typeof payload.country_name === 'string' ? payload.country_name : null,
    region: typeof payload.region === 'string' ? payload.region : null,
    city: typeof payload.city === 'string' ? payload.city : null,
    asn: typeof payload.asn === 'string' ? payload.asn : null,
    org: typeof payload.org === 'string' ? payload.org : null,
    timezone: typeof payload.timezone === 'string' ? payload.timezone : null,
    error: null
  };
}

export async function runGeoIpLookup({ ip, urlTemplate, timeoutMs, fetchImpl = fetch }) {
  try {
    const payload = await fetchJsonWithTimeout(buildGeoIpUrl(urlTemplate, ip), { timeoutMs, fetchImpl });
    return normalizeGeoIp(payload, ip);
  } catch (error) {
    const unavailable = error?.name === 'AbortError' || error instanceof TypeError;
    return emptyResult(
      ip,
      unavailable ? 'unavailable' : 'error',
      unavailable ? 'Location unavailable.' : 'Location lookup failed.'
    );
  }
}
