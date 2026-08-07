import { appConfig, features, networkConfig } from './config.js';
import { runIpConsensus } from './ip-consensus.js';
import { runGeoIpConsensus } from './geoip.js';
import { countryCodeToFlagUrl } from './country.js';
import { describeCandidate, runWebRtcTest, summarizeWebRtcPrivacy } from './webrtc-test.js';
import { collectBrowserInfo } from './browser-info.js';
import { assessPrivacy } from './privacy-assessment.js';
import { assessAddressFamilies } from './network-assessment.js';
import { assessResults } from './assessment.js';
import { runNetworkIntelligence } from './network-intelligence.js';
import { runReverseDns } from './reverse-dns.js';
import { runHttpInspection } from './http-inspection.js';
import { runTlsFingerprint } from './tls-fingerprint.js';
import { collectFingerprintExposure } from './fingerprint-exposure.js';
import { assessEnvironmentConsistency } from './environment-consistency.js';
import { compareStunMappings } from './stun-mapping.js';
import { createIpMonitor, monitorFindings } from './monitor.js';
import { createMonitorEnricher } from './monitor-enrichment.js';
import { createAggressiveLeakTest } from './aggressive-leak-test.js';
import { renderAggressiveLeakTest } from './aggressive-leak-render.js';
import { createAggressiveLeakEnricher } from './aggressive-leak-enrichment.js';

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
const aggressiveElements = {
  toggle: document.querySelector('#aggressive-toggle'),
  status: document.querySelector('#aggressive-status'),
  progress: document.querySelector('#aggressive-progress'),
  summary: document.querySelector('#aggressive-summary'),
  timeline: document.querySelector('#aggressive-timeline'),
  exposures: document.querySelector('#aggressive-exposures')
};

const cards = new Map();
let currentReport = null;
let currentRunId = 0;
let advancedRunId = null;
let running = false;
let monitor = null;
let aggressive = null;
const enrichingEvents = new Set();
const enrichingAggressive = new Set();

const monitorEnricher = createMonitorEnricher({
  geoLookup: (ip) => runGeoIpConsensus({ ip, providers: networkConfig.geoIpProviders, timeoutMs: networkConfig.geoIpTimeoutMs }),
  intelligenceLookup: (ip) => runNetworkIntelligence({ ip, endpointTemplate: networkConfig.intelligenceUrlTemplate, timeoutMs: networkConfig.advancedTimeoutMs })
});
const aggressiveEnricher = createAggressiveLeakEnricher({
  geoLookup: (ip) => runGeoIpConsensus({ ip, providers: networkConfig.geoIpProviders, timeoutMs: networkConfig.geoIpTimeoutMs }),
  intelligenceLookup: (ip) => runNetworkIntelligence({ ip, endpointTemplate: networkConfig.intelligenceUrlTemplate, timeoutMs: networkConfig.advancedTimeoutMs })
});

function createCard(id, title, description) {
  const article = document.createElement('article');
  article.className = 'result-card'; article.id = `${id}-card`;
  article.innerHTML = `<div class="card-header"><h2>${title}</h2><span class="card-status" data-field="status">Not run</span></div><div class="card-body" data-field="body"><p class="card-detail">${description}</p></div>`;
  grid.append(article); cards.set(id, article);
}
createCard('ipv4', 'IPv4', 'Public IPv4 observed by independent HTTP endpoints.');
createCard('ipv6', 'IPv6', 'Public IPv6 observed by independent HTTP endpoints.');
createCard('webrtc', 'WebRTC', 'ICE candidates exposed by the browser.');
createCard('privacy', 'Privacy', 'Browser and IP privacy consistency.');

function bodyFor(name, status = 'Complete') {
  const card = cards.get(name); card.querySelector('[data-field="status"]').textContent = status;
  const body = card.querySelector('[data-field="body"]'); body.replaceChildren(); return body;
}
function text(parent, value, className = 'card-detail') { const node = document.createElement('p'); node.className = className; node.textContent = value; parent.append(node); return node; }
function rows(parent, entries) {
  const list = document.createElement('div'); list.className = 'detail-list';
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
  const value = document.createElement('span'); const place = [geo?.city, geo?.region].filter(Boolean).join(', ');
  value.textContent = [geo?.country, place].filter(Boolean).join(' · ') || 'Unknown'; wrapper.append(value); return wrapper;
}
function hasGeo(geo) { return geo && ['complete', 'partial'].includes(geo.status); }

