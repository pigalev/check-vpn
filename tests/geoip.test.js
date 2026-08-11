import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGeoIpUrl,
  normalizeGeoIp,
  runGeoIpConsensus,
  runGeoIpProviderLookup
} from '../assets/geoip.js';

const providers = [
  { id: 'ipapi', label: 'ipapi.co', kind: 'ipapi', urlTemplate: 'https://ipapi.example/{ip}/json/' },
  { id: 'ipwhois', label: 'ipwho.is', kind: 'ipwhois', urlTemplate: 'https://ipwho.example/{ip}' },
  { id: 'freeipapi', label: 'FreeIPAPI', kind: 'freeipapi', urlTemplate: 'https://free.example/api/json/{ip}' }
];

test('builds lookup URL from the already detected address', () => {
  assert.equal(
    buildGeoIpUrl('https://geo.example/{ip}/json/', '2001:db8::10'),
    'https://geo.example/2001%3Adb8%3A%3A10/json/'
  );
});

test('normalizes ipapi metadata', () => {
  const result = normalizeGeoIp({
    ip: '203.0.113.10', country_code: 'DE', country_name: 'Germany', region: 'Hesse', city: 'Frankfurt am Main',
    asn: 'AS64500', org: 'Example Network', timezone: 'Europe/Berlin'
  }, '203.0.113.10', 'ipapi', { id: 'ipapi', label: 'ipapi.co' });
  assert.equal(result.status, 'complete');
  assert.equal(result.source.id, 'ipapi');
  assert.equal(result.countryCode, 'DE');
  assert.equal(result.city, 'Frankfurt am Main');
  assert.equal(result.asn, 'AS64500');
});

test('normalizes ipwho.is metadata', () => {
  const result = normalizeGeoIp({
    success: true, ip: '203.0.113.10', country_code: 'DE', country: 'Germany', region: 'Hesse', city: 'Frankfurt am Main',
    connection: { asn: 64500, org: 'Example Network' }, timezone: { id: 'Europe/Berlin' }
  }, '203.0.113.10', 'ipwhois', { id: 'ipwhois', label: 'ipwho.is' });
  assert.equal(result.status, 'complete');
  assert.equal(result.country, 'Germany');
  assert.equal(result.asn, 'AS64500');
  assert.equal(result.org, 'Example Network');
  assert.equal(result.timezone, 'Europe/Berlin');
});

test('normalizes FreeIPAPI metadata', () => {
  const result = normalizeGeoIp({
    ipAddress: '203.0.113.10', countryCode: 'DE', countryName: 'Germany', regionName: 'Hesse', cityName: 'Frankfurt am Main',
    asn: '64500', asnOrganization: 'Example Network', timeZones: ['Europe/Berlin', 'Europe/Busingen']
  }, '203.0.113.10', 'freeipapi', { id: 'freeipapi', label: 'FreeIPAPI' });
  assert.equal(result.status, 'complete');
  assert.equal(result.countryCode, 'DE');
  assert.equal(result.region, 'Hesse');
  assert.equal(result.asn, 'AS64500');
  assert.equal(result.org, 'Example Network');
  assert.equal(result.timezone, 'Europe/Berlin');
});

test('provider failure preserves the expected IP', async () => {
  const fetchImpl = async () => { throw new TypeError('Failed to fetch'); };
  const result = await runGeoIpProviderLookup({ ip: '203.0.113.10', provider: providers[0], timeoutMs: 100, fetchImpl });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.ip, '203.0.113.10');
  assert.equal(result.source.id, 'ipapi');
});

test('GeoIP provider lookup records deterministic latency', async () => {
  const samples = [1000, 1042];
  const now = () => samples.shift();
  const fetchImpl = async () => ({
    ok:true,
    json:async()=>({ country_code:'DE', country_name:'Germany', region:'Hesse', city:'Frankfurt am Main' })
  });
  const result = await runGeoIpProviderLookup({
    ip:'203.0.113.10', provider:providers[0], timeoutMs:100, fetchImpl, now
  });
  assert.equal(result.status, 'complete');
  assert.equal(result.latencyMs, 42);
});

