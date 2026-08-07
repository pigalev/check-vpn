import { appConfig, features, getEnabledChecks, networkConfig } from './config.js';
import { runIpConsensus } from './ip-consensus.js';
import { runGeoIpConsensus } from './geoip.js';
import { countryCodeToFlagUrl } from './country.js';
import { describeCandidate, runWebRtcTest } from './webrtc-test.js';
import { collectBrowserInfo } from './browser-info.js';
import { assessPrivacy } from './privacy-assessment.js';
import { assessAddressFamilies } from './network-assessment.js';
import { assessResults } from './assessment.js';
import { runNetworkIntelligence } from './network-intelligence.js';
import { runReverseDns } from './reverse-dns.js';
import { runHttpInspection } from './http-inspection.js';
import { createIpMonitor, monitorFindings } from './monitor.js';

const grid = document.querySelector('#results-grid');
const runButton = document.querySelector('#run-tests');
const copyButton = document.querySelector('#copy-json');
const overallStatus = document.querySelector('#overall-status');
const overallMessage = document.querySelector('#overall-message');
const topFindings = document.querySelector('#top-findings');
const advancedDetails = document.querySelector('#advanced-details');
const advancedResults = document.querySelector('#advanced-results');
const advancedButton = document.querySelector('#run-advanced');
const monitorToggle = document.querySelector('#monitor-toggle');
const monitorStatus = document.querySelector('#monitor-status');
const monitorTimeline = document.querySelector('#monitor-timeline');

const cards = new Map();
let currentReport = null;
let currentRunId = 0;
let advancedRunId = null;
let running = false;
let monitor = null;

function createCard(id, title, description) {
  const article = document.createElement('article');
  article.className = 'result-card';
  article.id = `${id}-card`;
  article.innerHTML = `<div class="card-header"><h2>${title}</h2><span class="card-status" data-field="status">Not run</span></div><div class="card-body" data-field="body"><p class="card-detail">${description}</p></div>`;
  grid.append(article);
  cards.set(id, article);
}

createCard('ipv4', 'IPv4', 'Public IPv4 observed by independent HTTP endpoints.');
createCard('ipv6', 'IPv6', 'Public IPv6 observed by independent HTTP endpoints.');
createCard('webrtc', 'WebRTC', 'ICE candidates exposed by the browser.');
createCard('privacy', 'Privacy', 'Browser and IP privacy consistency.');

function bodyFor(name, status = 'Complete') {
  const card = cards.get(name);
  card.querySelector('[data-field="status"]').textContent = status;
  const body = card.querySelector('[data-field="body"]');
  body.replaceChildren();
  return body;
}

function text(parent, value, className = 'card-detail') {
  const node = document.createElement('p');
  node.className = className;
  node.textContent = value;
  parent.append(node);
  return node;
}

function rows(parent, entries) {
  const list = document.createElement('div');
  list.className = 'detail-list';
  for (const [label, value] of entries) {
    if (value == null || value === '') continue;
    const row = document.createElement('div'); row.className = 'detail-row';
    const key = document.createElement('span'); key.className = 'detail-label'; key.textContent = label;
    const content = document.createElement('span'); content.className = 'detail-value';
    if (value instanceof Node) content.append(value); else content.textContent = String(value);
    row.append(key, content); list.append(row);
  }
  parent.append(list);
}

function locationNode(geo) {
  const wrapper = document.createElement('span'); wrapper.className = 'location-value';
  const url = countryCodeToFlagUrl(geo?.countryCode);
  if (url) { const img = document.createElement('img'); img.className = 'country-flag'; img.src = url; img.alt = ''; img.width = 20; img.height = 15; img.addEventListener('error', () => img.remove(), { once: true }); wrapper.append(img); }
  const value = document.createElement('span');
  const place = [geo?.city, geo?.region].filter(Boolean).join(', ');
  value.textContent = [geo?.country, place].filter(Boolean).join(' · ') || 'Unknown';
  wrapper.append(value); return wrapper;
}

function hasGeo(geo) { return geo && ['complete', 'partial'].includes(geo.status); }

function renderIp(name, result) {
  const body = bodyFor(name, result?.address ? 'Complete' : 'Unavailable');
  if (!result?.address) { text(body, `IPv${result?.family ?? ''} connectivity was not detected.`); return; }
  text(body, result.address, 'card-value');
  const geo = result.geo;
  const detailRows = [
    ['IP sources', `${result.agreement.available}/${result.agreement.total}${result.agreement.agree ? ' · agree' : ' · differ'}`]
  ];
  if (hasGeo(geo)) {
    detailRows.unshift(['Location', locationNode(geo)], ['Network', [geo.asn, geo.org].filter(Boolean).join(' · ') || 'Unknown']);
    if (geo.timezone) detailRows.push(['Timezone', geo.timezone]);
    detailRows.push(['GeoIP', `${geo.agreement?.available ?? 0}/${geo.agreement?.total ?? 0}${geo.differences?.length ? ' · differ' : ' · agree'}`]);
  } else detailRows.unshift(['Location', 'Unavailable']);
  rows(body, detailRows);
  if (!result.agreement.agree) text(body, 'Public-IP providers returned different addresses.', 'inline-warning');
}

