import { readFile, writeFile } from 'node:fs/promises';

const path = new URL('../assets/app.js', import.meta.url);
let source = await readFile(path, 'utf8');

const oldNotice = `function noticeText(notice) {\n  return notice?.summary?.replace(/^IPv\\d+\\s+/, '') ?? null;\n}`;
const newNotice = `function noticeText(notice) {\n  return (notice?.shortSummary ?? notice?.summary)?.replace(/^IPv\\d+\\s+/, '') ?? null;\n}\n\nfunction ptrResolverSummary(ptr) {\n  const agreement = ptr?.agreement;\n  if (!agreement) return 'Unavailable';\n  const reached = agreement.reached ?? agreement.available ?? 0;\n  const total = agreement.total ?? 0;\n  const records = agreement.recordsAvailable ?? agreement.recordSources ?? 0;\n  if (agreement.state === 'unavailable') return \`0/\${total} resolvers reached · unavailable\`;\n  if (agreement.state === 'no-record') return \`\${reached}/\${total} resolvers reached · PTR record not found\`;\n  if (agreement.state === 'single-source') return \`\${records}/\${total} resolver returned a PTR record · single source\`;\n  if (agreement.state === 'agree') return \`\${records}/\${total} PTR sources · agree\`;\n  if (agreement.state === 'disagree') return \`\${records}/\${total} PTR sources · disagree\`;\n  return \`\${reached}/\${total} resolvers reached\`;\n}`;

if (!source.includes(oldNotice)) throw new Error('noticeText target was not found');
source = source.replace(oldNotice, newNotice);

const oldPtr = `      rows(row.body, [['Reverse DNS', ptr?.names?.join(', ') || (ptr?.status === 'complete' ? 'No PTR record' : 'Unavailable')], ['PTR resolvers', \`\${ptr?.agreement?.available ?? 0}/\${ptr?.agreement?.total ?? 0}\${ptr?.agreement?.agree ? ' · agree' : ' · differ'}\`]]);`;
const newPtr = `      rows(row.body, [['Reverse DNS', ptr?.names?.join(', ') || (ptr?.status === 'complete' ? 'No PTR record' : 'Unavailable')], ['PTR resolvers', ptrResolverSummary(ptr)]]);`;

if (!source.includes(oldPtr)) throw new Error('PTR resolver row target was not found');
source = source.replace(oldPtr, newPtr);

await writeFile(path, source);
console.log('Applied transparent UI copy patch.');
