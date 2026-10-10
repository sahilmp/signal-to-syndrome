import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  faultDetectors, detectorName, edgeProbabilities, edgeWeights, diagonalCells, topPairs, pairKind,
  comparisonFor, outOfSampleFor, comparisonSentence, HEATMAP_BANKS,
  cheapestExplanations, tieSentences, heldOutText, IN_SAMPLE,
} from '../src/ui/learnnoise.js';
import holdout from '../data/results/holdout.json' with { type: 'json' };
import { computeDetectors } from '../src/core/detectors.js';
import { buildGraph, weightFromP } from '../src/core/graph.js';
import { decode } from '../src/core/matching.js';
import dem from '../data/results/dem_forte1.json' with { type: 'json' };

// V16 reference: the bits of an error-free shot (all zero) with the fault applied by the U7.6
// rule, written out independently of faultDetectors. Fault on data qubit i in round k:
// "before": m[k'][i-1], m[k'][i] for k' >= k, and x[i];
// "mid": m[k][i] (the later check of round k), m[k'][i-1], m[k'][i] for k' > k, and x[i];
// "after" (k = r-1): x[i] only.
function faultyBits(d, r, { qubit: i, round: k, slot }) {
  const m = Array.from({ length: r }, () => new Uint8Array(d - 1));
  const x = new Uint8Array(d);
  const flip = (kk, j) => { if (j >= 0 && j <= d - 2) m[kk][j] ^= 1; };
  if (slot === 'before') {
    for (let kk = k; kk < r; kk++) { flip(kk, i - 1); flip(kk, i); }
  } else if (slot === 'mid') {
    flip(k, i);
    for (let kk = k + 1; kk < r; kk++) { flip(kk, i - 1); flip(kk, i); }
  }
  x[i] ^= 1;
  return { m, x };
}

function allSlots(d, r) {
  const out = [];
  for (let k = 0; k < r; k++) {
    for (let i = 0; i < d; i++) {
      out.push({ qubit: i, round: k, slot: 'before' });
      if (i >= 1 && i <= d - 2) out.push({ qubit: i, round: k, slot: 'mid' });
      if (k === r - 1) out.push({ qubit: i, round: k, slot: 'after' });
    }
  }
  return out;
}

// V16. Catches: fails if faultDetectors lights a detector that the circuit's bits would not
// (e.g. "mid" lighting (k+1, i) instead of (k+1, i-1), "before" lighting only one check, or
// "after" touching a round), for any slot at d = 3 or d = 5, r = 3.
for (const d of [3, 5]) {
  test(`V16: faultDetectors equals computeDetectors on flipped bits, every slot, d = ${d}, r = 3`, () => {
    const r = 3;
    const slots = allSlots(d, r);
    // d = 3: 3 rounds x (3 before + 1 mid) + 3 after = 15; d = 5: 3 x (5 + 3) + 5 = 29.
    assert.equal(slots.length, d === 3 ? 15 : 29);
    for (const f of slots) {
      const { m, x } = faultyBits(d, r, f);
      assert.deepEqual([...faultDetectors(d, r, f)], [...computeDetectors(m, x, d, r)], JSON.stringify(f));
    }
  });
}

// Catches: fails if "mid" is treated like "before" (no diagonal pair): the two slots on the same
// qubit and round must light different detectors, the mid one a (k, i) / (k+1, i-1) pair.
test('mid fault lights the diagonal pair, unlike before', () => {
  const mid = faultDetectors(3, 3, { qubit: 1, round: 1, slot: 'mid' });
  const before = faultDetectors(3, 3, { qubit: 1, round: 1, slot: 'before' });
  const lit = (D) => [...D].flatMap((v, i) => (v ? [i] : []));
  assert.deepEqual(lit(mid), [3, 4]); // (1, 1) and (2, 0)
  assert.deepEqual(lit(before), [2, 3]); // (1, 0) and (1, 1)
  assert.deepEqual(lit(mid).map((i) => detectorName(3, 3, i)), ['round 2, check 2', 'round 3, check 1']);
});

