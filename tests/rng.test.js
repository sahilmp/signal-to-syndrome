import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/core/rng.js';

const N = 200000;

function moments(draw, n) {
  let s = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    const v = draw();
    s += v;
    s2 += v * v;
  }
  const mean = s / n;
  const variance = (s2 - n * mean * mean) / (n - 1);
  return { mean, variance };
}

// Catches: fails if the generator depends on hidden global state (e.g. Math.random
// or a module-level counter), so that the same seed does not reproduce the same stream.
test('same seed gives the same first 1000 uniforms', () => {
  const a = createRng(12345);
  const b = createRng(12345);
  for (let i = 0; i < 1000; i++) {
    const u = a.uniform();
    assert.equal(u, b.uniform(), `draw ${i} differs`);
    assert.ok(u >= 0 && u < 1, `draw ${i} = ${u} outside [0, 1)`);
  }
});

// Catches: fails if the seed is ignored (every rng produces the same stream).
test('different seeds give different streams', () => {
  const a = createRng(1);
  const b = createRng(2);
  let same = 0;
  for (let i = 0; i < 1000; i++) if (a.uniform() === b.uniform()) same++;
  assert.ok(same < 5, `${same} of 1000 draws coincide`);
});

// Catches: fails if Box-Muller is wrong (missing sqrt, wrong log, or the cached second
// value is dropped or returned twice), shifting the mean or scaling the variance.
// Tolerance: SE(mean) = 1/sqrt(N); SE(var) = sqrt(2/N) for a normal. With N = 200000,
// 4 SE = 0.0089 and 0.0126; we use 0.012 and 0.017 (about 5.4 SE).
test('normal has mean 0 and variance 1', () => {
  const rng = createRng(7);
  const { mean, variance } = moments(rng.normal, N);
  assert.ok(Math.abs(mean) < 0.012, `mean ${mean}`);
  assert.ok(Math.abs(variance - 1) < 0.017, `variance ${variance}`);
});

// Catches: fails if the cached second Box-Muller value is correlated with the first
// (e.g. returning the same value twice). Pair correlation SE = 1/sqrt(N/2); 4 SE = 0.0126.
test('consecutive normals are uncorrelated', () => {
  const rng = createRng(8);
  const pairs = N / 2;
  let sxy = 0;
  for (let i = 0; i < pairs; i++) sxy += rng.normal() * rng.normal();
  assert.ok(Math.abs(sxy / pairs) < 0.0126, `pair correlation ${sxy / pairs}`);
});

// Catches: fails if exponential uses the rate as a scale (mean 1/rate swapped for rate).
// SE(mean) = (1/rate)/sqrt(N); with rate = 2, N = 200000, 4 SE = 0.0045; tolerance 0.005.
test('exponential has mean 1/rate', () => {
  const rng = createRng(9);
  const { mean } = moments(() => rng.exponential(2), N);
  assert.ok(Math.abs(mean - 0.5) < 0.005, `mean ${mean}`);
});

// Poisson tolerances: SE(mean) = sqrt(lambda/N); SE(var) = sqrt((lambda + 2*lambda^2)/N)
// (fourth central moment lambda*(1 + 3*lambda)). We allow 5 SE.
function checkPoisson(lambda, seed) {
  const rng = createRng(seed);
  const n = N;
  const { mean, variance } = moments(() => rng.poisson(lambda), n);
  const seMean = Math.sqrt(lambda / n);
  const seVar = Math.sqrt((lambda + 2 * lambda * lambda) / n);
  assert.ok(Math.abs(mean - lambda) < 5 * seMean, `lambda ${lambda}: mean ${mean}, tol ${5 * seMean}`);
  assert.ok(Math.abs(variance - lambda) < 5 * seVar, `lambda ${lambda}: variance ${variance}, tol ${5 * seVar}`);
}

// Catches: fails if Knuth's method is off by one (returns k instead of k-1, mean lambda+1)
// or compares against the wrong limit. Tolerance in the comment above checkPoisson.
test('poisson mean and variance at lambda = 5 (Knuth branch)', () => {
  checkPoisson(5, 21);
});

// Catches: fails if a PTRS constant or the acceptance test is wrong, which biases the
// mean or variance at lambda >= 30. Tolerance in the comment above checkPoisson.
test('poisson mean and variance at lambda = 50 (PTRS branch)', () => {
  checkPoisson(50, 22);
});

// Catches: fails if lambda = 0 loops or returns a non-zero value, and if the branch
// switch at lambda = 30 is broken (the boundary case must still give integer draws
// with the right mean). Tolerance: 5 * sqrt(30/N).
test('poisson at lambda = 0 returns 0; lambda = 30 uses PTRS correctly', () => {
  const rng = createRng(23);
  for (let i = 0; i < 100; i++) assert.equal(rng.poisson(0), 0);
  const { mean } = moments(() => rng.poisson(30), N);
  assert.ok(Math.abs(mean - 30) < 5 * Math.sqrt(30 / N), `mean ${mean}`);
});

// Catches: fails if int(n) can return n or a negative value, or is not uniform
// over 0..n-1. Each count ~ Binomial(N, 1/n); SE = sqrt(N p (1-p)); tolerance 5 SE.
test('int(n) is uniform on 0..n-1', () => {
  const rng = createRng(31);
  const n = 7;
  const counts = new Array(n).fill(0);
  for (let i = 0; i < N; i++) {
    const v = rng.int(n);
    assert.ok(Number.isInteger(v) && v >= 0 && v < n, `int(${n}) gave ${v}`);
    counts[v]++;
  }
  const p = 1 / n;
  const se = Math.sqrt(N * p * (1 - p));
  for (const c of counts) assert.ok(Math.abs(c - N * p) < 5 * se, `count ${c}`);
});
