import { test } from 'node:test';
import assert from 'node:assert/strict';
import { perRound, perRoundToTotal, cycleTime, perMicrosecond, breakEven, breakEvenDetail, roundsPerSecond, tradeoffCurve, dominance } from '../src/core/metrics.js';

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

// V15. Catches: fails if the sequential-gate expression "2*(d-1)" is ignored, evaluated at the
// wrong d (e.g. d - 1 layers, or 2d), or if a numeric layer count starts depending on d.
// Hand example (Forte-like card, 970 us gates, 50 us reset, tau = 20 us): 2 layers give
// 2 * 970 + 20 + 50 = 2010 us at any d; "2*(d-1)" at d = 5 gives 8 * 970 + 70 = 7830 us and at
// d = 3 gives 4 * 970 + 70 = 3950 us. Rounds per second at 2010 us: 1e6 / 2010 = 497.512...
test('cycleTime with 2 layers and with "2*(d-1)" at d = 5', () => {
  const base = { two_qubit_gate_us: { value: 970, source: 'test' }, reset_us: { value: 50, source: 'test' } };
  const parallel = { ...base, gate_layers_per_round: { value: 2, source: 'test' } };
  const sequential = { ...base, gate_layers_per_round: { value: '2*(d-1)', source: 'test' } };
  assert.ok(Math.abs(cycleTime(parallel, 20, 5) - 2010) < 1e-9);
  assert.ok(Math.abs(cycleTime(parallel, 20) - 2010) < 1e-9);
  assert.ok(Math.abs(cycleTime(sequential, 20, 5) - 7830) < 1e-9);
  assert.ok(Math.abs(cycleTime(sequential, 20, 3) - 3950) < 1e-9);
  assert.ok(Math.abs(cycleTime({ ...base, gate_layers_per_round: { value: '2 * (d - 1)' } }, 20, 5) - 7830) < 1e-9);
  assert.ok(Math.abs(roundsPerSecond(2010) - 1e6 / 2010) < 1e-9);
  assert.throws(() => roundsPerSecond(0), /Tcyc_us/);
});

// V15. Catches: fails if the card's layer expression is evaluated as code (any string other
// than "2*(d-1)" must throw, so "3*(d-1)" or "d" never silently gives a number), or if the
// accepted expression gives a number without a distance (2 * (undefined - 1) is NaN).
test('cycleTime throws on an unknown layer expression and on "2*(d-1)" without d', () => {
  const card = (v) => ({ two_qubit_gate_us: 970, reset_us: 50, gate_layers_per_round: { value: v } });
  for (const v of ['3*(d-1)', '2*d', 'd', '2', 'Math.PI']) {
    assert.throws(() => cycleTime(card(v), 20, 5), /not supported/, v);
  }
  assert.throws(() => cycleTime(card('2*(d-1)'), 20), /distance/);
  assert.throws(() => cycleTime(card('2*(d-1)'), 20, 1), /distance/);
});

// V15. Catches: fails if tradeoffCurve mixes up the axes, leaves out the cycle-time parts, or
// uses pL instead of the per-round error. Hand example: card 2 layers * 0.05 us + reset 0.5 us,
// taus 0.5 and 1.5 us: Tcyc 1.1 and 2.1 us, rounds per second 1e6 / 1.1 = 909090.909... and
// 1e6 / 2.1 = 476190.476...; r = 3: perRound(0.244) = 0.1 (0.5 (1 - 0.8^3) = 0.244) and
// perRound(0) = 0.
test('tradeoffCurve on hand-computed numbers', () => {
  const card = { two_qubit_gate_us: 0.05, gate_layers_per_round: 2, reset_us: 0.5 };
  const c = tradeoffCurve([0.5, 1.5], [0.244, 0], 3, card, 3);
  assert.deepEqual(c.tau, [0.5, 1.5]);
  assert.ok(Math.abs(c.roundsPerSecond[0] - 909090.9090909091) < 1e-6);
  assert.ok(Math.abs(c.roundsPerSecond[1] - 476190.4761904762) < 1e-6);
  assert.ok(Math.abs(c.perRound[0] - 0.1) < 1e-15);
  assert.equal(c.perRound[1], 0);
  assert.throws(() => tradeoffCurve([0.5], [0.1, 0.2], 3, card, 3), /equal length/);
});

