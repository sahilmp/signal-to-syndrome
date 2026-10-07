import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph } from '../src/core/graph.js';
import { decode } from '../src/core/matching.js';
import { correctedLogical, isLogicalError } from '../src/core/logical.js';
import { createRng } from '../src/core/rng.js';

const node = (d, k, j) => k * (d - 1) + j;

function uniformWeights(g, w = 1) {
  return new Float64Array(g.edges.length).fill(w);
}

function bitsWith(g, lit) {
  const D = new Uint8Array(g.nDetectors);
  for (const i of lit) D[i] ^= 1;
  return D;
}

function spaceEdge(g, k, i) {
  return g.edges.find((e) => e.kind === 'space' && e.layer === k && e.dataQubit === i);
}

// Detector bits and observable parity produced by flipping a set of edges (each edge
// toggles its two endpoints; the boundary node is not a detector).
function syndromeOf(g, edgeIds) {
  const D = new Uint8Array(g.nDetectors);
  let obs = 0;
  for (const id of edgeIds) {
    const e = g.edges[id];
    if (e.u !== g.boundary) D[e.u] ^= 1;
    if (e.v !== g.boundary) D[e.v] ^= 1;
    if (e.observable) obs ^= 1;
  }
  return { D, obs };
}

// The decoder's paths must explain exactly the lit detectors, and flip and cost must be
// the XOR of observable edges and the sum of weights along them.
function assertPathsConsistent(g, w, D, res) {
  const all = res.paths.flatMap((p) => p.edges);
  const { D: D2, obs } = syndromeOf(g, all);
  assert.deepEqual([...D2], [...D], 'paths do not reproduce the detector bits');
  assert.equal(res.flip, obs, 'flip is not the observable parity of the paths');
  const sum = all.reduce((s, id) => s + w[id], 0);
  assert.ok(Math.abs(sum - res.cost) <= 1e-9 * Math.max(1, res.cost), `cost ${res.cost} vs path sum ${sum}`);
  const ends = res.paths.flatMap((p) => (p.b === 'B' ? [p.a] : [p.a, p.b])).sort((x, y) => x - y);
  const lit = [];
  D.forEach((v, i) => { if (v) lit.push(i); });
  assert.deepEqual(ends, lit, 'every lit detector must appear in exactly one pairing');
}

// Catches: fails if an empty syndrome produces a spurious flip, a non-zero cost or paths.
test('no defects: flip 0, cost 0, no paths', () => {
  const g = buildGraph(5, 3);
  const res = decode(g, uniformWeights(g), new Uint8Array(g.nDetectors));
  assert.deepEqual(res, { flip: 0, nDefects: 0, exact: true, cost: 0, paths: [] });
});

// Catches: fails if the observable parity is attached to the wrong boundary edge, or a
// lone defect next to qubit 0 is sent the long way round. Boundary pair: (k,0) gives
// flip 1 and (k,d-2) gives flip 0.
test('lone defect at (k,0) gives flip 1; at (k,d-2) gives flip 0', () => {
  for (const d of [3, 5, 7]) {
    const r = 3;
    const g = buildGraph(d, r);
    const w = uniformWeights(g);
    for (let k = 0; k <= r; k++) {
      const left = decode(g, w, bitsWith(g, [node(d, k, 0)]));
      assert.equal(left.flip, 1, `d=${d} k=${k} left`);
      assert.equal(left.cost, 1);
      const right = decode(g, w, bitsWith(g, [node(d, k, d - 2)]));
      assert.equal(right.flip, 0, `d=${d} k=${k} right`);
      assert.equal(right.cost, 1);
    }
  }
});

// Catches: fails if two adjacent interior defects are sent to the boundaries instead of
// being paired through the data qubit between them.
test('interior horizontal pair gives flip 0 with cost one space weight', () => {
  const d = 5;
  const g = buildGraph(d, 3);
  const res = decode(g, uniformWeights(g), bitsWith(g, [node(d, 1, 1), node(d, 1, 2)]));
  assert.equal(res.flip, 0);
  assert.equal(res.cost, 1);
  assert.equal(res.paths.length, 1);
});

