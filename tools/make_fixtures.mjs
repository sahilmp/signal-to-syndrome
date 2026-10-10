// Writes the nine v1 fixture files and the eleven v2 fixture files (*_v2.json) into
// data/fixtures/ (every file has "fixture": true).
// Results are plainly synthetic smooth curves; the two banks are simulated directly
// at bit level. The interface uses these only until Person A's real files arrive.
// Usage: node tools/make_fixtures.mjs

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRng } from '../src/core/rng.js';
import { validateBank, expandShots, split } from '../src/core/bank.js';
import { computeDetectors } from '../src/core/detectors.js';
import { buildGraph } from '../src/core/graph.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'fixtures');
const PROVENANCE = { generator: 'tools/make_fixtures.mjs', fixture: true, note: 'synthetic placeholder, not a result' };
const PLACEHOLDER = 'fixture placeholder, not a published value';

const round6 = (v) => Math.round(v * 1e6) / 1e6;

// Wilson interval at a given proportion p (so the synthetic band is smooth).
function band(p, n, z = 1.96) {
  const z2 = z * z;
  const den = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
  return { lo: round6(Math.max(0, centre - half)), hi: round6(Math.min(1, centre + half)) };
}

function seriesFrom(xs, d, r, mode, pFn, n) {
  const pL = xs.map((x) => round6(Math.min(0.5, pFn(x))));
  const bands = pL.map((p) => band(p, n));
  return { d, r, mode, pL, lo: bands.map((b) => b.lo), hi: bands.map((b) => b.hi), n: xs.map(() => n) };
}

function argminInfo(xs, ys) {
  let i = 0;
  for (let t = 1; t < ys.length; t++) if (ys[t] < ys[i]) i = t;
  return { i, xMin: xs[i], atEdge: i === 0 || i === xs.length - 1 };
}

// ---- Parameter cards (templates of checklist Appendix T6, values filled with placeholders).

const paramsIon = {
  schema: 's2s-params/1',
  fixture: true,
  platform: 'trapped-ion',
  bright_is_bit: 1,
  R_bright_per_us: { value: 0.05, source: PLACEHOLDER },
  R_dark_per_us: { value: 0.002, source: PLACEHOLDER },
  gamma_bright_to_dark_per_us: { value: 0.0001, source: PLACEHOLDER },
  gamma_dark_to_bright_per_us: { value: 0.00002, source: PLACEHOLDER },
  T1_idle_us: { value: 1e9, source: PLACEHOLDER },
  tau_grid_us: { value: [25, 50, 75, 100, 150, 200, 300, 400, 600, 800], source: PLACEHOLDER },
};

const paramsSc = {
  schema: 's2s-params/1',
  fixture: true,
  platform: 'superconducting',
  chi_over_2pi_MHz: { value: 1.0, source: PLACEHOLDER },
  kappa_over_2pi_MHz: { value: 2.0, source: PLACEHOLDER },
  nbar: { value: 5, source: PLACEHOLDER },
  eta: { value: 0.3, source: PLACEHOLDER },
  T1_us: { value: 50, source: PLACEHOLDER },
  detection: 'heterodyne',
  ringup: true,
  tau_grid_us: { value: [0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.7, 1.0, 1.4, 2.0, 3.0], source: PLACEHOLDER },
};

const cycleEntry = (gate, reset) => ({
  two_qubit_gate_us: { value: gate, source: PLACEHOLDER },
  gate_layers_per_round: { value: 2, source: 'derived: each round is two parallel CNOT layers' },
  reset_us: { value: reset, source: PLACEHOLDER },
});
const paramsCycle = {
  schema: 's2s-params/1',
  fixture: true,
  'trapped-ion': cycleEntry(600, 50),
  superconducting: cycleEntry(0.05, 0.5),
};

// ---- Results (s2s-results/1). Synthetic logical error: 10 (eA + 0.005)^((d+1)/2).

const DISTANCES = [3, 5, 7];
const pLogical = (eA, d) => 10 * (eA + 0.005) ** ((d + 1) / 2);

