// Superconducting dispersive readout. A resonator driven at the bare frequency rings up to a
// coherent state alpha_b that depends on the qubit bit b (dispersive shift s_b chi, s_b = -1
// for bit 0, +1 for bit 1). The output field is integrated for tau and projected onto the
// axis that separates the two steady states. A |1> qubit can decay to |0> during the window
// (T1); the field then relaxes towards the bit-0 steady state. The truth sampler follows the
// field (optionally with ring-up); the belief model ignores ring-up and assumes a signal
// mean that moves linearly from mu1 to mu0 with the decay time.

import { logIntegrate, integrate } from '../quadrature.js';
import { erfc, normalLogPdf } from '../special.js';

const TABLE_N = 256;
const QUAD_N = 64;
// The belief integral over the decay time is restricted to where its log-integrand is
// within LOG_DROP of its maximum; the neglected mass is below e^{-LOG_DROP} of the total.
const LOG_DROP = 46;
// Panels for the assignment-error integral over the decay time (a step of width tau / SNR).
const ERR_PANELS = 128;
const ERR_NODES = 16;

// Complex numbers as [re, im].
const cadd = (a, b) => [a[0] + b[0], a[1] + b[1]];
const csub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const cscale = (a, k) => [a[0] * k, a[1] * k];
const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cconj = (a) => [a[0], -a[1]];
const cabs = (a) => Math.hypot(a[0], a[1]);
function cdiv(a, b) {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
}
// e^{-z t}
function cexpNeg(z, t) {
  const m = Math.exp(-z[0] * t);
  return [m * Math.cos(z[1] * t), -m * Math.sin(z[1] * t)];
}
// (1 - e^{-z t}) / z = integral_0^t e^{-z s} ds
function decayIntegral(z, t) {
  return cdiv(csub([1, 0], cexpNeg(z, t)), z);
}

function logAddExp(a, b) {
  if (a === -Infinity) return b;
  if (b === -Infinity) return a;
  const m = Math.max(a, b);
  return m + Math.log(Math.exp(a - m) + Math.exp(b - m));
}

// Parameter cards store { value, source }; plain values are accepted too.
function raw(params, name) {
  const p = params[name];
  return p !== null && typeof p === 'object' && 'value' in p ? p.value : p;
}
function field(params, name) {
  const v = raw(params, name);
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`createScReadout: ${name} must be a finite number, got ${v}`);
  }
  return v;
}

