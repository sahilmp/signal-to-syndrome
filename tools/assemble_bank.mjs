// Assemble shot banks copied out of the Qollab console (DECISIONS D7).
//
//   node tools/assemble_bank.mjs <file or folder>... [--out <dir>]   (default data/banks)
//
// A folder argument means every .txt file in it. Every BEGIN_BANK ... END_BANK block is
// joined, checked against the sha256 on its BEGIN_BANK line, parsed, re-checked
// (shots, n_keys, counts sha256, s2s-bank/1 contract) and written to <out>/<name>.json.
// Nothing is written unless every block passes; any mismatch exits with status 1.
//
// Held-out banks (names ending _h<n>, V18, DECISIONS E11) are written to <out>/heldout/,
// never to <out>/ itself, so nothing that reads data/banks/*.json picks them up. Their raw
// console text belongs in data/raw/heldout/.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateBank } from '../src/core/bank.js';

const BEGIN = /^BEGIN_BANK\s+(\S+)\s+chunks=(\d+)\s+sha256=([0-9a-f]{64})$/;
const CHUNK = /^--- chunk (\d+)\/(\d+) ---$/;
const END = /^END_BANK\s+(\S+)$/;

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

// Same text as Python's json.dumps(counts, sort_keys=True, separators=(",", ":")).
export function canonicalCounts(counts) {
  const keys = Object.keys(counts).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${counts[k]}`).join(',')}}`;
}

export function countsSha256(counts) {
  return sha256(canonicalCounts(counts));
}

// Splits text into blocks { name, nChunks, sha256, json } and checks chunk count and order.
// Windows line endings, trailing spaces and blank lines are tolerated.
export function parseBlocks(text, source = 'input') {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+$/, ''));
  const blocks = [];
  let cur = null;
  let expectChunkBody = false;
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    const where = `${source}:${n + 1}`;
    if (line === '') continue;
    if (!cur) {
      const b = line.match(BEGIN);
      if (b) {
        cur = { name: b[1], nChunks: Number(b[2]), sha256: b[3], chunks: [], where };
      } else if (line.startsWith('BEGIN_BANK')) {
        throw new Error(`${where}: malformed BEGIN_BANK line: ${line}`);
      }
      continue; // anything outside a block (other console output) is ignored
    }
    if (expectChunkBody) {
      cur.chunks[cur.chunks.length - 1].body = line;
      expectChunkBody = false;
      continue;
    }
    const c = line.match(CHUNK);
    if (c) {
      const i = Number(c[1]);
      const total = Number(c[2]);
      if (total !== cur.nChunks) throw new Error(`${where}: bank ${cur.name}: chunk header says ${total} chunks, BEGIN_BANK says ${cur.nChunks}`);
      if (i !== cur.chunks.length + 1) throw new Error(`${where}: bank ${cur.name}: expected chunk ${cur.chunks.length + 1}, found chunk ${i} (missing or out of order)`);
      cur.chunks.push({ i, body: null });
      expectChunkBody = true;
      continue;
    }
    const e = line.match(END);
    if (e) {
      if (e[1] !== cur.name) throw new Error(`${where}: END_BANK ${e[1]} closes BEGIN_BANK ${cur.name}`);
      if (cur.chunks.length !== cur.nChunks) throw new Error(`${where}: bank ${cur.name}: found ${cur.chunks.length} of ${cur.nChunks} chunks`);
      if (cur.chunks.some((ch) => ch.body === null)) throw new Error(`${where}: bank ${cur.name}: a chunk header has no content line`);
      blocks.push({ name: cur.name, nChunks: cur.nChunks, sha256: cur.sha256, json: cur.chunks.map((ch) => ch.body).join('') });
      cur = null;
      continue;
    }
    if (line.startsWith('BEGIN_BANK')) throw new Error(`${where}: BEGIN_BANK inside bank ${cur.name} (missing END_BANK)`);
    throw new Error(`${where}: bank ${cur.name}: unexpected line inside block: ${line.slice(0, 60)}`);
  }
  if (cur) throw new Error(`${cur.where}: bank ${cur.name}: no END_BANK line`);
  return blocks;
}

const HELDOUT = /^(rep_d\d+_r\d+_L[01])_h([1-9]\d*)$/;

// Splits a bank name into its base name and held-out index (null for an ordinary bank):
// rep_d5_r3_L0_h2 -> { base: 'rep_d5_r3_L0', heldout: 2 }. Only rep_ names take the suffix.
export function parseHeldout(name) {
  const h = HELDOUT.exec(name);
  return h ? { base: h[1], heldout: Number(h[2]) } : { base: name, heldout: null };
}

// Output file of a bank: held-out banks go to <outDir>/heldout/<name>.json.
export function bankPath(outDir, name) {
  const sub = parseHeldout(name).heldout === null ? [] : ['heldout'];
  return join(outDir, ...sub, `${name}.json`);
}

