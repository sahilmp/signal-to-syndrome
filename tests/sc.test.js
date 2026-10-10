import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScReadout } from '../src/core/readout/sc.js';
import { erfc } from '../src/core/special.js';
import { createRng } from '../src/core/rng.js';

// Test card (plain numbers; params/sc.json is not part of this task). chi/2pi = 1 MHz,
// kappa = 2 chi, nbar = 1, eta = 0.15: |delta alpha| = sqrt(2), SNR = 2.75 sqrt(tau / us),
// small enough that the assignment error stays measurable over 0.05-20 us.
const BASE = {
  chi_over_2pi_MHz: 1,
  kappa_over_2pi_MHz: 2,
  nbar: 1,
  eta: 0.15,
  T1_us: 1e12,
  detection: 'heterodyne',
  ringup: false,
};
const card = (over = {}) => ({ ...BASE, ...over });

const GRID = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20];

// Catches (V8): fails if the noise sigma, the gain c sqrt(eta kappa) / tau, the projection on
// u_hat or the midpoint threshold is wrong, so the simulated Gaussian readout does not give
// 0.5 erfc(SNR / (2 sqrt 2)). Tolerance: 4 binomial standard errors, sqrt(p (1 - p) / n),
// n = 200 000 (100 000 per bit, alternating). T1 = 1e12 us makes decays negligible.
test('V8: Gaussian assignment error equals 0.5 erfc(SNR / (2 sqrt 2))', () => {
  const ro = createScReadout(card(), 0.8);
  const snr = ro.snr();
  const p = 0.5 * erfc(snr / (2 * Math.SQRT2));
  assert.ok(p > 0.05 && p < 0.2, `test point should have a measurable error, p = ${p}`);
  assert.ok(Math.abs(ro.averageAssignmentError() - p) < 1e-9);
  const rng = createRng(20261008);
  const n = 200000;
  let wrong = 0;
  for (let k = 0; k < n; k++) {
    const bit = k & 1;
    if (ro.measure(bit, rng).hard !== bit) wrong++;
  }
  const se = Math.sqrt((p * (1 - p)) / n);
  assert.ok(Math.abs(wrong / n - p) < 4 * se, `empirical ${wrong / n}, expected ${p} +/- ${4 * se}`);
});

// Catches: fails if snr() and the simulated means disagree (a missing factor c, sqrt(eta),
// sqrt(kappa) or sqrt(tau), or chi and kappa left in MHz instead of rad/us), for both
// detection modes.
test('without ring-up (mu1 - mu0) / sigma equals snr()', () => {
  for (const detection of ['heterodyne', 'homodyne']) {
    for (const tau of [0.05, 1, 7]) {
      const ro = createScReadout(card({ detection }), tau);
      const { mu0, mu1, sigma } = ro.means();
      assert.ok(Math.abs((mu1 - mu0) / sigma - ro.snr()) < 1e-9, `${detection}, tau = ${tau}`);
    }
  }
  // Closed form: c |delta alpha| sqrt(eta kappa tau) with |delta alpha| = sqrt(2) here.
  const kappa = 2 * Math.PI * 2;
  const tau = 1;
  assert.ok(Math.abs(createScReadout(card(), tau).snr() - Math.SQRT2 * Math.SQRT2 * Math.sqrt(0.15 * kappa * tau)) < 1e-12);
  assert.ok(Math.abs(createScReadout(card({ detection: 'homodyne' }), tau).snr() - 2 * Math.SQRT2 * Math.sqrt(0.15 * kappa * tau)) < 1e-12);
});

