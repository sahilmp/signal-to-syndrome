// Sweeps of the logical error rate against readout settings.
//
//   node tools/sweep.mjs --stage 1   flat readout over epsilon; writes data/results/stage1_flat.json
//   node tools/sweep.mjs --stage 2   trapped-ion readout over tau; writes data/results/stage2_ion.json
//   node tools/sweep.mjs --stage 3   superconducting readout over tau; writes data/results/stage3_sc.json
//   node tools/sweep.mjs --stage 4   platform comparison, break-even, sensitivity; writes data/results/stage4_comparison.json
//                                    (reads stage2_ion.json, stage3_sc.json and params/cycle.json, ion.json, sc.json)
//   node tools/sweep.mjs --stage dem learned edge rates, out-of-sample check (V12b) and naive
//                                    against learned decoding; writes data/results/dem_forte1.json
//   node tools/sweep.mjs --diag      prints only the V9 fingerprint of data/banks/rep_d3_r3_L0.json
//   node tools/sweep.mjs --diag --decoder learned   prints only the V9L fingerprint
//
// Options for --stage 1, 2, 3, 4:
//   --decoder naive | learned | both (default both): every series carries "decoder".
//   --basis Z | X (default Z): rep_*.json (Z) or repx_*.json (X) banks; X results go to *_x.json.
//
// Stages 2 and 3 also write "budget" (error sources per round, per qubit, at every tau) and
// Stage 2 writes "crosstalkScan" (the ion arm at several crosstalk rates); team checklist U4.
// Stage 1 with --basis X prints O4 (X/Z bulk detector-rate ratio) when the Z banks exist.
//
// Banks: data/banks/rep_*.json and repx_*.json (the v4_*.json validation banks are never read).
// Naive model: pGate calibrated per bank from its raw bits (readout off) with estimatePGate.
// Learned model: edge-class rates from ratesFromBanks of the L0 and L1 banks of the same
// (d, r, basis), pooled.

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBank, expandShots, split } from '../src/core/bank.js';
import { computeDetectors } from '../src/core/detectors.js';
import { estimatePGate } from '../src/core/calibrate.js';
import { estimateEdgeRates, ratesFromBanks } from '../src/core/dem.js';
import { wilson } from '../src/core/stats.js';
import { createRng } from '../src/core/rng.js';
import { createFlatReadout } from '../src/core/readout/flat.js';
import { createIonReadout } from '../src/core/readout/ion.js';
import { createScReadout } from '../src/core/readout/sc.js';
import { erfc } from '../src/core/special.js';
import { runPoint, diagnostic, decodeShot } from '../src/core/sweep.js';
import { findMinimum, minimumWithBootstrap } from '../src/core/optimum.js';
import { perRound, cycleTime, perMicrosecond, breakEvenDetail } from '../src/core/metrics.js';

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

const BANK_PREFIX = { Z: 'rep', X: 'repx' };

// Thrown for a run that cannot start (missing banks); printed without a stack trace.
class UsageError extends Error {}

// Memory banks of one basis: rep_*.json (Z) or repx_*.json (X). Every bank must carry the
// basis its file name says (absent means "Z").
function loadRepBanks(basis = 'Z') {
  const prefix = BANK_PREFIX[basis];
  const re = new RegExp(`^${prefix}_.*\\.json$`);
  const files = readdirSync(BANK_DIR).filter((f) => re.test(f)).sort();
  if (files.length === 0) {
    throw new UsageError(basis === 'X'
      ? `no repx_*.json banks in ${BANK_DIR}: the X-basis (phase-flip) banks have not been assembled yet (team checklist A43, A48)`
      : `no rep_*.json banks in ${BANK_DIR}`);
  }
  return files.map((file) => {
    const bank = loadBank(file);
    if ((bank.basis ?? 'Z') !== basis) throw new Error(`${file}: basis ${bank.basis ?? 'Z'}, expected ${basis} from the file name`);
    return { file, bank };
  });
}

function detectorArraysOf(bank) {
  return expandShots(bank).map((bits) => {
    const { m, x } = split(bits, bank.layout, bank.d, bank.r);
    return computeDetectors(m, x, bank.d, bank.r);
  });
}

function calibrate(bank) {
  return estimatePGate(detectorArraysOf(bank), bank.d, bank.r);
}

// Learned edge-class rates of (d, r), L0 and L1 banks pooled (byKey: "d,r,logical" -> { bank }).
function pooledRates(byKey, d, r) {
  const banks = [0, 1].map((logical) => byKey.get(`${d},${r},${logical}`)).filter(Boolean).map((b) => b.bank);
  if (banks.length === 0) throw new Error(`no banks for learned rates at d=${d}, r=${r}`);
  return ratesFromBanks(banks).classes;
}

// Noise argument of decodeShot / runPoint for one decoder.
function noiseFor(decoder, pGate, rates) {
  return decoder === 'naive' ? { model: 'naive', pGate } : { model: 'learned', rates };
}

const decoderArg = (decoders) => (decoders.length === 2 ? 'both' : decoders[0]);
const keyOf = (decoder, d, mode) => `${decoder},${d},${mode}`;

// F2 of stages 2 and 3: per bank, R readout draws per quantum shot. Hard and soft share the
// draws, and so do the two decoders (the same seeds: common random numbers). Returns the
// pooled series (one per decoder, d, mode, in that nesting order), per-logical rows, per-shot
// mean errors (key decoder,d,mode -> per grid point Float64Array over pooled quantum shots),
// seeds, the banks used and the number of non-exact matchings.
function f2Sweep({ distances, byKey, r, taus, readouts, modes, decoders, seedOf, cal, rates, basis, draws = READOUT_DRAWS }) {
  const perShot = new Map();
  const series = [];
  const perLogical = [];
  const seeds = {};
  const used = [];
  let nonExact = 0;
  for (const decoder of decoders) {
    for (const d of distances) {
      const nShots = [0, 1].map((logical) => expandShots(byKey.get(`${d},${r},${logical}`).bank).length);
      const nPooled = nShots[0] + nShots[1];
      for (const mode of modes) perShot.set(keyOf(decoder, d, mode), taus.map(() => new Float64Array(nPooled)));
      for (const logical of [0, 1]) {
        const { file, bank } = byKey.get(`${d},${r},${logical}`);
        const first = decoder === decoders[0];
        if (first) {
          used.push(file);
          seeds[file] = [];
        }
        if (!cal.has(file)) cal.set(file, calibrate(bank));
        const noise = noiseFor(decoder, cal.get(file).p, rates.get(d));
        const shots = expandShots(bank);
        const offset = logical === 0 ? 0 : nShots[0];
        const rows = Object.fromEntries(modes.map((mode) => {
          const row = { d, r, logical, mode, decoder, bank: file, k: [], n: [] };
          if (decoder === 'naive') row.pGate = round(noise.pGate);
          return [mode, row];
        }));
        taus.forEach((tau, t) => {
          const tauSeeds = [];
          for (const mode of modes) {
            const target = perShot.get(keyOf(decoder, d, mode))[t];
            let k = 0;
            for (let draw = 0; draw < draws; draw++) {
              const seed = seedOf(d, logical, t, draw);
              if (mode === modes[0]) tauSeeds.push(seed);
              const rng = createRng(seed);
              for (let s = 0; s < shots.length; s++) {
                const res = decodeShot({
                  shotBits: shots[s], layout: bank.layout, d, r: bank.r,
                  readout: readouts[t], mode, noise, basis, rng, logical: bank.logical,
                });
                if (!res.exact) nonExact++;
                if (res.logicalError) {
                  k++;
                  target[offset + s] += 1 / draws;
                }
              }
            }
            rows[mode].k.push(k);
            rows[mode].n.push(shots.length * draws);
          }
          if (first) seeds[file].push(tauSeeds);
        });
        for (const mode of modes) perLogical.push(rows[mode]);
      }
      for (const mode of modes) {
        const [l0, l1] = perLogical.filter((row) => row.d === d && row.mode === mode && row.decoder === decoder);
        const ws = taus.map((_, t) => wilson(l0.k[t] + l1.k[t], l0.n[t] + l1.n[t]));
        series.push({
          d, r, mode, decoder,
          pL: ws.map((w) => round(w.p)), lo: ws.map((w) => round(w.lo)), hi: ws.map((w) => round(w.hi)),
          n: taus.map((_, t) => l0.n[t] + l1.n[t]),
        });
      }
    }
  }
  return { perShot, series, perLogical, seeds, used, nonExact };
}

// tau*_log per decoder, distance and mode from the per-shot values, bootstrapped over pooled
// quantum shots. The bootstrap seed does not depend on the decoder (common random numbers).
function tauLogTable({ taus, distances, modes, decoders, perShot, bootSeed }) {
  const out = [];
  for (const decoder of decoders) {
    for (const d of distances) {
      for (const mode of modes) {
        const m = minimumWithBootstrap(taus, perShot.get(keyOf(decoder, d, mode)), BOOT_B, createRng(bootSeed + 10 * d + (mode === 'soft' ? 1 : 0)));
        out.push({ d, mode, decoder, xMin: round(m.xMin), lo: round(m.lo), hi: round(m.hi), atEdge: m.atEdge, yMin: round(m.yMin), fractionAtEdge: m.fractionAtEdge, fractionTied: m.fractionTied });
      }
    }
  }
  return out;
}

// C2 rows: soft at or below hard at every tau, per decoder (pooled counts).
function c2Table({ taus, distances, decoders, series }) {
  const c2 = [];
  for (const decoder of decoders) {
    for (const d of distances) {
      const hard = series.find((s) => s.d === d && s.mode === 'hard' && s.decoder === decoder);
      const soft = series.find((s) => s.d === d && s.mode === 'soft' && s.decoder === decoder);
      taus.forEach((tau, t) => {
        c2.push({ d, decoder, tau, hard: hard.pL[t], soft: soft.pL[t], softAtOrBelow: soft.pL[t] <= hard.pL[t], softAboveBeyondIntervals: soft.lo[t] > hard.hi[t] });
      });
    }
  }
  return c2;
}

function printF2Summary({ series, taus, tauLog, c2, r, xDigits }) {
  for (const s of series) console.log(`  ${s.decoder.padEnd(7)} d = ${s.d} ${s.mode.padEnd(4)}: ${s.pL.map((p) => fmt(p)).join(' ')}`);
  console.log(`  tau grid: ${taus.join(' ')}`);
  console.log(`\nC2: soft at or below hard (point estimates) at ${c2.filter((c) => c.softAtOrBelow).length} of ${c2.length} points; soft above hard beyond the intervals at ${c2.filter((c) => c.softAboveBeyondIntervals).length}`);
  for (const c of c2.filter((x) => !x.softAtOrBelow)) console.log(`  soft > hard: ${c.decoder}, d = ${c.d}, tau ${c.tau}: soft ${fmt(c.soft)} hard ${fmt(c.hard)}${c.softAboveBeyondIntervals ? ' (beyond intervals)' : ''}`);
  console.log(`\ntau*_log (bootstrap B = ${BOOT_B} over quantum shots, 95% percentile interval), r = ${r}:`);
  for (const m of tauLog) {
    const where = m.atEdge ? `no interior minimum (lowest at tau ${m.xMin})` : `${fmt(m.xMin, xDigits)} us [${fmt(m.lo, xDigits)}, ${fmt(m.hi, xDigits)}]`;
    console.log(`  ${m.decoder.padEnd(7)} d = ${m.d} ${m.mode.padEnd(4)}: ${where}, pL ${fmt(m.yMin)}, replicates at edge ${(100 * m.fractionAtEdge).toFixed(1)}%, tied ${(100 * m.fractionTied).toFixed(1)}%`);
  }
}

function printBudget(budget, g) {
  console.log(`\nBudget: ${budget.label}; gate (mean of learned classes, d = 3, r = 3) ${g(budget.gate)}`);
  budget.tau_us.forEach((tau, t) => {
    console.log(`  tau ${String(tau).padStart(4)}  readout ${g(budget.readout[t])}  idle ${g(budget.idle[t])}  crosstalk ${g(budget.crosstalk[t])}`);
  });
}

// Learned rates as written to results: { d3_r3: { space, spaceBoundary, time, diag }, ... }.
function ratesRecord(rates, r) {
  return Object.fromEntries([...rates].map(([d, c]) => [`d${d}_r${r}`, Object.fromEntries(Object.entries(c).map(([k, v]) => [k, round(v)]))]));
}

const BUDGET_LABEL = 'error sources per round, per qubit (approximate)';
const GATE_CLASSES = ['space', 'spaceBoundary', 'time', 'diag'];

// Budget (U4) at every tau of the grid: readout = the empirical assignment error, idle and
// crosstalk = the parts of readout.idleBreakdown(basis), gate = mean of the four learned
// edge-class rates (one number). Each entry is a per-round, per-qubit probability.
export function errorBudget({ taus, readouts, empirical, basis, gateRates }) {
  if (readouts.length !== taus.length || empirical.length !== taus.length) {
    throw new Error(`errorBudget: ${taus.length} taus, ${readouts.length} readouts, ${empirical.length} empirical values`);
  }
  for (const c of GATE_CLASSES) {
    if (!Number.isFinite(gateRates?.[c])) throw new Error(`errorBudget: gateRates.${c} missing`);
  }
  const parts = readouts.map((ro) => ro.idleBreakdown(basis));
  return {
    label: BUDGET_LABEL,
    tau_us: [...taus],
    readout: [...empirical],
    idle: parts.map((p) => round(p.idle)),
    crosstalk: parts.map((p) => round(p.crosstalk)),
    gate: round(GATE_CLASSES.reduce((s, c) => s + gateRates[c], 0) / GATE_CLASSES.length),
    gateClasses: Object.fromEntries(GATE_CLASSES.map((c) => [c, round(gateRates[c])])),
  };
}

