import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createIonReadout } from '../src/core/readout/ion.js';
import { createRng } from '../src/core/rng.js';

const card = JSON.parse(readFileSync(new URL('../params/ion.json', import.meta.url), 'utf8'));

// The parameter card with some values replaced (plain numbers are accepted).
function withParams(over) {
  return { ...card, ...over };
}

// ln Pois(n; lambda) by direct summation of ln k, independent of the module's lgamma.
function logPoisDirect(n, lambda) {
  let lf = 0;
  for (let k = 2; k <= n; k++) lf += Math.log(k);
  return n * Math.log(lambda) - lambda - lf;
}
function poisCdf(m, lambda) {
  let s = 0;
  for (let n = 0; n <= m; n++) s += Math.exp(logPoisDirect(n, lambda));
  return s;
}
// Belief error of the rule "bright if n > k" without pumping:
// 0.5 [P(Pois(Rb tau) <= k) + P(Pois(Rd tau) > k)].
function poissonError(k, rb, rd, tau) {
  return 0.5 * (poisCdf(k, rb * tau) + (1 - poisCdf(k, rd * tau)));
}

// No pumping, means 4.72 (bright) and 0.3 (dark) at tau = 10: llr(n) = 2.756 n - 4.42, so
// nTh = 1 and the average error is about 0.044, large enough to measure.
const NOPUMP = withParams({
  R_bright_per_us: 0.472, R_dark_per_us: 0.03,
  gamma_bright_to_dark_per_us: 0, gamma_dark_to_bright_per_us: 0,
});

// Catches: fails if the llr has the wrong sign (llr = ln[p(n|1)/p(n|0)]), the wrong rate is
// used for a bit, or the no-switch weight e^{-g tau} or the integral leaks in when g = 0.
// Without pumping llr(n) = n ln(R_bright/R_dark) - (R_bright - R_dark) tau exactly.
test('closed form: with no pumping llr(n) = n ln(Rb/Rd) - (Rb - Rd) tau', () => {
  const p = withParams({ gamma_bright_to_dark_per_us: 0, gamma_dark_to_bright_per_us: 0, bright_is_bit: 1 });
  const rb = card.R_bright_per_us.value;
  const rd = card.R_dark_per_us.value;
  const tau = 10;
  const ro = createIonReadout(p, tau);
  for (const n of [0, 3, 10, 40]) {
    const expected = n * Math.log(rb / rd) - (rb - rd) * tau;
    assert.ok(Math.abs(ro.llr(n) - expected) < 1e-9, `n=${n}: ${ro.llr(n)} vs ${expected}`);
  }
});

// Catches: fails if bright_is_bit is ignored: with bright_is_bit = 0 the bright bit is 0, so
// the llr flips sign and high counts must read as hard 0.
test('bright_is_bit = 0 flips the llr sign and the hard mapping', () => {
  const ro1 = createIonReadout(NOPUMP, 10);
  const ro0 = createIonReadout({ ...NOPUMP, bright_is_bit: 0 }, 10);
  for (const n of [0, 1, 2, 7]) assert.ok(Math.abs(ro0.llr(n) + ro1.llr(n)) < 1e-12, `n=${n}`);
  const rng = createRng(11);
  for (let s = 0; s < 2000; s++) {
    const { hard, n } = ro0.measure(0, rng);
    assert.equal(hard, n > ro0.threshold() ? 0 : 1);
  }
});

// Validation V7. Catches: fails if the truth sampler uses the wrong Poisson mean, if hard
// uses >= instead of >, or if averageAssignmentError disagrees with the analytic tail sums
// 0.5 [P(Pois(Rb tau) <= nTh) + P(Pois(Rd tau) > nTh)]. Tolerance: 4 binomial standard
// errors, SE = sqrt(e (1 - e) / N), N = 200000 draws (100000 per bit), SE ~ 4.6e-4.
test('V7: empirical assignment error equals the analytic Poisson tails at nTh', () => {
  const tau = 10;
  const ro = createIonReadout(NOPUMP, tau);
  const nTh = ro.threshold();
  const analytic = poissonError(nTh, 0.472, 0.03, tau);
  assert.ok(Math.abs(ro.averageAssignmentError() - analytic) < 1e-12,
    `belief ${ro.averageAssignmentError()} vs analytic ${analytic}`);
  const N = 200000;
  const rng = createRng(20261008);
  let errors = 0;
  for (let s = 0; s < N; s++) {
    const bit = s % 2;
    if (ro.measure(bit, rng).hard !== bit) errors++;
  }
  const rate = errors / N;
  const se = Math.sqrt((analytic * (1 - analytic)) / N);
  assert.ok(Math.abs(rate - analytic) < 4 * se, `empirical ${rate} vs analytic ${analytic} (4 SE = ${4 * se})`);
});

