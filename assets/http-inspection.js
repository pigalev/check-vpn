import { fetchJsonWithTimeout } from './network.js';

function lowerCaseHeaders(headers = {}) {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]));
}

export function normalizeHttpInspection(payload) {
  if (!payload || typeof payload !== 'object') return { status: 'unavailable', observedIp: null, headers: {}, proxyHeaders: {}, error: 'Echo payload unavailable' };
  const headers = lowerCaseHeaders(payload.headers ?? {});
  const origin = typeof payload.origin === 'string' ? payload.origin.split(',')[0].trim() : null;
  const proxyHeaders = {};
  for (const name of ['via', 'forwarded', 'x-forwarded-for']) {
    if (headers[name]) proxyHeaders[name] = headers[name];
  }
  return { status: 'complete', observedIp: origin, headers, proxyHeaders, error: null };
}

export async function runHttpInspection({ endpoint, timeoutMs, fetchImpl = fetch }) {
  try {
    const payload = await fetchJsonWithTimeout(endpoint, { timeoutMs, fetchImpl });
    return normalizeHttpInspection(payload);
  } catch (error) {
    return { status: 'unavailable', observedIp: null, headers: {}, proxyHeaders: {}, error: error?.message ?? 'HTTP inspection unavailable' };
  }
}
