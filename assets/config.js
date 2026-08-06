export const features = Object.freeze({
  ipv4: true,
  ipv6: true,
  webrtc: true,
  dns: false,
  torrent: false,
  email: false
});

export const networkConfig = Object.freeze({
  ipv4Endpoint: 'https://api4.ipify.org?format=json',
  ipv6Endpoint: 'https://api6.ipify.org?format=json',
  stunUrls: Object.freeze([
    'stun:stun.cloudflare.com:3478',
    'stun:stun.l.google.com:19302'
  ]),
  requestTimeoutMs: 6000,
  webrtcTimeoutMs: 7000
});

export function getEnabledChecks(config = features) {
  return ['ipv4', 'ipv6', 'webrtc'].filter((name) => config[name] === true);
}