// Boundary test. Catches: fails if the threshold search is off by one (returns a neighbour
// of the minimum) or the hard rule is applied at the wrong count: the belief error at nTh
// must be lower than at nTh - 1 and at nTh + 1, n = nTh must read dark and n = nTh + 1 bright.
test('threshold boundary: error at nTh beats nTh - 1 and nTh + 1; hard flips between nTh and nTh + 1', () => {
  const tau = 10;
  const ro = createIonReadout(NOPUMP, tau);
  const nTh = ro.threshold();
  assert.equal(nTh, 1);
  const eAt = poissonError(nTh, 0.472, 0.03, tau);
  const eBelow = poissonError(nTh - 1, 0.472, 0.03, tau);
  const eAbove = poissonError(nTh + 1, 0.472, 0.03, tau);
  assert.ok(eAt < eBelow, `e(nTh)=${eAt} vs e(nTh-1)=${eBelow}`);
  assert.ok(eAt < eAbove, `e(nTh)=${eAt} vs e(nTh+1)=${eAbove}`);
  assert.ok(Math.abs(ro.averageAssignmentError() - eAt) < 1e-12);
  const rng = createRng(5);
  const seen = new Map();
  for (let s = 0; s < 20000; s++) {
    const { hard, n } = ro.measure(1, rng);
    if (n === nTh || n === nTh + 1) seen.set(n, hard);
  }
  assert.equal(seen.get(nTh), 0, 'n = nTh must read as the dark bit');
  assert.equal(seen.get(nTh + 1), 1, 'n = nTh + 1 must read as the bright bit');
});

// Validation V10. Catches: fails if the llr magnitude is miscalibrated (scaled, offset, or
// computed with the wrong rates), so 1/(1 + e^|llr|) would not be the probability that the
// sign-of-llr decision is wrong. Belief equals truth (no pumping), equal priors; among the m
// samples with |llr| in [1, 2) the observed error frequency must equal the mean q of
// 1/(1 + e^|llr|) within 4 SE, SE = sqrt(q (1 - q) / m).
test('V10: llr is calibrated when belief equals truth', () => {
  const p = withParams({
    R_bright_per_us: 0.5, R_dark_per_us: 0.3,
    gamma_bright_to_dark_per_us: 0, gamma_dark_to_bright_per_us: 0,
  });
  const ro = createIonReadout(p, 20);
  const rng = createRng(424242);
  let m = 0;
  let wrong = 0;
  let qSum = 0;
  for (let s = 0; s < 200000; s++) {
    const bit = s % 2;
    const { llr } = ro.measure(bit, rng);
    const a = Math.abs(llr);
    if (a < 1 || a >= 2) continue;
    m++;
    qSum += 1 / (1 + Math.exp(a));
    if ((llr > 0 ? 1 : 0) !== bit) wrong++;
  }
  const q = qSum / m;
  const se = Math.sqrt((q * (1 - q)) / m);
  assert.ok(m > 10000, `only ${m} samples in the bin`);
  assert.ok(Math.abs(wrong / m - q) < 4 * se, `observed ${wrong / m} vs predicted ${q} (4 SE = ${4 * se}, m = ${m})`);
});

// Catches: fails if the truth sampler ignores pumping or uses the switch time wrongly. With
// gamma_bright_to_dark = 0.05 /us at tau = 100 the mean bright count must be lower than with
// gamma = 0, and equal to Rb (1 - e^{-g tau})/g + Rd (tau - (1 - e^{-g tau})/g) within 4 SE
// (SE = sample sd / sqrt(N), N = 20000).
test('pumping lowers the mean bright count', () => {
  const tau = 100;
  const N = 20000;
  const mean = (h) => h.reduce((s, c, n) => s + c * n, 0) / N;
  const roNone = createIonReadout(withParams({ gamma_bright_to_dark_per_us: 0 }), tau);
  const g = 0.05;
  const roPump = createIonReadout(withParams({ gamma_bright_to_dark_per_us: g }), tau);
  const hNone = roNone.countHistogram(1, N, createRng(99));
  const hPump = roPump.countHistogram(1, N, createRng(99));
  assert.equal(hPump.reduce((s, c) => s + c, 0), N);
  const mNone = mean(hNone);
  const mPump = mean(hPump);
  assert.ok(mPump < mNone, `pumped ${mPump} vs unpumped ${mNone}`);
  const rb = card.R_bright_per_us.value;
  const rd = card.R_dark_per_us.value;
  const tBright = -Math.expm1(-g * tau) / g;
  const expected = rb * tBright + rd * (tau - tBright);
  const sd = Math.sqrt(hPump.reduce((s, c, n) => s + c * (n - mPump) ** 2, 0) / (N - 1));
  assert.ok(Math.abs(mPump - expected) < 4 * sd / Math.sqrt(N), `pumped mean ${mPump} vs ${expected}`);
});

