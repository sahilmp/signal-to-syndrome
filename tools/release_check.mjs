// Release check for dist/qollab/ and src/ui/features.js (CLAUDE.md rule 3, team rules;
// DECISIONS D5, D9). Prints a pass/fail table and exits 1 if any row fails.

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { dirname, join, relative } from 'node:path';
import { validateBank } from '../src/core/bank.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const p = (...parts) => join(root, ...parts);
const rel = (f) => relative(root, f).replaceAll('\\', '/');

const MAX_BYTES = 1_900_000; // D5: main.js + index.html
const FORBIDDEN = ['fetch(', 'XMLHttpRequest', 'WebSocket', 'import('];
const ALLOWED_HOSTS = ['qollab.xyz', 'ionq.com', 'docs.ionq.com', 'arxiv.org', 'doi.org', 'github.com'];
const ATTRIBUTION = 'This effort is supported by Qollab & IonQ.';
// CC-B21 (U3 rows 29-31): levels 1-4 decode with the learned decoder, whose rates come from
// demForte1 (the classes of the bank of the same d, r and basis), and Levels 3-4 read their
// curves from stage2v2 / stage3v2 (the v2b and dense-grid files), not the v1 stage2 / stage3.
const NEEDS = {
  level1: ['decodeShot', 'runPoint', 'diagnostic', 'createFlatReadout', 'bankD3R1', 'bankD3R3', 'stage1', 'demForte1'],
  level2: ['decodeShot', 'runPoint', 'diagnostic', 'createFlatReadout', 'bankD3R1', 'bankD3R3', 'stage1', 'demForte1'],
  ion: ['createIonReadout', 'decodeShot', 'runPoint', 'bankD3R3', 'stage2v2', 'paramsIon', 'demForte1'],
  superconducting: ['createScReadout', 'findMinimum', 'decodeShot', 'runPoint', 'bankD3R3', 'stage3v2', 'paramsSc', 'demForte1'],
  level5: ['findMinimum', 'stage2', 'stage3', 'stage4', 'paramsIon', 'paramsSc', 'paramsCycle'],
  liveRun: [],
  // v2 flags (team checklist Appendix U3 rows 13-28, U7). buildGraph and decode are Person B's
  // own modules, imported from src/core directly, so they need no bridge line.
  hero: ['findMinimum', 'stage2v2', 'stage3v2'],
  uxV2: ['stage1v2', 'stage2v2', 'stage3v2', 'demForte1'],
  // holdout: the held-out test and the reversal (step 3); stage2v2: the reversal's in-sample fallback.
  learnNoise: ['demForte1', 'holdout', 'stage2v2'],
  // stage4x: Level 5 v2 in the phase-flip memory (B49, U7.9); bankXD3R3: Level 3's phase-flip
  // batch (A53 review item 14), decoded with demForte1's X-basis rates.
  phaseFlip: ['stage1x', 'stage2x', 'stage3x', 'stage4x', 'bankXD3R3', 'demForte1'],
  crosstalk: ['stage2v2', 'paramsIonV2'],
  level5v2: ['findMinimum', 'stage2v2', 'stage3v2', 'stage4v2', 'paramsIonV2', 'paramsScV2', 'paramsCycleV2'],
  sandbox: ['demForte1'],
  tour: ['stage2v2', 'stage3v2', 'demForte1', 'stage4v2'],
  curated: ['curatedShots'],
  // hero3_text.js reads stage4v2 (budgetAtOptimum, F1); stage4x is covered by phaseFlip.
  heroV3: ['findMinimum', 'stage2v2', 'stage3v2', 'stage4v2'],
  // UX2: findings.js reads stage4v2 (finding F1, budgetAtOptimum) and stage3v2 (optima.tauLog);
  // compactText only moves text, but Level 5's short F1 line reads stage4v2.
  findingsStrip: ['stage3v2', 'stage4v2'],
  compactText: ['stage4v2'],
  // P5: the write-up level reads data/writeup/project_page.json (not a results file); the
  // pipeline map reads no data.
  writeup: ['writeupData'],
  pipelineNav: [],
};
// Results files the bridges may point at (data/results, Person A's data; CC-B21 item 7). Each
// bridge export under data/results/ must be one of these, exist, and carry schema s2s-results/1.
// The 2.1 files: stage2_ion_v2b.json and stage2_ion_x_v2b.json (U3 row 29), the dense-grid
// superconducting files (row 29 deviation agreed with Person A) and holdout.json (row 30).
const RESULTS_FILES = [
  'stage1_flat.json', 'stage1_flat_x.json',
  'stage2_ion.json', 'stage2_ion_x.json', 'stage2_ion_v2b.json', 'stage2_ion_x_v2b.json',
  'stage3_sc.json', 'stage3_sc_x.json', 'stage3_sc_dense.json', 'stage3_sc_x_dense.json',
  'stage4_comparison.json', 'stage4_comparison_x.json', 'dem_forte1.json', 'holdout.json',
];
// Visible text (team checklist U7.3): forbidden in the built index.html and in every string
// literal of src/ui rendered as text, except inside the Diagnostics panel (src/ui/diag.js and
// the <details class="diagnostics"> block). Enforced (FAIL) once the text cut is on (uxV2);
// before that each hit is reported as WARN so the check stays green with every v2 flag off.
const FORBIDDEN_TEXT = ['belief model', 'bank shot', 'layer r', 'CC-', 'Person A', 'Person B', 'stub', 'fixture'];
// Not rendered: stubs, bridges and flags are code; diag.js is the Diagnostics panel.
const TEXT_SKIP = new Set(['features.js', 'bridge_core.js', 'bridge_data.js', 'diag.js']);

