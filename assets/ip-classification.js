function invalid() {
  return { family: null, scope: 'invalid', public: false, transition: null, label: 'Invalid' };
}

function parseIpv4(address) {
  if (typeof address !== 'string' || !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(address.trim())) return null;
  const octets = address.trim().split('.').map(Number);
  if (!octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) return null;
  return octets;
}

function ipv4Number(octets) {
  return (((octets[0] * 256 + octets[1]) * 256 + octets[2]) * 256 + octets[3]) >>> 0;
}

function inIpv4Range(octets, base, prefix) {
  const value = ipv4Number(octets);
  const baseValue = ipv4Number(base.split('.').map(Number));
  const size = 2 ** (32 - prefix);
  return value >= baseValue && value < baseValue + size;
}

function parseIpv6(address) {
  if (typeof address !== 'string') return null;
  let value = address.trim().toLowerCase();
  if (!value.includes(':')) return null;
  const zoneIndex = value.indexOf('%');
  if (zoneIndex >= 0) value = value.slice(0, zoneIndex);

  const ipv4Match = value.match(/((?:\d{1,3}\.){3}\d{1,3})$/);
  if (ipv4Match) {
    const octets = parseIpv4(ipv4Match[1]);
    if (!octets) return null;
    const hi = ((octets[0] << 8) | octets[1]).toString(16);
    const lo = ((octets[2] << 8) | octets[3]).toString(16);
    value = `${value.slice(0, -ipv4Match[1].length)}${hi}:${lo}`;
  }

  if (!/^[0-9a-f:]+$/.test(value) || (value.match(/::/g) || []).length > 1) return null;
  const [leftRaw, rightRaw] = value.split('::');
  const left = leftRaw ? leftRaw.split(':') : [];
  const right = rightRaw ? rightRaw.split(':') : [];
  if ([...left, ...right].some((part) => !part || part.length > 4 || !/^[0-9a-f]{1,4}$/.test(part))) return null;
  if (!value.includes('::') && left.length !== 8) return null;
  const missing = 8 - left.length - right.length;
  if (value.includes('::') && missing < 1) return null;
  const parts = [...left, ...Array(Math.max(0, missing)).fill('0'), ...right];
  if (parts.length !== 8) return null;
  return parts.map((part) => Number.parseInt(part, 16));
}

function ipv6BigInt(parts) {
  return parts.reduce((acc, part) => (acc << 16n) | BigInt(part), 0n);
}

function inIpv6Prefix(parts, prefixHex, prefixLength) {
  const value = ipv6BigInt(parts);
  const baseParts = parseIpv6(prefixHex);
  if (!baseParts) return false;
  const base = ipv6BigInt(baseParts);
  const shift = 128n - BigInt(prefixLength);
  return (value >> shift) === (base >> shift);
}

function ipv4Result(octets) {
  const ranges = [
    ['loopback', 'Loopback', '127.0.0.0', 8],
    ['link-local', 'Link-local', '169.254.0.0', 16],
    ['private', 'Private', '10.0.0.0', 8],
    ['private', 'Private', '172.16.0.0', 12],
    ['private', 'Private', '192.168.0.0', 16],
    ['cgnat', 'CGNAT/shared', '100.64.0.0', 10],
    ['documentation', 'Documentation', '192.0.2.0', 24],
    ['documentation', 'Documentation', '198.51.100.0', 24],
    ['documentation', 'Documentation', '203.0.113.0', 24],
    ['multicast', 'Multicast', '224.0.0.0', 4],
    ['unspecified', 'Unspecified', '0.0.0.0', 8]
  ];
  for (const [scope, label, base, prefix] of ranges) {
    if (inIpv4Range(octets, base, prefix)) return { family: 4, scope, public: false, transition: null, label };
  }
  return { family: 4, scope: 'global', public: true, transition: null, label: 'Public IPv4' };
}

function ipv6Result(parts) {
  const value = ipv6BigInt(parts);
  if (value === 0n) return { family: 6, scope: 'unspecified', public: false, transition: null, label: 'Unspecified' };
  if (value === 1n) return { family: 6, scope: 'loopback', public: false, transition: null, label: 'Loopback' };
  if (inIpv6Prefix(parts, 'fe80::', 10)) return { family: 6, scope: 'link-local', public: false, transition: null, label: 'Link-local IPv6' };
  if (inIpv6Prefix(parts, 'fc00::', 7)) return { family: 6, scope: 'ula', public: false, transition: null, label: 'Unique local IPv6' };
  if (inIpv6Prefix(parts, 'ff00::', 8)) return { family: 6, scope: 'multicast', public: false, transition: null, label: 'Multicast IPv6' };
  if (inIpv6Prefix(parts, '2001:db8::', 32)) return { family: 6, scope: 'documentation', public: false, transition: null, label: 'Documentation IPv6' };
  if (inIpv6Prefix(parts, '::ffff:0:0', 96)) return { family: 6, scope: 'mapped', public: false, transition: 'ipv4-mapped', label: 'IPv4-mapped IPv6' };
  if (inIpv6Prefix(parts, '2002::', 16)) return { family: 6, scope: 'global', public: true, transition: '6to4', label: 'Global IPv6 (6to4)' };
  if (inIpv6Prefix(parts, '2001:0000::', 32)) return { family: 6, scope: 'global', public: true, transition: 'teredo', label: 'Global IPv6 (Teredo)' };
  return { family: 6, scope: 'global', public: true, transition: null, label: 'Global IPv6' };
}

export function classifyIpAddress(address) {
  const ipv4 = parseIpv4(address);
  if (ipv4) return ipv4Result(ipv4);
  const ipv6 = parseIpv6(address);
  if (ipv6) return ipv6Result(ipv6);
  return invalid();
}

export function isPublicInternetAddress(address) {
  return classifyIpAddress(address).public === true;
}

export function getClassifiedIpFamily(address) {
  return classifyIpAddress(address).family;
}
