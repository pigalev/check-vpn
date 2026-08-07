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
  'assets/guided-leak-capture.js',
  'assets/leak-classifier.js',
  'assets/reconnect-burst.js',
  'assets/webrtc-stress.js',
  'assets/webrtc-media-test.js',
  'assets/leak-report.js',
  'assets/guided-leak-render.js',
  'assets/guided-app-runtime.js',
  'assets/dashboard-view.js',
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
  'guided-test-disclosure', 'monitor-test-disclosure', 'aggressive-test-disclosure'
];
for (const id of dashboardIds) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Compact dashboard control is missing: ${id}`);
}

const guidedIds = [
  'guided-section', 'guided-step', 'guided-instructions', 'guided-real', 'guided-vpn',
  'guided-primary', 'guided-secondary', 'guided-clear', 'guided-result', 'guided-exposures',
  'guided-paths', 'guided-coverage', 'media-webrtc-button', 'media-webrtc-status', 'media-webrtc-result'
];
for (const id of guidedIds) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Guided leak control is missing: ${id}`);
}

for (const id of ['monitor-toggle', 'monitor-status', 'monitor-timeline', 'aggressive-toggle', 'aggressive-status', 'aggressive-progress', 'aggressive-summary', 'aggressive-exposures', 'aggressive-timeline']) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Active test control is missing: ${id}`);
}

const moduleScripts = [...html.matchAll(/<script\b[^>]*type=["']module["'][^>]*src=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]);
if (moduleScripts.length !== 1 || moduleScripts[0] !== './assets/app.js') throw new Error('index.html must load only ./assets/app.js as the module entry');

for (const forbidden of ['Backend required', 'Coming soon', 'DNS leak test', 'Torrent leak test', 'Email leak test']) {
  if (html.includes(forbidden)) throw new Error(`Forbidden placeholder found: ${forbidden}`);
}

const guidedProfileSource = await readFile(resolve(root, 'assets/guided-leak-profile.js'), 'utf8');
if (/\blocalStorage\b/.test(guidedProfileSource)) throw new Error('Guided leak profile must not use localStorage');
const appSource = await readFile(resolve(root, 'assets/app.js'), 'utf8');
if (!/storage:\s*window\.sessionStorage/.test(appSource)) throw new Error('Guided leak profile must be wired to current-tab sessionStorage');
if (!/runIpConsensusProgressive/.test(appSource)) throw new Error('Core must use progressive public-IP consensus');
if (!/runGeoIpConsensusProgressive/.test(appSource)) throw new Error('Core must use progressive GeoIP consensus');
if (!/buildConnectionView/.test(appSource) || !/renderConnection/.test(appSource)) throw new Error('Core must render the compact connection dashboard');
if (/function\s+advancedCard\s*\(/.test(appSource) || !/function\s+advancedDisclosure\s*\(/.test(appSource)) throw new Error('Advanced diagnostics must use compact disclosure rows');

const configSource = await readFile(resolve(root, 'assets/config.js'), 'utf8');
if (!/id:\s*['"]ipapiis['"]/.test(configSource) || !/https:\/\/api\.ipapi\.is\/\?q=\{ip\}/.test(configSource)) {
  throw new Error('RU-friendly ipapi.is GeoIP provider must remain configured');
}

const importPattern = /from\s+['"](\.\/.+?)['"]/g;
for (const file of required.filter((name) => name.endsWith('.js'))) {
  const content = await readFile(resolve(root, file), 'utf8');
  for (const match of content.matchAll(importPattern)) await access(resolve(dirname(resolve(root, file)), match[1]));
}

console.log('Static validation passed.');
