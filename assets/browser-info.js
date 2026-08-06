export function collectBrowserInfo(environment = globalThis) {
  const navigatorObject = environment.navigator ?? {};
  const connection = navigatorObject.connection ?? navigatorObject.mozConnection ?? navigatorObject.webkitConnection ?? null;
  return {
    userAgent: navigatorObject.userAgent ?? '',
    language: navigatorObject.language ?? '',
    platform: navigatorObject.userAgentData?.platform ?? navigatorObject.platform ?? '',
    online: typeof navigatorObject.onLine === 'boolean' ? navigatorObject.onLine : true,
    connection: connection ? {
      effectiveType: connection.effectiveType ?? null,
      downlinkMbps: Number.isFinite(connection.downlink) ? connection.downlink : null,
      rttMs: Number.isFinite(connection.rtt) ? connection.rtt : null,
      saveData: typeof connection.saveData === 'boolean' ? connection.saveData : null
    } : null
  };
}
