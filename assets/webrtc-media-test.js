function candidateKey(candidate) {
  return [candidate?.address ?? '', candidate?.family ?? '', candidate?.classification ?? '', candidate?.type ?? '', candidate?.protocol ?? ''].join('|');
}

function emptyResult(status, before = null, error = null) {
  return { status, before, after: null, newlyVisible: [], error };
}

export async function runWebRtcMediaPermissionTest({ getUserMedia, runBefore, runAfter } = {}) {
  let before = null;
  let stream = null;
  try {
    before = await runBefore?.();
  } catch (error) {
    return emptyResult('error', null, error?.message ?? 'WebRTC baseline failed.');
  }

  if (typeof getUserMedia !== 'function') return emptyResult('unavailable', before, 'Media devices are not available in this browser.');

  try {
    stream = await getUserMedia({ audio: true, video: true });
    const after = await runAfter?.(stream);
    const beforeKeys = new Set((before?.candidates ?? []).map(candidateKey));
    const newlyVisible = (after?.candidates ?? []).filter((candidate) => !beforeKeys.has(candidateKey(candidate)));
    return { status: 'complete', before, after, newlyVisible, error: null };
  } catch (error) {
    if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
      return emptyResult('denied', before, 'Media permission was denied.');
    }
    return emptyResult('error', before, error?.message ?? 'Media-permission WebRTC test failed.');
  } finally {
    for (const track of stream?.getTracks?.() ?? []) {
      try { track.stop?.(); } catch {}
    }
  }
}
