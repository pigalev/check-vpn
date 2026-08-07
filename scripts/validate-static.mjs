import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'index.html',
  'assets/styles.css',
  'assets/config.js',
  'assets/network.js',
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
  'assets/monitor.js',
  'assets/assessment.js',
  'assets/app.js'
];

for (const file of required) await access(resolve(root, file));

const html = await readFile(resolve(root, 'index.html'), 'utf8');
if (!html.includes('./assets/styles.css') || !html.includes('./assets/app.js')) throw new Error('index.html must reference styles.css and app.js');
if (!html.includes('advanced-details') || !html.includes('monitor-toggle')) throw new Error('Max diagnostics controls are missing');
for (const forbidden of ['Backend required', 'Coming soon', 'DNS leak test', 'Torrent leak test', 'Email leak test']) {
  if (html.includes(forbidden)) throw new Error(`Forbidden placeholder found: ${forbidden}`);
}

const importPattern = /from\s+['"](\.\/.+?)['"]/g;
for (const file of required.filter((name) => name.endsWith('.js'))) {
  const content = await readFile(resolve(root, file), 'utf8');
  for (const match of content.matchAll(importPattern)) await access(resolve(dirname(resolve(root, file)), match[1]));
}

console.log('Static validation passed.');
