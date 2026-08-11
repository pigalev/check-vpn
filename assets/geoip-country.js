function normalized(value) {
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null;
}

function codeOf(value) {
  return normalized(value?.countryCode);
}

function nameOf(value) {
  return normalized(value?.country);
}

export function buildCountryAliases(values = []) {
  const candidates = new Map();
  for (const value of values) {
    const code = codeOf(value);
    const name = nameOf(value);
    if (!code || !name) continue;
    if (!candidates.has(name)) candidates.set(name, new Set());
    candidates.get(name).add(code);
  }

  const aliases = new Map();
  for (const [name, codes] of candidates) {
    if (codes.size === 1) aliases.set(name, [...codes][0]);
  }
  return aliases;
}

export function countryEvidenceKey(value, aliases = new Map()) {
  const code = codeOf(value);
  if (code) return `code:${code}`;
  const name = nameOf(value);
  if (!name) return null;
  const mappedCode = aliases.get(name);
  return mappedCode ? `code:${mappedCode}` : `name:${name}`;
}