// Catches: fails if the switch-time integral is missing the g factor or the e^{-g t}
// survival weight (the belief pmf would no longer sum to 1), or if large counts overflow in
// linear space (logLik(500, bit) must be finite).
test('belief pmf sums to 1 with strong pumping and large counts stay finite', () => {
  const p = withParams({ gamma_bright_to_dark_per_us: 0.01, gamma_dark_to_bright_per_us: 0.005 });
  for (const tau of [10, 500]) {
    const ro = createIonReadout(p, tau);
    const nMax = Math.ceil(0.472 * tau + 10 * Math.sqrt(0.472 * tau) + 10);
    for (const bit of [0, 1]) {
      let s = 0;
      for (let n = 0; n <= nMax; n++) s += Math.exp(ro.logLik(n, bit));
      assert.ok(Math.abs(s - 1) < 1e-9, `tau=${tau}, bit=${bit}: sum ${s}`);
      assert.ok(Number.isFinite(ro.logLik(500, bit)), `tau=${tau}, bit=${bit}: logLik(500)`);
    }
    assert.ok(Number.isFinite(ro.llr(500)));
  }
});

// Catches: fails if idleFlipProbability uses tau/T1 without the 1/2 or the exponential:
// it must be 0.5 (1 - exp(-tau / T1_idle)). Crosstalk is set to 0 (the card's rate is not).
test('idleFlipProbability = 0.5 (1 - exp(-tau / T1))', () => {
  for (const tau of [1, 500]) {
    const ro = createIonReadout(withParams({ crosstalk_rate_per_us: 0 }), tau);
    const expected = 0.5 * (1 - Math.exp(-tau / card.T1_idle_us.value));
    assert.ok(Math.abs(ro.idleFlipProbability() - expected) < 1e-15);
  }
});

// Catches: fails if a missing or non-finite parameter is accepted silently (it would turn
// into NaN rates) or the error does not name the field.
test('invalid parameters throw an error naming the field', () => {
  for (const name of ['R_bright_per_us', 'R_dark_per_us', 'gamma_bright_to_dark_per_us',
    'gamma_dark_to_bright_per_us', 'T1_idle_us']) {
    const missing = { ...card };
    delete missing[name];
    assert.throws(() => createIonReadout(missing, 10), new RegExp(name));
    assert.throws(() => createIonReadout(withParams({ [name]: { value: NaN } }), 10), new RegExp(name));
  }
  assert.throws(() => createIonReadout(withParams({ bright_is_bit: 2 }), 10), /bright_is_bit/);
  assert.throws(() => createIonReadout(card, Infinity), /tau/);
  assert.doesNotThrow(() => createIonReadout(card, 10));
});

// V14 (idle physics per basis and crosstalk). xorP is restated here so a change in graph.js
// cannot hide a change in ion.js.
const xor = (a, b) => a + b - 2 * a * b;
const half = (x) => 0.5 * (1 - Math.exp(-x));
// The card as before CC-A13: no T2_idle_us, no crosstalk fields.
const cardV1 = { ...card };
delete cardV1.T2_idle_us;
delete cardV1.crosstalk_rate_per_us;
delete cardV1.crosstalk_scan_per_us;

// Catches (V14): fails if the Z basis uses T2, the X basis uses T1, the crosstalk term is
// missing its 1/2 or exponential, or the parts are added instead of combined with xorP:
// Z = xorP(pT1, pXt), X = xorP(pT2, pXt), pXt = 0.5 (1 - e^{-Gamma tau}), at three tau values.
test('V14: idle formulas per basis with crosstalk at three tau values', () => {
  const t1 = 400;
  const t2 = 150;
  const g = 2e-3;
  const p = withParams({ T1_idle_us: t1, T2_idle_us: t2, crosstalk_rate_per_us: g });
  for (const tau of [1, 50, 500]) {
    const ro = createIonReadout(p, tau);
    const pXt = half(g * tau);
    const z = xor(half(tau / t1), pXt);
    const x = xor(half(tau / t2), pXt);
    assert.ok(Math.abs(ro.idleFlipProbability() - z) < 1e-14, `tau=${tau}: Z default`);
    assert.ok(Math.abs(ro.idleFlipProbability('Z') - z) < 1e-14, `tau=${tau}: Z`);
    assert.ok(Math.abs(ro.idleFlipProbability('X') - x) < 1e-14, `tau=${tau}: X`);
    const bz = ro.idleBreakdown('Z');
    assert.ok(Math.abs(bz.idle - half(tau / t1)) < 1e-14 && Math.abs(bz.crosstalk - pXt) < 1e-14);
    assert.ok(Math.abs(ro.idleBreakdown('X').idle - half(tau / t2)) < 1e-14);
  }
  assert.throws(() => createIonReadout(p, 10).idleFlipProbability('Y'), /basis/);
});

