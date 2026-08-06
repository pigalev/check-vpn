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
    const publicAddresses = [...new Set(candidates.filter((item) => item.classification === 'public').map((item) => item.address))];
    return { status: 'complete', candidates, publicAddresses, error: null };
  } catch {
    return { status: 'error', candidates: [], publicAddresses: [], error: 'WebRTC check failed.' };
  } finally {
    peer?.close?.();
  }
}
