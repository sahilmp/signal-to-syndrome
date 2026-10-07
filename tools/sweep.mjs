// Sweeps of the logical error rate against readout settings.
//
//   node tools/sweep.mjs --stage 1   flat readout over epsilon; writes data/results/stage1_flat.json
//   node tools/sweep.mjs --diag      prints only the V9 fingerprint of data/banks/rep_d3_r3_L0.json
//
// Banks: every data/banks/rep_*.json (the v4_*.json validation banks are never read).
// pGate is calibrated per bank from its raw bits (readout off) with estimatePGate.

import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateBank, expandShots, split } from '../src/core/bank.js';
import { computeDetectors } from '../src/core/detectors.js';
import { estimatePGate } from '../src/core/calibrate.js';
import { wilson } from '../src/core/stats.js';
import { createRng } from '../src/core/rng.js';
import { createFlatReadout } from '../src/core/readout/flat.js';
import { runPoint, diagnostic } from '../src/core/sweep.js';

const BANK_DIR = 'data/banks';
const RESULTS_DIR = 'data/results';
const DIAG_BANK = 'rep_d3_r3_L0.json';
const EPS_GRID = [0, 0.005, 0.01, 0.02, 0.03, 0.05, 0.08, 0.12];
const STAGE1_D = [3, 5, 7];
const STAGE1_R = 3;
const V1_EPS = 0.05;
const V1_DRAWS = 200000;
const V1_SEED = 101;
// Seed of one sweep point: distinct for every (d, logical, epsilon index).
const seedFor = (d, logical, epsIndex) => 1000000 + 1000 * d + 100 * logical + epsIndex;

function loadBank(file) {
  const bank = JSON.parse(readFileSync(join(BANK_DIR, file), 'utf8'));
  validateBank(bank);
  return bank;
}

function loadRepBanks() {
  const files = readdirSync(BANK_DIR).filter((f) => /^rep_.*\.json$/.test(f)).sort();
  if (files.length === 0) throw new Error(`no rep_*.json banks in ${BANK_DIR}`);
  return files.map((file) => ({ file, bank: loadBank(file) }));
}

function calibrate(bank) {
  const det = expandShots(bank).map((bits) => {
    const { m, x } = split(bits, bank.layout, bank.d, bank.r);
    return computeDetectors(m, x, bank.d, bank.r);
  });
  return estimatePGate(det, bank.d, bank.r);
}

function gitCommit() {
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'unknown';
  } catch {
    return 'unknown';
  }
}

const fmt = (v, digits = 5) => v.toFixed(digits);
const round = (v) => Number(v.toPrecision(6));
const interval = (w) => `${fmt(w.p)} [${fmt(w.lo)}, ${fmt(w.hi)}]`;

