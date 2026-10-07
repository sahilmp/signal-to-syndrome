import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wilson, bootstrap } from '../src/core/stats.js';
import { createRng } from '../src/core/rng.js';

const close = (a, b, tol = 1e-4) => Math.abs(a - b) < tol;

// Catches: fails if k = 0 gives a negative lower bound or a zero-width interval (as the
// Wald interval does). Known value: hi = (z^2/n) / (1 + z^2/n) = 0.27754 at z = 1.96, n = 10.
test('wilson k = 0, n = 10 gives lo = 0 and hi = 0.27754', () => {
  const w = wilson(0, 10);
  assert.equal(w.p, 0);
  assert.equal(w.lo, 0);
  assert.ok(close(w.hi, 0.27754), `hi = ${w.hi}`);
});

// Catches: fails if the interval is not centred correctly (wrong z^2/(2n) shift or
// denominator). Known value at z = 1.96: (0.23659, 0.76341), symmetric about 0.5.
test('wilson k = 5, n = 10 is symmetric about 0.5', () => {
  const w = wilson(5, 10);
  assert.equal(w.p, 0.5);
  assert.ok(close(w.lo + w.hi, 1, 1e-12), `lo + hi = ${w.lo + w.hi}`);
  assert.ok(close(w.lo, 0.23659), `lo = ${w.lo}`);
  assert.ok(close(w.hi, 0.76341), `hi = ${w.hi}`);
});

// Catches: fails if k = n is not the mirror image of k = 0 (hi must be exactly 1).
test('wilson k = n mirrors k = 0', () => {
  const a = wilson(0, 10);
  const b = wilson(10, 10);
  assert.equal(b.hi, 1);
  assert.ok(close(b.lo, 1 - a.hi, 1e-12));
});

// Catches: fails if statFn receives indices out of range or the wrong number of them, or if
// the percentiles are not ordered around the replicate mean. A constant statistic must give
// a zero-width interval.
test('bootstrap passes nItems in-range indices and orders lo <= mean <= hi', () => {
  const data = Array.from({ length: 50 }, (_, t) => t % 7);
  const res = bootstrap(data.length, (idx) => {
    assert.equal(idx.length, data.length);
    for (const t of idx) assert.ok(Number.isInteger(t) && t >= 0 && t < data.length);
    return idx.reduce((s, t) => s + data[t], 0) / idx.length;
  }, 500, createRng(11));
  assert.ok(res.lo <= res.mean && res.mean <= res.hi, JSON.stringify(res));
  assert.ok(res.lo < res.hi);
  const c = bootstrap(10, () => 3, 50, createRng(1));
  assert.deepEqual(c, { mean: 3, lo: 3, hi: 3 });
});
