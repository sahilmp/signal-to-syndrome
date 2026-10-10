import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pairRate, estimateEdgeRates, ratesFromBanks } from '../src/core/dem.js';
import { createRng } from '../src/core/rng.js';
import { expandShots, split } from '../src/core/bank.js';
import { computeDetectors } from '../src/core/detectors.js';

// Edge incidence built here, independently of dem.js: [{ cls, dets: [a] or [a, b] }].
// space: data qubit i = 1..d-2 joins (k, i-1)-(k, i); spaceBoundary: data qubits 0 and d-1
// join (k, 0) and (k, d-2) to the boundary; time: (k, j)-(k+1, j); diag: (k, j+1)-(k+1, j).
function incidence(d, r) {
  const w = d - 1;
  const idx = (k, j) => k * w + j;
  const edges = [];
  for (let k = 0; k <= r; k++) {
    for (let i = 1; i <= d - 2; i++) edges.push({ cls: 'space', dets: [idx(k, i - 1), idx(k, i)] });
    edges.push({ cls: 'spaceBoundary', dets: [idx(k, 0)] });
    edges.push({ cls: 'spaceBoundary', dets: [idx(k, d - 2)] });
  }
  for (let k = 0; k < r; k++) {
    for (let j = 0; j <= d - 2; j++) edges.push({ cls: 'time', dets: [idx(k, j), idx(k + 1, j)] });
    for (let j = 0; j <= d - 3; j++) edges.push({ cls: 'diag', dets: [idx(k, j + 1), idx(k + 1, j)] });
  }
  return edges;
}

// Detectors = XOR of the incident edges, each flipped independently with its class rate.
function synth(d, r, rates, nShots, rng) {
  const edges = incidence(d, r);
  const nDet = (d - 1) * (r + 1);
  const out = [];
  for (let s = 0; s < nShots; s++) {
    const D = new Uint8Array(nDet);
    for (const e of edges) {
      if (rng.uniform() < rates[e.cls]) for (const a of e.dets) D[a] ^= 1;
    }
    out.push(D);
  }
  return out;
}

const se = (p, N) => Math.sqrt(p / N); // SE of a pair rate (prompt CC-A10)
const RATES = { space: 0.008, spaceBoundary: 0.006, time: 0.010, diag: 0.009 };
const D5 = 5;
const R5 = 5;
const N = 60000;
const v12a = estimateEdgeRates(synth(D5, R5, RATES, N, createRng(1210)), D5, R5);

// V12a. Catches: fails if a class is assigned the wrong detector pairs (e.g. diag taken as
// (k, j)-(k+1, j+1), or time pairs crossing two layers), if the pair-rate formula is wrong,
// or if the boundary solve uses the wrong incident edges (a missing or extra edge of rate
// ~0.009 moves spaceBoundary by ~0.009, about 28 SE). Tolerance: 4 SE with SE = sqrt(p / N),
// N = 60000 shots, p the true class rate; spaceBoundary 6 SE (solved from single-detector
// firing rates and the other class estimates).
test('V12a: synthetic per-class rates are recovered (d = 5, r = 5, N = 60000)', () => {
  for (const c of ['space', 'time', 'diag']) {
    const tol = 4 * se(RATES[c], N);
    assert.ok(Math.abs(v12a.classes[c] - RATES[c]) < tol, `${c} = ${v12a.classes[c]}, expected ${RATES[c]} +/- ${tol}`);
  }
  const tolB = 6 * se(RATES.spaceBoundary, N);
  assert.ok(Math.abs(v12a.classes.spaceBoundary - RATES.spaceBoundary) < tolB,
    `spaceBoundary = ${v12a.classes.spaceBoundary}, expected ${RATES.spaceBoundary} +/- ${tolB}`);
  assert.equal(v12a.nShots, N);
  assert.deepEqual(v12a.counts, {
    space: (D5 - 2) * (R5 + 1), spaceBoundary: 2 * (R5 + 1), time: (D5 - 1) * R5, diag: (D5 - 2) * R5,
  });
});

// Catches: fails if the anti-diagonal control (k, j)-(k+1, j+1), which shares no edge, is
// read from the diagonal pairs instead (it would be ~0.009). For a true rate of 0 the formula
// sqrt(p / N) gives 0, so p is taken as the product of the mean bulk firing rates (the joint
// rate of two independent detectors): tolerance 4 SE with SE = sqrt(fbar^2 / N).
test('V12a: the anti-diagonal control is near 0', () => {
  const fbar = v12a.firing.reduce((a, b) => a + b, 0) / v12a.firing.length;
  const tol = 4 * se(fbar * fbar, N);
  assert.ok(Math.abs(v12a.antiDiag) < tol, `antiDiag = ${v12a.antiDiag}, expected 0 +/- ${tol}`);
});