const epsGrid = [0, 0.005, 0.01, 0.02, 0.03, 0.05, 0.08, 0.12];
const stage1 = {
  schema: 's2s-results/1',
  fixture: true,
  stage: 1,
  platform: 'flat',
  x: { name: 'epsilon', values: epsGrid },
  series: DISTANCES.map((d) => seriesFrom(epsGrid, d, 3, 'hard', (e) => pLogical(e, d), 4000)),
  params: { epsilon_grid: epsGrid, distances: DISTANCES, r: 3 },
  provenance: { ...PROVENANCE },
};

// Stages 2 and 3: a U-shaped assignment error eA(tau) = a exp(-tau/t0) + b tau; soft = 0.7 hard.
function tauStage(stage, platform, xs, eA, params) {
  const series = [];
  const tauLog = [];
  for (const d of DISTANCES) {
    for (const [mode, f] of [['hard', 1], ['soft', 0.7]]) {
      const s = seriesFrom(xs, d, 3, mode, (t) => f * pLogical(eA(t), d), 4000);
      series.push(s);
      const m = argminInfo(xs, s.pL);
      const lo = xs[Math.max(0, m.i - 1)];
      const hi = xs[Math.min(xs.length - 1, m.i + 1)];
      tauLog.push({ d, mode, xMin: m.xMin, lo, hi, atEdge: m.atEdge });
    }
  }
  const belief = xs.map((t) => round6(eA(t)));
  const empirical = belief.map((b) => round6(b * 1.02));
  const bands = empirical.map((p) => band(p, 200000));
  const phys = argminInfo(xs, belief);
  return {
    schema: 's2s-results/1',
    fixture: true,
    stage,
    platform,
    x: { name: 'tau_us', values: xs },
    series,
    assignment: { belief, empirical, lo: bands.map((b) => b.lo), hi: bands.map((b) => b.hi) },
    optima: { tauPhys: { xMin: phys.xMin, atEdge: phys.atEdge }, tauLog },
    params,
    provenance: { ...PROVENANCE },
  };
}

const stage2 = tauStage(2, 'trapped-ion', paramsIon.tau_grid_us.value,
  (t) => 0.5 * Math.exp(-t / 40) + t / 40000, paramsIon);
const stage3 = tauStage(3, 'superconducting', paramsSc.tau_grid_us.value,
  (t) => 0.5 * Math.exp(-t / 0.12) + t / 200, paramsSc);

// Stage 4: per platform P = { tauLog, perRound, perMicrosecond, breakEven }.
function platformSummary(st, cycleUs) {
  const byMode = (mode) => st.optima.tauLog.filter((o) => o.mode === mode)
    .map(({ d, xMin, lo, hi, atEdge }) => ({ d, xMin, lo, hi, atEdge }));
  const perRound = (mode) => st.series.filter((s) => s.mode === mode).map((s) => {
    const p = Math.min(...s.pL) / s.r;
    return { d: s.d, value: round6(p), lo: round6(p * 0.85), hi: round6(p * 1.15) };
  });
  const perUs = (rows) => rows.map((x) => ({ d: x.d, value: x.value / cycleUs, lo: x.lo / cycleUs, hi: x.hi / cycleUs }));
  const prH = perRound('hard');
  const prS = perRound('soft');
  return {
    tauLog: { hard: byMode('hard'), soft: byMode('soft') },
    perRound: { hard: prH, soft: prS },
    perMicrosecond: { hard: perUs(prH), soft: perUs(prS) },
    breakEven: { epsBar: 0.03, tau_us: st.optima.tauPhys.xMin },
  };
}
const ionCycle = 2 * 600 + 50 + 150;
const scCycle = 2 * 0.05 + 0.5 + 0.4;
const verdicts = ['holds', 'flips', 'undetermined'];
const sensitivity = [];
for (const platform of ['trapped-ion', 'superconducting']) {
  const names = platform === 'trapped-ion' ? ['R_bright_per_us', 'R_dark_per_us'] : ['T1_us', 'eta'];
  for (const [pi, parameter] of names.entries()) {
    for (const [si, scale] of [0.5, 2].entries()) {
      sensitivity.push({
        platform, parameter, scale,
        C1: 'holds', C2: 'holds', C3: verdicts[(pi + si) % 3], C4: verdicts[(pi + 2 * si + 1) % 3],
      });
    }
  }
}
const stage4 = {
  schema: 's2s-results/1',
  fixture: true,
  stage: 4,
  platforms: {
    'trapped-ion': platformSummary(stage2, ionCycle),
    superconducting: platformSummary(stage3, scCycle),
  },
  sensitivity,
  provenance: { ...PROVENANCE },
};