// Catches (non-vacuous pair): fails if T1 decay is not in the belief error (then the T1 = 20
// curve would decrease monotonically, like the T1 = 1e12 one) or if the error does not fall
// with SNR (then the T1 = 1e12 curve would not decrease).
test('U-curve with T1 = 20 us; monotone decrease with T1 = 1e12 us', () => {
  const errU = GRID.map((tau) => createScReadout(card({ T1_us: 20 }), tau).averageAssignmentError());
  let iMin = 0;
  for (let i = 1; i < GRID.length; i++) if (errU[i] < errU[iMin]) iMin = i;
  assert.ok(iMin > 0 && iMin < GRID.length - 1, `minimum at the edge: ${errU}`);
  assert.ok(errU[iMin] < errU[0] && errU[iMin] < errU[GRID.length - 1]);

  const errMono = GRID.map((tau) => createScReadout(card(), tau).averageAssignmentError());
  for (let i = 1; i < GRID.length; i++) {
    assert.ok(errMono[i] < errMono[i - 1], `not decreasing at tau = ${GRID[i]}: ${errMono}`);
  }
});

// Catches: fails if the drive is not scaled to |alpha_ss|^2 = nbar for every kappa or the
// dispersive sign enters the steady state wrongly; kappa |delta alpha|^2 = 4 chi^2 nbar kappa
// / (kappa^2 / 4 + chi^2) peaks at kappa = 2 chi. It is read from snr()^2 / (c^2 eta tau).
test('kappa |delta alpha|^2 peaks at kappa = 2 chi at fixed nbar', () => {
  const tau = 1;
  const sep = (ratio) => {
    const ro = createScReadout(card({ kappa_over_2pi_MHz: ratio * BASE.chi_over_2pi_MHz }), tau);
    return ro.snr() ** 2 / (2 * BASE.eta * tau);
  };
  const at2 = sep(2);
  assert.ok(at2 > sep(1.9));
  assert.ok(at2 > sep(2.1));
  const chi = 2 * Math.PI;
  assert.ok(Math.abs(at2 - 4 * chi * chi * BASE.nbar * (2 * chi) / (2 * chi * chi)) < 1e-9);
});

// Catches (V10): fails if the llr is miscalibrated (wrong sign, missing decay integral,
// wrong noise sigma). With ring-up off the belief equals the truth, so among samples with
// |llr| in [1, 2) the MAP decision (llr > 0) is wrong with probability 1/(1 + e^{|llr|}).
// Tolerance: 4 standard errors of the count, sqrt(sum q_i (1 - q_i)) / n. Equal priors
// (alternating bits), T1 = 5 us, tau = 1 us, so decays shape the likelihood.
test('V10: llr is calibrated in the bin |llr| in [1, 2)', () => {
  const ro = createScReadout(card({ T1_us: 5 }), 1);
  const rng = createRng(77);
  let n = 0;
  let wrong = 0;
  let sumQ = 0;
  let sumVar = 0;
  for (let k = 0; k < 200000; k++) {
    const bit = k & 1;
    const { llr } = ro.measure(bit, rng);
    const a = Math.abs(llr);
    if (a < 1 || a >= 2) continue;
    const q = 1 / (1 + Math.exp(a));
    n++;
    sumQ += q;
    sumVar += q * (1 - q);
    if ((llr > 0 ? 1 : 0) !== bit) wrong++;
  }
  assert.ok(n > 10000, `bin too small: ${n}`);
  const se = Math.sqrt(sumVar) / n;
  assert.ok(Math.abs(wrong / n - sumQ / n) < 4 * se, `observed ${wrong / n}, predicted ${sumQ / n} +/- ${4 * se}`);
});

