import test from 'node:test';
import assert from 'node:assert/strict';
import { reason, reasonForGeoState, reasonForIpConsensus } from '../assets/diagnostic-reasons.js';

test('country disagreement has stable Review wording', () => {
  const item = reason('GEO_COUNTRY_DISAGREEMENT', { family:4, countries:['Germany','Russia'] });
  assert.equal(item.code, 'GEO_COUNTRY_DISAGREEMENT');
  assert.equal(item.severity, 'review');
  assert.equal(item.summary, 'IPv4 GeoIP country disagreement');
  assert.match(item.details, /Germany/);
  assert.match(item.details, /Russia/);
});

test('location disagreement is informational when country agrees', () => {
  const items = reasonForGeoState({
    family:4,
    countryState:'agree',
    locationState:'disagree',
    countries:['Germany'],
    locations:['Neu-Isenburg, Hesse','Frankfurt am Main, Hesse']
  });
  assert.deepEqual(items.map((item) => item.code), ['GEO_LOCATION_DISAGREEMENT']);
  assert.equal(items[0].severity, 'info');
  assert.equal(items[0].summary, 'IPv4 GeoIP location differs between providers');
});

test('public IP no-consensus wording never says GeoIP', () => {
  const [item] = reasonForIpConsensus({ family:4, confidence:'no-consensus' });
  assert.equal(item.code, 'IP_NO_CONSENSUS');
  assert.match(item.summary, /Public IP/);
  assert.doesNotMatch(`${item.summary} ${item.details}`, /GeoIP/i);
});
