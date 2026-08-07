import { runIpProvider } from './ip-consensus.js';

export async function collectProviderObservations({ family, providers, timeoutMs, fetchImpl = fetch, now = () => Date.now(), trigger = 'manual' }) {
  const completedAt = now();
  const sources = await Promise.all((providers ?? []).map((provider) => runIpProvider({ provider, family, timeoutMs, fetchImpl })));
  return sources.map((source, index) => ({
    timestampMs: completedAt,
    family,
    providerId: source.id,
    providerLabel: source.label,
    providerGroup: providers?.[index]?.group ?? source.id,
    address: source.address,
    latencyMs: source.latencyMs,
    status: source.status,
    error: source.error,
    trigger
  }));
}