function renderIp(name, result) {
  const body = bodyFor(name, result?.address ? 'Complete' : 'Unavailable');
  if (!result?.address) { text(body, `IPv${result?.family ?? ''} connectivity was not detected.`); return; }
  text(body, result.address, 'card-value');
  const detailRows = [['IP sources', `${result.agreement.available}/${result.agreement.total}${result.agreement.agree ? ' · agree' : ' · differ'}`]];
  if (hasGeo(result.geo)) {
    detailRows.unshift(['Location', locationNode(result.geo)], ['Network', [result.geo.asn, result.geo.org].filter(Boolean).join(' · ') || 'Unknown']);
    if (result.geo.timezone) detailRows.push(['Timezone', result.geo.timezone]);
    detailRows.push(['GeoIP', `${result.geo.agreement?.available ?? 0}/${result.geo.agreement?.total ?? 0}${result.geo.differences?.length ? ' · differ' : ' · agree'}`]);
  } else detailRows.unshift(['Location', 'Unavailable']);
  rows(body, detailRows);
  if (!result.agreement.agree) text(body, 'Public-IP providers returned different addresses.', 'inline-warning');
}

function renderWebRtc(result, ipv4, ipv6) {
  const body = bodyFor('webrtc', result.status === 'complete' ? 'Complete' : 'Unavailable');
  if (result.error) text(body, result.error);
  const summary = result.summary ?? {};
  const trusted = new Set([ipv4?.address, ipv6?.address].filter(Boolean));
  const privacy = summarizeWebRtcPrivacy(result.candidates ?? [], trusted);
  rows(body, [
    ['Public', result.publicAddresses?.join(', ') || 'Not detected'],
    ['Candidates', `${result.candidates?.length ?? 0} total`],
    ['Types', `host ${summary.host ?? 0} · srflx ${summary.srflx ?? 0} · relay ${summary.relay ?? 0}`],
    ['Families', `IPv4 ${summary.ipv4 ?? 0} · IPv6 ${summary.ipv6 ?? 0}`],
    ['Transport', `UDP ${summary.udp ?? 0} · TCP ${summary.tcp ?? 0}`],
    ['Numeric private IPv4', privacy.numericPrivateIpv4Exposed ? 'Exposed' : 'Not detected'],
    ['CGNAT candidate', privacy.cgnatExposed ? 'Exposed' : 'Not detected'],
    ['Private/ULA IPv6', privacy.privateIpv6Exposed ? 'Exposed' : 'Not detected'],
    ['mDNS protection', privacy.mdnsProtection ? 'Active' : 'Not observed'],
    ['Public mismatch', privacy.publicMismatches.length ? privacy.publicMismatches.join(', ') : 'No']
  ]);
  const list = document.createElement('div'); list.className = 'candidate-list';
  for (const candidate of result.candidates ?? []) {
    const d = describeCandidate(candidate); const item = document.createElement('div'); item.className = 'candidate-item';
    text(item, d.heading, 'candidate-heading'); text(item, candidate.classification === 'mdns' ? 'Hidden by browser' : candidate.address, 'candidate-address');
    if (candidate.classification === 'mdns') text(item, candidate.address, 'candidate-technical-address');
    text(item, d.meta, 'candidate-meta'); if (candidate.port != null) text(item, `Port ${candidate.port}`, 'candidate-meta'); if (d.note) text(item, d.note, 'candidate-note'); list.append(item);
  }
  body.append(list);
  text(body, privacy.publicMismatches.length ? `Mismatch: ${privacy.publicMismatches.join(', ')}` : 'WebRTC public addresses match HTTP results.', privacy.publicMismatches.length ? 'inline-danger' : 'comparison-result');
}

