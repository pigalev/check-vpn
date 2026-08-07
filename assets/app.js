import { appConfig, features, getEnabledChecks, networkConfig } from './config.js';
import { runIpTest } from './ip-tests.js';
import { runGeoIpLookup } from './geoip.js';
import { countryCodeToFlagUrl } from './country.js';
import { describeCandidate, runWebRtcTest } from './webrtc-test.js';
import { collectBrowserInfo } from './browser-info.js';
import { assessResults } from './assessment.js';

const labels = {
  idle: 'Not run',
  running: 'Running',
  complete: 'Complete',
  unavailable: 'Unavailable',
  error: 'Error'
};

const cardDefinitions = {
  ipv4: { title: 'IPv4', description: 'Public IPv4 address reported over HTTP.' },
  ipv6: { title: 'IPv6', description: 'Public IPv6 address reported over an IPv6 connection.' },
  webrtc: { title: 'WebRTC', description: 'ICE candidates exposed by the browser.' }
};

const grid = document.querySelector('#results-grid');
const runButton = document.querySelector('#run-tests');
const copyButton = document.querySelector('#copy-json');
const overallStatus = document.querySelector('#overall-status');
const overallMessage = document.querySelector('#overall-message');
let currentReport = null;
let running = false;

function createCard(id, title, description) {
  const article = document.createElement('article');
  article.className = 'result-card';
  article.id = `${id}-card`;

  const header = document.createElement('div');
  header.className = 'card-header';
  const heading = document.createElement('h2');
  heading.textContent = title;
  const status = document.createElement('span');
  status.className = 'card-status';
  status.dataset.field = 'status';
  status.textContent = 'Not run';
  header.append(heading, status);

  const body = document.createElement('div');
  body.className = 'card-body';
  body.dataset.field = 'body';
  const initial = document.createElement('p');
  initial.className = 'card-detail';
  initial.textContent = description;
  body.append(initial);

  article.append(header, body);
  grid.append(article);
  return article;
}

const cards = new Map();
for (const check of getEnabledChecks(features)) {
  const definition = cardDefinitions[check];
  cards.set(check, createCard(check, definition.title, definition.description));
}
cards.set('browser', createCard('browser', 'Browser and network', 'Information exposed by this browser.'));

function setCardState(name, status) {
  const card = cards.get(name);
  if (!card) return null;
  card.classList.toggle('is-running', status === 'running');
  card.querySelector('[data-field="status"]').textContent = labels[status] ?? status;
  return card.querySelector('[data-field="body"]');
}

function clearBody(body) {
  body.replaceChildren();
}

function addText(body, text, className = 'card-detail') {
  const element = document.createElement('p');
  element.className = className;
  element.textContent = text;
  body.append(element);
  return element;
}

function addDetailList(body, rows) {
  const list = document.createElement('div');
  list.className = 'detail-list';
  for (const [label, value] of rows) {
    if (!value) continue;
    const row = document.createElement('div');
    row.className = 'detail-row';
    const key = document.createElement('span');
    key.className = 'detail-label';
    key.textContent = label;
    const content = document.createElement('span');
    content.className = 'detail-value';
    if (value instanceof Node) content.append(value);
    else content.textContent = value;
    row.append(key, content);
    list.append(row);
  }
  body.append(list);
}

function renderRunning(name) {
  const body = setCardState(name, 'running');
  if (!body) return;
  clearBody(body);
  addText(body, cardDefinitions[name]?.description ?? 'Collecting information.');
}

function formatGeoLocation(geo) {
  if (!geo || geo.status !== 'complete') return null;
  const place = [geo.city, geo.region].filter(Boolean).join(', ');
  return [geo.country, place].filter(Boolean).join(' · ');
}

