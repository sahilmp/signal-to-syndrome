// Sweeps of the logical error rate against readout settings.
//
//   node tools/sweep.mjs --stage 1   flat readout over epsilon; writes data/results/stage1_flat.json
//   node tools/sweep.mjs --stage 2   trapped-ion readout over tau; writes data/results/stage2_ion.json
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
import { createIonReadout } from '../src/core/readout/ion.js';
import { runPoint, diagnostic, decodeShot } from '../src/core/sweep.js';
import { findMinimum, minimumWithBootstrap } from '../src/core/optimum.js';

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

// ln Pois(n; lambda) by direct summation (n is small here: it is at most nTh).
function poisCdf(m, lambda) {
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
      tauLog.push({ d, mode, xMin: round(m.xMin), lo: round(m.lo), hi: round(m.hi), atEdge: m.atEdge, yMin: round(m.yMin), fractionAtEdge: m.fractionAtEdge });
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
      tauLog: tauLog.map(({ d, mode, xMin, lo, hi, atEdge, fractionAtEdge }) => ({ d, mode, xMin, lo, hi, atEdge, fractionAtEdge })),
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
    console.log(`  d = ${m.d} ${m.mode.padEnd(4)}: ${where}, pL ${fmt(m.yMin)}, replicates at edge ${(100 * m.fractionAtEdge).toFixed(1)}%`);
  }
  console.log(`\nnon-exact matchings: ${nonExactTotal}`);
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
} else {
  console.error('usage: node tools/sweep.mjs --stage 1 | --stage 2 | --diag');
  process.exit(1);
}
