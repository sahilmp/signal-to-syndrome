import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gaussLegendre, integrate, logIntegrate } from '../src/core/quadrature.js';

// Catches: fails if the Newton iteration converges to the wrong roots (wrong initial guess or
// recurrence) or the weights use the wrong derivative: the 5-point rule has the tabulated
// nodes 0, +/-0.5384693101056831, +/-0.9061798459386640 and its weights sum to 2.
test('gaussLegendre(5) matches the tabulated nodes and the weights sum to 2', () => {
  const { nodes, weights } = gaussLegendre(5);
  const expected = [-0.906179845938664, -0.5384693101056831, 0, 0.5384693101056831, 0.906179845938664];
  for (let i = 0; i < 5; i++) assert.ok(Math.abs(nodes[i] - expected[i]) < 1e-14, `node ${i}: ${nodes[i]}`);
  assert.ok(Math.abs(weights.reduce((s, w) => s + w, 0) - 2) < 1e-14);
  for (const n of [1, 2, 64, 128]) {
    const sum = gaussLegendre(n).weights.reduce((s, w) => s + w, 0);
    assert.ok(Math.abs(sum - 2) < 1e-13, `n=${n}: weight sum ${sum}`);
  }
});

// Catches: fails if the map from [-1, 1] to [a, b] is wrong (missing the (b - a)/2 factor or
// the midpoint shift) or the rule is not exact for polynomials: x^10 on [0, 1] is 1/11 and
// exp(-x) on [0, 5] is 1 - e^-5, both to 1e-12.
test('integrate: x^10 on [0, 1] and exp(-x) on [0, 5] to 1e-12', () => {
  assert.ok(Math.abs(integrate((x) => x ** 10, 0, 1) - 1 / 11) < 1e-12);
  assert.ok(Math.abs(integrate((x) => Math.exp(-x), 0, 5) - (1 - Math.exp(-5))) < 1e-12);
});

// Catches: fails if logIntegrate drops the log-weights or the log of the half-width, or
// mishandles the log-sum-exp shift: it must equal log(integrate) for 1 + x^2 on [0, 2]
// (integral 14/3), and stay finite for exp(-1000 + x) on [0, 2], whose integral
// e^-1000 (e^2 - 1) underflows in linear space.
test('logIntegrate agrees with log(integrate) and survives underflow', () => {
  const lin = integrate((x) => 1 + x * x, 0, 2);
  const lg = logIntegrate((x) => Math.log(1 + x * x), 0, 2);
  assert.ok(Math.abs(lg - Math.log(lin)) < 1e-12, `${lg} vs ${Math.log(lin)}`);
  assert.ok(Math.abs(lg - Math.log(14 / 3)) < 1e-12);
  const tiny = logIntegrate((x) => -1000 + x, 0, 2);
  assert.ok(Math.abs(tiny - (-1000 + Math.log(Math.expm1(2)))) < 1e-10, `${tiny}`);
  assert.equal(logIntegrate(() => -Infinity, 0, 1), -Infinity);
});
