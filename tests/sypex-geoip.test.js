import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGeoIp, runGeoIpConsensus } from '../assets/geoip.js';

test('normalizes Sypex RU GeoIP payload', () => {
  const result = normalizeGeoIp({
    ip:'94.25.174.96',
    country:{ iso:'RU', name_en:'Russia', name_ru:'Россия' },
    region:{ name_en:'Moscow', name_ru:'Москва', timezone:'Europe/Moscow' },
    city:{ name_en:'Moscow', name_ru:'Москва', timezone:'Europe/Moscow' },
    asn:12389,
    org:'Rostelecom'
  }, '94.25.174.96', 'sypex', { id:'sypex-ru', label:'Sypex Geo RU' });
  assert.equal(result.status, 'complete');
  assert.equal(result.countryCode, 'RU');
  assert.equal(result.country, 'Russia');
  assert.equal(result.city, 'Moscow');
  assert.equal(result.timezone, 'Europe/Moscow');
  assert.equal(result.asn, 'AS12389');
});

test('IPv6 GeoIP skips IPv4-only Sypex provider instead of waiting for it', async () => {
  const calls = [];
  const providers = [
    { id:'sypex-ru', label:'Sypex Geo RU', kind:'sypex', families:[4], urlTemplate:'https://ru.sxgeo.city/json/{ip}' },
    { id:'ipwhois', label:'ipwho.is', kind:'ipwhois', urlTemplate:'https://ipwho.example/{ip}' }
  ];
  const result = await runGeoIpConsensus({
    ip:'2001:db8::10', providers, timeoutMs:100,
    fetchImpl:async (url) => {
      calls.push(url);
      return { ok:true, json:async()=>({ success:true, country_code:'DE', country:'Germany', city:'Frankfurt', timezone:{id:'Europe/Berlin'} }) };
    }
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /ipwho\.example/);
  assert.equal(result.agreement.total, 1);
  assert.equal(result.countryCode, 'DE');
  assert.equal(result.agreement.countryState, 'single-source');
});
