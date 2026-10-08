import { test } from 'node:test';
import assert from 'node:assert/strict';
import { perRound, perRoundToTotal, cycleTime, perMicrosecond, breakEven, breakEvenDetail } from '../src/core/metrics.js';

// Catches: fails if perRound is not the inverse of compounding r rounds, e.g. if it divides
// pL by r, uses the exponent r instead of 1/r, or drops the factor 2 inside (1 - 2 pL). The
// round trip eps -> perRoundToTotal -> perRound must return eps to 1e-12 over small and large
// eps and several r (including the r = 3 and 5 of the banks). eps stops at 0.4: near 0.5 the
// total is within ~1e-9 of 0.5 at r = 5 and the inversion is ill-conditioned in double precision.
test('perRound inverts perRoundToTotal to 1e-12', () => {
  for (const r of [1, 2, 3, 5, 7]) {
    for (const eps of [0, 1e-9, 1e-6, 3.7e-4, 0.0123, 0.1, 0.25, 0.4]) {
      const back = perRound(perRoundToTotal(eps, r), r);
      assert.ok(Math.abs(back - eps) <= 1e-12, `r ${r}, eps ${eps}: got ${back}`);
    }
  }
  // And the other direction from a measured pL.
  for (const pL of [1e-5, 0.0035, 0.0226, 0.3]) {
    assert.ok(Math.abs(perRoundToTotal(perRound(pL, 3), 3) - pL) <= 1e-12, `pL ${pL}`);
  }
});

// Catches: fails if perRound with a single round does anything to pL (an off-by-one in the
// exponent, or a different normalisation such as dividing by r + 1).
test('perRound(pL, 1) equals pL', () => {
  for (const pL of [0, 1e-7, 0.0035, 0.1, 0.3, 0.4999]) {
    assert.ok(Math.abs(perRound(pL, 1) - pL) <= 1e-15, `pL ${pL}: got ${perRound(pL, 1)}`);
  }
});

// Catches: fails if a known compounding value is wrong. 3 rounds of eps = 0.1:
// 0.5 (1 - 0.8^3) = 0.5 (1 - 0.512) = 0.244 (not 3 * 0.1 = 0.3).
test('perRoundToTotal on a hand example', () => {
  assert.ok(Math.abs(perRoundToTotal(0.1, 3) - 0.244) < 1e-15);
  assert.ok(Math.abs(perRound(0.244, 3) - 0.1) < 1e-15);
});

// Boundary test (non-vacuous pair). Catches: fails if pL at or past 0.5 returns NaN or a value
// above 0.5 (the formula's (1 - 2 pL)^(1/r) is NaN for pL > 0.5 and odd roots would go
// negative), or if the clamp also catches values just below 0.5. pL = 0.5 gives exactly 0.5;
// pL = 0.5 - 0.1 = 0.4 at r = 1 gives 0.4, not the clamp value.
test('perRound clamps pL >= 0.5 at 0.5 but not 0.4', () => {
  assert.equal(perRound(0.5, 3), 0.5);
  assert.equal(perRound(0.6, 3), 0.5);
  assert.ok(Math.abs(perRound(0.4, 1) - 0.4) < 1e-15);
});

// Catches: fails if the cycle time drops the factor gate_layers_per_round, adds tau twice, or
// ignores reset_us. Hand example: 2 layers * 600 us + 31.6 us + 50 us = 1281.6 us; and a card
// with plain numbers (not { value, source }) gives 2 * 0.05 + 0.8 + 0.5 = 1.4 us.
test('cycleTime arithmetic on a hand example', () => {
  const card = {
    two_qubit_gate_us: { value: 600, source: 'test' },
    gate_layers_per_round: { value: 2, source: 'test' },
    reset_us: { value: 50, source: 'test' },
  };
  assert.ok(Math.abs(cycleTime(card, 31.6) - 1281.6) < 1e-9);
  assert.ok(Math.abs(cycleTime({ two_qubit_gate_us: 0.05, gate_layers_per_round: 2, reset_us: 0.5 }, 0.8) - 1.4) < 1e-12);
  assert.ok(Math.abs(perMicrosecond(1e-3, 1281.6) - 1e-3 / 1281.6) < 1e-18);
});

// Catches: fails if an unfilled card (the Appendix T6 template has value null) silently gives
// a number (null * 2 = 0 in JavaScript) instead of an error.
test('cycleTime rejects a card with a null value', () => {
  const card = { two_qubit_gate_us: { value: null, source: '' }, gate_layers_per_round: { value: 2 }, reset_us: { value: 1 } };
  assert.throws(() => cycleTime(card, 1), /two_qubit_gate_us/);
  assert.throws(() => perMicrosecond(1e-3, 0), /Tcyc/);
});

// Boundary test (non-vacuous pair). Catches: fails if breakEven interpolates in the wrong
// direction, uses yD3 - yD5 crossing a non-zero level, or returns a grid point instead of the
// interpolated crossing; and fails if it reports a crossing for lines that never meet. The
// pair: yD3 = 1 + x and yD5 = 3 - x (crossing at x = 1, between grid points 0.5 and 1.5),
// against yD3 = 1 + x and yD5 = 3 + x (parallel, difference 2 everywhere: null).
test('breakEven finds the crossing of two straight lines and null for parallel lines', () => {
  const xs = [0, 0.5, 1.5, 2, 3];
  const yD3 = xs.map((x) => 1 + x);
  const crossing = breakEven(xs, yD3, xs.map((x) => 3 - x));
  assert.ok(Math.abs(crossing - 1) < 1e-12, `crossing ${crossing}`);
  assert.equal(breakEven(xs, yD3, xs.map((x) => 3 + x)), null);
});

// Catches: fails if breakEven assumes ascending xs (the Stage 4 x axis is the assignment error
// in tau order, which falls with tau) or reports anything but the first sign change. xs fall
// from 0.4 to 0.0; yD5 - yD3 = 10 (x - 0.25) changes sign once, between 0.3 and 0.2, at 0.25.
// The detail gives segment index 1 and fraction 0.5.
test('breakEven works on a falling x axis and gives the segment of the crossing', () => {
  const xs = [0.4, 0.3, 0.2, 0.1, 0.0];
  const yD3 = xs.map(() => 0.1);
  const yD5 = xs.map((x) => 0.1 + 10 * (x - 0.25));
  assert.ok(Math.abs(breakEven(xs, yD3, yD5) - 0.25) < 1e-12);
  const det = breakEvenDetail(xs, yD3, yD5);
  assert.equal(det.index, 1);
  assert.ok(Math.abs(det.fraction - 0.5) < 1e-12);
});