// ---- Banks (s2s-bank/1), simulated at bit level.
// Before each round every data qubit flips with probability P (it then stays flipped,
// so it changes the reports of the checks touching it in that and later rounds and
// the final readout); every measured bit then flips with probability P on its own.

const P = 0.02;
const BANK_SEED = 11;
const BANK_SHOTS = 2000;

// sha256 of json.dumps(counts, sort_keys=True, separators=(",", ":")) as in Python.
// Built by hand: JS objects list integer-like keys ("10") first, whatever the insertion order.
function countsSha256(counts) {
  const keys = Object.keys(counts).sort();
  const text = `{${keys.map((k) => `${JSON.stringify(k)}:${counts[k]}`).join(',')}}`;
  return createHash('sha256').update(text).digest('hex');
}

function makeBank(d, r, rng) {
  const nc = d - 1;
  const nClbits = nc * r + d;
  const layout = {
    ancilla: Array.from({ length: r }, (_, k) => Array.from({ length: nc }, (_, j) => k * nc + j)),
    data: Array.from({ length: d }, (_, i) => nc * r + i),
  };
  const logical = 0;
  const raw = new Map();
  for (let s = 0; s < BANK_SHOTS; s++) {
    const z = new Uint8Array(d).fill(logical);
    let value = 0;
    for (let k = 0; k < r; k++) {
      for (let i = 0; i < d; i++) if (rng.uniform() < P) z[i] ^= 1;
      for (let j = 0; j < nc; j++) {
        const bit = (z[j] ^ z[j + 1] ^ (rng.uniform() < P ? 1 : 0)) & 1;
        if (bit) value += 2 ** layout.ancilla[k][j];
      }
    }
    for (let i = 0; i < d; i++) {
      const bit = (z[i] ^ (rng.uniform() < P ? 1 : 0)) & 1;
      if (bit) value += 2 ** layout.data[i];
    }
    const key = value.toString(16);
    raw.set(key, (raw.get(key) || 0) + 1);
  }
  const counts = {};
  for (const key of [...raw.keys()].sort((a, b) => parseInt(a, 16) - parseInt(b, 16))) counts[key] = raw.get(key);

  const bank = {
    schema: 's2s-bank/1',
    fixture: true,
    code: 'repetition',
    d, r, logical,
    mode: 'fresh-ancilla',
    backend: 'fixture-bit-level-simulator',
    noise_model: 'fixture',
    sampler_seed: BANK_SEED,
    job_id: 'fixture',
    native_ops: {},
    date: '2026-10-07T00:00:00Z',
    detector_rate: 0,
    shots: BANK_SHOTS,
    n_qubits: 2 * d - 1,
    n_clbits: nClbits,
    layout,
    bit_order: 'qiskit-little-endian',
    key_encoding: 'hex',
    counts,
    checksum: { total_shots: BANK_SHOTS, n_keys: Object.keys(counts).length, sha256: countsSha256(counts) },
  };
  // Mean fraction of detectors lit per shot.
  let lit = 0;
  for (const bits of expandShots(bank)) {
    const { m, x } = split(bits, layout, d, r);
    for (const v of computeDetectors(m, x, d, r)) lit += v;
  }
  bank.detector_rate = round6(lit / (BANK_SHOTS * nc * (r + 1)));
  validateBank(bank);
  return bank;
}

// One rng (seed 11) for both banks, drawn in file order.
const bankRng = createRng(BANK_SEED);
const bankD3R1 = makeBank(3, 1, bankRng);
const bankD3R3 = makeBank(3, 3, bankRng);

// ---- v2 fixtures (team checklist Appendix U4 results formats, U5 card fields).
// Plainly synthetic, like the v1 files above; no random draws, so the v1 files are unchanged.

const PROVENANCE_V2 = { ...PROVENANCE, formats: 'team checklist Appendix U4, U5' };
const halfExp = (t, T) => 0.5 * (1 - Math.exp(-t / T)); // idle flip 1/2 (1 - exp(-tau/T))
const xor = (a, b) => a * (1 - b) + b * (1 - a);

