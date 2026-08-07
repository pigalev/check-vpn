export function getIpFamily(address) {
  if (typeof address !== 'string' || address.length === 0) return null;
  const value = address.trim();
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) {
    const octets = value.split('.').map(Number);
    return octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? 4 : null;
  }
  if (!value.includes(':') || !/^[0-9a-f:]+$/i.test(value)) return null;
  const doubleColonCount = (value.match(/::/g) || []).length;
  if (doubleColonCount > 1) return null;
  const parts = value.split(':');
  if (!value.includes('::') && parts.length !== 8) return null;
  if (parts.some((part) => part.length > 4)) return null;
  return 6;
}

export function classifyAddress(address) {
  if (typeof address !== 'string' || address.length === 0) return 'invalid';
  const value = address.trim().toLowerCase();
  if (value.endsWith('.local')) return 'mdns';
  const family = getIpFamily(value);
  if (family === 4) {
    const [a, b] = value.split('.').map(Number);
    if (a === 127) return 'loopback';
    if (a === 169 && b === 254) return 'link-local';
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'private';
    return 'public';
  }
  if (family === 6) {
    if (value === '::1') return 'loopback';
    if (/^fe[89ab]/.test(value)) return 'link-local';
    if (value.startsWith('fc') || value.startsWith('fd')) return 'private';
    return 'public';
  }
  return 'invalid';
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
