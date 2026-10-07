// Assemble shot banks copied out of the Qollab console (DECISIONS D7).
//
//   node tools/assemble_bank.mjs <file or folder>... [--out <dir>]   (default data/banks)
//
// A folder argument means every .txt file in it. Every BEGIN_BANK ... END_BANK block is
// joined, checked against the sha256 on its BEGIN_BANK line, parsed, re-checked
// (shots, n_keys, counts sha256, s2s-bank/1 contract) and written to <out>/<name>.json.
// Nothing is written unless every block passes; any mismatch exits with status 1.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
  if (name.startsWith('rep_') && !(typeof bank.detector_rate === 'number' && bank.detector_rate > 0)) {
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
  mkdirSync(outDir, { recursive: true });
  for (const { name, bank } of banks) {
    writeFileSync(join(outDir, `${name}.json`), `${JSON.stringify(bank, null, 2)}\n`);
    console.log(`${name}: shots ${bank.shots}, distinct keys ${Object.keys(bank.counts).length}, detector_rate ${bank.detector_rate}, sampler_seed ${bank.sampler_seed}`);
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