const paramsIonV2 = {
  ...paramsIon,
  T2_idle_us: { value: 1e6, source: PLACEHOLDER },
  crosstalk_rate_per_us: { value: 1e-5, source: PLACEHOLDER },
  crosstalk_scan_per_us: {
    value: [0, 1e-6, 1e-5, 1e-4, 1e-3],
    source: 'scan grid spanning shielded to unshielded same-species chains; illustrative',
  },
};
const paramsScV2 = { ...paramsSc, T2_us: { value: 30, source: PLACEHOLDER } };
const paramsCycleV2 = {
  schema: 's2s-params/1',
  fixture: true,
  'trapped-ion': {
    ...cycleEntry(600, 50),
    gate_layers_per_round: { value: '2*(d-1)', source: 'conservative choice (sequential two-qubit gates); fixture placeholder' },
  },
  superconducting: cycleEntry(0.05, 0.5),
};
// Two-qubit gate layers per round for a card entry: a number, or the U5 expression "2*(d-1)".
const layersPerRound = (entry, d) => (entry.gate_layers_per_round.value === '2*(d-1)' ? 2 * (d - 1) : entry.gate_layers_per_round.value);
const cycleUs = (platform, tau, d) => {
  const e = paramsCycleV2[platform];
  return layersPerRound(e, d) * e.two_qubit_gate_us.value + tau + e.reset_us.value;
};

// The learned decoder is synthetic 20 % better than the naive one; the X basis has 10 % more gate noise.
const DECODERS = [['naive', 1], ['learned', 0.8]];
const BASIS_GATE = { Z: 1, X: 1.1 };
const N_V2 = 8000; // L0 + L1 pooled

function stage1V2(basis) {
  const series = [];
  for (const [decoder, g] of DECODERS) {
    for (const d of DISTANCES) {
      for (const [mode, f] of [['hard', 1], ['soft', 1]]) { // flat model: soft equals hard
        const s = seriesFrom(epsGrid, d, 3, mode, (e) => f * g * BASIS_GATE[basis] * pLogical(e, d), N_V2);
        series.push({ ...s, decoder });
      }
    }
  }
  return {
    schema: 's2s-results/1',
    fixture: true,
    stage: 1,
    platform: 'flat',
    basis,
    x: { name: 'epsilon', values: epsGrid },
    series,
    params: { epsilon_grid: epsGrid, distances: DISTANCES, r: 3, decoders: DECODERS.map(([n]) => n) },
    provenance: { ...PROVENANCE_V2 },
  };
}

// Interval of a grid minimum: its neighbours on the grid.
function optimumEntry(xs, ys) {
  const m = argminInfo(xs, ys);
  return { xMin: m.xMin, lo: xs[Math.max(0, m.i - 1)], hi: xs[Math.min(xs.length - 1, m.i + 1)], atEdge: m.atEdge };
}