// Catches: fails if the decay integral in logLik(s, 1) is wrong (integration window cut at
// the wrong place, wrong T1 weight or slope). Reference: the closed form
// integral_0^tau (e^{-t/T1}/T1) N(s; a + b t, sigma) dt
//   = (1/(b T1)) e^{-t0/T1 + st^2/(2 T1^2)} [Phi((tau - t0')/st) - Phi(-t0'/st)],
// t0 = (s - a)/b, st = sigma/b, t0' = t0 - st^2/T1.
test('belief logLik(s, 1) matches the closed-form decay integral', () => {
  const t1 = 3;
  const tau = 2;
  const ro = createScReadout(card({ T1_us: t1 }), tau);
  const { mu0ss: a, mu1ss, sigma } = ro.means();
  const b = (mu1ss - a) / tau;
  const phi = (x) => 0.5 * erfc(-x / Math.SQRT2);
  for (const s of [a - 1, a, (a + mu1ss) / 2, mu1ss, mu1ss + 1]) {
    const t0 = (s - a) / b;
    const st = sigma / b;
    const t0p = t0 - (st * st) / t1;
    const integral = (1 / (b * t1)) * Math.exp(-t0 / t1 + (st * st) / (2 * t1 * t1))
      * (phi((tau - t0p) / st) - phi(-t0p / st));
    const noDecay = Math.exp(-tau / t1) * Math.exp(-((s - mu1ss) ** 2) / (2 * sigma * sigma)) / (sigma * Math.sqrt(2 * Math.PI));
    const ref = Math.log(noDecay + integral);
    assert.ok(Math.abs(ro.logLik(s, 1) - ref) < 1e-9, `s = ${s}: ${ro.logLik(s, 1)} vs ${ref}`);
  }
});

// Catches: fails if the ring-up or post-decay field equations are wrong: a decay at t_d = 0
// must give the bit-0 mean (the field starts at 0 and follows the bit-0 equation), a decay at
// t_d = tau the bit-1 mean, and ring-up must cost signal ((mu1 - mu0)/sigma < snr()).
// Without ring-up the decay mean is linear in t_d.
test('decay mean: endpoints with ring-up, linear without', () => {
  const tau = 0.5;
  const up = createScReadout(card({ ringup: true }), tau);
  const m = up.means();
  assert.ok(Math.abs(up.decayMean(0) - m.mu0) < 1e-12);
  assert.ok(Math.abs(up.decayMean(tau) - m.mu1) < 1e-12);
  assert.ok((m.mu1 - m.mu0) / m.sigma < up.snr());

  const flat = createScReadout(card(), tau);
  const f = flat.means();
  for (const td of [0.1, 0.25, 0.37]) {
    assert.ok(Math.abs(flat.decayMean(td) - (f.mu0 + (f.mu1 - f.mu0) * td / tau)) < 1e-12);
  }
});

// Catches: fails if the idle flip probability uses tau / (2 T1), drops the 1/2 or uses 1 - e^{-tau}.
test('idleFlipProbability at tau = T1 equals 0.5 (1 - e^{-1})', () => {
  const ro = createScReadout(card({ T1_us: 30 }), 30);
  assert.ok(Math.abs(ro.idleFlipProbability() - 0.5 * (1 - Math.exp(-1))) < 1e-15);
});

// Catches: fails if iqSamples returns the wrong shape, centres the states on the wrong
// side of the threshold, or uses a noise other than sigma. Tolerances: 4 SE of a mean
// (sigma / sqrt(n)) and of a standard deviation (about sigma / sqrt(2 n)).
test('iqSamples: shape, centres and spread', () => {
  const ro = createScReadout(card(), 1);
  const { mu0, sigma } = ro.means();
  const n = 20000;
  const s0 = ro.iqSamples(0, n, createRng(5));
  assert.equal(s0.length, n);
  const meanI = s0.reduce((t, p) => t + p.i, 0) / n;
  const meanQ = s0.reduce((t, p) => t + p.q, 0) / n;
  const sdQ = Math.sqrt(s0.reduce((t, p) => t + (p.q - meanQ) ** 2, 0) / n);
  assert.ok(Math.abs(meanI - mu0) < 4 * sigma / Math.sqrt(n));
  assert.ok(Math.abs(sdQ - sigma) < 4 * sigma / Math.sqrt(2 * n));
  const s1 = ro.iqSamples(1, n, createRng(6));
  const meanI1 = s1.reduce((t, p) => t + p.i, 0) / n;
  const meanQ1 = s1.reduce((t, p) => t + p.q, 0) / n;
  assert.ok(meanI1 > meanI);
  // Both steady states share Q in the projected frame (delta alpha lies along u_hat).
  assert.ok(Math.abs(meanQ1 - meanQ) < 8 * sigma / Math.sqrt(n));
});

