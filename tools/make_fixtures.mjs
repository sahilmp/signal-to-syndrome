// Writes the nine fixture files into data/fixtures/ (every file has "fixture": true).
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
};
mkdirSync(OUT, { recursive: true });
for (const [name, obj] of Object.entries(files)) {
  writeFileSync(join(OUT, name), `${JSON.stringify(obj, null, 2)}\n`);
  const extra = obj.schema === 's2s-bank/1'
    ? ` shots=${obj.shots} keys=${obj.checksum.n_keys} detector_rate=${obj.detector_rate}`
    : '';
  console.log(`wrote data/fixtures/${name}${extra}`);
}
