import { fetchJsonWithTimeout } from './network.js';
import { buildCountryAliases, countryEvidenceKey } from './geoip-country.js';

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
      timezone: payload.timeZone ?? (Array.isArray(payload.timeZones) ? payload.timeZones[0] : null)
    };
  } else if (kind === 'ipapiis') {
    if (payload.error === true) return emptyResult(expectedIp, 'error', cleanString(payload.message) ?? 'Location lookup failed.', source);
    const location = payload.location ?? {};
    const network = typeof payload.asn === 'object' && payload.asn ? payload.asn : {};
    data = {
      countryCode: location.country_code,
      country: location.country,
      region: location.state ?? location.region,
      city: location.city,
      asn: network.asn ?? payload.asn,
      org: network.org ?? payload.company?.name,
      timezone: location.timezone
    };
  } else if (kind === 'sypex') {
    if (payload.error === true) return emptyResult(expectedIp, 'error', cleanString(payload.message) ?? 'Location lookup failed.', source);
    data = {
      countryCode: payload.country?.iso,
      country: payload.country?.name_en ?? payload.country?.name_ru,
      region: payload.region?.name_en ?? payload.region?.name_ru,
      city: payload.city?.name_en ?? payload.city?.name_ru,
      asn: payload.asn,
      org: payload.org,
      timezone: payload.city?.timezone ?? payload.region?.timezone
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

export async function runGeoIpProviderLookup({
  ip,
  provider,
  timeoutMs,
  fetchImpl = fetch,
  now = () => performance.now?.() ?? Date.now()
}) {
  const startedAt = now();
  const elapsed = () => Math.max(0, Math.round(now() - startedAt));
  try {
    const payload = await fetchJsonWithTimeout(buildGeoIpUrl(provider.urlTemplate, ip), { timeoutMs, fetchImpl });
    return { ...normalizeGeoIp(payload, ip, provider.kind, provider), latencyMs:elapsed() };
  } catch (error) {
    const unavailable = error?.name === 'AbortError' || error instanceof TypeError;
    return {
      ...emptyResult(
        ip,
        unavailable ? 'unavailable' : 'error',
        unavailable ? 'Location unavailable.' : 'Location lookup failed.',
        provider
      ),
      latencyMs:elapsed()
    };
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

function evidenceState(values) {
  const normalized = values
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase())
    .filter(Boolean);
  if (normalized.length === 0) return 'unavailable';
  if (normalized.length === 1) return 'single-source';
  return new Set(normalized).size === 1 ? 'agree' : 'disagree';
}

function legacyAgree(state) {
  return state === 'agree' ? true : state === 'disagree' ? false : null;
}

function locationTuple(result) {
  if (!result.city && !result.region) return null;
  return [result.city ?? '', result.region ?? '']
    .map((value) => String(value).trim().toLowerCase())
    .join('|');
}

function metadataTuple(result) {
  return [
    result.countryCode ?? result.country ?? '',
    result.city ?? '',
    result.region ?? '',
    result.asn ?? '',
    result.org ?? '',
    result.timezone ?? ''
  ].map((value) => String(value).trim().toLowerCase()).join('|');
}

function agreementFor(successful, total) {
  const aliases = buildCountryAliases(successful);
  const countries = successful.map((result) => countryEvidenceKey(result, aliases)).filter(Boolean);
  const locations = successful.map(locationTuple).filter(Boolean);
  const countryState = evidenceState(countries);
  const locationState = evidenceState(locations);
  return {
    available: successful.length,
    total,
    countryState,
    locationState,
    countryAgree: legacyAgree(countryState),
    locationAgree: legacyAgree(locationState)
  };
}

function buildGeoIpConsensusResult(ip, providers, sources) {
  const successful = sources.filter((result) => result.status === 'complete');
  const available = successful.length;
  const total = providers.length;
  const agreement = agreementFor(successful, total);

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
      agreement,
      sources,
      differences: [],
      error: 'Location unavailable.'
    };
  }

  const metadata = successful.map(metadataTuple);
  const metadataAgree = new Set(metadata).size <= 1;
  const differences = metadataAgree
    ? []
    : successful.map((result) => ({
        source: result.source,
        countryCode: result.countryCode,
        country: result.country,
        region: result.region,
        city: result.city,
        asn: result.asn,
        org: result.org,
        timezone: result.timezone
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
    agreement,
    sources,
    differences,
    error: null
  };
}

function ipFamily(ip) {
  return typeof ip === 'string' && ip.includes(':') ? 6 : 4;
}

function providerSupportsIp(provider, ip) {
  return !Array.isArray(provider?.families) || provider.families.includes(ipFamily(ip));
}

export function hasUsableGeoLocation(result) {
  return ['complete', 'partial'].includes(result?.status) && Boolean(result.countryCode || result.country || result.region || result.city);
}

export async function runGeoIpConsensusProgressive({ ip, providers, timeoutMs, fetchImpl = fetch, onFirstUsable = null }) {
  const activeProviders = (providers ?? []).filter((provider) => providerSupportsIp(provider, ip));
  let emitted = false;
  const promises = activeProviders.map(async (provider) => {
    const result = await runGeoIpProviderLookup({ ip, provider, timeoutMs, fetchImpl });
    if (!emitted && hasUsableGeoLocation(result)) {
      emitted = true;
      onFirstUsable?.(result);
    }
    return result;
  });
  return buildGeoIpConsensusResult(ip, activeProviders, await Promise.all(promises));
}

export function runGeoIpConsensus(args) {
  return runGeoIpConsensusProgressive(args);
}

export async function runGeoIpLookup({ ip, urlTemplate, timeoutMs, fetchImpl = fetch }) {
  return runGeoIpProviderLookup({
    ip,
    provider: { id: 'ipapi', label: 'ipapi.co', kind: 'ipapi', urlTemplate },
    timeoutMs,
    fetchImpl
  });
}
