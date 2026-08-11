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

function groupBase(group, family) {
  return {
    id: group?.id ?? 'unknown',
    group: group?.group ?? group?.id ?? 'unknown',
    label: group?.label ?? group?.id ?? 'Unknown provider',
    family,
    tier: group?.tier ?? 'primary'
  };
}

function unavailableGroup(group, family, startedAt, now, attempts, signal = null) {
  return {
    ...groupBase(group, family),
    status: 'unavailable',
    address: null,
    latencyMs: Math.max(0, Math.round(now() - startedAt)),
    endpointId: null,
    attempts,
    error: attempts.filter(Boolean).at(-1)?.error ?? (signal?.aborted ? errorMessage(signal.reason) : 'Request failed')
  };
}

function completeGroup(group, family, startedAt, now, endpoint, attempt, attempts) {
  return {
    ...groupBase(group, family),
    status: 'complete',
    address: attempt.address,
    latencyMs: Math.max(0, Math.round(now() - startedAt)),
    endpointId: endpoint.id,
    attempts,
    error: null
  };
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

async function runSerialGroup({ group, family, timeoutMs, fetchImpl, now, signal }) {
  const startedAt = now();
  const deadline = startedAt + timeoutMs;
  const attempts = [];
  for (const endpoint of group?.endpoints ?? []) {
    if (signal?.aborted) break;
    const remainingMs = Math.max(0, deadline - now());
    if (remainingMs <= 0) break;
    const attempt = await runIpEndpoint({ endpoint, family, timeoutMs: remainingMs, fetchImpl, now, signal });
    attempts.push(attempt);
    if (attempt.status === 'complete') return completeGroup(group, family, startedAt, now, endpoint, attempt, attempts);
  }
  return unavailableGroup(group, family, startedAt, now, attempts, signal);
}

async function runHedgedGroup({ group, family, timeoutMs, fetchImpl, now, signal, hedgeDelayMs }) {
  const endpoints = group?.endpoints ?? [];
  if (endpoints.length !== 2) return runSerialGroup({ group, family, timeoutMs, fetchImpl, now, signal });

  const startedAt = now();
  const deadline = startedAt + timeoutMs;
  const attempts = new Array(2);
  const started = [false, false];
  const children = [new AbortController(), new AbortController()];
  let finished = false;
  let hedgeTimer = null;
  let resolveGroup;
  const resultPromise = new Promise((resolve) => { resolveGroup = resolve; });

  const abortChildrenFromCaller = () => {
    for (const controller of children) {
      if (!controller.signal.aborted) controller.abort(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    }
  };
  if (signal?.aborted) abortChildrenFromCaller();
  else signal?.addEventListener('abort', abortChildrenFromCaller, { once:true });

  function cleanup() {
    if (hedgeTimer != null) clearTimeout(hedgeTimer);
    signal?.removeEventListener?.('abort', abortChildrenFromCaller);
  }

  function finishUnavailable() {
    if (finished) return;
    finished = true;
    cleanup();
    resolveGroup(unavailableGroup(group, family, startedAt, now, attempts.filter(Boolean), signal));
  }

  function finishComplete(index, attempt) {
    if (finished) return;
    finished = true;
    if (hedgeTimer != null) clearTimeout(hedgeTimer);
    const other = index === 0 ? 1 : 0;
    if (started[other] && !children[other].signal.aborted) children[other].abort('Another endpoint succeeded');
    if (started[other] && !attempts[other]) {
      attempts[other] = {
        endpointId: endpoints[other].id,
        status: 'not-needed',
        address: null,
        latencyMs: Math.max(0, Math.round(now() - startedAt)),
        error: 'Another endpoint succeeded'
      };
    }
    cleanup();
    resolveGroup(completeGroup(group, family, startedAt, now, endpoints[index], attempt, attempts.filter(Boolean)));
  }

  function maybeFinishUnavailable() {
    if (finished) return;
    if (started[0] && started[1] && attempts[0]?.status !== 'complete' && attempts[1]?.status !== 'complete' && attempts[0] && attempts[1]) {
      finishUnavailable();
    }
  }

  function startEndpoint(index) {
    if (finished || started[index]) return;
    started[index] = true;
    const remainingMs = Math.max(0, deadline - now());
    if (remainingMs <= 0) {
      attempts[index] = { endpointId:endpoints[index].id, status:'unavailable', address:null, latencyMs:0, error:'Fetch is aborted' };
      maybeFinishUnavailable();
      return;
    }
    void runIpEndpoint({
      endpoint:endpoints[index], family, timeoutMs:remainingMs, fetchImpl, now, signal:children[index].signal
    }).then((attempt) => {
      if (finished) return;
      attempts[index] = attempt;
      if (attempt.status === 'complete') {
        finishComplete(index, attempt);
        return;
      }
      if (index === 0 && !started[1]) startEndpoint(1);
      maybeFinishUnavailable();
    });
  }

  startEndpoint(0);
  hedgeTimer = setTimeout(() => startEndpoint(1), Math.max(0, Math.min(hedgeDelayMs, timeoutMs)));
  return resultPromise;
}

export async function runIpProviderGroup({
  group,
  family,
  timeoutMs,
  fetchImpl = fetch,
  now = () => performance.now?.() ?? Date.now(),
  signal = null,
  hedgeDelayMs = group?.hedgeDelayMs ?? null
}) {
  if (Number.isFinite(hedgeDelayMs) && hedgeDelayMs >= 0 && (group?.endpoints?.length ?? 0) > 1) {
    return runHedgedGroup({ group, family, timeoutMs, fetchImpl, now, signal, hedgeDelayMs });
  }
  return runSerialGroup({ group, family, timeoutMs, fetchImpl, now, signal });
}
