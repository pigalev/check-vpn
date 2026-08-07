function usable(result) {
  return result && !['unavailable', 'error'].includes(result.status);
}

function likelyProvider(intel = {}) {
  return Boolean(intel?.isVpn || intel?.isProxy || intel?.isDatacenter);
}

function likelyResidential(intel = {}) {
  return usable(intel) && !intel.isVpn && !intel.isProxy && !intel.isDatacenter;
}

function clean(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function explanationFor(baselineMetadata = {}, current = {}) {
  const previousIntel = baselineMetadata.intelligence ?? {};
  const previousGeo = baselineMetadata.geo ?? {};
  const currentIntel = current.intelligence ?? {};
  const currentGeo = current.geo ?? {};

  if (likelyProvider(previousIntel) && likelyResidential(currentIntel)) return 'Possible ISP exposure';

  const previousAsn = clean(previousIntel.asn ?? previousGeo.asn);
  const currentAsn = clean(currentIntel.asn ?? currentGeo.asn);
  const previousCountry = clean(previousGeo.countryCode);
  const currentCountry = clean(currentGeo.countryCode);
  if ((previousAsn && currentAsn && previousAsn !== currentAsn) || (previousCountry && currentCountry && previousCountry !== currentCountry)) return 'Different VPN/network path';

  const previousOrg = clean(previousIntel.organization ?? previousGeo.org);
  const currentOrg = clean(currentIntel.organization ?? currentGeo.org);
  if ((previousAsn && currentAsn && previousAsn === currentAsn) || (previousOrg && currentOrg && previousOrg.toLowerCase() === currentOrg.toLowerCase())) return 'Address changed within same network';
  return 'Unexpected public IP';
}

export function createAggressiveLeakEnricher({ geoLookup, intelligenceLookup }) {
  const cache = new Map();

  async function lookup(address) {
    if (!cache.has(address)) {
      cache.set(address, Promise.allSettled([geoLookup(address), intelligenceLookup(address)]).then(([geoResult, intelResult]) => {
        const geo = geoResult.status === 'fulfilled' ? geoResult.value : null;
        const intelligence = intelResult.status === 'fulfilled' ? intelResult.value : null;
        return {
          enrichmentStatus: usable(geo) || usable(intelligence) ? 'complete' : 'unavailable',
          geo,
          intelligence
        };
      }));
    }
    return cache.get(address);
  }

  return {
    async enrichExposure(exposure, baselineMetadata = {}) {
      if (!exposure?.address) return { ...exposure, enrichmentStatus: 'skipped', explanation: 'Unexpected public IP' };
      const metadata = await lookup(exposure.address);
      return {
        ...exposure,
        enrichmentStatus: metadata.enrichmentStatus,
        geo: metadata.geo,
        intelligence: metadata.intelligence,
        explanation: explanationFor(baselineMetadata, metadata)
      };
    },
    cache
  };
}
