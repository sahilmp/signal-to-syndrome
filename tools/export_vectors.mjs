// Exports decoder test vectors for the PyMatching cross-check (validation V2).
// Usage: node tools/export_vectors.mjs [--n 20000] [--seed 1] [--diagonal | --no-diagonal]
// --diagonal (the default) draws on the graph with diagonal edges (V2b); --no-diagonal on the
// naive graph (space and time edges only, as in V2).
// For each (d, r): every edge of the decoding graph is drawn independently with
// probability P_EDGE; lit detectors are the detector nodes touched an odd number of
// times; the true flip is the parity of drawn observable edges. Our decoder runs with
// uniform weights weightFromP(P_EDGE). Output: data/vectors/vectors_d<d>_r<r>.json.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRng } from '../src/core/rng.js';
import { buildGraph, weightFromP } from '../src/core/graph.js';
import { decode } from '../src/core/matching.js';

const CONFIGS = [[3, 3], [5, 3], [5, 5], [7, 3]];
const P_EDGE = 0.03;

function parseArgs(argv) {
  const opts = { n: 20000, seed: 1, diagonal: true };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--diagonal' || key === '--no-diagonal') {
      opts.diagonal = key === '--diagonal';
      continue;
    }
    if (key !== '--n' && key !== '--seed') throw new Error(`unknown argument ${key}`);
    const value = Number(argv[++i]);
    if (!Number.isInteger(value)) throw new Error(`${key} needs an integer, got ${argv[i]}`);
    opts[key.slice(2)] = value;
  }
  if (opts.n < 1) throw new Error(`--n must be >= 1, got ${opts.n}`);
  return opts;
}

function exportConfig(d, r, n, seed, diagonal) {
  const graph = buildGraph(d, r, { diagonal });
  const w = weightFromP(P_EDGE);
  const weights = new Float64Array(graph.edges.length).fill(w);
  const rng = createRng(seed);
  const B = graph.boundary;
  const shots = [];
  let nonExact = 0;
  for (let s = 0; s < n; s++) {
    const det = new Uint8Array(graph.nDetectors);
    let trueFlip = 0;
    for (const e of graph.edges) {
      if (rng.uniform() >= P_EDGE) continue;
      if (e.u !== B) det[e.u] ^= 1;
      if (e.v !== B) det[e.v] ^= 1;
      if (e.observable) trueFlip ^= 1;
    }
    const res = decode(graph, weights, det);
    if (!res.exact) nonExact++;
    const lit = [];
    for (let i = 0; i < det.length; i++) if (det[i]) lit.push(i);
    shots.push({ lit, ourFlip: res.flip, ourCost: res.cost, ourExact: res.exact, trueFlip });
  }
  const edges = graph.edges.map((e) => ({
    u: e.u === B ? e.v : e.u,
    v: e.u === B || e.v === B ? -1 : e.v,
    weight: w,
    observable: e.observable,
  }));
  return {
    out: { d, r, diagonal, nDetectors: graph.nDetectors, pEdge: P_EDGE, seed, nShots: n, edges, shots },
    nonExact,
  };
}

const { n, seed, diagonal } = parseArgs(process.argv.slice(2));
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'data', 'vectors');
mkdirSync(outDir, { recursive: true });
CONFIGS.forEach(([d, r], idx) => {
  // A distinct, reproducible seed per configuration.
  const { out, nonExact } = exportConfig(d, r, n, seed + idx, diagonal);
  const file = join(outDir, `vectors_d${d}_r${r}.json`);
  writeFileSync(file, JSON.stringify(out) + '\n');
  const ourErr = out.shots.filter((s) => s.ourFlip !== s.trueFlip).length;
  console.log(`d=${d} r=${r}${diagonal ? ' diagonal' : ''}: ${n} shots, ${out.edges.length} edges, nonExact=${nonExact}, ourFlip != trueFlip in ${ourErr} -> ${file}`);
});
