function finding(id, severity, summary, details, sources = []) { return { id, severity, category: 'network', summary, details, sources }; }

function authoritativeAddress(result) {
  if (!result?.address) return null;
  if (!result.confidence) return result.address;
  return ['strong', 'partial'].includes(result.confidence) ? result.address : null;
}

export function assessAddressFamilies({ ipv4, ipv6, webrtc }) {
  const findings = [];
  const ipv4Address = authoritativeAddress(ipv4);
  const ipv6Address = authoritativeAddress(ipv6);
  const httpAddresses = [ipv4Address, ipv6Address].filter(Boolean);
  const publicRtc = webrtc?.publicAddresses ?? [];
  for (const address of publicRtc) {
    if (httpAddresses.length && !httpAddresses.includes(address)) findings.push(finding('webrtc-public-mismatch', 'leak', 'WebRTC exposed a different public address', `${address} was not observed by authoritative HTTP IP checks.`, ['webrtc', 'http']));
  }
  if (!ipv6Address) {
    if (ipv6?.confidence !== 'no-consensus') findings.push(finding('ipv6-unavailable', 'info', 'No authoritative IPv6 connectivity detected', 'No authoritative public IPv6 address was established.', ['ipv6']));
    return findings;
  }
  if (!ipv4Address) return findings;
  const g4 = ipv4.geo ?? {};
  const g6 = ipv6.geo ?? {};
  const asnDifferent = Boolean(g4.asn && g6.asn && g4.asn !== g6.asn);
  const countryDifferent = Boolean(g4.countryCode && g6.countryCode && g4.countryCode !== g6.countryCode);
  const orgDifferent = Boolean(g4.org && g6.org && g4.org.toLowerCase() !== g6.org.toLowerCase());
  if (asnDifferent || countryDifferent || orgDifferent) {
    const materiallyDifferent = countryDifferent && (asnDifferent || orgDifferent);
    findings.push(finding(
      materiallyDifferent ? 'possible-ipv6-bypass' : 'ip-family-network-difference',
      'review',
      materiallyDifferent ? 'IPv4 and IPv6 appear to use materially different networks' : 'IPv4 and IPv6 use different network metadata',
      materiallyDifferent
        ? `This may indicate an IPv6 tunnel bypass, but browser-only network metadata is not enough to confirm one (${g4.asn ?? 'unknown'} / ${g6.asn ?? 'unknown'}).`
        : 'The difference may be legitimate, but it deserves review.',
      ['ipv4', 'ipv6', 'geoip']
    ));
  }
  return findings;
}
