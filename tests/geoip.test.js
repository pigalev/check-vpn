import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGeoIpUrl, normalizeGeoIp, runGeoIpLookup } from '../assets/geoip.js';

test('builds lookup URL from the already detected address', () => {
  assert.equal(
    buildGeoIpUrl('https://geo.example/{ip}/json/', '2001:db8::10'),
    'https://geo.example/2001%3Adb8%3A%3A10/json/'
  );
});

test('normalizes ipapi-style metadata', () => {
  assert.deepEqual(normalizeGeoIp({
    ip: '203.0.113.10',
    country_code: 'DE',
    country_name: 'Germany',
    region: 'Hesse',
    city: 'Frankfurt am Main',
    asn: 'AS64500',
    org: 'Example Network',
    timezone: 'Europe/Berlin'
  }, '203.0.113.10'), {
    status: 'complete',
    ip: '203.0.113.10',
    countryCode: 'DE',
    country: 'Germany',
    region: 'Hesse',
    city: 'Frankfurt am Main',
    asn: 'AS64500',
    org: 'Example Network',
    timezone: 'Europe/Berlin',
    error: null
  });
});

test('keeps expected IP and reports metadata unavailable when lookup fails', async () => {
  const fetchImpl = async () => { throw new TypeError('Failed to fetch'); };
  const result = await runGeoIpLookup({
    ip: '203.0.113.10',
    urlTemplate: 'https://geo.example/{ip}/json/',
    timeoutMs: 100,
    fetchImpl
  });

  assert.equal(result.status, 'unavailable');
  assert.equal(result.ip, '203.0.113.10');
  assert.equal(result.country, null);
});