function renderWebRtc(result, ipv4, ipv6) {
  const body = bodyFor('webrtc', result.status === 'complete' ? 'Complete' : 'Unavailable');
  if (result.error) text(body, result.error);
  const summary = result.summary ?? {};
  rows(body, [
    ['Public', result.publicAddresses?.join(', ') || 'Not detected'],
    ['Candidates', `${result.candidates?.length ?? 0} total`],
    ['Types', `host ${summary.host ?? 0} · srflx ${summary.srflx ?? 0} · relay ${summary.relay ?? 0}`],
    ['Families', `IPv4 ${summary.ipv4 ?? 0} · IPv6 ${summary.ipv6 ?? 0}`],
    ['Transport', `UDP ${summary.udp ?? 0} · TCP ${summary.tcp ?? 0}`]
  ]);
  const list = document.createElement('div'); list.className = 'candidate-list';
  for (const candidate of result.candidates ?? []) {
    const d = describeCandidate(candidate); const item = document.createElement('div'); item.className = 'candidate-item';
    text(item, d.heading, 'candidate-heading');
    text(item, candidate.classification === 'mdns' ? 'Hidden by browser' : candidate.address, 'candidate-address');
    if (candidate.classification === 'mdns') text(item, candidate.address, 'candidate-technical-address');
    text(item, d.meta, 'candidate-meta'); if (d.note) text(item, d.note, 'candidate-note'); list.append(item);
  }
  body.append(list);
  const expected = new Set([ipv4?.address, ipv6?.address].filter(Boolean));
  const mismatch = (result.publicAddresses ?? []).filter((address) => !expected.has(address));
  text(body, mismatch.length ? `Mismatch: ${mismatch.join(', ')}` : 'WebRTC public addresses match HTTP results.', mismatch.length ? 'inline-danger' : 'comparison-result');
}

function renderPrivacy(browser, privacy) {
  const body = bodyFor('privacy', 'Complete');
  text(body, browser.timezone || 'Timezone unavailable', 'card-value');
  rows(body, [
    ['IP timezone', privacy.ipTimezones.join(', ') || 'Unavailable'],
    ['Timezone', privacy.timezoneMatch == null ? 'Unknown' : privacy.timezoneMatch ? 'Match' : 'Mismatch'],
    ['Language', browser.languages?.join(', ') || browser.language || 'Unknown'],
    ['Platform', browser.platform || 'Unknown'],
    ['Secure context', browser.secureContext == null ? 'Unknown' : browser.secureContext ? 'Yes' : 'No'],
    ['GPC', browser.gpc == null ? 'Unavailable' : browser.gpc ? 'Enabled' : 'Disabled'],
    ['DNT', browser.doNotTrack ?? 'Unavailable']
  ]);
  if (privacy.timezoneMatch === false) text(body, 'Browser timezone differs from IP timezone.', 'inline-warning');
}

async function enrich(result) {
  if (!result?.address || !features.geoip) return { ...result, geo: null };
  const geo = await runGeoIpConsensus({ ip: result.address, providers: networkConfig.geoIpProviders, timeoutMs: networkConfig.geoIpTimeoutMs });
  return { ...result, geo };
}

function renderOverall(assessment) {
  const labels = { protected: 'Protected', review: 'Review', leak: 'Leak detected', incomplete: 'Incomplete' };
  overallStatus.textContent = labels[assessment.status] ?? assessment.status;
  overallStatus.dataset.status = assessment.status;
  overallMessage.textContent = assessment.message;
  topFindings.replaceChildren();
  for (const finding of assessment.findings.filter((f) => f.severity !== 'info').slice(0, 4)) {
    const item = document.createElement('span'); item.className = `finding-chip finding-${finding.severity}`; item.textContent = finding.summary; topFindings.append(item);
  }
}

