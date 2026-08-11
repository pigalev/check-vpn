import { readFile, writeFile } from 'node:fs/promises';

const appPath = 'assets/app.js';
let app = await readFile(appPath, 'utf8');

function replaceOnce(source, oldValue, newValue, label) {
  const count = source.split(oldValue).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, got ${count}`);
  return source.replace(oldValue, newValue);
}

app = replaceOnce(
  app,
  "import { countryCodeToFlagUrl } from './country.js';",
  "import { buildCountryFlagPresentation } from './country.js';",
  'country import'
);

app = replaceOnce(
  app,
  `function locationNode(geo) {\n  const wrapper = document.createElement('span'); wrapper.className = 'location-value';\n  const url = countryCodeToFlagUrl(geo?.countryCode);\n  if (url) {\n    const img = document.createElement('img'); img.className = 'country-flag'; img.src = url; img.alt = ''; img.width = 20; img.height = 15;\n    img.addEventListener('error', () => img.remove(), { once: true }); wrapper.append(img);\n  }\n  const value = document.createElement('span');\n  const place = [geo?.city, geo?.region].filter(Boolean).join(', ');\n  value.textContent = [geo?.country, place].filter(Boolean).join(' · ') || 'Unknown';\n  wrapper.append(value); return wrapper;\n}`,
  `function locationNode(geo) {\n  const wrapper = document.createElement('span'); wrapper.className = 'location-value';\n  const presentation = buildCountryFlagPresentation(geo?.countryCode);\n  if (presentation.imageUrl || presentation.emoji) {\n    const slot = document.createElement('span'); slot.className = 'country-flag-slot';\n    const emoji = document.createElement('span'); emoji.className = 'country-flag-emoji'; emoji.textContent = presentation.emoji; emoji.hidden = Boolean(presentation.imageUrl);\n    if (presentation.imageUrl) {\n      const img = document.createElement('img'); img.className = 'country-flag'; img.src = presentation.imageUrl; img.alt = ''; img.width = 20; img.height = 15;\n      img.addEventListener('error', () => { img.remove(); emoji.hidden = !presentation.emoji; }, { once: true });\n      slot.append(img);\n    }\n    slot.append(emoji); wrapper.append(slot);\n  }\n  const value = document.createElement('span');\n  const place = [geo?.city, geo?.region].filter(Boolean).join(', ');\n  value.textContent = [geo?.country, place].filter(Boolean).join(' · ') || 'Unknown';\n  wrapper.append(value); return wrapper;\n}`,
  'locationNode'
);

app = replaceOnce(
  app,
  `    if (primary.locationState === 'available') {\n      const line = document.createElement('div'); line.className = 'connection-location'; line.append(locationNode(primaryIp?.geo)); connectionBody.append(line);\n    } else if (primary.locationState === 'locating') text(connectionBody, 'Locating…', 'connection-meta');\n    if (primary.network) text(connectionBody, primary.network, 'connection-meta');`,
  `    if (primary.locationState === 'available') {\n      const line = document.createElement('div'); line.className = 'connection-location'; line.append(locationNode(primaryIp?.geo)); connectionBody.append(line);\n      if (primary.locationDisagreement) text(connectionBody, 'GeoIP providers disagree', 'connection-location-warning');\n    } else if (primary.locationState === 'locating') text(connectionBody, 'Locating…', 'connection-meta');\n    else if (primary.locationState === 'unavailable') text(connectionBody, 'Location unavailable', 'connection-meta');\n    if (primary.network) text(connectionBody, primary.network, 'connection-meta');`,
  'primary location block'
);

await writeFile(appPath, app);

const cssPath = 'assets/dashboard.css';
let css = await readFile(cssPath, 'utf8');
const addition = `.country-flag-slot{display:inline-flex;align-items:center;justify-content:center;width:20px;min-width:20px}.country-flag-emoji{font-size:1rem;line-height:1}.connection-location-warning{margin:4px 0 0;color:var(--warning);font-size:.78rem;overflow-wrap:anywhere}`;
if (!css.includes('.country-flag-slot{')) css += addition;
await writeFile(cssPath, css);
