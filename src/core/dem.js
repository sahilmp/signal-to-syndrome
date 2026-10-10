// Learned detector error model: per-class edge rates from detector correlations.
//
// Edge classes (CLAUDE.md, "Decoding graph"), for detector (k, j) with index k*(d-1) + j,
// layers k = 0..r and checks j = 0..d-2:
//   space:         (k, j)-(k, j+1), a flip of data qubit j+1 in layer k (layers 0..r);
//   spaceBoundary: data qubit 0 joins (k, 0) to the boundary, data qubit d-1 joins (k, d-2);
//   time:          (k, j)-(k+1, j) for k = 0..r-1;
//   diag:          (k, j+1)-(k+1, j) for k = 0..r-1, j = 0..d-3.
// Two detectors that share exactly one independent edge with flip probability p, and are
// otherwise driven by independent edges, satisfy pairRate(xi, xj, xij) = p. Boundary edges
// touch one detector only, so their rate is solved from single-detector firing rates.
// graph.js is not imported: the incident edges are enumerated here.

import { expandShots, split } from './bank.js';
import { computeDetectors } from './detectors.js';

const P_MIN = 1e-5;
const P_MAX = 0.5 - 1e-12; // upper end of [., 0.5)

function clampClass(p) {
  return Math.min(Math.max(p, P_MIN), P_MAX);
}

// p = 1/2 - 1/2 sqrt(1 - 4 (xij - xi xj) / (1 - 2 xi - 2 xj + 4 xij)), radicand clamped at 0,
// result clamped to [0, 0.5). A non-positive denominator (saturated detectors) carries no
// information about the shared edge and returns the upper end, like a clamped radicand.
export function pairRate(xi, xj, xij) {
  const den = 1 - 2 * xi - 2 * xj + 4 * xij;
  if (!(den > 0)) return P_MAX;
  const rad = Math.max(0, 1 - (4 * (xij - xi * xj)) / den);
  const p = 0.5 - 0.5 * Math.sqrt(rad);
  return Math.min(Math.max(p, 0), P_MAX);
}

// Detector pairs of each correlation class: [[a, b], ...] with a, b detector indices.
function classPairs(d, r) {
  const w = d - 1;
  const idx = (k, j) => k * w + j;
  const space = [];
  const time = [];
  const diag = [];
  const antiDiag = [];
  for (let k = 0; k <= r; k++) {
    for (let j = 0; j + 1 <= d - 2; j++) space.push([idx(k, j), idx(k, j + 1)]);
  }
  for (let k = 0; k < r; k++) {
    for (let j = 0; j <= d - 2; j++) time.push([idx(k, j), idx(k + 1, j)]);
    for (let j = 0; j <= d - 3; j++) {
      diag.push([idx(k, j + 1), idx(k + 1, j)]);
      antiDiag.push([idx(k, j), idx(k + 1, j + 1)]);
    }
  }
  return { space, time, diag, antiDiag };
}

// Classes of the non-boundary edges incident to detector (k, j), one entry per edge.
function otherIncidentClasses(d, r, k, j) {
  const out = [];
  if (j >= 1) out.push('space'); // data qubit j joins (k, j-1)-(k, j)
  if (j + 1 <= d - 2) out.push('space'); // data qubit j+1 joins (k, j)-(k, j+1)
  if (k >= 1) out.push('time');
  if (k <= r - 1) out.push('time');
  if (k <= r - 1 && j >= 1) out.push('diag'); // (k, j)-(k+1, j-1)
  if (k >= 1 && j + 1 <= d - 2) out.push('diag'); // (k-1, j+1)-(k, j)
  return out;
}

function meanPairRate(pairs, pij, nDet) {
  if (pairs.length === 0) return 0;
  let s = 0;
  for (const [a, b] of pairs) s += pij[a * nDet + b];
  return s / pairs.length;
}