// Stages 2 and 3, v2: the logical error now also feels idle and crosstalk errors,
// eTotal = eA + idle (+ crosstalk), with idle from T1 (Z) or T2 (X).
function tauStageV2(stage, platform, card, basis, eA, idleT, xtRate) {
  const xs = card.tau_grid_us.value;
  const gate = 0.009 * BASIS_GATE[basis];
  const idleOf = (t) => halfExp(t, idleT);
  const xtOf = (t, rate) => (rate > 0 ? 0.5 * (1 - Math.exp(-rate * t)) : 0);
  const eTot = (t, rate) => xor(eA(t), xor(idleOf(t), xtOf(t, rate)));

  const series = [];
  const tauLog = [];
  for (const [decoder, g] of DECODERS) {
    for (const d of DISTANCES) {
      for (const [mode, f] of [['hard', 1], ['soft', 0.7]]) {
        const s = seriesFrom(xs, d, 3, mode, (t) => f * g * BASIS_GATE[basis] * pLogical(eTot(t, xtRate), d), N_V2);
        series.push({ ...s, decoder });
        tauLog.push({ d, mode, decoder, ...optimumEntry(xs, s.pL) });
      }
    }
  }
  const belief = xs.map((t) => round6(eA(t)));
  const empirical = belief.map((b) => round6(b * 1.02));
  const bands = empirical.map((p) => band(p, 200000));
  const phys = argminInfo(xs, belief);
  const physEmp = argminInfo(xs, empirical);
  const out = {
    schema: 's2s-results/1',
    fixture: true,
    stage,
    platform,
    basis,
    x: { name: 'tau_us', values: xs },
    series,
    assignment: { belief, empirical, lo: bands.map((b) => b.lo), hi: bands.map((b) => b.hi) },
    optima: {
      tauPhys: { xMin: phys.xMin, atEdge: phys.atEdge },
      tauPhysEmpirical: { xMin: physEmp.xMin, atEdge: physEmp.atEdge },
      tauLog,
    },
    budget: {
      label: 'error sources per round, per qubit (approximate)',
      tau_us: xs,
      readout: empirical,
      idle: xs.map((t) => round6(idleOf(t))),
      crosstalk: xs.map((t) => round6(xtOf(t, xtRate))),
      gate,
    },
    params: { card, distances: DISTANCES, r: 3, decoders: DECODERS.map(([n]) => n) },
    provenance: { ...PROVENANCE_V2 },
  };
  if (stage === 2) {
    const rates = card.crosstalk_scan_per_us.value;
    const entries = [];
    for (const rate of rates) {
      for (const d of [3, 5]) {
        for (const [mode, f] of [['hard', 1], ['soft', 0.7]]) {
          const s = seriesFrom(xs, d, 3, mode, (t) => 0.8 * f * BASIS_GATE[basis] * pLogical(eTot(t, rate), d), N_V2);
          const opt = optimumEntry(xs, s.pL);
          entries.push({
            rate, d, mode, pL: s.pL, lo: s.lo, hi: s.hi, tauLog: opt,
            interiorBelowTauPhys: !opt.atEdge && opt.xMin < physEmp.xMin,
          });
        }
      }
    }
    out.crosstalkScan = { rates_per_us: rates, entries };
  }
  return out;
}

const eAIon = (t) => 0.5 * Math.exp(-t / 40) + t / 40000;
const eASc = (t) => 0.5 * Math.exp(-t / 0.12) + t / 200;
const stage1V2Z = stage1V2('Z');
const stage1V2X = stage1V2('X');
const stage2V2Z = tauStageV2(2, 'trapped-ion', paramsIonV2, 'Z', eAIon, paramsIonV2.T1_idle_us.value, paramsIonV2.crosstalk_rate_per_us.value);
const stage2V2X = tauStageV2(2, 'trapped-ion', paramsIonV2, 'X', eAIon, paramsIonV2.T2_idle_us.value, paramsIonV2.crosstalk_rate_per_us.value);
const stage3V2Z = tauStageV2(3, 'superconducting', paramsScV2, 'Z', eASc, paramsScV2.T1_us.value, 0);
const stage3V2X = tauStageV2(3, 'superconducting', paramsScV2, 'X', eASc, paramsScV2.T2_us.value, 0);

// Stage dem: synthetic detector statistics on the learned graph (src/core/graph.js) from
// fixed class rates; p_ij is the class rate of the edge joining i and j, else 0.
const DEM_CLASSES = { space: 0.008, spaceBoundary: 0.007, time: 0.01, diag: 0.009 };
const DEM_BANKS = [[3, 3, 'Z'], [5, 3, 'Z'], [5, 5, 'Z'], [7, 3, 'Z'], [3, 3, 'X'], [5, 3, 'X']];
const ciOf = (k, n) => ({ k, n, ...band(k / n, n) });

