// STUB for Person A's src/core/sweep.js: same signatures, simplified decoding.
// Every bit goes through readout.measure; no idle errors; uniform edge weights, so
// mode and pGate do not change the result. Replaced through src/ui/bridge_core.js (H5).

import { createRng } from '../../core/rng.js';
import { expandShots, split } from '../../core/bank.js';
import { computeDetectors } from '../../core/detectors.js';
import { buildGraph } from '../../core/graph.js';
import { decode } from '../../core/matching.js';
import { correctedLogical, isLogicalError } from '../../core/logical.js';

const graphs = new Map();
function graphFor(d, r) {
  const key = `${d},${r}`;
  if (!graphs.has(key)) graphs.set(key, buildGraph(d, r));
  return graphs.get(key);
}

// Wilson score interval (local copy; stats.js belongs to Person A).
function wilson(k, n, z = 1.96) {
  if (n === 0) return { p: 0, lo: 0, hi: 1 };
  const p = k / n;
  const z2 = z * z;
  const den = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
  return { p, lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

// `logical` is not in the Module API signature; the stub defaults it to 0 (see report).
export function decodeShot({ shotBits, layout, d, r, readout, mode, pGate, rng, logical = 0 }) {
  void mode;
  void pGate;
  const { m, x } = split(shotBits, layout, d, r);
  const hardAnc = [];
  const llrAnc = [];
  for (let k = 0; k < r; k++) {
    const h = new Uint8Array(d - 1);
    const l = new Float64Array(d - 1);
    for (let j = 0; j < d - 1; j++) {
      const res = readout.measure(m[k][j], rng);
      h[j] = res.hard;
      l[j] = res.llr;
    }
    hardAnc.push(h);
    llrAnc.push(l);
  }
  const hardData = new Uint8Array(d);
  const llrData = new Float64Array(d);
  for (let i = 0; i < d; i++) {
    const res = readout.measure(x[i], rng);
    hardData[i] = res.hard;
    llrData[i] = res.llr;
  }
  const detectors = computeDetectors(hardAnc, hardData, d, r);
  const graph = graphFor(d, r);
  const weights = new Float64Array(graph.edges.length).fill(1);
  const { flip, nDefects, exact, paths } = decode(graph, weights, detectors);
  const corrected = correctedLogical(hardData[0], flip);
  return {
    logicalError: isLogicalError(corrected, logical),
    corrected, flip, nDefects, exact, detectors, paths,
    hardAnc, hardData, llrAnc, llrData,
  };
}

export function runPoint({ bank, readout, mode, pGate, seed, maxShots }) {
  const rng = createRng(seed);
  const shots = expandShots(bank);
  const n = maxShots === undefined ? shots.length : Math.min(maxShots, shots.length);
  let k = 0;
  let nonExact = 0;
  for (let s = 0; s < n; s++) {
    const res = decodeShot({
      shotBits: shots[s], layout: bank.layout, d: bank.d, r: bank.r,
      readout, mode, pGate, rng, logical: bank.logical,
    });
    if (res.logicalError) k++;
    if (!res.exact) nonExact++;
  }
  return { k, n, wilson: wilson(k, n), nonExact };
}

// Fixed marker so that a stub fingerprint can never pass for the real V9 hash.
export function diagnostic(bank) {
  void bank;
  return 'stub0000';
}
