const originArg = process.argv.find((arg) => arg.startsWith('--origin='));
const origin = originArg?.slice('--origin='.length) || 'https://pigalev.github.io';

const candidates = [
  {
    id: 'ip-api-ru-self',
    purpose: 'ip+geo',
    url: 'https://prod.ip-api.ru/checkIP/',
    parser: 'ip-api-ru',
    rateNote: 'demo 1 request / 10 seconds'
  },
  {
    id: 'sypex-ru-geo',
    purpose: 'geo',
    url: 'https://ru.sxgeo.city/json/1.1.1.1',
    parser: 'sypex',
    rateNote: 'free quota documented by provider'
  }
];

function parseIpApiRu(payload) {
  if (!payload || typeof payload !== 'object' || payload.status !== 'ok') throw new Error('Unexpected IP-API.RU payload');
  const key = Object.keys(payload).find((name) => !['status', 'imprint'].includes(name) && name.includes('.'));
  if (!key) throw new Error('No caller IP field');
  const record = payload[key] ?? {};
  return { ip:key, countryCode:record.location?.isoCode ?? null };
}

function parseSypex(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Unexpected Sypex payload');
  return { ip:payload.ip ?? null, countryCode:payload.country?.iso ?? null };
}

function activationFor(candidate, { httpStatus, acao, parseOk }) {
  if (!(httpStatus >= 200 && httpStatus < 300)) return 'reject-http';
  if (!(acao === '*' || acao === origin)) return 'reject-cors';
  if (!parseOk) return 'reject-payload';
  if (candidate.id === 'ip-api-ru-self') return 'reject-rate-limit';
  return candidate.purpose === 'geo' ? 'accept-geo' : 'accept-core';
}

for (const candidate of candidates) {
  const started = performance.now();
  let httpStatus = null;
  let acao = null;
  let contentType = null;
  let parseOk = false;
  let ip = null;
  let countryCode = null;
  let error = null;
  try {
    const response = await fetch(candidate.url, {
      headers: { Origin: origin, Accept: 'application/json' },
      redirect: 'follow'
    });
    httpStatus = response.status;
    acao = response.headers.get('access-control-allow-origin');
    contentType = response.headers.get('content-type');
    const payload = await response.json();
    const parsed = candidate.parser === 'ip-api-ru' ? parseIpApiRu(payload) : parseSypex(payload);
    ip = parsed.ip;
    countryCode = parsed.countryCode;
    parseOk = true;
  } catch (caught) {
    error = caught?.message ?? String(caught);
  }
  const result = {
    id: candidate.id,
    purpose: candidate.purpose,
    httpStatus,
    acao,
    contentType,
    parseOk,
    ip,
    countryCode,
    latencyMs: Math.round(performance.now() - started),
    rateNote: candidate.rateNote,
    activation: activationFor(candidate, { httpStatus, acao, parseOk }),
    error
  };
  console.log(JSON.stringify(result));
}