// Non-vacuous control. Catches: fails if the diag estimate does not follow the diagonal
// edges (e.g. picks up time or space correlations, which stay on here): with diag = 0 it must
// be within 4 SE of 0 (SE = sqrt(fbar^2 / N), as for antiDiag), and with diag = 0.02 above
// 0.015 (0.02 is ~7 SE above 0.015 with SE = sqrt(0.02 / N)).
test('diag control: diag = 0 gives ~0, diag = 0.02 gives > 0.015', () => {
  const off = estimateEdgeRates(synth(D5, R5, { ...RATES, diag: 0 }, N, createRng(1211)), D5, R5);
  const fbar = off.firing.reduce((a, b) => a + b, 0) / off.firing.length;
  const tol = 4 * se(fbar * fbar, N);
  assert.ok(Math.abs(off.classes.diag) < tol, `diag = ${off.classes.diag}, expected 0 +/- ${tol}`);
  const on = estimateEdgeRates(synth(D5, R5, { ...RATES, diag: 0.02 }, N, createRng(1212)), D5, R5);
  assert.ok(on.classes.diag > 0.015, `diag = ${on.classes.diag}, expected > 0.015`);
});

// Catches: fails if pairRate does not return 0 for independent detectors (xij = xi xj), or
// if it returns a non-zero rate from the firing rates alone.
test('pairRate: independent detectors give 0', () => {
  for (const [xi, xj] of [[0.05, 0.05], [0.1, 0.03], [0.2, 0.4]]) {
    assert.ok(Math.abs(pairRate(xi, xj, xi * xj)) < 1e-15, `pairRate(${xi}, ${xj}) = ${pairRate(xi, xj, xi * xj)}`);
  }
});

// Catches: fails if a negative radicand is not clamped (Math.sqrt gives NaN) or the result is
// not kept below 0.5. The radicand equals (1 - 2xi)(1 - 2xj) / (1 - 2xi - 2xj + 4xij), so
// xi = 0.6, xj = xij = 0.2 gives (-0.2)(0.6) / 0.2 = -0.6 < 0; an exact shared edge p = 0.1
// (xi = xj = xij = 0.1) gives exactly 0.1, not 0.5.
test('pairRate: radicand clamp returns 0.5 - epsilon, never NaN', () => {
  const p = pairRate(0.6, 0.2, 0.2);
  assert.ok(!Number.isNaN(p));
  assert.ok(p < 0.5 && p > 0.5 - 1e-9, `p = ${p}`);
  assert.ok(Math.abs(pairRate(0.1, 0.1, 0.1) - 0.1) < 1e-12);
  const sat = pairRate(0.5, 0.5, 0.25); // denominator 0
  assert.ok(!Number.isNaN(sat) && sat < 0.5);
});

// Catches: fails if pij is filled for one triangle only, or the diagonal holds a pair rate
// (or 0) instead of the detector's firing rate.
test('pij is symmetric with firing rates on the diagonal', () => {
  const n = (D5 - 1) * (R5 + 1);
  assert.equal(v12a.pij.length, n * n);
  for (let i = 0; i < n; i++) {
    assert.equal(v12a.pij[i * n + i], v12a.firing[i]);
    for (let j = i + 1; j < n; j++) assert.equal(v12a.pij[i * n + j], v12a.pij[j * n + i]);
  }
  assert.ok(v12a.firing.every((f) => f > 0.02 && f < 0.1));
});

// Catches: fails if ratesFromBanks does not pool the shots of all banks through expandShots,
// split and computeDetectors (it must equal estimateEdgeRates on the concatenated detectors),
// or accepts banks with a different d, r or basis.
test('ratesFromBanks pools banks of equal d, r, basis and rejects mixed banks', () => {
  const load = (name) => JSON.parse(readFileSync(new URL(`../data/banks/${name}.json`, import.meta.url), 'utf8'));
  const b0 = load('rep_d3_r3_L0');
  const b1 = load('rep_d3_r3_L1');
  const dets = [b0, b1].flatMap((b) => expandShots(b).map((bits) => {
    const { m, x } = split(bits, b.layout, b.d, b.r);
    return computeDetectors(m, x, b.d, b.r);
  }));
  const pooled = ratesFromBanks([b0, b1]);
  assert.equal(pooled.nShots, b0.shots + b1.shots);
  assert.deepEqual(pooled.classes, estimateEdgeRates(dets, 3, 3).classes);
  assert.throws(() => ratesFromBanks([b0, load('rep_d5_r3_L0')]), /differ/);
  assert.throws(() => ratesFromBanks([b0, { ...b1, basis: 'X' }]), /differ/);
});
