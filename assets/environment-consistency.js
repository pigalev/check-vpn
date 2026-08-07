function finding(id, summary, details) {
  return { id, severity: 'review', category: 'environment', summary, details, sources: ['browser'] };
}

export function detectUaPlatform(userAgent = '') {
  const ua = String(userAgent).toLowerCase();
  if (/android/.test(ua)) return 'android';
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/windows/.test(ua)) return 'windows';
  if (/mac os x|macintosh/.test(ua)) return 'macos';
  if (/linux/.test(ua)) return 'linux';
  return 'unknown';
}

export function detectLegacyPlatform(platform = '') {
  const value = String(platform).toLowerCase();
  if (/win/.test(value)) return 'windows';
  if (/iphone|ipad|ipod/.test(value)) return 'ios';
  if (/mac/.test(value)) return 'macos';
  if (/android/.test(value)) return 'android';
  if (/linux|x11/.test(value)) return 'linux';
  return 'unknown';
}

function detectHintsPlatform(userAgentData) {
  const value = userAgentData?.platform;
  if (!value) return 'unknown';
  return detectLegacyPlatform(value);
}

export function assessEnvironmentConsistency({ browser = {}, fingerprint = {}, privacy = {} } = {}) {
  const findings = [];
  const uaPlatform = detectUaPlatform(browser.userAgent);
  const legacyPlatform = detectLegacyPlatform(browser.legacyPlatform ?? browser.platform);
  const hintsPlatform = detectHintsPlatform(browser.userAgentData);

  if (uaPlatform !== 'unknown' && legacyPlatform !== 'unknown') {
    const mobileDesktopException = (uaPlatform === 'android' && legacyPlatform === 'linux') || (uaPlatform === 'ios' && legacyPlatform === 'macos');
    if (!mobileDesktopException && uaPlatform !== legacyPlatform) {
      findings.push(finding('platform-contradiction', 'Browser platform metadata conflicts', `User-Agent indicates ${uaPlatform}, while navigator.platform indicates ${legacyPlatform}.`));
    }
  }

  if (hintsPlatform !== 'unknown') {
    const comparable = [uaPlatform, legacyPlatform].filter((value) => value !== 'unknown');
    if (comparable.length && comparable.every((value) => value !== hintsPlatform)) {
      findings.push(finding('ua-ch-platform-contradiction', 'User-Agent Client Hints platform conflicts', `UA-CH indicates ${hintsPlatform}, while other browser metadata indicates ${[...new Set(comparable)].join('/')}.`));
    }
  }

  const mobileUa = uaPlatform === 'android' || uaPlatform === 'ios';
  const desktopLegacy = legacyPlatform === 'windows' || legacyPlatform === 'macos';
  if (mobileUa && desktopLegacy && (browser.maxTouchPoints ?? 0) === 0) {
    findings.push(finding('mobile-environment-contradiction', 'Mobile browser metadata conflicts with desktop signals', 'Mobile User-Agent is combined with a desktop platform and zero touch points.'));
  }

  const signals = { uaPlatform, legacyPlatform, hintsPlatform, webglRenderer: fingerprint?.webgl?.renderer ?? null, timezoneMatch: privacy.timezoneMatch ?? null };
  return { status: findings.length ? 'review' : (uaPlatform === 'unknown' && legacyPlatform === 'unknown' && hintsPlatform === 'unknown' ? 'insufficient' : 'consistent'), findings, signals };
}
