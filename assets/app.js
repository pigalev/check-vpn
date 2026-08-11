import { appConfig, features, networkConfig } from './config.js';
import { runIpConsensus, runIpConsensusProgressive } from './ip-consensus.js';
import { runGeoIpConsensus, runGeoIpConsensusProgressive } from './geoip.js';
import { buildCountryFlagPresentation } from './country.js';
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
import { renderAggressiveLeakTest, renderAggressiveTimer } from './aggressive-leak-render.js';
import { createAggressiveLeakEnricher } from './aggressive-leak-enrichment.js';
import { createGuidedAppRuntime } from './guided-app-runtime.js';
import { collectProviderObservations } from './provider-observations.js';
import { runWebRtcStress } from './webrtc-stress.js';
import { buildConnectionView, buildLeakView, buildPrivacyView, buildAdvancedRowView } from './dashboard-view.js';
import { buildMonitorTestView } from './active-test-view.js';
import { createPresentationTicker } from './presentation-ticker.js';
import { renderIpProviderEvidence } from './provider-evidence-render.js';
import { renderGeoIpEvidence } from './geoip-evidence-render.js';

const runButton = document.querySelector('#run-tests');
const copyButton = document.querySelector('#copy-json');
const overallStatus = document.querySelector('#overall-status');
const overallMessage = document.querySelector('#overall-message');
const topFindings = document.querySelector('#top-findings');
const connectionBody = document.querySelector('#connection-body');
const leakBody = document.querySelector('#leak-body');
const privacyBody = document.querySelector('#privacy-body');
const leakStatus = document.querySelector('#leak-status');
const privacyStatus = document.querySelector('#privacy-status');
const advancedDetails = document.querySelector('#advanced-details');
const advancedResults = document.querySelector('#advanced-results');
const advancedButton = document.querySelector('#run-advanced');
const monitorToggle = document.querySelector('#monitor-toggle');
const monitorStatus = document.querySelector('#monitor-status');
const monitorTimeline = document.querySelector('#monitor-timeline');
const monitorSummaryStatus = document.querySelector('#monitor-test-summary-status');
const monitorTimer = document.querySelector('#monitor-timer');
const monitorResultPanel = document.querySelector('#monitor-result-panel');
const aggressiveElements = {
  toggle: document.querySelector('#aggressive-toggle'),
  status: document.querySelector('#aggressive-status'),
  progress: document.querySelector('#aggressive-progress'),
  summary: document.querySelector('#aggressive-summary'),
  timeline: document.querySelector('#aggressive-timeline'),
  exposures: document.querySelector('#aggressive-exposures'),
  summaryStatus: document.querySelector('#aggressive-test-summary-status'),
  timer: document.querySelector('#aggressive-timer'),
  progressBar: document.querySelector('#aggressive-progress-bar'),
  resultPanel: document.querySelector('#aggressive-result-panel')
};

let currentReport = null;
let currentRunId = 0;
let advancedRunId = null;
let running = false;
let monitor = null;
let aggressive = null;
let aggressiveMode = null;
let guidedRuntime = null;
let guidedStress = null;
let guidedFindings = [];
let guidedStressSampleCursor = 0;
let presentationTicker = null;
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

function summaryRows(parent, entries) {
  const list = document.createElement('div');
  list.className = 'summary-list';
  for (const entry of entries) {
    if (!entry || entry.value == null || entry.value === '') continue;
    const row = document.createElement('div');
    row.className = `summary-row${entry.tone ? ` summary-row-${entry.tone}` : ''}`;
    const label = document.createElement('span'); label.className = 'summary-row-label'; label.textContent = entry.label;
    const value = document.createElement('span'); value.className = 'summary-row-value';
    if (entry.value instanceof Node) value.append(value); else value.textContent = String(entry.value);
    row.append(label, value); list.append(row);
  }
  parent.append(list);
}

function locationNode(geo) {
  const wrapper = document.createElement('span'); wrapper.className = 'location-value';
  const presentation = buildCountryFlagPresentation(geo?.countryCode);
  if (presentation.imageUrl || presentation.emoji) {
    const slot = document.createElement('span'); slot.className = 'country-flag-slot';
    const emoji = document.createElement('span'); emoji.className = 'country-flag-emoji'; emoji.textContent = presentation.emoji; emoji.hidden = Boolean(presentation.imageUrl);
    if (presentation.imageUrl) {
      const img = document.createElement('img'); img.className = 'country-flag'; img.src = presentation.imageUrl; img.alt = ''; img.width = 20; img.height = 15;
      img.addEventListener('error', () => { img.remove(); emoji.hidden = !presentation.emoji; }, { once: true });
      slot.append(img);
    }
    slot.append(emoji); wrapper.append(slot);
  }
  const value = document.createElement('span');
  const place = [geo?.city, geo?.region].filter(Boolean).join(', ');
  value.textContent = [geo?.country, place].filter(Boolean).join(' · ') || 'Unknown';
  wrapper.append(value); return wrapper;
}

function authoritativeIpAddress(result) {
  if (!result?.address) return null;
  if (!result.confidence) return result.address;
  return ['strong', 'partial'].includes(result.confidence) ? result.address : null;
}

