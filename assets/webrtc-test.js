import { classifyAddress, getIpFamily } from './network.js';

export function parseIceCandidate(candidateLine) {
  if (typeof candidateLine !== 'string' || !candidateLine.startsWith('candidate:')) return null;
  const parts = candidateLine.trim().split(/\s+/);
  const typeIndex = parts.indexOf('typ');
  if (parts.length < 8 || typeIndex < 0 || !parts[typeIndex + 1]) return null;
  const address = parts[4];
  return {
    address,
    family: getIpFamily(address),
    protocol: parts[2].toLowerCase(),
    type: parts[typeIndex + 1].toLowerCase(),
    classification: classifyAddress(address)
  };
}

export function getCandidateGroup(candidate) {
  if (candidate?.type === 'relay') return 'relay';
  if (candidate?.classification === 'public') return 'public';
  if (['private', 'link-local', 'loopback', 'mdns'].includes(candidate?.classification)) return 'local';
  return 'other';
}

export function getCandidateLabel(candidate) {
  const labels = {
    public: 'Public',
    private: 'Private',
    'link-local': 'Link-local',
    loopback: 'Loopback',
    mdns: 'mDNS protected',
    invalid: 'Unknown'
  };
  return labels[candidate?.classification] ?? 'Unknown';
}

export function describeCandidate(candidate) {
  const group = getCandidateGroup(candidate);
  const family = candidate?.family ? `IPv${candidate.family}` : 'Address hidden';
  const heading = group === 'public'
    ? 'Public address'
    : group === 'local'
      ? 'Local interface'
      : group === 'relay'
        ? 'Relay'
        : 'ICE candidate';

  let note = '';
  if (candidate?.classification === 'mdns') note = 'Local address hidden by browser (mDNS).';
  else if (candidate?.type === 'srflx') note = 'Address discovered through STUN.';
  else if (candidate?.type === 'relay') note = 'Address provided by a TURN relay.';
  else if (candidate?.type === 'host') note = 'Address exposed by a local browser interface.';

  return {
    group,
    heading,
    meta: `${candidate?.type ?? 'unknown'} · ${family} · ${(candidate?.protocol ?? 'unknown').toUpperCase()} · ${getCandidateLabel(candidate)}`,
    note
  };
}

export async function runWebRtcTest({ stunUrls, timeoutMs, RTCPeerConnectionImpl = globalThis.RTCPeerConnection } = {}) {
  if (typeof RTCPeerConnectionImpl !== 'function') {
    return { status: 'unavailable', candidates: [], publicAddresses: [], error: 'WebRTC is not available in this browser.' };
  }

  let peer;
  try {
    peer = new RTCPeerConnectionImpl({ iceServers: [{ urls: stunUrls }] });
    const records = new Map();
    const finished = new Promise((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      peer.onicecandidate = (event) => {
        if (!event.candidate) {
          clearTimeout(timer);
          resolve();
          return;
        }
        const parsed = parseIceCandidate(event.candidate.candidate);
        if (!parsed) return;
        records.set(`${parsed.address}|${parsed.protocol}|${parsed.type}`, parsed);
      };
    });

    peer.createDataChannel('check');
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await finished;

    const candidates = [...records.values()];
    const publicAddresses = [...new Set(
      candidates
        .filter((item) => item.classification === 'public')
        .map((item) => item.address)
    )];

    return { status: 'complete', candidates, publicAddresses, error: null };
  } catch {
    return { status: 'error', candidates: [], publicAddresses: [], error: 'WebRTC check failed.' };
  } finally {
    peer?.close?.();
  }
}
