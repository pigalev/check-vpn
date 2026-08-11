function isIpv4(value) {
  if (typeof value !== 'string') return false;
  const parts = value.trim().split('.');
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
}

function isIpv6(value) {
  return typeof value === 'string' && value.trim().includes(':');
}

function validForFamily(value, family) {
  return family === 4 ? isIpv4(value) : family === 6 ? isIpv6(value) : false;
}

function extractAddress(payload, kind) {
  if (kind === 'text') return typeof payload === 'string' ? payload.trim() : null;
  if (!payload || typeof payload !== 'object') return null;
  return payload.ip ?? payload.address ?? null;
}

function errorMessage(error) {
  if (typeof error === 'string') return error;
  return error?.message ?? 'Request failed';
}

export async function runIpEndpoint({
  endpoint,
  family,
  timeoutMs,
  fetchImpl = fetch,
  now = () => performance.now?.() ?? Date.now(),
  signal = null
}) {
  const startedAt = now();
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener('abort', abortFromCaller, { once:true });
  const timer = setTimeout(
    () => controller.abort(new DOMException('Fetch is aborted', 'AbortError')),
    Math.max(1, timeoutMs)
  );
  try {
    const response = await fetchImpl(endpoint.url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: endpoint.kind === 'text' ? undefined : { Accept: 'application/json' }
    });
    if (!response?.ok) throw new Error(`HTTP ${response?.status ?? 'error'}`);
    const payload = endpoint.kind === 'text' ? await response.text() : await response.json();
    const address = extractAddress(payload, endpoint.kind);
    if (!address || !validForFamily(address, family)) throw new Error('Unexpected address family');
    return {
      endpointId: endpoint.id,
      status: 'complete',
      address: address.trim(),
      latencyMs: Math.max(0, Math.round(now() - startedAt)),
      error: null
    };
  } catch (error) {
    return {
      endpointId: endpoint.id,
      status: 'unavailable',
      address: null,
      latencyMs: Math.max(0, Math.round(now() - startedAt)),
      error: errorMessage(error)
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', abortFromCaller);
  }
}

export async function runIpProviderGroup({
  group,
  family,
  timeoutMs,
  fetchImpl = fetch,
  now = () => performance.now?.() ?? Date.now(),
  signal = null
}) {
  const startedAt = now();
  const deadline = startedAt + timeoutMs;
  const attempts = [];

  for (const endpoint of group?.endpoints ?? []) {
    if (signal?.aborted) break;
    const remainingMs = Math.max(0, deadline - now());
    if (remainingMs <= 0) break;
    const attempt = await runIpEndpoint({ endpoint, family, timeoutMs: remainingMs, fetchImpl, now, signal });
    attempts.push(attempt);
    if (attempt.status === 'complete') {
      return {
        id: group.id,
        group: group.group ?? group.id,
        label: group.label ?? group.id,
        family,
        tier: group.tier ?? 'primary',
        status: 'complete',
        address: attempt.address,
        latencyMs: Math.max(0, Math.round(now() - startedAt)),
        endpointId: endpoint.id,
        attempts,
        error: null
      };
    }
  }

  return {
    id: group?.id ?? 'unknown',
    group: group?.group ?? group?.id ?? 'unknown',
    label: group?.label ?? group?.id ?? 'Unknown provider',
    family,
    tier: group?.tier ?? 'primary',
    status: 'unavailable',
    address: null,
    latencyMs: Math.max(0, Math.round(now() - startedAt)),
    endpointId: null,
    attempts,
    error: attempts.at(-1)?.error ?? (signal?.aborted ? errorMessage(signal.reason) : 'Request failed')
  };
}