function connectionRowValue(entry) {
  if (entry.address) return entry.sourceText ?? 'Checking…';
  if (entry.state === 'checking') return 'Checking…';
  if (['no-consensus', 'unavailable'].includes(entry.state)) return entry.sourceText ?? 'Unavailable';
  return 'Not detected';
}

function noticeText(notice) {
  return notice?.summary?.replace(/^IPv\d+\s+/, '') ?? null;
}

function renderConnection(ipv4, ipv6, assessment = currentReport?.assessment ?? null) {
  const view = buildConnectionView({ ipv4, ipv6, assessment });
  connectionBody.replaceChildren();
  const primary = view.primary;
  const primaryIp = primary.family === 4 ? ipv4 : ipv6;

  if (!primary.address) {
    const message = primary.state === 'checking'
      ? 'Checking public IP…'
      : primary.state === 'no-consensus'
        ? 'Public IP consensus unavailable'
        : 'Public IP unavailable';
    text(connectionBody, message, 'connection-primary-empty');
  } else {
    text(connectionBody, primary.address, 'connection-address');
    if (primary.locationState === 'available') {
      const line = document.createElement('div'); line.className = 'connection-location'; line.append(locationNode(primaryIp?.geo)); connectionBody.append(line);
      if (primary.geoNotice) {
        text(
          connectionBody,
          noticeText(primary.geoNotice),
          primary.geoNotice.severity === 'review' ? 'connection-location-warning' : 'connection-location-info'
        );
      }
    } else if (primary.locationState === 'locating') text(connectionBody, 'Locating…', 'connection-meta');
    else if (primary.locationState === 'unavailable') text(connectionBody, noticeText(primary.geoNotice) ?? 'Location unavailable', 'connection-meta');
    if (primary.network) text(connectionBody, primary.network, 'connection-meta');
  }

  const compact = [{ label: `IPv${primary.family}`, value: connectionRowValue(primary) }];
  const secondary = view.secondary;
  compact.push({ label: `IPv${secondary.family}`, value: connectionRowValue(secondary) });
  summaryRows(connectionBody, compact);

  if (secondary.address) {
    const secondaryIp = secondary.family === 4 ? ipv4 : ipv6;
    const details = document.createElement('details'); details.className = 'panel-details';
    const summary = document.createElement('summary'); summary.textContent = `IPv${secondary.family} details`; details.append(summary);
    const body = document.createElement('div'); body.className = 'panel-details-body';
    rows(body, [
      ['Address', secondary.address],
      ['Location', secondary.locationState === 'available' ? locationNode(secondaryIp?.geo) : secondary.locationState === 'locating' ? 'Locating…' : 'Unavailable'],
      ['Network', secondary.network],
      ['Sources', secondary.sourceText]
    ]);
    details.append(body); connectionBody.append(details);
  }
}

function renderLeakChecks(result, ipv4, ipv6) {
  const view = buildLeakView({ webrtc: result, ipv4, ipv6 });
  leakBody.replaceChildren();
  leakStatus.textContent = view.status === 'leak' ? 'Leak detected' : view.status === 'clear' ? 'Clear' : 'Unavailable';
  if (view.publicMismatch) {
    summaryRows(leakBody, [{ label: 'WebRTC public IP', value: view.mismatchAddresses.join(', '), tone: 'danger' }]);
    text(leakBody, 'Public WebRTC address differs from HTTP public IP.', 'inline-danger');
  } else {
    summaryRows(leakBody, [
      { label: 'WebRTC public IP', value: view.publicAddresses.length && view.status !== 'unavailable' ? 'No mismatch' : view.publicAddresses.length ? 'Observed · HTTP consensus unavailable' : 'Not exposed' },
      { label: 'Local address privacy', value: view.mdnsProtection ? 'mDNS protected' : 'Review details' }
    ]);
  }

  const details = document.createElement('details'); details.className = 'panel-details';
  const head = document.createElement('summary'); head.textContent = 'WebRTC details'; details.append(head);
  const body = document.createElement('div'); body.className = 'panel-details-body';
  if (result?.error) text(body, result.error);
  const summary = result?.summary ?? {};
  const trusted = new Set([authoritativeIpAddress(ipv4), authoritativeIpAddress(ipv6)].filter(Boolean));
  const privacy = summarizeWebRtcPrivacy(result?.candidates ?? [], trusted);
  rows(body, [
    ['Public', result?.publicAddresses?.join(', ') || 'Not detected'],
    ['Candidates', `${result?.candidates?.length ?? 0} total`],
    ['Types', `host ${summary.host ?? 0} · srflx ${summary.srflx ?? 0} · relay ${summary.relay ?? 0}`],
    ['Families', `IPv4 ${summary.ipv4 ?? 0} · IPv6 ${summary.ipv6 ?? 0}`],
    ['Transport', `UDP ${summary.udp ?? 0} · TCP ${summary.tcp ?? 0}`],
    ['Numeric private IPv4', privacy.numericPrivateIpv4Exposed ? 'Exposed' : 'Not detected'],
    ['CGNAT candidate', privacy.cgnatExposed ? 'Exposed' : 'Not detected'],
    ['Private/ULA IPv6', privacy.privateIpv6Exposed ? 'Exposed' : 'Not detected'],
    ['mDNS protection', privacy.mdnsProtection ? 'Active' : 'Not observed'],
    ['Public mismatch', trusted.size ? (privacy.publicMismatches.length ? privacy.publicMismatches.join(', ') : 'No') : 'Not evaluated without HTTP consensus']
  ]);
  const list = document.createElement('div'); list.className = 'candidate-list';
  for (const candidate of result?.candidates ?? []) {
    const d = describeCandidate(candidate); const item = document.createElement('div'); item.className = 'candidate-item';
    text(item, d.heading, 'candidate-heading'); text(item, candidate.classification === 'mdns' ? 'Hidden by browser' : candidate.address, 'candidate-address');
    if (candidate.classification === 'mdns') text(item, candidate.address, 'candidate-technical-address');
    text(item, d.meta, 'candidate-meta'); if (candidate.port != null) text(item, `Port ${candidate.port}`, 'candidate-meta'); if (d.note) text(item, d.note, 'candidate-note'); list.append(item);
  }
  body.append(list); details.append(body); leakBody.append(details);
}