const rows = [];
// warn: reported but not failing (only the visible-text rows while uxV2 is off).
const row = (rule, ok, detail = '', warn = false) => rows.push({ rule, ok, detail, warn });
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
const unlisted = Object.keys(FEATURES).filter((f) => !(f in NEEDS));
row('every feature flag lists its bridge needs', unlisted.length === 0, unlisted.length ? `no needs for ${unlisted.join(', ')}` : `${Object.keys(FEATURES).length} flags`);
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
// The v3 hero's text comes through bridge_hero3.js ("export * from", which bridgeSources does not
// parse): with heroV3 on, every module it names must be real, not a stub or fixture.
if (FEATURES.heroV3 === true) {
  const text = readFileSync(p('src', 'ui', 'bridge_hero3.js'), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const paths = [...text.matchAll(/\b(?:export|import)\b[^;]*?\bfrom\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const ok = paths.length > 0 && paths.every((x) => !x.includes('stubs/') && !x.includes('fixtures/'));
  row('feature heroV3: hero text bridge not from stubs/ or fixtures/', ok, paths.length ? paths.join(', ') : 'no module path found');
}

// Results files behind the bridges: known, present and in the results format.
for (const [name, { bridge, path }] of sources) {
  const m = /(?:^|\/)data\/results\/([^/]+)$/.exec(path);
  if (!m) continue;
  const file = p('data', 'results', m[1]);
  let schema = null;
  try {
    schema = JSON.parse(readFileSync(file, 'utf8')).schema ?? null;
  } catch {
    schema = null;
  }
  const known = RESULTS_FILES.includes(m[1]);
  row(`results file for ${name} known and valid`, known && schema === 's2s-results/1',
    `${bridge} -> data/results/${m[1]}${known ? '' : ' (not in RESULTS_FILES)'}${schema === 's2s-results/1' ? '' : `, schema ${schema ?? 'missing or unreadable'}`}`);
}

// P5: the write-up's copy of docs/project_page.md (tools/make_writeup.mjs) is current. Runs with
// the writeup flag on or off, since the copy is embedded in main.js either way.
{
  const md = p('docs', 'project_page.md');
  const copy = p('data', 'writeup', 'project_page.json');
  let stored = null;
  try {
    stored = JSON.parse(readFileSync(copy, 'utf8')).sha256 ?? null;
  } catch {
    stored = null;
  }
  const current = existsSync(md) ? createHash('sha256').update(readFileSync(md)).digest('hex') : null;
  row('writeup copy matches docs/project_page.md', stored !== null && stored === current,
    stored !== null && stored === current ? `sha256 ${current.slice(0, 12)}` : 'run node tools/make_writeup.mjs');
}

// 7. Live-run import line (CLAUDE.md rule 3): only with liveRun on, and then exactly as the
// first line of main.js. LIVE_MODULE must match tools/build.mjs ('live': top-level live.py, D11).
const LIVE_MODULE = 'live';
const LIVE_IMPORT = `import * as s2sLive from '${LIVE_MODULE}'; globalThis.s2sLive = s2sLive;`;
const mainJs = read(jsFile);
if (mainJs === null) {
  row('main.js: live-run import line matches FEATURES.liveRun', false, 'file missing');
} else if (FEATURES.liveRun === true) {
  const firstLine = mainJs.split(/\r?\n/, 1)[0];
  row('liveRun on: first line of main.js is the live-run import', firstLine === LIVE_IMPORT, firstLine === LIVE_IMPORT ? '' : `first line starts "${firstLine.slice(0, 80)}"`);
} else {
  // Look for the import itself: the bare word 'live' occurs throughout the bundle.
  row(`liveRun off: main.js does not import '${LIVE_MODULE}'`, !mainJs.includes(`from '${LIVE_MODULE}'`) && !mainJs.includes('s2sLive from'));
}

// 8. Visible text (U7.3). String literals come from a small JavaScript scanner: comments are
// skipped, template literals contribute their fixed text (with nested literals from ${...}
// scanned too), and import/export specifiers are left out. A literal counts as rendered text
// when it reads as prose: it has whitespace or a non-ASCII character, or starts with a capital
// followed by a lower-case letter. Identifiers, keys, selectors and paths ("fixture",
// "stub0000", "./stubs/x.js") do not, and are not checked.
const REGEX_BEFORE = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'yield', 'await', 'instanceof']);
function stringLiterals(src) {
  const out = [];
  let i = 0;
  let line = 1;
  let prev = ''; // last significant token: an identifier/keyword, a punctuator, or 'lit'
  let prevPrev = '';
  const stack = []; // brace depth of each open template ${ ... }
  const push = (t) => { prevPrev = prev; prev = t; };
  const isSpecifier = () => prev === 'from' || (prev === 'import' && prevPrev !== '.') || (prev === '(' && prevPrev === 'import');
  const readQuoted = (q) => {
    const start = line;
    let text = '';
    i++;
    while (i < src.length && src[i] !== q) {
      if (src[i] === '\\') { text += src[i + 1] ?? ''; i += 2; continue; }
      if (src[i] === '\n') line++;
      text += src[i++];
    }
    i++;
    return { line: start, text };
  };
  // Reads template text from i (just after ` or }) up to ` or ${; returns true at ${.
  const readTemplateChunk = (lit) => {
    while (i < src.length) {
      const c = src[i];
      if (c === '\\') { lit.text += src[i + 1] ?? ''; i += 2; continue; }
      if (c === '`') { i++; return false; }
      if (c === '$' && src[i + 1] === '{') { i += 2; lit.text += ' '; return true; }
      if (c === '\n') line++;
      lit.text += c;
      i++;
    }
    return false;
  };
  const templates = []; // open template literals, innermost last
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '\n') { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      for (let k = i; k < stop; k++) if (src[k] === '\n') line++;
      i = stop;
      continue;
    }
    if (c === '"' || c === "'") {
      const spec = isSpecifier();
      const lit = readQuoted(c);
      if (!spec) out.push(lit);
      push('lit');
      continue;
    }
    if (c === '`') {
      i++;
      const lit = { line, text: '' };
      templates.push(lit);
      if (readTemplateChunk(lit)) { stack.push(0); push('${'); } else { out.push(templates.pop()); push('lit'); }
      continue;
    }
    if (c === '{') { if (stack.length) stack[stack.length - 1]++; i++; push('{'); continue; }
    if (c === '}') {
      if (stack.length && stack[stack.length - 1] === 0) {
        stack.pop();
        i++;
        const lit = templates[templates.length - 1];
        if (readTemplateChunk(lit)) { stack.push(0); push('${'); } else { out.push(templates.pop()); push('lit'); }
        continue;
      }
      if (stack.length) stack[stack.length - 1]--;
      i++;
      push('}');
      continue;
    }
    if (c === '/') {
      const regex = prev === '' || REGEX_BEFORE.has(prev) || (!/^[\w$]+$/.test(prev) && ![')', ']', '}', 'lit'].includes(prev));
      if (regex) {
        i++;
        let inClass = false;
        while (i < src.length && (inClass || src[i] !== '/')) {
          if (src[i] === '\\') i++;
          else if (src[i] === '[') inClass = true;
          else if (src[i] === ']') inClass = false;
          i++;
        }
        i++;
        while (/[a-z]/i.test(src[i] ?? '')) i++;
        push('lit');
        continue;
      }
    }
    if (/[\w$]/.test(c)) {
      let j = i;
      while (j < src.length && /[\w$]/.test(src[j])) j++;
      push(src.slice(i, j));
      i = j;
      continue;
    }
    i++;
    push(c);
  }
  return out;
}
const isProse = (s) => /[A-Za-z]/.test(s) && (/\s/.test(s.trim()) || /[^\x00-\x7f]/.test(s) || /^\s*[A-Z][a-z]/.test(s));
const forbiddenIn = (s) => FORBIDDEN_TEXT.filter((w) => s.toLowerCase().includes(w.toLowerCase()));
const textHits = [];
if (html !== null) {
  const visible = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<details[^>]*class="[^"]*\bdiagnostics\b[^"]*"[\s\S]*?<\/details>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  for (const [k, l] of visible.split('\n').entries()) {
    const words = forbiddenIn(l);
    if (words.length) textHits.push({ file: rel(htmlFile), line: k + 1, words, text: l.trim() });
  }
}
const uiFiles = readdirSync(p('src', 'ui')).filter((f) => f.endsWith('.js') && !TEXT_SKIP.has(f)).sort();
for (const f of uiFiles) {
  for (const lit of stringLiterals(readFileSync(p('src', 'ui', f), 'utf8'))) {
    if (!isProse(lit.text)) continue;
    const words = forbiddenIn(lit.text);
    if (words.length) textHits.push({ file: `src/ui/${f}`, line: lit.line, words, text: lit.text.replace(/\s+/g, ' ').trim() });
  }
}
const enforceText = FEATURES.uxV2 === true;
const scanned = `${rel(htmlFile)} and ${uiFiles.length} src/ui files`;
if (textHits.length === 0) {
  row('visible text has no forbidden words (U7.3)', true, scanned);
} else {
  row(`visible text has no forbidden words (U7.3)${enforceText ? '' : ', enforced when uxV2 is on'}`, !enforceText,
    `${textHits.length} hit(s) in ${scanned}`, !enforceText);
  for (const h of textHits) {
    const shown = h.text.length > 100 ? `${h.text.slice(0, 97)}...` : h.text;
    row(`  ${h.file}:${h.line} contains ${h.words.map((x) => `"${x}"`).join(', ')}`, !enforceText, `"${shown}"`, !enforceText);
  }
}

// Table.
const w = Math.max(...rows.map((r) => r.rule.length));
console.log(`${'Rule'.padEnd(w)}  Result  Detail`);
console.log(`${'-'.repeat(w)}  ------  ------`);
for (const r of rows) console.log(`${r.rule.padEnd(w)}  ${r.warn ? 'WARN  ' : r.ok ? 'PASS  ' : 'FAIL  '}  ${r.detail}`);
const failed = rows.filter((r) => !r.ok).length;
const warned = rows.filter((r) => r.warn).length;
console.log(`\n${rows.length - failed - warned} passed, ${warned} warned, ${failed} failed.`);
if (FEATURES.liveRun === true) {
  const helper = existsSync(p('qollab', 'live.py')) ? 'qollab/live.py' : 'qollab/live.py (NOT FOUND in this repository)';
  console.log(`\nReminder: liveRun is on. Upload ${helper} to the main Qollab project as live.py at the top level (D11: no folders), together with the three files in dist/qollab/.`);
}
process.exit(failed === 0 ? 0 : 1);