// Catches: fails if time-like edges are missing or carry the wrong weight, so a single
// wrong measurement is not paired across rounds.
test('vertical pair gives flip 0 with cost equal to one time-like weight', () => {
  const d = 5;
  const g = buildGraph(d, 3);
  for (const tw of [1, 1.7]) {
    const w = new Float64Array(g.edges.map((e) => (e.kind === 'time' ? tw : 1)));
    for (let j = 0; j < d - 1; j++) {
      const res = decode(g, w, bitsWith(g, [node(d, 1, j), node(d, 2, j)]));
      assert.equal(res.flip, 0, `j=${j} tw=${tw}`);
      assert.equal(res.cost, tw, `j=${j} tw=${tw}`);
    }
  }
});

// Catches: fails if Infinity edges are treated as usable (or produce NaN costs): with the
// qubit-0 edge removed, a defect at (0,0) must go to the right boundary with flip 0 (cost 2).
// Time edges weigh 5, so the other route (time edge, then the layer-1 qubit-0 edge, cost 6,
// flip 1) is strictly worse and the result does not depend on the tie-break.
test('Infinity edges are unusable', () => {
  const d = 3;
  const g = buildGraph(d, 1);
  const w = new Float64Array(g.edges.map((e) => (e.kind === 'time' ? 5 : 1)));
  w[spaceEdge(g, 0, 0).id] = Infinity;
  const res = decode(g, w, bitsWith(g, [node(d, 0, 0)]));
  assert.equal(res.flip, 0);
  assert.equal(res.cost, 2);
});

// Catches: fails if a defect that no finite route reaches is returned silently with cost
// Infinity and an empty path. Non-vacuous pair: with only the qubit-0 edge cut the defect
// is decoded (previous test); with every edge at (0,0) cut, decode throws.
test('unreachable defect throws', () => {
  const d = 3;
  const g = buildGraph(d, 1);
  const w = uniformWeights(g);
  for (const e of g.edges) if (e.u === node(d, 0, 0) || e.v === node(d, 0, 0)) w[e.id] = Infinity;
  assert.throws(() => decode(g, w, bitsWith(g, [node(d, 0, 0)])), /cannot be matched/);
});

// Catches: fails if the decoder does not pick the minimum-weight correction, or if the
// distance is miscounted. Non-vacuous pair: the same two data flips (qubits 0 and 1 in one
// layer) defeat d = 3 (weight 2 > (d-1)/2) but are corrected at d = 5 (weight 2 <= 2).
test('distance: qubits 0 and 1 flipped fails at d = 3, is corrected at d = 5', () => {
  for (const [d, expectError] of [[3, true], [5, false]]) {
    const r = 2;
    const k = 1;
    const g = buildGraph(d, r);
    const w = uniformWeights(g);
    const err = [spaceEdge(g, k, 0).id, spaceEdge(g, k, 1).id];
    const { D, obs } = syndromeOf(g, err);
    assert.deepEqual([...D].flatMap((v, i) => (v ? [i] : [])), [node(d, k, 1)], 'one defect expected');
    const res = decode(g, w, D);
    const logical = 0;
    const xHat0 = logical ^ obs; // the raw readout of data qubit 0 carries the true flip
    const corrected = correctedLogical(xHat0, res.flip);
    assert.equal(isLogicalError(corrected, logical), expectError, `d=${d}`);
    if (d === 3) assert.deepEqual(res.paths[0].edges, [spaceEdge(g, k, 2).id], 'd=3 resolves through qubit 2');
  }
});

// Floyd-Warshall over all nodes (boundary included), independent of the decoder's Dijkstra.
function allPairs(g, w) {
  const n = g.nDetectors + 1;
  const dist = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity)));
  for (const e of g.edges) {
    if (w[e.id] < dist[e.u][e.v]) {
      dist[e.u][e.v] = w[e.id];
      dist[e.v][e.u] = w[e.id];
    }
  }
  for (let m = 0; m < n; m++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (dist[i][m] + dist[m][j] < dist[i][j]) dist[i][j] = dist[i][m] + dist[m][j];
      }
    }
  }
  return dist;
}

// Enumerates every matching of the list (each item to the boundary or to another item).
function bruteMin(items, dist, B) {
  if (items.length === 0) return 0;
  const [first, ...rest] = items;
  let best = dist[first][B] + bruteMin(rest, dist, B);
  for (let t = 0; t < rest.length; t++) {
    const others = rest.filter((_, s) => s !== t);
    best = Math.min(best, dist[first][rest[t]] + bruteMin(others, dist, B));
  }
  return best;
}

