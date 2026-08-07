import { isPublicInternetAddress } from './ip-classification.js';

function summarizeFamily(observations = []) {
  const successful = observations.filter((item) => item?.status === 'complete' && item.address && isPublicInternetAddress(item.address));
  const counts = {};
  for (const item of successful) counts[item.address] = (counts[item.address] ?? 0) + 1;
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const topCount = ranked[0]?.[1] ?? 0;
  const tied = ranked.length > 1 && ranked[1][1] === topCount;
  const trusted = tied ? null : ranked[0]?.[0] ?? null;
  return {
    available: successful.length,
    total: observations.length,
    agree: ranked.length <= 1,
    counts,
    trusted,
    observations
  };
}

export async function captureGuidedConnection({ collectFamily, sampleStun, sampleEcho, sampleTls, now = () => Date.now() }) {
  const [ipv4, ipv6, stun, echo, tls] = await Promise.all([
    collectFamily(4),
    collectFamily(6),
    Promise.resolve().then(() => sampleStun?.()).catch(() => []),
    Promise.resolve().then(() => sampleEcho?.()).catch(() => null),
    Promise.resolve().then(() => sampleTls?.()).catch(() => null)
  ]);

  const families = {
    4: summarizeFamily(ipv4 ?? []),
    6: summarizeFamily(ipv6 ?? [])
  };
  const trusted = {
    4: families[4].trusted ? [families[4].trusted] : [],
    6: families[6].trusted ? [families[6].trusted] : []
  };
  const hasTrusted = trusted[4].length > 0 || trusted[6].length > 0;
  const unreliable = [4, 6].some((family) => families[family].available > 1 && !families[family].trusted);

  return {
    status: hasTrusted && !unreliable ? 'complete' : hasTrusted ? 'partial' : 'unreliable',
    trusted,
    families,
    diagnostics: { stun: stun ?? [], echo: echo ?? null, tls: tls ?? null },
    capturedAt: now()
  };
}
