export function assessResults({ ipv4, ipv6, webrtc }) {
  const observed = new Set([ipv4?.address, ipv6?.address].filter(Boolean));
  const webRtcPublic = Array.isArray(webrtc?.publicAddresses) ? webrtc.publicAddresses : [];
  const mismatchedAddresses = webRtcPublic.filter((address) => !observed.has(address));
  if (mismatchedAddresses.length > 0) {
    return { status: 'warning', message: 'WebRTC exposed a public address that differs from the HTTP results.', mismatchedAddresses };
  }
  const httpComplete = ipv4?.status === 'complete' || ipv6?.status === 'complete';
  const webRtcComplete = webrtc?.status === 'complete';
  if (!httpComplete || !webRtcComplete) {
    return { status: 'incomplete', message: 'No confirmed mismatch was found, but one or more checks were incomplete.', mismatchedAddresses: [] };
  }
  return { status: 'ok', message: 'No public address mismatch detected.', mismatchedAddresses: [] };
}
