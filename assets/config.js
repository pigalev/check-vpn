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
  aggressiveMinSuccessfulHttpSamples: 6,
  reconnectBurstOffsetsMs: Object.freeze([0, 250, 500, 1000, 2000, 4000]),
  reconnectWebRtcOffsetsMs: Object.freeze([0, 500, 2000, 4000])
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

function endpoint(id, kind, url) {
  return Object.freeze({ id, kind, url });
}

function group(id, groupName, label, family, tier, endpoints, options = {}) {
  return Object.freeze({ id, group: groupName, label, family, tier, endpoints: Object.freeze(endpoints), ...options });
}

const IP_PROVIDER_HEDGE_DELAY_MS = 900;

const coreIpProviderGroups = {
  4: Object.freeze([
    group('ipify4', 'ipify', 'ipify', 4, 'primary', [endpoint('ipify4-http', 'ipify', 'https://api4.ipify.org?format=json')]),
    group('ident4', 'ident', 'ident.me', 4, 'primary', [
      endpoint('ident4-primary', 'text', 'https://4.ident.me/'),
      endpoint('ident4-mirror', 'text', 'https://4.tnedi.me/')
    ], { hedgeDelayMs: IP_PROVIDER_HEDGE_DELAY_MS }),
    group('seeip4', 'seeip', 'SeeIP', 4, 'primary', [endpoint('seeip4-http', 'json', 'https://ipv4.seeip.org/jsonip')]),
    group('icanhaz4', 'icanhazip', 'icanhazip', 4, 'primary', [endpoint('icanhaz4-http', 'text', 'https://ipv4.icanhazip.com/')]),
    group('ipsb4', 'ipsb', 'IP.SB', 4, 'primary', [endpoint('ipsb4-http', 'text', 'https://api-ipv4.ip.sb/ip')])
  ]),
  6: Object.freeze([
    group('ipify6', 'ipify', 'ipify', 6, 'primary', [endpoint('ipify6-http', 'ipify', 'https://api6.ipify.org?format=json')]),
    group('ident6', 'ident', 'ident.me', 6, 'primary', [
      endpoint('ident6-primary', 'text', 'https://6.ident.me/'),
      endpoint('ident6-mirror', 'text', 'https://6.tnedi.me/')
    ], { hedgeDelayMs: IP_PROVIDER_HEDGE_DELAY_MS }),
    group('seeip6', 'seeip', 'SeeIP', 6, 'primary', [endpoint('seeip6-http', 'json', 'https://ipv6.seeip.org/jsonip')]),
    group('icanhaz6', 'icanhazip', 'icanhazip', 6, 'primary', [endpoint('icanhaz6-http', 'text', 'https://ipv6.icanhazip.com/')]),
    group('ipsb6', 'ipsb', 'IP.SB', 6, 'primary', [endpoint('ipsb6-http', 'text', 'https://api-ipv6.ip.sb/ip')])
  ])
};

const reserveIpProviderGroups = {
  4: Object.freeze([
    group('ippubblico4', 'ippubblico', 'IPPubblico', 4, 'reserve', [endpoint('ippubblico4-http', 'text', 'https://ipv4.ippubblico.org/')])
  ]),
  6: Object.freeze([
    group('ippubblico6', 'ippubblico', 'IPPubblico', 6, 'reserve', [endpoint('ippubblico6-http', 'text', 'https://ipv6.ippubblico.org/')])
  ])
};

function stressSubset(family) {
  return Object.freeze(coreIpProviderGroups[family]
    .filter((item) => ['ipify', 'ident', 'seeip'].includes(item.group))
    .map((item) => Object.freeze({ ...item, tier: 'stress' })));
}

const stunDestinations = [
  { id: 'cloudflare', group: 'cloudflare', label: 'Cloudflare', urls: ['stun:stun.cloudflare.com:3478'] },
  { id: 'google-0', group: 'google', label: 'Google', urls: ['stun:stun.l.google.com:19302'] },
  { id: 'google-1', group: 'google', label: 'Google backup', urls: ['stun:stun1.l.google.com:19302'] },
  { id: 'twilio', group: 'twilio', label: 'Twilio', urls: ['stun:global.stun.twilio.com:3478'] }
];

export const networkConfig = Object.freeze({
  ipv4Endpoint: 'https://api4.ipify.org?format=json',
  ipv6Endpoint: 'https://api6.ipify.org?format=json',
  coreIpProviderGroups: Object.freeze({ 4: coreIpProviderGroups[4], 6: coreIpProviderGroups[6] }),
  reserveIpProviderGroups: Object.freeze({ 4: reserveIpProviderGroups[4], 6: reserveIpProviderGroups[6] }),
  stressIpProviderGroups: Object.freeze({ 4: stressSubset(4), 6: stressSubset(6) }),
  geoIpProviders: Object.freeze([
    Object.freeze({ id: 'ipapi', label: 'ipapi.co', kind: 'ipapi', urlTemplate: 'https://ipapi.co/{ip}/json/' }),
    Object.freeze({ id: 'ipwhois', label: 'ipwho.is', kind: 'ipwhois', urlTemplate: 'https://ipwho.is/{ip}' }),
    Object.freeze({ id: 'freeipapi', label: 'FreeIPAPI', kind: 'freeipapi', urlTemplate: 'https://free.freeipapi.com/api/json/{ip}' }),
    Object.freeze({ id: 'ipapiis', label: 'ipapi.is', kind: 'ipapiis', urlTemplate: 'https://api.ipapi.is/?q={ip}' }),
    Object.freeze({ id: 'sypex-ru', label: 'Sypex Geo RU', kind: 'sypex', families: Object.freeze([4]), urlTemplate: 'https://ru.sxgeo.city/json/{ip}' })
  ]),
  intelligenceUrlTemplate: 'https://api.ipapi.is/?q={ip}',
  dohResolvers: Object.freeze([
    Object.freeze({ id: 'cloudflare', label: 'Cloudflare', kind: 'cloudflare', url: 'https://cloudflare-dns.com/dns-query' }),
    Object.freeze({ id: 'google', label: 'Google', kind: 'google', url: 'https://dns.google/resolve' })
  ]),
  httpEchoEndpoint: 'https://httpbin.org/anything',
  tlsReflectorEndpoint: 'https://tls.peet.ws/api/all',
  stunDestinations: Object.freeze(stunDestinations.map((destination) => Object.freeze({ ...destination, urls: Object.freeze([...destination.urls]) }))),
  stunUrls: Object.freeze(stunDestinations.slice(0, 2).flatMap((destination) => destination.urls)),
  coreIpTimeoutMs: 3200,
  ipProviderHedgeDelayMs: IP_PROVIDER_HEDGE_DELAY_MS,
  requestTimeoutMs: 6000,
  geoIpTimeoutMs: 6000,
  advancedTimeoutMs: 7000,
  fingerprintTimeoutMs: 7000,
  webrtcTimeoutMs: 7000
});

export const ipProviderSmokeCandidates = Object.freeze([
  ...networkConfig.coreIpProviderGroups[4],
  ...networkConfig.coreIpProviderGroups[6],
  ...networkConfig.reserveIpProviderGroups[4],
  ...networkConfig.reserveIpProviderGroups[6]
]);

export function getEnabledChecks(config = features) {
  return ['ipv4', 'ipv6', 'webrtc'].filter((name) => config[name] === true);
}
