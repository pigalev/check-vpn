import { reason, reasonForGeoState } from './diagnostic-reasons.js';

function usableGeo(geo) {
  if (!geo || !['complete', 'partial'].includes(geo.status)) return false;
  if (geo.countryCode || geo.country || geo.region || geo.city) return true;
  return ['country','location','timezone'].some((field) => (geo.votes?.[field]?.usable ?? 0) > 0);
}

function reserveText(ip) {
  if (ip?.reserve?.contributed) return 'reserve contributed';
  if (ip?.reserve?.attempted ?? ip?.reserve?.used) return 'reserve attempted';
  if (ip?.reserve?.notNeeded) return 'reserve not needed';
  return null;
}

function sourceText(ip) {
  const confidence = ip?.confidence;
  if (confidence === 'no-consensus') return 'No consensus · review source details';
  if (confidence === 'unavailable') return 'Unavailable · no source confirmed this family';
  if (!ip?.agreement) return ip?.address ? 'Checking…' : null;
  const available = ip.agreement.available ?? 0;
  const selectedVotes = ip.agreement.selectedVotes ?? (ip.address ? (ip.agreement.counts?.[ip.address] ?? available) : 0);
  const primaryAvailable = ip.primary?.available ?? available;
  const primaryTotal = ip.primary?.total ?? ip.agreement.total ?? 0;
  const reserve = reserveText(ip);

  if (confidence === 'strong') {
    return `Strong consensus · ${primaryAvailable}/${primaryTotal} primary responded · ${selectedVotes}/${available} agree${reserve ? ` · ${reserve}` : ''}`;
  }
  if (confidence === 'partial') {
    return `Partial · ${selectedVotes || available} sources agree${reserve ? ` · ${reserve}` : ''}`;
  }
  return `${available}/${ip.agreement.total ?? 0} sources${ip.agreement.agree ? ' · agree' : ' · differ'}${reserve ? ` · ${reserve}` : ''}`;
}

function authoritativeAddress(ip) {
  if (!ip?.address) return null;
  if (!ip.confidence) return ip.address;
  return ['strong', 'partial'].includes(ip.confidence) ? ip.address : null;
}

function distinct(values) {
  return [...new Set(values.filter(Boolean))];
}

function differenceCount(vote) {
  if (!vote?.usable || !vote?.winnerVotes) return 0;
  return Math.max(0, vote.usable - vote.winnerVotes);
}

function majoritySummary(label, vote) {
  const differs = differenceCount(vote);
  return `${label}: ${vote.winnerLabel} ${vote.winnerVotes}/${vote.usable}${differs ? ` · ${differs} provider${differs === 1 ? '' : 's'} differ${differs === 1 ? 's' : ''}` : ''}`;
}

function withShortSummary(notice, geo) {
  if (!notice) return null;
  const country = geo?.votes?.country;
  const location = geo?.votes?.location;
  if (notice.code === 'GEO_COUNTRY_DISAGREEMENT') {
    if (country?.state === 'majority') return { ...notice, shortSummary:majoritySummary('GeoIP majority', country) };
    if (country?.state === 'unresolved') return { ...notice, shortSummary:'GeoIP country unresolved' };
  }
  if (notice.code === 'GEO_LOCATION_DISAGREEMENT') {
    if (location?.state === 'majority') return { ...notice, shortSummary:majoritySummary('GeoIP location majority', location) };
    if (location?.state === 'unresolved') return { ...notice, shortSummary:'GeoIP location unresolved' };
  }
  return notice;
}

function geoNoticeFor(ip, family, geo) {
  if (ip?.geoPending) return null;
  if (!geo) {
    if (ip?.geoFinal === true || ip?.geo?.status === 'unavailable') return reason('GEO_UNAVAILABLE', { family });
    return null;
  }
  const agreement = geo.agreement;
  if (!agreement?.countryState && !agreement?.locationState) return null;
  const successful = (geo.sources ?? []).filter((source) => source?.status === 'complete');
  const countries = distinct(successful.map((source) => source.country ?? source.countryCode));
  const locations = distinct(successful.map((source) => [source.city, source.region].filter(Boolean).join(', ')));
  const notice = reasonForGeoState({
    family,
    countryState:agreement.countryState ?? null,
    locationState:agreement.locationState ?? null,
    countries,
    locations
  })[0] ?? null;
  return withShortSummary(notice, geo);
}

