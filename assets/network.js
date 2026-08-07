import { classifyIpAddress, getClassifiedIpFamily } from './ip-classification.js';

export function getIpFamily(address) {
  return getClassifiedIpFamily(address);
}

export function classifyAddress(address) {
  if (typeof address !== 'string' || address.length === 0) return 'invalid';
  const value = address.trim().toLowerCase();
  if (value.endsWith('.local')) return 'mdns';
  const result = classifyIpAddress(value);
  if (result.scope === 'global' && result.public) return 'public';
  return result.scope;
}

export async function fetchJsonWithTimeout(url, { timeoutMs = 6000, fetchImpl = fetch, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json', ...headers }
    });
    if (!response?.ok) throw new Error(`HTTP ${response?.status ?? 'error'}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