function renderPrivacy(browser, privacy) {
  const view = buildPrivacyView({ browser, privacy });
  privacyBody.replaceChildren();
  privacyStatus.textContent = view.status === 'review' ? 'Review' : 'Clear';
  summaryRows(privacyBody, view.summaryRows.map((entry) => ({ label: entry.label, value: entry.value, tone: entry.tone })));
  const details = document.createElement('details'); details.className = 'panel-details';
  const head = document.createElement('summary'); head.textContent = 'Privacy details'; details.append(head);
  const body = document.createElement('div'); body.className = 'panel-details-body';
  rows(body, view.detailRows.map((entry) => [entry.label, entry.value]));
  details.append(body); privacyBody.append(details);
}

function guidedStressRunning() { return guidedStress?.getState?.().status === 'running'; }

function currentAggressiveFindings() {
  if (aggressiveMode === 'guided') return [];
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
    aggressiveFindings: currentAggressiveFindings(), guidedFindings
  });
  renderOverall(currentReport.assessment);
  renderConnection(currentReport.ipv4, currentReport.ipv6, currentReport.assessment);
}

function renderOverall(assessment) {
  const labels = { protected: 'Protected', review: 'Review', leak: 'Leak detected', incomplete: 'Incomplete' };
  overallStatus.textContent = labels[assessment.status] ?? assessment.status;
  overallStatus.dataset.status = assessment.status;
  overallMessage.textContent = assessment.message;
  topFindings.replaceChildren();
  for (const finding of assessment.findings.filter((item) => item.severity !== 'info').slice(0, 4)) {
    const chip = document.createElement('span'); chip.className = `finding-chip finding-${finding.severity}`; chip.textContent = finding.summary; topFindings.append(chip);
  }
}