// Crosstalk scan rates: the scan grid plus the card value if it is not on the grid, ascending.
export function crosstalkScanRates(grid, cardRate) {
  const out = [...grid];
  if (Number.isFinite(cardRate) && !out.includes(cardRate)) out.push(cardRate);
  return out.sort((a, b) => a - b);
}

// C1, ion part, per scan entry: an interior tau*_log (not at the grid edge) below tau*_phys.
export const interiorBelowTauPhys = (tauLog, tauPhys) => !tauLog.atEdge && tauLog.xMin < tauPhys;

// O4: X/Z ratio of bulk detector firing rates from two estimatePGate results. Interval: delta
// method on ln ratio with binomial counts over detectors x shots (detectors in a shot are
// correlated, so the interval is too narrow; it is a guide, not a test).
function o4Ratio(calZ, calX) {
  const nz = calZ.nDetectors * calZ.nShots;
  const nx = calX.nDetectors * calX.nShots;
  const ratio = calX.rate / calZ.rate;
  const se = Math.sqrt((1 - calX.rate) / (calX.rate * nx) + (1 - calZ.rate) / (calZ.rate * nz));
  return { ratio: round(ratio), lo: round(ratio * Math.exp(-1.96 * se)), hi: round(ratio * Math.exp(1.96 * se)), rateZ: round(calZ.rate), rateX: round(calX.rate) };
}

const resultFile = (name, basis) => (basis === 'X' ? name.replace(/\.json$/, '_x.json') : name);

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

// V11: the learned decoder at epsilon = 0 against epsilon = 1e-9 (the naive decoder's
// tie-breaking spike at epsilon = 0 must be gone). Seed index EPS_GRID.length for 1e-9.
const V11_EPS = [0, 1e-9];

