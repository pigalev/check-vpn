const definitions = Object.freeze({
  IP_NO_CONSENSUS: Object.freeze({
    severity:'review', category:'ip', sources:['http-ip'],
    summary:({ family }) => `IPv${family} Public IP consensus failed`,
    details:() => 'Independent public-IP providers returned conflicting addresses and no authoritative winner was established.'
  }),
  IP_UNAVAILABLE: Object.freeze({
    severity:'info', category:'ip', sources:['http-ip'],
    summary:({ family }) => `IPv${family} Public IP unavailable`,
    details:() => 'No public-IP provider group confirmed an address for this family.'
  }),
  IP_PROVIDER_UNAVAILABLE: Object.freeze({
    severity:'info', category:'ip', sources:['http-ip'],
    summary:({ family }) => `IPv${family} Public IP provider unavailable`,
    details:() => 'One or more public-IP providers were unavailable.'
  }),
  GEO_COUNTRY_DISAGREEMENT: Object.freeze({
    severity:'review', category:'geoip', sources:['geoip'],
    summary:({ family }) => `IPv${family} GeoIP country disagreement`,
    details:({ countries = [] }) => countries.length
      ? `Providers reported different countries for the same public IP: ${countries.join(' / ')}.`
      : 'Providers reported different countries for the same public IP.'
  }),
  GEO_LOCATION_DISAGREEMENT: Object.freeze({
    severity:'info', category:'geoip', sources:['geoip'],
    summary:({ family }) => `IPv${family} GeoIP location differs between providers`,
    details:({ locations = [] }) => locations.length
      ? `Country is consistent, but city/region data differs: ${locations.join(' / ')}.`
      : 'Country is consistent, but city/region data differs between GeoIP providers.'
  }),
  GEO_COUNTRY_SINGLE_SOURCE: Object.freeze({
    severity:'info', category:'geoip', sources:['geoip'],
    summary:({ family }) => `IPv${family} GeoIP country based on one provider`,
    details:() => 'Only one GeoIP provider returned usable country data.'
  }),
  GEO_LOCATION_SINGLE_SOURCE: Object.freeze({
    severity:'info', category:'geoip', sources:['geoip'],
    summary:({ family }) => `IPv${family} GeoIP location based on one provider`,
    details:() => 'Only one GeoIP provider returned usable city/region data.'
  }),
  GEO_UNAVAILABLE: Object.freeze({
    severity:'info', category:'geoip', sources:['geoip'],
    summary:({ family }) => `IPv${family} GeoIP unavailable`,
    details:() => 'No GeoIP provider returned usable location data.'
  }),
  BROWSER_TIMEZONE_MISMATCH: Object.freeze({
    severity:'review', category:'privacy', sources:['browser','geoip'],
    summary:() => 'Browser timezone differs from IP timezone',
    details:({ browserTimezone, ipTimezones = [] }) => `${browserTimezone ?? 'Browser timezone'} differs from ${ipTimezones.join(', ') || 'IP timezone'}.`
  })
});

function slug(code) {
  return code.toLowerCase().replaceAll('_','-');
}

function stableId(code, context) {
  if (code === 'IP_NO_CONSENSUS' && context.family) return `ipv${context.family}-no-consensus`;
  if (code === 'GEO_COUNTRY_DISAGREEMENT' && context.family) return `ipv${context.family}-geo-country-disagreement`;
  if (code === 'BROWSER_TIMEZONE_MISMATCH') return 'timezone-mismatch';
  const familySuffix = context.family ? `-v${context.family}` : '';
  return `${slug(code)}${familySuffix}`;
}

export function reason(code, context = {}) {
  const definition = definitions[code];
  if (!definition) throw new Error(`Unknown diagnostic reason code: ${code}`);
  return {
    code,
    id: stableId(code, context),
    severity: definition.severity,
    category: definition.category,
    summary: definition.summary(context),
    details: definition.details(context),
    sources: [...definition.sources],
    ...(context.evidence ? { evidence:context.evidence } : {})
  };
}

export function reasonForGeoState({ family, countryState, locationState, countries = [], locations = [] }) {
  if (countryState === 'unavailable' && locationState === 'unavailable') return [reason('GEO_UNAVAILABLE', { family })];
  if (countryState === 'disagree') return [reason('GEO_COUNTRY_DISAGREEMENT', { family, countries })];

  const reasons = [];
  if (countryState === 'single-source') reasons.push(reason('GEO_COUNTRY_SINGLE_SOURCE', { family }));
  if (locationState === 'disagree') reasons.push(reason('GEO_LOCATION_DISAGREEMENT', { family, locations }));
  else if (locationState === 'single-source') reasons.push(reason('GEO_LOCATION_SINGLE_SOURCE', { family }));
  return reasons;
}

export function reasonForIpConsensus({ family, confidence }) {
  if (confidence === 'no-consensus') return [reason('IP_NO_CONSENSUS', { family })];
  if (confidence === 'unavailable') return [reason('IP_UNAVAILABLE', { family })];
  return [];
}
