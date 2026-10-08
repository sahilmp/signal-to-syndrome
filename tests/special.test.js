import { test } from 'node:test';
import assert from 'node:assert/strict';
import { erfc, normalLogPdf, lgamma } from '../src/core/special.js';

// Reference values from Python's math.erfc (CPython 3, double precision).
const ERFC_REF = [
  [0, 1.0],
  [0.1, 0.8875370839817152],
  [0.5, 0.4795001221869534],
  [1, 0.1572992070502851],
  [1.5, 0.033894853524689274],
  [1.99, 0.004888586800383002],
  [2, 0.004677734981047265],
  [2.01, 0.004475150644751764],
  [3, 2.209049699858544e-05],
  [5, 1.5374597944280351e-12],
  [10, 2.088487583762545e-45],
  [-1, 1.842700792949715],
  [-3, 1.9999779095030012],
];

// Catches: fails if erfc loses accuracy in either branch (series below 2, continued fraction
// from 2), at the switch between them (1.99, 2, 2.01), in the far tail (5, 10; an absolute
// 1e-12 check would pass erfc(5) = 0 there, so the check is relative) or for negative x
// (erfc(-x) = 2 - erfc(x)).
test('erfc matches reference values to relative 1e-12', () => {
  for (const [x, ref] of ERFC_REF) {
    const got = erfc(x);
    assert.ok(Math.abs(got - ref) <= 1e-12 * Math.abs(ref), `erfc(${x}) = ${got}, expected ${ref}`);
  }
  assert.equal(erfc(Infinity), 0);
  assert.equal(erfc(-Infinity), 2);
  assert.ok(Number.isNaN(erfc(NaN)));
});

// Catches: fails if the normalization uses sigma^2 instead of sigma, drops the 2 pi factor
// or uses the wrong sign or scale in the exponent.
test('normalLogPdf is the normal log-density', () => {
  assert.ok(Math.abs(normalLogPdf(0, 0, 1) - -0.5 * Math.log(2 * Math.PI)) < 1e-15);
  const x = 1.7;
  const mu = -0.4;
  const sigma = 2.5;
  const direct = Math.log(Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma)) / (sigma * Math.sqrt(2 * Math.PI)));
  assert.ok(Math.abs(normalLogPdf(x, mu, sigma) - direct) < 1e-14);
});

// Catches: fails if a Lanczos coefficient, the shift by 1 or the reflection branch is wrong.
// References: Python's math.lgamma and ln(n!) by direct summation.
test('lgamma matches ln Gamma', () => {
  assert.ok(Math.abs(lgamma(0.5) - 0.5723649429247004) < 1e-13);
  assert.ok(Math.abs(lgamma(10.5) - 13.940625219403763) < 1e-12);
  assert.ok(Math.abs(lgamma(101) - 363.73937555556347) < 1e-10);
  assert.ok(Math.abs(lgamma(1)) < 1e-14);
  assert.ok(Math.abs(lgamma(0.25) - Math.log(3.6256099082219083)) < 1e-13);
});