function ipEntry(ip, fallbackFamily) {
  const family = ip?.family ?? fallbackFamily;
  if (!ip?.address) {
    let state;
    if (ip?.ipFinal === false) state = 'checking';
    else if (ip?.confidence === 'no-consensus') state = 'no-consensus';
    else if (ip?.confidence === 'unavailable') state = 'unavailable';
    else state = 'not-detected';
    return {
      family,
      address: null,
      state,
      sourceText: sourceText(ip),
      locationState: 'none',
      geoNotice: null,
      location: null,
      network: null
    };
  }

  const geo = usableGeo(ip.geo) ? ip.geo : null;
  return {
    family,
    address: ip.address,
    state: ip.ipFinal === false ? 'detected' : 'complete',
    sourceText: sourceText(ip),
    locationState: geo ? 'available' : ip.geoPending ? 'locating' : 'unavailable',
    geoNotice: geoNoticeFor(ip, family, geo),
    location: geo ? {
      countryCode: geo.countryCode,
      country: geo.country,
      city: geo.city,
      region: geo.region
    } : null,
    network: geo ? [geo.asn, geo.org].filter(Boolean).join(' · ') || null : null
  };
}

export function buildConnectionView({ ipv4, ipv6, assessment = null }) {
  const v4 = ipEntry(ipv4, 4);
  const v6 = ipEntry(ipv6, 6);
  const primary = v4.address ? v4 : v6.address ? v6 : v4;
  const secondary = primary.family === 4 ? v6 : v4;
  return { primary, secondary, verdict: assessment?.status ?? null };
}

export function buildLeakView({ ipv4, ipv6, webrtc }) {
  const trusted = new Set([authoritativeAddress(ipv4), authoritativeAddress(ipv6)].filter(Boolean));
  const publicAddresses = [...new Set(webrtc?.publicAddresses ?? [])];
  const mismatchAddresses = trusted.size ? publicAddresses.filter((address) => !trusted.has(address)) : [];
  const candidates = webrtc?.candidates ?? [];
  const mdnsProtection = candidates.some((candidate) => candidate.classification === 'mdns');
  const status = webrtc?.status !== 'complete'
    ? 'unavailable'
    : !trusted.size && publicAddresses.length
      ? 'unavailable'
      : mismatchAddresses.length
        ? 'leak'
        : 'clear';
  return {
    status,
    publicMismatch: mismatchAddresses.length > 0,
    mismatchAddresses,
    publicAddresses,
    mdnsProtection,
    details: { candidates, summary: webrtc?.summary ?? {} }
  };
}

export function buildPrivacyView({ browser, privacy }) {
  const browserTimezone = browser?.timezone ?? 'Unavailable';
  const ipTimezone = (privacy?.ipTimezones ?? []).join(', ') || 'Unavailable';
  const timezoneValue = privacy?.timezoneMatch == null
    ? `${browserTimezone} · IP timezone unavailable`
    : privacy.timezoneMatch
      ? `${browserTimezone} · Match`
      : `${browserTimezone} ↔ ${ipTimezone} · Mismatch`;

  return {
    status: privacy?.timezoneMatch === false ? 'review' : 'clear',
    summaryRows: [
      { id: 'timezone', label: 'Timezone', value: timezoneValue, tone: privacy?.timezoneMatch === false ? 'review' : 'normal' },
      { id: 'language', label: 'Language', value: browser?.languages?.join(', ') || browser?.language || 'Unknown', tone: 'normal' }
    ],
    detailRows: [
      { id: 'platform', label: 'Platform', value: browser?.platform || 'Unknown' },
      { id: 'secure-context', label: 'Secure context', value: browser?.secureContext == null ? 'Unknown' : browser.secureContext ? 'Yes' : 'No' },
      { id: 'gpc', label: 'GPC', value: browser?.gpc == null ? 'Unavailable' : browser.gpc ? 'Enabled' : 'Disabled' },
      { id: 'dnt', label: 'DNT', value: browser?.doNotTrack ?? 'Unavailable' }
    ]
  };
}

export function buildAdvancedRowView({ id, title, result, summary = null }) {
  const available = ['complete', 'partial'].includes(result?.status);
  const statusLabel = result?.status === 'complete'
    ? 'Complete'
    : result?.status === 'partial'
      ? 'Partial'
      : result?.status === 'error'
        ? 'Error'
        : 'Unavailable';
  return {
    id,
    title,
    statusLabel,
    summary: summary ?? statusLabel,
    expandable: available,
    fields: []
  };
}
