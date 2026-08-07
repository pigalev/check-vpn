export function collectBrowserInfo(environment = globalThis) {
  const navigatorObject = environment.navigator ?? {};
  const connection = navigatorObject.connection ?? navigatorObject.mozConnection ?? navigatorObject.webkitConnection ?? null;
  const screen = environment.screen ?? {};
  const uaData = navigatorObject.userAgentData ?? null;
  let timezone = null;
  try { timezone = environment.Intl?.DateTimeFormat?.().resolvedOptions?.().timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone; } catch {}
  return {
    userAgent: navigatorObject.userAgent ?? '',
    language: navigatorObject.language ?? '',
    languages: Array.isArray(navigatorObject.languages) ? [...navigatorObject.languages] : [],
    platform: uaData?.platform ?? navigatorObject.platform ?? '',
    legacyPlatform: navigatorObject.platform ?? '',
    userAgentData: uaData ? { platform: uaData.platform ?? null, mobile: uaData.mobile ?? null, brands: uaData.brands ?? null } : null,
    timezone,
    online: typeof navigatorObject.onLine === 'boolean' ? navigatorObject.onLine : true,
    secureContext: typeof environment.isSecureContext === 'boolean' ? environment.isSecureContext : null,
    gpc: typeof navigatorObject.globalPrivacyControl === 'boolean' ? navigatorObject.globalPrivacyControl : null,
    doNotTrack: navigatorObject.doNotTrack ?? null,
    cookieEnabled: typeof navigatorObject.cookieEnabled === 'boolean' ? navigatorObject.cookieEnabled : null,
    hardwareConcurrency: Number.isFinite(navigatorObject.hardwareConcurrency) ? navigatorObject.hardwareConcurrency : null,
    deviceMemoryGb: Number.isFinite(navigatorObject.deviceMemory) ? navigatorObject.deviceMemory : null,
    maxTouchPoints: Number.isFinite(navigatorObject.maxTouchPoints) ? navigatorObject.maxTouchPoints : null,
    screen: { width: Number.isFinite(screen.width) ? screen.width : null, height: Number.isFinite(screen.height) ? screen.height : null },
    viewport: { width: Number.isFinite(environment.innerWidth) ? environment.innerWidth : null, height: Number.isFinite(environment.innerHeight) ? environment.innerHeight : null },
    devicePixelRatio: Number.isFinite(environment.devicePixelRatio) ? environment.devicePixelRatio : null,
    connection: connection ? { effectiveType: connection.effectiveType ?? null, downlinkMbps: Number.isFinite(connection.downlink) ? connection.downlink : null, rttMs: Number.isFinite(connection.rtt) ? connection.rtt : null, saveData: typeof connection.saveData === 'boolean' ? connection.saveData : null } : null
  };
}
