import { fetchJsonWithTimeout } from './network.js';

function cleanString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function observedIp(value) {
  const text = cleanString(value);
  if (!text) return null;
  if (text.startsWith('[')) return text.slice(1, text.indexOf(']')) || null;
  const lastColon = text.lastIndexOf(':');
  if (lastColon > 0 && text.indexOf(':') === lastColon) return text.slice(0, lastColon);
  return text;
}

export function normalizeTlsFingerprint(payload) {
  if (!payload || typeof payload !== 'object') {
    return { status: 'error', observedIp: null, httpVersion: null, tlsVersion: null, alpn: [], ja3: null, ja3Hash: null, ja4: null, cipherSummary: null, extensionSummary: null, http2Fingerprint: null, error: 'TLS reflector returned an invalid payload.' };
  }

  const tls = payload.tls && typeof payload.tls === 'object' ? payload.tls : {};
  const http2 = payload.http2 && typeof payload.http2 === 'object' ? payload.http2 : {};
  const ja3 = cleanString(tls.ja3 ?? payload.ja3);
  const ja3Hash = cleanString(tls.ja3_hash ?? tls.ja3Hash ?? payload.ja3_hash);
  const ja4 = cleanString(tls.ja4 ?? payload.ja4);
  const tlsVersion = cleanString(tls.tls_version_negotiated ?? tls.version ?? payload.tls_version);
  const httpVersion = cleanString(payload.http_version ?? payload.httpVersion ?? payload.protocol);
  const alpn = Array.isArray(tls.alpn) ? tls.alpn.map(cleanString).filter(Boolean) : cleanString(tls.alpn) ? [cleanString(tls.alpn)] : [];
  const ciphers = Array.isArray(tls.ciphers) ? tls.ciphers.map((item) => typeof item === 'string' ? item : item?.name).filter(Boolean) : [];
  const extensions = Array.isArray(tls.extensions) ? tls.extensions.map((item) => typeof item === 'string' ? item : item?.name).filter(Boolean) : [];
  const http2Fingerprint = cleanString(http2.akamai_fingerprint ?? http2.fingerprint ?? payload.http2_fingerprint);
  const hasUseful = Boolean(ja3 || ja3Hash || ja4 || tlsVersion || httpVersion || alpn.length || ciphers.length || extensions.length || http2Fingerprint);
  const complete = Boolean(ja3Hash && ja4 && (tlsVersion || httpVersion));

  return {
    status: hasUseful ? (complete ? 'complete' : 'partial') : 'error',
    observedIp: observedIp(payload.ip ?? payload.client_ip ?? payload.remote_addr),
    httpVersion,
    tlsVersion,
    alpn,
    ja3,
    ja3Hash,
    ja4,
    cipherSummary: ciphers.length ? `${ciphers.length} offered · ${ciphers.slice(0, 4).join(', ')}` : null,
    extensionSummary: extensions.length ? `${extensions.length} extensions · ${extensions.slice(0, 5).join(', ')}` : null,
    http2Fingerprint,
    error: hasUseful ? null : 'TLS fingerprint data unavailable.'
  };
}

export async function runTlsFingerprint({ endpoint, timeoutMs, fetchImpl = fetch }) {
  try {
    const payload = await fetchJsonWithTimeout(endpoint, { timeoutMs, fetchImpl });
    return normalizeTlsFingerprint(payload);
  } catch (error) {
    const unavailable = error?.name === 'AbortError' || error instanceof TypeError;
    return {
      status: unavailable ? 'unavailable' : 'error',
      observedIp: null,
      httpVersion: null,
      tlsVersion: null,
      alpn: [],
      ja3: null,
      ja3Hash: null,
      ja4: null,
      cipherSummary: null,
      extensionSummary: null,
      http2Fingerprint: null,
      error: unavailable ? 'TLS reflector unavailable.' : 'TLS fingerprint check failed.'
    };
  }
}