function renderPrivacy(browser, privacy) {
  const body = bodyFor('privacy', 'Complete'); text(body, browser.timezone || 'Timezone unavailable', 'card-value');
  rows(body, [['IP timezone', privacy.ipTimezones.join(', ') || 'Unavailable'], ['Timezone', privacy.timezoneMatch == null ? 'Unknown' : privacy.timezoneMatch ? 'Match' : 'Mismatch'], ['Language', browser.languages?.join(', ') || browser.language || 'Unknown'], ['Platform', browser.platform || 'Unknown'], ['Secure context', browser.secureContext == null ? 'Unknown' : browser.secureContext ? 'Yes' : 'No'], ['GPC', browser.gpc == null ? 'Unavailable' : browser.gpc ? 'Enabled' : 'Disabled'], ['DNT', browser.doNotTrack ?? 'Unavailable']]);
  if (privacy.timezoneMatch === false) text(body, 'Browser timezone differs from IP timezone.', 'inline-warning');
}

async function enrich(result) {
  if (!result?.address || !features.geoip) return { ...result, geo: null };
  return { ...result, geo: await runGeoIpConsensus({ ip: result.address, providers: networkConfig.geoIpProviders, timeoutMs: networkConfig.geoIpTimeoutMs }) };
}

function currentAggressiveFindings() {
  const state = aggressive?.getState?.() ?? currentReport?.aggressive;
  if (!state) return [];
  if (state.exposures?.length) return state.exposures.map((exposure) => ({
    id: `aggressive-public-ip-${exposure.family}-${exposure.address}`,
    severity: 'leak', category: 'aggressive', summary: `Unexpected public IPv${exposure.family} observed`,
    details: `${exposure.address} · ${(exposure.sources ?? []).join(', ') || 'aggressive test'}`,
    sources: ['aggressive-test', ...(exposure.channels ?? [])]
  }));
  if (state.result === 'inconclusive') return [{ id: 'aggressive-inconclusive', severity: 'review', category: 'aggressive', summary: 'Aggressive leak test was inconclusive', details: (state.reasons ?? []).join(' '), sources: ['aggressive-test'] }];
  return [];
}

function reassess() {
  if (!currentReport) return;
  const base = assessAddressFamilies({ ipv4: currentReport.ipv4, ipv6: currentReport.ipv6, webrtc: currentReport.webrtc });
  const extra = currentReport.advanced?.environmentConsistency?.findings ?? [];
  currentReport.assessment = assessResults({
    ipv4: currentReport.ipv4, ipv6: currentReport.ipv6, webrtc: currentReport.webrtc, privacy: currentReport.privacy,
    networkFindings: [...base, ...extra],
    monitorFindings: monitor ? monitorFindings(monitor.getState()) : [],
    aggressiveFindings: currentAggressiveFindings()
  });
  renderOverall(currentReport.assessment);
}

function renderOverall(assessment) {
  const labels = { protected: 'Protected', review: 'Review', leak: 'Leak detected', incomplete: 'Incomplete' };
  overallStatus.textContent = labels[assessment.status] ?? assessment.status; overallStatus.dataset.status = assessment.status; overallMessage.textContent = assessment.message; topFindings.replaceChildren();
  for (const finding of assessment.findings.filter((item) => item.severity !== 'info').slice(0, 4)) { const chip = document.createElement('span'); chip.className = `finding-chip finding-${finding.severity}`; chip.textContent = finding.summary; topFindings.append(chip); }
}

async function runCore() {
  if (running || aggressive?.getState?.().status === 'running') return;
  running = true; runButton.disabled = true; copyButton.disabled = true; currentRunId += 1; advancedRunId = null; advancedResults.replaceChildren();
  overallStatus.textContent = 'Running'; overallStatus.dataset.status = 'running'; overallMessage.textContent = 'Running core diagnostics.'; for (const name of cards.keys()) bodyFor(name, 'Running');
  const [r4, r6, webrtc] = await Promise.all([
    runIpConsensus({ family: 4, providers: networkConfig.ipProviders[4], timeoutMs: networkConfig.requestTimeoutMs }),
    runIpConsensus({ family: 6, providers: networkConfig.ipProviders[6], timeoutMs: networkConfig.requestTimeoutMs }),
    runWebRtcTest({ stunUrls: networkConfig.stunUrls, timeoutMs: networkConfig.webrtcTimeoutMs })
  ]);
  const [ipv4, ipv6] = await Promise.all([enrich(r4), enrich(r6)]); const browser = collectBrowserInfo(window); const privacy = assessPrivacy({ browser, ipv4, ipv6 });
  const networkFindings = assessAddressFamilies({ ipv4, ipv6, webrtc }); const assessment = assessResults({ ipv4, ipv6, webrtc, privacy, networkFindings, monitorFindings: [], aggressiveFindings: [] });
  currentReport = { startedAt: new Date().toISOString(), runId: currentRunId, ipv4, ipv6, webrtc, browser, privacy, assessment, advanced: null, monitor: monitor?.getState?.() ?? null, aggressive: aggressive?.getState?.() ?? null };
  renderIp('ipv4', ipv4); renderIp('ipv6', ipv6); renderWebRtc(webrtc, ipv4, ipv6); renderPrivacy(browser, privacy); renderOverall(assessment); running = false; runButton.disabled = false; copyButton.disabled = false;
}

