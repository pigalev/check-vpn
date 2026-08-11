import { runIpProviderGroup } from './ip-provider-group.js';

function legacyGroup(provider, family) {
  return {
    id: provider.id,
    group: provider.group ?? provider.id,
    label: provider.label ?? provider.id,
    family,
    tier: 'stress',
    endpoints: [{ id: provider.id, kind: provider.kind, url: provider.url }]
  };
}

export async function collectProviderObservations({ family, groups, providers, timeoutMs, fetchImpl = fetch, now = () => Date.now(), trigger = 'manual' }) {
  const votingGroups = groups ?? (providers ?? []).map((provider) => legacyGroup(provider, family));
  const sources = await Promise.all(votingGroups.map((group) => runIpProviderGroup({ group, family, timeoutMs, fetchImpl })));
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