// V15, C3 dominance rule (Appendix U4). Catches: fails if dominance needs only one axis, ignores
// the intervals, or swaps the arms. Two synthetic arms built with tradeoffCurve and read at
// their own tau*_log (the grid minimum of perRound). Case 1 (dominating): arm A has per-round
// error 1e-3 [8e-4, 1.2e-3] at Tcyc 1.1 us and arm B 5e-3 [4e-3, 6e-3] at Tcyc ~ 2000 us: A is
// lower beyond the intervals and faster, so "A" (and "B" with the arms swapped). Case 2 (not
// dominating): the same errors but B is the faster arm: neither dominates, null. Boundary pair:
// A.hi exactly equal to B.lo is not "beyond the intervals" (null); A.hi a step 1e-6 below it is.
test('C3 dominance rule on two synthetic curves, one dominating and one not', () => {
  const fast = { two_qubit_gate_us: 0.05, gate_layers_per_round: 2, reset_us: 0.5 };
  const slow = { two_qubit_gate_us: 970, gate_layers_per_round: 2, reset_us: 50 };
  const r = 3;
  const total = (eps) => perRoundToTotal(eps, r);
  const curveA = { taus: [0.3, 0.5, 0.9], eps: [4e-3, 1e-3, 2e-3], lo: [3e-3, 8e-4, 1.5e-3], hi: [5e-3, 1.2e-3, 2.5e-3] };
  const curveB = { taus: [10, 30, 100], eps: [9e-3, 5e-3, 7e-3], lo: [8e-3, 4e-3, 6e-3], hi: [1e-2, 6e-3, 8e-3] };
  const pointAt = (c, card) => {
    const tc = tradeoffCurve(c.taus, c.eps.map(total), r, card, 3);
    const lo = tradeoffCurve(c.taus, c.lo.map(total), r, card, 3).perRound;
    const hi = tradeoffCurve(c.taus, c.hi.map(total), r, card, 3).perRound;
    let i = 0;
    tc.perRound.forEach((v, j) => { if (v < tc.perRound[i]) i = j; });
    return { perRound: tc.perRound[i], lo: lo[i], hi: hi[i], roundsPerSecond: tc.roundsPerSecond[i] };
  };
  const aFast = pointAt(curveA, fast);
  const bSlow = pointAt(curveB, slow);
  assert.ok(Math.abs(aFast.perRound - 1e-3) < 1e-12);
  assert.equal(dominance(aFast, bSlow), 'A');
  assert.equal(dominance(bSlow, aFast), 'B');
  const aSlow = pointAt(curveA, slow);
  const bFast = pointAt(curveB, fast);
  assert.equal(dominance(aSlow, bFast), null);
  const edge = { perRound: 4e-3, lo: 3e-3, hi: 4e-3, roundsPerSecond: 2 };
  const other = { perRound: 5e-3, lo: 4e-3, hi: 6e-3, roundsPerSecond: 1 };
  assert.equal(dominance(edge, other), null);
  assert.equal(dominance({ ...edge, hi: 4e-3 - 1e-6 }, other), 'A');
});

// Catches: fails if cycleTime, roundsPerSecond or perRound drift from the V15 hand formulas on
// the real cycle card (rounds per second = 1e6 / T_cyc with T_cyc = layers x gate + tau + reset;
// error per round = 1/2 [1 - (1 - 2 pL)^(1/r)]), e.g. if the ion's "2*(d-1)" layers were read as 2.
// Hand numbers at d = 3: ion 4 x 970 + 23.02 + 50 = 3953.02 us; superconducting 2 x 0.042 + 0.764
// + 0.25 = 1.098 us; pL = 0.00336 at r = 3.
test('V15 hand formulas on params/cycle.json at d = 3', async () => {
  const { readFileSync } = await import('node:fs');
  const cycle = JSON.parse(readFileSync(new URL('../params/cycle.json', import.meta.url), 'utf8'));
  const ion = cycleTime(cycle['trapped-ion'], 23.02, 3);
  assert.ok(Math.abs(ion - 3953.02) < 1e-9, `ion ${ion}`);
  assert.ok(Math.abs(roundsPerSecond(ion) - 1e6 / 3953.02) < 1e-9);
  const sc = cycleTime(cycle.superconducting, 0.764, 3);
  assert.ok(Math.abs(sc - 1.098) < 1e-12, `sc ${sc}`);
  assert.ok(Math.abs(perRound(0.00336, 3) - 0.5 * (1 - (1 - 2 * 0.00336) ** (1 / 3))) < 1e-15);
  assert.ok(Math.abs(perMicrosecond(perRound(0.00336, 3), sc) - perRound(0.00336, 3) / sc) < 1e-15);
});
