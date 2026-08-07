function clean(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isLikelyProvider(intel = {}) {
  return Boolean(intel.isVpn || intel.isProxy || intel.isDatacenter);
}

function isLikelyResidential(intel = {}) {
  return intel && intel.status !== 'unavailable' && !intel.isVpn && !intel.isProxy && !intel.isDatacenter;
}

export function classifyMonitorTransition({ previous = {}, current = {} } = {}) {
  const previousIntel = previous.intelligence ?? {};
  const currentIntel = current.intelligence ?? {};
  const previousGeo = previous.geo ?? {};
  const currentGeo = current.geo ?? {};

  if (isLikelyProvider(previousIntel) && isLikelyResidential(currentIntel)) return 'Possible ISP exposure';

  const previousAsn = clean(previousIntel.asn ?? previousGeo.asn);
  const currentAsn = clean(currentIntel.asn ?? currentGeo.asn);
  const previousCountry = clean(previousGeo.countryCode);
  const currentCountry = clean(currentGeo.countryCode);
  if ((previousAsn && currentAsn && previousAsn !== currentAsn) || (previousCountry && currentCountry && previousCountry !== currentCountry)) return 'Network path changed';

  const previousOrg = clean(previousIntel.organization ?? previousGeo.org);
  const currentOrg = clean(currentIntel.organization ?? currentGeo.org);
  if ((previousAsn && currentAsn && previousAsn === currentAsn) || (previousOrg && currentOrg && previousOrg.toLowerCase() === currentOrg.toLowerCase())) return 'Address changed within same network';
  return 'Public IP changed';
}

export function createMonitorEnricher({ geoLookup, intelligenceLookup }) {
  const cache = new Map();

  async function lookup(address) {
    if (!address) return null;
    if (!cache.has(address)) {
      cache.set(address, Promise.allSettled([geoLookup(address), intelligenceLookup(address)]).then(([geoResult, intelResult]) => {
        const geo = geoResult.status === 'fulfilled' ? geoResult.value : null;
        const intelligence = intelResult.status === 'fulfilled' ? intelResult.value : null;
        const usable = [geo, intelligence].some((result) => result && !['unavailable', 'error'].includes(result.status));
        return { enrichmentStatus: usable ? 'complete' : 'unavailable', geo, intelligence };
      }));
    }
    return cache.get(address);
  }

  return {
    async enrichEvent(event, context = {}) {
      if (!event?.address) return { ...event, enrichmentStatus: 'skipped', transitionLabel: 'Public IP changed' };
      const current = await lookup(event.address);
      const previous = context.previous ?? null;
      const transitionLabel = classifyMonitorTransition({ previous: previous ?? {}, current: current ?? {} });
      return { ...event, enrichmentStatus: current?.enrichmentStatus ?? 'unavailable', geo: current?.geo ?? null, intelligence: current?.intelligence ?? null, transitionLabel };
    },
    cache
  };
}