export function createScReadout(params, tau) {
  if (params === null || typeof params !== 'object') throw new Error('createScReadout: params must be an object');
  const chi = 2 * Math.PI * field(params, 'chi_over_2pi_MHz');
  const kappa = 2 * Math.PI * field(params, 'kappa_over_2pi_MHz');
  const nbar = field(params, 'nbar');
  const eta = field(params, 'eta');
  const t1 = field(params, 'T1_us');
  const t2 = raw(params, 'T2_us') === undefined ? 2 * t1 : field(params, 'T2_us');
  const detection = raw(params, 'detection');
  const ringup = raw(params, 'ringup');
  if (!(chi > 0)) throw new Error(`createScReadout: chi_over_2pi_MHz must be > 0, got ${chi / (2 * Math.PI)}`);
  if (!(kappa > 0)) throw new Error(`createScReadout: kappa_over_2pi_MHz must be > 0, got ${kappa / (2 * Math.PI)}`);
  if (!(nbar > 0)) throw new Error(`createScReadout: nbar must be > 0, got ${nbar}`);
  if (!(eta > 0 && eta <= 1)) throw new Error(`createScReadout: eta must be in (0, 1], got ${eta}`);
  if (!(t1 > 0)) throw new Error(`createScReadout: T1_us must be > 0, got ${t1}`);
  if (!(t2 > 0)) throw new Error(`createScReadout: T2_us must be > 0, got ${t2}`);
  if (t2 > 2 * t1) throw new Error(`createScReadout: T2_us = ${t2} exceeds 2 * T1_us = ${2 * t1}`);
  if (detection !== 'heterodyne' && detection !== 'homodyne') {
    throw new Error(`createScReadout: detection must be "heterodyne" or "homodyne", got ${detection}`);
  }
  if (ringup !== true && ringup !== false) throw new Error(`createScReadout: ringup must be true or false, got ${ringup}`);
  if (typeof tau !== 'number' || !Number.isFinite(tau) || !(tau > 0)) {
    throw new Error(`createScReadout: tau must be a positive finite number, got ${tau}`);
  }

  const c = detection === 'heterodyne' ? Math.SQRT2 : 2;
  // Real drive with |alpha_ss|^2 = nbar for both bits.
  const epsD = Math.sqrt(nbar * (kappa * kappa / 4 + chi * chi));
  const lambda = [[kappa / 2, -chi], [kappa / 2, chi]]; // kappa/2 + i s_b chi
  const alphaSs = [cdiv([epsD, 0], lambda[0]), cdiv([epsD, 0], lambda[1])];
  const dAlpha = csub(alphaSs[1], alphaSs[0]);
  const dAlphaAbs = cabs(dAlpha);
  const uConj = cconj(cscale(dAlpha, 1 / dAlphaAbs));
  const gain = c * Math.sqrt(eta * kappa) / tau;
  const sigma = 1 / Math.sqrt(tau);

  // Complex mean (projected frame: real part along u_hat) from the field integral over [0, tau].
  const project = (fieldIntegral) => cscale(cmul(fieldIntegral, uConj), gain);

  // Field integral over [0, tau] for bit b without decay.
  function integralNoDecay(b) {
    if (!ringup) return cscale(alphaSs[b], tau);
    // alpha_b(t) = alpha_ss_b (1 - e^{-lambda_b t})
    return cmul(alphaSs[b], csub([tau, 0], decayIntegral(lambda[b], tau)));
  }
  // Field integral over [0, tau] for bit 1 decaying at td (0 <= td <= tau).
  function integralDecay(td) {
    if (!ringup) return cadd(cscale(alphaSs[1], td), cscale(alphaSs[0], tau - td));
    const before = cmul(alphaSs[1], csub([td, 0], decayIntegral(lambda[1], td)));
    const alphaTd = cmul(alphaSs[1], csub([1, 0], cexpNeg(lambda[1], td)));
    // alpha(t) = alpha_ss_0 + (alpha_1(td) - alpha_ss_0) e^{-lambda_0 (t - td)} for t >= td
    const after = cadd(cscale(alphaSs[0], tau - td),
      cmul(csub(alphaTd, alphaSs[0]), decayIntegral(lambda[0], tau - td)));
    return cadd(before, after);
  }

  const m0 = project(integralNoDecay(0));
  const m1 = project(integralNoDecay(1));
  const mu0 = m0[0];
  const mu1 = m1[0];
  const threshold = (mu0 + mu1) / 2;
  const mu0ss = project(cscale(alphaSs[0], tau))[0];
  const mu1ss = project(cscale(alphaSs[1], tau))[0];

  // Complex decay mean at TABLE_N decay times td_k = k tau / (TABLE_N - 1).
  const tableRe = new Float64Array(TABLE_N);
  const tableIm = new Float64Array(TABLE_N);
  for (let k = 0; k < TABLE_N; k++) {
    const m = project(integralDecay((k * tau) / (TABLE_N - 1)));
    tableRe[k] = m[0];
    tableIm[k] = m[1];
  }
  function decayMeanComplex(td) {
    const x = Math.min(Math.max(td / tau, 0), 1) * (TABLE_N - 1);
    const k = Math.min(Math.floor(x), TABLE_N - 2);
    const f = x - k;
    return [tableRe[k] + f * (tableRe[k + 1] - tableRe[k]), tableIm[k] + f * (tableIm[k + 1] - tableIm[k])];
  }

  // Projected complex mean for one true-bit draw (bit 1 may decay during the window).
  function drawMean(bit, rng) {
    if (bit === 0) return m0;
    const td = rng.exponential(1 / t1);
    return td >= tau ? m1 : decayMeanComplex(td);
  }

  // Belief model. Decay at t gives the mean mu0ss + slope t, with slope = (mu1ss - mu0ss) / tau.
  const slope = (mu1ss - mu0ss) / tau;
  const logT1 = Math.log(t1);
  const noDecayLog = -tau / t1;
  // ln of integral_0^tau (e^{-t/T1} / T1) N(s; mu0ss + slope t, sigma) dt. The log-integrand
  // is the concave quadratic -A t^2 + B t + const, so its maximum and the region within
  // LOG_DROP of it are found exactly, and the quadrature runs only over that region.
  const A = (slope * slope) / (2 * sigma * sigma);
  function logDecayIntegral(s) {
    const logF = (t) => -t / t1 - logT1 + normalLogPdf(s, mu0ss + slope * t, sigma);
    const B = (slope * (s - mu0ss)) / (sigma * sigma) - 1 / t1;
    const tc = Math.min(Math.max(B / (2 * A), 0), tau);
    const dF = B - 2 * A * tc; // derivative at tc
    // Distance d from tc where A d^2 + g d = LOG_DROP, g = slope going away from tc (>= 0).
    const reach = (g) => (2 * LOG_DROP) / (g + Math.sqrt(g * g + 4 * A * LOG_DROP));
    const lo = Math.max(0, tc - reach(Math.max(0, dF)));
    const hi = Math.min(tau, tc + reach(Math.max(0, -dF)));
    if (!(hi > lo)) return logF(tc) + Math.log(Math.max(hi - lo, 0));
    return logIntegrate(logF, lo, hi, QUAD_N);
  }
  function logLik(s, bit) {
    if (bit === 0) return normalLogPdf(s, mu0ss, sigma);
    return logAddExp(noDecayLog + normalLogPdf(s, mu1ss, sigma), logDecayIntegral(s));
  }
  function llr(s) {
    return logLik(s, 1) - logLik(s, 0);
  }

  // Belief assignment error at the hard threshold: 0.5 [P(s <= th | 1) + P(s > th | 0)].
  // P(s > th | 0) is the normal tail; P(s <= th | 1) integrates the normal CDF of each
  // decay component over the decay time (panelled Gauss-Legendre).
  const phi = (x) => 0.5 * erfc(-x / Math.SQRT2); // standard normal CDF
  const err0 = 0.5 * erfc((threshold - mu0ss) / (sigma * Math.SQRT2));
  let err1 = Math.exp(noDecayLog) * phi((threshold - mu1ss) / sigma);
  const h = tau / ERR_PANELS;
  for (let p = 0; p < ERR_PANELS; p++) {
    err1 += integrate((t) => (Math.exp(-t / t1) / t1) * phi((threshold - mu0ss - slope * t) / sigma),
      p * h, (p + 1) * h, ERR_NODES);
  }
  const avgError = 0.5 * (err0 + err1);

  // Idle physics for a wait of tau (CLAUDE.md, "Idle errors"): T1 in the Z basis, T2 in the
  // X basis, no crosstalk.
  const pT1 = -0.5 * Math.expm1(-tau / t1);
  const pT2 = -0.5 * Math.expm1(-tau / t2);
  function idleBreakdown(basis = 'Z') {
    if (basis !== 'Z' && basis !== 'X') throw new Error(`idleBreakdown: basis must be "Z" or "X", got ${basis}`);
    const idle = basis === 'Z' ? pT1 : pT2;
    return { idle, crosstalk: 0, total: idle };
  }

  return {
    measure(trueBit, rng) {
      if (trueBit !== 0 && trueBit !== 1) throw new Error(`measure: trueBit must be 0 or 1, got ${trueBit}`);
      const s = drawMean(trueBit, rng)[0] + sigma * rng.normal();
      return { hard: s > threshold ? 1 : 0, llr: llr(s), s };
    },
    logLik,
    llr,
    // Truth (with ring-up if on) and belief (steady-state) means, noise and threshold.
    means() {
      return { mu0, mu1, mu0ss, mu1ss, sigma, threshold };
    },
    // Truth mean of the projected signal when bit 1 decays at td (table, linear interpolation).
    decayMean(td) {
      return decayMeanComplex(td)[0];
    },
    idleFlipProbability(basis = 'Z') {
      return idleBreakdown(basis).total;
    },
    idleBreakdown,
    averageAssignmentError() {
      return avgError;
    },
    snr() {
      return c * dAlphaAbs * Math.sqrt(eta * kappa * tau);
    },
    // IQ points in the projected frame (I along u_hat), noise sigma on both quadratures.
    iqSamples(bit, n, rng) {
      if (bit !== 0 && bit !== 1) throw new Error(`iqSamples: bit must be 0 or 1, got ${bit}`);
      const out = [];
      for (let k = 0; k < n; k++) {
        const m = drawMean(bit, rng);
        out.push({ i: m[0] + sigma * rng.normal(), q: m[1] + sigma * rng.normal() });
      }
      return out;
    },
  };
}
