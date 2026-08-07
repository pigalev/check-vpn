import { fetchJsonWithTimeout } from './network.js';

function bool(value) { return typeof value === 'boolean' ? value : null; }
function text(value) { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function asn(value) {
  if (typeof value === 'number') return `AS${value}`;
  const t = text(value); if (!t) return null; return /^AS/i.test(t) ? t.toUpperCase() : /^\d+$/.test(t) ? `AS${t}` : t;
}

export function normalizeNetworkIntelligence(payload, ip) {
  if (!payload || typeof payload !== 'object' || payload.error) return { status: 'unavailable', ip, error: payload?.message ?? 'Intelligence unavailable' };
  const company = payload.company ?? {};
  const network = payload.asn ?? {};
  const abuse = payload.abuse ?? {};
  return {
    status: 'complete', ip,
    rir: text(network.rir) ?? text(payload.rir),
    isMobile: bool(payload.is_mobile), isSatellite: bool(payload.is_satellite), isCrawler: bool(payload.is_crawler),
    isDatacenter: bool(payload.is_datacenter), isTor: bool(payload.is_tor), isProxy: bool(payload.is_proxy), isVpn: bool(payload.is_vpn), isAbuser: bool(payload.is_abuser) ?? bool(abuse.is_abuser),
    asn: asn(network.asn ?? payload.asn),
    organization: text(network.org) ?? text(company.name) ?? text(payload.company),
    prefix: text(network.route) ?? text(payload.prefix),
    networkType: text(company.type) ?? text(payload.type),
    rawProvider: 'ipapi.is', error: null
  };
}

export async function runNetworkIntelligence({ ip, endpointTemplate, timeoutMs, fetchImpl = fetch }) {
  try {
    const payload = await fetchJsonWithTimeout(endpointTemplate.replace('{ip}', encodeURIComponent(ip)), { timeoutMs, fetchImpl });
    return normalizeNetworkIntelligence(payload, ip);
  } catch (error) {
    return { status: 'unavailable', ip, error: error?.message ?? 'Intelligence unavailable' };
  }
}
