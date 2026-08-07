export function assessResults({ ipv4, ipv6, webrtc, privacy, networkFindings = [], monitorFindings = [] }) {
  const findings = [
    ...(privacy?.findings ?? []),
    ...networkFindings,
    ...monitorFindings
  ];

  const ipDisagreement = [ipv4, ipv6].flatMap((result) => {
    if (!result?.agreement || result.agreement.agree !== false) return [];
    return [{ id: `ipv${result.family}-source-disagreement`, severity: 'review', category: 'ip', summary: `IPv${result.family} providers disagree`, details: 'Independent public-IP sources returned different addresses.', sources: ['http-ip'] }];
  });
  findings.push(...ipDisagreement);

  for (const result of [ipv4, ipv6]) {
    if (result?.geo?.agreement?.countryAgree === false) findings.push({ id: `ipv${result.family}-geo-country-disagreement`, severity: 'review', category: 'geoip', summary: `IPv${result.family} GeoIP country disagreement`, details: 'GeoIP providers returned different countries.', sources: ['geoip'] });
  }

  const httpComplete = Boolean(ipv4?.address || ipv6?.address);
  const webRtcComplete = webrtc?.status === 'complete';
  const hasLeak = findings.some((finding) => finding.severity === 'leak');
  const hasReview = findings.some((finding) => finding.severity === 'review');
  if (hasLeak) return { status: 'leak', message: 'A public-address exposure or tunnel-bypass signal was detected.', findings };
  if (hasReview) return { status: 'review', message: 'No confirmed leak, but one or more inconsistencies deserve review.', findings };
  if (!httpComplete || !webRtcComplete) return { status: 'incomplete', message: 'No confirmed leak was found, but core checks were incomplete.', findings };
  return { status: 'protected', message: 'No public address mismatch or bypass signal detected.', findings };
}
