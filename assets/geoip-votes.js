export function summarizeFieldVotes(
  values = [],
  { keyOf = (value) => value, labelOf = (value) => String(value) } = {}
) {
  const buckets = new Map();
  for (const value of values) {
    if (value == null) continue;
    const key = keyOf(value);
    if (key == null || key === '') continue;
    const label = labelOf(value);
    const bucket = buckets.get(key) ?? { key, label, votes:0 };
    bucket.votes += 1;
    buckets.set(key, bucket);
  }

  const ranked = [...buckets.values()]
    .sort((a, b) => b.votes - a.votes || String(a.key).localeCompare(String(b.key)));
  const usable = ranked.reduce((sum, item) => sum + item.votes, 0);
  const leader = ranked[0] ?? null;
  const winnerShare = usable && leader ? leader.votes / usable : 0;
  const state = usable === 0
    ? 'unavailable'
    : usable === 1
      ? 'single-source'
      : ranked.length === 1
        ? 'agree'
        : winnerShare > 0.5
          ? 'majority'
          : 'unresolved';
  const selected = ['single-source', 'agree', 'majority'].includes(state) ? leader : null;

  return {
    state,
    usable,
    counts: ranked,
    winnerKey: selected?.key ?? null,
    winnerLabel: selected?.label ?? null,
    winnerVotes: selected?.votes ?? 0,
    winnerShare,
    outliers: selected ? ranked.filter((item) => item.key !== selected.key) : ranked
  };
}
