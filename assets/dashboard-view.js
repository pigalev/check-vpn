function usableGeo(geo) {
  return geo
    && ['complete', 'partial'].includes(geo.status)
    && Boolean(geo.countryCode || geo.country || geo.region || geo.city);
}

function reserveUnavailable(ip) {
  return Boolean(ip?.reserve?.used) && (ip.reserve.sources ?? []).every((source) => source?.status !== 'complete');
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

  if (confidence === 'strong') {
    return ip.reserve?.used
      ? `Strong consensus · reserve used · ${selectedVotes}/${available} agree`
      : `Strong consensus · ${primaryAvailable}/${primaryTotal} primary responded · ${selectedVotes} agree`;
  }
  if (confidence === 'partial') {
    return `Partial · ${selectedVotes || available} sources agree${reserveUnavailable(ip) ? ' · reserve unavailable' : ''}`;
  }
  return `${available}/${ip.agreement.total ?? 0} sources${ip.agreement.agree ? ' · agree' : ' · differ'}`;
}

function authoritativeAddress(ip) {
  if (!ip?.address) return null;
  if (!ip.confidence) return ip.address;
  return ['strong', 'partial'].includes(ip.confidence) ? ip.address : null;
}

function geoDisagrees(geo) {
  const agreement = geo?.agreement;
  if (!agreement) return false;
  if (agreement.countryState || agreement.locationState) {
    return agreement.countryState === 'disagree' || agreement.locationState === 'disagree';
  }
  return agreement.countryAgree === false || agreement.locationAgree === false;
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
      locationDisagreement: false,
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
    locationDisagreement: geo ? geoDisagrees(geo) : false,
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
