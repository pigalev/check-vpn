export const appConfig = Object.freeze({
  autoRun: true,
  monitorIntervalMs: 5000,
  aggressiveDurationMs: 60000,
  aggressiveHttpIntervalMs: 2000,
  aggressiveStunIntervalMs: 5000,
  aggressiveEchoIntervalMs: 10000,
  aggressiveTlsIntervalMs: 15000,
  aggressiveGapMultiplier: 2.5,
  aggressiveBurstCooldownMs: 1500,
  aggressiveMinHttpAttempts: 10,
  aggressiveMinSuccessfulHttpSamples: 6
});

export const features = Object.freeze({
  ipv4: true,
  ipv6: true,
  webrtc: true,
  geoip: true,
  advanced: true,
  monitor: true,
  monitorEnrichment: true,
  aggressiveLeak: true,
  dns: false,
  torrent: false,
  email: false
});

const ip4Providers = [
  { id: 'ipify4', label: 'ipify', kind: 'ipify', url: 'https://api4.ipify.org?format=json' },
  { id: 'ippubblico4', label: 'IPPubblico', kind: 'text', url: 'https://ipv4.ippubblico.org/' },
  { id: 'ipwho4', label: 'ipwho.is', kind: 'ipwhois', url: 'https://ipwho.is/' }
];

const ip6Providers = [
  { id: 'ipify6', label: 'ipify', kind: 'ipify', url: 'https://api6.ipify.org?format=json' },
  { id: 'ippubblico6', label: 'IPPubblico', kind: 'text', url: 'https://ipv6.ippubblico.org/' },
  { id: 'icanhaz6', label: 'icanhazip', kind: 'text', url: 'https://ipv6.icanhazip.com/' }
];

export const networkConfig = Object.freeze({
  ipv4Endpoint: 'https://api4.ipify.org?format=json',
  ipv6Endpoint: 'https://api6.ipify.org?format=json',
  ipProviders: Object.freeze({
    4: Object.freeze(ip4Providers.map(Object.freeze)),
    6: Object.freeze(ip6Providers.map(Object.freeze))
  }),
  geoIpProviders: Object.freeze([
    Object.freeze({ id: 'ipapi', label: 'ipapi.co', kind: 'ipapi', urlTemplate: 'https://ipapi.co/{ip}/json/' }),
    Object.freeze({ id: 'ipwhois', label: 'ipwho.is', kind: 'ipwhois', urlTemplate: 'https://ipwho.is/{ip}' }),
    Object.freeze({ id: 'freeipapi', label: 'FreeIPAPI', kind: 'freeipapi', urlTemplate: 'https://free.freeipapi.com/api/json/{ip}' })
  ]),
  intelligenceUrlTemplate: 'https://api.ipapi.is/?q={ip}',
  dohResolvers: Object.freeze([
    Object.freeze({ id: 'cloudflare', label: 'Cloudflare', kind: 'cloudflare', url: 'https://cloudflare-dns.com/dns-query' }),
    Object.freeze({ id: 'google', label: 'Google', kind: 'google', url: 'https://dns.google/resolve' })
  ]),
  httpEchoEndpoint: 'https://httpbin.org/anything',
  tlsReflectorEndpoint: 'https://tls.peet.ws/api/all',
  stunUrls: Object.freeze([
    'stun:stun.cloudflare.com:3478',
    'stun:stun.l.google.com:19302'
  ]),
  requestTimeoutMs: 6000,
  geoIpTimeoutMs: 6000,
  advancedTimeoutMs: 7000,
  fingerprintTimeoutMs: 7000,
  webrtcTimeoutMs: 7000
});

export function getEnabledChecks(config = features) {
  return ['ipv4', 'ipv6', 'webrtc'].filter((name) => config[name] === true);
}