function stage1({ decoders, basis }) {
  const t0 = Date.now();
  const banks = loadRepBanks(basis);

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

  // O4 (X basis only): X/Z bulk detector-rate ratio per (d, r), L0 + L1 pooled, as in Stage dem.
  const o4 = [];
  if (basis === 'X') {
    let zBanks = [];
    try {
      zBanks = loadRepBanks('Z');
    } catch (e) {
      if (!(e instanceof UsageError)) throw e;
    }
    const pooledCal = (list, d, r) => {
      const sel = list.filter((b) => b.bank.d === d && b.bank.r === r);
      return sel.length ? estimatePGate(sel.flatMap((b) => detectorArraysOf(b.bank)), d, r) : null;
    };
    const drs = [...new Set(banks.map((b) => `${b.bank.d},${b.bank.r}`))].map((k) => k.split(',').map(Number)).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (const [d, r] of drs) {
      const cz = pooledCal(zBanks, d, r);
      if (cz) o4.push({ d, r, ...o4Ratio(cz, pooledCal(banks, d, r)) });
    }
    console.log('\nO4: X/Z bulk detector-rate ratio, L0 + L1 pooled (delta-method 95% interval, detectors treated as independent)');
    if (o4.length === 0) console.log('  no Z-basis banks to compare with');
    for (const o of o4) console.log(`  d = ${o.d} r = ${o.r}: ${o.ratio.toFixed(3)} [${o.lo.toFixed(3)}, ${o.hi.toFixed(3)}]  (Z ${fmt(o.rateZ)}, X ${fmt(o.rateX)})`);
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

  // Learned rates per distance (L0 + L1 pooled); computed only if the learned decoder runs.
  const rates = new Map();
  if (decoders.includes('learned')) for (const d of STAGE1_D) rates.set(d, pooledRates(byKey, d, STAGE1_R));
  const noiseOf = (decoder, file, d) => noiseFor(decoder, cal.get(file).p, rates.get(d));

  // Soft decoding must equal hard decoding for the flat model (same |llr| for every bit).
  for (const decoder of decoders) {
    const { file, bank } = used[0];
    const epsIndex = EPS_GRID.indexOf(V1_EPS);
    const args = { bank, readout: createFlatReadout({ epsilon: V1_EPS }), noise: noiseOf(decoder, file, bank.d), seed: seedFor(bank.d, bank.logical, epsIndex) };
    const hard = runPoint({ ...args, mode: 'hard' });
    const soft = runPoint({ ...args, mode: 'soft' });
    if (hard.k !== soft.k || hard.n !== soft.n) {
      throw new Error(`soft != hard for the flat model (${decoder}) on ${file} at epsilon ${V1_EPS}: k ${soft.k} vs ${hard.k}`);
    }
    console.log(`\nCheck: soft == hard for flat readout (${decoder}) on ${file} at epsilon ${V1_EPS} (k = ${hard.k} of ${hard.n})`);
  }

  // Sweep, hard mode. Per logical state for V6, pooled for the series. Both decoders use the
  // same seeds (common random numbers), so they see the same readout draws.
  const series = [];
  const perLogical = [];
  const seeds = {};
  let nonExactTotal = 0;
  for (const decoder of decoders) {
    for (const d of STAGE1_D) {
      const pooled = { k: new Array(EPS_GRID.length).fill(0), n: new Array(EPS_GRID.length).fill(0) };
      for (const logical of [0, 1]) {
        const { file, bank } = byKey.get(`${d},${STAGE1_R},${logical}`);
        const noise = noiseOf(decoder, file, d);
        const row = { d, r: STAGE1_R, logical, decoder, bank: file, k: [], n: [], pL: [], lo: [], hi: [] };
        if (decoder === 'naive') row.pGate = round(noise.pGate);
        seeds[file] = [];
        EPS_GRID.forEach((epsilon, e) => {
          const seed = seedFor(d, logical, e);
          seeds[file].push(seed);
          const res = runPoint({ bank, readout: createFlatReadout({ epsilon }), mode: 'hard', noise, seed });
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
        d, r: STAGE1_R, mode: 'hard', decoder,
        pL: ws.map((w) => round(w.p)), lo: ws.map((w) => round(w.lo)), hi: ws.map((w) => round(w.hi)), n: pooled.n,
      });
    }
  }

  // V11: learned decoder at epsilon = 0 and 1e-9, L0 + L1 pooled; PASS when the Wilson
  // intervals overlap. The naive decoder at the same points is printed for comparison.
  const v11 = [];
  if (decoders.includes('learned')) {
    for (const d of STAGE1_D) {
      const entry = { d, r: STAGE1_R, epsilon: V11_EPS };
      for (const decoder of ['learned', 'naive']) {
        entry[decoder] = V11_EPS.map((epsilon) => {
          let k = 0;
          let n = 0;
          for (const logical of [0, 1]) {
            const { file, bank } = byKey.get(`${d},${STAGE1_R},${logical}`);
            const e = epsilon === 0 ? EPS_GRID.indexOf(0) : EPS_GRID.length;
            const res = runPoint({ bank, readout: createFlatReadout({ epsilon }), mode: 'hard', noise: noiseOf(decoder, file, d), seed: seedFor(d, logical, e) });
            nonExactTotal += res.nonExact;
            k += res.k;
            n += res.n;
          }
          const w = wilson(k, n);
          return { k, n, pL: round(w.p), lo: round(w.lo), hi: round(w.hi) };
        });
      }
      const [a, b] = entry.learned;
      entry.pass = a.lo <= b.hi && b.lo <= a.hi;
      v11.push(entry);
    }
  }

  // V1: flat flip rate at epsilon = 0.05.
  const flat = createFlatReadout({ epsilon: V1_EPS });
  const rng = createRng(V1_SEED);
  let flips = 0;
  for (let t = 0; t < V1_DRAWS; t++) flips += flat.measure(t & 1, rng).hard !== (t & 1) ? 1 : 0;
  const v1 = wilson(flips, V1_DRAWS);
  const v1Pass = Math.abs(v1.p - V1_EPS) <= 4 * Math.sqrt((V1_EPS * (1 - V1_EPS)) / V1_DRAWS);

  // V9 and V9L are defined on the Z-basis bank rep_d3_r3_L0 only.
  const diagBank = basis === 'Z' ? byKey.get('3,3,0').bank : null;
  const diagHash = diagBank ? diagnostic(diagBank) : null;
  const diagHashL = diagBank ? diagnostic(diagBank, { decoder: 'learned' }) : null;
  const runtimeS = (Date.now() - t0) / 1000;

  const result = {
    schema: 's2s-results/1',
    stage: 1,
    platform: 'flat',
    basis,
    x: { name: 'epsilon', values: EPS_GRID },
    series,
    params: {
      epsilon_grid: EPS_GRID, distances: STAGE1_D, r: STAGE1_R, mode: 'hard', decoders, basis,
      logical_states: 'pooled (L0 + L1)', readout: 'createFlatReadout({ epsilon })',
      noise: { naive: 'estimatePGate per bank, readout off', learned: 'ratesFromBanks(L0, L1) per (d, r, basis)' },
      learnedRates: ratesRecord(rates, STAGE1_R),
    },
    validation: {
      V1: { epsilon: V1_EPS, draws: V1_DRAWS, seed: V1_SEED, flips, p: round(v1.p), lo: round(v1.lo), hi: round(v1.hi), pass: v1Pass },
      V5: banks.map(({ file, bank }) => {
        const c = cal.get(file);
        const nTot = c.nDetectors * c.nShots;
        const w = wilson(Math.round(c.rate * nTot), nTot);
        return { bank: file, d: bank.d, r: bank.r, logical: bank.logical, rate: round(c.rate), lo: round(w.lo), hi: round(w.hi), pGate: round(c.p) };
      }),
      V6: perLogical,
      softEqualsHard: { bank: used[0].file, epsilon: V1_EPS, decoders, pass: true },
      ...(v11.length ? { V11: { rows: v11, pass: v11.every((v) => v.pass) } } : {}),
      ...(o4.length ? { O4: { definition: 'bulk detector firing rate (estimatePGate rate, L0 + L1 pooled) X over Z; delta-method interval on ln ratio, detectors treated as independent', rows: o4 } } : {}),
      ...(diagBank ? { V9: { bank: DIAG_BANK, hash: diagHash }, V9L: { bank: DIAG_BANK, hash: diagHashL } } : {}),
    },
    provenance: {
      tool: `tools/sweep.mjs --stage 1 --decoder ${decoderArg(decoders)} --basis ${basis}`,
      commit: gitCommit(),
      date: new Date().toISOString(),
      node: process.version,
      banks: used.map((b) => b.file),
      bankJobIds: Object.fromEntries(used.map((b) => [b.file, b.bank.job_id ?? 'unknown'])),
      seeds,
      seedRule: 'seed = 1000000 + 1000*d + 100*logical + epsilonIndex (both decoders share it; V11 epsilon 1e-9 uses epsilonIndex 8)',
      nonExact: nonExactTotal,
      runtime_s: runtimeS,
    },
  };
  mkdirSync(RESULTS_DIR, { recursive: true });
  const out = join(RESULTS_DIR, resultFile('stage1_flat.json', basis));
  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);

  console.log(`\nV1: flat flip rate at epsilon ${V1_EPS} (${V1_DRAWS} draws, seed ${V1_SEED}): ${interval(v1)} -> ${v1Pass ? 'PASS' : 'FAIL'} (|p - eps| <= 4 SE)`);
  for (const decoder of decoders) {
    console.log(`\nV6 (${decoder}): logical error, L0 against L1 (hard, r = ${STAGE1_R}, basis ${basis}, Wilson 95%)`);
    for (const d of STAGE1_D) {
      const [l0, l1] = perLogical.filter((row) => row.d === d && row.decoder === decoder);
      console.log(`  d = ${d}`);
      EPS_GRID.forEach((epsilon, e) => {
        const w0 = { p: l0.pL[e], lo: l0.lo[e], hi: l0.hi[e] };
        const w1 = { p: l1.pL[e], lo: l1.lo[e], hi: l1.hi[e] };
        const overlap = w0.lo <= w1.hi && w1.lo <= w0.hi;
        console.log(`    eps ${String(epsilon).padEnd(6)} L0 ${interval(w0)}  L1 ${interval(w1)}  ${overlap ? 'overlap' : 'DIFFER'}`);
      });
    }
  }
  console.log(`\nPooled series (L0 + L1), pL by epsilon ${JSON.stringify(EPS_GRID)}:`);
  for (const s of series) console.log(`  ${s.decoder.padEnd(7)} d = ${s.d}: ${s.pL.map((p) => fmt(p)).join('  ')}  (n = ${s.n[0]})`);
  if (v11.length) {
    console.log('\nV11: learned decoder at epsilon = 0 against 1e-9 (L0 + L1 pooled, Wilson 95%; naive shown for comparison)');
    for (const v of v11) {
      const [l0, l9] = v.learned;
      const [n0, n9] = v.naive;
      console.log(`  d = ${v.d}: learned eps 0 ${interval({ p: l0.pL, lo: l0.lo, hi: l0.hi })}  eps 1e-9 ${interval({ p: l9.pL, lo: l9.lo, hi: l9.hi })}  ${v.pass ? 'PASS' : 'FAIL'}   (naive: ${fmt(n0.pL)} / ${fmt(n9.pL)})`);
    }
  }
  console.log(`\nnon-exact matchings: ${nonExactTotal}`);
  console.log(`wrote ${out} (${runtimeS.toFixed(1)} s)`);
  if (diagBank) {
    console.log(`\nV9 diagnostic(${DIAG_BANK}): ${diagHash}`);
    console.log(`V9L diagnostic(${DIAG_BANK}, learned): ${diagHashL}`);
  }
}

// ---- Stage 2: trapped-ion readout over the detection time tau ----

const ION_PARAMS = 'params/ion.json';
const STAGE2_D = [3, 5, 7]; // d = 7 only if its banks exist
const STAGE2_R = 3;
const STAGE2_MODES = ['hard', 'soft'];
const READOUT_DRAWS = 4; // R readout draws per quantum shot
const BOOT_B = 200;
const BOOT_SEED = 202;
const F1_SAMPLES = 200000;
const F1_SEED = 201;
const V10_BINS = [[0, 1], [1, 2], [2, 4], [4, 8]];
// Seed of one readout draw: distinct for every (d, logical, tau index, draw), and outside
// the Stage 1 range. Hard and soft use the same seed, so they see the same readout samples.
const seedFor2 = (d, logical, tauIndex, draw) => 2000000 + 10000 * d + 1000 * logical + 10 * tauIndex + draw;
// Crosstalk scan (Stage 2): rates per us if the card has no crosstalk_scan_per_us, distances,
// R and seeds (the same at every rate, outside the seedFor2 range).
const XT_RATES = [0, 1e-6, 1e-5, 1e-4, 1e-3];
const XT_DISTANCES = [3, 5];
const XT_DRAWS = 2;
const BOOT_SEED_XT = 2502;
const seedForXt = (d, logical, tauIndex, draw) => 2500000 + 10000 * d + 1000 * logical + 10 * tauIndex + draw;
const fieldValue = (card, name) => (card[name] !== null && typeof card[name] === 'object' ? card[name].value : card[name]);

// Poisson CDF P(N <= m; lambda) by direct summation (m is small here: it is at most nTh).
// lambda = 0 is a point mass at 0 (the general term would give 0 * log 0 = NaN).
function poisCdf(m, lambda) {
  if (lambda === 0) return m >= 0 ? 1 : 0;
  let s = 0;
  let lf = 0;
  for (let n = 0; n <= m; n++) {
    if (n > 1) lf += Math.log(n);
    s += Math.exp(n * Math.log(lambda) - lambda - lf);
  }
  return Math.min(1, s);
}

function stage2({ decoders, basis }) {
  const t0 = Date.now();
  const card = JSON.parse(readFileSync(ION_PARAMS, 'utf8'));
  const taus = fieldValue(card, 'tau_grid_us');
  const banks = loadRepBanks(basis);
  const byKey = new Map(banks.map((b) => [`${b.bank.d},${b.bank.r},${b.bank.logical}`, b]));
  const distances = STAGE2_D.filter((d) => byKey.has(`${d},${STAGE2_R},0`) && byKey.has(`${d},${STAGE2_R},1`));
  for (const d of [3, 5]) if (!distances.includes(d)) throw new Error(`missing banks for d=${d}, r=${STAGE2_R}`);
  const rates = new Map(decoders.includes('learned') ? distances.map((d) => [d, pooledRates(byKey, d, STAGE2_R)]) : []);
  const noPump = { ...card, gamma_bright_to_dark_per_us: 0, gamma_dark_to_bright_per_us: 0 };
  const readouts = taus.map((tau) => createIonReadout(card, tau));

  // F1-ion: belief (model) assignment error, empirical error from truth samples, and the
  // same samples' llr for V10. Equal priors: the sampled bit alternates 0, 1, 0, ...
  const assignment = { belief: [], empirical: [], lo: [], hi: [] };
  const f1Detail = [];
  const v10 = V10_BINS.map(() => ({ m: 0, wrong: 0, qSum: 0 }));
  const v7 = [];
  const rngF1 = createRng(F1_SEED);
  taus.forEach((tau, t) => {
    const ro = readouts[t];
    let errors = 0;
    for (let s = 0; s < F1_SAMPLES; s++) {
      const bit = s & 1;
      const { hard, llr } = ro.measure(bit, rngF1);
      if (hard !== bit) errors++;
      const a = Math.abs(llr);
      const bin = V10_BINS.findIndex(([lo, hi]) => a >= lo && a < hi);
      if (bin >= 0) {
        const c = v10[bin];
        c.m++;
        c.qSum += 1 / (1 + Math.exp(a));
        if ((llr > 0 ? 1 : 0) !== bit) c.wrong++;
      }
    }
    const belief = ro.averageAssignmentError();
    const w = wilson(errors, F1_SAMPLES);
    const se = Math.sqrt((belief * (1 - belief)) / F1_SAMPLES);
    assignment.belief.push(round(belief));
    assignment.empirical.push(round(w.p));
    assignment.lo.push(round(w.lo));
    assignment.hi.push(round(w.hi));
    f1Detail.push({
      tau, nTh: ro.threshold(), idleFlip: round(ro.idleFlipProbability(basis)),
      beliefNoPumping: round(createIonReadout(noPump, tau).averageAssignmentError()),
      errors, agree4SE: Math.abs(w.p - belief) <= 4 * se + 1e-12,
    });

    // V7: both gammas 0; empirical error against the analytic Poisson tail sums at nTh,
    // 0.5 [P(Pois(Rb tau) <= nTh) + P(Pois(Rd tau) > nTh)], within 4 binomial SE.
    const ro0 = createIonReadout(noPump, tau);
    const nTh = ro0.threshold();
    const bright = fieldValue(card, 'bright_is_bit');
    const analytic = 0.5 * (poisCdf(nTh, fieldValue(card, 'R_bright_per_us') * tau)
      + (1 - poisCdf(nTh, fieldValue(card, 'R_dark_per_us') * tau)));
    const rng7 = createRng(F1_SEED + 1000 + t);
    let e7 = 0;
    for (let s = 0; s < F1_SAMPLES; s++) {
      const bit = s & 1;
      if (ro0.measure(bit, rng7).hard !== bit) e7++;
    }
    const se7 = Math.sqrt((analytic * (1 - analytic)) / F1_SAMPLES);
    v7.push({
      tau, nTh, brightBit: bright, analytic: round(analytic), belief: round(ro0.averageAssignmentError()),
      empirical: round(e7 / F1_SAMPLES), errors: e7,
      pass: Math.abs(e7 / F1_SAMPLES - analytic) <= 4 * se7 + 1e-12,
    });
  });
  const v10Rows = V10_BINS.map(([lo, hi], b) => {
    const { m, wrong, qSum } = v10[b];
    if (m === 0) return { bin: [lo, hi], m, observed: null, predicted: null, pass: null };
    const q = qSum / m;
    const se = Math.sqrt((q * (1 - q)) / m);
    return { bin: [lo, hi], m, wrong, observed: round(wrong / m), predicted: round(q), pass: Math.abs(wrong / m - q) <= 4 * se };
  });

  // F2-ion: per bank, R readout draws per quantum shot; hard and soft share the draws.
  const cal = new Map();
  const { perShot, series, perLogical, seeds, used, nonExact: nonExactTotal } = f2Sweep({
    distances, byKey, r: STAGE2_R, taus, readouts, modes: STAGE2_MODES, decoders, seedOf: seedFor2, cal, rates, basis,
  });

  // Optima. tau*_phys from the belief curve; tau*_log per decoder, distance and mode from the
  // per-shot values, bootstrapped over pooled quantum shots.
  const tauPhys = findMinimum(taus, assignment.belief, { logX: true });
  const tauPhysNoPump = findMinimum(taus, f1Detail.map((f) => f.beliefNoPumping), { logX: true });
  const tauLog = tauLogTable({ taus, distances, modes: STAGE2_MODES, decoders, perShot, bootSeed: BOOT_SEED });

  // C2: soft at or below hard at every tau (pooled counts; intervals overlap = not resolved).
  const c2 = c2Table({ taus, distances, decoders, series });
  const tauPhysEmp = findMinimum(taus, assignment.empirical, { logX: true });

  // Budget: gate part from the learned rates of the d = 3, r = 3 banks of this basis.
  const budget = errorBudget({ taus, readouts, empirical: assignment.empirical, basis, gateRates: pooledRates(byKey, 3, STAGE2_R) });

  // Crosstalk scan: learned decoder, d = 3 and 5, R = XT_DRAWS, at every scan rate. Every
  // rate uses the same seeds (common random numbers), so curves differ only by the rate.
  const tXt = Date.now();
  const xtRates = crosstalkScanRates(fieldValue(card, 'crosstalk_scan_per_us') ?? XT_RATES, fieldValue(card, 'crosstalk_rate_per_us'));
  const xtLearned = new Map(XT_DISTANCES.map((d) => [d, pooledRates(byKey, d, STAGE2_R)]));
  const xtEntries = [];
  let xtNonExact = 0;
  for (const rate of xtRates) {
    const xtReadouts = taus.map((tau) => createIonReadout(card, tau, { crosstalkRate: rate }));
    const sw = f2Sweep({
      distances: XT_DISTANCES, byKey, r: STAGE2_R, taus, readouts: xtReadouts, modes: STAGE2_MODES, decoders: ['learned'],
      seedOf: seedForXt, cal, rates: xtLearned, basis, draws: XT_DRAWS,
    });
    xtNonExact += sw.nonExact;
    const tl = tauLogTable({ taus, distances: XT_DISTANCES, modes: STAGE2_MODES, decoders: ['learned'], perShot: sw.perShot, bootSeed: BOOT_SEED_XT });
    for (const s of sw.series) {
      const m = tl.find((x) => x.d === s.d && x.mode === s.mode);
      const tauLogXt = { xMin: m.xMin, lo: m.lo, hi: m.hi, atEdge: m.atEdge, fractionAtEdge: m.fractionAtEdge, fractionTied: m.fractionTied };
      xtEntries.push({
        rate, d: s.d, mode: s.mode, decoder: 'learned', pL: s.pL, lo: s.lo, hi: s.hi, n: s.n,
        idleCrosstalk: xtReadouts.map((ro) => round(ro.idleBreakdown(basis).crosstalk)),
        tauLog: tauLogXt,
        interiorBelowTauPhys: interiorBelowTauPhys(tauLogXt, tauPhys.xMin),
        interiorBelowTauPhysResolved: !tauLogXt.atEdge && tauLogXt.hi < tauPhys.xMin,
      });
    }
  }
  const crosstalkScan = {
    rates_per_us: xtRates,
    cardRate_per_us: fieldValue(card, 'crosstalk_rate_per_us'),
    tauPhys: round(tauPhys.xMin),
    distances: XT_DISTANCES, modes: STAGE2_MODES, decoder: 'learned', readoutDrawsPerShot: XT_DRAWS, bootstrapB: BOOT_B,
    seedRule: 'seed = 2500000 + 10000*d + 1000*logical + 10*tauIndex + draw (the same at every rate; hard and soft share it); bootstrap seed 2502 + 10*d + (soft ? 1 : 0)',
    entries: xtEntries,
    perRate: xtRates.map((rate) => ({ rate, interiorBelowTauPhys: xtEntries.some((e) => e.rate === rate && e.interiorBelowTauPhys) })),
    nonExact: xtNonExact,
    runtime_s: (Date.now() - tXt) / 1000,
  };

  // The per-shot values stay in memory (about 2 MB as JSON); the seeds below reproduce them.
  const runtimeS = (Date.now() - t0) / 1000;
  const result = {
    schema: 's2s-results/1',
    stage: 2,
    platform: 'trapped-ion',
    basis,
    x: { name: 'tau_us', values: taus },
    series,
    assignment,
    budget,
    crosstalkScan,
    optima: {
      tauPhys: { xMin: round(tauPhys.xMin), atEdge: tauPhys.atEdge },
      tauPhysEmpirical: { xMin: round(tauPhysEmp.xMin), atEdge: tauPhysEmp.atEdge },
      tauLog: tauLog.map(({ d, mode, decoder, xMin, lo, hi, atEdge, fractionAtEdge, fractionTied }) => ({ d, mode, decoder, xMin, lo, hi, atEdge, fractionAtEdge, fractionTied })),
    },
    params: {
      card,
      distances, r: STAGE2_R, modes: STAGE2_MODES, decoders, basis, logical_states: 'pooled (L0 + L1)',
      readoutDrawsPerShot: READOUT_DRAWS, bootstrapB: BOOT_B, f1Samples: F1_SAMPLES,
      readout: 'createIonReadout(card, tau)', pGate: 'estimatePGate per bank, readout off',
      learned: 'ratesFromBanks(L0, L1) per (d, r, basis)',
      learnedRates: ratesRecord(rates, STAGE2_R),
    },
    readout: {
      nTh: f1Detail.map((f) => f.nTh),
      idleFlip: f1Detail.map((f) => f.idleFlip),
      beliefNoPumping: f1Detail.map((f) => f.beliefNoPumping),
      tauPhysNoPumping: { xMin: round(tauPhysNoPump.xMin), atEdge: tauPhysNoPump.atEdge },
      tauPhysYMin: round(tauPhys.yMin),
      empiricalAgreesWithBelief4SE: f1Detail.map((f) => f.agree4SE),
    },
    validation: {
      V7: { gammas: 0, samples: F1_SAMPLES, rows: v7, pass: v7.every((v) => v.pass) },
      V10: { gammas: 'card values (belief equals truth)', samplesPerTau: F1_SAMPLES, rows: v10Rows, pass: v10Rows.every((v) => v.pass !== false) },
      C2: c2,
      perLogical: perLogical.map((row) => ({ ...row, pL: row.k.map((k, t) => round(k / row.n[t])) })),
    },
    provenance: {
      tool: `tools/sweep.mjs --stage 2 --decoder ${decoderArg(decoders)} --basis ${basis}`,
      commit: gitCommit(),
      date: new Date().toISOString(),
      node: process.version,
      params: ION_PARAMS,
      banks: used,
      bankJobIds: Object.fromEntries(used.map((f) => [f, byKey.get(`${f.match(/_d(\d+)_/)[1]},${STAGE2_R},${f.match(/_L(\d)/)[1]}`).bank.job_id ?? 'unknown'])),
      pGate: Object.fromEntries(used.map((f) => [f, round(cal.get(f).p)])),
      seeds,
      seedRule: 'seed = 2000000 + 10000*d + 1000*logical + 10*tauIndex + draw (hard and soft, and both decoders, share it); F1 seed 201; V7 seed 1201 + tauIndex; bootstrap seed 202 + 10*d + (soft ? 1 : 0)',
      nonExact: nonExactTotal,
      runtime_s: runtimeS,
    },
  };
  mkdirSync(RESULTS_DIR, { recursive: true });
  const out = join(RESULTS_DIR, resultFile('stage2_ion.json', basis));
  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);

  const g = (v) => v.toExponential(2);
  console.log(`V7: assignment error with both gammas 0, ${F1_SAMPLES} truth samples per tau, analytic Poisson tails at nTh (4 SE)`);
  for (const v of v7) console.log(`  tau ${String(v.tau).padStart(3)}  nTh ${v.nTh}  analytic ${g(v.analytic)}  empirical ${g(v.empirical)}  ${v.pass ? 'PASS' : 'FAIL'}`);
  console.log(`V7 overall: ${result.validation.V7.pass ? 'PASS' : 'FAIL'}`);
  console.log('\nV10: llr calibration, card values (belief equals truth), samples pooled over the tau grid');
  for (const v of v10Rows) {
    console.log(`  |llr| in [${v.bin[0]}, ${v.bin[1]}): m ${v.m}${v.m ? `  observed ${fmt(v.observed)}  predicted ${fmt(v.predicted)}  ${v.pass ? 'PASS' : 'FAIL'}` : '  (empty)'}`);
  }
  console.log(`V10 overall: ${result.validation.V10.pass ? 'PASS' : 'FAIL'}`);
  console.log('\nF1-ion: assignment error by tau (belief, empirical [Wilson 95%], belief without pumping)');
  taus.forEach((tau, t) => {
    const f = f1Detail[t];
    console.log(`  tau ${String(tau).padStart(3)}  nTh ${f.nTh}  belief ${g(assignment.belief[t])}  empirical ${g(assignment.empirical[t])} [${g(assignment.lo[t])}, ${g(assignment.hi[t])}]${f.agree4SE ? '' : ' (DIFFERS > 4 SE)'}  no pumping ${g(f.beliefNoPumping)}`);
  });
  const edge = (m) => (m.atEdge ? ` (no interior minimum: lowest at the grid ${m.xMin === taus[0] ? 'start' : 'end'})` : '');
  console.log(`tau*_phys = ${fmt(tauPhys.xMin, 2)} us, error ${g(tauPhys.yMin)}${edge(tauPhys)}`);
  console.log(`tau*_phys without pumping = ${fmt(tauPhysNoPump.xMin, 2)} us${edge(tauPhysNoPump)}`);
  console.log(`\nF2-ion: logical error by tau, r = ${STAGE2_R}, basis ${basis}, L0 + L1 pooled, R = ${READOUT_DRAWS} draws per shot (n = ${series[0].n[0]} per point)`);
  printF2Summary({ series, taus, tauLog, c2, r: STAGE2_R, xDigits: 2 });
  printBudget(budget, g);
  console.log(`\nCrosstalk scan (C1, ion part): learned decoder, d = ${XT_DISTANCES.join(', ')}, R = ${XT_DRAWS}, tau*_phys = ${fmt(tauPhys.xMin, 2)} us, card rate ${g(crosstalkScan.cardRate_per_us)} /us (${crosstalkScan.runtime_s.toFixed(1)} s)`);
  for (const rate of xtRates) {
    const es = xtEntries.filter((e) => e.rate === rate);
    const any = crosstalkScan.perRate.find((p) => p.rate === rate).interiorBelowTauPhys;
    console.log(`  rate ${rate === 0 ? '0' : g(rate)} /us: interior tau*_log < tau*_phys ${any ? 'EXISTS' : 'none'}`);
    for (const e of es) {
      const t = e.tauLog;
      const where = t.atEdge ? `at grid edge (tau ${t.xMin})` : `${fmt(t.xMin, 2)} us [${fmt(t.lo, 2)}, ${fmt(t.hi, 2)}]`;
      console.log(`    d = ${e.d} ${e.mode.padEnd(4)}: tau*_log ${where}${e.interiorBelowTauPhys ? ' < tau*_phys' : ''}${e.interiorBelowTauPhysResolved ? ' (beyond bootstrap interval)' : ''}  pL ${e.pL.map((p) => fmt(p)).join(' ')}`);
    }
  }
  console.log(`\nnon-exact matchings: ${nonExactTotal} (crosstalk scan: ${xtNonExact})`);
  console.log(`wrote ${out} (runtime ${runtimeS.toFixed(1)} s)`);
}

