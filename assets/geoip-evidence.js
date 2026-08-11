import { buildCountryAliases, countryEvidenceKey } from './geoip-country.js';

function clean(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalized(value) {
  return clean(value)?.toLowerCase() ?? null;
}

function locationKey(value) {
  const city = normalized(value?.city);
  const region = normalized(value?.region);
  if (!city && !region) return null;
  return `${city ?? ''}|${region ?? ''}`;
}

function relationFor(source, valueKey, selectedKey) {
  if (source?.status !== 'complete') return 'unavailable';
  if (!valueKey) return 'missing';
  if (!selectedKey) return 'observed';
  return valueKey === selectedKey ? 'selected' : 'differs';
}

function sourceIdentity(source = {}) {
  const info = source.source ?? {};
  return {
    id: clean(info.id) ?? 'unknown',
    label: clean(info.label) ?? clean(info.id) ?? 'Unknown provider'
  };
}

export function buildGeoIpEvidence(result = {}) {
  const sources = Array.isArray(result.sources) ? result.sources : [];
  const aliases = buildCountryAliases([result, ...sources]);
  const selectedCountryKey = countryEvidenceKey(result, aliases);
  const selectedLocationKey = locationKey(result);

  const rows = sources.map((source) => {
    const identity = sourceIdentity(source);
    const sourceCountryKey = countryEvidenceKey(source, aliases);
    const sourceLocationKey = locationKey(source);
    return {
      ...identity,
      status: source?.status ?? 'unavailable',
      countryCode: clean(source?.countryCode),
      country: clean(source?.country),
      region: clean(source?.region),
      city: clean(source?.city),
      timezone: clean(source?.timezone),
      asn: clean(source?.asn),
      org: clean(source?.org),
      latencyMs: Number.isFinite(source?.latencyMs) ? source.latencyMs : null,
      error: clean(source?.error),
      countryRelation: relationFor(source, sourceCountryKey, selectedCountryKey),
      locationRelation: relationFor(source, sourceLocationKey, selectedLocationKey)
    };
  });

  const reached = rows.filter((row) => row.status === 'complete').length;
  const selectedLocation = [clean(result.city), clean(result.region)].filter(Boolean).join(', ') || null;
  const countryVote = result.votes?.country ?? null;
  const locationVote = result.votes?.location ?? null;
  const timezoneVote = result.votes?.timezone ?? null;
  const usableCountry = countryVote?.usable ?? rows.filter((row) => row.status === 'complete' && row.countryRelation !== 'missing').length;
  const usableLocation = locationVote?.usable ?? rows.filter((row) => row.status === 'complete' && row.locationRelation !== 'missing').length;
  const usableTimezone = timezoneVote?.usable ?? rows.filter((row) => row.status === 'complete' && row.timezone).length;

  return {
    selectedIp: clean(result.ip),
    selectedCountry: clean(result.country) ?? clean(result.countryCode),
    selectedLocation,
    selectedTimezone: clean(result.timezone),
    reached,
    responded: reached,
    total: result.agreement?.total ?? rows.length,
    usableCountry,
    usableLocation,
    usableTimezone,
    countryVote,
    locationVote,
    timezoneVote,
    countryState: countryVote?.state ?? result.agreement?.countryState ?? 'unavailable',
    locationState: locationVote?.state ?? result.agreement?.locationState ?? 'unavailable',
    timezoneState: timezoneVote?.state ?? 'unavailable',
    rows
  };
}
