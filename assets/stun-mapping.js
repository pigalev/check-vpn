function infoFinding(summary, details) {
  return { id: 'stun-mapping', severity: 'info', category: 'stun', summary, details, sources: ['stun'] };
}

export function compareStunMappings(records = []) {
  const mappings = [];
  for (const record of records) {
    const candidates = record?.candidates ?? record?.result?.candidates ?? [];
    const srflx = candidates.find((candidate) => candidate?.type === 'srflx' && candidate?.classification === 'public');
    if (!srflx) continue;
    mappings.push({ server: record.server ?? 'unknown', address: srflx.address, port: srflx.port ?? null, protocol: srflx.protocol ?? null, type: srflx.type });
  }

  if (mappings.length < 2) {
    return { status: 'insufficient', label: 'Insufficient STUN data', mappings, sameAddress: null, samePort: null, finding: infoFinding('Insufficient STUN mapping data', 'Not enough isolated STUN mappings were observed for comparison.') };
  }

  const addresses = new Set(mappings.map((mapping) => mapping.address));
  const ports = new Set(mappings.map((mapping) => mapping.port).filter((port) => port != null));
  const sameAddress = addresses.size === 1;
  const samePort = ports.size <= 1 && mappings.every((mapping) => mapping.port != null);

  let label;
  if (!sameAddress) label = 'Different public addresses';
  else if (!samePort) label = 'Same IP, different public ports';
  else label = 'Same public mapping';

  const details = label === 'Same IP, different public ports'
    ? 'The public IP is stable, but the mapped source port changes between STUN destinations. This is a NAT behavior hint, not an exact NAT-type diagnosis.'
    : label === 'Different public addresses'
      ? 'Different isolated STUN destinations observed different public addresses.'
      : 'Configured STUN destinations observed the same public address and port.';

  return { status: 'complete', label, mappings, sameAddress, samePort, finding: infoFinding(label, details) };
}