function demBank(d, r, basis) {
  const g = buildGraph(d, r, { diagonal: true });
  const s = BASIS_GATE[basis];
  const classes = Object.fromEntries(Object.entries(DEM_CLASSES).map(([c, v]) => [c, round6(v * s)]));
  const rateOf = (e) => (e.v === g.boundary ? classes.spaceBoundary : classes[e.kind]);
  const pij = Array.from({ length: g.nDetectors }, () => new Array(g.nDetectors).fill(0));
  const prodOne = new Array(g.nDetectors).fill(1); // product of (1 - 2p) over incident edges
  for (const e of g.edges) {
    const p = rateOf(e);
    prodOne[e.u] *= 1 - 2 * p;
    if (e.v !== g.boundary) {
      prodOne[e.v] *= 1 - 2 * p;
      pij[e.u][e.v] = p;
      pij[e.v][e.u] = p;
    }
  }
  const prefix = basis === 'X' ? 'repx' : 'rep';
  return {
    d, r, basis,
    files: [`${prefix}_d${d}_r${r}_L0.json`, `${prefix}_d${d}_r${r}_L1.json`],
    nShots: N_V2,
    firing: prodOne.map((v) => round6(0.5 * (1 - v))),
    pij,
    classes,
    antiDiag: 0.0002,
    pGateNaive: round6(0.012 * s),
  };
}
const demBanks = DEM_BANKS.map(([d, r, basis]) => demBank(d, r, basis));
const meanFiring = (b) => b.firing.reduce((a, v) => a + v, 0) / b.firing.length;
const ratioXoverZ = demBanks.filter((b) => b.basis === 'X').map((bx) => {
  const bz = demBanks.find((b) => b.basis === 'Z' && b.d === bx.d && b.r === bx.r);
  const ratio = round6(meanFiring(bx) / meanFiring(bz));
  return { d: bx.d, r: bx.r, ratio, lo: round6(ratio * 0.95), hi: round6(ratio * 1.05) };
});
const outOfSample = [];
for (const b of demBanks) {
  for (const [trainedOn, testedOn] of [['L0', 'L1'], ['L1', 'L0']]) {
    const n = N_V2 / 2;
    const kNaive = Math.round(n * pLogical(0.02, b.d) * BASIS_GATE[b.basis]);
    outOfSample.push({
      d: b.d, r: b.r, basis: b.basis, trainedOn, testedOn,
      naive: ciOf(kNaive, n), learned: ciOf(Math.round(kNaive * 0.8), n),
    });
  }
}
const decoderComparison = [];
for (const basis of ['Z', 'X']) {
  for (const [arm, xs, eA] of [
    ['flat', [1e-9, 0.02], (e) => e],
    ['trapped-ion', [3, 20, 100], eAIon],
    ['superconducting', [0.5, 0.7, 1.0], eASc],
  ]) {
    for (const x of xs) {
      for (const d of DISTANCES) {
        for (const [mode, f] of [['hard', 1], ['soft', arm === 'flat' ? 1 : 0.7]]) {
          const pN = round6(Math.min(0.5, f * BASIS_GATE[basis] * pLogical(eA(x), d)));
          const pLd = round6(pN * 0.8);
          decoderComparison.push({
            arm, x, d, r: 3, basis, mode,
            naive: { pL: pN, ...band(pN, N_V2) }, learned: { pL: pLd, ...band(pLd, N_V2) },
          });
        }
      }
    }
  }
}
const demForte1V2 = {
  schema: 's2s-results/1',
  fixture: true,
  stage: 'dem',
  banks: demBanks,
  ratioXoverZ,
  outOfSample,
  decoderComparison,
  params: { classes: DEM_CLASSES, xBasisScale: BASIS_GATE.X, flatEpsilon: 0.02, mode: 'hard' },
  provenance: { ...PROVENANCE_V2 },
};

