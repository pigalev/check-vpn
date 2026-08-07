import { classifyIpAddress, isPublicInternetAddress } from './ip-classification.js';
import { confirmationForExposure } from './leak-classifier.js';

function normalizeBaseline(baseline = {}) {
  return {
    4: [...new Set(baseline[4] ?? baseline.ipv4 ?? [])],
    6: [...new Set(baseline[6] ?? baseline.ipv6 ?? [])]
  };
}

export function createLeakState({ baseline = {}, startedAt = 0, durationMs = 60000 } = {}) {
  return {
    baseline: normalizeBaseline(baseline),
    startedAt,
    durationMs,
    samples: [],
    networkEvents: [],
    exposures: [],
    schedulerAttempts: [],
    stoppedEarly: false
  };
}

function cloneExposure(exposure) {
  return {
    ...exposure,
    sources: [...(exposure.sources ?? [])],
    channels: [...(exposure.channels ?? [])],
    timestampsMs: [...(exposure.timestampsMs ?? [])],
    transportClasses: [...(exposure.transportClasses ?? [])],
    providerGroups: [...(exposure.providerGroups ?? [])],
    perChannelCounts: { ...(exposure.perChannelCounts ?? {}) }
  };
}

function relationForObservation(observation, trusted) {
  if (observation.relation) return observation.relation;
  return trusted.includes(observation.address) ? 'known-vpn' : 'unknown-public';
}

export function applyObservation(state, observation) {
  const next = {
    ...state,
    samples: [...state.samples, observation],
    exposures: state.exposures.map(cloneExposure)
  };
  if (!observation?.successful || !observation.address || !isPublicInternetAddress(observation.address)) return next;
  const family = observation.family ?? classifyIpAddress(observation.address).family;
  if (![4, 6].includes(family)) return next;
  const trusted = next.baseline[family] ?? [];
  const relation = relationForObservation(observation, trusted);

  if (relation === 'known-vpn' || trusted.includes(observation.address)) {
    for (const exposure of next.exposures) {
      if (exposure.family === family && exposure.baselineRestoredAtMs == null && observation.timestampMs >= exposure.lastSeenAtMs) {
        exposure.baselineRestoredAtMs = observation.timestampMs;
        exposure.approxExposureMs = Math.max(0, observation.timestampMs - exposure.firstSeenAtMs);
      }
    }
    return next;
  }

  if (!['known-real', 'unknown-public'].includes(relation)) return next;

  const key = `${family}|${observation.address}`;
  let exposure = next.exposures.find((item) => item.key === key);
  if (!exposure) {
    exposure = {
      key,
      address: observation.address,
      family,
      relation,
      reason: relation === 'known-real'
        ? `Known real IPv${family} appeared during VPN test`
        : family === 6 && trusted.length === 0 ? 'IPv6 appeared during VPN test' : 'Unexpected public IP',
      firstSeenAtMs: observation.timestampMs,
      lastSeenAtMs: observation.timestampMs,
      observationCount: 0,
      sources: [],
      channels: [],
      transportClasses: [],
      providerGroups: [],
      perChannelCounts: {},
      firstDetector: observation.source ?? observation.channel ?? null,
      timestampsMs: [],
      baselineRestoredAtMs: null,
      approxExposureMs: null,
      confirmationLevel: null
    };
    next.exposures.push(exposure);
  }

  if (exposure.relation !== 'known-real' && relation === 'known-real') exposure.relation = 'known-real';
  exposure.lastSeenAtMs = Math.max(exposure.lastSeenAtMs, observation.timestampMs);
  exposure.observationCount += 1;
  if (observation.source && !exposure.sources.includes(observation.source)) exposure.sources.push(observation.source);
  if (observation.channel && !exposure.channels.includes(observation.channel)) exposure.channels.push(observation.channel);
  if (observation.transportClass && !exposure.transportClasses.includes(observation.transportClass)) exposure.transportClasses.push(observation.transportClass);
  if (observation.providerGroup && !exposure.providerGroups.includes(observation.providerGroup)) exposure.providerGroups.push(observation.providerGroup);
  if (observation.channel) exposure.perChannelCounts[observation.channel] = (exposure.perChannelCounts[observation.channel] ?? 0) + 1;
  exposure.timestampsMs.push(observation.timestampMs);
  exposure.approxExposureMs = exposure.observationCount >= 2 ? Math.max(0, exposure.lastSeenAtMs - exposure.firstSeenAtMs) : null;
  exposure.confirmationLevel = confirmationForExposure(exposure);
  return next;
}

export function applyNetworkEvent(state, event) {
  return { ...state, networkEvents: [...state.networkEvents, event] };
}

export function calculateCoverage(state, config) {
  const interval = config.aggressiveHttpIntervalMs;
  const expectedFastSamples = Math.max(1, Math.floor((state.durationMs ?? config.aggressiveDurationMs) / interval));
  const attempts = state.schedulerAttempts ?? [];
  let largestGapMs = 0;
  const ordered = attempts.map((item) => item.actualMs).filter(Number.isFinite).sort((a, b) => a - b);
  for (let i = 1; i < ordered.length; i += 1) largestGapMs = Math.max(largestGapMs, ordered[i] - ordered[i - 1]);
  const successfulHttpSamples = (state.samples ?? []).filter((sample) => sample.successful && sample.channel === 'http' && sample.address).length;
  const attemptedFastSamples = attempts.length;
  const throttled = largestGapMs > interval * config.aggressiveGapMultiplier;
  const sufficient = !throttled
    && attemptedFastSamples >= config.aggressiveMinHttpAttempts
    && successfulHttpSamples >= config.aggressiveMinSuccessfulHttpSamples
    && !state.stoppedEarly;
  return {
    expectedFastSamples,
    attemptedFastSamples,
    successfulHttpSamples,
    largestGapMs,
    throttled,
    sufficient,
    requestAvailabilityRatio: attemptedFastSamples ? successfulHttpSamples / attemptedFastSamples : 0
  };
}

export function finalizeLeakResult(state, config, nowMs) {
  const coverage = calculateCoverage(state, config);
  const exposures = state.exposures.map((exposure) => {
    const cloned = cloneExposure(exposure);
    if (cloned.baselineRestoredAtMs != null) return cloned;
    if ((cloned.observationCount ?? 0) >= 2) {
      cloned.approxExposureMs = Math.max(0, cloned.lastSeenAtMs - cloned.firstSeenAtMs);
    } else {
      cloned.approxExposureMs = null;
    }
    return cloned;
  });
  if (exposures.length) return { result: 'leak', label: 'Leak detected', reasons: ['Unexpected public address observed.'], exposures, coverage };
  if (!coverage.sufficient) {
    const reasons = [];
    if (coverage.throttled) reasons.push('Browser timer throttling or a large coverage gap was detected.');
    if (coverage.attemptedFastSamples < config.aggressiveMinHttpAttempts) reasons.push('Too few HTTP sampling attempts.');
    if (coverage.successfulHttpSamples < config.aggressiveMinSuccessfulHttpSamples) reasons.push('Too few successful HTTP observations.');
    if (state.stoppedEarly) reasons.push('Test stopped before the full observation window completed.');
    return { result: 'inconclusive', label: 'Inconclusive', reasons, exposures, coverage };
  }
  return { result: 'clean', label: 'No unexpected IP observed', reasons: [], exposures, coverage };
}
