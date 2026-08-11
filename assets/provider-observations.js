import { runIpProviderGroup } from './ip-provider-group.js';

export async function collectProviderObservations({ family, groups, timeoutMs, fetchImpl = fetch, now = () => Date.now(), trigger = 'manual' }) {
  const sources = await Promise.all((groups ?? []).map((group) => runIpProviderGroup({ group, family, timeoutMs, fetchImpl })));
  return sources.map((source) => ({
    timestampMs: now(),
    family,
    providerId: source.id,
    providerLabel: source.label,
    providerGroup: source.group ?? source.id,
    address: source.address,
    latencyMs: source.latencyMs,
    status: source.status,
    error: source.error,
    attempts: source.attempts ?? [],
    trigger
  }));
}
