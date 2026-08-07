import { classifyIpAddress, isPublicInternetAddress } from './ip-classification.js';

function familyValues(profile, bucket, family) {
  return profile?.[bucket]?.[family] ?? profile?.[bucket]?.[`ipv${family}`] ?? [];
}

export function classifyLeakAddress(address, guidedProfile = {}) {
  const details = classifyIpAddress(address);
  const family = details.family;
  if (!address || ![4, 6].includes(family) || !isPublicInternetAddress(address)) {
    return { family, scope: details.scope ?? 'invalid', relation: 'non-public', details };
  }
  if (familyValues(guidedProfile, 'knownReal', family).includes(address)) {
    return { family, scope: details.scope, relation: 'known-real', details };
  }
  if (familyValues(guidedProfile, 'knownVpn', family).includes(address)) {
    return { family, scope: details.scope, relation: 'known-vpn', details };
  }
  return { family, scope: details.scope, relation: 'unknown-public', details };
}

export function confirmationForExposure(exposure) {
  if (exposure?.relation === 'known-real') return 'known-real';
  if (exposure?.relation !== 'unknown-public') return null;
  const independent = new Set(exposure.transportClasses ?? []).size >= 2;
  return (exposure.observationCount ?? 0) >= 2 || independent ? 'confirmed-unknown' : 'unconfirmed-unknown';
}
