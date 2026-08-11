import test from 'node:test';
import assert from 'node:assert/strict';
import { runGeoIpConsensus } from '../assets/geoip.js';
import { assessPrivacy } from '../assets/privacy-assessment.js';

const countryOnlyProviders = [
  { id:'a', label:'A', kind:'ipapi', urlTemplate:'https://a.example/{ip}' },
  { id:'b', label:'B', kind:'ipapi', urlTemplate:'https://b.example/{ip}' }
];

test('country-only GeoIP responses do not masquerade as location agreement', async () => {
  const fetchImpl = async () => ({
    ok:true,
    json:async()=>({ country_code:'DE', country_name:'Germany' })
  });
  const result = await runGeoIpConsensus({ ip:'203.0.113.10', providers:countryOnlyProviders, timeoutMs:100, fetchImpl });
  assert.equal(result.agreement.countryState, 'agree');
  assert.equal(result.agreement.locationState, 'unavailable');
  assert.equal(result.agreement.locationAgree, null);
});

test('country name is usable evidence when a provider omits country code', async () => {
  const fetchImpl = async () => ({
    ok:true,
    json:async()=>({ country_name:'Germany', city:'Frankfurt', region:'Hesse' })
  });
  const result = await runGeoIpConsensus({ ip:'203.0.113.10', providers:countryOnlyProviders, timeoutMs:100, fetchImpl });
  assert.equal(result.agreement.countryState, 'agree');
});

test('timezone mismatch uses the canonical reason code while preserving its stable id', () => {
  const result = assessPrivacy({
    browser:{timezone:'Europe/Moscow'},
    ipv4:{geo:{timezone:'Europe/Berlin'}},
    ipv6:null
  });
  const finding = result.findings.find((item) => item.id === 'timezone-mismatch');
  assert.ok(finding);
  assert.equal(finding.code, 'BROWSER_TIMEZONE_MISMATCH');
  assert.equal(finding.severity, 'review');
  assert.equal(finding.summary, 'Browser timezone differs from IP timezone');
});
