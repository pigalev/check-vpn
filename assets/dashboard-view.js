function usableGeo(geo) {
  return geo && ['complete', 'partial'].includes(geo.status);
}

function sourceText(ip) {
  if (!ip?.agreement) return ip?.address ? 'Checking…' : null;
  return `${ip.agreement.available}/${ip.agreement.total} sources${ip.agreement.agree ? ' · agree' : ' · differ'}`;
}

function ipEntry(ip, fallbackFamily) {
  const family = ip?.family ?? fallbackFamily;
  if (!ip?.address) {
    return {
      family,
      address: null,
      state: ip?.ipFinal ? 'not-detected' : 'checking',
      sourceText: null,
      locationState: 'none',
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
  const trusted = new Set([ipv4?.address, ipv6?.address].filter(Boolean));
  const publicAddresses = [...new Set(webrtc?.publicAddresses ?? [])];
  const mismatchAddresses = publicAddresses.filter((address) => !trusted.has(address));
  const candidates = webrtc?.candidates ?? [];
  const mdnsProtection = candidates.some((candidate) => candidate.classification === 'mdns');
  return {
    status: webrtc?.status === 'complete' ? (mismatchAddresses.length ? 'leak' : 'clear') : 'unavailable',
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