// The block name becomes the file name, so it must describe the bank inside it:
// rep_d{d}_r{r}_L{logical} or repx_d{d}_r{r}_L{logical} (basis X), or v4_d{d}_r{r}_i{i}_k{k}
// or v13_d{d}_r{r}_i{i}_k{k} (basis X) with logical 0 and inject [[i, k]] (the names of
// qollab/bank_generator.py). A rep_ name may end in _h<n> (held-out bank) and is checked as
// its base name. A bank without a basis field is basis Z. A mislabelled paste would
// otherwise be written under the wrong name.
function checkName(fullName, bank) {
  const name = parseHeldout(fullName).base;
  const mem = /^(rep|repx)_d(\d+)_r(\d+)_L([01])$/.exec(name);
  const inj = /^(v4|v13)_d(\d+)_r(\d+)_i(\d+)_k(\d+)$/.exec(name);
  if (!mem && !inj) throw new Error(`bank ${fullName}: name is neither rep(x)_d<d>_r<r>_L<0|1>[_h<n>] nor v4_ / v13_d<d>_r<r>_i<i>_k<k>`);
  const match = mem ?? inj;
  const prefix = match[1];
  const d = Number(match[2]);
  const r = Number(match[3]);
  const logical = mem ? Number(mem[4]) : 0;
  const basis = prefix === 'repx' || prefix === 'v13' ? 'X' : 'Z';
  const bankBasis = bank.basis ?? 'Z';
  const mismatch = [];
  if (bank.d !== d) mismatch.push(`d ${bank.d} (name says ${d})`);
  if (bank.r !== r) mismatch.push(`r ${bank.r} (name says ${r})`);
  if (bank.logical !== logical) mismatch.push(`logical ${bank.logical} (name says ${logical})`);
  if (bankBasis !== basis) mismatch.push(`basis ${bankBasis} (name says ${basis})`);
  if (inj) {
    const site = JSON.stringify([[Number(inj[4]), Number(inj[5])]]);
    if (JSON.stringify(bank.inject) !== site) mismatch.push(`inject ${JSON.stringify(bank.inject)} (name says ${site})`);
  }
  if (mismatch.length) throw new Error(`bank ${fullName}: the bank inside does not match its name: ${mismatch.join(', ')}`);
}

// Verifies one block and returns the parsed bank object.
export function verifyBlock(block) {
  const { name } = block;
  const got = sha256(block.json);
  if (got !== block.sha256) throw new Error(`bank ${name}: sha256 mismatch (BEGIN_BANK says ${block.sha256}, joined text gives ${got}); recopy it from the console`);
  let bank;
  try {
    bank = JSON.parse(block.json);
  } catch (err) {
    throw new Error(`bank ${name}: JSON does not parse: ${err.message}`);
  }
  const total = Object.values(bank.counts ?? {}).reduce((s, c) => s + c, 0);
  const ck = bank.checksum ?? {};
  if (ck.total_shots !== total || bank.shots !== total) {
    throw new Error(`bank ${name}: shots mismatch (checksum.total_shots ${ck.total_shots}, sum of counts ${total}, shots ${bank.shots})`);
  }
  const nKeys = Object.keys(bank.counts).length;
  if (ck.n_keys !== nKeys) throw new Error(`bank ${name}: checksum.n_keys is ${ck.n_keys}, counts has ${nKeys} keys`);
  const countsSha = countsSha256(bank.counts);
  if (ck.sha256 !== countsSha) throw new Error(`bank ${name}: counts sha256 mismatch (checksum says ${ck.sha256}, counts give ${countsSha})`);
  try {
    validateBank(bank);
  } catch (err) {
    throw new Error(`bank ${name}: ${err.message}`);
  }
  checkName(name, bank);
  if ((name.startsWith('rep_') || name.startsWith('repx_')) && !(typeof bank.detector_rate === 'number' && bank.detector_rate > 0)) {
    throw new Error(`bank ${name}: detector_rate is ${bank.detector_rate ?? 'missing'}; the circuit was optimised away, do not use this bank`);
  }
  return bank;
}

// Parses and verifies every block in the given texts; returns [{ name, bank }].
export function assembleTexts(sources) {
  const out = [];
  const seen = new Set();
  for (const { text, source } of sources) {
    for (const block of parseBlocks(text, source)) {
      if (seen.has(block.name)) throw new Error(`bank ${block.name} appears more than once in the input`);
      seen.add(block.name);
      out.push({ name: block.name, bank: verifyBlock(block) });
    }
  }
  return out;
}

function inputFiles(args) {
  const files = [];
  for (const arg of args) {
    if (statSync(arg).isDirectory()) {
      for (const f of readdirSync(arg).sort()) if (f.toLowerCase().endsWith('.txt')) files.push(join(arg, f));
    } else {
      files.push(arg);
    }
  }
  return files;
}

export function main(argv) {
  let outDir = 'data/banks';
  const args = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') {
      outDir = argv[++i];
      if (!outDir) throw new Error('--out needs a directory');
    } else {
      args.push(argv[i]);
    }
  }
  if (args.length === 0) throw new Error('usage: node tools/assemble_bank.mjs <file or folder>... [--out <dir>]');
  const files = inputFiles(args);
  if (files.length === 0) throw new Error('no input files (a folder argument needs .txt files)');
  const banks = assembleTexts(files.map((f) => ({ text: readFileSync(f, 'utf8'), source: f })));
  if (banks.length === 0) throw new Error('no BEGIN_BANK ... END_BANK blocks found');
  for (const { name, bank } of banks) {
    const file = bankPath(outDir, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(bank, null, 2)}\n`);
    console.log(`${name}: shots ${bank.shots}, distinct keys ${Object.keys(bank.counts).length}, detector_rate ${bank.detector_rate}, sampler_seed ${bank.sampler_seed} -> ${file}`);
  }
  return banks;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(`assemble_bank: ${err.message}`);
    process.exit(1);
  }
}