function buildLocationContent(geo) {
  const location = document.createElement('span');
  location.className = 'location-value';
  const flagUrl = countryCodeToFlagUrl(geo?.countryCode);
  if (flagUrl) {
    const flag = document.createElement('img');
    flag.className = 'country-flag';
    flag.src = flagUrl;
    flag.alt = '';
    flag.setAttribute('aria-hidden', 'true');
    flag.addEventListener('error', () => flag.remove(), { once: true });
    location.append(flag);
  }
  const text = document.createElement('span');
  text.textContent = formatGeoLocation(geo) || 'Unknown';
  location.append(text);
  return location;
}

function renderIp(name, result) {
  const body = setCardState(name, result.status);
  if (!body) return;
  clearBody(body);

  if (result.status !== 'complete' || !result.address) {
    addText(body, result.error ?? `IPv${result.family} connectivity was not detected.`);
    return;
  }

  addText(body, result.address, 'card-value');
  const geo = result.geo;
  const rows = [];
  if (geo?.status === 'complete') {
    rows.push(['Location', buildLocationContent(geo)]);
    rows.push(['Network', [geo.asn, geo.org].filter(Boolean).join(' · ') || 'Unknown']);
    if (geo.timezone) rows.push(['Timezone', geo.timezone]);
  } else {
    rows.push(['Location', 'Location unavailable']);
  }
  addDetailList(body, rows);
}

function renderCandidate(body, candidate) {
  const description = describeCandidate(candidate);
  const item = document.createElement('div');
  item.className = `candidate-item candidate-${description.group}`;

  const heading = document.createElement('p');
  heading.className = 'candidate-heading';
  heading.textContent = description.heading;

  const address = document.createElement('p');
  address.className = 'candidate-address';
  address.textContent = candidate.classification === 'mdns' ? 'Hidden by browser' : candidate.address;

  item.append(heading, address);

  if (candidate.classification === 'mdns') {
    const technicalAddress = document.createElement('p');
    technicalAddress.className = 'candidate-technical-address';
    technicalAddress.textContent = candidate.address;
    item.append(technicalAddress);
  }

  const meta = document.createElement('p');
  meta.className = 'candidate-meta';
  meta.textContent = description.meta;
  item.append(meta);

  if (description.note) {
    const note = document.createElement('p');
    note.className = 'candidate-note';
    note.textContent = description.note;
    item.append(note);
  }
  body.append(item);
}

function renderWebRtc(result, ipv4, ipv6, assessment) {
  const body = setCardState('webrtc', result.status);
  if (!body) return;
  clearBody(body);

  if (result.error) addText(body, result.error);

  const layout = document.createElement('div');
  layout.className = 'webrtc-layout';

  const candidatesColumn = document.createElement('div');
  candidatesColumn.className = 'webrtc-candidates';
  const list = document.createElement('div');
  list.className = 'candidate-list';
  if (result.candidates.length) {
    for (const candidate of result.candidates) renderCandidate(list, candidate);
  } else {
    addText(list, 'No ICE candidates were exposed by this browser.');
  }
  candidatesColumn.append(list);

  const publicValue = result.publicAddresses.length ? result.publicAddresses.join(', ') : 'Not detected';
  const comparisonColumn = document.createElement('div');
  comparisonColumn.className = 'webrtc-comparison';
  const comparison = document.createElement('div');
  comparison.className = 'comparison-block';
  const comparisonTitle = document.createElement('p');
  comparisonTitle.className = 'section-label';
  comparisonTitle.textContent = 'HTTP vs WebRTC';
  comparison.append(comparisonTitle);
  addDetailList(comparison, [
    ['HTTP IPv4', ipv4?.address ?? 'Not detected'],
    ['HTTP IPv6', ipv6?.address ?? 'Not detected'],
    ['WebRTC public', publicValue]
  ]);
  addText(comparison, assessment.message, 'comparison-result');
  comparisonColumn.append(comparison);

  layout.append(candidatesColumn, comparisonColumn);
  body.append(layout);
}