test('zero usable countries is unavailable, not disagreement', async () => {
  const fetchImpl = async () => { throw new TypeError('Failed to fetch'); };
  const result = await runGeoIpConsensus({ ip:'94.25.174.96', providers, timeoutMs:50, fetchImpl });
  assert.equal(result.status, 'unavailable');
  assert.equal(result.agreement.countryState, 'unavailable');
  assert.equal(result.agreement.locationState, 'unavailable');
  assert.equal(result.agreement.countryAgree, null);
  assert.equal(result.agreement.locationAgree, null);
});

test('one successful provider is single-source, not agreement', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('ipwho.example')) return {
      ok:true,
      json:async()=>({ success:true, country_code:'DE', country:'Germany', region:'Hesse', city:'Frankfurt am Main', connection:{asn:64500,org:'Example Network'}, timezone:{id:'Europe/Berlin'} })
    };
    throw new TypeError('Failed to fetch');
  };
  const result = await runGeoIpConsensus({ ip:'203.0.113.10', providers, timeoutMs:100, fetchImpl });
  assert.equal(result.status, 'partial');
  assert.equal(result.country, 'Germany');
  assert.equal(result.city, 'Frankfurt am Main');
  assert.equal(result.agreement.countryState, 'single-source');
  assert.equal(result.agreement.locationState, 'single-source');
  assert.equal(result.agreement.countryAgree, null);
  assert.equal(result.agreement.locationAgree, null);
});

test('two or more same countries and locations agree', async () => {
  const fetchImpl = async (url) => ({
    ok:true,
    json:async()=> url.includes('ipapi.example')
      ? { country_code:'DE', country_name:'Germany', region:'Hesse', city:'Frankfurt am Main', asn:'AS64500', org:'Example Network', timezone:'Europe/Berlin' }
      : url.includes('ipwho.example')
        ? { success:true, country_code:'DE', country:'Germany', region:'Hesse', city:'Frankfurt am Main', connection:{asn:64500,org:'Example Network'}, timezone:{id:'Europe/Berlin'} }
        : { countryCode:'DE', countryName:'Germany', regionName:'Hesse', cityName:'Frankfurt am Main', asn:'64500', asnOrganization:'Example Network', timeZones:['Europe/Berlin'] }
  });
  const result = await runGeoIpConsensus({ ip:'203.0.113.10', providers, timeoutMs:100, fetchImpl });
  assert.equal(result.status, 'complete');
  assert.equal(result.agreement.countryState, 'agree');
  assert.equal(result.agreement.locationState, 'agree');
  assert.equal(result.agreement.countryAgree, true);
  assert.equal(result.agreement.locationAgree, true);
  assert.equal(result.differences.length, 0);
});

test('country can agree while location disagrees', async () => {
  const fetchImpl = async (url) => ({
    ok:true,
    json:async()=> url.includes('ipapi.example')
      ? { country_code:'DE', country_name:'Germany', region:'Hesse', city:'Frankfurt am Main' }
      : url.includes('ipwho.example')
        ? { success:true, country_code:'DE', country:'Germany', region:'Hesse', city:'Frankfurt am Main' }
        : { countryCode:'DE', countryName:'Germany', regionName:'Hesse', cityName:'Eschborn' }
  });
  const result = await runGeoIpConsensus({ ip:'203.0.113.10', providers, timeoutMs:100, fetchImpl });
  assert.equal(result.countryCode, 'DE');
  assert.equal(result.city, 'Frankfurt am Main');
  assert.equal(result.agreement.countryState, 'agree');
  assert.equal(result.agreement.locationState, 'disagree');
  assert.equal(result.agreement.countryAgree, true);
  assert.equal(result.agreement.locationAgree, false);
  assert.equal(result.differences.length, 3);
});

test('conflicting countries are explicit disagreement without affecting availability', async () => {
  const fetchImpl = async (url) => ({
    ok:true,
    json:async()=> url.includes('free.example')
      ? { countryCode:'NL', countryName:'Netherlands', cityName:'Amsterdam' }
      : url.includes('ipapi.example')
        ? { country_code:'DE', country_name:'Germany', city:'Frankfurt am Main' }
        : { success:true, country_code:'DE', country:'Germany', city:'Frankfurt am Main' }
  });
  const result = await runGeoIpConsensus({ ip:'203.0.113.10', providers, timeoutMs:100, fetchImpl });
  assert.equal(result.status, 'complete');
  assert.equal(result.countryCode, 'DE');
  assert.equal(result.agreement.countryState, 'disagree');
  assert.equal(result.agreement.countryAgree, false);
  assert.equal(result.agreement.available, 3);
});