// Catches: fails if invalid slots are accepted: "after" exactly in the last round is allowed and
// one round earlier throws; "mid" on data qubit 1 is allowed and on data qubit 0 (one CNOT) throws.
test('faultDetectors boundaries: after only in the last round, mid only on inner qubits', () => {
  assert.doesNotThrow(() => faultDetectors(3, 3, { qubit: 0, round: 2, slot: 'after' }));
  assert.throws(() => faultDetectors(3, 3, { qubit: 0, round: 1, slot: 'after' }));
  assert.doesNotThrow(() => faultDetectors(5, 3, { qubit: 3, round: 0, slot: 'mid' }));
  assert.throws(() => faultDetectors(5, 3, { qubit: 4, round: 0, slot: 'mid' }));
});

// Catches: fails if the naive decoder (one rate, no diagonal edges) explains the diagonal pair
// with fewer or more than two errors, or if the learned graph does not use its single diagonal
// edge (the U7.6 step 2 story).
test('step 2: naive graph needs two edges, learned graph one diagonal edge', () => {
  const bank = dem.banks.find((b) => b.d === 3 && b.r === 3 && b.basis === 'Z');
  const lit = faultDetectors(3, 3, { qubit: 1, round: 1, slot: 'mid' });
  const naiveG = buildGraph(3, 3);
  const naive = decode(naiveG, edgeWeights(naiveG, { naiveP: bank.pGateNaive }), lit);
  assert.equal(naive.paths.flatMap((p) => p.edges).length, 2);
  assert.ok(Math.abs(naive.cost - 2 * weightFromP(bank.pGateNaive)) < 1e-9);
  const learnedG = buildGraph(3, 3, { diagonal: true });
  const learned = decode(learnedG, edgeWeights(learnedG, { classes: bank.classes }), lit);
  const used = learned.paths.flatMap((p) => p.edges).map((id) => learnedG.edges[id]);
  assert.deepEqual(used.map((e) => [e.kind, e.dataQubit, e.round]), [['diag', 1, 1]]);
  assert.ok(Math.abs(learned.cost - weightFromP(bank.classes.diag)) < 1e-9);
  // The diagonal edge is never observable, so the learned correction keeps the stored bit.
  assert.equal(learned.flip, 0);
});

// A53 review item 5. Catches: fails if step 2 presents the naive decoder's choice as what always
// happens: for the diagonal pair of a fault on data 2 in every round there are exactly three
// cheapest explanations, each of two errors costing 2 ln[(1 − p)/p] (8.75 at p = 0.0124), and
// only one of them (data 3 and data 1 flips, through both boundaries) flips data 1. Also fails
// if the sentence drops the tie-break or misreports the decoder's own outcome. Non-vacuous:
// a "before" fault on data 1 (one space edge to the boundary) has a single explanation, no tie.
test('step 2: the naive choice is a three-way tie, one of which flips data 1', () => {
  const bank = dem.banks.find((b) => b.d === 3 && b.r === 3 && b.basis === 'Z');
  const g = buildGraph(3, 3);
  const w = edgeWeights(g, { naiveP: bank.pGateNaive });
  for (let k = 0; k < 3; k++) {
    const lit = faultDetectors(3, 3, { qubit: 1, round: k, slot: 'mid' });
    const ex = cheapestExplanations(g, w, lit);
    assert.equal(ex.nErrors, 2);
    assert.equal(ex.sets.length, 3, `round ${k + 1}`);
    assert.ok(Math.abs(ex.cost - 2 * weightFromP(bank.pGateNaive)) < 1e-9);
    const flipping = ex.sets.filter((s) => s.flip === 1);
    assert.equal(flipping.length, 1);
    assert.deepEqual(flipping[0].edges.map((id) => [g.edges[id].kind, g.edges[id].dataQubit]).sort(), [['space', 0], ['space', 2]]);
    const naive = decode(g, w, lit);
    const t = tieSentences(ex, naive.flip);
    assert.equal(t.tie, true);
    assert.match(t.text, /^Three explanations with two errors each cost the same, and one of them flips data 1\. Which one the decoder picks is a tie-break/);
    assert.match(t.text, naive.flip === 1 ? /\. This time its correction flips data 1, which holds the stored bit, so the logical value is lost\.$/
      : /\. This time its correction leaves data 1, which holds the stored bit, alone, so the logical value survives\.$/);
    assert.equal(t.text.match(/this time/gi).length, 1);
  }
  assert.equal(Math.abs(2 * weightFromP(bank.pGateNaive) - 8.75) < 0.01, true);
  const single = cheapestExplanations(g, w, faultDetectors(3, 3, { qubit: 0, round: 1, slot: 'before' }));
  assert.equal(single.sets.length, 1);
  assert.equal(tieSentences(single, single.sets[0].flip).tie, false);
});

