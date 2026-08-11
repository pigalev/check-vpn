import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'index.html',
  'assets/styles.css',
  'assets/dashboard.css',
  'assets/config.js',
  'assets/network.js',
  'assets/ip-classification.js',
  'assets/ip-tests.js',
  'assets/ip-provider-group.js',
  'assets/ip-consensus.js',
  'assets/geoip.js',
  'assets/country.js',
  'assets/webrtc-test.js',
  'assets/browser-info.js',
  'assets/privacy-assessment.js',
  'assets/network-assessment.js',
  'assets/network-intelligence.js',
  'assets/reverse-dns.js',
  'assets/http-inspection.js',
  'assets/tls-fingerprint.js',
  'assets/fingerprint-exposure.js',
  'assets/environment-consistency.js',
  'assets/stun-mapping.js',
  'assets/monitor-enrichment.js',
  'assets/monitor.js',
  'assets/leak-observation.js',
  'assets/aggressive-leak-test.js',
  'assets/aggressive-leak-enrichment.js',
  'assets/aggressive-leak-render.js',
  'assets/guided-leak-profile.js',
  'assets/provider-observations.js',
  'assets/provider-evidence.js',
  'assets/provider-evidence-render.js',
  'assets/guided-leak-capture.js',
  'assets/leak-classifier.js',
  'assets/reconnect-burst.js',
  'assets/webrtc-stress.js',
  'assets/webrtc-media-test.js',
  'assets/webrtc-media-render.js',
  'assets/leak-report.js',
  'assets/guided-leak-render.js',
  'assets/guided-app-runtime.js',
  'assets/dashboard-view.js',
  'assets/active-test-view.js',
  'assets/presentation-ticker.js',
  'assets/assessment.js',
  'assets/app.js'
];

for (const file of required) await access(resolve(root, file));

const html = await readFile(resolve(root, 'index.html'), 'utf8');
if (!html.includes('./assets/styles.css') || !html.includes('./assets/dashboard.css') || !html.includes('./assets/app.js')) {
  throw new Error('index.html must reference styles.css, dashboard.css and app.js');
}

const dashboardIds = [
  'dashboard', 'connection-panel', 'connection-body', 'leak-panel', 'leak-body',
  'privacy-panel', 'privacy-body', 'advanced-details', 'active-tests',
  'guided-test-disclosure', 'aggressive-test-disclosure', 'monitor-test-disclosure', 'webrtc-test-disclosure'
];
for (const id of dashboardIds) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Compact dashboard control is missing: ${id}`);
}

const guidedIds = [
  'guided-section', 'guided-step', 'guided-instructions', 'guided-real', 'guided-vpn',
  'guided-primary', 'guided-secondary', 'guided-clear', 'guided-result', 'guided-exposures',
  'guided-paths', 'guided-coverage'
];
for (const id of guidedIds) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Guided leak control is missing: ${id}`);
}

