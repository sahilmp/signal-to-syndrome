import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findMinimum, minimumWithBootstrap } from '../src/core/optimum.js';
import { createRng } from '../src/core/rng.js';

const GRID = [1, 2, 3, 5, 7, 10, 15, 20, 30, 50, 100, 200, 500];

// Catches: fails if the fit is done in x instead of ln x, if the vertex formula -c1/(2 c2)
// is wrong, if the fit window is not centred on the lowest grid point, or if yMin is not
// the fitted value at the vertex. y = 3 + 2 (ln x - ln 17)^2 has its minimum at x = 17,
// between the grid points 15 and 20; a quadratic in ln x reproduces it exactly with the
// 3-point (default) and the 5-point least-squares window.
test('findMinimum recovers the minimum of a quadratic in ln x', () => {
  const ys = GRID.map((x) => 3 + 2 * (Math.log(x) - Math.log(17)) ** 2);
  for (const nPoints of [3, 5]) {
    const m = findMinimum(GRID, ys, { logX: true, nPoints });
    assert.equal(m.atEdge, false);
    assert.ok(Math.abs(m.xMin - 17) < 1e-9, `nPoints ${nPoints}: xMin ${m.xMin}`);
    assert.ok(Math.abs(m.yMin - 3) < 1e-12, `nPoints ${nPoints}: yMin ${m.yMin}`);
  }
});

// Catches: fails if logX: false still fits in ln x (or the reverse). y = (x - 6.2)^2 is a
// quadratic in x with its minimum at 6.2, between the grid points 5 and 7.
test('findMinimum with logX false fits a quadratic in x', () => {
  const ys = GRID.map((x) => (x - 6.2) ** 2);
  const m = findMinimum(GRID, ys, { logX: false });
  assert.equal(m.atEdge, false);
  assert.ok(Math.abs(m.xMin - 6.2) < 1e-9, `xMin ${m.xMin}`);
});

// Boundary test (non-vacuous pair). Catches: fails if atEdge is decided by anything other
// than the position of the lowest grid point, e.g. if a monotone series is extrapolated to
// a vertex beyond the grid or an interior minimum is reported as an edge. The two series
// differ only at the last grid point: the monotone one falls to its end (lowest point last,
// atEdge true, xMin = 500), the other turns up at the end so its lowest point is 200, one
// step inside the edge (atEdge false, xMin between 100 and 500).
test('atEdge: true for a monotone series, false for one step inside the edge', () => {
  const falling = GRID.map((x) => 1 / x);
  const edge = findMinimum(GRID, falling);
  assert.equal(edge.atEdge, true);
  assert.equal(edge.xMin, 500);
  assert.equal(edge.yMin, 1 / 500);

  const turning = falling.slice();
  turning[GRID.length - 1] = 1 / 150; // above the value at 200 (1/200), so 200 is lowest
  const inner = findMinimum(GRID, turning);
  assert.equal(inner.atEdge, false);
  assert.ok(inner.xMin > 100 && inner.xMin < 500, `xMin ${inner.xMin}`);
});

// Catches: fails if the first grid point is not treated as an edge (a rising series has its
// lowest point first: atEdge true, xMin = 1).
test('atEdge: true for a rising series at the first grid point', () => {
  const m = findMinimum(GRID, GRID.map((x) => Math.log(x)));
  assert.equal(m.atEdge, true);
  assert.equal(m.xMin, 1);
});

// Boundary test (non-vacuous pair). Catches: fails if tied minima still take the first tied
// point (biased toward small x) or are fitted, or if `tied` miscounts. Two equal lowest
// values at x = 10 and 40 give the midpoint in ln x, sqrt(10 * 40) = 20, with tied = 2 and
// atEdge false; raising the value at 40 by a fixed step (1e-3) removes the tie, so the
// lowest point is 10 alone (tied = 1) and the fitted xMin lies between 7 and 15.
test('findMinimum: tied minima give the midpoint in ln x; one step off the tie gives a fit', () => {
  const xs = [5, 7, 10, 15, 40, 100];
  const ys = [0.02, 0.01, 0.004, 0.006, 0.004, 0.02];
  const t = findMinimum(xs, ys);
  assert.equal(t.tied, 2);
  assert.equal(t.atEdge, false);
  assert.ok(Math.abs(t.xMin - 20) < 1e-9, `xMin ${t.xMin}`);
  assert.equal(t.yMin, 0.004);

  const untied = ys.slice();
  untied[4] = 0.005;
  const u = findMinimum(xs, untied);
  assert.equal(u.tied, 1);
  assert.ok(u.xMin > 7 && u.xMin < 15, `xMin ${u.xMin}`);

  // A tie that includes the first grid point is not an edge minimum: 0 at x = 5 and x = 10.
  const zeros = findMinimum(xs, [0, 0.01, 0, 0.003, 0.004, 0.02]);
  assert.equal(zeros.tied, 2);
  assert.equal(zeros.atEdge, false);
  assert.ok(Math.abs(zeros.xMin - Math.sqrt(50)) < 1e-9, `xMin ${zeros.xMin}`);
});

