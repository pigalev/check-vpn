function successfulSources(result) {
  return (result?.sources ?? []).filter((source) => source?.status === 'complete' && source?.address);
}

function countEntries(result) {
  return Object.entries(result?.agreement?.counts ?? {}).filter(([, count]) => Number.isFinite(count) && count > 0);
}

export function buildIpProviderEvidence(result = {}) {
  const selectedAddress = result.address ?? null;
  const successfulRows = successfulSources(result);
  const successful = result.agreement?.available ?? successfulRows.length;
  const total = result.agreement?.total ?? (result.sources?.length ?? 0);
  const counts = result.agreement?.counts ?? {};
  const selectedVotes = selectedAddress ? (counts[selectedAddress] ?? successfulRows.filter((source) => source.address === selectedAddress).length) : 0;
  const entries = countEntries(result);
  const maxVotes = entries.length ? Math.max(...entries.map(([, count]) => count)) : 0;
  const tied = maxVotes > 0 && entries.filter(([, count]) => count === maxVotes).length > 1;
  const majority = successful > 0 && selectedVotes > successful / 2;
  const differentValues = new Set(successfulRows.map((source) => source.address).filter((address) => address !== selectedAddress)).size;

  let summary;
  if (!successful) summary = 'No successful public-IP source';
  else if (tied) summary = 'No majority — selected first successful result';
  else if (differentValues === 0) summary = `${selectedVotes} of ${successful} successful sources agree`;
  else summary = `${selectedVotes} of ${successful} successful sources returned the selected address`;

  const sources = (result.sources ?? []).map((source) => {
    const available = source?.status === 'complete' && Boolean(source?.address);
    return {
      id: source?.id ?? null,
      label: source?.label ?? source?.id ?? 'Unknown provider',
      address: available ? source.address : null,
      relation: !available ? 'unavailable' : source.address === selectedAddress ? 'consensus' : 'differs',
      latencyMs: Number.isFinite(source?.latencyMs) ? source.latencyMs : null,
      error: !available ? source?.error ?? 'Request unavailable' : null
    };
  });

  return {
    selectedAddress,
    successful,
    total,
    selectedVotes,
    differentValues,
    majority,
    tied,
    summary,
    sources
  };
}
