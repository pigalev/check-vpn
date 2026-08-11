import { reasonForGeoState, reasonForIpConsensus } from './diagnostic-reasons.js';

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

function distinct(values) {
  return [...new Set(values.filter(Boolean))];
}

function legacyState(explicitState, legacyAgree) {
  if (explicitState) return explicitState;
  if (legacyAgree === true) return 'agree';
  if (legacyAgree === false) return 'disagree';
  return null;
}

function geoReasonContext(result) {
  const geo = result?.geo;
  if (!geo?.agreement) return null;
  const successful = (geo.sources ?? []).filter((source) => source?.status === 'complete');
  const countryState = legacyState(geo.agreement.countryState, geo.agreement.countryAgree);
  const locationState = legacyState(geo.agreement.locationState, geo.agreement.locationAgree);
  const countries = distinct(successful.map((source) => source.country ?? source.countryCode));
  const locations = distinct(successful.map((source) => [source.city, source.region].filter(Boolean).join(', ')));
  return { family:result.family, countryState, locationState, countries, locations };
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
      findings.push(...reasonForIpConsensus({ family:result.family, confidence:result.confidence }));
    } else if (!result?.confidence && result?.agreement?.agree === false) {
      findings.push({ id: `ipv${result.family}-source-disagreement`, severity: 'review', category: 'ip', summary: `IPv${result.family} providers disagree`, details: 'Independent public-IP sources returned different addresses.', sources: ['http-ip'] });
    }

    const geoContext = geoReasonContext(result);
    if (geoContext) findings.push(...reasonForGeoState(geoContext));
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