// Catches: fails if the fitted yMin can go below 0. The points (7, 0.002), (10, 0.0001),
// (15, 0.02) give a parabola in ln x whose vertex, at x ~ 8.7, has the value -1.3e-3
// without the clamp, a negative error rate; with it, yMin is exactly 0.
test('findMinimum clamps the fitted yMin at 0', () => {
  const xs = [5, 7, 10, 15, 40];
  const m = findMinimum(xs, [0.05, 0.002, 0.0001, 0.02, 0.05]);
  assert.equal(m.tied, 1);
  assert.equal(m.atEdge, false);
  assert.ok(m.xMin > 8 && m.xMin < 9.5, `xMin ${m.xMin}`);
  assert.equal(m.yMin, 0);
});

// Catches: fails if the bootstrap resamples grid points instead of shots, uses a different
// resample at each grid point, or miscounts edge replicates. Every shot follows the same
// U-shaped curve in ln x with minimum at 17 (plus a shot-dependent offset that does not move
// the minimum), so every replicate gives xMin = 17: lo = hi = 17 and fractionAtEdge = 0.
// A falling curve puts every replicate at the edge: fractionAtEdge = 1.
test('minimumWithBootstrap: shot resampling keeps a common minimum; edge fraction counts', () => {
  const nShots = 50;
  const offsets = Array.from({ length: nShots }, (_, s) => (s % 7) * 0.1);
  const uMatrix = GRID.map((x) => offsets.map((o) => o + (Math.log(x) - Math.log(17)) ** 2));
  const r = minimumWithBootstrap(GRID, uMatrix, 100, createRng(3));
  assert.equal(r.atEdge, false);
  assert.ok(Math.abs(r.xMin - 17) < 1e-9);
  assert.ok(Math.abs(r.lo - 17) < 1e-9 && Math.abs(r.hi - 17) < 1e-9, `lo ${r.lo} hi ${r.hi}`);
  assert.equal(r.fractionAtEdge, 0);

  const fMatrix = GRID.map((x) => offsets.map((o) => o + 1 / x));
  const f = minimumWithBootstrap(GRID, fMatrix, 100, createRng(3));
  assert.equal(f.atEdge, true);
  assert.equal(f.xMin, 500);
  assert.equal(f.fractionAtEdge, 1);
});

// Catches: fails if the bootstrap interval ignores shot-to-shot noise. Shots are 0/1 errors
// whose rate is lowest at x = 20 but only slightly (0.010 against 0.012 at the neighbours),
// with 2000 shots; the replicates must spread over more than one grid cell (lo < hi) and
// the interval must contain the full-data estimate.
test('minimumWithBootstrap: noisy shots give a non-degenerate interval containing xMin', () => {
  const xs = [10, 15, 20, 30, 50];
  const rates = [0.02, 0.012, 0.01, 0.012, 0.02];
  const nShots = 2000;
  const rng = createRng(77);
  const matrix = rates.map((p) => Float64Array.from({ length: nShots }, () => (rng.uniform() < p ? 1 : 0)));
  const r = minimumWithBootstrap(xs, matrix, 200, createRng(78));
  assert.ok(r.lo < r.hi, `lo ${r.lo} hi ${r.hi}`);
  assert.ok(r.lo <= r.xMin && r.xMin <= r.hi, `xMin ${r.xMin} outside [${r.lo}, ${r.hi}]`);
  assert.ok(r.fractionAtEdge >= 0 && r.fractionAtEdge <= 1);
});

// Catches: fails if malformed input is silently accepted (mismatched lengths, x <= 0 with
// logX, unsorted grid, ragged shot matrix).
test('input validation', () => {
  assert.throws(() => findMinimum([1, 2], [1]));
  assert.throws(() => findMinimum([0, 1, 2], [1, 0, 1], { logX: true }));
  assert.throws(() => findMinimum([1, 3, 2], [1, 0, 1]));
  assert.throws(() => minimumWithBootstrap([1, 2], [[0, 1], [0]], 10, createRng(1)));
});