function renderBrowser(info) {
  const body = setCardState('browser', 'complete');
  clearBody(body);
  addText(body, info.platform || 'Unknown platform', 'card-value');
  const rows = [
    ['Language', info.language || 'Unknown'],
    ['Status', info.online ? 'Online' : 'Offline'],
    ['User agent', info.userAgent || 'Unavailable']
  ];
  if (info.connection) {
    rows.push(['Connection', info.connection.effectiveType || 'Unknown']);
    if (info.connection.downlinkMbps != null) rows.push(['Downlink', `${info.connection.downlinkMbps} Mbps`]);
    if (info.connection.rttMs != null) rows.push(['RTT', `${info.connection.rttMs} ms`]);
    if (info.connection.saveData != null) rows.push(['Save data', info.connection.saveData ? 'Enabled' : 'Disabled']);
  }
  addDetailList(body, rows);
}

function fallbackResult(name, reason) {
  if (name === 'webrtc') return { status: 'error', candidates: [], publicAddresses: [], error: reason };
  return { status: 'error', address: null, family: name === 'ipv4' ? 4 : 6, error: reason };
}

async function enrichIp(result) {
  if (result?.status !== 'complete' || !result.address || !features.geoip) {
    return { ...result, geo: null };
  }
  const geo = await runGeoIpLookup({
    ip: result.address,
    urlTemplate: networkConfig.geoIpUrlTemplate,
    timeoutMs: networkConfig.geoIpTimeoutMs
  });
  return { ...result, geo };
}

async function runAllTests() {
  if (running) return;
  running = true;
  runButton.disabled = true;
  copyButton.disabled = true;
  overallStatus.textContent = 'Running';
  overallStatus.dataset.status = 'running';
  overallMessage.textContent = 'Running available checks.';

  for (const name of getEnabledChecks(features)) renderRunning(name);
  const browserBody = setCardState('browser', 'running');
  clearBody(browserBody);
  addText(browserBody, 'Collecting browser information.');

  const startedAt = new Date().toISOString();
  const names = getEnabledChecks(features);
  const promises = {
    ipv4: runIpTest({ family: 4, endpoint: networkConfig.ipv4Endpoint, timeoutMs: networkConfig.requestTimeoutMs }),
    ipv6: runIpTest({ family: 6, endpoint: networkConfig.ipv6Endpoint, timeoutMs: networkConfig.requestTimeoutMs }),
    webrtc: runWebRtcTest({ stunUrls: networkConfig.stunUrls, timeoutMs: networkConfig.webrtcTimeoutMs })
  };

  const settled = await Promise.allSettled(names.map((name) => promises[name]));
  const baseResults = Object.fromEntries(settled.map((item, index) => [
    names[index],
    item.status === 'fulfilled' ? item.value : fallbackResult(names[index], 'Unexpected test failure.')
  ]));

  const [ipv4, ipv6] = await Promise.all([
    enrichIp(baseResults.ipv4),
    enrichIp(baseResults.ipv6)
  ]);
  const webrtc = baseResults.webrtc;
  const browser = collectBrowserInfo(window);
  const assessment = assessResults({ ipv4, ipv6, webrtc });

  currentReport = {
    startedAt,
    completedAt: new Date().toISOString(),
    ipv4,
    ipv6,
    webrtc,
    browser,
    assessment
  };

  renderIp('ipv4', ipv4);
  renderIp('ipv6', ipv6);
  renderWebRtc(webrtc, ipv4, ipv6, assessment);
  renderBrowser(browser);

  overallStatus.textContent = assessment.status === 'ok'
    ? 'No mismatch'
    : assessment.status === 'warning'
      ? 'Review'
      : 'Incomplete';
  overallStatus.dataset.status = assessment.status;
  overallMessage.textContent = assessment.message;

  running = false;
  runButton.disabled = false;
  copyButton.disabled = false;
}

async function copyReport() {
  if (!currentReport) return;
  const text = JSON.stringify(currentReport, null, 2);
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.append(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
  copyButton.textContent = 'Copied';
  setTimeout(() => { copyButton.textContent = 'Copy JSON'; }, 1200);
}

runButton.addEventListener('click', runAllTests);
copyButton.addEventListener('click', copyReport);

if (appConfig.autoRun) {
  queueMicrotask(runAllTests);
}
