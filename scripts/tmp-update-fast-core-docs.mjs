import { readFile, writeFile } from 'node:fs/promises';

function replaceOnce(text, oldValue, newValue, label) {
  const count = text.split(oldValue).length - 1;
  if (count !== 1) throw new Error(`${label}: expected one match, got ${count}`);
  return text.replace(oldValue, newValue);
}

function replaceSection(text, heading, nextHeading, body) {
  const start = text.indexOf(heading);
  if (start < 0) throw new Error(`Missing section ${heading}`);
  const end = text.indexOf(nextHeading, start + heading.length);
  if (end < 0) throw new Error(`Missing next section ${nextHeading}`);
  return text.slice(0, start) + `${heading}\n\n${body.trim()}\n\n` + text.slice(end);
}

const readmePath = 'README.md';
let readme = await readFile(readmePath, 'utf8');

readme = replaceOnce(
  readme,
  'The active GeoIP race uses `ipapi.co`, `ipwho.is`, `FreeIPAPI`, and `ipapi.is`. Public-IP voting and GeoIP voting are separate concerns: `ipwho.is` is retained for GeoIP metadata but is no longer consumed as an IP-only Core vote.',
  'The active IPv4 GeoIP race uses `ipapi.co`, `ipwho.is`, `FreeIPAPI`, `ipapi.is`, and the RU endpoint of `Sypex Geo`. Sypex RU is activation-gated and configured as IPv4-only because that is the family/browser contract verified by the project smoke. IPv6 GeoIP skips it rather than waiting for an incompatible provider. Public-IP voting and GeoIP voting are separate concerns: `ipwho.is` is retained for GeoIP metadata but is no longer consumed as an IP-only Core vote.',
  'GeoIP provider summary'
);

readme = replaceOnce(
  readme,
  '`ident.me` has `tnedi.me` as an endpoint fallback inside the same group. If the preferred endpoint fails and the mirror succeeds, the group still contributes exactly **one** vote.',
  '`ident.me` has `tnedi.me` as an endpoint fallback inside the same group. The preferred endpoint starts immediately; if it has not produced a valid answer after **900 ms**, the mirror starts concurrently. The first valid answer wins the group and the group still contributes exactly **one** vote.\n\nCore public-IP discovery uses a **3200 ms** wall-clock deadline and starts all enabled Core-capable groups concurrently, including the reserve-tier IPPubblico group. It may finish before that deadline when Strong consensus is mathematically guaranteed. With winner votes `W`, successful votes `S`, and pending enabled groups `P`, early Strong requires `W >= 3` and `W / (S + P) >= 2/3`. Pending requests aborted after that point are recorded as `Not needed · Consensus already guaranteed`, not as failures.',
  'wide consensus timing'
);

readme = replaceSection(
  readme,
  '### Reserve provider',
  '### Core versus repeated-test provider profiles',
  `\`IPPubblico\` remains grouped under **Reserve** in Advanced diagnostics, but it is now a **live browser attempt**, not a globally disabled source. Core starts it concurrently with the other enabled Core-capable groups so it can help degraded/Russian-network paths without adding a second wait phase.\n\nIf the user's browser cannot read IPPubblico because of CORS/network policy, the source is simply \`unavailable\`. If mathematically-safe Strong consensus is reached before IPPubblico finishes, it is aborted and shown as \`not needed · consensus already guaranteed\`. Either outcome is provider evidence only and never creates a leak finding.\n\nA previous GitHub-runner smoke that lacked readable CORS is no longer treated as a permanent global verdict about every user network.`
);

readme = replaceOnce(
  readme,
  '- **Core / Guided Step 1–2 capture:** broad five-group primary set above, plus conditional reserve configuration.',
  '- **Core / Guided Step 1–2 capture:** broad five-group primary set above plus live reserve-tier IPPubblico for the default Core race; Guided captures retain broad evidence.',
  'profile Core wording'
);

readme = replaceOnce(
  readme,
  '- latency/error information;\n- endpoint attempts when a provider group used a fallback mirror.',
  '- latency/error information;\n- `not needed · consensus already guaranteed` for sources cancelled after a safe early Strong result;\n- endpoint attempts when a provider group used a fallback/hedged mirror.',
  'advanced evidence wording'
);