// Catches (V14): fails if basis "Z" with no crosstalk differs in any bit from the old value
// -0.5 expm1(-tau / T1) (V9 and every Z-basis naive number depend on it), or if an absent
// T2_idle_us does not default to 2 T1 (X then sees 0.5 (1 - e^{-tau / (2 T1)})).
test('V14: basis Z with crosstalk 0 equals the old idle value exactly; T2 defaults to 2 T1', () => {
  const t1 = card.T1_idle_us.value;
  for (const tau of [1, 30, 500]) {
    const ro = createIonReadout(cardV1, tau);
    const old = -0.5 * Math.expm1(-tau / t1);
    assert.equal(ro.idleFlipProbability(), old);
    assert.equal(ro.idleFlipProbability('Z'), old);
    assert.deepEqual(ro.idleBreakdown(), { idle: old, crosstalk: 0, total: old });
    assert.equal(ro.idleFlipProbability('X'), -0.5 * Math.expm1(-tau / (2 * t1)));
  }
});

// Boundary (V14). Catches: fails if T2 = 2 T1 is rejected (>= instead of >) or a T2 a relative
// 1e-9 above 2 T1 is accepted; the error must name both values.
test('V14: T2 = 2 T1 accepted, T2 = 2 T1 (1 + 1e-9) rejected', () => {
  const t1 = 1000;
  assert.doesNotThrow(() => createIonReadout(withParams({ T1_idle_us: t1, T2_idle_us: 2 * t1 }), 10));
  const bad = 2 * t1 * (1 + 1e-9);
  assert.throws(() => createIonReadout(withParams({ T1_idle_us: t1, T2_idle_us: bad }), 10),
    (e) => /T2_idle_us/.test(e.message) && e.message.includes(String(bad)) && e.message.includes(String(2 * t1)));
  assert.throws(() => createIonReadout(withParams({ T2_idle_us: { value: NaN } }), 10), /T2_idle_us/);
  assert.throws(() => createIonReadout(withParams({ crosstalk_rate_per_us: -1 }), 10), /crosstalk/);
});

// Catches (V14): fails if the crosstalk rate is ignored (from the card or from the
// { crosstalkRate } override) or the override does not take precedence over the card: rate 0
// against 1e-3 /us must change the total in both bases, by exactly the xorP rule.
test('V14: crosstalk 0 vs 1e-3 /us changes the total; the override beats the card', () => {
  const tau = 100;
  const p0 = createIonReadout(cardV1, tau);
  const pCard = createIonReadout(withParams({ crosstalk_rate_per_us: 1e-3 }), tau);
  const pOver = createIonReadout(withParams({ crosstalk_rate_per_us: 1e-5 }), tau, { crosstalkRate: 1e-3 });
  const pOff = createIonReadout(withParams({ crosstalk_rate_per_us: 1e-3 }), tau, { crosstalkRate: 0 });
  const p0card = createIonReadout(withParams({ crosstalk_rate_per_us: 0 }), tau);
  const pXt = half(1e-3 * tau);
  for (const basis of ['Z', 'X']) {
    assert.ok(pCard.idleFlipProbability(basis) > p0.idleFlipProbability(basis) + 0.01, basis);
    assert.equal(pOver.idleFlipProbability(basis), pCard.idleFlipProbability(basis));
    assert.equal(pOff.idleFlipProbability(basis), p0card.idleFlipProbability(basis));
    assert.ok(Math.abs(pCard.idleFlipProbability(basis) - xor(p0card.idleFlipProbability(basis), pXt)) < 1e-15);
  }
});

// Catches (V14): fails if the idleBreakdown parts are not the ones combined into the total
// (for example total = idle + crosstalk, or the breakdown reports the other basis).
test('V14: idleBreakdown parts recombine with xorP into total', () => {
  const p = withParams({ T1_idle_us: 300, T2_idle_us: 200, crosstalk_rate_per_us: 5e-3 });
  for (const tau of [2, 40, 400]) {
    const ro = createIonReadout(p, tau);
    for (const basis of ['Z', 'X']) {
      const { idle, crosstalk, total } = ro.idleBreakdown(basis);
      assert.ok(crosstalk > 0 && idle > 0);
      assert.ok(Math.abs(xor(idle, crosstalk) - total) < 1e-15, `tau=${tau}, ${basis}`);
      assert.equal(total, ro.idleFlipProbability(basis));
      assert.ok(total < idle + crosstalk, 'xorP, not a sum');
    }
  }
});