// ---- Stage 3: superconducting dispersive readout over the integration time tau ----

const SC_PARAMS = 'params/sc.json';
const STAGE3_D = [3, 5, 7]; // d = 7 only if its banks exist
const STAGE3_R = 3;
const STAGE3_MODES = ['hard', 'soft'];
const BOOT_SEED3 = 302;
const F1_SEED3 = 301;
const V8_T1_US = 1e12;
// Seed of one readout draw: distinct for every (d, logical, tau index, draw), and outside
// the Stage 1 and 2 ranges. Hard and soft use the same seed, so they see the same readout samples.
const seedFor3 = (d, logical, tauIndex, draw) => 3000000 + 10000 * d + 1000 * logical + 10 * tauIndex + draw;

// llr calibration: for every sample with |llr| in a bin, the decision sign(llr) is wrong with
// average probability 1 / (1 + e^|llr|) if the llr is calibrated; observed vs predicted, 4 SE.
function llrCalibration(bins) {
  return V10_BINS.map(([lo, hi], b) => {
    const { m, wrong, qSum } = bins[b];
    if (m === 0) return { bin: [lo, hi], m, observed: null, predicted: null, pass: null };
    const q = qSum / m;
    const se = Math.sqrt((q * (1 - q)) / m);
    return { bin: [lo, hi], m, wrong, observed: round(wrong / m), predicted: round(q), pass: Math.abs(wrong / m - q) <= 4 * se };
  });
}
function addToBins(bins, llr, bit) {
  const a = Math.abs(llr);
  const b = V10_BINS.findIndex(([lo, hi]) => a >= lo && a < hi);
  if (b < 0) return;
  bins[b].m++;
  bins[b].qSum += 1 / (1 + Math.exp(a));
  if ((llr > 0 ? 1 : 0) !== bit) bins[b].wrong++;
}

function stage3({ decoders, basis }) {
  const t0 = Date.now();
  if (!existsSync(SC_PARAMS)) throw new Error(`${SC_PARAMS} not found: create the superconducting parameter card first (team checklist Appendix T6)`);
  const card = JSON.parse(readFileSync(SC_PARAMS, 'utf8'));
  const taus = fieldValue(card, 'tau_grid_us');
  const ringup = fieldValue(card, 'ringup');
  const banks = loadRepBanks(basis);
  const byKey = new Map(banks.map((b) => [`${b.bank.d},${b.bank.r},${b.bank.logical}`, b]));
  const distances = STAGE3_D.filter((d) => byKey.has(`${d},${STAGE3_R},0`) && byKey.has(`${d},${STAGE3_R},1`));
  for (const d of [3, 5]) if (!distances.includes(d)) throw new Error(`missing banks for d=${d}, r=${STAGE3_R}`);
  const rates = new Map(decoders.includes('learned') ? distances.map((d) => [d, pooledRates(byKey, d, STAGE3_R)]) : []);
  const readouts = taus.map((tau) => createScReadout(card, tau));
  // V8 card: no decay, no ring-up (Gaussian readout). V10 card: no ring-up, so the belief
  // model (linear mean during a decay, no ring-up) is the truth model.
  const v8Card = { ...card, T1_us: V8_T1_US, ringup: false };
  const v10Card = { ...card, ringup: false };

  // F1-sc: belief (model) assignment error and empirical error from truth samples (ringup as
  // in the card), plus llr calibration of the same samples. Equal priors: the bit alternates.
  const assignment = { belief: [], empirical: [], lo: [], hi: [] };
  const f1Detail = [];
  const binsCard = V10_BINS.map(() => ({ m: 0, wrong: 0, qSum: 0 }));
  const binsV10 = V10_BINS.map(() => ({ m: 0, wrong: 0, qSum: 0 }));
  const v8 = [];
  const rngF1 = createRng(F1_SEED3);
  taus.forEach((tau, t) => {
    const ro = readouts[t];
    let errors = 0;
    for (let s = 0; s < F1_SAMPLES; s++) {
      const bit = s & 1;
      const { hard, llr } = ro.measure(bit, rngF1);
      if (hard !== bit) errors++;
      addToBins(binsCard, llr, bit);
    }
    const belief = ro.averageAssignmentError();
    const w = wilson(errors, F1_SAMPLES);
    const se = Math.sqrt((belief * (1 - belief)) / F1_SAMPLES);
    assignment.belief.push(round(belief));
    assignment.empirical.push(round(w.p));
    assignment.lo.push(round(w.lo));
    assignment.hi.push(round(w.hi));
    f1Detail.push({
      tau, snr: round(ro.snr()), idleFlip: round(ro.idleFlipProbability(basis)),
      errors, agree4SE: Math.abs(w.p - belief) <= 4 * se + 1e-12,
    });

    // V8: T1 = 1e12 us, ring-up off; empirical error against 0.5 erfc(SNR / (2 sqrt 2)),
    // within 4 binomial SE, sqrt(p (1 - p) / n), n = F1_SAMPLES.
    const ro8 = createScReadout(v8Card, tau);
    const analytic = 0.5 * erfc(ro8.snr() / (2 * Math.SQRT2));
    const rng8 = createRng(F1_SEED3 + 1000 + t);
    let e8 = 0;
    for (let s = 0; s < F1_SAMPLES; s++) {
      const bit = s & 1;
      if (ro8.measure(bit, rng8).hard !== bit) e8++;
    }
    const se8 = Math.sqrt((analytic * (1 - analytic)) / F1_SAMPLES);
    v8.push({
      tau, snr: round(ro8.snr()), analytic: round(analytic), empirical: round(e8 / F1_SAMPLES), errors: e8,
      pass: Math.abs(e8 / F1_SAMPLES - analytic) <= 4 * se8 + 1e-12,
    });

    // V10 samples: card values with ring-up off (belief equals truth).
    const ro10 = createScReadout(v10Card, tau);
    const rng10 = createRng(F1_SEED3 + 2000 + t);
    for (let s = 0; s < F1_SAMPLES; s++) {
      const bit = s & 1;
      addToBins(binsV10, ro10.measure(bit, rng10).llr, bit);
    }
  });
  const v10Rows = llrCalibration(binsV10);
  const cardCalRows = llrCalibration(binsCard);

  // F2-sc: per bank, R readout draws per quantum shot; hard and soft share the draws.
  const cal = new Map();
  const { perShot, series, perLogical, seeds, used, nonExact: nonExactTotal } = f2Sweep({
    distances, byKey, r: STAGE3_R, taus, readouts, modes: STAGE3_MODES, decoders, seedOf: seedFor3, cal, rates, basis,
  });

  // Optima. tau*_phys from the belief curve; tau*_log per decoder, distance and mode from the
  // per-shot values, bootstrapped over pooled quantum shots.
  const tauPhys = findMinimum(taus, assignment.belief, { logX: true });
  const tauPhysEmp = findMinimum(taus, assignment.empirical, { logX: true });
  const tauLog = tauLogTable({ taus, distances, modes: STAGE3_MODES, decoders, perShot, bootSeed: BOOT_SEED3 });

  // C2: soft at or below hard at every tau (pooled counts; intervals overlap = not resolved).
  const c2 = c2Table({ taus, distances, decoders, series });

  // Budget: gate part from the learned rates of the d = 3, r = 3 banks of this basis.
  const budget = errorBudget({ taus, readouts, empirical: assignment.empirical, basis, gateRates: pooledRates(byKey, 3, STAGE3_R) });

  const runtimeS = (Date.now() - t0) / 1000;
  const result = {
    schema: 's2s-results/1',
    stage: 3,
    platform: 'superconducting',
    basis,
    x: { name: 'tau_us', values: taus },
    series,
    assignment,
    budget,
    optima: {
      tauPhys: { xMin: round(tauPhys.xMin), atEdge: tauPhys.atEdge },
      tauPhysEmpirical: { xMin: round(tauPhysEmp.xMin), atEdge: tauPhysEmp.atEdge },
      tauLog: tauLog.map(({ d, mode, decoder, xMin, lo, hi, atEdge, fractionAtEdge, fractionTied }) => ({ d, mode, decoder, xMin, lo, hi, atEdge, fractionAtEdge, fractionTied })),
    },
    params: {
      card,
      distances, r: STAGE3_R, modes: STAGE3_MODES, decoders, basis, logical_states: 'pooled (L0 + L1)',
      readoutDrawsPerShot: READOUT_DRAWS, bootstrapB: BOOT_B, f1Samples: F1_SAMPLES,
      readout: 'createScReadout(card, tau)', pGate: 'estimatePGate per bank, readout off',
      learned: 'ratesFromBanks(L0, L1) per (d, r, basis)',
      learnedRates: ratesRecord(rates, STAGE3_R),
    },
    readout: {
      ringup,
      snr: f1Detail.map((f) => f.snr),
      idleFlip: f1Detail.map((f) => f.idleFlip),
      tauPhysYMin: round(tauPhys.yMin),
      tauPhysEmpirical: { xMin: round(tauPhysEmp.xMin), atEdge: tauPhysEmp.atEdge },
      empiricalAgreesWithBelief4SE: f1Detail.map((f) => f.agree4SE),
      llrCalibrationAsCard: { ringup, rows: cardCalRows },
    },
    validation: {
      V8: { T1_us: V8_T1_US, ringup: false, samples: F1_SAMPLES, rows: v8, pass: v8.every((v) => v.pass) },
      V10: { ringup: false, note: 'card values with ring-up off (belief equals truth)', samplesPerTau: F1_SAMPLES, rows: v10Rows, pass: v10Rows.every((v) => v.pass !== false) },
      C2: c2,
      perLogical: perLogical.map((row) => ({ ...row, pL: row.k.map((k, t) => round(k / row.n[t])) })),
    },
    provenance: {
      tool: `tools/sweep.mjs --stage 3 --decoder ${decoderArg(decoders)} --basis ${basis}`,
      commit: gitCommit(),
      date: new Date().toISOString(),
      node: process.version,
      params: SC_PARAMS,
      banks: used,
      bankJobIds: Object.fromEntries(used.map((f) => [f, byKey.get(`${f.match(/_d(\d+)_/)[1]},${STAGE3_R},${f.match(/_L(\d)/)[1]}`).bank.job_id ?? 'unknown'])),
      pGate: Object.fromEntries(used.map((f) => [f, round(cal.get(f).p)])),
      seeds,
      seedRule: 'seed = 3000000 + 10000*d + 1000*logical + 10*tauIndex + draw (hard and soft, and both decoders, share it); F1 seed 301; V8 seed 1301 + tauIndex; V10 seed 2301 + tauIndex; bootstrap seed 302 + 10*d + (soft ? 1 : 0)',
      nonExact: nonExactTotal,
      runtime_s: runtimeS,
    },
  };
  mkdirSync(RESULTS_DIR, { recursive: true });
  const out = join(RESULTS_DIR, resultFile('stage3_sc.json', basis));
  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);

  const g = (v) => v.toExponential(2);
  console.log(`V8: Gaussian assignment error (T1 = ${V8_T1_US} us, ring-up off), ${F1_SAMPLES} truth samples per tau, against 0.5 erfc(SNR / (2 sqrt 2)) (4 SE)`);
  for (const v of v8) console.log(`  tau ${String(v.tau).padStart(4)}  SNR ${v.snr.toFixed(3)}  analytic ${g(v.analytic)}  empirical ${g(v.empirical)}  ${v.pass ? 'PASS' : 'FAIL'}`);
  console.log(`V8 overall: ${result.validation.V8.pass ? 'PASS' : 'FAIL'}`);
  const printCal = (rows) => {
    for (const v of rows) {
      console.log(`  |llr| in [${v.bin[0]}, ${v.bin[1]}): m ${v.m}${v.m ? `  observed ${fmt(v.observed)}  predicted ${fmt(v.predicted)}  ${v.pass ? 'PASS' : 'FAIL'}` : '  (empty)'}`);
    }
  };
  console.log('\nV10: llr calibration, card values with ring-up off (belief equals truth), samples pooled over the tau grid');
  printCal(v10Rows);
  console.log(`V10 overall: ${result.validation.V10.pass ? 'PASS' : 'FAIL'}`);
  console.log(`\nllr calibration with ring-up as in the card (ringup = ${ringup}; belief ignores ring-up, so this is information, not a check)`);
  printCal(cardCalRows);
  console.log(`\nF1-sc: assignment error by tau (ringup = ${ringup}; belief, empirical [Wilson 95%])`);
  taus.forEach((tau, t) => {
    const f = f1Detail[t];
    console.log(`  tau ${String(tau).padStart(4)}  SNR ${f.snr.toFixed(3)}  belief ${g(assignment.belief[t])}  empirical ${g(assignment.empirical[t])} [${g(assignment.lo[t])}, ${g(assignment.hi[t])}]${f.agree4SE ? '' : ' (DIFFERS > 4 SE)'}  idle flip ${g(f.idleFlip)}`);
  });
  const edge = (m) => (m.atEdge ? ` (no interior minimum: lowest at the grid ${m.xMin === taus[0] ? 'start' : 'end'})` : '');
  console.log(`tau*_phys = ${fmt(tauPhys.xMin, 3)} us, error ${g(tauPhys.yMin)}${edge(tauPhys)}`);
  console.log(`tau*_phys from the empirical curve = ${fmt(tauPhysEmp.xMin, 3)} us${edge(tauPhysEmp)}`);
  console.log(`\nF2-sc: logical error by tau, r = ${STAGE3_R}, basis ${basis}, L0 + L1 pooled, R = ${READOUT_DRAWS} draws per shot (n = ${series[0].n[0]} per point)`);
  printF2Summary({ series, taus, tauLog, c2, r: STAGE3_R, xDigits: 3 });
  printBudget(budget, g);
  console.log(`\nnon-exact matchings: ${nonExactTotal}`);
  console.log(`wrote ${out} (runtime ${runtimeS.toFixed(1)} s)`);
}