// Stage 4 v2: v1 platform summaries plus tradeoff and budgetAtOptimum, framing, sensitivity
// effects and conclusions C1-C6, O4 (U4). Built from the Z-basis v2 stages, learned decoder.
const perRoundOf = (pL, r) => 0.5 * (1 - (1 - 2 * Math.min(pL, 0.5)) ** (1 / r));
function platformSummaryV2(st, platform) {
  const learned = { ...st, series: st.series.filter((s) => s.decoder === 'learned'),
    optima: { ...st.optima, tauLog: st.optima.tauLog.filter((o) => o.decoder === 'learned') } };
  const base = platformSummary(learned, cycleUs(platform, st.optima.tauPhys.xMin, 3));
  const xs = st.x.values;
  const tradeoff = {};
  for (const d of DISTANCES) {
    tradeoff[d] = {};
    for (const mode of ['hard', 'soft']) {
      const s = learned.series.find((v) => v.d === d && v.mode === mode);
      tradeoff[d][mode] = {
        tau: xs,
        roundsPerSecond: xs.map((t) => round6(1e6 / cycleUs(platform, t, d))),
        perRound: s.pL.map((p) => round6(perRoundOf(p, s.r))),
        lo: s.lo.map((p) => round6(perRoundOf(p, s.r))),
        hi: s.hi.map((p) => round6(perRoundOf(p, s.r))),
      };
    }
  }
  const opt = learned.optima.tauLog.find((o) => o.d === 3 && o.mode === 'hard');
  const i = xs.indexOf(opt.xMin);
  const b = st.budget;
  return {
    ...base,
    breakEven: { ...base.breakEven, byMode: { hard: { ...base.breakEven }, soft: { epsBar: null, tau_us: null } } },
    tradeoff,
    budgetAtOptimum: { readout: b.readout[i], idle: b.idle[i], crosstalk: b.crosstalk[i], gate: b.gate, tau_us: opt.xMin },
  };
}
const effectOf = (k) => ({
  perRound_d3_hard: { 'trapped-ion': round6(1e-4 * (k - 2)), superconducting: round6(-2e-4 * (k - 1.5)) },
  tauLog_d3_hard: { 'trapped-ion': 5 * (k - 2), superconducting: round6(0.05 * (k - 1.5)) },
});
const sensitivityV2 = sensitivity.map((row, k) => ({ ...row, effect: effectOf(k) }));
const conclusion = (statement, verdict) => ({
  statement, verdict, automated: verdict, note: 'synthetic placeholder verdict', plain: 'fixture',
});
const stage4V2 = {
  schema: 's2s-results/1',
  fixture: true,
  stage: 4,
  basis: 'Z',
  framing: 'Two readout physics models at fixed gate noise (synthetic placeholder framing).',
  platforms: {
    'trapped-ion': platformSummaryV2(stage2V2Z, 'trapped-ion'),
    superconducting: platformSummaryV2(stage3V2Z, 'superconducting'),
  },
  sensitivity: sensitivityV2,
  sensitivityBaseline: {
    note: 'scale 1 (card values); synthetic placeholder', C1: 'holds', C2: 'holds', C3: 'holds', C4: 'undetermined', effect: effectOf(2),
  },
  conclusions: {
    C1: conclusion('placeholder statement C1', 'held'),
    C2: conclusion('placeholder statement C2', 'refuted'),
    C3: conclusion('placeholder statement C3', 'undetermined'),
    C4: conclusion('placeholder statement C4', 'held'),
    C5: conclusion('placeholder statement C5', 'held'),
    C6: conclusion('placeholder statement C6', 'undetermined'),
    O4: conclusion('placeholder observation O4', 'undetermined'),
  },
  provenance: { ...PROVENANCE_V2 },
};

// ---- Write.

const files = {
  'stage1_flat.json': stage1,
  'stage2_ion.json': stage2,
  'stage3_sc.json': stage3,
  'stage4_comparison.json': stage4,
  'rep_d3_r1_L0.json': bankD3R1,
  'rep_d3_r3_L0.json': bankD3R3,
  'params_ion.json': paramsIon,
  'params_sc.json': paramsSc,
  'params_cycle.json': paramsCycle,
  'dem_forte1_v2.json': demForte1V2,
  'stage1_flat_v2.json': stage1V2Z,
  'stage2_ion_v2.json': stage2V2Z,
  'stage3_sc_v2.json': stage3V2Z,
  'stage1_flat_x_v2.json': stage1V2X,
  'stage2_ion_x_v2.json': stage2V2X,
  'stage3_sc_x_v2.json': stage3V2X,
  'stage4_comparison_v2.json': stage4V2,
  'params_ion_v2.json': paramsIonV2,
  'params_sc_v2.json': paramsScV2,
  'params_cycle_v2.json': paramsCycleV2,
};
mkdirSync(OUT, { recursive: true });
for (const [name, obj] of Object.entries(files)) {
  writeFileSync(join(OUT, name), `${JSON.stringify(obj, null, 2)}\n`);
  const extra = obj.schema === 's2s-bank/1'
    ? ` shots=${obj.shots} keys=${obj.checksum.n_keys} detector_rate=${obj.detector_rate}`
    : '';
  console.log(`wrote data/fixtures/${name}${extra}`);
}
