import { runIpProviderGroup } from './ip-provider-group.js';

function asLegacyGroup(provider, family) {
  return {
    id: provider.id,
    group: provider.group ?? provider.id,
    label: provider.label ?? provider.id,
    family,
    tier: 'primary',
    endpoints: [{ id: provider.id, kind: provider.kind, url: provider.url }]
  };
}

function normalizePrimaryGroups({ primaryGroups, providers, family }) {
  if (Array.isArray(primaryGroups)) return primaryGroups;
  return (providers ?? []).map((provider) => asLegacyGroup(provider, family));
}

function evaluateGroupVotes(sources) {
  const successful = sources.filter((source) => source.status === 'complete' && source.address);
  const counts = {};
  for (const source of successful) counts[source.address] = (counts[source.address] ?? 0) + 1;
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const winner = ranked[0]?.[0] ?? null;
  const selectedVotes = ranked[0]?.[1] ?? 0;
  const winningShare = successful.length ? selectedVotes / successful.length : 0;
  const allAgree = ranked.length <= 1;
  const strong = successful.length >= 3 && winningShare >= (2 / 3);
  const partial = successful.length > 0 && successful.length <= 2 && allAgree;
  return { successful, counts, ranked, winner, selectedVotes, winningShare, allAgree, strong, partial };
}

function sourceShell(group, family, status, error = null) {
  return {
    id: group.id,
    group: group.group ?? group.id,
    label: group.label ?? group.id,
    family,
    tier: group.tier ?? 'reserve',
    status,
    address: null,
    latencyMs: 0,
    endpointId: null,
    attempts: [],
    error
  };
}

function notNeededSource(group, family) {
  return sourceShell(group, family, 'not-needed');
}

function disabledSource(group, family) {
  return sourceShell(group, family, 'disabled', group.disabledReason ?? 'Provider disabled');
}

function buildFinalResult({ family, primaryGroups, primarySources, reserveSources, reserveUsed }) {
  const attemptedReserve = reserveSources.filter((source) => !['not-needed', 'disabled'].includes(source.status));
  const attemptedSources = [...primarySources, ...attemptedReserve];
  const vote = evaluateGroupVotes(attemptedSources);
  let confidence;
  let status;
  let address = null;

  if (vote.strong) {
    confidence = 'strong';
    status = 'complete';
    address = vote.winner;
  } else if (vote.partial) {
    confidence = 'partial';
    status = 'complete';
    address = vote.winner;
  } else if (vote.successful.length) {
    confidence = 'no-consensus';
    status = 'partial';
  } else {
    confidence = 'unavailable';
    status = 'unavailable';
  }

  const observedAddresses = [...new Set(vote.successful.map((source) => source.address))];
  const totalAttempted = primaryGroups.length + attemptedReserve.length;
  const primaryAvailable = primarySources.filter((source) => source.status === 'complete').length;

  return {
    status,
    confidence,
    family,
    address,
    observedAddresses,
    agreement: {
      available: vote.successful.length,
      total: totalAttempted,
      agree: vote.allAgree,
      counts: vote.counts,
      selectedVotes: vote.selectedVotes,
      winningShare: vote.winningShare
    },
    sources: [...primarySources, ...reserveSources],
    primary: {
      available: primaryAvailable,
      total: primaryGroups.length,
      sources: primarySources
    },
    reserve: {
      used: reserveUsed,
      sources: reserveSources
    },
    error: vote.successful.length ? null : `IPv${family} unavailable`
  };
}

export async function runIpProvider({ provider, family, timeoutMs, fetchImpl = fetch }) {
  const result = await runIpProviderGroup({
    group: asLegacyGroup(provider, family),
    family,
    timeoutMs,
    fetchImpl
  });
  return {
    id: provider.id,
    label: provider.label,
    group: provider.group ?? provider.id,
    status: result.status,
    address: result.address,
    family,
    latencyMs: result.latencyMs,
    error: result.error,
    endpointId: result.endpointId,
    attempts: result.attempts
  };
}

export async function runIpConsensusProgressive({
  family,
  primaryGroups,
  reserveGroups = [],
  providers,
  timeoutMs,
  fetchImpl = fetch,
  onFirstValid = null
}) {
  const normalizedPrimary = normalizePrimaryGroups({ primaryGroups, providers, family });
  let emitted = false;

  const primarySources = await Promise.all(normalizedPrimary.map(async (group) => {
    const source = await runIpProviderGroup({ group, family, timeoutMs, fetchImpl });
    if (!emitted && source.status === 'complete') {
      emitted = true;
      onFirstValid?.(source);
    }
    return source;
  }));

  const primaryVote = evaluateGroupVotes(primarySources);
  let reserveUsed = false;
  let reserveSources;

  if (primaryVote.strong) {
    reserveSources = reserveGroups.map((group) => notNeededSource(group, family));
  } else {
    reserveUsed = reserveGroups.length > 0;
    reserveSources = await Promise.all(reserveGroups.map(async (group) => {
      if (group.enabled === false) return disabledSource(group, family);
      const source = await runIpProviderGroup({ group, family, timeoutMs, fetchImpl });
      if (!emitted && source.status === 'complete') {
        emitted = true;
        onFirstValid?.(source);
      }
      return source;
    }));
  }

  return buildFinalResult({
    family,
    primaryGroups: normalizedPrimary,
    primarySources,
    reserveSources,
    reserveUsed
  });
}

export function runIpConsensus(args) {
  return runIpConsensusProgressive(args);
}