function advancedCard(title) { const card = document.createElement('article'); card.className = 'advanced-card'; const h = document.createElement('h3'); h.textContent = title; card.append(h); advancedResults.append(card); return card; }
function intelligenceRows(result) {
  if (result?.status !== 'complete') return [['Status', 'Unavailable']];
  return [['ASN', result.asn], ['Organization', result.organization], ['Prefix', result.prefix], ['RIR', result.rir], ['Type', result.networkType], ['VPN', result.isVpn == null ? 'Unknown' : result.isVpn ? 'Detected' : 'No'], ['Proxy', result.isProxy == null ? 'Unknown' : result.isProxy ? 'Detected' : 'No'], ['Tor', result.isTor == null ? 'Unknown' : result.isTor ? 'Detected' : 'No'], ['Datacenter', result.isDatacenter == null ? 'Unknown' : result.isDatacenter ? 'Detected' : 'No'], ['Mobile', result.isMobile == null ? 'Unknown' : result.isMobile ? 'Yes' : 'No'], ['Abuse flag', result.isAbuser == null ? 'Unknown' : result.isAbuser ? 'Present' : 'No']];
}
function renderStunResults(parent, stun) {
  const list = document.createElement('div'); list.className = 'stun-result-list';
  for (const item of stun) {
    const candidate = item.result.candidates?.find((entry) => entry.type === 'srflx' && entry.classification === 'public');
    const row = document.createElement('div'); row.className = 'stun-result-row';
    const server = document.createElement('span'); server.className = 'stun-server'; server.textContent = item.server.replace(/^stun:/, '');
    const address = document.createElement('span'); address.className = 'stun-address'; address.textContent = candidate?.address ?? item.result.publicAddresses?.[0] ?? 'No public candidate';
    const port = document.createElement('span'); port.className = 'stun-port'; port.textContent = candidate?.port != null ? `${candidate.protocol?.toUpperCase() ?? ''} :${candidate.port}`.trim() : 'Port unavailable';
    row.append(server, address, port); list.append(row);
  }
  parent.append(list);
}
function statusText(value) { return value === 'complete' ? 'Available' : value === 'blocked' ? 'Blocked or modified' : value === 'unsupported' ? 'Unsupported' : value === 'partial' ? 'Partial' : 'Unavailable'; }
async function safe(task, fallback) { try { return await task(); } catch { return fallback; } }

