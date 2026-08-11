export function countVotes(sources = []) {
  const successful = sources.filter((source) => source?.status === 'complete' && source.address);
  const counts = {};
  for (const source of successful) counts[source.address] = (counts[source.address] ?? 0) + 1;
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const winner = ranked[0]?.[0] ?? null;
  const selectedVotes = ranked[0]?.[1] ?? 0;
  const winningShare = successful.length ? selectedVotes / successful.length : 0;
  return {
    successful,
    counts,
    winner,
    selectedVotes,
    winningShare,
    allAgree: ranked.length <= 1
  };
}

export function canGuaranteeStrong({ sources = [], pendingCount = 0 }) {
  const vote = countVotes(sources);
  if (vote.selectedVotes < 3) return false;
  const worstCaseSuccessful = vote.successful.length + Math.max(0, pendingCount);
  return worstCaseSuccessful > 0 && (vote.selectedVotes / worstCaseSuccessful) >= (2 / 3);
}
