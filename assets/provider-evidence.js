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
    latencyMs: relation === 'not-needed' ? null : Number.isFinite(source?.latencyMs) ? source.latencyMs : null,
    error: relation === 'unavailable'
      ? source?.error ?? 'Request unavailable'
      : relation === 'not-needed'
        ? source?.error ?? 'Consensus already guaranteed'
        : null,
    endpointId: source?.endpointId ?? null,
    attempts: (source?.attempts ?? []).map((attempt) => ({ ...attempt }))
  };
}

function reserveSummary(result) {
  if (result?.reserve?.contributed) return 'reserve contributed';
  if (result?.reserve?.attempted) return 'reserve attempted';
  if (result?.reserve?.notNeeded) return 'reserve not needed';
  return null;
}

export function buildIpProviderEvidence(result = {}) {
  const selectedAddress = result.address ?? null;
  const confidence = result.confidence ?? (selectedAddress ? 'legacy' : 'unavailable');
  const successfulRows = successfulSources(result);
  const successful = result.agreement?.available ?? successfulRows.length;
  const total = result.agreement?.total ?? (result.sources?.filter((source) => !['not-needed','disabled'].includes(source?.status)).length ?? 0);
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
  const reserveText = reserveSummary(result);

  let summary;
  if (confidence === 'strong') {
    const primaryText = `${result.primary?.available ?? successful}/${result.primary?.total ?? total} primary groups responded`;
    summary = `Strong consensus · ${primaryText} · ${selectedVotes}/${successful} agree${reserveText ? ` · ${reserveText}` : ''}`;
  } else if (confidence === 'partial') {
    summary = `Partial · ${selectedVotes || successful} sources agree${reserveText ? ` · ${reserveText}` : ''}`;
  } else if (confidence === 'no-consensus') {
    const observed = new Set(successfulRows.map((source) => source.address)).size;
    summary = `No consensus · ${observed} different observed value${observed === 1 ? '' : 's'}${reserveText ? ` · ${reserveText}` : ''}`;
  } else if (!successful) {
    summary = `Unavailable · no successful public-IP group${reserveText ? ` · ${reserveText}` : ''}`;
  } else if (differentValues === 0) {
    summary = `${selectedVotes} of ${successful} successful sources agree${reserveText ? ` · ${reserveText}` : ''}`;
  } else {
    summary = `${selectedVotes} of ${successful} successful sources returned the selected address${reserveText ? ` · ${reserveText}` : ''}`;
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
      attempted: Boolean(result.reserve?.attempted ?? result.reserve?.used),
      contributed: Boolean(result.reserve?.contributed),
      notNeeded: Boolean(result.reserve?.notNeeded),
      used: Boolean(result.reserve?.used),
      rows: reserveRows
    },
    rows: [...primaryRows, ...reserveRows],
    sources: [...primaryRows, ...reserveRows]
  };
}