async function runAdvanced(force = false) {
  if (!currentReport || (!force && advancedRunId === currentRunId)) return;
  advancedRunId = currentRunId; advancedButton.disabled = true; advancedResults.replaceChildren(); const loading = advancedCard('Advanced diagnostics'); text(loading, 'Running best-effort checks…');
  const ips = [currentReport.ipv4?.address, currentReport.ipv6?.address].filter(Boolean);
  const [intelligence, reverseDns, stun, httpInspection, tlsFingerprint, fingerprintExposure] = await Promise.all([
    Promise.all(ips.map((ip) => runNetworkIntelligence({ ip, endpointTemplate: networkConfig.intelligenceUrlTemplate, timeoutMs: networkConfig.advancedTimeoutMs }))),
    Promise.all(ips.map((ip) => runReverseDns({ ip, resolvers: networkConfig.dohResolvers, timeoutMs: networkConfig.advancedTimeoutMs }))),
    Promise.all(networkConfig.stunUrls.map(async (server) => ({ server, result: await runWebRtcTest({ stunUrls: [server], timeoutMs: networkConfig.webrtcTimeoutMs }) }))),
    runHttpInspection({ endpoint: networkConfig.httpEchoEndpoint, timeoutMs: networkConfig.advancedTimeoutMs }),
    safe(() => runTlsFingerprint({ endpoint: networkConfig.tlsReflectorEndpoint, timeoutMs: networkConfig.fingerprintTimeoutMs }), { status: 'unavailable', error: 'TLS reflector unavailable.' }),
    safe(() => collectFingerprintExposure(window, { timeoutMs: networkConfig.fingerprintTimeoutMs }), { status: 'unavailable', canvas: { status: 'unavailable' }, webgl: { status: 'unavailable' }, webgpu: { status: 'unavailable' }, audio: { status: 'unavailable' }, findings: [] })
  ]);
  const environmentConsistency = assessEnvironmentConsistency({ browser: currentReport.browser, fingerprint: fingerprintExposure, privacy: currentReport.privacy });
  const stunMapping = compareStunMappings(stun.map((item) => ({ server: item.server, candidates: item.result.candidates })));
  advancedResults.replaceChildren();

  ips.forEach((ip, index) => { const card = advancedCard(`${ip.includes(':') ? 'IPv6' : 'IPv4'} network intelligence`); text(card, ip, 'card-value'); rows(card, intelligenceRows(intelligence[index])); const ptr = reverseDns[index]; rows(card, [['Reverse DNS', ptr?.names?.join(', ') || (ptr?.status === 'complete' ? 'No PTR record' : 'Unavailable')], ['PTR resolvers', `${ptr?.agreement?.available ?? 0}/${ptr?.agreement?.total ?? 0}${ptr?.agreement?.agree ? ' · agree' : ' · differ'}`]]); });

  const tlsCard = advancedCard('TLS fingerprint'); text(tlsCard, 'Third-party TLS reflector. This request is observed by the configured external service.', 'card-detail');
  rows(tlsCard, [['Status', tlsFingerprint.status], ['Observed IP', tlsFingerprint.observedIp || 'Unavailable'], ['HTTP', tlsFingerprint.httpVersion || 'Unavailable'], ['TLS', tlsFingerprint.tlsVersion || 'Unavailable'], ['ALPN', tlsFingerprint.alpn?.join(', ') || 'Unavailable'], ['JA3 hash', tlsFingerprint.ja3Hash || 'Unavailable'], ['JA4', tlsFingerprint.ja4 || 'Unavailable'], ['Ciphers', tlsFingerprint.cipherSummary], ['Extensions', tlsFingerprint.extensionSummary], ['HTTP/2 fingerprint', tlsFingerprint.http2Fingerprint]]);

  const fingerprintCard = advancedCard('Fingerprint exposure');
  rows(fingerprintCard, [['Canvas', statusText(fingerprintExposure.canvas?.status)], ['Canvas digest', fingerprintExposure.canvas?.digest], ['WebGL', statusText(fingerprintExposure.webgl?.status)], ['WebGL version', fingerprintExposure.webgl?.version], ['WebGL vendor', fingerprintExposure.webgl?.vendor || (fingerprintExposure.webgl?.debugRendererExposed === false ? 'Hidden by browser' : null)], ['WebGL renderer', fingerprintExposure.webgl?.renderer || (fingerprintExposure.webgl?.debugRendererExposed === false ? 'Hidden by browser' : null)], ['WebGL extensions', fingerprintExposure.webgl?.extensionCount], ['WebGPU', statusText(fingerprintExposure.webgpu?.status)], ['WebGPU adapter', [fingerprintExposure.webgpu?.adapter?.vendor, fingerprintExposure.webgpu?.adapter?.architecture, fingerprintExposure.webgpu?.adapter?.description].filter(Boolean).join(' · ') || null], ['Audio', statusText(fingerprintExposure.audio?.status)], ['Audio digest', fingerprintExposure.audio?.digest]]);
  text(fingerprintCard, 'Canvas and audio digests are computed locally and remain in this in-memory report.', 'card-detail');

  const environmentCard = advancedCard('Environment consistency');
  text(environmentCard, environmentConsistency.status === 'review' ? 'Review' : environmentConsistency.status === 'consistent' ? 'Consistent' : 'Insufficient data', environmentConsistency.status === 'review' ? 'inline-warning' : 'comparison-result');
  rows(environmentCard, [['UA platform', environmentConsistency.signals.uaPlatform], ['Legacy platform', environmentConsistency.signals.legacyPlatform], ['UA-CH platform', environmentConsistency.signals.hintsPlatform], ['WebGL renderer', environmentConsistency.signals.webglRenderer || 'Unavailable']]);
  for (const finding of environmentConsistency.findings) text(environmentCard, finding.summary, 'inline-warning');

  const stunCard = advancedCard('STUN comparison'); renderStunResults(stunCard, stun);
  const mappingCard = advancedCard('STUN mapping'); text(mappingCard, stunMapping.label, 'comparison-result');
  for (const mapping of stunMapping.mappings) rows(mappingCard, [[mapping.server.replace(/^stun:/, ''), `${mapping.address}${mapping.port != null ? `:${mapping.port}` : ''} · ${(mapping.protocol ?? 'unknown').toUpperCase()}`]]);
  if (stunMapping.label === 'Same IP, different public ports') text(mappingCard, 'Mapping changes between STUN destinations. This is a NAT behavior hint, not an exact NAT-type diagnosis.', 'card-detail');

  const httpCard = advancedCard('HTTP path'); rows(httpCard, [['Observed IP', httpInspection.observedIp || 'Unavailable'], ['Via', httpInspection.proxyHeaders?.via || 'Not returned'], ['Forwarded', httpInspection.proxyHeaders?.forwarded || 'Not returned'], ['X-Forwarded-For', httpInspection.proxyHeaders?.['x-forwarded-for'] || 'Not returned'], ['User-Agent', httpInspection.headers?.['user-agent'] || 'Unavailable'], ['Accept-Language', httpInspection.headers?.['accept-language'] || 'Unavailable']]);
  if (Object.keys(httpInspection.proxyHeaders ?? {}).length) text(httpCard, 'Proxy forwarding metadata was returned by the echo service.', 'inline-warning');

  const browserCard = advancedCard('Browser privacy surface'); const b = currentReport.browser;
  rows(browserCard, [['User-Agent', b.userAgent], ['Languages', b.languages?.join(', ')], ['Screen', b.screen?.width && b.screen?.height ? `${b.screen.width}×${b.screen.height}` : 'Unavailable'], ['Viewport', b.viewport?.width && b.viewport?.height ? `${b.viewport.width}×${b.viewport.height}` : 'Unavailable'], ['Pixel ratio', b.devicePixelRatio], ['CPU threads', b.hardwareConcurrency], ['Device memory', b.deviceMemoryGb != null ? `${b.deviceMemoryGb} GB` : 'Unavailable'], ['Touch points', b.maxTouchPoints], ['Cookies', b.cookieEnabled == null ? 'Unknown' : b.cookieEnabled ? 'Enabled' : 'Disabled'], ['Connection', b.connection?.effectiveType], ['Downlink', b.connection?.downlinkMbps != null ? `${b.connection.downlinkMbps} Mbps` : null], ['RTT', b.connection?.rttMs != null ? `${b.connection.rttMs} ms` : null]]);

  currentReport.advanced = { intelligence, reverseDns, stun, stunMapping, httpInspection, tlsFingerprint, fingerprintExposure, environmentConsistency, completedAt: new Date().toISOString() };
  reassess(); advancedButton.disabled = false;
}