async function runCore() {
  if (running) return;
  running = true; runButton.disabled = true; copyButton.disabled = true; currentRunId += 1; advancedRunId = null; advancedResults.replaceChildren();
  overallStatus.textContent = 'Running'; overallStatus.dataset.status = 'running'; overallMessage.textContent = 'Running core diagnostics.';
  for (const name of cards.keys()) bodyFor(name, 'Running');

  const [r4, r6, webrtc] = await Promise.all([
    runIpConsensus({ family: 4, providers: networkConfig.ipProviders[4], timeoutMs: networkConfig.requestTimeoutMs }),
    runIpConsensus({ family: 6, providers: networkConfig.ipProviders[6], timeoutMs: networkConfig.requestTimeoutMs }),
    runWebRtcTest({ stunUrls: networkConfig.stunUrls, timeoutMs: networkConfig.webrtcTimeoutMs })
  ]);
  const [ipv4, ipv6] = await Promise.all([enrich(r4), enrich(r6)]);
  const browser = collectBrowserInfo(window);
  const privacy = assessPrivacy({ browser, ipv4, ipv6 });
  const networkFindings = assessAddressFamilies({ ipv4, ipv6, webrtc });
  const assessment = assessResults({ ipv4, ipv6, webrtc, privacy, networkFindings, monitorFindings: [] });
  currentReport = { startedAt: new Date().toISOString(), runId: currentRunId, ipv4, ipv6, webrtc, browser, privacy, assessment, advanced: null, monitor: monitor?.getState?.() ?? null };
  renderIp('ipv4', ipv4); renderIp('ipv6', ipv6); renderWebRtc(webrtc, ipv4, ipv6); renderPrivacy(browser, privacy); renderOverall(assessment);
  running = false; runButton.disabled = false; copyButton.disabled = false;
}

function advancedCard(title) {
  const card = document.createElement('article'); card.className = 'advanced-card';
  const h = document.createElement('h3'); h.textContent = title; card.append(h); advancedResults.append(card); return card;
}

function intelligenceRows(result) {
  if (result.status !== 'complete') return [['Status', 'Unavailable']];
  return [
    ['ASN', result.asn], ['Organization', result.organization], ['Prefix', result.prefix], ['RIR', result.rir], ['Type', result.networkType],
    ['VPN', result.isVpn == null ? 'Unknown' : result.isVpn ? 'Detected' : 'No'], ['Proxy', result.isProxy == null ? 'Unknown' : result.isProxy ? 'Detected' : 'No'],
    ['Tor', result.isTor == null ? 'Unknown' : result.isTor ? 'Detected' : 'No'], ['Datacenter', result.isDatacenter == null ? 'Unknown' : result.isDatacenter ? 'Detected' : 'No'],
    ['Mobile', result.isMobile == null ? 'Unknown' : result.isMobile ? 'Yes' : 'No'], ['Abuse flag', result.isAbuser == null ? 'Unknown' : result.isAbuser ? 'Present' : 'No']
  ];
}

async function runAdvanced(force = false) {
  if (!currentReport) return;
  if (!force && advancedRunId === currentRunId) return;
  advancedRunId = currentRunId; advancedButton.disabled = true; advancedResults.replaceChildren();
  const loading = advancedCard('Advanced diagnostics'); text(loading, 'Running best-effort checks…');
  const ips = [currentReport.ipv4?.address, currentReport.ipv6?.address].filter(Boolean);
  const [intelligence, reverseDns, stun, httpInspection] = await Promise.all([
    Promise.all(ips.map((ip) => runNetworkIntelligence({ ip, endpointTemplate: networkConfig.intelligenceUrlTemplate, timeoutMs: networkConfig.advancedTimeoutMs }))),
    Promise.all(ips.map((ip) => runReverseDns({ ip, resolvers: networkConfig.dohResolvers, timeoutMs: networkConfig.advancedTimeoutMs }))),
    Promise.all(networkConfig.stunUrls.map(async (server) => ({ server, result: await runWebRtcTest({ stunUrls: [server], timeoutMs: networkConfig.webrtcTimeoutMs }) }))),
    runHttpInspection({ endpoint: networkConfig.httpEchoEndpoint, timeoutMs: networkConfig.advancedTimeoutMs })
  ]);
  advancedResults.replaceChildren();

  ips.forEach((ip, index) => {
    const card = advancedCard(`${ip.includes(':') ? 'IPv6' : 'IPv4'} network intelligence`); text(card, ip, 'card-value'); rows(card, intelligenceRows(intelligence[index]));
    const ptr = reverseDns[index]; rows(card, [['Reverse DNS', ptr?.names?.join(', ') || (ptr?.status === 'complete' ? 'No PTR record' : 'Unavailable')], ['PTR resolvers', `${ptr?.agreement?.available ?? 0}/${ptr?.agreement?.total ?? 0}${ptr?.agreement?.agree ? ' · agree' : ' · differ'}`]]);
  });

  const stunCard = advancedCard('STUN comparison');
  for (const item of stun) rows(stunCard, [[item.server.replace(/^stun:/, ''), item.result.publicAddresses?.join(', ') || 'No public candidate']]);

  const httpCard = advancedCard('HTTP path');
  rows(httpCard, [['Observed IP', httpInspection.observedIp || 'Unavailable'], ['Via', httpInspection.proxyHeaders?.via || 'Not returned'], ['Forwarded', httpInspection.proxyHeaders?.forwarded || 'Not returned'], ['X-Forwarded-For', httpInspection.proxyHeaders?.['x-forwarded-for'] || 'Not returned'], ['User-Agent', httpInspection.headers?.['user-agent'] || 'Unavailable'], ['Accept-Language', httpInspection.headers?.['accept-language'] || 'Unavailable']]);
  if (Object.keys(httpInspection.proxyHeaders ?? {}).length) text(httpCard, 'Proxy forwarding metadata was returned by the echo service.', 'inline-warning');

  const browserCard = advancedCard('Browser privacy surface');
  const b = currentReport.browser;
  rows(browserCard, [['User-Agent', b.userAgent], ['Languages', b.languages?.join(', ')], ['Screen', b.screen?.width && b.screen?.height ? `${b.screen.width}×${b.screen.height}` : 'Unavailable'], ['Viewport', b.viewport?.width && b.viewport?.height ? `${b.viewport.width}×${b.viewport.height}` : 'Unavailable'], ['Pixel ratio', b.devicePixelRatio], ['CPU threads', b.hardwareConcurrency], ['Device memory', b.deviceMemoryGb != null ? `${b.deviceMemoryGb} GB` : 'Unavailable'], ['Touch points', b.maxTouchPoints], ['Cookies', b.cookieEnabled == null ? 'Unknown' : b.cookieEnabled ? 'Enabled' : 'Disabled'], ['Connection', b.connection?.effectiveType], ['Downlink', b.connection?.downlinkMbps != null ? `${b.connection.downlinkMbps} Mbps` : null], ['RTT', b.connection?.rttMs != null ? `${b.connection.rttMs} ms` : null]]);

  currentReport.advanced = { intelligence, reverseDns, stun, httpInspection, completedAt: new Date().toISOString() };
  advancedButton.disabled = false;
}