// A53 review item 6. Catches: fails if step 3 does not lead with the held-out test (V18,
// holdout.json setting1) or misquotes it: at d = 5 the learned decoder made 37 logical errors of
// 40 000 against the naive 70, beyond the intervals; at d = 3, 65 against 79 of 8 000, not
// beyond them. Also fails if the in-sample label is lost.
test('step 3: the held-out text quotes the pooled V18 rows', () => {
  assert.equal(holdout.setting1.V18.verdict, 'pass');
  const t = heldOutText(holdout);
  assert.match(t, /^Held-out test: the rates were learned from the original stored shots/);
  assert.match(t, /flat readout ε = 0\.02, hard decoding/);
  assert.match(t, /d = 3: naive 79 of 8 000, learned 65 of 8 000;/);
  assert.match(t, /d = 5: naive 70 of 40 000, learned 37 of 40 000 \(learned lower beyond the 95% intervals\)\.$/);
  assert.equal(heldOutText({}), null);
  assert.equal(IN_SAMPLE, 'In sample (rates learned from the same stored shots): ');
});

// Catches: fails if the learned rates are assigned to the wrong edges: boundary data qubits
// (0 and d-1) must take spaceBoundary, inner ones space, time edges time, diagonal edges diag.
test('edgeProbabilities maps the dem classes onto the learned graph', () => {
  const classes = { space: 0.1, spaceBoundary: 0.2, time: 0.3, diag: 0.4 };
  const g = buildGraph(5, 3, { diagonal: true });
  const p = edgeProbabilities(g, { classes });
  for (const e of g.edges) {
    const want = e.kind === 'diag' ? 0.4 : e.kind === 'time' ? 0.3 : (e.dataQubit === 0 || e.dataQubit === 4) ? 0.2 : 0.1;
    assert.equal(p[e.id], want);
  }
  assert.ok(edgeProbabilities(buildGraph(5, 3), { naiveP: 0.01 }).every((v) => v === 0.01));
});

// Catches: fails if the heatmap's labelled diagonal band is off by one cell, i.e. if its cells are
// not exactly the detector pairs joined by the graph's diagonal edges.
test('diagonalCells are exactly the diagonal edges of buildGraph', () => {
  for (const { d, r } of HEATMAP_BANKS) {
    const g = buildGraph(d, r, { diagonal: true });
    const fromGraph = g.edges.filter((e) => e.kind === 'diag').map((e) => [Math.min(e.u, e.v), Math.max(e.u, e.v)].join(',')).sort();
    assert.deepEqual(diagonalCells(d, r).map((c) => c.join(',')).sort(), fromGraph);
    for (const [a, b] of diagonalCells(d, r)) assert.equal(pairKind(g, a, b), 'diag');
  }
});

// Catches: fails if the table alternative lists the diagonal (self) entries or a pair twice, or
// is not sorted by p.
test('topPairs: off-diagonal pairs once, largest first', () => {
  const pij = [[0.9, 0.1, 0.3], [0.1, 0.8, 0.2], [0.3, 0.2, 0.7]];
  assert.deepEqual(topPairs(pij, 2), [{ a: 0, b: 2, p: 0.3 }, { a: 1, b: 2, p: 0.2 }]);
});

// Catches: fails if the step 3 selector names a bank the results file does not hold, or if a
// held bank's pij is not (d-1)(r+1) square (detector order by layer then check).
test('heatmap banks exist in dem_forte1.json with a square pij of the detector count', () => {
  for (const { d, r } of HEATMAP_BANKS) {
    const b = dem.banks.find((x) => x.d === d && x.r === r && x.basis === 'Z');
    assert.ok(b, `d = ${d}, r = ${r}`);
    assert.equal(b.pij.length, (d - 1) * (r + 1));
    assert.ok(b.pij.every((row) => row.length === b.pij.length));
  }
});

