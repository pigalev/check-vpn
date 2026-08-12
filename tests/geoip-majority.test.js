import test from 'node:test';
import assert from 'node:assert/strict';
import { runGeoIpConsensus } from '../assets/geoip.js';

const providers = [
  { id:'a', label:'A', kind:'ipapi', urlTemplate:'https://a.test/{ip}' },
  { id:'b', label:'B', kind:'ipapi', urlTemplate:'https://b.test/{ip}' },
  { id:'c', label:'C', kind:'ipapi', urlTemplate:'https://c.test/{ip}' },
  { id:'d', label:'D', kind:'ipapi', urlTemplate:'https://d.test/{ip}' }
];

function response(payload) {
  return { ok:true, status:200, json:async () => payload };
}

function fixtureFetch(payloads) {
  return async (url) => response(payloads[new URL(url).hostname.split('.')[0]] ?? {});
}

function payload(countryCode, country, city, region, timezone = null) {
  return {
    country_code:countryCode,
    country_name:country,
    city,
    region,
    timezone
  };
}

test('3-1 country vote selects majority but records an outlier', async () => {
  const result = await runGeoIpConsensus({
    ip:'31.76.17.233', providers, timeoutMs:100,
    fetchImpl:fixtureFetch({
      a:payload('DE','Germany','Neu-Isenburg','Hesse','Europe/Berlin'),
      b:payload('DE','Germany','Frankfurt am Main','Hessen','Europe/Berlin'),
      c:payload('DE','Germany','Frankfurt am Main','Hesse','Europe/Berlin'),
      d:payload('GB','United Kingdom','Whitehaven','Cumbria','Europe/London')
    })
  });
  assert.equal(result.votes.country.state, 'majority');
  assert.equal(result.votes.country.usable, 4);
  assert.equal(result.votes.country.winnerVotes, 3);
  assert.equal(result.countryCode, 'DE');
  assert.equal(result.country, 'Germany');
  assert.equal(result.agreement.countryState, 'disagree');
});

test('four different city-region values are unresolved and select no location', async () => {
  const result = await runGeoIpConsensus({
    ip:'31.76.17.233', providers, timeoutMs:100,
    fetchImpl:fixtureFetch({
      a:payload('DE','Germany','Neu-Isenburg','Hesse'),
      b:payload('DE','Germany','Frankfurt am Main','Hessen'),
      c:payload('DE','Germany','Frankfurt am Main (Innenstadt I)','Hesse'),
      d:payload('DE','Germany','Whitehaven','Cumbria')
    })
  });
  assert.equal(result.votes.location.state, 'unresolved');
  assert.equal(result.city, null);
  assert.equal(result.region, null);
  assert.equal(result.agreement.locationState, 'disagree');
});

test('2-1-1 country plurality is unresolved instead of picking the first response', async () => {
  const result = await runGeoIpConsensus({
    ip:'31.76.17.233', providers, timeoutMs:100,
    fetchImpl:fixtureFetch({
      a:payload('DE','Germany','A','R'),
      b:payload('DE','Germany','B','R'),
      c:payload('GB','United Kingdom','C','R'),
      d:payload('FR','France','D','R')
    })
  });
  assert.equal(result.votes.country.state, 'unresolved');
  assert.equal(result.votes.country.winnerShare, 0.5);
  assert.equal(result.countryCode, null);
  assert.equal(result.country, null);
});

test('2-2 timezone tie is unresolved and selects no timezone', async () => {
  const result = await runGeoIpConsensus({
    ip:'31.76.17.233', providers, timeoutMs:100,
    fetchImpl:fixtureFetch({
      a:payload('DE','Germany','A','R','Europe/Berlin'),
      b:payload('DE','Germany','A','R','Europe/Berlin'),
      c:payload('DE','Germany','A','R','Europe/London'),
      d:payload('DE','Germany','A','R','Europe/London')
    })
  });
  assert.equal(result.votes.timezone.state, 'unresolved');
  assert.equal(result.timezone, null);
});