// Catches: fails if bad parameters are accepted silently.
test('createScReadout rejects invalid parameters', () => {
  assert.throws(() => createScReadout(card(), 0));
  assert.throws(() => createScReadout(card({ detection: 'photon' }), 1));
  assert.throws(() => createScReadout(card({ ringup: 'yes' }), 1));
  assert.throws(() => createScReadout(card({ eta: 1.5 }), 1));
  assert.throws(() => createScReadout(card({ chi_over_2pi_MHz: 0 }), 1));
  assert.doesNotThrow(() => createScReadout({ ...card(), nbar: { value: 2, source: 'x' } }, 1));
});

// V14 (idle physics per basis; no crosstalk on the superconducting model).
const half = (x) => 0.5 * (1 - Math.exp(-x));

// Catches (V14): fails if the Z basis uses T2 or the X basis uses T1, or a crosstalk term
// leaks in: Z = 0.5 (1 - e^{-tau/T1}), X = 0.5 (1 - e^{-tau/T2}), crosstalk 0, at three taus.
test('V14: idle formulas per basis at three tau values, crosstalk 0', () => {
  const t1 = 60;
  const t2 = 45;
  for (const tau of [0.1, 1, 30]) {
    const ro = createScReadout(card({ T1_us: t1, T2_us: t2 }), tau);
    assert.ok(Math.abs(ro.idleFlipProbability() - half(tau / t1)) < 1e-15, `tau=${tau}: Z default`);
    assert.ok(Math.abs(ro.idleFlipProbability('Z') - half(tau / t1)) < 1e-15, `tau=${tau}: Z`);
    assert.ok(Math.abs(ro.idleFlipProbability('X') - half(tau / t2)) < 1e-15, `tau=${tau}: X`);
    for (const basis of ['Z', 'X']) {
      const b = ro.idleBreakdown(basis);
      assert.equal(b.crosstalk, 0);
      assert.equal(b.total, b.idle);
      assert.equal(b.total, ro.idleFlipProbability(basis));
    }
  }
  assert.throws(() => createScReadout(card(), 1).idleBreakdown('Y'), /basis/);
});

// Catches (V14): fails if basis "Z" differs in any bit from the old value -0.5 expm1(-tau/T1)
// (every Z-basis superconducting number depends on it), or an absent T2_us does not default
// to 2 T1.
test('V14: basis Z equals the old idle value exactly; T2 defaults to 2 T1', () => {
  for (const tau of [0.05, 1, 3]) {
    const ro = createScReadout(card({ T1_us: 50 }), tau);
    const old = -0.5 * Math.expm1(-tau / 50);
    assert.equal(ro.idleFlipProbability(), old);
    assert.deepEqual(ro.idleBreakdown(), { idle: old, crosstalk: 0, total: old });
    assert.equal(ro.idleFlipProbability('X'), -0.5 * Math.expm1(-tau / 100));
  }
});

// Boundary (V14). Catches: fails if T2 = 2 T1 is rejected or T2 = 2 T1 (1 + 1e-9) accepted;
// the error must name both values.
test('V14: T2 = 2 T1 accepted, T2 = 2 T1 (1 + 1e-9) rejected', () => {
  assert.doesNotThrow(() => createScReadout(card({ T1_us: 50, T2_us: 100 }), 1));
  const bad = 100 * (1 + 1e-9);
  assert.throws(() => createScReadout(card({ T1_us: 50, T2_us: bad }), 1),
    (e) => /T2_us/.test(e.message) && e.message.includes(String(bad)) && e.message.includes('100'));
  assert.throws(() => createScReadout(card({ T2_us: NaN }), 1), /T2_us/);
});
