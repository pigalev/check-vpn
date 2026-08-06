import { features, getEnabledChecks, networkConfig } from './config.js';
import { runIpTest } from './ip-tests.js';
import { runWebRtcTest } from './webrtc-test.js';
import { collectBrowserInfo } from './browser-info.js';
import { assessResults } from './assessment.js';

const labels = { idle: 'Not run', running: 'Running', complete: 'Complete', unavailable: 'Unavailable', error: 'Error' };
const cardDefinitions = {
  ipv4: { title: 'IPv4', description: 'Public IPv4 address reported over HTTP.' },
  ipv6: { title: 'IPv6', description: 'Public IPv6 address reported over an IPv6 connection.' },
  webrtc: { title: 'WebRTC', description: 'Public addresses found in browser ICE candidates.' }
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
  article.innerHTML = `<div class="card-header"><h2>${title}</h2><span class="card-status" data-field="status">Not run</span></div><p class="card-value" data-field="value">—</p><p class="card-detail" data-field="detail">${description}</p>`;
  grid.append(article);
  return article;
}
const cards = new Map();
for (const check of getEnabledChecks(features)) {
  const definition = cardDefinitions[check];
  cards.set(check, createCard(check, definition.title, definition.description));
}
cards.set('browser', createCard('browser', 'Browser and network', 'Information exposed by this browser.'));

function updateCard(name, status, value, detail) {
  const card = cards.get(name);
  if (!card) return;
  card.classList.toggle('is-running', status === 'running');
  card.querySelector('[data-field="status"]').textContent = labels[status] ?? status;
  card.querySelector('[data-field="value"]').textContent = value || '—';
  card.querySelector('[data-field="detail"]').textContent = detail || '';
}
function renderIp(name, result) {
  updateCard(name, result.status, result.address, result.error ?? `IPv${result.family} connectivity detected.`);
}
function renderWebRtc(result) {
  const value = result.publicAddresses.length ? result.publicAddresses.join('\n') : 'No public ICE address found';
  const hiddenCount = result.candidates.filter((candidate) => candidate.classification !== 'public').length;
  const detail = result.error ?? `${result.candidates.length} candidate(s) collected${hiddenCount ? `; ${hiddenCount} non-public candidate(s) excluded from assessment.` : '.'}`;
  updateCard('webrtc', result.status, value, detail);
}
function renderBrowser(info) {
  const connection = info.connection ? [info.connection.effectiveType, info.connection.downlinkMbps != null ? `${info.connection.downlinkMbps} Mbps` : null, info.connection.rttMs != null ? `${info.connection.rttMs} ms RTT` : null].filter(Boolean).join(' · ') : 'Connection metrics are not exposed by this browser.';
  updateCard('browser', 'complete', info.platform || 'Unknown platform', `${info.language || 'Unknown language'} · ${info.online ? 'Online' : 'Offline'}\n${connection}`);
}
function fallbackResult(name, reason) {
  if (name === 'webrtc') return { status: 'error', candidates: [], publicAddresses: [], error: reason };
  return { status: 'error', address: null, family: name === 'ipv4' ? 4 : 6, error: reason };
}
async function runAllTests() {
  if (running) return;
  running = true;
  runButton.disabled = true;
  copyButton.disabled = true;
  overallStatus.textContent = 'Running';
  overallStatus.dataset.status = 'running';
  overallMessage.textContent = 'Running available checks.';
  for (const name of getEnabledChecks(features)) updateCard(name, 'running', '', cardDefinitions[name].description);
  const startedAt = new Date().toISOString();
  const promises = {
    ipv4: runIpTest({ family: 4, endpoint: networkConfig.ipv4Endpoint, timeoutMs: networkConfig.requestTimeoutMs }),
    ipv6: runIpTest({ family: 6, endpoint: networkConfig.ipv6Endpoint, timeoutMs: networkConfig.requestTimeoutMs }),
    webrtc: runWebRtcTest({ stunUrls: networkConfig.stunUrls, timeoutMs: networkConfig.webrtcTimeoutMs })
  };
  const names = getEnabledChecks(features);
  const settled = await Promise.allSettled(names.map((name) => promises[name]));
  const results = Object.fromEntries(settled.map((item, index) => [names[index], item.status === 'fulfilled' ? item.value : fallbackResult(names[index], 'Unexpected test failure.')]));
  const browser = collectBrowserInfo(window);
  const assessment = assessResults(results);
  currentReport = { startedAt, completedAt: new Date().toISOString(), ...results, browser, assessment };
  renderIp('ipv4', results.ipv4);
  renderIp('ipv6', results.ipv6);
  renderWebRtc(results.webrtc);
  renderBrowser(browser);
  overallStatus.textContent = assessment.status === 'ok' ? 'No mismatch' : assessment.status === 'warning' ? 'Review' : 'Incomplete';
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
