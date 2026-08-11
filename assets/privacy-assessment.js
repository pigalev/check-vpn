import { reason } from './diagnostic-reasons.js';

export function assessPrivacy({ browser, ipv4, ipv6 }) {
  const browserTimezone = browser?.timezone ?? null;
  const ipTimezones = [...new Set([ipv4?.geo?.timezone, ipv6?.geo?.timezone].filter(Boolean))];
  const findings = [];
  let timezoneMatch = null;
  if (browserTimezone && ipTimezones.length) {
    timezoneMatch = ipTimezones.includes(browserTimezone);
    if (!timezoneMatch) findings.push(reason('BROWSER_TIMEZONE_MISMATCH', { browserTimezone, ipTimezones }));
  } else {
    findings.push({ id: 'timezone-incomplete', severity: 'info', category: 'privacy', summary: 'Timezone comparison incomplete', details: 'Browser or IP timezone was unavailable.', sources: ['browser', 'geoip'] });
  }
  return { browserTimezone, ipTimezones, timezoneMatch, findings };
}