readme = replaceOnce(
  readme,
  'The HTTP stress path uses only `ipify`, `ident.me`, and `SeeIP`; it does not call the broad five-provider Core set or the disabled IPPubblico reserve every two seconds.',
  'The HTTP stress path uses only `ipify`, `ident.me`, and `SeeIP`; it does not call the broad Core set or live IPPubblico reserve every two seconds.',
  'Aggressive reserve wording'
);

readme = replaceOnce(
  readme,
  '- **Core public-IP discovery:** ipify, ident.me/tnedi.me, SeeIP, icanhazip and IP.SB;\n- **Configured but disabled reserve:** IPPubblico;\n- **Repeated IP sampling:** ipify, ident.me/tnedi.me and SeeIP;\n- **GeoIP:** ipapi.co, ipwho.is, FreeIPAPI and ipapi.is;',
  '- **Core public-IP discovery:** ipify, ident.me/tnedi.me, SeeIP, icanhazip, IP.SB and live reserve-tier IPPubblico;\n- **Repeated IP sampling:** ipify, ident.me/tnedi.me and SeeIP;\n- **GeoIP:** ipapi.co, ipwho.is, FreeIPAPI, ipapi.is and IPv4-only Sypex Geo RU;',
  'external service list'
);

readme = replaceOnce(
  readme,
  'A non-production helper is included for checking response payloads and CORS headers:\n\n```bash\nnode scripts/check-ip-provider-cors.mjs --origin=https://pigalev.github.io\n```',
  'Non-production helpers are included for checking response payloads and CORS headers:\n\n```bash\nnode scripts/check-ip-provider-cors.mjs --origin=https://pigalev.github.io\nnode scripts/check-ru-provider-cors.mjs --origin=https://pigalev.github.io\n```\n\nThe RU activation smoke accepted `ru.sxgeo.city` for **IPv4 GeoIP-only** (`HTTP 200`, readable `Access-Control-Allow-Origin: *`, parseable JSON) and rejected the tested IP-API.RU self-IP candidate for production Core because the smoke did not provide browser-readable CORS/payload compatibility; its documented demo rate profile is also unsuitable for an always-on public Core source.',
  'smoke utility docs'
);

const geoMarker = 'Provider disagreement by itself, reserve usage, GeoIP disagreement, TLS fingerprints, fingerprint surfaces, STUN port variation, CGNAT/local-address exposure, timezone mismatch and VPN/proxy/datacenter classification do not become leaks by themselves. A Strong `4-1` Core consensus remains usable rather than being turned into `Review` solely because one provider differed.';
readme = replaceOnce(
  readme,
  geoMarker,
  `${geoMarker}\n\nGeoIP agreement has explicit states: \`unavailable\`, \`single-source\`, \`agree\`, and \`disagree\`. Zero usable countries is **unavailable**, not disagreement. A single usable country is displayed without pretending multiple providers agreed. When providers genuinely disagree but a selected country/location exists, the connection hero still shows that location and a warning. Country flags use FlagCDN as an enhancement with a Unicode flag fallback, while country text remains independent of both.`,
  'GeoIP state docs'
);

await writeFile(readmePath, readme);

const specPath = 'docs/superpowers/specs/2026-08-11-fast-core-ru-geoip-design.md';
let spec = await readFile(specPath, 'utf8');
const activation = `\n\n# 14. Activation outcome (implementation evidence)\n\nA one-shot networked smoke was executed with origin \`https://pigalev.github.io\`.\n\n- **IP-API.RU self-IP candidate:** rejected for production. The smoke returned HTTP 200 but no readable CORS permission and the tested payload did not satisfy the expected self-IP parser. Its demo rate profile is also unsuitable for an always-on public Core source.\n- **Sypex Geo RU:** accepted for **IPv4 GeoIP-only**. The smoke returned HTTP 200, \`Access-Control-Allow-Origin: *\`, parseable JSON, and usable country data. Production config marks this provider \`families:[4]\`, so IPv6 GeoIP does not wait for it.\n- **IPPubblico:** remains a live browser-attempted reserve-tier Core source. User-network success/failure is evaluated per run rather than inferred globally from the earlier GitHub-runner CORS observation.\n`;
if (!spec.includes('# 14. Activation outcome')) spec += activation;
await writeFile(specPath, spec);
