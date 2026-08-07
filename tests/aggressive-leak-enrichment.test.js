import test from 'node:test';
import assert from 'node:assert/strict';
import { createAggressiveLeakEnricher } from '../assets/aggressive-leak-enrichment.js';

test('caches enrichment once per unique unexpected address', async () => {
  let geoCalls = 0;
  let intelCalls = 0;
  const enricher = createAggressiveLeakEnricher({
    geoLookup: async (ip) => { geoCalls += 1; return { status: 'complete', ip, countryCode: 'RU', asn: 'AS123' }; },
    intelligenceLookup: async (ip) => { intelCalls += 1; return { status: 'complete', ip, asn: 'AS123', organization: 'ISP', isVpn: false, isProxy: false, isDatacenter: false }; }
  });
  const exposure = { address: '95.25.44.18', family: 4 };
  await enricher.enrichExposure(exposure, {});
  await enricher.enrichExposure({ ...exposure, observationCount: 2 }, {});
  assert.equal(geoCalls, 1);
  assert.equal(intelCalls, 1);
});

test('classifies likely VPN to ISP transition as possible ISP exposure', async () => {
  const enricher = createAggressiveLeakEnricher({
    geoLookup: async () => ({ status: 'complete', countryCode: 'RU', asn: 'AS123' }),
    intelligenceLookup: async () => ({ status: 'complete', asn: 'AS123', organization: 'ISP', isVpn: false, isProxy: false, isDatacenter: false })
  });
  const result = await enricher.enrichExposure({ address: '95.25.44.18', family: 4 }, {
    intelligence: { status: 'complete', asn: 'AS999', organization: 'VPN DC', isVpn: true, isDatacenter: true }
  });
  assert.equal(result.explanation, 'Possible ISP exposure');
});

test('enrichment failure preserves raw exposure', async () => {
  const enricher = createAggressiveLeakEnricher({
    geoLookup: async () => { throw new Error('down'); },
    intelligenceLookup: async () => { throw new Error('down'); }
  });
  const exposure = { address: '95.25.44.18', family: 4, observationCount: 1 };
  const result = await enricher.enrichExposure(exposure, {});
  assert.equal(result.address, exposure.address);
  assert.equal(result.enrichmentStatus, 'unavailable');
});