// ---- Stage 4: comparison of the two platforms, break-even and sensitivity ----

const CYCLE_PARAMS = 'params/cycle.json';
const STAGE2_FILE = 'stage2_ion.json';
const STAGE3_FILE = 'stage3_sc.json';
const ION = 'trapped-ion';
const SC = 'superconducting';
const STAGE4_MODES = ['hard', 'soft'];
// Sensitivity: reduced statistics (R = 1 readout draw, at most SENS_SHOTS quantum shots per
// bank, no bootstrap). The shots are a seeded random subsample: expandShots lists shots by
// ascending key, so the first 1000 shots of a bank are nearly all error-free.
const SENS_SCALES = [0.5, 2];
const SENS_SHOTS = 1000;
const SENS_F1_SAMPLES = 50000;
const SENS_SUBSAMPLE_SEED = 401;
const SENS_F1_SEED = 402;
const SENS_PARAMS = {
  [ION]: ['R_bright_per_us', 'R_dark_per_us', 'gamma_bright_to_dark_per_us', 'gamma_dark_to_bright_per_us', 'T1_idle_us'],
  [SC]: ['chi_over_2pi_MHz', 'kappa_over_2pi_MHz', 'nbar', 'eta', 'T1_us'],
};
// Cycle-card parameters scaled too (gate_layers_per_round is a count, not a physical value).
// They change only the per-microsecond numbers, so they reuse the reduced baseline decode.
const SENS_CYCLE_PARAMS = ['two_qubit_gate_us', 'reset_us'];
// C1, ion part: the idle flip probability must stay below this at every tau (CC-A8 prompt).
const C1_ION_IDLE_MAX = 1e-6;
// Seed of the reduced decode at one (platform, d, logical, tau index): the same in every
// sensitivity rerun (common random numbers), and hard and soft share it.
const seedFor4 = (platform, d, logical, tauIndex) => 4000000 + (platform === SC ? 100000 : 0) + 10000 * d + 1000 * logical + tauIndex;

const setField = (card, name, value) => ({
  ...card,
  [name]: card[name] !== null && typeof card[name] === 'object' ? { ...card[name], value } : value,
});

// Linear interpolation of ys in ln tau at tau (tau inside the grid).
function atTau(taus, ys, tau) {
  if (tau <= taus[0]) return ys[0];
  if (tau >= taus[taus.length - 1]) return ys[ys.length - 1];
  let i = 0;
  while (taus[i + 1] < tau) i++;
  const f = (Math.log(tau) - Math.log(taus[i])) / (Math.log(taus[i + 1]) - Math.log(taus[i]));
  return ys[i] + f * (ys[i + 1] - ys[i]);
}

// Crossing fraction of the line through (0, a) and (1, b), clamped to the segment.
function rootOnSegment(a, b) {
  if (a === 0) return { f: 0, clamped: false };
  if (a * b < 0 || b === 0) return { f: a / (a - b), clamped: false };
  return { f: Math.abs(a) < Math.abs(b) ? 0 : 1, clamped: true };
}

// Break-even of d = 5 against d = 3 on the x axis xs (assignment error in tau order), with a
// Wilson-based interval from the two neighbouring grid points: the crossings of the extreme
// differences hi5 - lo3 and lo5 - hi3 on the same segment. A bound line that does not cross
// inside the segment is clamped to the segment end (clamped: true; the interval is then too
// narrow). tau_us is interpolated in ln tau with the same fraction as the crossing.
function breakEvenWithInterval(taus, xs, s3, s5) {
  const det = breakEvenDetail(xs, s3.pL, s5.pL);
  if (det === null) {
    const below = s5.pL.every((p, i) => p < s3.pL[i]);
    return { epsBar: null, tau_us: null, lo: null, hi: null, halfWidth: null, clamped: false, note: below ? 'd = 5 below d = 3 at every grid point' : 'd = 5 above d = 3 at every grid point' };
  }
  const a = det.fraction === 0 && det.index === taus.length - 1 ? det.index - 1 : det.index;
  const b = a + 1;
  const xAt = (f) => xs[a] + f * (xs[b] - xs[a]);
  const up = rootOnSegment(s5.hi[a] - s3.lo[a], s5.hi[b] - s3.lo[b]);
  const dn = rootOnSegment(s5.lo[a] - s3.hi[a], s5.lo[b] - s3.hi[b]);
  const cands = [det.x, xAt(up.f), xAt(dn.f)];
  const lo = Math.min(...cands);
  const hi = Math.max(...cands);
  const fTau = det.index === a ? det.fraction : 1;
  const tau = Math.exp(Math.log(taus[a]) + fTau * (Math.log(taus[b]) - Math.log(taus[a])));
  return { epsBar: det.x, tau_us: tau, lo, hi, halfWidth: (hi - lo) / 2, clamped: up.clamped || dn.clamped, segment: [taus[a], taus[b]] };
}

// The stage 2 or 3 results as an "arm" for one decoder: tau grid, pooled series, assignment
// curves, idle probabilities and tau*_log (with bootstrap intervals for the full runs).
// Series and tau*_log entries without "decoder" (v1 files) are the naive decoder.
function armFromResults(res, decoder) {
  const taus = res.x.values;
  const empMin = findMinimum(taus, res.assignment.empirical, { logX: true });
  const mine = (x) => (x.decoder ?? 'naive') === decoder;
  const series = res.series.filter(mine);
  if (series.length === 0) {
    throw new UsageError(`the ${res.platform} results have no ${decoder} series: rerun --stage ${res.stage} with --decoder ${decoder} or both`);
  }
  return {
    platform: res.platform, taus, full: true,
    distances: [...new Set(series.map((s) => s.d))].sort((a, b) => a - b),
    series,
    belief: res.assignment.belief,
    empirical: res.assignment.empirical,
    idle: res.readout.idleFlip,
    tauPhysBelief: res.optima.tauPhys,
    tauPhysEmp: { xMin: empMin.xMin, atEdge: empMin.atEdge },
    tauLog: res.optima.tauLog.filter(mine),
  };
}

// The Stage 2 or 3 computation at reduced statistics for one card.
function reducedArm(platform, card, ctx) {
  const taus = fieldValue(card, 'tau_grid_us');
  const create = platform === ION ? createIonReadout : createScReadout;
  const readouts = taus.map((tau) => create(card, tau));
  const empirical = [];
  const rngF1 = createRng(SENS_F1_SEED);
  for (const ro of readouts) {
    let errors = 0;
    for (let s = 0; s < SENS_F1_SAMPLES; s++) {
      const bit = s & 1;
      if (ro.measure(bit, rngF1).hard !== bit) errors++;
    }
    empirical.push(errors / SENS_F1_SAMPLES);
  }
  const series = [];
  const tauLog = [];
  for (const d of ctx.distances) {
    const k = Object.fromEntries(STAGE4_MODES.map((m) => [m, new Array(taus.length).fill(0)]));
    let n = 0;
    for (const logical of [0, 1]) {
      const { bank, shots, pGate } = ctx.banks.get(`${d},${logical}`);
      const noise = noiseFor(ctx.decoder, pGate, ctx.rates.get(d));
      n += shots.length;
      taus.forEach((_, t) => {
        for (const mode of STAGE4_MODES) {
          const rng = createRng(seedFor4(platform, d, logical, t));
          for (const bits of shots) {
            const res = decodeShot({ shotBits: bits, layout: bank.layout, d, r: bank.r, readout: readouts[t], mode, noise, basis: ctx.basis, rng, logical: bank.logical });
            if (!res.exact) ctx.nonExact++;
            k[mode][t] += res.logicalError;
          }
        }
      });
    }
    for (const mode of STAGE4_MODES) {
      const ws = k[mode].map((kk) => wilson(kk, n));
      const s = { d, r: ctx.r, mode, decoder: ctx.decoder, pL: ws.map((w) => w.p), lo: ws.map((w) => w.lo), hi: ws.map((w) => w.hi), n: taus.map(() => n) };
      series.push(s);
      const m = findMinimum(taus, s.pL, { logX: true });
      tauLog.push({ d, mode, xMin: m.xMin, atEdge: m.atEdge, tied: m.tied });
    }
  }
  const empMin = findMinimum(taus, empirical, { logX: true });
  const belief = readouts.map((ro) => ro.averageAssignmentError());
  return {
    platform, taus, full: false, distances: ctx.distances, series, belief, empirical,
    idle: readouts.map((ro) => ro.idleFlipProbability(ctx.basis)),
    tauPhysBelief: (({ xMin, atEdge }) => ({ xMin, atEdge }))(findMinimum(taus, belief, { logX: true })),
    tauPhysEmp: { xMin: empMin.xMin, atEdge: empMin.atEdge },
    tauLog,
  };
}

