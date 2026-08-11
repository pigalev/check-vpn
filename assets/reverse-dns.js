import { fetchJsonWithTimeout } from './network.js';

function expandIpv6(ip) {
  const [leftRaw, rightRaw = ''] = ip.split('::');
  const left = leftRaw ? leftRaw.split(':') : [];
  const right = rightRaw ? rightRaw.split(':') : [];
  const missing = 8 - left.length - right.length;
  const groups = [...left, ...Array(Math.max(0, missing)).fill('0'), ...right].map((g) => g.padStart(4, '0'));
  if (groups.length !== 8) throw new Error('Invalid IPv6 address');
  return groups.join('');
}

export function toReverseDnsName(ip) {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) return `${ip.split('.').reverse().join('.')}.in-addr.arpa`;
  if (ip.includes(':')) return `${expandIpv6(ip).split('').reverse().join('.')}.ip6.arpa`;
  throw new Error('Unsupported IP address');
}

function normalizeAnswers(payload) {
  return Array.isArray(payload?.Answer) ? payload.Answer.filter((a) => a.type === 12 && typeof a.data === 'string').map((a) => a.data.replace(/\.$/, '')) : [];
}

async function queryResolver({ resolver, name, timeoutMs, fetchImpl }) {
  const params = new URLSearchParams({ name, type: 'PTR' });
  const url = `${resolver.url}?${params}`;
  try {
    const payload = await fetchJsonWithTimeout(url, { timeoutMs, fetchImpl, headers: resolver.kind === 'cloudflare' ? { Accept: 'application/dns-json' } : undefined });
    if (payload?.Status !== 0) return { id: resolver.id, label: resolver.label, status: 'error', names: [], error: `DNS status ${payload?.Status}` };
    return { id: resolver.id, label: resolver.label, status: 'complete', names: normalizeAnswers(payload), error: null };
  } catch (error) {
    return { id: resolver.id, label: resolver.label, status: 'unavailable', names: [], error: error?.message ?? 'DoH failed' };
  }
}

export async function runReverseDns({ ip, resolvers, timeoutMs, fetchImpl = fetch }) {
  const name = toReverseDnsName(ip);
  const sources = await Promise.all(resolvers.map((resolver) => queryResolver({ resolver, name, timeoutMs, fetchImpl })));
  const reachedSources = sources.filter((source) => source.status === 'complete');
  const recordSources = reachedSources.filter((source) => source.names.length > 0);
  const names = [...new Set(recordSources.flatMap((source) => source.names))];
  const distinctRecordSets = new Set(recordSources.map((source) => source.names.slice().sort().join('|')));

  let state;
  if (reachedSources.length === 0) state = 'unavailable';
  else if (recordSources.length === 0) state = 'no-record';
  else if (recordSources.length === 1) state = 'single-source';
  else state = distinctRecordSets.size === 1 ? 'agree' : 'disagree';

  return {
    status: reachedSources.length ? 'complete' : 'unavailable',
    ip,
    names,
    agreement: {
      reached: reachedSources.length,
      available: reachedSources.length,
      total: resolvers.length,
      recordsAvailable: recordSources.length,
      recordSources: recordSources.length,
      state,
      agree: state === 'agree' ? true : state === 'disagree' ? false : null
    },
    sources,
    error: reachedSources.length ? null : 'Reverse DNS unavailable'
  };
}
