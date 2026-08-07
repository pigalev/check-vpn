export const GUIDED_PROFILE_SCHEMA_VERSION = 1;
const DEFAULT_KEY = 'check-vpn:guided-leak:v1';

export function createEmptyGuidedProfile() {
  return {
    schemaVersion: GUIDED_PROFILE_SCHEMA_VERSION,
    step: 'real',
    knownReal: { 4: [], 6: [] },
    knownVpn: { 4: [], 6: [] },
    capturedAt: { real: null, vpn: null },
    explicitContinue: { 4: false, 6: false }
  };
}

function normalizeAddresses(values) {
  return [...new Set((values ?? []).filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))];
}

function normalize(profile) {
  if (!profile || profile.schemaVersion !== GUIDED_PROFILE_SCHEMA_VERSION) return createEmptyGuidedProfile();
  const clean = createEmptyGuidedProfile();
  clean.step = ['real', 'vpn', 'stress'].includes(profile.step) ? profile.step : 'real';
  for (const family of [4, 6]) {
    clean.knownReal[family] = normalizeAddresses(profile.knownReal?.[family]);
    clean.knownVpn[family] = normalizeAddresses(profile.knownVpn?.[family]);
    clean.explicitContinue[family] = profile.explicitContinue?.[family] === true;
  }
  clean.capturedAt.real = typeof profile.capturedAt?.real === 'number' ? profile.capturedAt.real : null;
  clean.capturedAt.vpn = typeof profile.capturedAt?.vpn === 'number' ? profile.capturedAt.vpn : null;
  return clean;
}

export function createGuidedLeakProfileStore({ storage, key = DEFAULT_KEY } = {}) {
  let fallback = createEmptyGuidedProfile();

  const read = () => {
    if (!storage) return normalize(fallback);
    try {
      const raw = storage.getItem(key);
      if (!raw) return normalize(fallback);
      const clean = normalize(JSON.parse(raw));
      fallback = clean;
      return clean;
    } catch {
      return normalize(fallback);
    }
  };

  const write = (profile) => {
    const clean = normalize(profile);
    fallback = clean;
    try { storage?.setItem(key, JSON.stringify(clean)); } catch {}
    return clean;
  };

  return {
    load: read,
    save: write,
    update(value) {
      const current = read();
      return write(typeof value === 'function' ? value(current) : { ...current, ...value });
    },
    clear() {
      fallback = createEmptyGuidedProfile();
      try { storage?.removeItem(key); } catch {}
      return createEmptyGuidedProfile();
    }
  };
}