// Table P of one platform: tau*_log, the per-round and per-microsecond logical error at
// tau*_log (pL and its Wilson bounds interpolated in ln tau; at the best grid point when
// tau*_log is at the grid edge), and the break-even assignment error between d = 3 and d = 5.
function platformTable(arm, cycleCard) {
  const P = { tauLog: {}, perRound: {}, perMicrosecond: {}, pLAtTauLog: {} };
  for (const mode of STAGE4_MODES) {
    P.tauLog[mode] = [];
    P.perRound[mode] = [];
    P.perMicrosecond[mode] = [];
    P.pLAtTauLog[mode] = [];
    for (const d of arm.distances) {
      const s = arm.series.find((x) => x.d === d && x.mode === mode);
      const tl = arm.tauLog.find((x) => x.d === d && x.mode === mode);
      const tau = tl.xMin;
      const pL = [s.pL, s.lo, s.hi].map((ys) => atTau(arm.taus, ys, tau));
      const eps = pL.map((p) => perRound(p, s.r));
      const tcyc = cycleTime(cycleCard, tau);
      const lam = eps.map((e) => perMicrosecond(e, tcyc));
      P.tauLog[mode].push({ d, xMin: tau, lo: tl.lo ?? null, hi: tl.hi ?? null, atEdge: tl.atEdge });
      P.pLAtTauLog[mode].push({ d, r: s.r, tau_us: tau, value: pL[0], lo: pL[1], hi: pL[2] });
      P.perRound[mode].push({ d, value: eps[0], lo: eps[1], hi: eps[2] });
      P.perMicrosecond[mode].push({ d, value: lam[0], lo: lam[1], hi: lam[2], cycle_us: tcyc });
    }
  }
  const be = {};
  const beEmp = {};
  for (const mode of STAGE4_MODES) {
    const s3 = arm.series.find((x) => x.d === 3 && x.mode === mode);
    const s5 = arm.series.find((x) => x.d === 5 && x.mode === mode);
    be[mode] = breakEvenWithInterval(arm.taus, arm.belief, s3, s5);
    beEmp[mode] = breakEvenWithInterval(arm.taus, arm.empirical, s3, s5);
  }
  // Top level (the CLAUDE.md fields) is hard mode; both modes in byMode.
  P.breakEven = { epsBar: be.hard.epsBar, tau_us: be.hard.tau_us, mode: 'hard', axis: 'averageAssignmentError() (belief model)', byMode: be, empiricalAxis: beEmp };
  P.tauPhys = { belief: arm.tauPhysBelief, empirical: arm.tauPhysEmp };
  return P;
}

const combine = (parts) => {
  const v = Object.values(parts).map((p) => (typeof p === 'string' ? p : p.verdict));
  if (v.includes('flips')) return 'flips';
  return v.every((x) => x === 'holds') ? 'holds' : 'undetermined';
};

// C1, superconducting part, for one (d, mode): an interior minimum with tau*_log < tau*_phys
// (empirical assignment curve; the belief curve ignores ring-up). Full runs use the bootstrap
// interval of tau*_log. Reduced runs (no bootstrap) use the grid: holds if every grid point at
// or above tau*_phys has its Wilson lower bound above the Wilson upper bound of the lowest
// point; flips if the mirror condition holds for the points at or below tau*_phys, or if the
// lowest point is at the grid edge and below its neighbour beyond the intervals.
function c1ScCase(arm, d, mode, tauPhys) {
  const tl = arm.tauLog.find((x) => x.d === d && x.mode === mode);
  if (arm.full) {
    if (tl.atEdge) return { verdict: tl.fractionAtEdge >= 0.975 ? 'flips' : 'undetermined', xMin: tl.xMin, atEdge: true };
    const verdict = tl.hi < tauPhys ? 'holds' : tl.lo >= tauPhys ? 'flips' : 'undetermined';
    return { verdict, xMin: tl.xMin, lo: tl.lo, hi: tl.hi };
  }
  const s = arm.series.find((x) => x.d === d && x.mode === mode);
  let i0 = 0;
  for (let i = 1; i < s.pL.length; i++) if (s.pL[i] < s.pL[i0]) i0 = i;
  const last = s.pL.length - 1;
  if (tl.atEdge) {
    const nb = i0 === 0 ? 1 : last - 1;
    return { verdict: s.hi[i0] < s.lo[nb] ? 'flips' : 'undetermined', xMin: tl.xMin, atEdge: true };
  }
  const above = (pred) => arm.taus.every((tau, i) => !pred(tau) || i === i0 || s.lo[i] > s.hi[i0]);
  let verdict = 'undetermined';
  if (tl.xMin < tauPhys && arm.taus[i0] < tauPhys && above((tau) => tau >= tauPhys)) verdict = 'holds';
  if (tl.xMin >= tauPhys && arm.taus[i0] >= tauPhys && above((tau) => tau <= tauPhys)) verdict = 'flips';
  return { verdict, xMin: tl.xMin };
}

// C1 to C4 for one ion arm and one superconducting arm with their tables.
function evaluateConclusions(ion, sc, tables) {
  // C1.
  const c1 = {};
  if (sc.tauPhysEmp.atEdge) {
    c1[SC] = { verdict: 'undetermined', note: 'tau*_phys (empirical) at the grid edge' };
  } else {
    const cases = {};
    for (const d of sc.distances) for (const mode of STAGE4_MODES) cases[`d${d} ${mode}`] = c1ScCase(sc, d, mode, sc.tauPhysEmp.xMin);
    c1[SC] = { verdict: combine(cases), tauPhys: sc.tauPhysEmp.xMin, cases };
  }
  const maxIdle = Math.max(...ion.idle);
  const interior = ion.tauLog.filter((t) => !t.atEdge).map((t) => `d${t.d} ${t.mode}`);
  c1[ION] = {
    verdict: maxIdle < C1_ION_IDLE_MAX || interior.length === 0 ? 'holds' : 'flips',
    maxIdle, idleLimit: C1_ION_IDLE_MAX, interiorMinima: interior,
  };

  // C2, per platform: no tau where soft is above hard beyond the Wilson intervals, and at
  // least one where it is below beyond them.
  const c2 = {};
  for (const arm of [ion, sc]) {
    let above = 0;
    let below = 0;
    for (const d of arm.distances) {
      const h = arm.series.find((x) => x.d === d && x.mode === 'hard');
      const s = arm.series.find((x) => x.d === d && x.mode === 'soft');
      arm.taus.forEach((_, t) => {
        if (s.lo[t] > h.hi[t]) above++;
        if (s.hi[t] < h.lo[t]) below++;
      });
    }
    c2[arm.platform] = { verdict: above === 0 && below > 0 ? 'holds' : 'flips', softAboveBeyondIntervals: above, softBelowBeyondIntervals: below };
  }

  // C3, per (d, mode): the ordering of the platforms by per-round error (intervals apart)
  // differs from the ordering by per-microsecond error.
  const order = (a, b) => (a.hi < b.lo ? 'ion lower' : b.hi < a.lo ? 'superconducting lower' : null);
  const c3 = {};
  for (const mode of STAGE4_MODES) {
    for (const d of ion.distances.filter((x) => sc.distances.includes(x))) {
      const pr = order(tables[ION].perRound[mode].find((u) => u.d === d), tables[SC].perRound[mode].find((u) => u.d === d));
      const pm = order(tables[ION].perMicrosecond[mode].find((u) => u.d === d), tables[SC].perMicrosecond[mode].find((u) => u.d === d));
      const verdict = pr === null || pm === null ? 'undetermined' : pr !== pm ? 'holds' : 'flips';
      c3[`d${d} ${mode}`] = { verdict, perRound: pr, perMicrosecond: pm };
    }
  }

  // C4, per mode: the break-even assignment errors differ by less than the sum of their
  // half-widths. No crossing on either platform, or a "flips" resting on a clamped interval,
  // is undetermined.
  const c4 = {};
  for (const mode of STAGE4_MODES) {
    const a = tables[ION].breakEven.byMode[mode];
    const b = tables[SC].breakEven.byMode[mode];
    let verdict;
    let diff = null;
    let sumHalfWidths = null;
    if (a.epsBar === null || b.epsBar === null) {
      verdict = 'undetermined';
    } else {
      diff = Math.abs(a.epsBar - b.epsBar);
      sumHalfWidths = a.halfWidth + b.halfWidth;
      verdict = diff < sumHalfWidths ? 'holds' : a.clamped || b.clamped ? 'undetermined' : 'flips';
    }
    c4[mode] = { verdict, ion: a.epsBar, superconducting: b.epsBar, diff, sumHalfWidths };
  }

  return {
    C1: { verdict: combine(c1), parts: c1 },
    C2: { verdict: combine(c2), parts: c2 },
    C3: { verdict: combine(c3), parts: c3 },
    C4: { verdict: combine(c4), parts: c4 },
  };
}