// detectorArrays: one Uint8Array((d-1)*(r+1)) per shot, from computeDetectors.
export function estimateEdgeRates(detectorArrays, d, r) {
  if (!Number.isInteger(d) || d < 3) throw new Error(`estimateEdgeRates: d must be an integer >= 3, got ${d}`);
  if (!Number.isInteger(r) || r < 1) throw new Error(`estimateEdgeRates: r must be an integer >= 1, got ${r}`);
  const nShots = detectorArrays.length;
  if (nShots === 0) throw new Error('estimateEdgeRates: no shots');
  const w = d - 1;
  const nDet = w * (r + 1);

  // Single and joint firing counts; joint counts only over the detectors that fired.
  const single = new Float64Array(nDet);
  const joint = new Float64Array(nDet * nDet);
  const fired = new Int32Array(nDet);
  for (let s = 0; s < nShots; s++) {
    const D = detectorArrays[s];
    if (D.length !== nDet) throw new Error(`estimateEdgeRates: shot ${s} has ${D.length} detectors, expected ${nDet}`);
    let nf = 0;
    for (let i = 0; i < nDet; i++) if (D[i]) fired[nf++] = i;
    for (let a = 0; a < nf; a++) {
      const ia = fired[a];
      single[ia]++;
      for (let b = a + 1; b < nf; b++) joint[ia * nDet + fired[b]]++;
    }
  }

  const firing = new Float64Array(nDet);
  for (let i = 0; i < nDet; i++) firing[i] = single[i] / nShots;
  const pij = new Float64Array(nDet * nDet);
  for (let i = 0; i < nDet; i++) {
    pij[i * nDet + i] = firing[i];
    for (let j = i + 1; j < nDet; j++) {
      const p = pairRate(firing[i], firing[j], joint[i * nDet + j] / nShots);
      pij[i * nDet + j] = p;
      pij[j * nDet + i] = p;
    }
  }

  const pairs = classPairs(d, r);
  const classes = {
    space: clampClass(meanPairRate(pairs.space, pij, nDet)),
    spaceBoundary: 0,
    time: clampClass(meanPairRate(pairs.time, pij, nDet)),
    diag: clampClass(meanPairRate(pairs.diag, pij, nDet)),
  };

  // Boundary ends: data qubit 0 at (k, 0) and data qubit d-1 at (k, d-2), each solved alone:
  // 1 - 2f = (1 - 2 pb) * prod over the other incident edges of (1 - 2 p_class).
  let sumPb = 0;
  let nEnds = 0;
  for (let k = 0; k <= r; k++) {
    for (const j of [0, d - 2]) {
      let prod = 1;
      for (const c of otherIncidentClasses(d, r, k, j)) prod *= 1 - 2 * classes[c];
      const f = firing[k * w + j];
      sumPb += clampClass((1 - (1 - 2 * f) / prod) / 2);
      nEnds++;
    }
  }
  classes.spaceBoundary = clampClass(sumPb / nEnds);

  return {
    classes,
    counts: {
      space: pairs.space.length,
      spaceBoundary: nEnds,
      time: pairs.time.length,
      diag: pairs.diag.length,
    },
    pij,
    firing,
    antiDiag: meanPairRate(pairs.antiDiag, pij, nDet),
    nShots,
  };
}

// Pools the detectors of banks with the same d, r and basis (absent basis means "Z").
export function ratesFromBanks(banks) {
  if (!Array.isArray(banks) || banks.length === 0) throw new Error('ratesFromBanks: no banks');
  const { d, r } = banks[0];
  const basis = banks[0].basis ?? 'Z';
  const detectorArrays = [];
  for (const bank of banks) {
    const b = bank.basis ?? 'Z';
    if (bank.d !== d || bank.r !== r || b !== basis) {
      throw new Error(`ratesFromBanks: banks differ (d=${bank.d}, r=${bank.r}, basis=${b} against d=${d}, r=${r}, basis=${basis})`);
    }
    for (const bits of expandShots(bank)) {
      const { m, x } = split(bits, bank.layout, d, r);
      detectorArrays.push(computeDetectors(m, x, d, r));
    }
  }
  return estimateEdgeRates(detectorArrays, d, r);
}