const activeTestIds = [
  'guided-test-summary-status', 'guided-timer', 'guided-progress-bar',
  'aggressive-test-summary-status', 'aggressive-toggle', 'aggressive-timer', 'aggressive-progress-bar',
  'aggressive-result-panel', 'aggressive-status', 'aggressive-progress', 'aggressive-summary',
  'aggressive-exposures', 'aggressive-timeline',
  'monitor-test-summary-status', 'monitor-toggle', 'monitor-timer', 'monitor-result-panel',
  'monitor-status', 'monitor-timeline',
  'webrtc-test-summary-status', 'media-webrtc-baseline', 'media-webrtc-timer',
  'media-webrtc-button', 'media-webrtc-status', 'media-webrtc-result'
];
for (const id of activeTestIds) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Active test control is missing: ${id}`);
}

const orderedDisclosures = [
  'guided-test-disclosure', 'aggressive-test-disclosure', 'monitor-test-disclosure', 'webrtc-test-disclosure'
].map((id) => html.indexOf(`id="${id}"`));
if (orderedDisclosures.some((index) => index < 0) || !orderedDisclosures.every((index, i) => i === 0 || index > orderedDisclosures[i - 1])) {
  throw new Error('Active tests must remain ordered Guided, Aggressive, Kill Switch, WebRTC');
}

const moduleScripts = [...html.matchAll(/<script\b[^>]*type=["']module["'][^>]*src=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]);
if (moduleScripts.length !== 1 || moduleScripts[0] !== './assets/app.js') throw new Error('index.html must load only ./assets/app.js as the module entry');

for (const forbidden of ['Backend required', 'Coming soon', 'DNS leak test', 'Torrent leak test', 'Email leak test']) {
  if (html.includes(forbidden)) throw new Error(`Forbidden placeholder found: ${forbidden}`);
}

const guidedProfileSource = await readFile(resolve(root, 'assets/guided-leak-profile.js'), 'utf8');
if (/\blocalStorage\b/.test(guidedProfileSource)) throw new Error('Guided leak profile must not use localStorage');

const appSource = await readFile(resolve(root, 'assets/app.js'), 'utf8');
const guidedRuntimeSource = await readFile(resolve(root, 'assets/guided-app-runtime.js'), 'utf8');
if (!/storage:\s*window\.sessionStorage/.test(appSource)) throw new Error('Guided leak profile must be wired to current-tab sessionStorage');
if (!/runIpConsensusProgressive/.test(appSource)) throw new Error('Core must use progressive public-IP consensus');
if (!/runGeoIpConsensusProgressive/.test(appSource)) throw new Error('Core must use progressive GeoIP consensus');
if (!/buildConnectionView/.test(appSource) || !/renderConnection/.test(appSource)) throw new Error('Core must render the compact connection dashboard');
if (/function\s+advancedCard\s*\(/.test(appSource) || !/function\s+advancedDisclosure\s*\(/.test(appSource)) throw new Error('Advanced diagnostics must use compact disclosure rows');
if (!/createPresentationTicker/.test(appSource)) throw new Error('Active-test clocks must use the shared presentation ticker');
if (!/renderIpProviderEvidence/.test(appSource) || !/const\s+familyEntries\s*=\s*\[currentReport\.ipv4,\s*currentReport\.ipv6\]/.test(appSource)) {
  throw new Error('Advanced IPv4/IPv6 network rows must render already-collected provider evidence');
}
if (/networkConfig\.ipProviders/.test(appSource) || /networkConfig\.ipProviders/.test(guidedRuntimeSource)) {
  throw new Error('Runtime must not use the legacy flat IP provider list');
}
if (!/coreIpProviderGroups/.test(appSource) || !/reserveIpProviderGroups/.test(appSource) || !/stressIpProviderGroups/.test(appSource)) {
  throw new Error('Core, reserve and repeated-test IP provider profiles must remain separate');
}
if (!/coreIpProviderGroups/.test(guidedRuntimeSource)) {
  throw new Error('Guided capture must use broad Core IP provider groups');
}

const providerRenderSource = await readFile(resolve(root, 'assets/provider-evidence-render.js'), 'utf8');
if (/\bfetch\s*\(/.test(providerRenderSource) || /runIpConsensus/.test(providerRenderSource)) {
  throw new Error('Provider evidence rendering must not launch additional public-IP requests');
}

const configSource = await readFile(resolve(root, 'assets/config.js'), 'utf8');
for (const name of ['coreIpProviderGroups', 'reserveIpProviderGroups', 'stressIpProviderGroups']) {
  if (!configSource.includes(name)) throw new Error(`Missing IP provider profile: ${name}`);
}
if (!/group\(['"]ippubblico4['"],\s*['"]ippubblico['"].*['"]reserve['"]/.test(configSource) || !/group\(['"]ippubblico6['"],\s*['"]ippubblico['"].*['"]reserve['"]/.test(configSource)) {
  throw new Error('IPPubblico must remain configured as reserve-only for both address families');
}
if (!/id:\s*['"]ipwhois['"]/.test(configSource) || !/https:\/\/ipwho\.is\/\{ip\}/.test(configSource)) {
  throw new Error('ipwho.is must remain configured for GeoIP metadata');
}
if (!/id:\s*['"]ipapiis['"]/.test(configSource) || !/https:\/\/api\.ipapi\.is\/\?q=\{ip\}/.test(configSource)) {
  throw new Error('RU-friendly ipapi.is GeoIP provider must remain configured');
}

const importPattern = /from\s+['"](\.\/.+?)['"]/g;
for (const file of required.filter((name) => name.endsWith('.js'))) {
  const content = await readFile(resolve(root, file), 'utf8');
  for (const match of content.matchAll(importPattern)) await access(resolve(dirname(resolve(root, file)), match[1]));
}

console.log('Static validation passed.');
