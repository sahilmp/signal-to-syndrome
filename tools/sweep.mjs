// Sweeps of the logical error rate against readout settings.
//
//   node tools/sweep.mjs --stage 1   flat readout over epsilon; writes data/results/stage1_flat.json
//   node tools/sweep.mjs --stage 2   trapped-ion readout over tau; writes data/results/stage2_ion.json
//   node tools/sweep.mjs --stage 3   superconducting readout over tau; writes data/results/stage3_sc.json
//   node tools/sweep.mjs --stage 4   platform comparison, break-even, sensitivity; writes data/results/stage4_comparison.json
//                                    (reads stage2_ion.json, stage3_sc.json and params/cycle.json, ion.json, sc.json)
//   node tools/sweep.mjs --diag      prints only the V9 fingerprint of data/banks/rep_d3_r3_L0.json
//
// Banks: every data/banks/rep_*.json (the v4_*.json validation banks are never read).
// pGate is calibrated per bank from its raw bits (readout off) with estimatePGate.

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateBank, expandShots, split } from '../src/core/bank.js';
import { computeDetectors } from '../src/core/detectors.js';
import { estimatePGate } from '../src/core/calibrate.js';
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

function stage2() {
  const t0 = Date.now();
  const card = JSON.parse(readFileSync(ION_PARAMS, 'utf8'));
  const taus = fieldValue(card, 'tau_grid_us');
  const banks = loadRepBanks();
  const byKey = new Map(banks.map((b) => [`${b.bank.d},${b.bank.r},${b.bank.logical}`, b]));
  const distances = STAGE2_D.filter((d) => byKey.has(`${d},${STAGE2_R},0`) && byKey.has(`${d},${STAGE2_R},1`));
  for (const d of [3, 5]) if (!distances.includes(d)) throw new Error(`missing banks for d=${d}, r=${STAGE2_R}`);
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
      tau, nTh: ro.threshold(), idleFlip: round(ro.idleFlipProbability()),
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
  const perShot = new Map(); // `${d},${mode}` -> per grid point Float64Array of pooled per-shot mean error
  const series = [];
  const perLogical = [];
  const seeds = {};
  const used = [];
  let nonExactTotal = 0;
  for (const d of distances) {
    const nShots = [0, 1].map((logical) => expandShots(byKey.get(`${d},${STAGE2_R},${logical}`).bank).length);
    const nPooled = nShots[0] + nShots[1];
    for (const mode of STAGE2_MODES) perShot.set(`${d},${mode}`, taus.map(() => new Float64Array(nPooled)));
    for (const logical of [0, 1]) {
      const { file, bank } = byKey.get(`${d},${STAGE2_R},${logical}`);
      used.push(file);
      if (!cal.has(file)) cal.set(file, calibrate(bank));
      const pGate = cal.get(file).p;
      const shots = expandShots(bank);
      const offset = logical === 0 ? 0 : nShots[0];
      seeds[file] = [];
      const rows = Object.fromEntries(STAGE2_MODES.map((mode) => [mode, { d, r: STAGE2_R, logical, mode, bank: file, pGate: round(pGate), k: [], n: [] }]));
      taus.forEach((tau, t) => {
        const tauSeeds = [];
        for (const mode of STAGE2_MODES) {
          const target = perShot.get(`${d},${mode}`)[t];
          let k = 0;
          for (let draw = 0; draw < READOUT_DRAWS; draw++) {
            const seed = seedFor2(d, logical, t, draw);
            if (mode === STAGE2_MODES[0]) tauSeeds.push(seed);
            const rng = createRng(seed);
            for (let s = 0; s < shots.length; s++) {
              const res = decodeShot({
                shotBits: shots[s], layout: bank.layout, d, r: bank.r,
                readout: readouts[t], mode, pGate, rng, logical: bank.logical,
              });
              if (!res.exact) nonExactTotal++;
              if (res.logicalError) {
                k++;
                target[offset + s] += 1 / READOUT_DRAWS;
              }
            }
          }
          rows[mode].k.push(k);
          rows[mode].n.push(shots.length * READOUT_DRAWS);
        }
        seeds[file].push(tauSeeds);
      });
      for (const mode of STAGE2_MODES) perLogical.push(rows[mode]);
    }
    for (const mode of STAGE2_MODES) {
      const [l0, l1] = perLogical.filter((row) => row.d === d && row.mode === mode);
      const ws = taus.map((_, t) => wilson(l0.k[t] + l1.k[t], l0.n[t] + l1.n[t]));
      series.push({
        d, r: STAGE2_R, mode,
        pL: ws.map((w) => round(w.p)), lo: ws.map((w) => round(w.lo)), hi: ws.map((w) => round(w.hi)),
        n: taus.map((_, t) => l0.n[t] + l1.n[t]),
      });
    }
  }

  // Optima. tau*_phys from the belief curve; tau*_log per distance and mode from the
  // per-shot values, bootstrapped over pooled quantum shots.
  const tauPhys = findMinimum(taus, assignment.belief, { logX: true });
  const tauPhysNoPump = findMinimum(taus, f1Detail.map((f) => f.beliefNoPumping), { logX: true });
  const tauLog = [];
  for (const d of distances) {
    for (const mode of STAGE2_MODES) {
      const m = minimumWithBootstrap(taus, perShot.get(`${d},${mode}`), BOOT_B, createRng(BOOT_SEED + 10 * d + (mode === 'soft' ? 1 : 0)));
      tauLog.push({ d, mode, xMin: round(m.xMin), lo: round(m.lo), hi: round(m.hi), atEdge: m.atEdge, yMin: round(m.yMin), fractionAtEdge: m.fractionAtEdge, fractionTied: m.fractionTied });
    }
  }

  // C2: soft at or below hard at every tau (pooled counts; intervals overlap = not resolved).
  const c2 = [];
  for (const d of distances) {
    const hard = series.find((s) => s.d === d && s.mode === 'hard');
    const soft = series.find((s) => s.d === d && s.mode === 'soft');
    taus.forEach((tau, t) => {
      c2.push({ d, tau, hard: hard.pL[t], soft: soft.pL[t], softAtOrBelow: soft.pL[t] <= hard.pL[t], softAboveBeyondIntervals: soft.lo[t] > hard.hi[t] });
    });
  }

  // The per-shot values stay in memory (about 2 MB as JSON); the seeds below reproduce them.
  const runtimeS = (Date.now() - t0) / 1000;
  const result = {
    schema: 's2s-results/1',
    stage: 2,
    platform: 'trapped-ion',
    x: { name: 'tau_us', values: taus },
    series,
    assignment,
    optima: {
      tauPhys: { xMin: round(tauPhys.xMin), atEdge: tauPhys.atEdge },
      tauLog: tauLog.map(({ d, mode, xMin, lo, hi, atEdge, fractionAtEdge, fractionTied }) => ({ d, mode, xMin, lo, hi, atEdge, fractionAtEdge, fractionTied })),
    },
    params: {
      card,
      distances, r: STAGE2_R, modes: STAGE2_MODES, logical_states: 'pooled (L0 + L1)',
      readoutDrawsPerShot: READOUT_DRAWS, bootstrapB: BOOT_B, f1Samples: F1_SAMPLES,
      readout: 'createIonReadout(card, tau)', pGate: 'estimatePGate per bank, readout off',
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
      tool: 'tools/sweep.mjs --stage 2',
      commit: gitCommit(),
      date: new Date().toISOString(),
      node: process.version,
      params: ION_PARAMS,
      banks: used,
      bankJobIds: Object.fromEntries(used.map((f) => [f, byKey.get(`${f.match(/_d(\d+)_/)[1]},${STAGE2_R},${f.match(/_L(\d)/)[1]}`).bank.job_id ?? 'unknown'])),
      pGate: Object.fromEntries(used.map((f) => [f, round(cal.get(f).p)])),
      seeds,
      seedRule: 'seed = 2000000 + 10000*d + 1000*logical + 10*tauIndex + draw (hard and soft share it); F1 seed 201; V7 seed 1201 + tauIndex; bootstrap seed 202 + 10*d + (soft ? 1 : 0)',
      nonExact: nonExactTotal,
      runtime_s: runtimeS,
    },
  };
  mkdirSync(RESULTS_DIR, { recursive: true });
  const out = join(RESULTS_DIR, 'stage2_ion.json');
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
  console.log(`\nF2-ion: logical error by tau, r = ${STAGE2_R}, L0 + L1 pooled, R = ${READOUT_DRAWS} draws per shot (n = ${series[0].n[0]} per point)`);
  for (const s of series) console.log(`  d = ${s.d} ${s.mode.padEnd(4)}: ${s.pL.map((p) => fmt(p)).join(' ')}`);
  console.log(`  tau grid: ${taus.join(' ')}`);
  console.log(`\nC2: soft at or below hard (point estimates) at ${c2.filter((c) => c.softAtOrBelow).length} of ${c2.length} points; soft above hard beyond the intervals at ${c2.filter((c) => c.softAboveBeyondIntervals).length}`);
  for (const c of c2.filter((x) => !x.softAtOrBelow)) console.log(`  soft > hard: d = ${c.d}, tau ${c.tau}: soft ${fmt(c.soft)} hard ${fmt(c.hard)}`);
  console.log(`\ntau*_log (bootstrap B = ${BOOT_B} over quantum shots, 95% percentile interval):`);
  for (const m of tauLog) {
    const where = m.atEdge ? `no interior minimum (lowest at tau ${m.xMin})` : `${fmt(m.xMin, 2)} us [${fmt(m.lo, 2)}, ${fmt(m.hi, 2)}]`;
    console.log(`  d = ${m.d} ${m.mode.padEnd(4)}: ${where}, pL ${fmt(m.yMin)}, replicates at edge ${(100 * m.fractionAtEdge).toFixed(1)}%, tied ${(100 * m.fractionTied).toFixed(1)}%`);
  }
  console.log(`\nnon-exact matchings: ${nonExactTotal}`);
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

function stage3() {
  const t0 = Date.now();
  if (!existsSync(SC_PARAMS)) throw new Error(`${SC_PARAMS} not found: create the superconducting parameter card first (team checklist Appendix T6)`);
  const card = JSON.parse(readFileSync(SC_PARAMS, 'utf8'));
  const taus = fieldValue(card, 'tau_grid_us');
  const ringup = fieldValue(card, 'ringup');
  const banks = loadRepBanks();
  const byKey = new Map(banks.map((b) => [`${b.bank.d},${b.bank.r},${b.bank.logical}`, b]));
  const distances = STAGE3_D.filter((d) => byKey.has(`${d},${STAGE3_R},0`) && byKey.has(`${d},${STAGE3_R},1`));
  for (const d of [3, 5]) if (!distances.includes(d)) throw new Error(`missing banks for d=${d}, r=${STAGE3_R}`);
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
      tau, snr: round(ro.snr()), idleFlip: round(ro.idleFlipProbability()),
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
  const perShot = new Map(); // `${d},${mode}` -> per grid point Float64Array of pooled per-shot mean error
  const series = [];
  const perLogical = [];
  const seeds = {};
  const used = [];
  let nonExactTotal = 0;
  for (const d of distances) {
    const nShots = [0, 1].map((logical) => expandShots(byKey.get(`${d},${STAGE3_R},${logical}`).bank).length);
    const nPooled = nShots[0] + nShots[1];
    for (const mode of STAGE3_MODES) perShot.set(`${d},${mode}`, taus.map(() => new Float64Array(nPooled)));
    for (const logical of [0, 1]) {
      const { file, bank } = byKey.get(`${d},${STAGE3_R},${logical}`);
      used.push(file);
      if (!cal.has(file)) cal.set(file, calibrate(bank));
      const pGate = cal.get(file).p;
      const shots = expandShots(bank);
      const offset = logical === 0 ? 0 : nShots[0];
      seeds[file] = [];
      const rows = Object.fromEntries(STAGE3_MODES.map((mode) => [mode, { d, r: STAGE3_R, logical, mode, bank: file, pGate: round(pGate), k: [], n: [] }]));
      taus.forEach((tau, t) => {
        const tauSeeds = [];
        for (const mode of STAGE3_MODES) {
          const target = perShot.get(`${d},${mode}`)[t];
          let k = 0;
          for (let draw = 0; draw < READOUT_DRAWS; draw++) {
            const seed = seedFor3(d, logical, t, draw);
            if (mode === STAGE3_MODES[0]) tauSeeds.push(seed);
            const rng = createRng(seed);
            for (let s = 0; s < shots.length; s++) {
              const res = decodeShot({
                shotBits: shots[s], layout: bank.layout, d, r: bank.r,
                readout: readouts[t], mode, pGate, rng, logical: bank.logical,
              });
              if (!res.exact) nonExactTotal++;
              if (res.logicalError) {
                k++;
                target[offset + s] += 1 / READOUT_DRAWS;
              }
            }
          }
          rows[mode].k.push(k);
          rows[mode].n.push(shots.length * READOUT_DRAWS);
        }
        seeds[file].push(tauSeeds);
      });
      for (const mode of STAGE3_MODES) perLogical.push(rows[mode]);
    }
    for (const mode of STAGE3_MODES) {
      const [l0, l1] = perLogical.filter((row) => row.d === d && row.mode === mode);
      const ws = taus.map((_, t) => wilson(l0.k[t] + l1.k[t], l0.n[t] + l1.n[t]));
      series.push({
        d, r: STAGE3_R, mode,
        pL: ws.map((w) => round(w.p)), lo: ws.map((w) => round(w.lo)), hi: ws.map((w) => round(w.hi)),
        n: taus.map((_, t) => l0.n[t] + l1.n[t]),
      });
    }
  }

  // Optima. tau*_phys from the belief curve; tau*_log per distance and mode from the
  // per-shot values, bootstrapped over pooled quantum shots.
  const tauPhys = findMinimum(taus, assignment.belief, { logX: true });
  const tauPhysEmp = findMinimum(taus, assignment.empirical, { logX: true });
  const tauLog = [];
  for (const d of distances) {
    for (const mode of STAGE3_MODES) {
      const m = minimumWithBootstrap(taus, perShot.get(`${d},${mode}`), BOOT_B, createRng(BOOT_SEED3 + 10 * d + (mode === 'soft' ? 1 : 0)));
      tauLog.push({ d, mode, xMin: round(m.xMin), lo: round(m.lo), hi: round(m.hi), atEdge: m.atEdge, yMin: round(m.yMin), fractionAtEdge: m.fractionAtEdge, fractionTied: m.fractionTied });
    }
  }

  // C2: soft at or below hard at every tau (pooled counts; intervals overlap = not resolved).
  const c2 = [];
  for (const d of distances) {
    const hard = series.find((s) => s.d === d && s.mode === 'hard');
    const soft = series.find((s) => s.d === d && s.mode === 'soft');
    taus.forEach((tau, t) => {
      c2.push({ d, tau, hard: hard.pL[t], soft: soft.pL[t], softAtOrBelow: soft.pL[t] <= hard.pL[t], softAboveBeyondIntervals: soft.lo[t] > hard.hi[t] });
    });
  }

  const runtimeS = (Date.now() - t0) / 1000;
  const result = {
    schema: 's2s-results/1',
    stage: 3,
    platform: 'superconducting',
    x: { name: 'tau_us', values: taus },
    series,
    assignment,
    optima: {
      tauPhys: { xMin: round(tauPhys.xMin), atEdge: tauPhys.atEdge },
      tauLog: tauLog.map(({ d, mode, xMin, lo, hi, atEdge, fractionAtEdge, fractionTied }) => ({ d, mode, xMin, lo, hi, atEdge, fractionAtEdge, fractionTied })),
    },
    params: {
      card,
      distances, r: STAGE3_R, modes: STAGE3_MODES, logical_states: 'pooled (L0 + L1)',
      readoutDrawsPerShot: READOUT_DRAWS, bootstrapB: BOOT_B, f1Samples: F1_SAMPLES,
      readout: 'createScReadout(card, tau)', pGate: 'estimatePGate per bank, readout off',
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
      tool: 'tools/sweep.mjs --stage 3',
      commit: gitCommit(),
      date: new Date().toISOString(),
      node: process.version,
      params: SC_PARAMS,
      banks: used,
      bankJobIds: Object.fromEntries(used.map((f) => [f, byKey.get(`${f.match(/_d(\d+)_/)[1]},${STAGE3_R},${f.match(/_L(\d)/)[1]}`).bank.job_id ?? 'unknown'])),
      pGate: Object.fromEntries(used.map((f) => [f, round(cal.get(f).p)])),
      seeds,
      seedRule: 'seed = 3000000 + 10000*d + 1000*logical + 10*tauIndex + draw (hard and soft share it); F1 seed 301; V8 seed 1301 + tauIndex; V10 seed 2301 + tauIndex; bootstrap seed 302 + 10*d + (soft ? 1 : 0)',
      nonExact: nonExactTotal,
      runtime_s: runtimeS,
    },
  };
  mkdirSync(RESULTS_DIR, { recursive: true });
  const out = join(RESULTS_DIR, 'stage3_sc.json');
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
  console.log(`\nF2-sc: logical error by tau, r = ${STAGE3_R}, L0 + L1 pooled, R = ${READOUT_DRAWS} draws per shot (n = ${series[0].n[0]} per point)`);
  for (const s of series) console.log(`  d = ${s.d} ${s.mode.padEnd(4)}: ${s.pL.map((p) => fmt(p)).join(' ')}`);
  console.log(`  tau grid: ${taus.join(' ')}`);
  console.log(`\nC2: soft at or below hard (point estimates) at ${c2.filter((c) => c.softAtOrBelow).length} of ${c2.length} points; soft above hard beyond the intervals at ${c2.filter((c) => c.softAboveBeyondIntervals).length}`);
  for (const c of c2.filter((x) => !x.softAtOrBelow)) console.log(`  soft > hard: d = ${c.d}, tau ${c.tau}: soft ${fmt(c.soft)} hard ${fmt(c.hard)}`);
  console.log(`\ntau*_log (bootstrap B = ${BOOT_B} over quantum shots, 95% percentile interval):`);
  for (const m of tauLog) {
    const where = m.atEdge ? `no interior minimum (lowest at tau ${m.xMin})` : `${fmt(m.xMin, 3)} us [${fmt(m.lo, 3)}, ${fmt(m.hi, 3)}]`;
    console.log(`  d = ${m.d} ${m.mode.padEnd(4)}: ${where}, pL ${fmt(m.yMin)}, replicates at edge ${(100 * m.fractionAtEdge).toFixed(1)}%, tied ${(100 * m.fractionTied).toFixed(1)}%`);
  }
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

// The stage 2 or 3 results as an "arm": tau grid, pooled series, assignment curves, idle
// probabilities and tau*_log (with bootstrap intervals for the full runs).
function armFromResults(res) {
  const taus = res.x.values;
  const empMin = findMinimum(taus, res.assignment.empirical, { logX: true });
  return {
    platform: res.platform, taus, full: true,
    distances: [...new Set(res.series.map((s) => s.d))].sort((a, b) => a - b),
    series: res.series,
    belief: res.assignment.belief,
    empirical: res.assignment.empirical,
    idle: res.readout.idleFlip,
    tauPhysBelief: res.optima.tauPhys,
    tauPhysEmp: { xMin: empMin.xMin, atEdge: empMin.atEdge },
    tauLog: res.optima.tauLog,
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
      n += shots.length;
      taus.forEach((_, t) => {
        for (const mode of STAGE4_MODES) {
          const rng = createRng(seedFor4(platform, d, logical, t));
          for (const bits of shots) {
            const res = decodeShot({ shotBits: bits, layout: bank.layout, d, r: bank.r, readout: readouts[t], mode, pGate, rng, logical: bank.logical });
            if (!res.exact) ctx.nonExact++;
            k[mode][t] += res.logicalError;
          }
        }
      });
    }
    for (const mode of STAGE4_MODES) {
      const ws = k[mode].map((kk) => wilson(kk, n));
      const s = { d, r: ctx.r, mode, pL: ws.map((w) => w.p), lo: ws.map((w) => w.lo), hi: ws.map((w) => w.hi), n: taus.map(() => n) };
      series.push(s);
      const m = findMinimum(taus, s.pL, { logX: true });
      tauLog.push({ d, mode, xMin: m.xMin, atEdge: m.atEdge, tied: m.tied });
    }
  }
  const empMin = findMinimum(taus, empirical, { logX: true });
  const belief = readouts.map((ro) => ro.averageAssignmentError());
  return {
    platform, taus, full: false, distances: ctx.distances, series, belief, empirical,
    idle: readouts.map((ro) => ro.idleFlipProbability()),
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

function stage4() {
  const t0 = Date.now();
  for (const f of [CYCLE_PARAMS, ION_PARAMS, SC_PARAMS, join(RESULTS_DIR, STAGE2_FILE), join(RESULTS_DIR, STAGE3_FILE)]) {
    if (!existsSync(f)) throw new Error(`${f} not found${f === CYCLE_PARAMS ? ': create the cycle-time card first (team checklist Appendix T6)' : ''}`);
  }
  const cycle = JSON.parse(readFileSync(CYCLE_PARAMS, 'utf8'));
  const cards = { [ION]: JSON.parse(readFileSync(ION_PARAMS, 'utf8')), [SC]: JSON.parse(readFileSync(SC_PARAMS, 'utf8')) };
  const results = { [ION]: JSON.parse(readFileSync(join(RESULTS_DIR, STAGE2_FILE), 'utf8')), [SC]: JSON.parse(readFileSync(join(RESULTS_DIR, STAGE3_FILE), 'utf8')) };
  for (const p of [ION, SC]) {
    if (!cycle[p]) throw new Error(`${CYCLE_PARAMS} has no entry for ${p}`);
    cycleTime(cycle[p], 1); // throws on an unfilled (null) value
  }
  // The full tables come from the stage files; warn if their cards differ from params/.
  const cardsMatch = Object.fromEntries([ION, SC].map((p) => [p, JSON.stringify(results[p].params.card) === JSON.stringify(cards[p])]));

  // Full statistics: tables and conclusions from the Stage 2 and 3 results.
  const full = { [ION]: armFromResults(results[ION]), [SC]: armFromResults(results[SC]) };
  const tables = { [ION]: platformTable(full[ION], cycle[ION]), [SC]: platformTable(full[SC], cycle[SC]) };
  const conclusions = evaluateConclusions(full[ION], full[SC], tables);

  // Reduced statistics: banks, calibration and the shot subsample, shared by every rerun.
  const r = 3;
  const repBanks = loadRepBanks();
  const byKey = new Map(repBanks.map((b) => [`${b.bank.d},${b.bank.r},${b.bank.logical}`, b]));
  const distances = [3, 5, 7].filter((d) => byKey.has(`${d},${r},0`) && byKey.has(`${d},${r},1`));
  const ctx = { r, distances, banks: new Map(), nonExact: 0 };
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
  console.log(`Sensitivity: reduced statistics, R = 1, ${SENS_SHOTS} shots per bank, no bootstrap, d = ${distances.join(', ')}`);
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
    platforms,
    conclusions,
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
      sensitivity: { scales: SENS_SCALES, readoutDrawsPerShot: 1, shotsPerBank: SENS_SHOTS, f1Samples: SENS_F1_SAMPLES, bootstrap: false, distances, parameters: SENS_PARAMS, cycleParameters: SENS_CYCLE_PARAMS },
    },
    provenance: {
      tool: 'tools/sweep.mjs --stage 4',
      commit: gitCommit(),
      date: new Date().toISOString(),
      node: process.version,
      params: [CYCLE_PARAMS, ION_PARAMS, SC_PARAMS],
      inputs: Object.fromEntries([ION, SC].map((p) => [p, { file: join(RESULTS_DIR, p === ION ? STAGE2_FILE : STAGE3_FILE), commit: results[p].provenance.commit, date: results[p].provenance.date, cardMatchesParams: cardsMatch[p] }])),
      banks: usedBanks,
      pGate: Object.fromEntries([...ctx.banks.values()].map((b) => [b.file, round(b.pGate)])),
      seedRule: `reduced decode seed = 4000000 + (superconducting ? 100000 : 0) + 10000*d + 1000*logical + tauIndex (same in every rerun; hard and soft share it); shot subsample seed ${SENS_SUBSAMPLE_SEED} + 10*d + logical; F1 seed ${SENS_F1_SEED}`,
      nonExact: ctx.nonExact,
      runtime_s: runtimeS,
    },
  };
  mkdirSync(RESULTS_DIR, { recursive: true });
  const out = join(RESULTS_DIR, 'stage4_comparison.json');
  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);

  // Summary.
  const g = (v) => (v === null || v === undefined ? '—' : v === 0 ? '0' : Number(v).toExponential(3));
  for (const p of [ION, SC]) if (!cardsMatch[p]) console.log(`WARNING: the card in ${p === ION ? STAGE2_FILE : STAGE3_FILE} differs from ${p === ION ? ION_PARAMS : SC_PARAMS}; the full tables use the stage file, the sensitivity uses params/`);
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
  show('Conclusions, full statistics', conclusions);
  for (const c of ['C1', 'C2', 'C3', 'C4']) {
    console.log(`  ${c}: ${Object.entries(conclusions[c].parts).map(([k, v]) => `${k} ${v.verdict}`).join('; ')}`);
  }
  show('Conclusions, reduced baseline', baseline.conclusions);
  console.log('\nSensitivity (reduced statistics):');
  for (const s of sensitivity) console.log(`  ${s.platform.padEnd(15)} ${s.parameter.padEnd(28)} x ${String(s.scale).padEnd(3)}  C1 ${s.C1.padEnd(12)} C2 ${s.C2.padEnd(12)} C3 ${s.C3.padEnd(12)} C4 ${s.C4}`);
  console.log(`\nnon-exact matchings (reduced runs): ${ctx.nonExact}`);
  console.log(`wrote ${out} (runtime ${runtimeS.toFixed(1)} s)`);
}

function diag() {
  console.log(diagnostic(loadBank(DIAG_BANK)));
}

const args = process.argv.slice(2);
if (args.includes('--diag')) {
  diag();
} else if (args[0] === '--stage' && args[1] === '1') {
  stage1();
} else if (args[0] === '--stage' && args[1] === '2') {
  stage2();
} else if (args[0] === '--stage' && args[1] === '3') {
  stage3();
} else if (args[0] === '--stage' && args[1] === '4') {
  stage4();
} else {
  console.error('usage: node tools/sweep.mjs --stage 1 | --stage 2 | --stage 3 | --stage 4 | --diag');
  process.exit(1);
}