async function runCore() {
  if (running || aggressive?.getState?.().status === 'running' || guidedStressRunning()) return;
  running = true; runButton.disabled = true; copyButton.disabled = true; currentRunId += 1;
  const expectedRunId = currentRunId;
  advancedRunId = null; advancedResults.replaceChildren();
  overallStatus.textContent = 'Running'; overallStatus.dataset.status = 'running'; overallMessage.textContent = 'Running core diagnostics.';
  leakStatus.textContent = 'Running'; privacyStatus.textContent = 'Running';
  leakBody.innerHTML = '<p class="card-detail">Checking browser-visible leak paths…</p>';
  privacyBody.innerHTML = '<p class="card-detail">Checking browser and IP consistency…</p>';

  const displayedAddress = { 4: null, 6: null };
  const finalIpByFamily = { 4: null, 6: null };
  const earlyGeo = new Map();
  const geoPromises = new Map();
  const liveIp = {
    4: { family: 4, address: null, ipFinal: false, geo: null, geoPending: false, geoFinal: false },
    6: { family: 6, address: null, ipFinal: false, geo: null, geoPending: false, geoFinal: false }
  };
  const renderLiveConnection = () => { if (currentRunId === expectedRunId) renderConnection(liveIp[4], liveIp[6], null); };
  renderLiveConnection();

  function locate(address, family) {
    if (!address || !features.geoip) return Promise.resolve(null);
    if (!geoPromises.has(address)) {
      geoPromises.set(address, runGeoIpConsensusProgressive({
        ip: address,
        providers: networkConfig.geoIpProviders,
        timeoutMs: networkConfig.geoIpTimeoutMs,
        onFirstUsable: (geo) => {
          if (currentRunId !== expectedRunId || displayedAddress[family] !== address) return;
          earlyGeo.set(address, geo);
          const finalIp = finalIpByFamily[family];
          liveIp[family] = {
            ...(finalIp ?? liveIp[family]), family, address, geo,
            agreement: finalIp?.agreement ?? liveIp[family]?.agreement ?? null,
            ipFinal: Boolean(finalIp), geoPending: true, geoFinal: false
          };
          renderLiveConnection();
        }
      }));
    }
    return geoPromises.get(address);
  }

  function handleFirstIp(family, source) {
    if (currentRunId !== expectedRunId) return;
    displayedAddress[family] = source.address;
    liveIp[family] = { family, address: source.address, agreement: null, geo: null, ipFinal: false, geoPending: features.geoip, geoFinal: false };
    renderLiveConnection();
    void locate(source.address, family);
  }

  const ipv4Promise = runIpConsensusProgressive({
    family: 4,
    primaryGroups: networkConfig.coreIpProviderGroups[4],
    reserveGroups: networkConfig.reserveIpProviderGroups[4],
    timeoutMs: networkConfig.coreIpTimeoutMs,
    onFirstValid: (source) => handleFirstIp(4, source)
  });
  const ipv6Promise = runIpConsensusProgressive({
    family: 6,
    primaryGroups: networkConfig.coreIpProviderGroups[6],
    reserveGroups: networkConfig.reserveIpProviderGroups[6],
    timeoutMs: networkConfig.coreIpTimeoutMs,
    onFirstValid: (source) => handleFirstIp(6, source)
  });
  const webrtcPromise = runWebRtcTest({ stunUrls: networkConfig.stunUrls, timeoutMs: networkConfig.webrtcTimeoutMs }).then((result) => {
    if (currentRunId === expectedRunId) renderLeakChecks(result, liveIp[4], liveIp[6]);
    return result;
  });

  async function finalizeFamily(family, ipPromise) {
    const result = await ipPromise;
    if (currentRunId !== expectedRunId) return null;
    finalIpByFamily[family] = result; displayedAddress[family] = result.address ?? null;
    if (!result.address) {
      const finalResult = { ...result, geo: null, ipFinal: true, geoPending: false, geoFinal: true };
      liveIp[family] = finalResult; renderLiveConnection(); return finalResult;
    }

    liveIp[family] = { ...result, geo: earlyGeo.get(result.address) ?? null, ipFinal: true, geoPending: features.geoip, geoFinal: false };
    renderLiveConnection();
    const geo = await locate(result.address, family);
    if (currentRunId !== expectedRunId || displayedAddress[family] !== result.address) return null;
    const finalResult = { ...result, geo, ipFinal: true, geoPending: false, geoFinal: true };
    liveIp[family] = finalResult; renderLiveConnection(); return finalResult;
  }

  const [ipv4, ipv6, webrtc] = await Promise.all([finalizeFamily(4, ipv4Promise), finalizeFamily(6, ipv6Promise), webrtcPromise]);
  if (currentRunId !== expectedRunId || !ipv4 || !ipv6) return;

  const browser = collectBrowserInfo(window);
  const privacy = assessPrivacy({ browser, ipv4, ipv6 });
  const networkFindings = assessAddressFamilies({ ipv4, ipv6, webrtc });
  const assessment = assessResults({ ipv4, ipv6, webrtc, privacy, networkFindings, monitorFindings: [], aggressiveFindings: currentAggressiveFindings(), guidedFindings });
  currentReport = { startedAt: new Date().toISOString(), runId: expectedRunId, ipv4, ipv6, webrtc, browser, privacy, assessment, advanced: null, monitor: monitor?.getState?.() ?? null, aggressive: aggressive?.getState?.() ?? null, guidedLeak: guidedRuntime?.getReport?.() ?? null };
  renderConnection(ipv4, ipv6, assessment); renderLeakChecks(webrtc, ipv4, ipv6); renderPrivacy(browser, privacy); renderOverall(assessment);
  running = false; runButton.disabled = guidedStressRunning(); copyButton.disabled = false;
}