async function enrichPendingMonitorEvents(state) {
  if (!features.monitorEnrichment || !monitor) return;
  for (const event of state.events.filter((item) => item.enrichmentStatus === 'pending' && item.address && !enrichingEvents.has(item.id))) {
    enrichingEvents.add(event.id);
    try { monitor.replaceEvent(await monitorEnricher.enrichEvent(event, {})); }
    finally { enrichingEvents.delete(event.id); }
  }
}
function renderMonitor(state) {
  monitorToggle.textContent = state.running ? 'Stop monitoring' : 'Start monitoring';
  monitorStatus.textContent = state.running ? `Running · ${state.sampleCount} samples · IPv4 ${state.current[4] || 'none'} · IPv6 ${state.current[6] || 'none'}` : state.sampleCount ? `Stopped · ${state.sampleCount} samples · ${state.events.length} change events` : 'Not running';
  monitorTimeline.replaceChildren();
  for (const event of [...state.events].reverse()) {
    const row = document.createElement('div'); row.className = 'monitor-event';
    const main = document.createElement('div'); main.textContent = `${event.timestamp} · IPv${event.family}: ${event.previousAddress || 'none'} → ${event.address || 'none'}`; row.append(main);
    if (event.transitionLabel) { const label = document.createElement('strong'); label.className = 'monitor-transition'; label.textContent = event.transitionLabel; row.append(label); }
    if (event.geo || event.intelligence) { const meta = document.createElement('span'); meta.className = 'monitor-enrichment'; meta.textContent = [event.geo?.country, event.intelligence?.asn ?? event.geo?.asn, event.intelligence?.organization ?? event.geo?.org].filter(Boolean).join(' · '); row.append(meta); }
    monitorTimeline.append(row);
  }
  if (currentReport) currentReport.monitor = state; queueMicrotask(() => enrichPendingMonitorEvents(state));
}
function createMonitor() {
  return createIpMonitor({ intervalMs: appConfig.monitorIntervalMs, sample: async () => { const [ipv4, ipv6] = await Promise.all([runIpConsensus({ family: 4, providers: networkConfig.ipProviders[4], timeoutMs: networkConfig.requestTimeoutMs }), runIpConsensus({ family: 6, providers: networkConfig.ipProviders[6], timeoutMs: networkConfig.requestTimeoutMs })]); return { ipv4, ipv6 }; }, onUpdate: (state) => { renderMonitor(state); reassess(); } });
}

