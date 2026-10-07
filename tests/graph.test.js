import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, weightFromP, weightFromLlr, pFromLlr, xorP } from '../src/core/graph.js';

const node = (d, k, j) => k * (d - 1) + j;

// Catches: fails if a layer or a round is missing or doubled (e.g. space edges only for
// layers 0..r-1, or time edges for r+1 rounds), or the boundary index is not (d-1)*(r+1).
test('node and edge counts for (3,1), (5,3), (7,3)', () => {
  for (const [d, r] of [[3, 1], [5, 3], [7, 3]]) {
    const g = buildGraph(d, r);
    assert.equal(g.d, d);
    assert.equal(g.r, r);
    assert.equal(g.nDetectors, (d - 1) * (r + 1));
    assert.equal(g.boundary, (d - 1) * (r + 1));
    const space = g.edges.filter((e) => e.kind === 'space');
    const time = g.edges.filter((e) => e.kind === 'time');
    assert.equal(space.length, d * (r + 1), `space d=${d} r=${r}`);
    assert.equal(time.length, (d - 1) * r, `time d=${d} r=${r}`);
    assert.equal(g.edges.length, space.length + time.length);
    assert.equal(g.edges.filter((e) => e.observable).length, r + 1);
    g.edges.forEach((e, idx) => assert.equal(e.id, idx, 'edge id must equal its index'));
  }
});

// Catches: fails if the observable is attached to the wrong end of the chain (data qubit d-1)
// or to an interior edge, so the decoder would report the parity of the wrong qubit.
test('observable edges are exactly the data-qubit-0 edges, joining (k,0) to B', () => {
  for (const [d, r] of [[3, 1], [5, 3], [7, 3]]) {
    const g = buildGraph(d, r);
    for (const e of g.edges) {
      const isQ0 = e.kind === 'space' && e.dataQubit === 0;
      assert.equal(e.observable, isQ0, `edge ${e.id}`);
      if (isQ0) {
        assert.deepEqual([e.u, e.v], [node(d, e.layer, 0), g.boundary]);
      }
    }
  }
});

// Catches: fails if space edges join the wrong checks (off by one in i-1 / i), if the
// right end qubit does not go to the boundary, or if time edges skip a layer.
test('edge endpoints follow the conventions', () => {
  const d = 5;
  const r = 3;
  const g = buildGraph(d, r);
  for (const e of g.edges) {
    if (e.kind === 'space') {
      const i = e.dataQubit;
      const k = e.layer;
      if (i === 0) assert.deepEqual([e.u, e.v], [node(d, k, 0), g.boundary]);
      else if (i === d - 1) assert.deepEqual([e.u, e.v], [node(d, k, d - 2), g.boundary]);
      else assert.deepEqual([e.u, e.v], [node(d, k, i - 1), node(d, k, i)]);
    } else {
      assert.deepEqual([e.u, e.v], [node(d, e.round, e.check), node(d, e.round + 1, e.check)]);
    }
  }
});

// Catches: fails if even d or r = 0 is accepted silently. Boundary pair: d = 3 is accepted,
// d = 4 is rejected; r = 1 is accepted, r = 0 is rejected.
test('buildGraph rejects even d and r < 1', () => {
  assert.doesNotThrow(() => buildGraph(3, 1));
  assert.throws(() => buildGraph(4, 1), /odd/);
  assert.throws(() => buildGraph(3, 0), /r must be/);
});

// Catches: fails if p is not clamped at 0.5 (weights would go negative) or at 1e-12
// (p = 0 would give Infinity), or if the lower clamp sits at the wrong value.
// Boundary pairs: p = 0.5 gives 0 and p = 0.4 gives ln 1.5; p = 1e-12 gives the cap
// W_MAX = ln[(1-1e-12)/1e-12] = 27.631, p = 1e-13 (past the clamp) also gives W_MAX, and
// p = 2e-12 (inside it) gives W_MAX - ln 2.
test('weightFromP: formula and clamping', () => {
  const W_MAX = Math.log((1 - 1e-12) / 1e-12);
  assert.ok(Math.abs(W_MAX - 27.631021115871) < 1e-9);
  assert.equal(weightFromP(0.5), 0);
  assert.ok(Math.abs(weightFromP(0.4) - Math.log(1.5)) < 1e-15);
  assert.equal(weightFromP(0.7), 0);
  assert.ok(Math.abs(weightFromP(1e-12) - W_MAX) < 1e-12);
  assert.ok(Math.abs(weightFromP(1e-13) - W_MAX) < 1e-12);
  assert.ok(Math.abs(weightFromP(0) - W_MAX) < 1e-12);
  assert.ok(Math.abs(weightFromP(2e-12) - (W_MAX - Math.log(2))) < 1e-9);
});

// Catches: fails if the sign of the llr leaks into the weight or probability, if perfect
// readout (llr = +/-Infinity) gives NaN instead of p = 0, or if weightFromLlr is not capped
// at W_MAX = weightFromP(1e-12) (CLAUDE.md edge-weight rule). Boundary pair: |llr| = 27 is
// below the cap and returned as is; |llr| = 28 is past it and gives W_MAX.
test('weightFromLlr, pFromLlr and xorP', () => {
  const W_MAX = weightFromP(1e-12);
  assert.equal(weightFromLlr(-2.5), 2.5);
  assert.equal(weightFromLlr(27), 27);
  assert.equal(weightFromLlr(-28), W_MAX);
  assert.equal(weightFromLlr(Infinity), W_MAX);
  assert.equal(weightFromLlr(-Infinity), W_MAX);
  for (const l of [-30, -5, 0, 0.3, 12]) {
    assert.ok(Math.abs(weightFromLlr(l) - weightFromP(pFromLlr(l))) < 1e-9, `llr ${l}`);
  }
  assert.equal(pFromLlr(0), 0.5);
  assert.ok(Math.abs(pFromLlr(-3) - 1 / (1 + Math.exp(3))) < 1e-15);
  assert.equal(pFromLlr(Infinity), 0);
  assert.equal(pFromLlr(-Infinity), 0);
  assert.ok(Math.abs(xorP(0.1, 0.2) - 0.26) < 1e-15);
  assert.ok(Math.abs(xorP(0, 0.3) - 0.3) < 1e-15);
  assert.ok(Math.abs(xorP(0.5, 0.3) - 0.5) < 1e-15);
});