function intelligenceRows(result) {
  if (result?.status !== 'complete') return [];
  return [['ASN', result.asn], ['Organization', result.organization], ['Prefix', result.prefix], ['RIR', result.rir], ['Type', result.networkType], ['VPN', result.isVpn == null ? 'Unknown' : result.isVpn ? 'Detected' : 'No'], ['Proxy', result.isProxy == null ? 'Unknown' : result.isProxy ? 'Detected' : 'No'], ['Tor', result.isTor == null ? 'Unknown' : result.isTor ? 'Detected' : 'No'], ['Datacenter', result.isDatacenter == null ? 'Unknown' : result.isDatacenter ? 'Yes' : 'No'], ['Mobile', result.isMobile == null ? 'Unknown' : result.isMobile ? 'Yes' : 'No'], ['Abuse flag', result.isAbuser == null ? 'Unknown' : result.isAbuser ? 'Present' : 'No']];
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

function advancedDisclosure({ id, title, status, summary }) {
  const root = document.createElement('details'); root.className = `advanced-row advanced-row-${status}`; root.dataset.advancedId = id;
  const head = document.createElement('summary'); head.className = 'advanced-row-summary';
  const label = document.createElement('span'); label.textContent = title;
  const brief = document.createElement('span'); brief.className = 'advanced-row-brief'; brief.textContent = summary || status;
  head.append(label, brief);
  const body = document.createElement('div'); body.className = 'advanced-row-body';
  root.append(head, body); advancedResults.append(root); return { root, body };
}

async function runAdvanced(force = false) {
  if (!currentReport || (!force && advancedRunId === currentRunId)) return;
  advancedRunId = currentRunId; advancedButton.disabled = true; advancedResults.replaceChildren();
  const loading = document.createElement('p'); loading.className = 'advanced-loading'; loading.textContent = 'Running best-effort checks…'; advancedResults.append(loading);
  const familyEntries = [currentReport.ipv4, currentReport.ipv6].filter((result) => result && (result.address || (result.sources?.length ?? 0)));
  const authoritativeEntries = familyEntries.filter((result) => authoritativeIpAddress(result));
  const ips = authoritativeEntries.map((result) => result.address);
  const [intelligence, reverseDns, stun, httpInspection, tlsFingerprint, fingerprintExposure] = await Promise.all([
    Promise.all(ips.map((ip) => runNetworkIntelligence({ ip, endpointTemplate: networkConfig.intelligenceUrlTemplate, timeoutMs: networkConfig.advancedTimeoutMs }))),
    Promise.all(ips.map((ip) => runReverseDns({ ip, resolvers: networkConfig.dohResolvers, timeoutMs: networkConfig.advancedTimeoutMs }))),
    Promise.all(networkConfig.stunUrls.map(async (server) => ({ server, result: await runWebRtcTest({ stunUrls: [server], timeoutMs: networkConfig.webrtcTimeoutMs }) }))),
    runHttpInspection({ endpoint: networkConfig.httpEchoEndpoint, timeoutMs: networkConfig.advancedTimeoutMs }),
    safe(() => runTlsFingerprint({ endpoint: networkConfig.tlsReflectorEndpoint, timeoutMs: networkConfig.fingerprintTimeoutMs }), { status: 'unavailable', error: 'TLS reflector unavailable.' }),
    safe(() => collectFingerprintExposure(window, { timeoutMs: networkConfig.fingerprintTimeoutMs }), { status: 'unavailable', canvas: { status: 'unavailable' }, webgl: { status: 'unavailable' }, webgpu: { status: 'unavailable' }, audio: { status: 'unavailable' }, findings: [] })
  ]);
  const intelligenceByAddress = new Map(ips.map((ip, index) => [ip, intelligence[index]]));
  const reverseDnsByAddress = new Map(ips.map((ip, index) => [ip, reverseDns[index]]));
  const environmentConsistency = assessEnvironmentConsistency({ browser: currentReport.browser, fingerprint: fingerprintExposure, privacy: currentReport.privacy });
  const stunMapping = compareStunMappings(stun.map((item) => ({ server: item.server, candidates: item.result.candidates })));
  advancedResults.replaceChildren();

  familyEntries.forEach((entry) => {
    const ip = authoritativeIpAddress(entry);
    const family = entry.family ?? (ip?.includes(':') ? 6 : 4);
    const intel = ip ? intelligenceByAddress.get(ip) : null;
    const ptr = ip ? reverseDnsByAddress.get(ip) : null;
    const noConsensus = entry.confidence === 'no-consensus';
    const row = advancedDisclosure({
      id: `network-v${family}`,
      title: `IPv${family} network`,
      status: noConsensus ? 'review' : intel?.status === 'complete' ? 'complete' : 'partial',
      summary: ip ? ([intel?.asn, intel?.organization].filter(Boolean).join(' · ') || ip) : noConsensus ? 'No consensus' : 'Unavailable'
    });
    if (ip) {
      text(row.body, ip, 'card-value'); rows(row.body, intelligenceRows(intel));
      rows(row.body, [['Reverse DNS', ptr?.names?.join(', ') || (ptr?.status === 'complete' ? 'No PTR record' : 'Unavailable')], ['PTR resolvers', `${ptr?.agreement?.available ?? 0}/${ptr?.agreement?.total ?? 0}${ptr?.agreement?.agree ? ' · agree' : ' · differ'}`]]);
    } else {
      text(row.body, noConsensus ? 'No authoritative public IP was selected. Review the source votes below.' : 'No public IP was confirmed for this family.', 'card-detail');
    }
    renderIpProviderEvidence(row.body, entry);
    if (ip && entry.geo) renderGeoIpEvidence(row.body, entry.geo);
  });

  const tlsAvailable = ['complete', 'partial'].includes(tlsFingerprint.status);
  const tlsView = buildAdvancedRowView({ id: 'tls', title: 'TLS fingerprint', result: tlsFingerprint, summary: tlsAvailable ? [tlsFingerprint.tlsVersion, tlsFingerprint.httpVersion, tlsFingerprint.ja4 ? 'JA4 available' : null].filter(Boolean).join(' · ') || 'Available' : null });
  const tls = advancedDisclosure({ id: 'tls', title: 'TLS fingerprint', status: tlsAvailable ? tlsFingerprint.status : 'unavailable', summary: tlsView.summary });
  if (!tlsAvailable) text(tls.body, tlsFingerprint.error || 'External reflector could not be reached. Use Run advanced again to retry.', 'card-detail');
  else rows(tls.body, [['Observed IP', tlsFingerprint.observedIp], ['HTTP', tlsFingerprint.httpVersion], ['TLS', tlsFingerprint.tlsVersion], ['ALPN', tlsFingerprint.alpn?.join(', ') || null], ['JA3 hash', tlsFingerprint.ja3Hash], ['JA4', tlsFingerprint.ja4], ['Ciphers', tlsFingerprint.cipherSummary], ['Extensions', tlsFingerprint.extensionSummary], ['HTTP/2 fingerprint', tlsFingerprint.http2Fingerprint]]);

  const fingerprint = advancedDisclosure({ id: 'fingerprint', title: 'Fingerprint exposure', status: fingerprintExposure.status ?? 'partial', summary: 'Canvas · WebGL · WebGPU · Audio' });
  rows(fingerprint.body, [['Canvas', statusText(fingerprintExposure.canvas?.status)], ['Canvas digest', fingerprintExposure.canvas?.digest], ['WebGL', statusText(fingerprintExposure.webgl?.status)], ['WebGL version', fingerprintExposure.webgl?.version], ['WebGL vendor', fingerprintExposure.webgl?.vendor || (fingerprintExposure.webgl?.debugRendererExposed === false ? 'Hidden by browser' : null)], ['WebGL renderer', fingerprintExposure.webgl?.renderer || (fingerprintExposure.webgl?.debugRendererExposed === false ? 'Hidden by browser' : null)], ['WebGL extensions', fingerprintExposure.webgl?.extensionCount], ['WebGPU', statusText(fingerprintExposure.webgpu?.status)], ['WebGPU adapter', [fingerprintExposure.webgpu?.adapter?.vendor, fingerprintExposure.webgpu?.adapter?.architecture, fingerprintExposure.webgpu?.adapter?.description].filter(Boolean).join(' · ') || null], ['Audio', statusText(fingerprintExposure.audio?.status)], ['Audio digest', fingerprintExposure.audio?.digest]]);
  text(fingerprint.body, 'Canvas and audio digests are computed locally and remain in this in-memory report.', 'card-detail');

  const environment = advancedDisclosure({ id: 'environment', title: 'Environment consistency', status: environmentConsistency.status === 'review' ? 'review' : 'complete', summary: environmentConsistency.status === 'review' ? 'Review' : environmentConsistency.status === 'consistent' ? 'No contradiction' : 'Insufficient data' });
  rows(environment.body, [['UA platform', environmentConsistency.signals.uaPlatform], ['Legacy platform', environmentConsistency.signals.legacyPlatform], ['UA-CH platform', environmentConsistency.signals.hintsPlatform], ['WebGL renderer', environmentConsistency.signals.webglRenderer]]);
  for (const finding of environmentConsistency.findings) text(environment.body, finding.summary, 'inline-warning');

  const stunRow = advancedDisclosure({ id: 'stun', title: 'STUN comparison', status: 'complete', summary: `${stun.length} destinations` }); renderStunResults(stunRow.body, stun);
  const mapping = advancedDisclosure({ id: 'stun-mapping', title: 'STUN mapping', status: 'complete', summary: stunMapping.label });
  for (const item of stunMapping.mappings) rows(mapping.body, [[item.server.replace(/^stun:/, ''), `${item.address}${item.port != null ? `:${item.port}` : ''} · ${(item.protocol ?? 'unknown').toUpperCase()}`]]);
  if (stunMapping.label === 'Same IP, different public ports') text(mapping.body, 'Mapping changes between STUN destinations. This is a NAT behavior hint, not an exact NAT-type diagnosis.', 'card-detail');

  const http = advancedDisclosure({ id: 'http', title: 'HTTP request path', status: httpInspection.status ?? 'partial', summary: httpInspection.observedIp || 'Best effort' });
  rows(http.body, [['Observed IP', httpInspection.observedIp], ['Via', httpInspection.proxyHeaders?.via], ['Forwarded', httpInspection.proxyHeaders?.forwarded], ['X-Forwarded-For', httpInspection.proxyHeaders?.['x-forwarded-for']], ['User-Agent', httpInspection.headers?.['user-agent']], ['Accept-Language', httpInspection.headers?.['accept-language']]]);
  if (Object.keys(httpInspection.proxyHeaders ?? {}).length) text(http.body, 'Proxy forwarding metadata was returned by the echo service.', 'inline-warning');

  const b = currentReport.browser;
  const browserRow = advancedDisclosure({ id: 'browser', title: 'Browser privacy surface', status: 'complete', summary: [b.platform, b.language].filter(Boolean).join(' · ') || 'Available' });
  rows(browserRow.body, [['User-Agent', b.userAgent], ['Languages', b.languages?.join(', ')], ['Screen', b.screen?.width && b.screen?.height ? `${b.screen.width}×${b.screen.height}` : null], ['Viewport', b.viewport?.width && b.viewport?.height ? `${b.viewport.width}×${b.viewport.height}` : null], ['Pixel ratio', b.devicePixelRatio], ['CPU threads', b.hardwareConcurrency], ['Device memory', b.deviceMemoryGb != null ? `${b.deviceMemoryGb} GB` : null], ['Touch points', b.maxTouchPoints], ['Cookies', b.cookieEnabled == null ? 'Unknown' : b.cookieEnabled ? 'Enabled' : 'Disabled'], ['Connection', b.connection?.effectiveType], ['Downlink', b.connection?.downlinkMbps != null ? `${b.connection.downlinkMbps} Mbps` : null], ['RTT', b.connection?.rttMs != null ? `${b.connection.rttMs} ms` : null]]);

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

function renderResultPanel(parent, view) {
  parent?.replaceChildren?.();
  if (!parent || !view?.resultLabel) return;
  const panel = document.createElement('div'); panel.className = `test-result-panel test-result-${view.resultTone ?? 'neutral'}`;
  text(panel, 'RESULT', 'test-result-kicker');
  const title = document.createElement('strong'); title.className = 'test-result-title'; title.textContent = view.resultLabel; panel.append(title);
  if (view.resultMessage) text(panel, view.resultMessage, 'test-result-message');
  parent.append(panel);
}

function renderMonitor(state, nowMs = Date.now(), { evidence = true } = {}) {
  const view = buildMonitorTestView(state, nowMs);
  monitorToggle.textContent = state.running ? 'Stop monitoring' : 'Start monitoring';
  if (monitorSummaryStatus) monitorSummaryStatus.textContent = view.summaryStatus;
  if (monitorTimer) monitorTimer.textContent = view.elapsedText ?? '';
  renderResultPanel(monitorResultPanel, view);
  monitorStatus.textContent = state.running ? `Running · ${state.sampleCount} samples · IPv4 ${state.current[4] || 'none'} · IPv6 ${state.current[6] || 'none'}` : state.sampleCount ? `Stopped · ${state.sampleCount} samples · ${state.events.length} change events` : 'Not running';
  if (!evidence) return;
  monitorTimeline.replaceChildren();
  for (const event of [...state.events].reverse()) {
    const row = document.createElement('div'); row.className = 'monitor-event';
    const main = document.createElement('div'); main.textContent = `${event.timestamp} · IPv${event.family}: ${event.previousAddress || 'none'} → ${event.address || 'none'}`; row.append(main);
    if (event.transitionLabel) { const label = document.createElement('strong'); label.className = 'monitor-transition'; label.textContent = event.transitionLabel; row.append(label); }
    if (event.geo || event.intelligence) { const meta = document.createElement('span'); meta.className = 'monitor-enrichment'; meta.textContent = [event.geo?.country, event.intelligence?.asn ?? event.geo?.asn, event.intelligence?.organization ?? event.geo?.org].filter(Boolean).join(' · '); row.append(meta); }
    monitorTimeline.append(row);
  }
  if (currentReport) currentReport.monitor = state;
  queueMicrotask(() => enrichPendingMonitorEvents(state));
}

function syncPresentationTicker() {
  const active = Boolean(
    monitor?.getState?.().running ||
    (aggressiveMode === 'unguided' && aggressive?.getState?.().status === 'running') ||
    guidedRuntime?.hasPresentationTimer?.()
  );
  presentationTicker?.sync(active);
}

function runStressIpConsensus(family) {
  return runIpConsensus({
    family,
    primaryGroups: networkConfig.stressIpProviderGroups[family],
    reserveGroups: [],
    timeoutMs: networkConfig.requestTimeoutMs
  });
}

function createMonitor() {
  return createIpMonitor({
    intervalMs: appConfig.monitorIntervalMs,
    sample: async () => {
      const [ipv4, ipv6] = await Promise.all([runStressIpConsensus(4), runStressIpConsensus(6)]);
      return { ipv4, ipv6 };
    },
    onUpdate: (state) => { renderMonitor(state); syncPresentationTicker(); reassess(); }
  });
}

function baselineMetadata() {
  const intelligence = currentReport?.advanced?.intelligence?.[0] ?? null;
  return { geo: currentReport?.ipv4?.geo ?? currentReport?.ipv6?.geo ?? null, intelligence };
}
async function enrichAggressiveExposures(state) {
  if (!aggressive) return;
  for (const exposure of (state.exposures ?? []).filter((item) => item.address && !item.enrichmentStatus && !enrichingAggressive.has(item.key))) {
    const expectedRunId = state.runId; enrichingAggressive.add(item.key);
    try { const enriched = await aggressiveEnricher.enrichExposure(exposure, baselineMetadata()); aggressive.replaceExposure(enriched, expectedRunId); }
    finally { enrichingAggressive.delete(item.key); }
  }
}
function handleAggressiveUpdate(state) {
  aggressiveMode = 'unguided'; renderAggressiveLeakTest(aggressiveElements, state);
  runButton.disabled = state.status === 'running' || guidedStressRunning();
  if (currentReport) currentReport.aggressive = state;
  syncPresentationTicker();
  queueMicrotask(() => enrichAggressiveExposures(state)); reassess();
}
function createAggressiveController() {
  const initialBaseline = { 4: [authoritativeIpAddress(currentReport?.ipv4)].filter(Boolean), 6: [authoritativeIpAddress(currentReport?.ipv6)].filter(Boolean) };
  return createAggressiveLeakTest({
    config: appConfig, initialBaseline, environment: window,
    sampleHttp: async () => Promise.all([runStressIpConsensus(4), runStressIpConsensus(6)]),
    sampleStun: () => Promise.all(networkConfig.stunUrls.map(async (server) => ({ server, result: await runWebRtcTest({ stunUrls: [server], timeoutMs: networkConfig.webrtcTimeoutMs }) }))),
    sampleEcho: () => runHttpInspection({ endpoint: networkConfig.httpEchoEndpoint, timeoutMs: networkConfig.advancedTimeoutMs }),
    sampleTls: () => runTlsFingerprint({ endpoint: networkConfig.tlsReflectorEndpoint, timeoutMs: networkConfig.fingerprintTimeoutMs }),
    onUpdate: handleAggressiveUpdate
  });
}

function guidedObservationRow(item, index) {
  return { ...item, status: item?.successful ? 'complete' : item?.status ?? 'unavailable', providerLabel: item?.providerLabel ?? item?.source ?? item?.providerId ?? 'Guided path', pathId: item?.providerId ?? item?.pathId ?? `${item?.channel ?? item?.transportClass ?? 'path'}:${item?.source ?? index}`, timestampMs: item?.timestampMs ?? Date.now() };
}
async function sampleGuidedRawHttp(trigger) {
  const families = await Promise.all([4, 6].map((family) => collectProviderObservations({ family, groups: networkConfig.stressIpProviderGroups[family], timeoutMs: networkConfig.requestTimeoutMs, trigger })));
  return families.flat();
}
function createGuidedStressController(profile, recordObservations, onStressUpdate) {
  guidedStressSampleCursor = 0;
  return createAggressiveLeakTest({
    config: appConfig, initialBaseline: { 4: [], 6: [] }, guidedProfile: profile, environment: window,
    sampleHttp: async () => Promise.all([runStressIpConsensus(4), runStressIpConsensus(6)]),
    sampleHttpObservations: sampleGuidedRawHttp,
    sampleStun: () => Promise.all(networkConfig.stunDestinations.map(async (destination) => ({ server: destination.urls[0], group: destination.group, result: await runWebRtcTest({ stunUrls: destination.urls, timeoutMs: networkConfig.webrtcTimeoutMs }) }))),
    sampleWebRtcStress: (trigger) => runWebRtcStress({ destinations: networkConfig.stunDestinations, timeoutMs: networkConfig.webrtcTimeoutMs, trigger }),
    sampleEcho: () => runHttpInspection({ endpoint: networkConfig.httpEchoEndpoint, timeoutMs: networkConfig.advancedTimeoutMs }),
    sampleTls: () => runTlsFingerprint({ endpoint: networkConfig.tlsReflectorEndpoint, timeoutMs: networkConfig.fingerprintTimeoutMs }),
    onUpdate: (state) => {
      const fresh = (state.samples ?? []).slice(guidedStressSampleCursor); guidedStressSampleCursor = state.samples?.length ?? guidedStressSampleCursor;
      if (fresh.length) recordObservations(fresh.map(guidedObservationRow)); onStressUpdate?.();
      runButton.disabled = state.status === 'running'; aggressiveElements.toggle.disabled = state.status === 'running';
      syncPresentationTicker();
    }
  });
}
async function startGuidedStress(profile, recordObservations, onStressUpdate) {
  if (aggressive?.getState?.().status === 'running') aggressive.stop();
  aggressive = null; if (currentReport) currentReport.aggressive = null; aggressiveMode = 'guided';
  guidedStress = createGuidedStressController(profile, recordObservations, onStressUpdate); await guidedStress.start(); return guidedStress.getState();
}
function handleGuidedChange({ report, findings }) {
  guidedFindings = findings ?? []; if (currentReport) currentReport.guidedLeak = report;
  if (guidedRuntime?.isGuidedStress?.()) aggressiveMode = 'guided';
  const isRunning = guidedStressRunning(); runButton.disabled = running || isRunning || aggressive?.getState?.().status === 'running'; aggressiveElements.toggle.disabled = isRunning;
  syncPresentationTicker(); reassess();
}

guidedRuntime = createGuidedAppRuntime({
  storage: window.sessionStorage, networkConfig, document, navigator, runWebRtcTest, runHttpInspection, runTlsFingerprint,
  ensureCore: async () => { if (!currentReport) await runCore(); }, startStress: startGuidedStress,
  stopStress: () => guidedStress?.stop?.(), getStressState: () => guidedStress?.getState?.() ?? null, onChange: handleGuidedChange
});

presentationTicker = createPresentationTicker({
  onTick: (nowMs) => {
    const aggressiveState = aggressive?.getState?.();
    if (aggressiveMode === 'unguided' && aggressiveState?.status === 'running') renderAggressiveTimer(aggressiveElements, aggressiveState, nowMs);
    const monitorState = monitor?.getState?.();
    if (monitorState?.running) renderMonitor(monitorState, nowMs, { evidence: false });
    guidedRuntime?.renderTimer?.(nowMs);
  }
});
syncPresentationTicker();

async function copyReport() {
  if (!currentReport) return;
  currentReport.guidedLeak = guidedRuntime?.getReport?.() ?? currentReport.guidedLeak ?? null;
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
  if (guidedStressRunning()) return;
  if (!currentReport) await runCore();
  aggressiveMode = 'unguided';
  if (!aggressive || aggressive.getState().status !== 'running') { aggressive = createAggressiveController(); await aggressive.start(); }
  else aggressive.stop();
});

if (appConfig.autoRun) queueMicrotask(runCore);