function baselineMetadata() {
  const intelligence = currentReport?.advanced?.intelligence?.[0] ?? null;
  return { geo: currentReport?.ipv4?.geo ?? currentReport?.ipv6?.geo ?? null, intelligence };
}
async function enrichAggressiveExposures(state) {
  if (!aggressive) return;
  for (const exposure of (state.exposures ?? []).filter((item) => item.address && !item.enrichmentStatus && !enrichingAggressive.has(item.key))) {
    const expectedRunId = state.runId;
    enrichingAggressive.add(item.key);
    try {
      const enriched = await aggressiveEnricher.enrichExposure(exposure, baselineMetadata());
      aggressive.replaceExposure(enriched, expectedRunId);
    } finally { enrichingAggressive.delete(item.key); }
  }
}
function handleAggressiveUpdate(state) {
  renderAggressiveLeakTest(aggressiveElements, state);
  runButton.disabled = state.status === 'running';
  if (currentReport) currentReport.aggressive = state;
  queueMicrotask(() => enrichAggressiveExposures(state));
  reassess();
}
function createAggressiveController() {
  const initialBaseline = {
    4: [currentReport?.ipv4?.address].filter(Boolean),
    6: [currentReport?.ipv6?.address].filter(Boolean)
  };
  return createAggressiveLeakTest({
    config: appConfig,
    initialBaseline,
    environment: window,
    sampleHttp: async () => Promise.all([
      runIpConsensus({ family: 4, providers: networkConfig.ipProviders[4], timeoutMs: networkConfig.requestTimeoutMs }),
      runIpConsensus({ family: 6, providers: networkConfig.ipProviders[6], timeoutMs: networkConfig.requestTimeoutMs })
    ]),
    sampleStun: () => Promise.all(networkConfig.stunUrls.map(async (server) => ({ server, result: await runWebRtcTest({ stunUrls: [server], timeoutMs: networkConfig.webrtcTimeoutMs }) }))),
    sampleEcho: () => runHttpInspection({ endpoint: networkConfig.httpEchoEndpoint, timeoutMs: networkConfig.advancedTimeoutMs }),
    sampleTls: () => runTlsFingerprint({ endpoint: networkConfig.tlsReflectorEndpoint, timeoutMs: networkConfig.fingerprintTimeoutMs }),
    onUpdate: handleAggressiveUpdate
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
monitorToggle.addEventListener('click', async () => { if (!monitor) monitor = createMonitor(); if (monitor.getState().running) monitor.stop(); else await monitor.start(); });
aggressiveElements.toggle?.addEventListener('click', async () => {
  if (!currentReport) await runCore();
  if (!aggressive || aggressive.getState().status !== 'running') { aggressive = createAggressiveController(); await aggressive.start(); }
  else aggressive.stop();
});

if (appConfig.autoRun) queueMicrotask(runCore);