// Catches: fails if the big number reads a row of the wrong d or arm, or if d = 5, r = 5 (no
// comparison run at r = 5) shows nothing instead of the d = 5, r = 3 row with rUsed = 3.
test('comparisonFor: exact row, and the r = 3 row when r has no comparison', () => {
  const a = comparisonFor(dem, { arm: 'superconducting', x: 0.7, d: 7, r: 3 });
  assert.equal(a.rUsed, 3);
  assert.equal(a.row.naive.pL, 0.000875);
  assert.equal(a.row.learned.pL, 0.000125);
  const b = comparisonFor(dem, { arm: 'superconducting', x: 0.7, d: 5, r: 5 });
  assert.equal(b.rUsed, 3);
  assert.equal(b.row.d, 5);
  assert.equal(comparisonFor(dem, { arm: 'none', x: 1, d: 5, r: 3 }).row, null);
  assert.equal(outOfSampleFor(dem, { d: 5, r: 5 }).length, 2);
});

// Catches: fails if the factor is inverted (naive / learned), or if a learned count of 0 gives a
// factor of Infinity instead of saying there was no logical error.
test('comparisonSentence: factor, worse case and zero errors', () => {
  const row = (nk, lk) => ({ naive: { k: nk, n: 1000, pL: nk / 1000 }, learned: { k: lk, n: 1000, pL: lk / 1000 } });
  assert.match(comparisonSentence(row(40, 10)), /: 4 times fewer logical errors\./);
  assert.match(comparisonSentence(row(10, 20)), /: 2 times more logical errors\./);
  assert.match(comparisonSentence(row(5, 0)), /no logical error in 1000 shots/);
});

// ---- CC-B21 item 3: the soft-against-hard reversal leads the numbers of step 3 ----
import { reversalNumbers, reversalText, reversalClause, REVERSAL } from '../src/ui/learnnoise.js';
import stage2v2 from '../data/results/stage2_ion_v2b.json' with { type: 'json' };

// Catches: fails if the first number of step 3 is not the trapped-ion d = 3, tau = 20 µs soft
// minus hard difference for both decoders, if it is read from the in-sample file while the
// held-out one is present (or is not labelled "in sample" when it falls back), or if a decoder's
// row is taken from another d, tau, decoder or comparison kind. Values read from the files.
test('step 3: the reversal comes from holdout setting2, else from stage2v2 labelled in sample', () => {
  assert.deepEqual(REVERSAL, { d: 3, tau: 20 });
  const row = (paired, decoder) => paired.find((p) => p.kind === 'softMinusHard' && p.decoder === decoder && p.d === 3 && p.x === 20);
  const held = reversalNumbers(holdout, stage2v2);
  assert.equal(held.inSample, false);
  for (const dec of ['naive', 'learned']) {
    const r = row(holdout.setting2.paired, dec);
    assert.deepEqual(held[dec], { diff: r.diff, lo: r.lo, hi: r.hi });
  }
  const fallback = reversalNumbers(null, stage2v2);
  assert.equal(fallback.inSample, true);
  for (const dec of ['naive', 'learned']) {
    const r = row(stage2v2.paired, dec);
    assert.deepEqual(fallback[dec], { diff: r.diff, lo: r.lo, hi: r.hi });
  }
  assert.match(reversalText(fallback).label, /^In sample \(rates learned from the same stored shots\)/);
  assert.match(reversalText(held).label, /^Held-out circuits/);
  assert.equal(reversalNumbers(null, null), null);
});

// Catches: fails if the reversal is worded from the point estimates rather than the intervals,
// or the two numbers are put on different powers of ten. On the held-out data the naive
// difference is resolved above 0 and the learned one includes 0 (the reversal); an interval
// ending exactly at 0 includes 0, one moved past it does not.
test('step 3: the reversal text, both numbers on the naive power of ten', () => {
  const t = reversalText(reversalNumbers(holdout, stage2v2));
  assert.equal(t.naive, 'Naive decoder: +5.28×10⁻³ [3.73, 7.11]×10⁻³');
  assert.equal(t.learned, 'Learned decoder: +0.0938×10⁻³ [−0.281, 0.5]×10⁻³');
  assert.match(t.sentence, /^With the naive decoder soft decoding loses the bit more often than hard decoding, beyond the 95% interval; with the learned decoder soft and hard decoding cannot be told apart/);
  assert.match(reversalClause({ diff: -1e-4, lo: -2e-4, hi: 0 }), /cannot be told apart/);
  assert.match(reversalClause({ diff: -1e-4, lo: -2e-4, hi: -1e-12 }), /less often than hard decoding, beyond/);
});
