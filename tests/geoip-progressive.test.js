import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeGeoIp,
  runGeoIpConsensusProgressive
} from '../assets/geoip.js';

function responseJson(payload) {
  return { ok: true, status: 200, json: async () => payload };
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

test('normalizes ipapi.is location and network metadata', () => {
  const result = normalizeGeoIp({
    ip: '128.71.33.91',
    location: {
      country_code: 'RU',
      country: 'Russia',
      state: 'Krasnodar Krai',
      city: 'Krasnodar',
      timezone: 'Europe/Moscow'
    },
    asn: { asn: 3216, org: 'PJSC VimpelCom' }
  }, '128.71.33.91', 'ipapiis', { id: 'ipapiis', label: 'ipapi.is' });

  assert.equal(result.countryCode, 'RU');
  assert.equal(result.city, 'Krasnodar');
  assert.equal(result.region, 'Krasnodar Krai');
  assert.equal(result.timezone, 'Europe/Moscow');
  assert.equal(result.asn, 'AS3216');
  assert.equal(result.org, 'PJSC VimpelCom');
});

test('normalizes Sypex Geo payload', () => {
  const result = normalizeGeoIp({
    country: { iso: 'RU', name_en: 'Russia' },
    region: { name_en: 'Moscow' },
    city: { name_en: 'Moscow', timezone: 'Europe/Moscow' }
  }, '128.71.33.91', 'sypex', { id: 'sypex-ru', label: 'Sypex Geo RU' });

  assert.equal(result.countryCode, 'RU');
  assert.equal(result.country, 'Russia');
  assert.equal(result.region, 'Moscow');
  assert.equal(result.city, 'Moscow');
  assert.equal(result.timezone, 'Europe/Moscow');
});

test('progressive GeoIP emits first usable location before slower provider finishes', async () => {
  const slow = deferred();
  const providers = [
    { id: 'fast', label: 'Fast', kind: 'ipwhois', urlTemplate: 'https://fast.test/{ip}' },
    { id: 'slow', label: 'Slow', kind: 'ipwhois', urlTemplate: 'https://slow.test/{ip}' }
  ];
  const seen = [];
  const promise = runGeoIpConsensusProgressive({
    ip: '128.71.33.91',
    providers,
    timeoutMs: 1000,
    fetchImpl: async (url) => url.includes('fast.test')
      ? responseJson({ success: true, country_code: 'RU', country: 'Russia', region: 'Krasnodar Krai', city: 'Krasnodar' })
      : slow.promise,
    onFirstUsable: (geo) => seen.push(geo.city)
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(seen, ['Krasnodar']);

  slow.resolve(responseJson({ success: true, country_code: 'RU', country: 'Russia', region: 'Krasnodar Krai', city: 'Krasnodar' }));
  const final = await promise;
  assert.equal(final.agreement.available, 2);
});

test('ASN-only result does not satisfy first usable location', async () => {
  const seen = [];
  await runGeoIpConsensusProgressive({
    ip: '128.71.33.91',
    providers: [
      { id: 'asn', label: 'ASN only', kind: 'ipapiis', urlTemplate: 'https://asn.test/{ip}' },
      { id: 'geo', label: 'Geo', kind: 'ipwhois', urlTemplate: 'https://geo.test/{ip}' }
    ],
    timeoutMs: 100,
    fetchImpl: async (url) => url.includes('asn.test')
      ? responseJson({ asn: { asn: 3216, org: 'VimpelCom' } })
      : responseJson({ success: true, country_code: 'RU', country: 'Russia', city: 'Krasnodar' }),
    onFirstUsable: (geo) => seen.push(geo.source.id)
  });

  assert.deepEqual(seen, ['geo']);
});
