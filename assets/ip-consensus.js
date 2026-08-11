import { runIpProviderGroup } from './ip-provider-group.js';
import { canGuaranteeStrong, countVotes } from './ip-consensus-race.js';

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
  const vote = countVotes(sources);
  const strong = vote.successful.length >= 3 && vote.winningShare >= (2 / 3);
  const partial = vote.successful.length > 0 && vote.successful.length <= 2 && vote.allAgree;
  return { ...vote, strong, partial };
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
  return sourceShell(group, family, 'not-needed', 'Consensus already guaranteed');
}

function disabledSource(group, family) {
  return sourceShell(group, family, 'disabled', group.disabledReason ?? 'Provider disabled');
}

function buildFinalResult({ family, primaryGroups, primarySources, reserveSources }) {
  const allSources = [...primarySources, ...reserveSources];
  const attemptedSources = allSources.filter((source) => ['complete', 'unavailable'].includes(source.status));
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
  const primaryAvailable = primarySources.filter((source) => source.status === 'complete').length;
  const reserveUsed = reserveSources.some((source) => ['complete', 'unavailable'].includes(source.status));

  return {
    status,
    confidence,
    family,
    address,
    observedAddresses,
    agreement: {
      available: vote.successful.length,
      total: attemptedSources.length,
      agree: vote.allAgree,
      counts: vote.counts,
      selectedVotes: vote.selectedVotes,
      winningShare: vote.winningShare
    },
    sources: allSources,
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
  const configured = [...normalizedPrimary, ...reserveGroups];
  const disabled = new Map(configured
    .filter((group) => group.enabled === false)
    .map((group) => [group.id, disabledSource(group, family)]));
  const enabled = configured.filter((group) => group.enabled !== false);
  const controllers = new Map();
  const settled = new Map();
  let pending = enabled.length;
  let emitted = false;
  let finished = false;
  let finishReason = null;
  let resolveDone;
  const done = new Promise((resolve) => { resolveDone = resolve; });

  function finish(reason) {
    if (finished) return;
    finished = true;
    finishReason = reason;
    if (reason === 'strong-guaranteed') {
      for (const group of enabled) {
        if (!settled.has(group.id)) controllers.get(group.id)?.abort('consensus-guaranteed');
      }
    }
    resolveDone();
  }

  function maybeFinish() {
    if (finished) return;
    if (canGuaranteeStrong({ sources:[...settled.values()], pendingCount:pending })) {
      finish('strong-guaranteed');
      return;
    }
    if (pending === 0) finish('all-settled');
  }

  if (enabled.length === 0) finish('all-settled');

  for (const group of enabled) {
    const controller = new AbortController();
    controllers.set(group.id, controller);
    Promise.resolve(runIpProviderGroup({
      group,
      family,
      timeoutMs,
      fetchImpl,
      signal: controller.signal,
      hedgeDelayMs: group.hedgeDelayMs ?? null
    })).then((source) => {
      if (finished && finishReason === 'strong-guaranteed' && controller.signal.aborted && !settled.has(group.id)) return;
      if (settled.has(group.id)) return;
      settled.set(group.id, source);
      pending = Math.max(0, pending - 1);
      if (!emitted && source.status === 'complete') {
        emitted = true;
        onFirstValid?.(source);
      }
      maybeFinish();
    }).catch(() => {
      if (finished && finishReason === 'strong-guaranteed' && controller.signal.aborted) return;
      if (settled.has(group.id)) return;
      settled.set(group.id, sourceShell(group, family, 'unavailable', 'Request failed'));
      pending = Math.max(0, pending - 1);
      maybeFinish();
    });
  }

  await done;

  function sourceFor(group) {
    if (disabled.has(group.id)) return disabled.get(group.id);
    if (settled.has(group.id)) return settled.get(group.id);
    if (finishReason === 'strong-guaranteed') return notNeededSource(group, family);
    return sourceShell(group, family, 'unavailable', 'Request did not settle');
  }

  const primarySources = normalizedPrimary.map(sourceFor);
  const reserveSources = reserveGroups.map(sourceFor);

  return buildFinalResult({
    family,
    primaryGroups: normalizedPrimary,
    primarySources,
    reserveSources
  });
}

export function runIpConsensus(args) {
  return runIpConsensusProgressive(args);
}
