import { fetchJsonWithTimeout } from './network.js';

function cleanString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeAsn(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return `AS${Math.trunc(value)}`;
  const text = cleanString(value);
  if (!text) return null;
  return /^AS\d+$/i.test(text) ? text.toUpperCase() : /^\d+$/.test(text) ? `AS${text}` : text;
}

function sourceInfo(source = {}) {
  return {
    id: cleanString(source.id) ?? 'unknown',
    label: cleanString(source.label) ?? cleanString(source.id) ?? 'Unknown'
  };
}

function emptyResult(ip, status, error, source = {}) {
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
    source: sourceInfo(source),
    error
  };
}

export function buildGeoIpUrl(template, ip) {
  return template.replace('{ip}', encodeURIComponent(ip));
}

export function normalizeGeoIp(payload, expectedIp, kind = 'ipapi', source = {}) {
  if (!payload || typeof payload !== 'object') {
    return emptyResult(expectedIp, 'error', 'Location lookup failed.', source);
  }

  let data;
  if (kind === 'ipwhois') {
    if (payload.success === false) return emptyResult(expectedIp, 'error', cleanString(payload.message) ?? 'Location lookup failed.', source);
    data = {
      countryCode: payload.country_code,
      country: payload.country,
      region: payload.region,
      city: payload.city,
      asn: payload.connection?.asn,
      org: payload.connection?.org ?? payload.connection?.isp,
      timezone: payload.timezone?.id
    };
  } else if (kind === 'freeipapi') {
    if (payload.error === true) return emptyResult(expectedIp, 'error', cleanString(payload.message) ?? 'Location lookup failed.', source);
    data = {
      countryCode: payload.countryCode,
      country: payload.countryName,
      region: payload.regionName,
      city: payload.cityName,
      asn: payload.asn,
      org: payload.asnOrganization ?? payload.organization ?? payload.isp,
      timezone: payload.timeZone
    };
  } else {
    if (payload.error === true) return emptyResult(expectedIp, 'error', cleanString(payload.reason) ?? 'Location lookup failed.', source);
    data = {
      countryCode: payload.country_code,
      country: payload.country_name,
      region: payload.region,
      city: payload.city,
      asn: payload.asn,
      org: payload.org,
      timezone: payload.timezone
    };
  }

  const countryCode = cleanString(data.countryCode)?.toUpperCase() ?? null;
  return {
    status: 'complete',
    ip: expectedIp,
    countryCode,
    country: cleanString(data.country),
    region: cleanString(data.region),
    city: cleanString(data.city),
    asn: normalizeAsn(data.asn),
    org: cleanString(data.org),
    timezone: cleanString(data.timezone),
    source: sourceInfo(source),
    error: null
  };
}

export async function runGeoIpProviderLookup({ ip, provider, timeoutMs, fetchImpl = fetch }) {
  try {
    const payload = await fetchJsonWithTimeout(buildGeoIpUrl(provider.urlTemplate, ip), { timeoutMs, fetchImpl });
    return normalizeGeoIp(payload, ip, provider.kind, provider);
  } catch (error) {
    const unavailable = error?.name === 'AbortError' || error instanceof TypeError;
    return emptyResult(
      ip,
      unavailable ? 'unavailable' : 'error',
      unavailable ? 'Location unavailable.' : 'Location lookup failed.',
      provider
    );
  }
}

function voteValue(results, field) {
  const votes = new Map();
  for (const result of results) {
    const value = result[field];
    if (value == null || value === '') continue;
    const key = String(value).trim().toLowerCase();
    const current = votes.get(key) ?? { count: 0, value };
    current.count += 1;
    votes.set(key, current);
  }
  let winner = null;
  for (const candidate of votes.values()) {
    if (!winner || candidate.count > winner.count) winner = candidate;
  }
  return winner?.value ?? null;
}

function distinctNormalized(values) {
  return new Set(values.filter(Boolean).map((value) => String(value).trim().toLowerCase()));
}

function locationTuple(result) {
  if (!result.countryCode && !result.country && !result.city && !result.region) return null;
  return [result.countryCode ?? result.country ?? '', result.city ?? '', result.region ?? '']
    .map((value) => String(value).trim().toLowerCase())
    .join('|');
}

export async function runGeoIpConsensus({ ip, providers, timeoutMs, fetchImpl = fetch }) {
  const sources = await Promise.all(
    providers.map((provider) => runGeoIpProviderLookup({ ip, provider, timeoutMs, fetchImpl }))
  );
  const successful = sources.filter((result) => result.status === 'complete');
  const available = successful.length;
  const total = providers.length;

  if (available === 0) {
    return {
      status: 'unavailable',
      ip,
      countryCode: null,
      country: null,
      region: null,
      city: null,
      asn: null,
      org: null,
      timezone: null,
      agreement: { available: 0, total, countryAgree: false, locationAgree: false },
      sources,
      differences: [],
      error: 'Location unavailable.'
    };
  }

  const countryCodes = successful.map((result) => result.countryCode).filter(Boolean);
  const locations = successful.map(locationTuple).filter(Boolean);
  const countryAgree = distinctNormalized(countryCodes).size <= 1;
  const locationAgree = distinctNormalized(locations).size <= 1;
  const differences = countryAgree && locationAgree
    ? []
    : successful.map((result) => ({
        source: result.source,
        countryCode: result.countryCode,
        country: result.country,
        region: result.region,
        city: result.city,
        asn: result.asn,
        org: result.org
      }));

  return {
    status: available === total ? 'complete' : 'partial',
    ip,
    countryCode: voteValue(successful, 'countryCode'),
    country: voteValue(successful, 'country'),
    region: voteValue(successful, 'region'),
    city: voteValue(successful, 'city'),
    asn: voteValue(successful, 'asn'),
    org: voteValue(successful, 'org'),
    timezone: voteValue(successful, 'timezone'),
    agreement: { available, total, countryAgree, locationAgree },
    sources,
    differences,
    error: null
  };
}

// Backward-compatible single-provider wrapper for callers outside the current UI.
export async function runGeoIpLookup({ ip, urlTemplate, timeoutMs, fetchImpl = fetch }) {
  return runGeoIpProviderLookup({
    ip,
    provider: { id: 'ipapi', label: 'ipapi.co', kind: 'ipapi', urlTemplate },
    timeoutMs,
    fetchImpl
  });
}
