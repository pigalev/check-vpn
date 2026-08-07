export function assessPrivacy({ browser, ipv4, ipv6 }) {
  const browserTimezone = browser?.timezone ?? null;
  const ipTimezones = [...new Set([ipv4?.geo?.timezone, ipv6?.geo?.timezone].filter(Boolean))];
  const findings = [];
  let timezoneMatch = null;
  if (browserTimezone && ipTimezones.length) {
    timezoneMatch = ipTimezones.includes(browserTimezone);
    if (!timezoneMatch) findings.push({ id: 'timezone-mismatch', severity: 'review', category: 'privacy', summary: 'Browser timezone differs from IP timezone', details: `${browserTimezone} vs ${ipTimezones.join(', ')}`, sources: ['browser', 'geoip'] });
  } else {
    findings.push({ id: 'timezone-incomplete', severity: 'info', category: 'privacy', summary: 'Timezone comparison incomplete', details: 'Browser or IP timezone was unavailable.', sources: ['browser', 'geoip'] });
  }
  return { browserTimezone, ipTimezones, timezoneMatch, findings };
}