function renderMonitor(state) {
  monitorToggle.textContent = state.running ? 'Stop monitoring' : 'Start monitoring';
  monitorStatus.textContent = state.running ? `Running · ${state.sampleCount} samples · IPv4 ${state.current[4] || 'none'} · IPv6 ${state.current[6] || 'none'}` : state.sampleCount ? `Stopped · ${state.sampleCount} samples · ${state.events.length} change events` : 'Not running';
  monitorTimeline.replaceChildren();
  for (const event of [...state.events].reverse()) {
    const row = document.createElement('div'); row.className = 'monitor-event';
    row.textContent = `${event.timestamp} · IPv${event.family}: ${event.previousAddress || 'none'} → ${event.address || 'none'}`; monitorTimeline.append(row);
  }
  if (currentReport) currentReport.monitor = state;
}

function createMonitor() {
  return createIpMonitor({
    intervalMs: appConfig.monitorIntervalMs,
    sample: async () => {
      const [ipv4, ipv6] = await Promise.all([
        runIpConsensus({ family: 4, providers: networkConfig.ipProviders[4], timeoutMs: networkConfig.requestTimeoutMs }),
        runIpConsensus({ family: 6, providers: networkConfig.ipProviders[6], timeoutMs: networkConfig.requestTimeoutMs })
      ]);
      return { ipv4, ipv6 };
    },
    onUpdate: (state) => {
      renderMonitor(state);
      const findings = monitorFindings(state);
      if (findings.length && currentReport) {
        const networkFindings = assessAddressFamilies({ ipv4: currentReport.ipv4, ipv6: currentReport.ipv6, webrtc: currentReport.webrtc });
        currentReport.assessment = assessResults({ ipv4: currentReport.ipv4, ipv6: currentReport.ipv6, webrtc: currentReport.webrtc, privacy: currentReport.privacy, networkFindings, monitorFindings: findings });
        renderOverall(currentReport.assessment);
      }
    }
  });
}

async function copyReport() {
  if (!currentReport) return;
  const value = JSON.stringify(currentReport, null, 2);
  try { await navigator.clipboard.writeText(value); }
  catch { const area = document.createElement('textarea'); area.value = value; document.body.append(area); area.select(); document.execCommand('copy'); area.remove(); }
  copyButton.textContent = 'Copied'; setTimeout(() => { copyButton.textContent = 'Copy JSON'; }, 1000);
}

runButton.addEventListener('click', runCore);
copyButton.addEventListener('click', copyReport);
advancedDetails.addEventListener('toggle', () => { if (advancedDetails.open) runAdvanced(false); });
advancedButton.addEventListener('click', () => runAdvanced(true));
monitorToggle.addEventListener('click', async () => {
  if (!monitor) monitor = createMonitor();
  if (monitor.getState().running) monitor.stop(); else await monitor.start();
});

if (appConfig.autoRun) queueMicrotask(runCore);
