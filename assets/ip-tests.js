import { fetchJsonWithTimeout, getIpFamily } from './network.js';

export async function runIpTest({ family, endpoint, timeoutMs, fetchImpl = fetch }) {
  try {
    const payload = await fetchJsonWithTimeout(endpoint, { timeoutMs, fetchImpl });
    const address = typeof payload?.ip === 'string' ? payload.ip.trim() : '';
    if (getIpFamily(address) !== family) {
      return { status: 'error', address: null, family, error: `Invalid IPv${family} response` };
    }
    return { status: 'complete', address, family, error: null };
  } catch (error) {
    const unavailable = error?.name === 'AbortError' || error instanceof TypeError;
    return {
      status: unavailable ? 'unavailable' : 'error',
      address: null,
      family,
      error: unavailable ? `IPv${family} connectivity was not detected.` : 'IP check failed.'
    };
  }
}
