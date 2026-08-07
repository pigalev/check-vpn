import { classifyAddress, getIpFamily } from './network.js';
import { classifyIpAddress } from './ip-classification.js';

export function parseIceCandidate(candidateLine) {
  if (typeof candidateLine !== 'string' || !candidateLine.startsWith('candidate:')) return null;
  const parts = candidateLine.trim().split(/\s+/);
  const typeIndex = parts.indexOf('typ');
  if (parts.length < 8 || typeIndex < 0 || !parts[typeIndex + 1]) return null;
  const address = parts[4];
  const port = Number(parts[5]);
  const classification = classifyAddress(address);
  const ipDetails = classification === 'mdns' ? { family: null, scope: 'mdns', public: false, transition: null, label: 'mDNS protected' } : classifyIpAddress(address);
  return {
    address,
    port: Number.isInteger(port) && port >= 0 && port <= 65535 ? port : null,
    family: getIpFamily(address),
    protocol: parts[2].toLowerCase(),
    type: parts[typeIndex + 1].toLowerCase(),
    classification,
    ipDetails
  };
}

export function getCandidateGroup(candidate) {
  if (candidate?.type === 'relay') return 'relay';
  if (candidate?.classification === 'public') return 'public';
  if (['private', 'cgnat', 'ula', 'link-local', 'loopback', 'mdns', 'mapped', 'documentation', 'multicast', 'unspecified'].includes(candidate?.classification)) return 'local';
  return 'other';
}

export function getCandidateLabel(candidate) {
  const labels = {
    public: 'Public', private: 'Private', cgnat: 'CGNAT/shared', ula: 'ULA',
    'link-local': 'Link-local', loopback: 'Loopback', mdns: 'mDNS protected',
    mapped: 'IPv4-mapped', documentation: 'Documentation', multicast: 'Multicast',
    unspecified: 'Unspecified', invalid: 'Unknown'
  };
  return labels[candidate?.classification] ?? 'Unknown';
}

export function describeCandidate(candidate) {
  const group = getCandidateGroup(candidate);
  const family = candidate?.family ? `IPv${candidate.family}` : 'Address hidden';
  const heading = group === 'public' ? 'Public address' : group === 'local' ? 'Local interface' : group === 'relay' ? 'Relay' : 'ICE candidate';
  let note = '';
  if (candidate?.classification === 'mdns') note = 'Local address hidden by browser (mDNS).';
  else if (candidate?.classification === 'cgnat') note = 'Carrier-grade NAT/shared address space exposed by the browser.';
  else if (candidate?.classification === 'ula') note = 'Unique-local IPv6 address exposed by the browser.';
  else if (candidate?.type === 'srflx') note = 'Address discovered through STUN.';
  else if (candidate?.type === 'relay') note = 'Address provided by a TURN relay.';
  else if (candidate?.type === 'host') note = 'Address exposed by a local browser interface.';
  return { group, heading, meta: `${candidate?.type ?? 'unknown'} · ${family} · ${(candidate?.protocol ?? 'unknown').toUpperCase()} · ${getCandidateLabel(candidate)}`, note };
}

export function summarizeCandidates(candidates = []) {
  const summary = { host: 0, srflx: 0, relay: 0, ipv4: 0, ipv6: 0, udp: 0, tcp: 0, publicAddresses: [] };
  const publicSet = new Set();
  for (const candidate of candidates) {
    if (candidate.type in summary && typeof summary[candidate.type] === 'number') summary[candidate.type] += 1;
    if (candidate.family === 4) summary.ipv4 += 1;
    if (candidate.family === 6) summary.ipv6 += 1;
    if (candidate.protocol === 'udp') summary.udp += 1;
    if (candidate.protocol === 'tcp') summary.tcp += 1;
    if (candidate.classification === 'public') publicSet.add(candidate.address);
  }
  summary.publicAddresses = [...publicSet];
  return summary;
}

export async function runWebRtcTest({ stunUrls, timeoutMs, RTCPeerConnectionImpl = globalThis.RTCPeerConnection } = {}) {
  if (typeof RTCPeerConnectionImpl !== 'function') return { status: 'unavailable', candidates: [], publicAddresses: [], summary: summarizeCandidates([]), error: 'WebRTC is not available in this browser.' };
  let peer;
  try {
    peer = new RTCPeerConnectionImpl({ iceServers: [{ urls: stunUrls }] });
    const records = new Map();
    const finished = new Promise((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      peer.onicecandidate = (event) => {
        if (!event.candidate) { clearTimeout(timer); resolve(); return; }
        const parsed = parseIceCandidate(event.candidate.candidate);
        if (parsed) records.set(`${parsed.address}|${parsed.port ?? ''}|${parsed.protocol}|${parsed.type}`, parsed);
      };
    });
    peer.createDataChannel('check');
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await finished;
    const candidates = [...records.values()];
    const summary = summarizeCandidates(candidates);
    return { status: 'complete', candidates, publicAddresses: summary.publicAddresses, summary, error: null };
  } catch {
    return { status: 'error', candidates: [], publicAddresses: [], summary: summarizeCandidates([]), error: 'WebRTC check failed.' };
  } finally { peer?.close?.(); }
}
