import { classifyLeakAddress } from './leak-classifier.js';

function countText(value, singular, plural = `${singular}s`) {
  return `${value ?? 0} ${(value ?? 0) === 1 ? singular : plural}`;
}

export function buildGuidedVerdict({ exposures = [], coverage = {}, profile = {} } = {}) {
  const knownReal = exposures.filter((item) => item?.relation === 'known-real');
  if (knownReal.length) {
    const families = [...new Set(knownReal.map((item) => item.family).filter(Boolean))].map((family) => `IPv${family}`).join(' / ');
    return {
      result: 'real-leak',
      label: 'REAL IP LEAK DETECTED',
      reasons: [`Captured pre-VPN ${families || 'public address'} observed during the VPN test.`]
    };
  }

  if (exposures.some((item) => item?.confirmationLevel === 'confirmed-unknown')) {
    return {
      result: 'unexpected-leak',
      label: 'UNEXPECTED PUBLIC IP DETECTED',
      reasons: ['An unexpected public IP was repeated or confirmed by an independent transport path.']
    };
  }

  if (exposures.some((item) => item?.confirmationLevel === 'unconfirmed-unknown')) {
    return {
      result: 'review',
      label: 'REVIEW',
      reasons: ['An unexpected public IP was observed once but could not be confirmed.']
    };
  }

  if (!coverage?.sufficient) {
    return {
      result: 'inconclusive',
      label: 'TEST INCONCLUSIVE',
      reasons: ['No confirmed leak was observed, but sampling coverage was insufficient.']
    };
  }

  const parts = [
    countText(coverage.attemptedFastSamples, 'scheduled HTTP cycle'),
    countText(coverage.reconnectHttpAttempts, 'reconnect probe'),
    countText(coverage.webRtcSessionsCompleted, 'WebRTC session'),
    countText(coverage.transportClassesReached, 'network path')
  ];
  return {
    result: 'clean',
    label: 'NO KNOWN REAL IP OBSERVED',
    reasons: [`Known real addresses were not observed across ${parts.join(', ')}.`]
  };
}

function pathIdFor(observation, index) {
  return observation?.providerId
    ?? observation?.serverId
    ?? observation?.pathId
    ?? `${observation?.transportClass ?? observation?.channel ?? 'path'}-${index}`;
}

export function buildPathMatrix(observations = [], profile = {}) {
  const rows = new Map();
  observations.forEach((observation, index) => {
    const pathId = pathIdFor(observation, index);
    const complete = observation?.status === 'complete' || observation?.successful === true;
    const relation = complete && observation?.address
      ? observation.relation ?? classifyLeakAddress(observation.address, profile).relation
      : null;
    const previous = rows.get(pathId);
    const row = {
      pathId,
      label: observation?.providerLabel ?? observation?.serverLabel ?? observation?.source ?? pathId,
      transportClass: observation?.transportClass ?? observation?.channel ?? 'unknown',
      address: complete ? observation?.address ?? null : null,
      family: observation?.family ?? null,
      relation,
      status: complete ? 'complete' : observation?.status ?? 'unavailable',
      observationCount: (previous?.observationCount ?? 0) + 1,
      timestampMs: observation?.timestampMs ?? null
    };
    if (!previous || (row.timestampMs ?? -Infinity) >= (previous.timestampMs ?? -Infinity)) rows.set(pathId, row);
    else rows.set(pathId, { ...previous, observationCount: row.observationCount });
  });
  return [...rows.values()];
}

function cloneProfile(profile = {}) {
  return {
    ...profile,
    knownReal: { 4: [...(profile.knownReal?.[4] ?? [])], 6: [...(profile.knownReal?.[6] ?? [])] },
    knownVpn: { 4: [...(profile.knownVpn?.[4] ?? [])], 6: [...(profile.knownVpn?.[6] ?? [])] }
  };
}

export function buildGuidedLeakReport({ profile = {}, captures = {}, aggressive = {}, media = null, observations = [] } = {}) {
  const exposures = (aggressive?.exposures ?? []).map((item) => ({ ...item }));
  const coverage = { ...(aggressive?.coverage ?? {}) };
  return {
    profile: cloneProfile(profile),
    captures: { ...captures },
    verdict: buildGuidedVerdict({ exposures, coverage, profile }),
    exposures,
    paths: buildPathMatrix(observations, profile),
    coverage,
    reconnectBurst: aggressive?.reconnectBurst ? { ...aggressive.reconnectBurst } : null,
    media: media ? { ...media } : null
  };
}
