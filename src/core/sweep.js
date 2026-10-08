// Sweep engine: decode one quantum shot through a readout model, run a whole bank at one
// readout setting, and the V9 fingerprint shared by Node and the browser.
//
// Per shot: split the bits, add idle errors with p = readout.idleFlipProbability() to the
// true bits, measure every ancilla and data bit with the readout model, compute detectors,
// weight the edges (gate noise, idle noise, readout noise) and decode with exact matching.

import { createRng } from './rng.js';
import { expandShots, split } from './bank.js';
import { computeDetectors } from './detectors.js';
import { buildGraph, weightFromP, pFromLlr, xorP } from './graph.js';
import { decode } from './matching.js';
import { correctedLogical, isLogicalError } from './logical.js';
import { injectIdle } from './idle.js';
import { estimatePGate } from './calibrate.js';
import { wilson } from './stats.js';
import { createFlatReadout } from './readout/flat.js';

const graphs = new Map();
function graphFor(d, r) {
  const key = `${d},${r}`;
  if (!graphs.has(key)) graphs.set(key, buildGraph(d, r));
  return graphs.get(key);
}

// Edge weights indexed by edge id. Space-like edges: layer 0 gate noise only; layers
// 1..r-1 gate xor idle; layer r gate xor readout of data qubit i. Time-like edge of
// m[k][j]: gate xor readout of that ancilla, because gate errors on the ancilla also
// light vertical pairs (calibrate.js counts time-like edges as gate-noise edges too).
// Hard mode uses the model's average assignment error, soft mode the error probability
// implied by each measurement's llr. Exported for tests only; not part of the Module API.
export function edgeWeights(graph, { mode, pGate, pIdle, readout, llrAnc, llrData }) {
  const { r } = graph;
  const soft = mode === 'soft';
  const pAvg = soft ? 0 : readout.averageAssignmentError();
  const w = new Float64Array(graph.edges.length);
  for (const e of graph.edges) {
    let p;
    if (e.kind === 'space') {
      if (e.layer === 0) p = pGate;
      else if (e.layer < r) p = xorP(pGate, pIdle);
      else p = xorP(pGate, soft ? pFromLlr(llrData[e.dataQubit]) : pAvg);
    } else {
      p = xorP(pGate, soft ? pFromLlr(llrAnc[e.round][e.check]) : pAvg);
    }
    w[e.id] = weightFromP(p);
  }
  return w;
}

// `logical` (the prepared logical state, default 0) is needed for logicalError and is not
// in the Module API signature; runPoint and diagnostic pass bank.logical.
export function decodeShot({ shotBits, layout, d, r, readout, mode, pGate, rng, logical = 0 }) {
  if (mode !== 'hard' && mode !== 'soft') throw new Error(`decodeShot: mode must be "hard" or "soft", got ${mode}`);
  if (!(pGate >= 0 && pGate <= 0.5)) throw new Error(`decodeShot: pGate must be in [0, 0.5], got ${pGate}`);
  const { m: mBank, x: xBank } = split(shotBits, layout, d, r);

  // Idle errors during ancilla readout act on the true values before the later ancillas and
  // the data are read, so each readout sees the flipped bit (with an asymmetric readout a
  // flipped dark ion reads with the bright statistics). The idle draws come first and are
  // made even when pIdle = 0, so the readout draws line up across readout models.
  const pIdle = readout.idleFlipProbability();
  const { m, x } = injectIdle(mBank, xBank, d, r, pIdle, rng);

  // Readout of every ancilla (round order) and then every data bit.
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
  const weights = edgeWeights(graph, { mode, pGate, pIdle, readout, llrAnc, llrData });
  const { flip, nDefects, exact, paths } = decode(graph, weights, detectors);
  const corrected = correctedLogical(hardData[0], flip);
  return {
    logicalError: isLogicalError(corrected, logical) ? 1 : 0,
    corrected, flip, nDefects, exact, detectors, paths,
    hardAnc, hardData, llrAnc, llrData,
  };
}

// Decodes the first n shots of the bank (keys in ascending order) with one rng; returns
// the per-shot logical-error flags and the number of non-exact matchings.
function decodeBank({ bank, readout, mode, pGate, seed, maxShots }) {
  const rng = createRng(seed);
  const shots = expandShots(bank);
  const n = maxShots === undefined ? shots.length : Math.min(maxShots, shots.length);
  const flags = new Uint8Array(n);
  let nonExact = 0;
  for (let s = 0; s < n; s++) {
    const res = decodeShot({
      shotBits: shots[s], layout: bank.layout, d: bank.d, r: bank.r,
      readout, mode, pGate, rng, logical: bank.logical,
    });
    flags[s] = res.logicalError;
    if (!res.exact) nonExact++;
  }
  return { flags, nonExact };
}

export function runPoint({ bank, readout, mode, pGate, seed, maxShots }) {
  const { flags, nonExact } = decodeBank({ bank, readout, mode, pGate, seed, maxShots });
  let k = 0;
  for (const f of flags) k += f;
  const n = flags.length;
  return { k, n, wilson: wilson(k, n), nonExact };
}

// FNV-1a, 32 bit, over the UTF-16 code units of an ASCII string.
function fnv1a32(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// V9 fingerprint: hash of the logical-error flags of the first 1000 shots, flat readout
// epsilon = 0.02, hard mode, seed 7, pGate calibrated on the whole bank with readout off.
export function diagnostic(bank) {
  const detectorArrays = expandShots(bank).map((bits) => {
    const { m, x } = split(bits, bank.layout, bank.d, bank.r);
    return computeDetectors(m, x, bank.d, bank.r);
  });
  const { p: pGate } = estimatePGate(detectorArrays, bank.d, bank.r);
  const { flags } = decodeBank({
    bank, readout: createFlatReadout({ epsilon: 0.02 }), mode: 'hard', pGate, seed: 7, maxShots: 1000,
  });
  return fnv1a32(JSON.stringify(Array.from(flags)));
}
