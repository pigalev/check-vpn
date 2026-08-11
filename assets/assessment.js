function dedupe(findings) {
  const map = new Map();
  for (const finding of findings) if (finding?.id && !map.has(finding.id)) map.set(finding.id, finding);
  return [...map.values()];
}

function authoritativeAddress(result) {
  if (!result?.address) return null;
  if (!result.confidence) return result.address;
  return ['strong', 'partial'].includes(result.confidence) ? result.address : null;
}

export function assessResults({ ipv4, ipv6, webrtc, privacy, networkFindings = [], monitorFindings = [], aggressiveFindings = [], guidedFindings = [] }) {
  const findings = [ ...(privacy?.findings ?? []), ...networkFindings, ...monitorFindings, ...aggressiveFindings, ...guidedFindings ];
  const httpAddresses = new Set([authoritativeAddress(ipv4), authoritativeAddress(ipv6)].filter(Boolean));
  const rtcMismatch = httpAddresses.size
    ? (webrtc?.publicAddresses ?? []).filter((address) => !httpAddresses.has(address))
    : [];
  if (rtcMismatch.length) findings.push({ id: 'webrtc-public-mismatch', severity: 'leak', category: 'network', summary: 'WebRTC exposed a different public address', details: rtcMismatch.join(', '), sources: ['webrtc', 'http'] });

  for (const result of [ipv4, ipv6]) {
    if (result?.confidence === 'no-consensus') {
      findings.push({
        id: `ipv${result.family}-no-consensus`,
        severity: 'review',
        category: 'ip',
        summary: `IPv${result.family} public IP could not reach consensus`,
        details: 'Independent public-IP groups did not establish a sufficiently strong winner.',
        sources: ['http-ip']
      });
    } else if (!result?.confidence && result?.agreement?.agree === false) {
      findings.push({ id: `ipv${result.family}-source-disagreement`, severity: 'review', category: 'ip', summary: `IPv${result.family} providers disagree`, details: 'Independent public-IP sources returned different addresses.', sources: ['http-ip'] });
    }
    if (result?.geo?.agreement?.countryAgree === false) findings.push({ id: `ipv${result.family}-geo-country-disagreement`, severity: 'review', category: 'geoip', summary: `IPv${result.family} GeoIP country disagreement`, details: 'GeoIP providers returned different countries.', sources: ['geoip'] });
  }

  const unique = dedupe(findings);
  const httpComplete = Boolean(authoritativeAddress(ipv4) || authoritativeAddress(ipv6));
  const webRtcComplete = webrtc?.status === 'complete';
  const hasLeak = unique.some((finding) => finding.severity === 'leak');
  const hasReview = unique.some((finding) => finding.severity === 'review');
  if (hasLeak) return { status: 'leak', message: 'A public-address exposure or tunnel-bypass signal was detected.', findings: unique };
  if (hasReview) return { status: 'review', message: 'No confirmed leak, but one or more inconsistencies deserve review.', findings: unique };
  if (!httpComplete || !webRtcComplete) return { status: 'incomplete', message: 'No confirmed leak was found, but core checks were incomplete.', findings: unique };
  return { status: 'protected', message: 'No public address mismatch or bypass signal detected.', findings: unique };
}
