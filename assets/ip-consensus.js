import { fetchJsonWithTimeout } from './network.js';

function isIpv4(value) { return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value); }
function isIpv6(value) { return typeof value === 'string' && value.includes(':'); }
function validForFamily(value, family) { return family === 4 ? isIpv4(value) : isIpv6(value); }

function extractAddress(payload, kind) {
  if (kind === 'text') return typeof payload === 'string' ? payload.trim() : null;
  if (!payload || typeof payload !== 'object') return null;
  if (kind === 'ipapi') return payload.ip ?? null;
  if (kind === 'ipwhois') return payload.ip ?? null;
  return payload.ip ?? payload.address ?? null;
}

async function runProvider({ provider, family, timeoutMs, fetchImpl }) {
  const started = performance.now?.() ?? Date.now();
  try {
    let payload;
    if (provider.kind === 'text') {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(provider.url, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        payload = await response.text();
      } finally { clearTimeout(timer); }
    } else {
      payload = await fetchJsonWithTimeout(provider.url, { timeoutMs, fetchImpl });
    }
    const address = extractAddress(payload, provider.kind);
    if (!address || !validForFamily(address, family)) throw new Error('Unexpected address family');
    return { id: provider.id, label: provider.label, status: 'complete', address, family, latencyMs: Math.max(0, Math.round((performance.now?.() ?? Date.now()) - started)), error: null };
  } catch (error) {
    return { id: provider.id, label: provider.label, status: 'unavailable', address: null, family, latencyMs: Math.max(0, Math.round((performance.now?.() ?? Date.now()) - started)), error: error?.message ?? 'Request failed' };
  }
}

export async function runIpConsensus({ family, providers, timeoutMs, fetchImpl = fetch }) {
  const sources = await Promise.all(providers.map((provider) => runProvider({ provider, family, timeoutMs, fetchImpl })));
  const successful = sources.filter((source) => source.status === 'complete');
  const counts = {};
  for (const source of successful) counts[source.address] = (counts[source.address] ?? 0) + 1;
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const winner = ranked[0]?.[0] ?? null;
  const topCount = ranked[0]?.[1] ?? 0;
  const tied = ranked.length > 1 && ranked[1][1] === topCount;
  const address = tied ? successful[0]?.address ?? null : winner;
  return {
    status: successful.length ? 'complete' : 'unavailable',
    family,
    address,
    agreement: { available: successful.length, total: providers.length, agree: ranked.length <= 1, counts },
    sources,
    error: successful.length ? null : `IPv${family} unavailable`
  };
}