// Headline decoder of Stage 4: learned when it is requested, otherwise naive. The full
// tables and conclusions of every requested decoder are in byDecoder; the sensitivity
// reruns use the headline decoder.
function stage4({ decoders, basis }) {
  const t0 = Date.now();
  const headline = decoders.includes('learned') ? 'learned' : 'naive';
  const stage2File = resultFile(STAGE2_FILE, basis);
  const stage3File = resultFile(STAGE3_FILE, basis);
  for (const f of [CYCLE_PARAMS, ION_PARAMS, SC_PARAMS, join(RESULTS_DIR, stage2File), join(RESULTS_DIR, stage3File)]) {
    if (!existsSync(f)) throw new Error(`${f} not found${f === CYCLE_PARAMS ? ': create the cycle-time card first (team checklist Appendix T6)' : ''}`);
  }
  const cycle = JSON.parse(readFileSync(CYCLE_PARAMS, 'utf8'));
  const cards = { [ION]: JSON.parse(readFileSync(ION_PARAMS, 'utf8')), [SC]: JSON.parse(readFileSync(SC_PARAMS, 'utf8')) };
  const results = { [ION]: JSON.parse(readFileSync(join(RESULTS_DIR, stage2File), 'utf8')), [SC]: JSON.parse(readFileSync(join(RESULTS_DIR, stage3File), 'utf8')) };
  for (const p of [ION, SC]) {
    if (!cycle[p]) throw new Error(`${CYCLE_PARAMS} has no entry for ${p}`);
    cycleTime(cycle[p], 1); // throws on an unfilled (null) value
  }
  // The full tables come from the stage files; warn if their cards differ from params/.
  const cardsMatch = Object.fromEntries([ION, SC].map((p) => [p, JSON.stringify(results[p].params.card) === JSON.stringify(cards[p])]));

  // Full statistics: tables and conclusions from the Stage 2 and 3 results, per decoder.
  const byDecoder = {};
  for (const decoder of decoders) {
    const arms = { [ION]: armFromResults(results[ION], decoder), [SC]: armFromResults(results[SC], decoder) };
    const tb = { [ION]: platformTable(arms[ION], cycle[ION]), [SC]: platformTable(arms[SC], cycle[SC]) };
    byDecoder[decoder] = { platforms: tb, conclusions: evaluateConclusions(arms[ION], arms[SC], tb) };
  }
  const { platforms: tables, conclusions } = byDecoder[headline];

  // Reduced statistics: banks, calibration and the shot subsample, shared by every rerun.
  const r = 3;
  const repBanks = loadRepBanks(basis);
  const byKey = new Map(repBanks.map((b) => [`${b.bank.d},${b.bank.r},${b.bank.logical}`, b]));
  const distances = [3, 5, 7].filter((d) => byKey.has(`${d},${r},0`) && byKey.has(`${d},${r},1`));
  const rates = new Map(headline === 'learned' ? distances.map((d) => [d, pooledRates(byKey, d, r)]) : []);
  const ctx = { r, distances, banks: new Map(), nonExact: 0, decoder: headline, rates, basis };
  const usedBanks = [];
  for (const d of distances) {
    for (const logical of [0, 1]) {
      const { file, bank } = byKey.get(`${d},${r},${logical}`);
      usedBanks.push(file);
      const all = expandShots(bank);
      // Partial Fisher-Yates with a seeded rng: a fixed random subsample of SENS_SHOTS shots.
      const rng = createRng(SENS_SUBSAMPLE_SEED + 10 * d + logical);
      const idx = all.map((_, i) => i);
      const n = Math.min(SENS_SHOTS, all.length);
      for (let i = 0; i < n; i++) {
        const j = i + rng.int(all.length - i);
        [idx[i], idx[j]] = [idx[j], idx[i]];
      }
      ctx.banks.set(`${d},${logical}`, { bank, shots: idx.slice(0, n).map((i) => all[i]), pGate: calibrate(bank).p, file });
    }
  }

  const timed = (label, fn) => {
    const t = Date.now();
    const v = fn();
    console.log(`  ${label} (${((Date.now() - t) / 1000).toFixed(1)} s)`);
    return v;
  };
  console.log(`Sensitivity: reduced statistics, R = 1, ${SENS_SHOTS} shots per bank, no bootstrap, d = ${distances.join(', ')}, ${headline} decoder, basis ${basis}`);
  const base = {
    [ION]: timed(`${ION} baseline`, () => reducedArm(ION, cards[ION], ctx)),
    [SC]: timed(`${SC} baseline`, () => reducedArm(SC, cards[SC], ctx)),
  };
  const evalArms = (arms, cyc) => {
    const tb = { [ION]: platformTable(arms[ION], cyc[ION]), [SC]: platformTable(arms[SC], cyc[SC]) };
    return { tables: tb, conclusions: evaluateConclusions(arms[ION], arms[SC], tb) };
  };
  const baseline = evalArms(base, cycle);
  const sensitivity = [];
  const row = (platform, parameter, scale, value, ev) => {
    const out = { platform, parameter, scale, value };
    for (const c of ['C1', 'C2', 'C3', 'C4']) out[c] = ev.conclusions[c].verdict;
    out.parts = Object.fromEntries(['C1', 'C2', 'C3', 'C4'].map((c) => [c, Object.fromEntries(Object.entries(ev.conclusions[c].parts).map(([k, v]) => [k, v.verdict]))]));
    out.tauLog = Object.fromEntries([ION, SC].map((p) => [p, ev.tables[p].tauLog]));
    out.breakEven = Object.fromEntries([ION, SC].map((p) => [p, { hard: ev.tables[p].breakEven.byMode.hard.epsBar, soft: ev.tables[p].breakEven.byMode.soft.epsBar }]));
    sensitivity.push(out);
  };
  for (const platform of [ION, SC]) {
    for (const name of SENS_PARAMS[platform]) {
      for (const scale of SENS_SCALES) {
        const value = fieldValue(cards[platform], name) * scale;
        const arm = timed(`${platform} ${name} x ${scale}`, () => reducedArm(platform, setField(cards[platform], name, value), ctx));
        row(platform, name, scale, value, evalArms({ ...base, [platform]: arm }, cycle));
      }
    }
    for (const name of SENS_CYCLE_PARAMS) {
      for (const scale of SENS_SCALES) {
        const value = fieldValue(cycle[platform], name) * scale;
        row(platform, `cycle.${name}`, scale, value, evalArms(base, { ...cycle, [platform]: setField(cycle[platform], name, value) }));
      }
    }
  }

  const runtimeS = (Date.now() - t0) / 1000;
  const platforms = Object.fromEntries([ION, SC].map((p) => [p, tables[p]]));
  const result = {
    schema: 's2s-results/1',
    stage: 4,
    basis,
    decoder: headline,
    platforms,
    conclusions,
    byDecoder,
    sensitivity,
    sensitivityBaseline: {
      note: 'scale 1 (card values) at the same reduced statistics as the sensitivity rows',
      C1: baseline.conclusions.C1, C2: baseline.conclusions.C2, C3: baseline.conclusions.C3, C4: baseline.conclusions.C4,
      platforms: baseline.tables,
    },
    params: {
      cycle, ion: cards[ION], sc: cards[SC],
      definitions: {
        perRound: '0.5 (1 - (1 - 2 pL)^(1/r)) at tau*_log; pL and its Wilson bounds interpolated linearly in ln tau between grid points (the best grid point when tau*_log is at the grid edge)',
        perMicrosecond: 'perRound / cycleTime, cycleTime = gate_layers_per_round * two_qubit_gate_us + tau*_log + reset_us',
        breakEven: 'first sign change of pL(d=5) - pL(d=3) in tau order, x axis averageAssignmentError() (belief); interval from the crossings of hi5 - lo3 and lo5 - hi3 (Wilson) on the same grid segment',
        C1: `superconducting: interior tau*_log below tau*_phys (empirical assignment curve) for every d and mode (full: bootstrap interval; reduced: Wilson intervals on the grid); trapped-ion: idle flip probability below ${C1_ION_IDLE_MAX} at every tau, or no interior tau*_log`,
        C2: 'per platform: soft never above hard beyond the Wilson intervals, and below hard beyond them at one or more (d, tau)',
        C3: 'per (d, mode): platform ordering by per-round error differs from ordering by per-microsecond error, each ordering requiring non-overlapping intervals',
        C4: 'per mode: |epsBar(ion) - epsBar(sc)| < sum of half-widths; undetermined if a platform has no crossing, or a flip rests on a clamped interval',
        combine: 'a verdict is "flips" if any part flips, "holds" if every part holds, otherwise "undetermined"',
      },
      sensitivity: { scales: SENS_SCALES, readoutDrawsPerShot: 1, shotsPerBank: SENS_SHOTS, f1Samples: SENS_F1_SAMPLES, bootstrap: false, distances, parameters: SENS_PARAMS, cycleParameters: SENS_CYCLE_PARAMS, decoder: headline },
      decoders, basis,
      learnedRates: ratesRecord(rates, r),
    },
    provenance: {
      tool: `tools/sweep.mjs --stage 4 --decoder ${decoderArg(decoders)} --basis ${basis}`,
      commit: gitCommit(),
      date: new Date().toISOString(),
      node: process.version,
      params: [CYCLE_PARAMS, ION_PARAMS, SC_PARAMS],
      inputs: Object.fromEntries([ION, SC].map((p) => [p, { file: join(RESULTS_DIR, p === ION ? stage2File : stage3File), commit: results[p].provenance.commit, date: results[p].provenance.date, cardMatchesParams: cardsMatch[p] }])),
      banks: usedBanks,
      pGate: Object.fromEntries([...ctx.banks.values()].map((b) => [b.file, round(b.pGate)])),
      seedRule: `reduced decode seed = 4000000 + (superconducting ? 100000 : 0) + 10000*d + 1000*logical + tauIndex (same in every rerun; hard and soft share it); shot subsample seed ${SENS_SUBSAMPLE_SEED} + 10*d + logical; F1 seed ${SENS_F1_SEED}`,
      nonExact: ctx.nonExact,
      runtime_s: runtimeS,
    },
  };
  mkdirSync(RESULTS_DIR, { recursive: true });
  const out = join(RESULTS_DIR, resultFile('stage4_comparison.json', basis));
  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);

  // Summary.
  const g = (v) => (v === null || v === undefined ? '—' : v === 0 ? '0' : Number(v).toExponential(3));
  for (const p of [ION, SC]) if (!cardsMatch[p]) console.log(`WARNING: the card in ${p === ION ? stage2File : stage3File} differs from ${p === ION ? ION_PARAMS : SC_PARAMS}; the full tables use the stage file, the sensitivity uses params/`);
  for (const p of [ION, SC]) {
    const P = tables[p];
    const c = cycle[p];
    console.log(`\n${p}: cycle = ${fieldValue(c, 'gate_layers_per_round')} x ${fieldValue(c, 'two_qubit_gate_us')} us + tau + ${fieldValue(c, 'reset_us')} us; tau*_phys belief ${g(P.tauPhys.belief.xMin)}, empirical ${g(P.tauPhys.empirical.xMin)} us`);
    for (const mode of STAGE4_MODES) {
      P.tauLog[mode].forEach((tl, i) => {
        const pl = P.pLAtTauLog[mode][i];
        const pr = P.perRound[mode][i];
        const pm = P.perMicrosecond[mode][i];
        console.log(`  ${mode.padEnd(4)} d = ${tl.d}: tau*_log ${g(tl.xMin)} us${tl.atEdge ? ' (grid edge)' : ''}  pL(r = ${pl.r}) ${g(pl.value)}  per round ${g(pr.value)} [${g(pr.lo)}, ${g(pr.hi)}]  Tcyc ${g(pm.cycle_us)} us  per us ${g(pm.value)} [${g(pm.lo)}, ${g(pm.hi)}]`);
      });
    }
    for (const mode of STAGE4_MODES) {
      const b = P.breakEven.byMode[mode];
      const e = P.breakEven.empiricalAxis[mode];
      console.log(`  break-even ${mode}: ${b.epsBar === null ? `none (${b.note})` : `epsBar ${g(b.epsBar)} [${g(b.lo)}, ${g(b.hi)}]${b.clamped ? ' (clamped)' : ''} at tau ${g(b.tau_us)} us`}; on the empirical axis ${e.epsBar === null ? 'none' : g(e.epsBar)}`);
    }
  }
  const show = (label, cs) => console.log(`${label}: C1 ${cs.C1.verdict}, C2 ${cs.C2.verdict}, C3 ${cs.C3.verdict}, C4 ${cs.C4.verdict}`);
  console.log('');
  for (const decoder of decoders.filter((x) => x !== headline)) show(`Conclusions, full statistics, ${decoder} decoder`, byDecoder[decoder].conclusions);
  show(`Conclusions, full statistics, ${headline} decoder (headline)`, conclusions);
  for (const c of ['C1', 'C2', 'C3', 'C4']) {
    console.log(`  ${c}: ${Object.entries(conclusions[c].parts).map(([k, v]) => `${k} ${v.verdict}`).join('; ')}`);
  }
  show('Conclusions, reduced baseline', baseline.conclusions);
  console.log('\nSensitivity (reduced statistics):');
  for (const s of sensitivity) console.log(`  ${s.platform.padEnd(15)} ${s.parameter.padEnd(28)} x ${String(s.scale).padEnd(3)}  C1 ${s.C1.padEnd(12)} C2 ${s.C2.padEnd(12)} C3 ${s.C3.padEnd(12)} C4 ${s.C4}`);
  console.log(`\nnon-exact matchings (reduced runs): ${ctx.nonExact}`);
  console.log(`wrote ${out} (runtime ${runtimeS.toFixed(1)} s)`);
}

// ---- Stage dem: learned detector error model of the Forte-1 banks, naive against learned ----

const DEM_FILE = 'dem_forte1.json';
const DEM_OOS_EPS = 0.02; // V12b: flat epsilon, hard mode
const DEM_D = [3, 5, 7];
const DEM_R = 3;
const DEM_DRAWS = 2; // R readout draws per quantum shot in decoderComparison
const DEM_MODES = ['hard', 'soft'];
const DEM_ARMS = [
  { arm: 'flat', xName: 'epsilon', xs: [1e-9, 0.02] },
  { arm: ION, xName: 'tau_us', xs: [3, 20, 100] },
  { arm: SC, xName: 'tau_us', xs: [0.5, 0.7, 1.0] },
];
// Seeds: decoderComparison 5000000 + 100000*armIndex + 10000*xIndex + 100*d + 10*logical + draw
// (hard and soft, naive and learned share it); out of sample 5900000 + 100*d + 10*r + tested logical.
const seedForDem = (a, x, d, logical, draw) => 5000000 + 100000 * a + 10000 * x + 100 * d + 10 * logical + draw;
const seedForOos = (d, r, logical) => 5900000 + 100 * d + 10 * r + logical;

// Pooled L0 + L1 logical error of one (readout, mode, noise) with `draws` readout draws per shot.
function pooledPoint(pair, { readout, mode, noiseOf, seedOf, draws }) {
  let k = 0;
  let n = 0;
  let nonExact = 0;
  for (const logical of [0, 1]) {
    const { file, bank } = pair[logical];
    for (let draw = 0; draw < draws; draw++) {
      const res = runPoint({ bank, readout, mode, noise: noiseOf(file), seed: seedOf(logical, draw) });
      k += res.k;
      n += res.n;
      nonExact += res.nonExact;
    }
  }
  const w = wilson(k, n);
  return { k, n, pL: round(w.p), lo: round(w.lo), hi: round(w.hi), nonExact };
}

const roundArr = (a) => Array.from(a, (v) => round(v));
const roundObj = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, round(v)]));

