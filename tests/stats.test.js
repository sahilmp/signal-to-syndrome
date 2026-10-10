import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wilson, bootstrap, clusterBootstrapRate, pairedClusterDiff } from '../src/core/stats.js';
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

// ---- V17: cluster bootstrap and paired differences (CC-A19) ----

const width = (x) => x.hi - x.lo;

// Catches: fails if clusterBootstrapRate resamples readout draws instead of whole quantum
// shots (the interval would then match Wilson over n*R draws). Here every failing shot fails
// all R = 4 draws, so the per-shot rate is 0 or 1 and Var(rate) = p(1-p)/n, against Wilson's
// p(1-p)/(nR): the width ratio is sqrt(R) = 2. Bootstrap noise (B = 2000): the SE of a 2.5%
// percentile is sqrt(q(1-q)/B)/phi(1.96) ~ 0.06 in units of the SE, so the width ratio has a
// relative SE of about 0.03; 4 SE is 0.12, we allow 0.25 (12.5%).
test('V17: clusterBootstrapRate is about sqrt(R) wider than Wilson when draws of a shot agree', () => {
  const n = 2000;
  const R = 4;
  const fail = Array.from({ length: n }, (_, i) => (i < 200 ? R : 0)); // p = 0.1
  const c = clusterBootstrapRate(fail, R, 2000, createRng(17));
  const w = wilson(200 * R, n * R);
  assert.equal(c.rate, 0.1);
  const ratio = width(c) / width(w);
  assert.ok(Math.abs(ratio - Math.sqrt(R)) < 0.25, `width ratio ${ratio}`);
});

// Catches: fails if the rate is not normalised by nShots * R, or if independent draws are
// widened anyway. failCounts ~ Binomial(R = 4, p = 0.1) per shot (independent draws), so the
// cluster interval estimates the same variance as Wilson, p(1-p)/(nR); agreement within 15%
// (bootstrap relative SE of the width about 0.03 at B = 2000, plus the sampling of the data).
test('V17: clusterBootstrapRate agrees with Wilson within 15% for independent draws', () => {
  const n = 2000;
  const R = 4;
  const rng = createRng(171);
  const fail = Array.from({ length: n }, () => {
    let f = 0;
    for (let k = 0; k < R; k++) if (rng.uniform() < 0.1) f++;
    return f;
  });
  const k = fail.reduce((s, f) => s + f, 0);
  const c = clusterBootstrapRate(fail, R, 2000, createRng(172));
  const w = wilson(k, n * R);
  assert.equal(c.rate, k / (n * R));
  const ratio = width(c) / width(w);
  assert.ok(Math.abs(ratio - 1) < 0.15, `width ratio ${ratio}`);
});

// Catches: fails if pairedClusterDiff resamples A and B with different indices (then
// identical inputs would give a non-zero-width interval).
test('V17: pairedClusterDiff of identical A and B is exactly 0 with lo = hi = 0', () => {
  const rng = createRng(173);
  const fail = Array.from({ length: 500 }, () => rng.int(3));
  const p = pairedClusterDiff(fail, fail, 2, 500, createRng(174));
  assert.deepEqual(p, { diff: 0, lo: 0, hi: 0 });
});

// Catches: fails if the difference has the wrong sign (B - A) or the interval misses a known
// shift. A fails each of R = 2 draws with p = 0.15, B is A with every failure of the shots
// i % 3 === 0 removed, so the true shift is 0.15 / 3 = 0.05 and the sample shift is exactly
// the removed count / (n R). The paired interval must contain the sample shift and exclude 0
// (the shift is about 0.05 / sqrt(0.05 * 0.95 / (n R)) ~ 15 SE from 0 at n = 3000).
test('V17: pairedClusterDiff recovers a known shift inside its interval', () => {
  const n = 3000;
  const R = 2;
  const rng = createRng(175);
  const failA = Array.from({ length: n }, () => (rng.uniform() < 0.15 ? 1 : 0) + (rng.uniform() < 0.15 ? 1 : 0));
  const failB = failA.map((f, i) => (i % 3 === 0 ? 0 : f));
  const removed = failA.reduce((s, f, i) => s + (i % 3 === 0 ? f : 0), 0);
  const p = pairedClusterDiff(failA, failB, R, 1000, createRng(176));
  assert.equal(p.diff, removed / (n * R));
  assert.ok(p.lo < p.diff && p.diff < p.hi, JSON.stringify(p));
  assert.ok(p.lo > 0, `lo ${p.lo}`);
  assert.ok(p.lo < 0.05 && 0.05 < p.hi, `true shift 0.05 outside ${JSON.stringify(p)}`);
});

// Catches: fails if a fail count above R (or a length mismatch) is accepted silently; the
// boundary f = R is valid, R + 1 is not.
test('V17: fail counts must lie in 0..R and A, B must have the same length', () => {
  assert.doesNotThrow(() => clusterBootstrapRate([0, 2], 2, 10, createRng(1)));
  assert.throws(() => clusterBootstrapRate([0, 3], 2, 10, createRng(1)), /0\.\.2/);
  assert.throws(() => pairedClusterDiff([0, 1], [0], 2, 10, createRng(1)), /shots/);
});
