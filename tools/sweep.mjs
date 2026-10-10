// Sweeps of the logical error rate against readout settings.
//
//   node tools/sweep.mjs --stage 1   flat readout over epsilon; writes data/results/stage1_flat.json
//   node tools/sweep.mjs --stage 2   trapped-ion readout over tau; writes data/results/stage2_ion.json
//   node tools/sweep.mjs --stage 3   superconducting readout over tau; writes data/results/stage3_sc.json
//   node tools/sweep.mjs --stage 4   platform comparison (learned decoder): trade-off, budget at the optimum,
//                                    break-even, sensitivity, conclusions C1-C6 and O4, findings; writes
//                                    data/results/stage4_comparison.json (reads the STAGE4_INPUTS files in
//                                    both bases, stage3_sc_x_T2_25.json, holdout.json, dem_forte1.json and
//                                    params/cycle.json, ion.json, sc.json; refuses a file whose card differs
//                                    from params/ other than through a recorded override).
//                                    With --basis X: stage4_comparison_x.json, tradeoff, perRound,
//                                    perMicrosecond, tauLog and budgetAtOptimum only.
//   node tools/sweep.mjs --stage dem learned edge rates, out-of-sample check (V12b) and naive
//                                    against learned decoding; writes data/results/dem_forte1.json
//   node tools/sweep.mjs --stage holdout   V18 (learned against naive on the held-out banks in
//                                    data/banks/heldout/, rates and pGate from the original banks only)
//                                    and F1 out of sample; writes data/results/holdout.json
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
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBank, expandShots, split } from '../src/core/bank.js';
import { computeDetectors } from '../src/core/detectors.js';
import { estimatePGate } from '../src/core/calibrate.js';
import { estimateEdgeRates, ratesFromBanks } from '../src/core/dem.js';
import { wilson, clusterBootstrapRate, pairedClusterDiff } from '../src/core/stats.js';
import { createRng } from '../src/core/rng.js';
import { createFlatReadout } from '../src/core/readout/flat.js';
import { createIonReadout } from '../src/core/readout/ion.js';
import { createScReadout } from '../src/core/readout/sc.js';
import { erfc } from '../src/core/special.js';
import { runPoint, diagnostic, decodeShot } from '../src/core/sweep.js';
import { findMinimum, minimumWithBootstrap } from '../src/core/optimum.js';
import { perRound, cycleTime, perMicrosecond, breakEvenDetail, roundsPerSecond, tradeoffCurve, dominance } from '../src/core/metrics.js';

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
// the same as integer failure counts in 0..draws (failCounts, for the cluster statistics),
// seeds, the banks used and the number of non-exact matchings.
function f2Sweep({ distances, byKey, r, taus, readouts, modes, decoders, seedOf, cal, rates, basis, draws = READOUT_DRAWS }) {
  const perShot = new Map();
  const failCounts = new Map();
  const series = [];
  const perLogical = [];
  const seeds = {};
  const used = [];
  let nonExact = 0;
  for (const decoder of decoders) {
    for (const d of distances) {
      const nShots = [0, 1].map((logical) => expandShots(byKey.get(`${d},${r},${logical}`).bank).length);
      const nPooled = nShots[0] + nShots[1];
      for (const mode of modes) {
        perShot.set(keyOf(decoder, d, mode), taus.map(() => new Float64Array(nPooled)));
        failCounts.set(keyOf(decoder, d, mode), taus.map(() => new Uint8Array(nPooled)));
      }
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
            const fails = failCounts.get(keyOf(decoder, d, mode))[t];
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
                  fails[offset + s]++;
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
  return { perShot, failCounts, series, perLogical, seeds, used, nonExact };
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

// ---- Cluster and paired statistics (CC-A19, team checklist U4 revision 2.1) ----
// Every interval below resamples quantum shots (the R readout draws of one shot share its gate
// faults). Seeds are fixed and do not depend on the decoder (common random numbers):
//   series loCluster/hiCluster   base + 10000*d + 1000*modeIndex + tauIndex
//   paired softMinusHard         base + 100000 + 10000*d + tauIndex
//   paired learnedMinusNaive     base + 200000 + 10000*d + 1000*modeIndex + tauIndex
//   shiftDelta                   base + 300000 + 10000*d + 1000*modeIndex
// with modeIndex 0 hard, 1 soft, and base CLUSTER_SEED[stage] (+ 1000000*rateIndex in the scan).
const CLUSTER_B = 500;
const CLUSTER_SEED = { 2: 2600000, 3: 3600000, xt: 27000000 };
const CLUSTER_SEED_RULE = 'cluster bootstrap B = 500 over quantum shots; seed = base + 10000*d + 1000*modeIndex + tauIndex (series), base + 100000 + 10000*d + tauIndex (softMinusHard), base + 200000 + 10000*d + 1000*modeIndex + tauIndex (learnedMinusNaive), base + 300000 + 10000*d + 1000*modeIndex (shiftDelta); modeIndex hard 0, soft 1; base 2600000 (Stage 2), 3600000 (Stage 3), 27000000 + 1000000*rateIndex (crosstalk scan); the same for both decoders';
const modeIndex = (mode) => (mode === 'soft' ? 1 : 0);
// The dense superconducting grid (--dense): 0.40, 0.45, ..., 1.30 us, and shiftDelta's step on it.
const DENSE_BAND = Array.from({ length: 19 }, (_, i) => (40 + 5 * i) / 100);
const DENSE_SHORT_STEP = 0.15;
const sameTau = (a, b) => Math.abs(a - b) < 1e-9;

// Adds loCluster and hiCluster (cluster bootstrap over quantum shots, 95%) to every series.
function addClusterIntervals(series, failCounts, draws, base) {
  for (const s of series) {
    const rows = failCounts.get(keyOf(s.decoder, s.d, s.mode));
    const cs = rows.map((fc, t) => clusterBootstrapRate(fc, draws, CLUSTER_B, createRng(base + 10000 * s.d + 1000 * modeIndex(s.mode) + t)));
    s.loCluster = cs.map((c) => round(c.lo));
    s.hiCluster = cs.map((c) => round(c.hi));
  }
}

// Paired differences on the same quantum shots and readout draws: softMinusHard per (decoder,
// d, tau), and learnedMinusNaive per (mode, d, tau) when both decoders ran.
function pairedTable({ taus, distances, modes, decoders, failCounts, draws, base }) {
  const out = [];
  const pd = (a, b, seed) => {
    const p = pairedClusterDiff(a, b, draws, CLUSTER_B, createRng(seed));
    return { diff: round(p.diff), lo: round(p.lo), hi: round(p.hi) };
  };
  if (modes.includes('hard') && modes.includes('soft')) {
    for (const decoder of decoders) {
      for (const d of distances) {
        const soft = failCounts.get(keyOf(decoder, d, 'soft'));
        const hard = failCounts.get(keyOf(decoder, d, 'hard'));
        taus.forEach((x, t) => out.push({ kind: 'softMinusHard', decoder, d, x, ...pd(soft[t], hard[t], base + 100000 + 10000 * d + t) }));
      }
    }
  }
  if (decoders.includes('naive') && decoders.includes('learned')) {
    for (const mode of modes) {
      for (const d of distances) {
        const learned = failCounts.get(keyOf('learned', d, mode));
        const naive = failCounts.get(keyOf('naive', d, mode));
        taus.forEach((x, t) => out.push({ kind: 'learnedMinusNaive', mode, d, x, ...pd(learned[t], naive[t], base + 200000 + 10000 * d + 1000 * modeIndex(mode) + t) }));
      }
    }
  }
  return out;
}

// Grid points of shiftDelta (pre-specified, CC-A19): tauRef = the grid point nearest tauPhys
// in ln tau (the lower one on a tie); tauShort = the grid point immediately below tauRef, or on
// the dense grid the point DENSE_SHORT_STEP us below tauRef. null when there is no such point.
export function shiftDeltaPoints(taus, tauPhys, { dense = false } = {}) {
  let ref = 0;
  for (let i = 1; i < taus.length; i++) {
    if (Math.abs(Math.log(taus[i] / tauPhys)) < Math.abs(Math.log(taus[ref] / tauPhys))) ref = i;
  }
  const short = dense ? taus.findIndex((x) => sameTau(x, taus[ref] - DENSE_SHORT_STEP)) : ref - 1;
  return short < 0 ? null : { ref, short };
}

// shiftDelta of one curve from its per-shot failure counts (rows[t] over the same quantum
// shots at every tau): diff = pL(tauRef) - pL(tauShort) with the paired cluster interval;
// resolved when lo > 0 (pL rises from tauShort to tauRef, so the optimum lies below tauRef).
export function shiftDelta(taus, tauPhys, rows, draws, B, rng, { dense = false } = {}) {
  const pts = shiftDeltaPoints(taus, tauPhys, { dense });
  if (pts === null) return { tauRef: null, tauShort: null, diff: null, lo: null, hi: null, resolved: false, note: 'no grid point below tauRef' };
  const p = pairedClusterDiff(rows[pts.ref], rows[pts.short], draws, B, rng);
  return { tauRef: taus[pts.ref], tauShort: taus[pts.short], diff: round(p.diff), lo: round(p.lo), hi: round(p.hi), resolved: p.lo > 0 };
}

function shiftDeltaOf(taus, tauPhys, failCounts, { decoder, d, mode }, draws, base, dense) {
  const rng = createRng(base + 300000 + 10000 * d + 1000 * modeIndex(mode));
  return shiftDelta(taus, tauPhys, failCounts.get(keyOf(decoder, d, mode)), draws, CLUSTER_B, rng, { dense });
}

// --dense tau grid: the card grid with 0.40, 0.45, ..., 1.30 us added, ascending, no repeats.
export function denseGrid(grid) {
  const out = [...grid];
  for (const x of DENSE_BAND) if (!out.some((g) => sameTau(g, x))) out.push(x);
  return out.sort((a, b) => a - b);
}

// --set key=value: overrides card fields after loading. Unknown keys are refused; the value is
// read as JSON (numbers, booleans, arrays), else kept as a string. A field stored as
// { value, source } keeps its object form with the new value and source "override (--set)".
export function applyOverrides(card, sets) {
  let out = card;
  const overrides = {};
  for (const item of sets) {
    const eq = item.indexOf('=');
    if (eq <= 0) throw new UsageError(`--set expects key=value, got ${item}`);
    const key = item.slice(0, eq);
    const raw = item.slice(eq + 1);
    if (!Object.hasOwn(card, key) || key === 'schema' || key === 'platform') throw new UsageError(`--set: unknown parameter-card key ${key}`);
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      value = raw;
    }
    out = out[key] !== null && typeof out[key] === 'object' && !Array.isArray(out[key])
      ? { ...out, [key]: { ...out[key], value, source: 'override (--set)' } }
      : { ...out, [key]: value };
    overrides[key] = value;
  }
  return { card: out, overrides };
}

// Results path: --out if given (refused if the file exists: results files are never
// overwritten), else the stage's default file.
function outPath(opts, defaultName) {
  if (!opts.out) return join(RESULTS_DIR, defaultName);
  if (existsSync(opts.out)) throw new UsageError(`--out ${opts.out} exists; results files are never overwritten`);
  return opts.out;
}

function writeResult(out, result) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
}

// The extra options as they appear in provenance.tool.
const extraArgs = (opts) => `${opts.dense ? ' --dense' : ''}${opts.set.map((s) => ` --set ${s}`).join('')}${opts.out ? ` --out ${opts.out}` : ''}`;

function printShiftDeltas(rows, xDigits) {
  console.log('\nshiftDelta (pre-specified, paired cluster bootstrap): pL(tauRef) - pL(tauShort); resolved when lo > 0');
  for (const m of rows) {
    const s = m.shiftDelta;
    const head = `  ${(m.decoder ?? 'learned').padEnd(7)} d = ${m.d} ${m.mode.padEnd(4)}`;
    if (s.tauRef === null) console.log(`${head}: ${s.note}`);
    else console.log(`${head}: tauRef ${fmt(s.tauRef, xDigits)} tauShort ${fmt(s.tauShort, xDigits)}  diff ${s.diff.toExponential(2)} [${s.lo.toExponential(2)}, ${s.hi.toExponential(2)}]${s.resolved ? '  RESOLVED' : ''}`);
  }
}

function printPairedSummary(paired) {
  for (const kind of ['softMinusHard', 'learnedMinusNaive']) {
    const rows = paired.filter((p) => p.kind === kind);
    if (rows.length === 0) continue;
    console.log(`  paired ${kind}: below 0 beyond the interval at ${rows.filter((p) => p.hi < 0).length} of ${rows.length} points, above 0 beyond it at ${rows.filter((p) => p.lo > 0).length}`);
  }
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

function stage1({ decoders, basis, opts }) {
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
      tool: `tools/sweep.mjs --stage 1 --decoder ${decoderArg(decoders)} --basis ${basis}${extraArgs(opts)}`,
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
  const out = outPath(opts, resultFile('stage1_flat.json', basis));
  writeResult(out, result);

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

function stage2({ decoders, basis, opts }) {
  const t0 = Date.now();
  const { card, overrides } = applyOverrides(JSON.parse(readFileSync(ION_PARAMS, 'utf8')), opts.set);
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
  const { perShot, failCounts, series, perLogical, seeds, used, nonExact: nonExactTotal } = f2Sweep({
    distances, byKey, r: STAGE2_R, taus, readouts, modes: STAGE2_MODES, decoders, seedOf: seedFor2, cal, rates, basis,
  });
  addClusterIntervals(series, failCounts, READOUT_DRAWS, CLUSTER_SEED[2]);
  const paired = pairedTable({ taus, distances, modes: STAGE2_MODES, decoders, failCounts, draws: READOUT_DRAWS, base: CLUSTER_SEED[2] });

  // Optima. tau*_phys from the belief curve; tau*_log per decoder, distance and mode from the
  // per-shot values, bootstrapped over pooled quantum shots.
  const tauPhys = findMinimum(taus, assignment.belief, { logX: true });
  const tauPhysNoPump = findMinimum(taus, f1Detail.map((f) => f.beliefNoPumping), { logX: true });
  const tauLog = tauLogTable({ taus, distances, modes: STAGE2_MODES, decoders, perShot, bootSeed: BOOT_SEED });
  for (const m of tauLog) m.shiftDelta = shiftDeltaOf(taus, tauPhys.xMin, failCounts, m, READOUT_DRAWS, CLUSTER_SEED[2], false);

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
  const xtPaired = [];
  let xtNonExact = 0;
  for (const [rateIndex, rate] of xtRates.entries()) {
    const xtBase = CLUSTER_SEED.xt + 1000000 * rateIndex;
    const xtReadouts = taus.map((tau) => createIonReadout(card, tau, { crosstalkRate: rate }));
    const sw = f2Sweep({
      distances: XT_DISTANCES, byKey, r: STAGE2_R, taus, readouts: xtReadouts, modes: STAGE2_MODES, decoders: ['learned'],
      seedOf: seedForXt, cal, rates: xtLearned, basis, draws: XT_DRAWS,
    });
    xtNonExact += sw.nonExact;
    addClusterIntervals(sw.series, sw.failCounts, XT_DRAWS, xtBase);
    for (const p of pairedTable({ taus, distances: XT_DISTANCES, modes: STAGE2_MODES, decoders: ['learned'], failCounts: sw.failCounts, draws: XT_DRAWS, base: xtBase })) xtPaired.push({ rate, ...p });
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
        loCluster: s.loCluster, hiCluster: s.hiCluster,
        shiftDelta: shiftDeltaOf(taus, tauPhys.xMin, sw.failCounts, s, XT_DRAWS, xtBase, false),
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
    paired: xtPaired,
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
    paired,
    optima: {
      tauPhys: { xMin: round(tauPhys.xMin), atEdge: tauPhys.atEdge },
      tauPhysEmpirical: { xMin: round(tauPhysEmp.xMin), atEdge: tauPhysEmp.atEdge },
      tauLog: tauLog.map(({ d, mode, decoder, xMin, lo, hi, atEdge, fractionAtEdge, fractionTied, shiftDelta: sd }) => ({ d, mode, decoder, xMin, lo, hi, atEdge, fractionAtEdge, fractionTied, shiftDelta: sd })),
    },
    params: {
      card,
      overrides,
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
      tool: `tools/sweep.mjs --stage 2 --decoder ${decoderArg(decoders)} --basis ${basis}${extraArgs(opts)}`,
      commit: gitCommit(),
      date: new Date().toISOString(),
      node: process.version,
      params: ION_PARAMS,
      banks: used,
      bankJobIds: Object.fromEntries(used.map((f) => [f, byKey.get(`${f.match(/_d(\d+)_/)[1]},${STAGE2_R},${f.match(/_L(\d)/)[1]}`).bank.job_id ?? 'unknown'])),
      pGate: Object.fromEntries(used.map((f) => [f, round(cal.get(f).p)])),
      seeds,
      seedRule: 'seed = 2000000 + 10000*d + 1000*logical + 10*tauIndex + draw (hard and soft, and both decoders, share it); F1 seed 201; V7 seed 1201 + tauIndex; bootstrap seed 202 + 10*d + (soft ? 1 : 0)',
      clusterSeedRule: CLUSTER_SEED_RULE,
      shiftDeltaRule: 'tauRef = grid point nearest optima.tauPhys (belief) in ln tau; tauShort = the grid point below it; diff = pL(tauRef) - pL(tauShort), paired over the same quantum shots; resolved = lo > 0',
      grid: 'standard',
      overrides,
      nonExact: nonExactTotal,
      runtime_s: runtimeS,
    },
  };
  const out = outPath(opts, resultFile('stage2_ion.json', basis));
  writeResult(out, result);

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
  printPairedSummary(paired);
  printShiftDeltas(tauLog, 2);
  printBudget(budget, g);
  console.log(`\nCrosstalk scan (C1, ion part): learned decoder, d = ${XT_DISTANCES.join(', ')}, R = ${XT_DRAWS}, tau*_phys = ${fmt(tauPhys.xMin, 2)} us, card rate ${g(crosstalkScan.cardRate_per_us)} /us (${crosstalkScan.runtime_s.toFixed(1)} s)`);
  for (const rate of xtRates) {
    const es = xtEntries.filter((e) => e.rate === rate);
    const any = crosstalkScan.perRate.find((p) => p.rate === rate).interiorBelowTauPhys;
    console.log(`  rate ${rate === 0 ? '0' : g(rate)} /us: interior tau*_log < tau*_phys ${any ? 'EXISTS' : 'none'}`);
    for (const e of es) {
      const t = e.tauLog;
      const where = t.atEdge ? `at grid edge (tau ${t.xMin})` : `${fmt(t.xMin, 2)} us [${fmt(t.lo, 2)}, ${fmt(t.hi, 2)}]`;
      const sd = e.shiftDelta.tauRef === null ? '' : `  shiftDelta ${e.shiftDelta.diff.toExponential(2)} [${e.shiftDelta.lo.toExponential(2)}, ${e.shiftDelta.hi.toExponential(2)}]${e.shiftDelta.resolved ? ' RESOLVED' : ''}`;
      console.log(`    d = ${e.d} ${e.mode.padEnd(4)}: tau*_log ${where}${e.interiorBelowTauPhys ? ' < tau*_phys' : ''}${e.interiorBelowTauPhysResolved ? ' (beyond bootstrap interval)' : ''}${sd}  pL ${e.pL.map((p) => fmt(p)).join(' ')}`);
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

function stage3({ decoders, basis, opts }) {
  const t0 = Date.now();
  if (!existsSync(SC_PARAMS)) throw new Error(`${SC_PARAMS} not found: create the superconducting parameter card first (team checklist Appendix T6)`);
  const { card, overrides } = applyOverrides(JSON.parse(readFileSync(SC_PARAMS, 'utf8')), opts.set);
  const taus = opts.dense ? denseGrid(fieldValue(card, 'tau_grid_us')) : fieldValue(card, 'tau_grid_us');
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
  const { perShot, failCounts, series, perLogical, seeds, used, nonExact: nonExactTotal } = f2Sweep({
    distances, byKey, r: STAGE3_R, taus, readouts, modes: STAGE3_MODES, decoders, seedOf: seedFor3, cal, rates, basis,
  });
  addClusterIntervals(series, failCounts, READOUT_DRAWS, CLUSTER_SEED[3]);
  const paired = pairedTable({ taus, distances, modes: STAGE3_MODES, decoders, failCounts, draws: READOUT_DRAWS, base: CLUSTER_SEED[3] });

  // Optima. tau*_phys from the belief curve; tau*_log per decoder, distance and mode from the
  // per-shot values, bootstrapped over pooled quantum shots.
  const tauPhys = findMinimum(taus, assignment.belief, { logX: true });
  const tauPhysEmp = findMinimum(taus, assignment.empirical, { logX: true });
  const tauLog = tauLogTable({ taus, distances, modes: STAGE3_MODES, decoders, perShot, bootSeed: BOOT_SEED3 });
  for (const m of tauLog) m.shiftDelta = shiftDeltaOf(taus, tauPhysEmp.xMin, failCounts, m, READOUT_DRAWS, CLUSTER_SEED[3], opts.dense);

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
    paired,
    optima: {
      tauPhys: { xMin: round(tauPhys.xMin), atEdge: tauPhys.atEdge },
      tauPhysEmpirical: { xMin: round(tauPhysEmp.xMin), atEdge: tauPhysEmp.atEdge },
      tauLog: tauLog.map(({ d, mode, decoder, xMin, lo, hi, atEdge, fractionAtEdge, fractionTied, shiftDelta: sd }) => ({ d, mode, decoder, xMin, lo, hi, atEdge, fractionAtEdge, fractionTied, shiftDelta: sd })),
    },
    params: {
      card,
      overrides,
      tauGrid: opts.dense ? 'dense: the card grid with 0.40, 0.45, ..., 1.30 us added (x.values)' : 'the card grid',
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
      tool: `tools/sweep.mjs --stage 3 --decoder ${decoderArg(decoders)} --basis ${basis}${extraArgs(opts)}`,
      commit: gitCommit(),
      date: new Date().toISOString(),
      node: process.version,
      params: SC_PARAMS,
      banks: used,
      bankJobIds: Object.fromEntries(used.map((f) => [f, byKey.get(`${f.match(/_d(\d+)_/)[1]},${STAGE3_R},${f.match(/_L(\d)/)[1]}`).bank.job_id ?? 'unknown'])),
      pGate: Object.fromEntries(used.map((f) => [f, round(cal.get(f).p)])),
      seeds,
      seedRule: 'seed = 3000000 + 10000*d + 1000*logical + 10*tauIndex + draw (hard and soft, and both decoders, share it); F1 seed 301; V8 seed 1301 + tauIndex; V10 seed 2301 + tauIndex; bootstrap seed 302 + 10*d + (soft ? 1 : 0)',
      clusterSeedRule: CLUSTER_SEED_RULE,
      shiftDeltaRule: `tauRef = grid point nearest optima.tauPhysEmpirical in ln tau; tauShort = ${opts.dense ? 'the grid point 0.15 us below it (dense grid)' : 'the grid point below it'}; diff = pL(tauRef) - pL(tauShort), paired over the same quantum shots; resolved = lo > 0`,
      grid: opts.dense ? 'dense' : 'standard',
      overrides,
      nonExact: nonExactTotal,
      runtime_s: runtimeS,
    },
  };
  const out = outPath(opts, resultFile('stage3_sc.json', basis));
  writeResult(out, result);

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
  printPairedSummary(paired);
  printShiftDeltas(tauLog, 3);
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
// Stage 4 inputs (CC-A22, revision 2.1): per basis and arm, the first file in the list that
// exists. The C6 variant card and the held-out results are read when present.
export const STAGE4_INPUTS = {
  Z: { [ION]: ['stage2_ion_v2b.json'], [SC]: ['stage3_sc_dense.json'] },
  X: { [ION]: ['stage2_ion_x_v2b.json'], [SC]: ['stage3_sc_x_dense.json', 'stage3_sc_x.json'] },
};
const C6_VARIANT_FILE = 'stage3_sc_x_T2_25.json';
// Sensitivity (CC-A22): three parameters, each x0.5 and x2, at full statistics: every shot of
// the Z-basis banks, R = 2 readout draws, learned decoder, cluster intervals, tau*_log from the
// grid minimum (no bootstrap). Only the arm that owns the parameter is rerun.
export const SENS_ROWS = [
  { platform: ION, parameter: 'gamma_dark_to_bright_per_us' },
  { platform: SC, parameter: 'eta' },
  { platform: SC, parameter: 'T1_us' },
];
const SENS_SCALES = [0.5, 2];
const SENS_DRAWS = 2;
const SENS_MAX_MINUTES = 45;
const SENS_F1_SAMPLES = 50000;
const SENS_F1_SEED = 402;
// Seed of one (platform, d, logical, tau index, draw): the same in the baseline and in every
// scaled run (common random numbers, so the paired difference against the baseline is valid);
// hard and soft share it.
const seedForSens = (platform, d, logical, tauIndex, draw) => 4000000 + (platform === SC ? 100000 : 0) + 10000 * d + 1000 * logical + 10 * tauIndex + draw;
const SENS_CLUSTER_SEED = { [ION]: 4600000, [SC]: 4700000 };
// Tie rule (DECISIONS E12, from A49): a tau*_log with fractionTied >= 0.5 is UNRESOLVED and
// takes no part in a verdict.
const TIED_MAX = 0.5;
const unresolved = (tl) => (tl?.fractionTied ?? 0) >= TIED_MAX;

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

// Bounds of a pL interval through the per-round transform and on to per microsecond (monotone,
// so the bounds map to bounds).
export function perRoundBounds(lo, hi, r, cycleUs) {
  const pr = [lo, hi].map((p) => perRound(p, r));
  return { perRound: { lo: pr[0], hi: pr[1] }, perMicrosecond: { lo: perMicrosecond(pr[0], cycleUs), hi: perMicrosecond(pr[1], cycleUs) } };
}

// Table P of one platform: tau*_log, the per-round and per-microsecond logical error at
// tau*_log (pL and its bounds interpolated linearly in ln tau; at the best grid point when
// tau*_log is at the grid edge), and the break-even assignment error between d = 3 and d = 5.
// lo/hi are the Wilson bounds through the same transform; loCluster/hiCluster the cluster
// bounds (CC-A19), when the series carry them.
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
      const at = (ys) => atTau(arm.taus, ys, tau);
      const pL = [s.pL, s.lo, s.hi].map(at);
      const eps = pL.map((p) => perRound(p, s.r));
      const tcyc = cycleTime(cycleCard, tau, d);
      const lam = eps.map((e) => perMicrosecond(e, tcyc));
      const hasCluster = Array.isArray(s.loCluster) && Array.isArray(s.hiCluster);
      const cl = hasCluster ? [at(s.loCluster), at(s.hiCluster)] : null;
      const cb = cl ? perRoundBounds(cl[0], cl[1], s.r, tcyc) : null;
      const withCl = (o, b) => (b ? { ...o, loCluster: b.lo, hiCluster: b.hi } : o);
      P.tauLog[mode].push({ d, xMin: tau, lo: tl.lo ?? null, hi: tl.hi ?? null, atEdge: tl.atEdge, fractionTied: tl.fractionTied ?? null, unresolved: unresolved(tl) });
      P.pLAtTauLog[mode].push(withCl({ d, r: s.r, tau_us: tau, value: pL[0], lo: pL[1], hi: pL[2] }, cl && { lo: cl[0], hi: cl[1] }));
      P.perRound[mode].push(withCl({ d, value: eps[0], lo: eps[1], hi: eps[2] }, cb && cb.perRound));
      P.perMicrosecond[mode].push(withCl({ d, value: lam[0], lo: lam[1], hi: lam[2], cycle_us: tcyc }, cb && cb.perMicrosecond));
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

// ---- Stage 4 v2 (CC-A15, final form CC-A22): trade-off, budget at the optimum, conclusions
// C1-C6 and O4, findings, sensitivity ----

const FRAMING = 'Two readout physics models at fixed gate noise: the same IonQ forte-1 banks and learned decoder; different readout models, idle physics and cycle times.';
const BASES = ['Z', 'X'];
// Pre-registered statements (team checklist Section 1.2, verbatim).
const STATEMENTS = {
  C1: 'Superconducting: τ*_log < τ*_phys (empirical), with the learned decoder, in both bases. Trapped ion with crosstalk off: no idle-driven optimum. Trapped ion with crosstalk at the card value: an interior τ*_log < τ*_phys appears',
  C2: 'Soft decoding is at or below hard at every τ, with most gain where readouts are short',
  C3: 'Neither readout model dominates: along the τ grids the ion arm has lower error per round and the superconducting arm more rounds per second',
  C4: 'Break-even ε̄ (d = 5 beats d = 3) similar on both arms, on the empirical ε̄ axis',
  C5: 'The learned detector error model lowers the logical error against the naive one at every (d, arm, mode) at τ*_log, out of sample',
  C6: 'In the phase-flip memory the superconducting τ*_log is shorter than in the bit-flip memory when T2 < T1',
  O4: 'Ratio of bulk detector rates, X-basis to Z-basis banks, per (d, r): how biased forte-1 noise looks to the decoder (measurement, no hypothesis)',
};
// Draft plain-language sentences (at most 20 words each; Person A edits them at A55), per
// conclusion and verdict, for the finding F1 and for the framing.
export const PLAIN = {
  framing: 'Same IonQ-simulated circuits and gate noise, two ways of reading qubits out: a controlled comparison, not a hardware benchmark.',
  C1: {
    held: 'The code’s best readout time is shorter than the best time for reading one qubit.',
    refuted: 'In neither qubit type does the code reliably want a shorter readout than a single qubit does.',
    undetermined: 'The data cannot yet say whether the code prefers a shorter readout than one qubit does.',
  },
  C2: {
    held: 'Weighing each readout by its confidence never hurt with the learned decoder, and helped most for short readouts.',
    refuted: 'Using readout confidence sometimes makes decoding worse, even with the learned decoder.',
    undetermined: 'The data cannot yet say whether using readout confidence always helps.',
  },
  C3: {
    held: 'The ion makes fewer errors per round, the superconducting qubit more rounds per second; our parameters guaranteed this.',
    refuted: 'One qubit type is both more accurate per round and faster, with these cards.',
    undetermined: 'The data cannot separate the two qubit types on accuracy per round and speed.',
  },
  C4: {
    held: 'Both qubit types need about the same readout quality before distance 5 beats distance 3.',
    refuted: 'The two qubit types need different readout quality before distance 5 beats distance 3.',
    undetermined: 'Undecided: on the superconducting qubit, distance 5 beat distance 3 at every readout quality tried, leaving nothing to compare.',
  },
  C5: {
    held: 'Learning the noise from the data never made decoding worse, and usually made it clearly better.',
    refuted: 'Learning the noise from the data made decoding worse somewhere.',
    undetermined: 'The data cannot yet say whether learning the noise always helps decoding.',
  },
  C6: {
    'not applicable': 'Does not apply: our superconducting qubit loses phase more slowly than energy. An invented faster-dephasing qubit leans yes, unresolved.',
    held: 'With faster dephasing, the phase-flip memory prefers a shorter readout than the bit-flip memory.',
    refuted: 'Even with faster dephasing, the phase-flip memory does not prefer a shorter readout.',
    undetermined: 'The data cannot yet say whether faster dephasing shortens the best readout time.',
  },
  O4: { undetermined: 'Measured, not tested: IonQ’s simulated gate noise looks the same to the decoder for bit flips and phase flips.' },
  F1: 'Readout confidence seemed to hurt the ion only because the first decoder ignored a common error; fresh data confirm it.',
};
const plainOf = (id, verdict) => PLAIN[id]?.[verdict] ?? '';
// v2 verdict words; a verdict is "refuted" if any part is, "held" if every part is. Callers
// leave UNRESOLVED parts out (tie rule).
const combineV2 = (verdicts) => (verdicts.includes('refuted') ? 'refuted' : verdicts.length > 0 && verdicts.every((v) => v === 'held') ? 'held' : 'undetermined');
// One conclusion (U4, revision 2.1). verdict equals automated unless Person A's reading differs,
// which the note then explains.
const conclusion = (id, automated, note, { verdict = automated, informative = true, deviations = [] } = {}) => ({
  statement: STATEMENTS[id], verdict, automated, note, plain: plainOf(id, verdict), informative, deviations,
});
const g3 = (v) => (v === null || v === undefined ? '—' : Number(v).toPrecision(3));
const iv = (lo, hi) => `[${g3(lo)}, ${g3(hi)}]`;
const signed = (v) => (v > 0 ? `+${g3(v)}` : g3(v));

// Trade-off curves of one arm (U4): per d and mode, rounds per second and error per round at
// every tau of the grid, with the per-round values of the Wilson bounds (lo, hi) and of the
// cluster bounds (loCluster, hiCluster) when the series carry them.
function tradeoffTable(arm, cycleCard) {
  const out = {};
  for (const d of arm.distances) {
    out[d] = {};
    for (const mode of STAGE4_MODES) {
      const s = arm.series.find((x) => x.d === d && x.mode === mode);
      const c = tradeoffCurve(arm.taus, s.pL, s.r, cycleCard, d);
      const pr = (ys) => ys.map((p) => round(perRound(p, s.r)));
      out[d][mode] = {
        tau: c.tau,
        roundsPerSecond: c.roundsPerSecond.map(round),
        perRound: c.perRound.map(round),
        lo: pr(s.lo),
        hi: pr(s.hi),
        ...(Array.isArray(s.loCluster) ? { loCluster: pr(s.loCluster), hiCluster: pr(s.hiCluster) } : {}),
      };
    }
  }
  return out;
}

// Error budget of one arm at its tau*_log (d = 3, hard, learned): the Stage 2/3 budget arrays
// interpolated in ln tau (as atTau); the gate part is one number.
function budgetAtOptimum(res, arm) {
  const tl = arm.tauLog.find((x) => x.d === 3 && x.mode === 'hard');
  const b = res.budget;
  if (!b || !tl) return null;
  const at = (ys) => round(atTau(b.tau_us, ys, tl.xMin));
  return { readout: at(b.readout), idle: at(b.idle), crosstalk: at(b.crosstalk), gate: round(b.gate), tau_us: tl.xMin, label: b.label, d: 3, mode: 'hard', decoder: 'learned' };
}

// The trade-off point of one arm at tau*_log (d = 3, hard): per-round error with its Wilson
// bounds (interpolated as in platformTable) and rounds per second at that tau.
function c3Point(table, cycleCard) {
  const pr = table.perRound.hard.find((u) => u.d === 3);
  const tl = table.tauLog.hard.find((u) => u.d === 3);
  return { tau_us: tl.xMin, perRound: pr.value, lo: pr.lo, hi: pr.hi, loCluster: pr.loCluster ?? null, hiCluster: pr.hiCluster ?? null, roundsPerSecond: roundsPerSecond(cycleTime(cycleCard, tl.xMin, 3)) };
}

// The input file of one (basis, arm): the first name in STAGE4_INPUTS that exists.
export function pickStage4Input(basis, platform, exists) {
  const names = STAGE4_INPUTS[basis][platform];
  const name = names.find((n) => exists(n));
  if (!name) throw new UsageError(`Stage 4 needs ${names.join(' or ')} in ${RESULTS_DIR}`);
  return name;
}

// True when a results file's card equals the parameter card after the file's recorded
// overrides (provenance.overrides, from --set); any other difference is a mismatch.
export function cardMatchesParams(fileCard, paramsCard, overrides = {}) {
  const sets = Object.entries(overrides ?? {}).map(([k, v]) => `${k}=${JSON.stringify(v)}`);
  const expected = sets.length ? applyOverrides(paramsCard, sets).card : paramsCard;
  return JSON.stringify(fileCard) === JSON.stringify(expected);
}

// Reads one results file and refuses it if its card differs from params/*.json other than
// through a recorded override.
function readCheckedResult(name, paramsCard, paramsFile, cardOf = (res) => res.params?.card) {
  const file = join(RESULTS_DIR, name);
  const res = JSON.parse(readFileSync(file, 'utf8'));
  const overrides = res.provenance?.overrides ?? {};
  if (!cardMatchesParams(cardOf(res), paramsCard, overrides)) {
    throw new Error(`${file}: its parameter card differs from ${paramsFile}${Object.keys(overrides).length ? ` beyond the recorded overrides ${JSON.stringify(overrides)}` : ''}; rerun it or record the override (CC-A22)`);
  }
  return { name, file, res, overrides };
}

// Both bases, both arms (STAGE4_INPUTS), every card checked.
function loadStage4Files(cards) {
  const exists = (n) => existsSync(join(RESULTS_DIR, n));
  const out = {};
  for (const b of BASES) {
    out[b] = { names: {} };
    for (const p of [ION, SC]) {
      const got = readCheckedResult(pickStage4Input(b, p, exists), cards[p], p === ION ? ION_PARAMS : SC_PARAMS);
      out[b][p] = got.res;
      out[b].names[p] = got.name;
    }
  }
  return out;
}

// The difference b - a of two pL values from different banks (no pairing possible), with an
// interval from the two cluster half-widths in quadrature.
export function unpairedClusterDiff(a, b) {
  const diff = b.pL - a.pL;
  return { diff, lo: diff - Math.hypot(b.pL - b.loCluster, a.hiCluster - a.pL), hi: diff + Math.hypot(b.hiCluster - b.pL, a.pL - a.loCluster) };
}

const nearestIndex = (xs, v) => xs.reduce((best, x, i) => (Math.abs(Math.log(x / v)) < Math.abs(Math.log(xs[best] / v)) ? i : best), 0);

// C1 (revised). Superconducting (dense files): per (basis, d = 3 and 5, mode), the learned
// tau*_log interval entirely below tau*_phys (empirical) is "held", an interval containing or
// above it "refuted" (the pre-registered falsifier); UNRESOLVED rows enter no verdict; shiftDelta
// beside it. Ion, from crosstalkScan (learned), with the pre-registered point flag
// interiorBelowTauPhys: (a) crosstalk off: refuted if any row at rate 0 has the flag; (b) card
// rate: held if every row has it, refuted if none has it, otherwise undetermined (split); (c)
// refuted if no row at any scanned rate has it. The same three with the resolved flag and with
// shiftDelta are reported beside them (E12, E14).
function c1Conclusion(files) {
  const scCases = {};
  for (const b of BASES) {
    const res = files[b][SC];
    const phys = res.optima.tauPhysEmpirical;
    for (const tl of res.optima.tauLog.filter((t) => t.decoder === 'learned' && (t.d === 3 || t.d === 5))) {
      const un = unresolved(tl);
      const verdict = phys.atEdge || un ? 'undetermined' : tl.hi < phys.xMin ? 'held' : 'refuted';
      scCases[`${b} d${tl.d} ${tl.mode}`] = { verdict, xMin: tl.xMin, lo: tl.lo, hi: tl.hi, tauPhysEmpirical: phys.xMin, fractionTied: tl.fractionTied, unresolved: un, shiftDelta: tl.shiftDelta ?? null };
    }
  }
  const scUsed = Object.values(scCases).filter((c) => !c.unresolved);
  const scVerdict = combineV2(scUsed.map((c) => c.verdict));

  const ion = {};
  const flags = {
    pointFlag: (e) => e.interiorBelowTauPhys === true,
    resolvedFlag: (e) => e.interiorBelowTauPhysResolved === true,
    shiftDelta: (e) => e.shiftDelta?.resolved === true,
  };
  for (const [name, flagOf] of Object.entries(flags)) {
    const rows = [];
    for (const b of BASES) {
      const scan = files[b][ION].crosstalkScan;
      for (const e of scan.entries.filter((x) => (x.decoder ?? 'learned') === 'learned')) {
        rows.push({ basis: b, rate: e.rate, card: e.rate === scan.cardRate_per_us, d: e.d, mode: e.mode, flag: flagOf(e), unresolved: unresolved(e.tauLog) });
      }
    }
    const used = rows.filter((x) => !x.unresolved);
    const off = used.filter((x) => x.rate === 0);
    const card = used.filter((x) => x.card);
    const parts = {
      crosstalkOff: off.length === 0 ? 'undetermined' : off.some((x) => x.flag) ? 'refuted' : 'held',
      cardRate: card.length === 0 ? 'undetermined' : card.every((x) => x.flag) ? 'held' : card.some((x) => x.flag) ? 'undetermined' : 'refuted',
      anyRate: used.length === 0 ? 'undetermined' : used.some((x) => x.flag) ? 'held' : 'refuted',
    };
    const where = (xs, withRate = false) => xs.filter((x) => x.flag).map((x) => `${x.basis} ${withRate ? `${x.rate} /µs ` : ''}d${x.d} ${x.mode}`);
    const verdict = parts.crosstalkOff === 'refuted' || parts.anyRate === 'refuted' ? 'refuted' : parts.cardRate;
    ion[name] = { verdict, parts, offFlagged: where(off), cardFlagged: where(card), cardRows: card.length, anyFlagged: where(used, true), excludedUnresolved: rows.length - used.length };
  }
  const ionVerdict = ion.pointFlag.verdict;
  const automated = combineV2([scVerdict, ionVerdict]);
  const tp = files.Z[SC].optima.tauPhysEmpirical.xMin;
  const fmtCase = ([k, c]) => `${k} ${g3(c.xMin)} ${iv(c.lo, c.hi)} µs`;
  const held = Object.entries(scCases).filter(([, c]) => c.verdict === 'held').map(fmtCase);
  const notHeld = Object.entries(scCases).filter(([, c]) => c.verdict === 'refuted').map(fmtCase);
  const un = Object.entries(scCases).filter(([, c]) => c.unresolved).map(([k]) => k);
  const sdResolved = Object.entries(scCases).filter(([, c]) => c.shiftDelta?.resolved).map(([k]) => k);
  const P = ion.pointFlag.parts;
  const R = ion.resolvedFlag.parts;
  const S = ion.shiftDelta.parts;
  const note = `Superconducting (${files.Z.names[SC]}, ${files.X.names[SC]}; learned; against τ*_phys (empirical) = ${g3(tp)} µs): ${scVerdict}. `
    + `Interval below τ*_phys: ${held.length ? held.join('; ') : 'none'}. Containing or above it: ${notHeld.length ? notHeld.join('; ') : 'none'}.${un.length ? ` UNRESOLVED (excluded): ${un.join(', ')}.` : ''} `
    + `shiftDelta resolves ${sdResolved.length ? sdResolved.join(', ') : 'no learned row'}. `
    + `Trapped ion (crosstalkScan, learned), pre-registered point flag: crosstalk off ${P.crosstalkOff}${ion.pointFlag.offFlagged.length ? ` (flag at ${ion.pointFlag.offFlagged.join(', ')})` : ''}; card rate ${P.cardRate} (${ion.pointFlag.cardFlagged.length} of ${ion.pointFlag.cardRows} rows flagged); any rate ${P.anyRate}. `
    + `Resolved flag (whole interval below τ*_phys, E12): off ${R.crosstalkOff}, card rate ${R.cardRate}, any rate ${R.anyRate} (${ion.resolvedFlag.anyFlagged.join(', ') || 'none'}). `
    + `shiftDelta (E14): off ${S.crosstalkOff}, card rate ${S.cardRate}, any rate ${S.anyRate} (${ion.shiftDelta.anyFlagged.join(', ') || 'none'}). `
    + `Person A's reading of the ion parts uses the resolved flag (${ion.resolvedFlag.verdict}), because the point flag reads noise in a flat minimum (E12 (a)).`
    + `${scVerdict === 'refuted' ? ` The overall verdict is refuted under either flag, because the superconducting part is.` : ''}`;
  const deviations = [
    'E12 (a): the ion parts are also reported with interiorBelowTauPhysResolved (the whole interval below τ*_phys), decided after seeing the A48 data; the automated verdict uses the pre-registered point flag.',
    'E14 (b): shiftDelta, pL(τ_ref) − pL(τ_short) with a paired cluster interval, is a post-hoc addition reported beside the pre-registered rule.',
    'E14 (d): the superconducting part uses the dense grid (27 points); on the standard grid (A49) d = 3 held in both bases.',
    `E12: a τ*_log with fractionTied ≥ ${TIED_MAX} is UNRESOLVED and enters no verdict.`,
  ];
  return {
    conclusion: conclusion('C1', automated, note, { deviations }),
    detail: { superconducting: { verdict: scVerdict, cases: scCases, files: [files.Z.names[SC], files.X.names[SC]] }, ion: { verdict: ionVerdict, ...ion } },
  };
}

// C2: per (basis, arm), learned series: refuted if soft is above hard beyond the Wilson
// intervals at any (d, tau) (the pre-registered rule). The paired-cluster count (paired ->
// softMinusHard with lo > 0) and the unpaired cluster count are reported beside it.
function c2Conclusion(files) {
  const cases = {};
  for (const b of BASES) {
    for (const p of [ION, SC]) {
      const res = files[b][p];
      let above = 0;
      let below = 0;
      let aboveCluster = 0;
      let points = 0;
      for (const h of res.series.filter((s) => s.decoder === 'learned' && s.mode === 'hard')) {
        const s = res.series.find((x) => x.decoder === 'learned' && x.mode === 'soft' && x.d === h.d);
        h.pL.forEach((_, t) => {
          points++;
          if (s.lo[t] > h.hi[t]) above++;
          if (s.hi[t] < h.lo[t]) below++;
          if (Array.isArray(s.loCluster) && s.loCluster[t] > h.hiCluster[t]) aboveCluster++;
        });
      }
      const pairs = (res.paired ?? []).filter((x) => x.kind === 'softMinusHard' && x.decoder === 'learned');
      cases[`${b} ${p}`] = {
        verdict: above === 0 ? 'held' : 'refuted', file: files[b].names[p], points,
        softAboveBeyondIntervals: above, softBelowBeyondIntervals: below, softAboveBeyondCluster: aboveCluster,
        pairedSoftAbove: pairs.filter((x) => x.lo > 0).length, pairedSoftBelow: pairs.filter((x) => x.hi < 0).length, pairedPoints: pairs.length,
      };
    }
  }
  const automated = combineV2(Object.values(cases).map((c) => c.verdict));
  const note = `Learned decoder, soft above hard beyond the intervals (Wilson / cluster / paired cluster): ${Object.entries(cases).map(([k, c]) => `${k} ${c.softAboveBeyondIntervals} / ${c.softAboveBeyondCluster} / ${c.pairedSoftAbove} of ${c.points}`).join('; ')}. `
    + `Soft below hard beyond the paired interval: ${Object.entries(cases).map(([k, c]) => `${k} ${c.pairedSoftBelow}`).join('; ')}, most at short τ. The verdict uses the pre-registered Wilson rule; the paired count agrees.`;
  return { conclusion: conclusion('C2', automated, note), detail: cases };
}

// C3: the U4 dominance rule at each arm's tau*_log (d = 3, hard, learned), Z basis.
// informative: false (team checklist Section 1.2 note, DECISIONS E12 (c)).
function c3Conclusion(tables, cycle) {
  const a = c3Point(tables[ION], cycle[ION]);
  const b = c3Point(tables[SC], cycle[SC]);
  const dom = dominance(a, b);
  const automated = dom === null ? 'held' : 'refuted';
  const who = dom === 'A' ? ION : dom === 'B' ? SC : null;
  // Cycle-time ratio at the two optima, to 2 significant figures (A55: replaces a fixed "about 2000x").
  const cycleRatio = Number((b.roundsPerSecond / a.roundsPerSecond).toPrecision(2));
  const note = `The outcome is fixed by construction: cycle times differ by about ${cycleRatio}x at d = 3 and gate noise is shared, so with these cards the superconducting arm always has more rounds per second and the ion arm a lower error per round. Shown as a trade-off, not as a finding. `
    + `At τ*_log (d = 3, hard, learned): ion ${g3(a.perRound)} ${iv(a.lo, a.hi)} per round at ${g3(a.roundsPerSecond)} rounds/s; superconducting ${g3(b.perRound)} ${iv(b.lo, b.hi)} at ${g3(b.roundsPerSecond)} rounds/s; ${who ? `${who} dominates` : 'neither dominates'}.`;
  return {
    conclusion: conclusion('C3', automated, note, { informative: false, deviations: ['E12 (c): reported with informative: false; the U4 rule itself is unchanged.'] }),
    detail: { rule: 'U4 dominance at tau*_log, d = 3, hard, learned', [ION]: a, [SC]: b, dominant: who },
  };
}

// C4: per mode, break-even on the empirical assignment axis: held if the two arms differ by less
// than the sum of their half-widths; undetermined if an arm has no crossing or a refutation
// rests on a clamped interval.
function c4Conclusion(tables) {
  const cases = {};
  for (const mode of STAGE4_MODES) {
    const a = tables[ION].breakEven.empiricalAxis[mode];
    const b = tables[SC].breakEven.empiricalAxis[mode];
    let verdict;
    let diff = null;
    let sumHalfWidths = null;
    if (a.epsBar === null || b.epsBar === null) verdict = 'undetermined';
    else {
      diff = Math.abs(a.epsBar - b.epsBar);
      sumHalfWidths = a.halfWidth + b.halfWidth;
      verdict = diff < sumHalfWidths ? 'held' : a.clamped || b.clamped ? 'undetermined' : 'refuted';
    }
    cases[mode] = { verdict, [ION]: a.epsBar, [SC]: b.epsBar, ionNote: a.note ?? null, scNote: b.note ?? null, diff, sumHalfWidths };
  }
  const automated = combineV2(Object.values(cases).map((c) => c.verdict));
  const arm = (v, n) => (v === null ? `no crossing (${n})` : g3(v));
  const note = `Empirical assignment-error axis, learned: ${STAGE4_MODES.map((m) => `${m}: ion ${arm(cases[m][ION], cases[m].ionNote)}, superconducting ${arm(cases[m][SC], cases[m].scNote)}${cases[m].diff === null ? '' : ` (|diff| ${g3(cases[m].diff)} against sum of half-widths ${g3(cases[m].sumHalfWidths)})`}: ${cases[m].verdict}`).join('; ')}. Wilson-based break-even intervals.`;
  return { conclusion: conclusion('C4', automated, note), detail: cases };
}

// C5 and decoderComparison: learned against naive at the learned tau*_log per (basis, arm, d,
// mode), both interpolated in ln tau with their Wilson (and cluster) bounds. Refuted if learned is
// above naive beyond the Wilson intervals at a resolved row. Out of sample where held-out results
// exist (holdout.json -> setting2: ion card, Z basis, d = 3 and 5, rates from the original
// banks); in sample elsewhere, with the paired learnedMinusNaive at the nearest grid point.
function c5Conclusion(files, holdout) {
  const oos = holdout?.setting2 ?? null;
  const rows = [];
  for (const b of BASES) {
    for (const p of [ION, SC]) {
      const res = files[b][p];
      const taus = res.x.values;
      for (const tl of res.optima.tauLog.filter((t) => t.decoder === 'learned')) {
        const fromHoldout = Boolean(oos) && b === oos.basis && p === oos.platform && oos.distances.includes(tl.d);
        const src = fromHoldout ? { series: oos.series, taus: oos.x.values } : { series: res.series, taus };
        const pick = (decoder) => {
          const s = src.series.find((x) => x.decoder === decoder && x.d === tl.d && x.mode === tl.mode);
          const at = (ys) => round(atTau(src.taus, ys, tl.xMin));
          return { pL: at(s.pL), lo: at(s.lo), hi: at(s.hi), ...(Array.isArray(s.loCluster) ? { loCluster: at(s.loCluster), hiCluster: at(s.hiCluster) } : {}) };
        };
        const naive = pick('naive');
        const learned = pick('learned');
        let paired = null;
        if (!fromHoldout) {
          const i = nearestIndex(taus, tl.xMin);
          const q = (res.paired ?? []).find((x) => x.kind === 'learnedMinusNaive' && x.mode === tl.mode && x.d === tl.d && sameTau(x.x, taus[i]));
          if (q) paired = { tau_us: taus[i], diff: q.diff, lo: q.lo, hi: q.hi };
        }
        const un = unresolved(tl);
        const above = learned.lo > naive.hi;
        rows.push({
          arm: p, basis: b, d: tl.d, mode: tl.mode, tau_us: tl.xMin, unresolved: un, inSample: !fromHoldout,
          source: fromHoldout ? `${HOLDOUT_FILE} -> setting2` : files[b].names[p],
          naive, learned, paired, learnedBelowBeyondIntervals: learned.hi < naive.lo,
          verdict: un ? 'undetermined' : above ? 'refuted' : 'held',
        });
      }
    }
  }
  const used = rows.filter((x) => !x.unresolved);
  const automated = used.length === 0 ? 'undetermined' : combineV2(used.map((x) => x.verdict));
  const name = (x) => `${x.basis} ${x.arm} d${x.d} ${x.mode}`;
  const above = used.filter((x) => x.verdict === 'refuted').map(name);
  const below = used.filter((x) => x.learnedBelowBeyondIntervals);
  const notBelow = used.filter((x) => !x.learnedBelowBeyondIntervals && x.verdict === 'held').map(name);
  const outRows = used.filter((x) => !x.inSample);
  const v18 = holdout?.setting1?.V18 ?? null;
  const note = `${outRows.length ? `Out of sample at ${outRows.length} rows (${outRows.map(name).join(', ')}; ${HOLDOUT_FILE} -> setting2, rates learned from the original banks only). ` : 'No held-out results: every row is in sample. '}`
    + `In sample at ${used.length - outRows.length} rows (the X basis and the superconducting arm have no held-out banks). `
    + `${v18 ? `V18 (${HOLDOUT_FILE} -> setting1, flat ε = 0.02, hard): ${v18.verdict}. ` : ''}`
    + `Learned above naive beyond the Wilson intervals at ${above.length} of ${used.length} resolved rows${above.length ? ` (${above.join(', ')})` : ''}; below beyond them at ${below.length} (${below.filter((x) => !x.inSample).length} of them out of sample). `
    + `${notBelow.length ? `Equal within the intervals at ${notBelow.join(', ')}, so "lowers at every (d, arm, mode)" is met only in the sense that learned is never higher. ` : ''}`
    + `${rows.length - used.length} rows have an UNRESOLVED τ*_log and are excluded.`;
  const deviations = [
    'Out of sample only where held-out banks exist (DECISIONS E11): trapped ion, Z basis, d = 3 and 5; the other rows decode the banks the rates were learned from and carry inSample: true.',
  ];
  return { conclusion: conclusion('C5', automated, note, { deviations }), rows, V18: v18 };
}

// C6 rule on two superconducting files (learned, per (d, mode) in ds): refuted if X is above Z
// beyond the intervals (X.lo > Z.hi), held if X is below beyond them, otherwise undetermined;
// UNRESOLVED rows enter no verdict. The pL difference X - Z at the grid point nearest the Z
// tau*_log is unpaired (different banks), with cluster half-widths in quadrature.
function c6Rule(z, x, ds) {
  const cases = {};
  for (const tz of z.optima.tauLog.filter((t) => t.decoder === 'learned' && ds.includes(t.d))) {
    const tx = x.optima.tauLog.find((t) => t.decoder === 'learned' && t.d === tz.d && t.mode === tz.mode);
    if (!tx) continue;
    const un = unresolved(tz) || unresolved(tx);
    const verdict = un ? 'undetermined' : tx.lo > tz.hi ? 'refuted' : tx.hi < tz.lo ? 'held' : 'undetermined';
    let pLDiff = null;
    const sz = z.series.find((s) => s.decoder === 'learned' && s.d === tz.d && s.mode === tz.mode);
    const sx = x.series.find((s) => s.decoder === 'learned' && s.d === tz.d && s.mode === tz.mode);
    const i = nearestIndex(z.x.values, tz.xMin);
    const j = x.x.values.findIndex((v) => sameTau(v, z.x.values[i]));
    if (j >= 0 && Array.isArray(sz.loCluster) && Array.isArray(sx.loCluster)) {
      const pick = (s, k) => ({ pL: s.pL[k], loCluster: s.loCluster[k], hiCluster: s.hiCluster[k] });
      const dd = unpairedClusterDiff(pick(sz, i), pick(sx, j));
      pLDiff = { tau_us: z.x.values[i], diff: round(dd.diff), lo: round(dd.lo), hi: round(dd.hi), paired: false };
    }
    cases[`d${tz.d} ${tz.mode}`] = { verdict, unresolved: un, Z: { xMin: tz.xMin, lo: tz.lo, hi: tz.hi, fractionTied: tz.fractionTied }, X: { xMin: tx.xMin, lo: tx.lo, hi: tx.hi, fractionTied: tx.fractionTied }, pLDiff };
  }
  const result = combineV2(Object.values(cases).filter((c) => !c.unresolved).map((c) => c.verdict));
  return { result, cases };
}

// C6: conditional on T2 < T1. With the card (T2 >= T1) the verdict is "not applicable"; the note
// gives the variant-card result (T2 = 25 us, UNSOURCED, illustrative) against the dense Z file.
export function c6Conclusion(files, variant) {
  const z = files.Z[SC];
  const x = files.X[SC];
  const T1 = fieldValue(x.params.card, 'T1_us');
  const T2 = fieldValue(x.params.card, 'T2_us') ?? 2 * T1;
  const premise = T2 < T1;
  const card = c6Rule(z, x, [3, 5, 7]);
  let v = null;
  if (variant) {
    const vT1 = fieldValue(variant.params.card, 'T1_us');
    const vT2 = fieldValue(variant.params.card, 'T2_us');
    v = { file: C6_VARIANT_FILE, T1_us: vT1, T2_us: vT2, premise: vT2 < vT1, source: 'UNSOURCED (illustrative)', ...c6Rule(z, variant, [3, 5]) };
  }
  const automated = premise ? card.result : 'not applicable';
  const caseText = (cases) => Object.entries(cases).map(([k, c]) => `${k}: X ${g3(c.X.xMin)} ${iv(c.X.lo, c.X.hi)} µs against Z ${g3(c.Z.xMin)} ${iv(c.Z.lo, c.Z.hi)} µs${c.unresolved ? ' (UNRESOLVED)' : ''}`).join('; ');
  const diffText = (cases) => Object.entries(cases).filter(([, c]) => c.pLDiff).map(([k, c]) => `${k} ${signed(c.pLDiff.diff)} ${iv(c.pLDiff.lo, c.pLDiff.hi)} at ${c.pLDiff.tau_us} µs`).join('; ');
  const allShorter = v && Object.values(v.cases).every((c) => c.X.xMin < c.Z.xMin);
  const note = premise
    ? `T2 = ${T2} µs < T1 = ${T1} µs. ${caseText(card.cases)}: ${card.result}.`
    : `Not applicable with the card: the statement is conditional on T2 < T1, and the card has T2 = ${T2} µs ≥ T1 = ${T1} µs (DECISIONS E7, E12 (b)). `
      + (v
        ? `Variant card T2 = ${v.T2_us} µs (UNSOURCED, illustrative; ${C6_VARIANT_FILE} against ${files.Z.names[SC]}, learned): ${caseText(v.cases)}. The rule gives "${v.result}"${allShorter ? ': X is shorter in every point estimate, but the intervals overlap' : ''}. `
          + `pL(X) − pL(Z) at the grid point nearest the Z τ*_log (unpaired, different banks; cluster half-widths in quadrature): ${diffText(v.cases)}.`
        : `The variant card file ${C6_VARIANT_FILE} is missing.`);
  const deviations = [
    'E14 (c): the variant card T2 = 25 µs is UNSOURCED (illustrative) and post hoc, chosen only to meet the premise T2 < T1.',
    'CC-A22 asked for pairedClusterDiff of pL at matching τ; the X and Z files decode different banks (repx_* against rep_*) and per-shot failure counts are not stored, so the difference is unpaired, with the cluster half-widths combined in quadrature.',
  ];
  return { conclusion: conclusion('C6', automated, note, { deviations }), detail: { premise: { T1_us: T1, T2_us: T2, satisfied: premise }, ruleResultWithCard: card.result, cardCases: card.cases, variant: v } };
}

// O4: a measurement, no hypothesis; from dem_forte1.json -> ratioXoverZ.
function o4Conclusion(dem) {
  if (!dem?.ratioXoverZ?.length) return { conclusion: conclusion('O4', 'undetermined', 'dem_forte1.json has no ratioXoverZ: run --stage dem with both bases.'), detail: null };
  const rows = dem.ratioXoverZ;
  const contain = rows.filter((x) => x.lo <= 1 && x.hi >= 1).length;
  const note = `Measurement, no hypothesis (no verdict). X over Z bulk detector rate (dem_forte1.json -> ratioXoverZ): ${rows.map((x) => `d${x.d} r${x.r} ${x.ratio.toFixed(3)} [${x.lo.toFixed(3)}, ${x.hi.toFixed(3)}]`).join('; ')}; ${contain} of ${rows.length} intervals contain 1 (DECISIONS E5).`;
  return { conclusion: conclusion('O4', 'undetermined', note), detail: rows };
}

// Finding F1 (post hoc): soft decoding loses to hard with the naive decoder on the ion arm, not
// with the learned decoder. Out of sample from holdout.json when present, else in sample.
function f1Finding(files, holdout) {
  const inSampleCounts = {};
  for (const b of BASES) {
    const res = files[b][ION];
    for (const decoder of ['naive', 'learned']) {
      const wilsonCount = (res.validation?.C2 ?? []).filter((x) => x.decoder === decoder && x.softAboveBeyondIntervals).length;
      const pairs = (res.paired ?? []).filter((x) => x.kind === 'softMinusHard' && x.decoder === decoder);
      inSampleCounts[`${b} ${decoder}`] = { wilson: wilsonCount, paired: pairs.filter((x) => x.lo > 0).length, points: pairs.length };
    }
  }
  const s2 = holdout?.setting2 ?? null;
  let outOfSample = null;
  if (s2) {
    const t = s2.x.values.findIndex((v) => sameTau(v, 20));
    const ex = (decoder) => {
      const pick = (mode) => s2.series.find((x) => x.decoder === decoder && x.d === 3 && x.mode === mode);
      const q = s2.paired.find((x) => x.decoder === decoder && x.d === 3 && sameTau(x.x, 20));
      const v = (s) => ({ pL: s.pL[t], loCluster: s.loCluster[t], hiCluster: s.hiCluster[t] });
      return { soft: v(pick('soft')), hard: v(pick('hard')), pairedSoftMinusHard: q ? { diff: q.diff, lo: q.lo, hi: q.hi } : null };
    };
    outOfSample = { softWorseCount: s2.softWorseCount, pointsPerDecoder: s2.pointsPerDecoder, softWorsePoints: s2.softWorsePoints, example_d3_tau20: t >= 0 ? { naive: ex('naive'), learned: ex('learned') } : null };
  }
  return {
    id: 'F1',
    statement: 'Post hoc, not pre-registered: on the trapped-ion arm, soft decoding is worse than hard beyond the intervals with the naive decoder and never with the learned decoder; the v1 C2 loss was a decoder-model artefact (the naive graph lacks the diagonal edges).',
    numbers: { outOfSample, inSample: inSampleCounts },
    source: s2 ? `${HOLDOUT_FILE} -> setting2 (out of sample); ${files.Z.names[ION]}, ${files.X.names[ION]} (in sample)` : `${files.Z.names[ION]}, ${files.X.names[ION]}`,
    inSample: !s2,
    plain: PLAIN.F1,
  };
}

// The two numbers of a sensitivity effect: per-round error and tau*_log, d = 3, hard, per arm.
const effectOf = (tables) => ({
  perRound_d3_hard: Object.fromEntries([ION, SC].map((p) => [p, round(tables[p].perRound.hard.find((u) => u.d === 3).value)])),
  tauLog_d3_hard: Object.fromEntries([ION, SC].map((p) => [p, tables[p].tauLog.hard.find((u) => u.d === 3).xMin])),
});
const effectClusterOf = (tables) => ({
  perRound_d3_hard: Object.fromEntries([ION, SC].map((p) => {
    const u = tables[p].perRound.hard.find((x) => x.d === 3);
    return [p, { loCluster: round(u.loCluster), hiCluster: round(u.hiCluster) }];
  })),
});

// Assignment error of each readout from SENS_F1_SAMPLES draws (prepared bit alternating 0, 1).
function empiricalAssignment(readouts) {
  const rng = createRng(SENS_F1_SEED);
  return readouts.map((ro) => {
    let errors = 0;
    for (let s = 0; s < SENS_F1_SAMPLES; s++) {
      const bit = s & 1;
      if (ro.measure(bit, rng).hard !== bit) errors++;
    }
    return errors / SENS_F1_SAMPLES;
  });
}

// One arm at full statistics for the sensitivity (or, with tauIndices and draws = 1, the timing
// sample): every shot of the Z-basis banks, learned decoder, cluster intervals on every series,
// tau*_log from the grid minimum.
function sensitivityArm(platform, card, ctx, { tauIndices = null, draws = SENS_DRAWS } = {}) {
  const allTaus = fieldValue(card, 'tau_grid_us');
  const idx = tauIndices ?? allTaus.map((_, i) => i);
  const taus = idx.map((i) => allTaus[i]);
  const create = platform === ION ? createIonReadout : createScReadout;
  const readouts = taus.map((tau) => create(card, tau));
  const run = f2Sweep({
    distances: ctx.distances, byKey: ctx.byKey, r: ctx.r, taus, readouts, modes: STAGE4_MODES, decoders: ['learned'],
    seedOf: (d, logical, t, draw) => seedForSens(platform, d, logical, idx[t], draw), cal: ctx.cal, rates: ctx.rates, basis: 'Z', draws,
  });
  ctx.nonExact += run.nonExact;
  if (tauIndices !== null) return null;
  addClusterIntervals(run.series, run.failCounts, draws, SENS_CLUSTER_SEED[platform]);
  const tauLog = run.series.map((s) => {
    const m = findMinimum(taus, s.pL, { logX: true });
    return { d: s.d, mode: s.mode, decoder: 'learned', xMin: round(m.xMin), atEdge: m.atEdge };
  });
  const empirical = empiricalAssignment(readouts);
  const belief = readouts.map((ro) => ro.averageAssignmentError());
  const emp = findMinimum(taus, empirical, { logX: true });
  const bel = findMinimum(taus, belief, { logX: true });
  return {
    platform, taus, full: false, distances: ctx.distances, series: run.series, belief, empirical,
    idle: readouts.map((ro) => ro.idleFlipProbability('Z')),
    tauPhysBelief: { xMin: bel.xMin, atEdge: bel.atEdge }, tauPhysEmp: { xMin: emp.xMin, atEdge: emp.atEdge },
    tauLog, failCounts: run.failCounts,
  };
}

// Paired cluster difference of pL (d = 3, hard) between a scaled run and the baseline at the
// grid point nearest the baseline tau*_log: the same shots and readout seeds in both.
function pairedVsBaseline(arm, base) {
  const tl = base.tauLog.find((x) => x.d === 3 && x.mode === 'hard');
  const t = nearestIndex(base.taus, tl.xMin);
  const key = keyOf('learned', 3, 'hard');
  const p = pairedClusterDiff(arm.failCounts.get(key)[t], base.failCounts.get(key)[t], SENS_DRAWS, CLUSTER_B, createRng(SENS_CLUSTER_SEED[arm.platform] + 900000 + t));
  return { tau_us: base.taus[t], d: 3, mode: 'hard', diff: round(p.diff), lo: round(p.lo), hi: round(p.hi) };
}

// Sensitivity (CC-A22): times a sample first and runs only if the estimate is within
// SENS_MAX_MINUTES. Returns { sensitivity, sensitivityBaseline, sensitivityNote, meta }.
function runSensitivity(cards, cycle, tablesFull) {
  const r = 3;
  const repBanks = loadRepBanks('Z');
  const byKey = new Map(repBanks.map((b) => [`${b.bank.d},${b.bank.r},${b.bank.logical}`, b]));
  const distances = [3, 5, 7].filter((d) => byKey.has(`${d},${r},0`) && byKey.has(`${d},${r},1`));
  const rates = new Map(distances.map((d) => [d, pooledRates(byKey, d, r)]));
  const ctx = { r, distances, byKey, rates, cal: new Map(), nonExact: 0 };
  // Which scaled cards the readout models accept (e.g. T2 <= 2 T1); the others are skipped.
  const plan = [];
  for (const { platform, parameter } of SENS_ROWS) {
    for (const scale of SENS_SCALES) {
      const value = fieldValue(cards[platform], parameter) * scale;
      const card = setField(cards[platform], parameter, value);
      let skipped = null;
      try {
        (platform === ION ? createIonReadout : createScReadout)(card, fieldValue(card, 'tau_grid_us')[0]);
      } catch (err) {
        skipped = err.message;
      }
      plan.push({ platform, parameter, scale, value, card, skipped });
    }
  }
  // Timing: three tau points (first, middle, last) per arm, one draw.
  const runsPer = { [ION]: 1, [SC]: 1 };
  for (const x of plan) if (!x.skipped) runsPer[x.platform]++;
  let estimateS = 0;
  const timing = {};
  for (const p of [ION, SC]) {
    const n = fieldValue(cards[p], 'tau_grid_us').length;
    const sample = [...new Set([0, Math.floor(n / 2), n - 1])];
    const t = Date.now();
    sensitivityArm(p, cards[p], ctx, { tauIndices: sample, draws: 1 });
    const perTauDraw = (Date.now() - t) / 1000 / sample.length;
    timing[p] = { sampleTaus: sample.length, secondsPerTauPerDraw: round(perTauDraw), runs: runsPer[p] };
    estimateS += perTauDraw * n * SENS_DRAWS * runsPer[p];
  }
  const estimateMin = estimateS / 60;
  console.log(`Sensitivity estimate: ${estimateMin.toFixed(1)} min (limit ${SENS_MAX_MINUTES}); timing ${JSON.stringify(timing)}`);
  const meta = { rows: SENS_ROWS, scales: SENS_SCALES, readoutDrawsPerShot: SENS_DRAWS, shots: 'all shots of the Z-basis rep_* banks', distances, decoder: 'learned', bootstrap: false, estimateMinutes: round(estimateMin), timing, f1Samples: SENS_F1_SAMPLES };
  if (estimateMin > SENS_MAX_MINUTES) {
    return { sensitivity: null, sensitivityBaseline: null, sensitivityNote: `Not run: estimated ${estimateMin.toFixed(0)} min, above the ${SENS_MAX_MINUTES}-minute limit (CC-A22).`, meta };
  }
  const t0 = Date.now();
  const base = {};
  for (const p of [ION, SC]) {
    const t = Date.now();
    base[p] = sensitivityArm(p, cards[p], ctx);
    console.log(`  ${p} baseline (${((Date.now() - t) / 1000).toFixed(1)} s)`);
  }
  const tablesOf = (arms) => ({ [ION]: platformTable(arms[ION], cycle[ION]), [SC]: platformTable(arms[SC], cycle[SC]) });
  const baseTables = tablesOf(base);
  const sensitivity = [];
  for (const x of plan) {
    if (x.skipped) {
      console.log(`  ${x.platform} ${x.parameter} x ${x.scale}: skipped (${x.skipped})`);
      sensitivity.push({ platform: x.platform, parameter: x.parameter, scale: x.scale, value: x.value, effect: null, skipped: `not run: ${x.skipped}` });
      continue;
    }
    const t = Date.now();
    const arm = sensitivityArm(x.platform, x.card, ctx);
    console.log(`  ${x.platform} ${x.parameter} x ${x.scale} (${((Date.now() - t) / 1000).toFixed(1)} s)`);
    const tb = tablesOf({ ...base, [x.platform]: arm });
    sensitivity.push({
      platform: x.platform, parameter: x.parameter, scale: x.scale, value: x.value,
      effect: effectOf(tb), effectCluster: effectClusterOf(tb),
      pairedVsBaseline: pairedVsBaseline(arm, base[x.platform]),
      tauLog: arm.tauLog,
    });
  }
  const sensitivityBaseline = {
    note: 'card values at the same statistics and seeds as the sensitivity rows (R = 2, all shots, learned); compare rows with this baseline, not with the headline tables (R = 4)',
    effect: effectOf(baseTables), effectCluster: effectClusterOf(baseTables),
    tauLog: Object.fromEntries([ION, SC].map((p) => [p, base[p].tauLog])),
    headline: effectOf(tablesFull),
  };
  meta.runtime_s = (Date.now() - t0) / 1000;
  meta.nonExact = ctx.nonExact;
  const sensitivityNote = 'Six rows (three parameters, each x0.5 and x2) at full statistics: every shot, R = 2 readout draws, learned decoder, cluster intervals; τ*_log is the grid minimum (no bootstrap). Only the arm that owns the parameter is rerun; the other arm keeps its baseline value. pairedVsBaseline is the paired cluster difference of pL (d = 3, hard) against the baseline at the baseline τ*_log, on the same shots and seeds.';
  return { sensitivity, sensitivityBaseline, sensitivityNote, meta };
}

// Loads an optional input; refuses it on a card mismatch. cardOf picks the card to check.
function readOptional(name, paramsCard, paramsFile, cardOf) {
  return existsSync(join(RESULTS_DIR, name)) ? readCheckedResult(name, paramsCard, paramsFile, cardOf).res : null;
}

// Stage 4 v2. Every headline value uses the learned decoder; the naive decoder appears only in
// decoderComparison (and C5). --basis X writes only tradeoff, perRound and budgetAtOptimum.
function stage4({ decoders, basis }) {
  const t0 = Date.now();
  if (!decoders.includes('learned')) throw new UsageError('Stage 4 v2 uses the learned decoder for every headline value: drop --decoder or use learned / both');
  for (const f of [CYCLE_PARAMS, ION_PARAMS, SC_PARAMS]) {
    if (!existsSync(f)) throw new Error(`${f} not found${f === CYCLE_PARAMS ? ': create the cycle-time card first (team checklist Appendix T6)' : ''}`);
  }
  const cycle = JSON.parse(readFileSync(CYCLE_PARAMS, 'utf8'));
  const cards = { [ION]: JSON.parse(readFileSync(ION_PARAMS, 'utf8')), [SC]: JSON.parse(readFileSync(SC_PARAMS, 'utf8')) };
  const files = loadStage4Files(cards);
  const results = files[basis];
  for (const p of [ION, SC]) {
    if (!cycle[p]) throw new Error(`${CYCLE_PARAMS} has no entry for ${p}`);
    cycleTime(cycle[p], 1, 3); // throws on an unfilled (null) value or an unknown expression
  }

  // Full statistics, learned decoder.
  const arms = { [ION]: armFromResults(results[ION], 'learned'), [SC]: armFromResults(results[SC], 'learned') };
  const tables = { [ION]: platformTable(arms[ION], cycle[ION]), [SC]: platformTable(arms[SC], cycle[SC]) };
  for (const p of [ION, SC]) {
    tables[p].tradeoff = tradeoffTable(arms[p], cycle[p]);
    tables[p].budgetAtOptimum = budgetAtOptimum(results[p], arms[p]);
  }
  const inputOf = (res, name) => ({ file: join(RESULTS_DIR, name), commit: res.provenance?.commit ?? null, date: res.provenance?.date ?? null, grid: res.provenance?.grid ?? null, overrides: res.provenance?.overrides ?? {}, cardMatchesParams: true });
  const inputs = Object.fromEntries(BASES.map((b) => [b, Object.fromEntries([ION, SC].map((p) => [p, inputOf(files[b][p], files[b].names[p])]))]));
  const definitions = {
    cycleTime: 'layers * two_qubit_gate_us + tau + reset_us; layers = gate_layers_per_round (a number, or "2*(d-1)" evaluated at d: sequential ion gates, DECISIONS E8)',
    roundsPerSecond: '1e6 / cycleTime(us)',
    tradeoff: 'per d and mode, at every grid tau: roundsPerSecond and perRound = 0.5 (1 - (1 - 2 pL)^(1/r)); lo/hi are perRound of the Wilson bounds, loCluster/hiCluster of the cluster bounds',
    perRound: '0.5 (1 - (1 - 2 pL)^(1/r)) at tau*_log; pL and its bounds interpolated linearly in ln tau between grid points (the best grid point when tau*_log is at the grid edge)',
    perMicrosecond: 'perRound / cycleTime at tau*_log and d',
    intervals: 'lo/hi: Wilson 95% through the transform; loCluster/hiCluster: cluster bootstrap over quantum shots (B = 500, CC-A19) through the same transform. Cluster intervals are the honest ones where gate faults dominate; Wilson is kept beside them',
    budgetAtOptimum: 'Stage 2/3 budget arrays interpolated in ln tau at tau*_log (d = 3, hard, learned); gate is the mean of the learned edge classes',
    breakEven: 'first sign change of pL(d=5) - pL(d=3) in tau order, x axis averageAssignmentError() (belief; empiricalAxis: the F1 empirical curve); interval from the crossings of hi5 - lo3 and lo5 - hi3 (Wilson) on the same grid segment',
  };

  if (basis === 'X') {
    const platformsX = Object.fromEntries([ION, SC].map((p) => [p, { tradeoff: tables[p].tradeoff, perRound: tables[p].perRound, perMicrosecond: tables[p].perMicrosecond, tauLog: tables[p].tauLog, budgetAtOptimum: tables[p].budgetAtOptimum }]));
    const resultX = {
      schema: 's2s-results/1', stage: 4, basis, decoder: 'learned', provisional: false, framing: FRAMING, framingPlain: PLAIN.framing,
      platforms: platformsX,
      params: { cycle, definitions },
      provenance: { tool: `tools/sweep.mjs --stage 4 --decoder ${decoderArg(decoders)} --basis ${basis}`, commit: gitCommit(), date: new Date().toISOString(), node: process.version, params: [CYCLE_PARAMS, ION_PARAMS, SC_PARAMS], inputs: inputs.X, runtime_s: (Date.now() - t0) / 1000 },
    };
    const outX = join(RESULTS_DIR, resultFile('stage4_comparison.json', basis));
    mkdirSync(RESULTS_DIR, { recursive: true });
    writeFileSync(outX, `${JSON.stringify(resultX, null, 2)}\n`);
    printStage4Tables(tables, cycle);
    printV15(tables, arms, cycle);
    console.log(`wrote ${outX} (final; runtime ${resultX.provenance.runtime_s.toFixed(1)} s)`);
    return;
  }

  const variant = readOptional(C6_VARIANT_FILE, cards[SC], SC_PARAMS);
  const holdout = readOptional(HOLDOUT_FILE, cards[ION], ION_PARAMS, (res) => res.params?.card);
  const demPath = join(RESULTS_DIR, DEM_FILE);
  const dem = existsSync(demPath) ? JSON.parse(readFileSync(demPath, 'utf8')) : null;
  const c1 = c1Conclusion(files);
  const c2 = c2Conclusion(files);
  const c3 = c3Conclusion(tables, cycle);
  const c4 = c4Conclusion(tables);
  const c5 = c5Conclusion(files, holdout);
  const c6 = c6Conclusion(files, variant);
  const o4 = o4Conclusion(dem);
  const conclusions = { C1: c1.conclusion, C2: c2.conclusion, C3: c3.conclusion, C4: c4.conclusion, C5: c5.conclusion, C6: c6.conclusion, O4: o4.conclusion };
  const conclusionDetail = { C1: c1.detail, C2: c2.detail, C3: c3.detail, C4: c4.detail, C5: { rows: c5.rows, V18: c5.V18 }, C6: c6.detail, O4: o4.detail };
  const findings = [f1Finding(files, holdout)];

  const sens = runSensitivity(cards, cycle, tables);

  const runtimeS = (Date.now() - t0) / 1000;
  const result = {
    schema: 's2s-results/1',
    stage: 4,
    basis,
    decoder: 'learned',
    provisional: false,
    framing: FRAMING,
    framingPlain: PLAIN.framing,
    platforms: tables,
    conclusions,
    conclusionDetail,
    findings,
    decoderComparison: c5.rows,
    sensitivity: sens.sensitivity,
    sensitivityNote: sens.sensitivityNote,
    sensitivityBaseline: sens.sensitivityBaseline,
    params: {
      cycle, ion: cards[ION], sc: cards[SC],
      definitions: {
        ...definitions,
        conclusions: 'C1-C6 and O4 follow team checklist Section 1.2 (statements verbatim) with the rules in tools/sweep.mjs (c1Conclusion ... o4Conclusion); verdict equals automated unless the note gives Person A\'s different reading; informative and deviations per U4 revision 2.1; plain is a draft edited at A55',
        tieRule: `a tau*_log with fractionTied >= ${TIED_MAX} is UNRESOLVED and enters no verdict (DECISIONS E12)`,
      },
      sensitivity: sens.meta,
      decoders, basis,
    },
    provenance: {
      tool: `tools/sweep.mjs --stage 4 --decoder ${decoderArg(decoders)} --basis ${basis}`,
      commit: gitCommit(),
      date: new Date().toISOString(),
      node: process.version,
      params: [CYCLE_PARAMS, ION_PARAMS, SC_PARAMS],
      inputs: {
        ...inputs,
        C6variant: variant ? inputOf(variant, C6_VARIANT_FILE) : null,
        holdout: holdout ? { ...inputOf(holdout, HOLDOUT_FILE), cardChecked: 'params.card against params/ion.json' } : null,
        dem: dem ? { file: demPath, commit: dem.provenance?.commit ?? null, date: dem.provenance?.date ?? null } : null,
      },
      sensitivitySeedRule: 'seed = 4000000 + (superconducting ? 100000 : 0) + 10000*d + 1000*logical + 10*tauIndex + draw (baseline and every scaled run; hard and soft share it); cluster seeds 4600000 (ion), 4700000 (superconducting) + 10000*d + 1000*modeIndex + tauIndex; pairedVsBaseline + 900000 + tauIndex',
      runtime_s: runtimeS,
    },
  };
  mkdirSync(RESULTS_DIR, { recursive: true });
  const out = join(RESULTS_DIR, resultFile('stage4_comparison.json', basis));
  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);

  // Summary.
  printStage4Tables(tables, cycle);
  printV15(tables, arms, cycle);
  console.log('\nConclusions (final, learned decoder):');
  for (const [id, c] of Object.entries(conclusions)) console.log(`  ${id} ${c.verdict.padEnd(14)} informative ${c.informative}  ${c.note}`);
  for (const f of findings) console.log(`  ${f.id} ${f.inSample ? 'in sample' : 'out of sample'}  ${JSON.stringify(f.numbers.outOfSample?.softWorseCount ?? f.numbers.inSample)}`);
  if (sens.sensitivity) {
    const e = sens.sensitivityBaseline.effect.perRound_d3_hard;
    console.log(`\nSensitivity (R = ${SENS_DRAWS}, all shots; baseline per round d3 hard: ion ${g3(e[ION])}, sc ${g3(e[SC])}):`);
    for (const s of sens.sensitivity) {
      console.log(`  ${s.platform.padEnd(15)} ${s.parameter.padEnd(28)} x ${String(s.scale).padEnd(3)} ${s.effect ? `per round ${g3(s.effect.perRound_d3_hard[s.platform])} (cluster ${iv(s.effectCluster.perRound_d3_hard[s.platform].loCluster, s.effectCluster.perRound_d3_hard[s.platform].hiCluster)}); paired pL vs baseline ${signed(s.pairedVsBaseline.diff)} ${iv(s.pairedVsBaseline.lo, s.pairedVsBaseline.hi)} at ${s.pairedVsBaseline.tau_us} us; tau*_log ${g3(s.effect.tauLog_d3_hard[s.platform])} us` : s.skipped}`);
    }
  } else {
    console.log(`\nSensitivity: ${sens.sensitivityNote}`);
  }
  console.log(`wrote ${out} (final; runtime ${runtimeS.toFixed(1)} s)`);
}

// V15 hand check, one point per arm (d = 3, hard, learned, at tau*_log): rounds per second =
// 1e6 / T_cyc and error per round = 1/2 [1 - (1 - 2 pL)^(1/r)], recomputed from the inputs and
// compared with the table values.
function printV15(tables, arms, cycle) {
  console.log('\nV15 hand check (d = 3, hard, learned, at tau*_log):');
  for (const p of [ION, SC]) {
    const tl = tables[p].tauLog.hard.find((u) => u.d === 3);
    const pl = tables[p].pLAtTauLog.hard.find((u) => u.d === 3);
    const pr = tables[p].perRound.hard.find((u) => u.d === 3);
    const pm = tables[p].perMicrosecond.hard.find((u) => u.d === 3);
    const c = cycle[p];
    const layers = fieldValue(c, 'gate_layers_per_round');
    const nLayers = typeof layers === 'number' ? layers : 2 * (3 - 1);
    const tcyc = nLayers * fieldValue(c, 'two_qubit_gate_us') + tl.xMin + fieldValue(c, 'reset_us');
    const handRps = 1e6 / tcyc;
    const handEps = 0.5 * (1 - (1 - 2 * pl.value) ** (1 / pl.r));
    console.log(`  ${p}: tau*_log ${g3(tl.xMin)} us; T_cyc = ${nLayers} x ${fieldValue(c, 'two_qubit_gate_us')} + ${g3(tl.xMin)} + ${fieldValue(c, 'reset_us')} = ${g3(tcyc)} us (file ${g3(pm.cycle_us)}); rounds/s ${g3(handRps)} (file ${g3(1e6 / pm.cycle_us)}); pL(r = ${pl.r}) ${g3(pl.value)} -> per round ${g3(handEps)} (file ${g3(pr.value)}); per us ${g3(handEps / tcyc)} (file ${g3(pm.value)})`);
  }
}

function printStage4Tables(tables, cycle) {
  const g = (v) => (v === null || v === undefined ? '—' : v === 0 ? '0' : Number(v).toExponential(3));
  for (const p of [ION, SC]) {
    const P = tables[p];
    const c = cycle[p];
    console.log(`\n${p}: cycle = ${fieldValue(c, 'gate_layers_per_round')} layers x ${fieldValue(c, 'two_qubit_gate_us')} us + tau + ${fieldValue(c, 'reset_us')} us; tau*_phys belief ${g(P.tauPhys.belief.xMin)}, empirical ${g(P.tauPhys.empirical.xMin)} us`);
    for (const mode of STAGE4_MODES) {
      P.tauLog[mode].forEach((tl, i) => {
        const pl = P.pLAtTauLog[mode][i];
        const pr = P.perRound[mode][i];
        const pm = P.perMicrosecond[mode][i];
        console.log(`  ${mode.padEnd(4)} d = ${tl.d}: tau*_log ${g(tl.xMin)} us${tl.atEdge ? ' (grid edge)' : ''}  pL(r = ${pl.r}) ${g(pl.value)}  per round ${g(pr.value)} [${g(pr.lo)}, ${g(pr.hi)}]  Tcyc ${g(pm.cycle_us)} us  rounds/s ${g(1e6 / pm.cycle_us)}  per us ${g(pm.value)}`);
      });
    }
    const b = P.budgetAtOptimum;
    if (b) console.log(`  budget at tau*_log ${g(b.tau_us)} us (d = 3, hard): readout ${g(b.readout)}, idle ${g(b.idle)}, crosstalk ${g(b.crosstalk)}, gate ${g(b.gate)}`);
    if (P.breakEven) {
      for (const mode of STAGE4_MODES) {
        const be = P.breakEven.byMode[mode];
        const em = P.breakEven.empiricalAxis[mode];
        console.log(`  break-even ${mode}: ${be.epsBar === null ? `none (${be.note})` : `epsBar ${g(be.epsBar)} [${g(be.lo)}, ${g(be.hi)}]${be.clamped ? ' (clamped)' : ''}`}; empirical axis ${em.epsBar === null ? 'none' : `${g(em.epsBar)} [${g(em.lo)}, ${g(em.hi)}]`}`);
      }
    }
  }
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

// ---- Stage holdout: V18 and F1 out of sample (CC-A21, DECISIONS E11) ----

const HELDOUT_DIR = 'data/banks/heldout';
const HOLDOUT_FILE = 'holdout.json';
const HOLDOUT_D = [3, 5];
const HOLDOUT_R = 3;
const HOLDOUT_EPS = 0.02; // setting 1 = the V12(b) setting: flat epsilon, hard, R = 1
const HOLDOUT_DRAWS_F1 = 4; // setting 2: R readout draws per quantum shot
const HOLDOUT_PLANNED = { 3: 1, 5: 5 }; // held-out banks per (d, L) in the E11 design
const HELDOUT_NAME = /^rep_d(\d+)_r(\d+)_L(\d)_h(\d+)\.json$/;
// Seeds (both decoders share them; hard and soft share them in setting 2):
const seedForHoldout1 = (d, L, h) => 6100000 + 10000 * d + 1000 * L + 10 * h;
const seedForHoldout2 = (d, L, h, tauIndex, draw) => 6200000 + 100000 * h + 10000 * d + 1000 * L + 10 * tauIndex + draw;
const HOLDOUT_CLUSTER_SEED = 6900000;

// Held-out bank file name -> { d, r, L, h }, or null for any other name.
export function parseHeldoutName(file) {
  const m = HELDOUT_NAME.exec(file);
  return m ? { d: Number(m[1]), r: Number(m[2]), L: Number(m[3]), h: Number(m[4]) } : null;
}

// Training files of (d, r): the original L0 and L1 banks in data/banks/, never a held-out name.
export const holdoutTrainingFiles = (d, r) => [0, 1].map((L) => `rep_d${d}_r${r}_L${L}.json`);

// Noise models for one (d, r) from the ORIGINAL banks only: naive pGate = estimatePGate of the
// pooled L0 + L1 detectors, learned rates = ratesFromBanks(L0, L1). Throws if a held-out bank
// (by file name or directory) is passed. deps is injectable so a test can watch what reaches
// ratesFromBanks and estimatePGate.
export function holdoutTraining(trainBanks, d, r, deps = { ratesFromBanks, estimatePGate, detectorArraysOf }) {
  for (const { file } of trainBanks) {
    if (parseHeldoutName(file.split(/[\\/]/).pop()) || /heldout/.test(file)) throw new Error(`holdoutTraining: held-out bank ${file} must never feed a rate`);
  }
  const banks = trainBanks.map((b) => b.bank);
  const det = banks.flatMap((b) => deps.detectorArraysOf(b));
  return { pGate: deps.estimatePGate(det, d, r).p, rates: deps.ratesFromBanks(banks).classes };
}

// Per-shot failure counts (0..draws) of one bank: seedOf(draw) seeds each pass over the shots.
function failCountsOf(bank, shots, { readout, mode, noise, seedOf, draws }) {
  const fails = new Uint8Array(shots.length);
  let nonExact = 0;
  for (let draw = 0; draw < draws; draw++) {
    const rng = createRng(seedOf(draw));
    for (let s = 0; s < shots.length; s++) {
      const res = decodeShot({ shotBits: shots[s], layout: bank.layout, d: bank.d, r: bank.r, readout, mode, noise, basis: bank.basis ?? 'Z', rng, logical: bank.logical });
      if (!res.exact) nonExact++;
      fails[s] += res.logicalError;
    }
  }
  return { fails, nonExact };
}

const concatU8 = (parts) => {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

// k, n, Wilson and cluster interval of pooled failure counts (R draws per shot).
function rateSummary(fails, R, seed) {
  let k = 0;
  for (const f of fails) k += f;
  const n = fails.length * R;
  const w = wilson(k, n);
  const c = clusterBootstrapRate(fails, R, CLUSTER_B, createRng(seed));
  return { k, n, pL: round(w.p), lo: round(w.lo), hi: round(w.hi), loCluster: round(c.lo), hiCluster: round(c.hi) };
}

const pairedSummary = (a, b, R, seed) => {
  const p = pairedClusterDiff(a, b, R, CLUSTER_B, createRng(seed));
  return { diff: round(p.diff), lo: round(p.lo), hi: round(p.hi) };
};

// V18: the V12(b) two-clause rule (team checklist Section 1.3) on rows pooled per (d, r):
// clause 1 learned k <= naive k at every row; clause 2 learned below naive beyond the Wilson
// intervals (learned.hi < naive.lo) at every d = 5 row. Clause 1 alone is not a pass.
export function v18Verdict(pooled) {
  const clause1 = pooled.every((row) => row.learned.k <= row.naive.k);
  const d5 = pooled.filter((row) => row.d === 5);
  const clause2 = d5.length > 0 && d5.every((row) => row.learned.hi < row.naive.lo);
  return { clause1, clause2, verdict: clause1 && clause2 ? 'pass' : 'fail' };
}

function stageHoldout() {
  const t0 = Date.now();
  if (!existsSync(HELDOUT_DIR)) throw new UsageError(`${HELDOUT_DIR} not found: assemble the held-out banks first (team checklist A53b)`);
  const heldout = readdirSync(HELDOUT_DIR).map((file) => ({ file, meta: parseHeldoutName(file) })).filter((x) => x.meta)
    .map(({ file, meta }) => {
      const bank = JSON.parse(readFileSync(join(HELDOUT_DIR, file), 'utf8'));
      validateBank(bank);
      if (bank.d !== meta.d || bank.r !== meta.r || bank.logical !== meta.L || (bank.basis ?? 'Z') !== 'Z') throw new Error(`${file}: d, r, logical or basis disagree with the file name`);
      return { file, ...meta, bank, shots: expandShots(bank) };
    })
    .filter((b) => b.r === HOLDOUT_R && HOLDOUT_D.includes(b.d))
    .sort((a, b) => a.d - b.d || a.L - b.L || a.h - b.h);
  if (heldout.length === 0) throw new UsageError(`no held-out banks in ${HELDOUT_DIR}`);

  // Training: the original banks only.
  const training = new Map();
  const trainedOn = [];
  for (const d of HOLDOUT_D) {
    const files = holdoutTrainingFiles(d, HOLDOUT_R);
    trainedOn.push(...files);
    training.set(d, holdoutTraining(files.map((file) => ({ file, bank: loadBank(file) })), d, HOLDOUT_R));
  }
  const noiseOf = (decoder, d) => noiseFor(decoder, training.get(d).pGate, training.get(d).rates);
  let nonExact = 0;
  const banksUsed = {};
  for (const d of HOLDOUT_D) for (const L of [0, 1]) banksUsed[`d${d}_L${L}`] = { used: heldout.filter((b) => b.d === d && b.L === L).length, planned: HOLDOUT_PLANNED[d] };

  // Setting 1 (V18): flat eps = 0.02, hard, R = 1, both decoders on the same seed per bank.
  const flat = createFlatReadout({ epsilon: HOLDOUT_EPS });
  const fail1 = new Map(); // "decoder,d,L" -> Uint8Array over the (d, L) banks in h order
  for (const decoder of ['naive', 'learned']) {
    for (const d of HOLDOUT_D) {
      for (const L of [0, 1]) {
        const parts = heldout.filter((b) => b.d === d && b.L === L).map((b) => {
          const res = failCountsOf(b.bank, b.shots, { readout: flat, mode: 'hard', noise: noiseOf(decoder, d), seedOf: () => seedForHoldout1(d, L, b.h), draws: 1 });
          nonExact += res.nonExact;
          return res.fails;
        });
        fail1.set(`${decoder},${d},${L}`, concatU8(parts));
      }
    }
  }
  // Cluster seed per (d, L) (L = 2: pooled); the same for both decoders (common random numbers).
  const cs = (d, L) => HOLDOUT_CLUSTER_SEED + 10000 * d + 1000 * L;
  const rows = [];
  for (const d of HOLDOUT_D) {
    for (const L of [0, 1]) {
      const nv = fail1.get(`naive,${d},${L}`);
      const ln = fail1.get(`learned,${d},${L}`);
      if (nv.length === 0) continue;
      rows.push({ d, r: HOLDOUT_R, L, banks: heldout.filter((b) => b.d === d && b.L === L).length, naive: rateSummary(nv, 1, cs(d, L)), learned: rateSummary(ln, 1, cs(d, L)), paired: pairedSummary(ln, nv, 1, cs(d, L) + 10) });
    }
  }
  const pooled = [];
  for (const d of HOLDOUT_D) {
    const nv = concatU8([0, 1].map((L) => fail1.get(`naive,${d},${L}`)));
    const ln = concatU8([0, 1].map((L) => fail1.get(`learned,${d},${L}`)));
    if (nv.length === 0) continue;
    const row = { d, r: HOLDOUT_R, naive: rateSummary(nv, 1, cs(d, 2)), learned: rateSummary(ln, 1, cs(d, 2)), paired: pairedSummary(ln, nv, 1, cs(d, 2) + 10) };
    row.learnedAtOrBelowNaive = row.learned.k <= row.naive.k;
    row.learnedBelowBeyondIntervals = row.learned.hi < row.naive.lo;
    pooled.push(row);
  }
  const V18 = v18Verdict(pooled);

  // Setting 2 (F1 out of sample): ion card, Z basis, the Stage 2 tau grid, d = 3 and 5, hard and
  // soft (shared draws), both decoders (shared seeds), R = 4, pooled over every held-out bank of d.
  const ionCard = JSON.parse(readFileSync(ION_PARAMS, 'utf8'));
  const taus = fieldValue(ionCard, 'tau_grid_us');
  const readouts = taus.map((tau) => createIonReadout(ionCard, tau));
  const series = [];
  const paired2 = [];
  const softWorseCount = { naive: 0, learned: 0 };
  const softWorsePoints = { naive: [], learned: [] };
  for (const decoder of ['naive', 'learned']) {
    for (const d of HOLDOUT_D) {
      const banksD = heldout.filter((b) => b.d === d);
      const byMode = { hard: [], soft: [] };
      taus.forEach((tau, t) => {
        for (const mode of STAGE2_MODES) {
          byMode[mode].push(concatU8(banksD.map((b) => {
            const res = failCountsOf(b.bank, b.shots, { readout: readouts[t], mode, noise: noiseOf(decoder, d), seedOf: (draw) => seedForHoldout2(d, b.L, b.h, t, draw), draws: HOLDOUT_DRAWS_F1 });
            nonExact += res.nonExact;
            return res.fails;
          })));
        }
      });
      for (const mode of STAGE2_MODES) {
        const sums = byMode[mode].map((f, t) => rateSummary(f, HOLDOUT_DRAWS_F1, HOLDOUT_CLUSTER_SEED + 500000 + 10000 * d + 1000 * modeIndex(mode) + t));
        series.push({ d, r: HOLDOUT_R, mode, decoder, pL: sums.map((x) => x.pL), lo: sums.map((x) => x.lo), hi: sums.map((x) => x.hi), loCluster: sums.map((x) => x.loCluster), hiCluster: sums.map((x) => x.hiCluster), n: sums.map((x) => x.n) });
      }
      taus.forEach((x, t) => {
        const p = pairedSummary(byMode.soft[t], byMode.hard[t], HOLDOUT_DRAWS_F1, HOLDOUT_CLUSTER_SEED + 600000 + 10000 * d + t);
        const softWorse = p.lo > 0;
        if (softWorse) {
          softWorseCount[decoder]++;
          softWorsePoints[decoder].push({ d, x });
        }
        paired2.push({ kind: 'softMinusHard', decoder, d, x, ...p, softWorseBeyondInterval: softWorse });
      });
    }
  }

  const runtimeS = (Date.now() - t0) / 1000;
  const result = {
    schema: 's2s-results/1',
    stage: 'holdout',
    trainedOn,
    heldout: heldout.map((b) => ({ file: b.file, d: b.d, L: b.L, h: b.h, seed: b.bank.sampler_seed ?? null, shots: b.shots.length, job_id: b.bank.job_id ?? 'unknown' })),
    setting1: { readout: 'flat', epsilon: HOLDOUT_EPS, mode: 'hard', readoutDrawsPerShot: 1, rows, pooled, V18 },
    setting2: { platform: ION, basis: 'Z', x: { name: 'tau_us', values: taus }, distances: HOLDOUT_D, readoutDrawsPerShot: HOLDOUT_DRAWS_F1, series, paired: paired2, softWorseCount, softWorsePoints, pointsPerDecoder: taus.length * HOLDOUT_D.length },
    params: {
      banksUsed,
      banksUsedNote: Object.values(banksUsed).every((b) => b.used === b.planned) ? 'all planned held-out banks used (DECISIONS E11)' : 'fewer held-out banks than planned (DECISIONS E11)',
      training: 'naive pGate = estimatePGate of the original L0 + L1 banks pooled; learned rates = ratesFromBanks(original L0, L1); no held-out bank feeds a rate',
      learnedRates: Object.fromEntries(HOLDOUT_D.map((d) => [`d${d}_r${HOLDOUT_R}`, roundObj(training.get(d).rates)])),
      pGate: Object.fromEntries(HOLDOUT_D.map((d) => [`d${d}_r${HOLDOUT_R}`, round(training.get(d).pGate)])),
      card: ionCard,
      V18rule: 'V12(b) two-clause rule (team checklist Section 1.3) on the pooled rows: clause 1 learned k <= naive k at every (d, r); clause 2 learned.hi < naive.lo (Wilson) at d = 5. The paired difference learned - naive is reported beside it and does not change the verdict',
      intervals: 'Wilson 95% (lo, hi); cluster bootstrap over quantum shots, B = 500 (loCluster, hiCluster); paired cluster bootstrap (paired)',
    },
    provenance: {
      tool: 'tools/sweep.mjs --stage holdout',
      commit: gitCommit(),
      date: new Date().toISOString(),
      node: process.version,
      params: ION_PARAMS,
      seedRule: 'setting 1: seed = 6100000 + 10000*d + 1000*L + 10*h (both decoders); setting 2: seed = 6200000 + 100000*h + 10000*d + 1000*L + 10*tauIndex + draw (both decoders, hard and soft); cluster seeds from 6900000',
      nonExact,
      runtime_s: runtimeS,
    },
  };
  const out = join(RESULTS_DIR, HOLDOUT_FILE);
  writeResult(out, result);

  const w3 = (o) => `${fmt(o.pL)} [${fmt(o.lo)}, ${fmt(o.hi)}] cluster [${fmt(o.loCluster)}, ${fmt(o.hiCluster)}] (k ${o.k} of ${o.n})`;
  console.log(`Stage holdout: ${heldout.length} held-out banks; trained on ${trainedOn.join(', ')}`);
  for (const [key, b] of Object.entries(banksUsed)) console.log(`  ${key}: ${b.used} of ${b.planned} planned`);
  console.log(`\nSetting 1 (V18): flat eps ${HOLDOUT_EPS}, hard, R = 1`);
  for (const r of rows) console.log(`  d = ${r.d} L${r.L} (${r.banks} banks): naive ${w3(r.naive)}\n                  learned ${w3(r.learned)}  paired ${r.paired.diff.toExponential(2)} [${r.paired.lo.toExponential(2)}, ${r.paired.hi.toExponential(2)}]`);
  console.log('  pooled L0 + L1:');
  for (const r of pooled) console.log(`  d = ${r.d}: naive ${w3(r.naive)}\n         learned ${w3(r.learned)}  paired ${r.paired.diff.toExponential(2)} [${r.paired.lo.toExponential(2)}, ${r.paired.hi.toExponential(2)}]  ${r.learnedBelowBeyondIntervals ? 'learned below beyond intervals' : r.learnedAtOrBelowNaive ? 'learned <= naive' : 'learned ABOVE naive'}`);
  console.log(`V18: clause 1 ${V18.clause1 ? 'holds' : 'FAILS'}, clause 2 ${V18.clause2 ? 'holds' : 'FAILS'} -> ${V18.verdict.toUpperCase()}`);
  console.log(`\nSetting 2 (F1 out of sample): ion card, Z, R = ${HOLDOUT_DRAWS_F1}; soft worse than hard beyond the paired interval: naive ${softWorseCount.naive} of ${taus.length * HOLDOUT_D.length}, learned ${softWorseCount.learned} of ${taus.length * HOLDOUT_D.length}`);
  for (const s of series) console.log(`  ${s.decoder.padEnd(7)} d = ${s.d} ${s.mode.padEnd(4)}: ${s.pL.map((p) => fmt(p)).join(' ')}`);
  console.log(`  tau grid: ${taus.join(' ')}`);
  console.log(`\nnon-exact matchings: ${nonExact}`);
  console.log(`wrote ${out} (runtime ${runtimeS.toFixed(1)} s)`);
}

const USAGE = 'usage: node tools/sweep.mjs --stage 1 | 2 | 3 | 4 [--decoder naive | learned | both] [--basis Z | X]\n'
  + '       stages 1-3: [--out <file>]; stages 2-3: [--set key=value ...]; stage 3: [--dense] (--set and --dense need --out)\n'
  + '       node tools/sweep.mjs --stage dem | holdout\n'
  + '       node tools/sweep.mjs --diag [--decoder naive | learned | both]';

function parseArgs(argv) {
  const opts = { stage: null, diag: false, decoder: null, basis: null, out: null, dense: false, set: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--diag') opts.diag = true;
    else if (a === '--dense') opts.dense = true;
    else if (a === '--stage' || a === '--decoder' || a === '--basis' || a === '--out' || a === '--set') {
      if (i + 1 >= argv.length) throw new UsageError(`${a} needs a value`);
      if (a === '--set') opts.set.push(argv[++i]);
      else opts[a.slice(2)] = argv[++i];
    } else throw new UsageError(`unknown argument ${a}`);
  }
  if (opts.decoder !== null && !['naive', 'learned', 'both'].includes(opts.decoder)) throw new UsageError(`--decoder must be naive, learned or both, got ${opts.decoder}`);
  if (opts.basis !== null && !['Z', 'X'].includes(opts.basis)) throw new UsageError(`--basis must be Z or X, got ${opts.basis}`);
  if (opts.diag === (opts.stage !== null)) throw new UsageError('give exactly one of --stage or --diag');
  if (opts.stage !== null && !['1', '2', '3', '4', 'dem', 'holdout'].includes(opts.stage)) throw new UsageError(`unknown stage ${opts.stage}`);
  if (opts.diag && opts.basis !== null) throw new UsageError(`--diag reads ${DIAG_BANK} (Z basis) only; drop --basis`);
  if (opts.stage === 'holdout' && (opts.decoder !== null || opts.basis !== null)) throw new UsageError('--stage holdout always runs both decoders on the Z-basis held-out banks; drop --decoder and --basis');
  if (opts.stage === 'dem' && (opts.decoder !== null || opts.basis !== null)) throw new UsageError('--stage dem always runs both decoders on every available basis; drop --decoder and --basis');
  if (opts.out !== null && !['1', '2', '3'].includes(opts.stage)) throw new UsageError('--out is available for --stage 1, 2 and 3 only');
  if (opts.set.length && !['2', '3'].includes(opts.stage)) throw new UsageError('--set overrides the ion or superconducting card: --stage 2 or 3 only');
  if (opts.dense && opts.stage !== '3') throw new UsageError('--dense is for --stage 3 only');
  if ((opts.dense || opts.set.length) && opts.out === null) throw new UsageError('--dense and --set need --out, so the standard results file is not overwritten');
  // Checked again when writing (outPath); here so a long run does not start in vain.
  if (opts.out !== null && existsSync(opts.out)) throw new UsageError(`--out ${opts.out} exists; results files are never overwritten`);
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
  if (opts.stage === 'holdout') {
    stageHoldout();
    return;
  }
  if (opts.stage === 'dem') {
    stageDem();
    return;
  }
  const decoders = (opts.decoder ?? 'both') === 'both' ? ['naive', 'learned'] : [opts.decoder];
  const run = { 1: stage1, 2: stage2, 3: stage3, 4: stage4 }[opts.stage];
  run({ decoders, basis: opts.basis ?? 'Z', opts });
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