// Catches: fails if the subset dynamic programming misses matchings, reconstructs a
// different matching from the one it costed, or Dijkstra returns non-shortest paths.
// 300 seeded instances, up to 8 defects, random weights in [0.1, 5).
test('exactness: DP cost equals brute force on 300 random instances', () => {
  const rng = createRng(20261010);
  const shapes = [[3, 1], [3, 3], [5, 2], [5, 4], [7, 3]];
  for (let trial = 0; trial < 300; trial++) {
    const [d, r] = shapes[rng.int(shapes.length)];
    const g = buildGraph(d, r);
    const w = new Float64Array(g.edges.length);
    for (let i = 0; i < w.length; i++) w[i] = 0.1 + 4.9 * rng.uniform();
    const nDef = Math.min(rng.int(9), g.nDetectors);
    const pool = Array.from({ length: g.nDetectors }, (_, i) => i);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const lit = pool.slice(0, nDef).sort((a, b) => a - b);
    const D = bitsWith(g, lit);
    const res = decode(g, w, D);
    const brute = bruteMin(lit, allPairs(g, w), g.boundary);
    assert.equal(res.exact, true);
    assert.equal(res.nDefects, nDef);
    assert.ok(Math.abs(res.cost - brute) <= 1e-9 * Math.max(1, brute), `trial ${trial}: dp ${res.cost} vs brute ${brute}`);
    assertPathsConsistent(g, w, D, res);
  }
});

// Catches: fails if the exact path is attempted above 20 defects (2^n blow-up), or the
// greedy fallback leaves a defect unmatched or reports a flip that its paths do not give.
// Boundary pair: 20 defects is exact, 21 is not.
test('more than 20 defects returns exact = false with a valid flip', () => {
  const d = 15;
  const r = 3;
  const g = buildGraph(d, r);
  const rng = createRng(77);
  const w = new Float64Array(g.edges.length);
  for (let i = 0; i < w.length; i++) w[i] = 0.5 + rng.uniform();
  const pick = (n) => {
    const lit = [];
    for (let i = 0; i < g.nDetectors && lit.length < n; i += 2) lit.push(i);
    return bitsWith(g, lit);
  };
  const at20 = decode(g, w, pick(20));
  assert.equal(at20.nDefects, 20);
  assert.equal(at20.exact, true);
  assertPathsConsistent(g, w, pick(20), at20);
  for (const n of [21, 25]) {
    const D = pick(n);
    const res = decode(g, w, D);
    assert.equal(res.nDefects, n);
    assert.equal(res.exact, false);
    assert.ok(res.flip === 0 || res.flip === 1);
    assertPathsConsistent(g, w, D, res);
  }
});

// Catches: fails if paths list the wrong edges (e.g. node ids instead of edge ids, or a
// path through the boundary) or the boundary is not labelled "B".
test('paths: vertical pair uses the one time-like edge; lone (k,0) ends at "B" via the observable edge', () => {
  const d = 5;
  const g = buildGraph(d, 3);
  const w = uniformWeights(g);
  const k = 1;
  const j = 2;
  const vert = decode(g, w, bitsWith(g, [node(d, k, j), node(d, k + 1, j)]));
  const timeEdge = g.edges.find((e) => e.kind === 'time' && e.round === k && e.check === j);
  assert.equal(vert.paths.length, 1);
  assert.deepEqual(vert.paths[0], { a: node(d, k, j), b: node(d, k + 1, j), edges: [timeEdge.id] });

  const lone = decode(g, w, bitsWith(g, [node(d, k, 0)]));
  assert.equal(lone.paths.length, 1);
  assert.equal(lone.paths[0].a, node(d, k, 0));
  assert.equal(lone.paths[0].b, 'B');
  assert.deepEqual(lone.paths[0].edges, [spaceEdge(g, k, 0).id]);
  assert.ok(g.edges[lone.paths[0].edges[0]].observable);
});

// Catches: fails if bad inputs (wrong weight length, negative weights, wrong detector
// length) are decoded silently instead of rejected.
test('decode rejects malformed inputs', () => {
  const g = buildGraph(3, 1);
  const D = new Uint8Array(g.nDetectors);
  assert.throws(() => decode(g, new Float64Array(g.edges.length - 1), D), /weights/);
  const neg = uniformWeights(g);
  neg[0] = -1;
  assert.throws(() => decode(g, neg, D), /non-negative/);
  assert.throws(() => decode(g, uniformWeights(g), new Uint8Array(g.nDetectors + 1)), /detectorBits/);
});
