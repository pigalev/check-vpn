export function countryCodeToFlag(code) {
  if (typeof code !== 'string') return '';
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return '';
  return [...normalized]
    .map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)))
    .join('');
}

export function countryCodeToFlagUrl(code) {
  if (typeof code !== 'string') return '';
  const normalized = code.trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(normalized)) return '';
  return `https://flagcdn.com/24x18/${normalized}.png`;
}