function stage1() {
  const t0 = Date.now();
  const banks = loadRepBanks();

  // V5: bulk detector firing rate and the gate-noise floor per bank.
  console.log('V5: bulk detector firing rate (Wilson 95%) and calibrated pGate, readout off');
  const cal = new Map();
  for (const { file, bank } of banks) {
    const c = calibrate(bank);
    cal.set(file, c);
    const nTot = c.nDetectors * c.nShots;
    const w = wilson(Math.round(c.rate * nTot), nTot);
    console.log(`  ${file.padEnd(20)} d=${bank.d} r=${bank.r} L${bank.logical}  rate ${interval(w)}  pGate ${fmt(c.p, 6)}`);
  }

  // Banks used by the sweep: d = 3, 5, 7 at r = 3, both logical states.
  const byKey = new Map(banks.map((b) => [`${b.bank.d},${b.bank.r},${b.bank.logical}`, b]));
  const used = [];
  for (const d of STAGE1_D) {
    for (const logical of [0, 1]) {
      const b = byKey.get(`${d},${STAGE1_R},${logical}`);
      if (!b) throw new Error(`missing bank for d=${d}, r=${STAGE1_R}, logical=${logical}`);
      used.push(b);
    }
  }

  // Soft decoding must equal hard decoding for the flat model (same |llr| for every bit).
  {
    const { file, bank } = used[0];
    const epsIndex = EPS_GRID.indexOf(V1_EPS);
    const args = { bank, readout: createFlatReadout({ epsilon: V1_EPS }), pGate: cal.get(file).p, seed: seedFor(bank.d, bank.logical, epsIndex) };
    const hard = runPoint({ ...args, mode: 'hard' });
    const soft = runPoint({ ...args, mode: 'soft' });
    if (hard.k !== soft.k || hard.n !== soft.n) {
      throw new Error(`soft != hard for the flat model on ${file} at epsilon ${V1_EPS}: k ${soft.k} vs ${hard.k}`);
    }
    console.log(`\nCheck: soft == hard for flat readout on ${file} at epsilon ${V1_EPS} (k = ${hard.k} of ${hard.n})`);
  }

  // Sweep, hard mode. Per logical state for V6, pooled for the series.
  const series = [];
  const perLogical = [];
  const seeds = {};
  let nonExactTotal = 0;
  for (const d of STAGE1_D) {
    const pooled = { k: new Array(EPS_GRID.length).fill(0), n: new Array(EPS_GRID.length).fill(0) };
    for (const logical of [0, 1]) {
      const { file, bank } = byKey.get(`${d},${STAGE1_R},${logical}`);
      const pGate = cal.get(file).p;
      const row = { d, r: STAGE1_R, logical, bank: file, pGate: round(pGate), k: [], n: [], pL: [], lo: [], hi: [] };
      seeds[file] = [];
      EPS_GRID.forEach((epsilon, e) => {
        const seed = seedFor(d, logical, e);
        seeds[file].push(seed);
        const res = runPoint({ bank, readout: createFlatReadout({ epsilon }), mode: 'hard', pGate, seed });
        nonExactTotal += res.nonExact;
        row.k.push(res.k);
        row.n.push(res.n);
        row.pL.push(round(res.wilson.p));
        row.lo.push(round(res.wilson.lo));
        row.hi.push(round(res.wilson.hi));
        pooled.k[e] += res.k;
        pooled.n[e] += res.n;
      });
      perLogical.push(row);
    }
    const ws = pooled.k.map((k, e) => wilson(k, pooled.n[e]));
    series.push({
      d, r: STAGE1_R, mode: 'hard',
      pL: ws.map((w) => round(w.p)), lo: ws.map((w) => round(w.lo)), hi: ws.map((w) => round(w.hi)), n: pooled.n,
    });
  }

  // V1: flat flip rate at epsilon = 0.05.
  const flat = createFlatReadout({ epsilon: V1_EPS });
  const rng = createRng(V1_SEED);
  let flips = 0;
  for (let t = 0; t < V1_DRAWS; t++) flips += flat.measure(t & 1, rng).hard !== (t & 1) ? 1 : 0;
  const v1 = wilson(flips, V1_DRAWS);
  const v1Pass = Math.abs(v1.p - V1_EPS) <= 4 * Math.sqrt((V1_EPS * (1 - V1_EPS)) / V1_DRAWS);

  const diagHash = diagnostic(byKey.get(`3,3,0`).bank);
  const runtimeS = (Date.now() - t0) / 1000;

  const result = {
    schema: 's2s-results/1',
    stage: 1,
    platform: 'flat',
    x: { name: 'epsilon', values: EPS_GRID },
    series,
    params: { epsilon_grid: EPS_GRID, distances: STAGE1_D, r: STAGE1_R, mode: 'hard', logical_states: 'pooled (L0 + L1)', readout: 'createFlatReadout({ epsilon })' },
    validation: {
      V1: { epsilon: V1_EPS, draws: V1_DRAWS, seed: V1_SEED, flips, p: round(v1.p), lo: round(v1.lo), hi: round(v1.hi), pass: v1Pass },
      V5: banks.map(({ file, bank }) => {
        const c = cal.get(file);
        const nTot = c.nDetectors * c.nShots;
        const w = wilson(Math.round(c.rate * nTot), nTot);
        return { bank: file, d: bank.d, r: bank.r, logical: bank.logical, rate: round(c.rate), lo: round(w.lo), hi: round(w.hi), pGate: round(c.p) };
      }),
      V6: perLogical,
      softEqualsHard: { bank: used[0].file, epsilon: V1_EPS, pass: true },
      V9: { bank: DIAG_BANK, hash: diagHash },
    },
    provenance: {
      tool: 'tools/sweep.mjs --stage 1',
      commit: gitCommit(),
      date: new Date().toISOString(),
      node: process.version,
      banks: used.map((b) => b.file),
      bankJobIds: Object.fromEntries(used.map((b) => [b.file, b.bank.job_id ?? 'unknown'])),
      seeds,
      seedRule: 'seed = 1000000 + 1000*d + 100*logical + epsilonIndex',
      nonExact: nonExactTotal,
      runtime_s: runtimeS,
    },
  };
  mkdirSync(RESULTS_DIR, { recursive: true });
  const out = join(RESULTS_DIR, 'stage1_flat.json');
  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);

  console.log(`\nV1: flat flip rate at epsilon ${V1_EPS} (${V1_DRAWS} draws, seed ${V1_SEED}): ${interval(v1)} -> ${v1Pass ? 'PASS' : 'FAIL'} (|p - eps| <= 4 SE)`);
  console.log(`\nV6: logical error, L0 against L1 (hard, r = ${STAGE1_R}, Wilson 95%)`);
  for (const d of STAGE1_D) {
    const [l0, l1] = perLogical.filter((row) => row.d === d);
    console.log(`  d = ${d}`);
    EPS_GRID.forEach((epsilon, e) => {
      const w0 = { p: l0.pL[e], lo: l0.lo[e], hi: l0.hi[e] };
      const w1 = { p: l1.pL[e], lo: l1.lo[e], hi: l1.hi[e] };
      const overlap = w0.lo <= w1.hi && w1.lo <= w0.hi;
      console.log(`    eps ${String(epsilon).padEnd(6)} L0 ${interval(w0)}  L1 ${interval(w1)}  ${overlap ? 'overlap' : 'DIFFER'}`);
    });
  }
  console.log(`\nPooled series (L0 + L1), pL by epsilon ${JSON.stringify(EPS_GRID)}:`);
  for (const s of series) console.log(`  d = ${s.d}: ${s.pL.map((p) => fmt(p)).join('  ')}  (n = ${s.n[0]})`);
  console.log(`\nnon-exact matchings: ${nonExactTotal}`);
  console.log(`wrote ${out} (${runtimeS.toFixed(1)} s)`);
  console.log(`\nV9 diagnostic(${DIAG_BANK}): ${diagHash}`);
}

function diag() {
  console.log(diagnostic(loadBank(DIAG_BANK)));
}

const args = process.argv.slice(2);
if (args.includes('--diag')) {
  diag();
} else if (args[0] === '--stage' && args[1] === '1') {
  stage1();
} else {
  console.error('usage: node tools/sweep.mjs --stage 1 | --diag');
  process.exit(1);
}
