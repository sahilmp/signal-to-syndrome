// Release check for dist/qollab/ and src/ui/features.js (CLAUDE.md rule 3, team rules;
// DECISIONS D5, D9). Prints a pass/fail table and exits 1 if any row fails.

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { validateBank } from '../src/core/bank.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const p = (...parts) => join(root, ...parts);
const rel = (f) => relative(root, f).replaceAll('\\', '/');

const MAX_BYTES = 1_900_000; // D5: main.js + index.html
const FORBIDDEN = ['fetch(', 'XMLHttpRequest', 'WebSocket', 'import('];
const ALLOWED_HOSTS = ['qollab.xyz', 'ionq.com', 'docs.ionq.com', 'arxiv.org', 'doi.org', 'github.com'];
const ATTRIBUTION = 'This effort is supported by Qollab & IonQ.';
const NEEDS = {
  level1: ['decodeShot', 'runPoint', 'diagnostic', 'createFlatReadout', 'bankD3R1', 'bankD3R3', 'stage1'],
  level2: ['decodeShot', 'runPoint', 'diagnostic', 'createFlatReadout', 'bankD3R1', 'bankD3R3', 'stage1'],
  ion: ['createIonReadout', 'stage2', 'paramsIon'],
  superconducting: ['createScReadout', 'stage3', 'paramsSc'],
  level5: ['stage2', 'stage3', 'stage4', 'paramsIon', 'paramsSc', 'paramsCycle'],
  liveRun: [],
};

const rows = [];
const row = (rule, ok, detail = '') => rows.push({ rule, ok, detail });
const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : null);

// 1. The three Qollab files exist; size limit.
const distFiles = ['index.html', 'main.css', 'main.js'].map((f) => p('dist', 'qollab', f));
for (const f of distFiles) row(`${rel(f)} exists`, existsSync(f), existsSync(f) ? `${statSync(f).size} bytes` : 'missing (run npm run build)');
const jsFile = distFiles[2];
const htmlFile = distFiles[0];
if (existsSync(jsFile) && existsSync(htmlFile)) {
  const total = statSync(jsFile).size + statSync(htmlFile).size;
  row('main.js + index.html <= 1 900 000 bytes (D5)', total <= MAX_BYTES, `${total} bytes`);
} else {
  row('main.js + index.html <= 1 900 000 bytes (D5)', false, 'files missing');
}

// 2. No network or dynamic-import calls; 3. URL allowlist.
for (const f of [jsFile, htmlFile]) {
  const text = read(f);
  if (text === null) {
    row(`${rel(f)}: no ${FORBIDDEN.join(', ')}`, false, 'file missing');
    row(`${rel(f)}: URL hosts on the allowlist`, false, 'file missing');
    continue;
  }
  const found = FORBIDDEN.filter((s) => text.includes(s));
  row(`${rel(f)}: no ${FORBIDDEN.join(', ')}`, found.length === 0, found.length ? `found ${found.map((s) => `"${s}"`).join(', ')}` : '');
  const urls = [...new Set(text.match(/https?:\/\/[^\s"'`<>()\\]+/gi) || [])];
  const bad = urls.filter((u) => {
    try {
      return !ALLOWED_HOSTS.includes(new URL(u).hostname.toLowerCase());
    } catch {
      return true;
    }
  });
  row(`${rel(f)}: URL hosts on the allowlist`, bad.length === 0, bad.length ? `not allowed: ${bad.join(' ')}` : `${urls.length} URL(s)`);
}

// 4. Attribution and licence.
const html = read(htmlFile);
row('attribution line in dist/qollab/index.html', html !== null && html.includes(ATTRIBUTION), html === null ? 'file missing' : '');
const readme = read(p('README.md'));
row('attribution line in README.md', readme !== null && readme.includes(ATTRIBUTION), readme === null ? 'file missing' : '');
const license = read(p('LICENSE'));
const placeholders = license === null ? [] : ['PERSON_A_NAME', 'PERSON_B_NAME'].filter((s) => license.includes(s));
row('LICENSE exists without PERSON_A_NAME or PERSON_B_NAME', license !== null && placeholders.length === 0,
  license === null ? 'missing' : placeholders.length ? `contains ${placeholders.join(', ')}` : '');

// 5. Banks.
const bankDir = p('data', 'banks');
const bankFiles = existsSync(bankDir) ? readdirSync(bankDir).filter((f) => f.endsWith('.json')).sort() : [];
if (bankFiles.length === 0) row('data/banks/*.json pass validateBank', true, 'no bank files yet');
for (const f of bankFiles) {
  try {
    validateBank(JSON.parse(readFileSync(join(bankDir, f), 'utf8')));
    row(`data/banks/${f} passes validateBank`, true);
  } catch (err) {
    row(`data/banks/${f} passes validateBank`, false, err.message);
  }
}

// 6. Bridges: every export an enabled feature needs comes from a real module or data file.
// Maps each exported name of a bridge file to the path it is imported from.
function bridgeSources(file) {
  const text = readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const local = new Map();
  const exported = new Map();
  const names = (list) => list.split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const [a, b] = s.split(/\s+as\s+/);
    return [a.trim(), (b ?? a).trim()];
  });
  for (const m of text.matchAll(/export\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    for (const [, out] of names(m[1])) exported.set(out, m[2]);
  }
  for (const m of text.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from\s*['"]([^'"]+)['"]/g)) local.set(m[1], m[2]);
  for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    for (const [, loc] of names(m[1])) local.set(loc, m[2]);
  }
  for (const m of text.matchAll(/import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s+from\s*['"]([^'"]+)['"]/g)) local.set(m[1], m[2]);
  for (const m of text.matchAll(/export\s*\{([^}]*)\}\s*(?!\s*from)(;|$)/gm)) {
    for (const [loc, out] of names(m[1])) if (local.has(loc)) exported.set(out, local.get(loc));
  }
  return exported;
}
const sources = new Map();
for (const b of ['bridge_core.js', 'bridge_data.js']) {
  for (const [name, path] of bridgeSources(p('src', 'ui', b))) sources.set(name, { bridge: b, path });
}
const { FEATURES } = await import(pathToFileURL(p('src', 'ui', 'features.js')).href);
for (const [feature, on] of Object.entries(FEATURES)) {
  if (on !== true) continue;
  const needs = NEEDS[feature];
  if (!needs) {
    row(`feature ${feature}: bridges real`, false, 'unknown feature (no needs listed in release_check.mjs)');
    continue;
  }
  if (needs.length === 0) {
    row(`feature ${feature}: bridges real`, true, 'needs no bridge export');
    continue;
  }
  for (const name of needs) {
    const src = sources.get(name);
    const ok = src !== undefined && !src.path.includes('stubs/') && !src.path.includes('fixtures/');
    row(`feature ${feature}: ${name} not from stubs/ or fixtures/`, ok, src ? `${src.bridge} -> ${src.path}` : 'not exported by either bridge');
  }
}

// Table.
const w = Math.max(...rows.map((r) => r.rule.length));
console.log(`${'Rule'.padEnd(w)}  Result  Detail`);
console.log(`${'-'.repeat(w)}  ------  ------`);
for (const r of rows) console.log(`${r.rule.padEnd(w)}  ${r.ok ? 'PASS  ' : 'FAIL  '}  ${r.detail}`);
const failed = rows.filter((r) => !r.ok).length;
console.log(`\n${rows.length - failed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
