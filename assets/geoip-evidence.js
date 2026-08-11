function clean(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalized(value) {
  return clean(value)?.toLowerCase() ?? null;
}

function countryKey(value) {
  return normalized(value?.countryCode ?? value?.country);
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
  const selectedCountryKey = countryKey(result);
  const selectedLocationKey = locationKey(result);
  const sources = Array.isArray(result.sources) ? result.sources : [];

  const rows = sources.map((source) => {
    const identity = sourceIdentity(source);
    const sourceCountryKey = countryKey(source);
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

  const completeCount = rows.filter((row) => row.status === 'complete').length;
  const selectedLocation = [clean(result.city), clean(result.region)].filter(Boolean).join(', ') || null;

  return {
    selectedIp: clean(result.ip),
    selectedCountry: clean(result.country) ?? clean(result.countryCode),
    selectedLocation,
    responded: result.agreement?.available ?? completeCount,
    total: result.agreement?.total ?? rows.length,
    countryState: result.agreement?.countryState ?? 'unavailable',
    locationState: result.agreement?.locationState ?? 'unavailable',
    rows
  };
}