function stageDem() {
  const t0 = Date.now();
  // Every basis whose banks exist; Z is required, X is optional until A48.
  const groups = []; // { d, r, basis, pair: { 0: { file, bank }, 1: ... } }
  const bases = [];
  for (const basis of ['Z', 'X']) {
    let banks;
    try {
      banks = loadRepBanks(basis);
    } catch (e) {
      if (basis === 'X' && e instanceof UsageError) continue;
      throw e;
    }
    bases.push(basis);
    const map = new Map();
    for (const b of banks) {
      const key = `${b.bank.d},${b.bank.r}`;
      if (!map.has(key)) map.set(key, { d: b.bank.d, r: b.bank.r, basis, pair: {} });
      map.get(key).pair[b.bank.logical] = b;
    }
    groups.push(...[...map.values()].sort((a, b) => a.d - b.d || a.r - b.r));
  }
  console.log(`Stage dem: bases ${bases.join(', ')}${bases.includes('X') ? '' : ' (no repx_*.json banks yet: X basis and the X/Z ratio (O4) skipped)'}`);

  // Rates, firing and pair rates per (d, r, basis), L0 and L1 pooled; the naive pGate of
  // the same pooled detectors for comparison.
  const bankRows = [];
  const det = new Map(); // file -> detector arrays
  for (const g of groups) {
    const parts = [0, 1].filter((l) => g.pair[l]).map((l) => g.pair[l]);
    for (const { file, bank } of parts) det.set(file, detectorArraysOf(bank));
    const pooled = parts.flatMap(({ file }) => det.get(file));
    const est = estimateEdgeRates(pooled, g.d, g.r);
    const cal = estimatePGate(pooled, g.d, g.r);
    const nDet = (g.d - 1) * (g.r + 1);
    const pij = [];
    for (let i = 0; i < nDet; i++) pij.push(roundArr(est.pij.subarray(i * nDet, (i + 1) * nDet)));
    g.classes = est.classes;
    g.cal = cal;
    bankRows.push({
      d: g.d, r: g.r, basis: g.basis, files: parts.map((b) => b.file), nShots: est.nShots,
      firing: roundArr(est.firing), pij, classes: roundObj(est.classes), counts: est.counts,
      antiDiag: round(est.antiDiag), pGateNaive: round(cal.p),
      bulkRate: round(cal.rate), bulkDetectors: cal.nDetectors,
    });
  }

  // O4: X/Z ratio of the bulk detector firing rate per (d, r). Interval: delta method on
  // ln ratio with binomial counts over detectors x shots (detectors in a shot are correlated,
  // so the interval is too narrow; it is a guide, not a test).
  const ratioXoverZ = [];
  for (const gz of groups.filter((g) => g.basis === 'Z')) {
    const gx = groups.find((g) => g.basis === 'X' && g.d === gz.d && g.r === gz.r);
    if (!gx) continue;
    ratioXoverZ.push({ d: gz.d, r: gz.r, ...o4Ratio(gz.cal, gx.cal) });
  }

  // V12b out of sample: rates (learned) and pGate (naive) from one logical state's bank decode
  // the other's, flat epsilon 0.02, hard mode, the same seed for both decoders.
  const outOfSample = [];
  const outOfSamplePooled = [];
  let nonExact = 0;
  const flatOos = createFlatReadout({ epsilon: DEM_OOS_EPS });
  for (const g of groups.filter((x) => x.pair[0] && x.pair[1])) {
    const sum = { naive: { k: 0, n: 0 }, learned: { k: 0, n: 0 } };
    for (const [train, test] of [[0, 1], [1, 0]]) {
      const trainDet = det.get(g.pair[train].file);
      const noise = {
        naive: { model: 'naive', pGate: estimatePGate(trainDet, g.d, g.r).p },
        learned: { model: 'learned', rates: estimateEdgeRates(trainDet, g.d, g.r).classes },
      };
      const row = { d: g.d, r: g.r, basis: g.basis, trainedOn: `L${train}`, testedOn: `L${test}` };
      for (const decoder of ['naive', 'learned']) {
        const res = runPoint({ bank: g.pair[test].bank, readout: flatOos, mode: 'hard', noise: noise[decoder], seed: seedForOos(g.d, g.r, test) });
        nonExact += res.nonExact;
        row[decoder] = { k: res.k, n: res.n, pL: round(res.wilson.p), lo: round(res.wilson.lo), hi: round(res.wilson.hi) };
        sum[decoder].k += res.k;
        sum[decoder].n += res.n;
      }
      outOfSample.push(row);
    }
    const wn = wilson(sum.naive.k, sum.naive.n);
    const wl = wilson(sum.learned.k, sum.learned.n);
    outOfSamplePooled.push({
      d: g.d, r: g.r, basis: g.basis,
      naive: { ...sum.naive, pL: round(wn.p), lo: round(wn.lo), hi: round(wn.hi) },
      learned: { ...sum.learned, pL: round(wl.p), lo: round(wl.lo), hi: round(wl.hi) },
      learnedAtOrBelowNaive: sum.learned.k <= sum.naive.k,
      learnedBelowBeyondIntervals: wl.hi < wn.lo,
    });
  }

  // decoderComparison: naive (pGate per bank) against learned (rates of L0 + L1 pooled), hard
  // and soft, every arm at its x values, d = 3, 5, 7, r = 3, R = 2 readout draws per shot.
  const ionCard = JSON.parse(readFileSync(ION_PARAMS, 'utf8'));
  const scCard = JSON.parse(readFileSync(SC_PARAMS, 'utf8'));
  const makeReadout = (arm, x) => (arm === 'flat' ? createFlatReadout({ epsilon: x }) : arm === ION ? createIonReadout(ionCard, x) : createScReadout(scCard, x));
  const decoderComparison = [];
  const pGateOf = new Map();
  for (const g of groups.filter((x) => x.r === DEM_R && DEM_D.includes(x.d) && x.pair[0] && x.pair[1])) {
    for (const l of [0, 1]) pGateOf.set(g.pair[l].file, estimatePGate(det.get(g.pair[l].file), g.d, g.r).p);
    const noiseOf = {
      naive: (file) => ({ model: 'naive', pGate: pGateOf.get(file) }),
      learned: () => ({ model: 'learned', rates: g.classes }),
    };
    DEM_ARMS.forEach(({ arm, xs }, a) => {
      xs.forEach((x, xi) => {
        const readout = makeReadout(arm, x);
        for (const mode of DEM_MODES) {
          const row = { arm, x, d: g.d, r: g.r, basis: g.basis, mode };
          for (const decoder of ['naive', 'learned']) {
            const p = pooledPoint(g.pair, { readout, mode, noiseOf: noiseOf[decoder], seedOf: (logical, draw) => seedForDem(a, xi, g.d, logical, draw), draws: DEM_DRAWS });
            nonExact += p.nonExact;
            delete p.nonExact;
            row[decoder] = p;
          }
          decoderComparison.push(row);
        }
      });
    });
  }

  const runtimeS = (Date.now() - t0) / 1000;
  const result = {
    schema: 's2s-results/1',
    stage: 'dem',
    banks: bankRows,
    ratioXoverZ,
    outOfSample,
    outOfSamplePooled,
    decoderComparison,
    params: {
      bases,
      method: 'estimateEdgeRates (dem.js, DECISIONS E3); classes clamped to [1e-5, 0.5)',
      outOfSample: { readout: 'flat', epsilon: DEM_OOS_EPS, mode: 'hard', naive: 'estimatePGate of the training bank', learned: 'estimateEdgeRates of the training bank' },
      decoderComparison: {
        arms: DEM_ARMS.map(({ arm, xName, xs }) => ({ arm, xName, xs })), distances: DEM_D, r: DEM_R, modes: DEM_MODES, readoutDrawsPerShot: DEM_DRAWS,
        logical_states: 'pooled (L0 + L1)', naive: 'estimatePGate per bank, readout off', learned: 'ratesFromBanks(L0, L1) per (d, r, basis)',
        cards: { [ION]: ionCard, [SC]: scCard },
      },
      ratioXoverZ: 'bulk detector firing rate (estimatePGate rate) X over Z; delta-method interval on ln ratio, detectors treated as independent',
      intervals: 'Wilson 95%',
    },
    provenance: {
      tool: 'tools/sweep.mjs --stage dem',
      commit: gitCommit(),
      date: new Date().toISOString(),
      node: process.version,
      params: [ION_PARAMS, SC_PARAMS],
      banks: groups.flatMap((g) => [0, 1].filter((l) => g.pair[l]).map((l) => g.pair[l].file)),
      bankJobIds: Object.fromEntries(groups.flatMap((g) => [0, 1].filter((l) => g.pair[l]).map((l) => [g.pair[l].file, g.pair[l].bank.job_id ?? 'unknown']))),
      seedRule: 'decoderComparison seed = 5000000 + 100000*armIndex + 10000*xIndex + 100*d + 10*logical + draw (hard and soft, naive and learned share it); outOfSample seed = 5900000 + 100*d + 10*r + testedLogical (both decoders share it)',
      nonExact,
      runtime_s: runtimeS,
    },
  };
  mkdirSync(RESULTS_DIR, { recursive: true });
  const out = join(RESULTS_DIR, DEM_FILE);
  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);

  const g4 = (v) => v.toFixed(4);
  console.log('\nLearned edge classes (L0 + L1 pooled): space / spaceBoundary / time / diag (antiDiag), naive pGate');
  for (const b of bankRows) {
    const c = b.classes;
    console.log(`  ${b.basis} d = ${b.d} r = ${b.r}: ${g4(c.space)} / ${g4(c.spaceBoundary)} / ${g4(c.time)} / ${g4(c.diag)} (${g4(b.antiDiag)}), pGate ${g4(b.pGateNaive)}, n = ${b.nShots}`);
  }
  if (ratioXoverZ.length) {
    console.log('\nO4: X/Z bulk detector-rate ratio');
    for (const r of ratioXoverZ) console.log(`  d = ${r.d} r = ${r.r}: ${r.ratio.toFixed(3)} [${r.lo.toFixed(3)}, ${r.hi.toFixed(3)}]`);
  }
  const w3 = (o) => `${fmt(o.pL)} [${fmt(o.lo)}, ${fmt(o.hi)}]`;
  console.log(`\nV12b: out of sample, flat epsilon ${DEM_OOS_EPS}, hard (Wilson 95%)`);
  for (const o of outOfSample) console.log(`  ${o.basis} d = ${o.d} r = ${o.r} ${o.trainedOn} -> ${o.testedOn}: naive ${w3(o.naive)}  learned ${w3(o.learned)}`);
  console.log('  pooled over both directions:');
  for (const o of outOfSamplePooled) {
    const verdict = o.learnedBelowBeyondIntervals ? 'learned below naive beyond the intervals' : o.learnedAtOrBelowNaive ? 'learned <= naive' : 'learned ABOVE naive';
    console.log(`  ${o.basis} d = ${o.d} r = ${o.r}: naive ${w3(o.naive)} (k ${o.naive.k})  learned ${w3(o.learned)} (k ${o.learned.k})  ${verdict}`);
  }
  console.log(`\nDecoder comparison, r = ${DEM_R}, L0 + L1 pooled, R = ${DEM_DRAWS} (naive -> learned)`);
  for (const c of decoderComparison) {
    const beyond = c.learned.hi < c.naive.lo ? '  learned lower beyond intervals' : c.learned.lo > c.naive.hi ? '  learned HIGHER beyond intervals' : '';
    console.log(`  ${c.basis} ${c.arm.padEnd(15)} x ${String(c.x).padEnd(5)} d = ${c.d} ${c.mode.padEnd(4)}: ${w3(c.naive)} -> ${w3(c.learned)}${beyond}`);
  }
  console.log(`\nnon-exact matchings: ${nonExact}`);
  console.log(`wrote ${out} (runtime ${runtimeS.toFixed(1)} s)`);
}

const USAGE = 'usage: node tools/sweep.mjs --stage 1 | 2 | 3 | 4 [--decoder naive | learned | both] [--basis Z | X]\n'
  + '       node tools/sweep.mjs --stage dem\n'
  + '       node tools/sweep.mjs --diag [--decoder naive | learned | both]';

function parseArgs(argv) {
  const opts = { stage: null, diag: false, decoder: null, basis: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--diag') opts.diag = true;
    else if (a === '--stage' || a === '--decoder' || a === '--basis') {
      if (i + 1 >= argv.length) throw new UsageError(`${a} needs a value`);
      opts[a.slice(2)] = argv[++i];
    } else throw new UsageError(`unknown argument ${a}`);
  }
  if (opts.decoder !== null && !['naive', 'learned', 'both'].includes(opts.decoder)) throw new UsageError(`--decoder must be naive, learned or both, got ${opts.decoder}`);
  if (opts.basis !== null && !['Z', 'X'].includes(opts.basis)) throw new UsageError(`--basis must be Z or X, got ${opts.basis}`);
  if (opts.diag === (opts.stage !== null)) throw new UsageError('give exactly one of --stage or --diag');
  if (opts.stage !== null && !['1', '2', '3', '4', 'dem'].includes(opts.stage)) throw new UsageError(`unknown stage ${opts.stage}`);
  if (opts.diag && opts.basis !== null) throw new UsageError(`--diag reads ${DIAG_BANK} (Z basis) only; drop --basis`);
  if (opts.stage === 'dem' && (opts.decoder !== null || opts.basis !== null)) throw new UsageError('--stage dem always runs both decoders on every available basis; drop --decoder and --basis');
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.diag) {
    // --diag alone prints V9 exactly as before; --decoder learned prints V9L.
    const bank = loadBank(DIAG_BANK);
    const decoder = opts.decoder ?? 'naive';
    if (decoder === 'both') {
      console.log(`V9  ${diagnostic(bank)}`);
      console.log(`V9L ${diagnostic(bank, { decoder: 'learned' })}`);
    } else {
      console.log(diagnostic(bank, { decoder }));
    }
    return;
  }
  if (opts.stage === 'dem') {
    stageDem();
    return;
  }
  const decoders = (opts.decoder ?? 'both') === 'both' ? ['naive', 'learned'] : [opts.decoder];
  const run = { 1: stage1, 2: stage2, 3: stage3, 4: stage4 }[opts.stage];
  run({ decoders, basis: opts.basis ?? 'Z' });
}

// Run only as a script, so tests can import the exported helpers without starting a stage.
const self = fileURLToPath(import.meta.url);
const invoked = process.argv[1] ? resolve(process.argv[1]) : '';
const isMain = process.platform === 'win32' ? self.toLowerCase() === invoked.toLowerCase() : self === invoked;
if (isMain) {
  try {
    main();
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    console.error(`sweep.mjs: ${e.message}\n${USAGE}`);
    process.exit(1);
  }
}
