function successfulSources(result) {
  return (result?.sources ?? []).filter((source) => source?.status === 'complete' && source?.address);
}

function relationFor(source, selectedAddress, confidence) {
  if (source?.status === 'not-needed') return 'not-needed';
  if (source?.status !== 'complete' || !source?.address) return 'unavailable';
  if (!selectedAddress || confidence === 'no-consensus') return 'observed';
  return source.address === selectedAddress ? 'agrees' : 'differs';
}

function rowFor(source, selectedAddress, confidence) {
  const relation = relationFor(source, selectedAddress, confidence);
  return {
    id: source?.id ?? null,
    group: source?.group ?? source?.id ?? null,
    label: source?.label ?? source?.id ?? 'Unknown provider',
    tier: source?.tier ?? 'primary',
    address: source?.status === 'complete' ? source.address ?? null : null,
    relation,
    latencyMs: Number.isFinite(source?.latencyMs) ? source.latencyMs : null,
    error: relation === 'unavailable' ? source?.error ?? 'Request unavailable' : null,
    endpointId: source?.endpointId ?? null,
    attempts: (source?.attempts ?? []).map((attempt) => ({ ...attempt }))
  };
}

function reserveUnavailable(result) {
  return Boolean(result?.reserve?.used) && (result.reserve.sources ?? []).every((source) => source?.status !== 'complete');
}

export function buildIpProviderEvidence(result = {}) {
  const selectedAddress = result.address ?? null;
  const confidence = result.confidence ?? (selectedAddress ? 'legacy' : 'unavailable');
  const successfulRows = successfulSources(result);
  const successful = result.agreement?.available ?? successfulRows.length;
  const total = result.agreement?.total ?? (result.sources?.filter((source) => source?.status !== 'not-needed').length ?? 0);
  const counts = result.agreement?.counts ?? {};
  const selectedVotes = result.agreement?.selectedVotes ?? (selectedAddress ? (counts[selectedAddress] ?? successfulRows.filter((source) => source.address === selectedAddress).length) : 0);
  const differentValues = selectedAddress
    ? new Set(successfulRows.map((source) => source.address).filter((address) => address !== selectedAddress)).size
    : 0;
  const winningShare = result.agreement?.winningShare ?? (successful ? selectedVotes / successful : 0);
  const majority = successful > 0 && selectedVotes > successful / 2;

  const primarySources = result.primary?.sources ?? (result.sources ?? []).filter((source) => source?.tier !== 'reserve');
  const reserveSources = result.reserve?.sources ?? (result.sources ?? []).filter((source) => source?.tier === 'reserve');
  const primaryRows = primarySources.map((source) => rowFor(source, selectedAddress, confidence));
  const reserveRows = reserveSources.map((source) => rowFor(source, selectedAddress, confidence));

  let summary;
  if (confidence === 'strong') {
    summary = result.reserve?.used
      ? `Strong consensus · reserve used · ${selectedVotes}/${successful} agree`
      : `Strong consensus · ${result.primary?.available ?? successful}/${result.primary?.total ?? total} primary groups responded · ${selectedVotes} agree`;
  } else if (confidence === 'partial') {
    summary = `Partial · ${selectedVotes || successful} sources agree${reserveUnavailable(result) ? ' · reserve unavailable' : ''}`;
  } else if (confidence === 'no-consensus') {
    const observed = new Set(successfulRows.map((source) => source.address)).size;
    summary = `No consensus · ${observed} different observed value${observed === 1 ? '' : 's'}`;
  } else if (!successful) {
    summary = 'Unavailable · no successful public-IP group';
  } else if (differentValues === 0) {
    summary = `${selectedVotes} of ${successful} successful sources agree`;
  } else {
    summary = `${selectedVotes} of ${successful} successful sources returned the selected address`;
  }

  return {
    selectedAddress,
    confidence,
    successful,
    total,
    selectedVotes,
    differentValues,
    winningShare,
    majority,
    summary,
    primary: {
      available: result.primary?.available ?? primaryRows.filter((row) => ['agrees', 'differs', 'observed'].includes(row.relation)).length,
      total: result.primary?.total ?? primaryRows.length,
      rows: primaryRows
    },
    reserve: {
      used: Boolean(result.reserve?.used),
      rows: reserveRows
    },
    rows: [...primaryRows, ...reserveRows],
    sources: [...primaryRows, ...reserveRows]
  };
}
