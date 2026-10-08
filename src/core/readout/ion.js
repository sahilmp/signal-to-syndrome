// Trapped-ion fluorescence readout. A detection window of length tau counts photons from
// an ion that is bright or dark; during the window the ion can be pumped once into the
// other state (at most one switch). The truth sampler draws that process exactly; the
// belief model (logLik, llr, threshold, assignment error) integrates over the switch time.

import { logIntegrate } from '../quadrature.js';

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

// ln Gamma(x) for x > 0 (Lanczos, g = 7, n = 9; reflection below 0.5).
function lgamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  const z = x - 1;
  let a = LANCZOS[0];
  const t = z + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

// ln Pois(n; lambda), with the lambda = 0 limit handled.
function logPois(n, lambda) {
  if (lambda === 0) return n === 0 ? 0 : -Infinity;
  return n * Math.log(lambda) - lambda - lgamma(n + 1);
}

function logAddExp(a, b) {
  if (a === -Infinity) return b;
  if (b === -Infinity) return a;
  const m = Math.max(a, b);
  return m + Math.log(Math.exp(a - m) + Math.exp(b - m));
}

// Parameter cards store { value, source }; plain numbers are accepted too.
function field(params, name) {
  const p = params[name];
  const v = p !== null && typeof p === 'object' && 'value' in p ? p.value : p;
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`createIonReadout: ${name} must be a finite number, got ${v}`);
  }
  return v;
}

const QUAD_N = 128;

export function createIonReadout(params, tau) {
  if (params === null || typeof params !== 'object') throw new Error('createIonReadout: params must be an object');
  const rBright = field(params, 'R_bright_per_us');
  const rDark = field(params, 'R_dark_per_us');
  const gB2D = field(params, 'gamma_bright_to_dark_per_us');
  const gD2B = field(params, 'gamma_dark_to_bright_per_us');
  const t1 = field(params, 'T1_idle_us');
  const brightBit = params.bright_is_bit;
  if (brightBit !== 0 && brightBit !== 1) throw new Error(`createIonReadout: bright_is_bit must be 0 or 1, got ${brightBit}`);
  if (typeof tau !== 'number' || !Number.isFinite(tau) || !(tau > 0)) {
    throw new Error(`createIonReadout: tau must be a positive finite number, got ${tau}`);
  }
  for (const [name, v] of [['R_bright_per_us', rBright], ['R_dark_per_us', rDark],
    ['gamma_bright_to_dark_per_us', gB2D], ['gamma_dark_to_bright_per_us', gD2B]]) {
    if (v < 0) throw new Error(`createIonReadout: ${name} must be >= 0, got ${v}`);
  }
  if (!(t1 > 0)) throw new Error(`createIonReadout: T1_idle_us must be > 0, got ${t1}`);

  const darkBit = 1 - brightBit;

  // Initial rate, final rate and switch rate for a true bit.
  function dynamics(bit) {
    return bit === brightBit
      ? { ri: rBright, rf: rDark, g: gB2D }
      : { ri: rDark, rf: rBright, g: gD2B };
  }

  function sampleCount(bit, rng) {
    const { ri, rf, g } = dynamics(bit);
    if (g > 0) {
      const t = rng.exponential(g);
      if (t < tau) return rng.poisson(ri * t + rf * (tau - t));
    }
    return rng.poisson(ri * tau);
  }

  // Belief log-likelihood ln p(n | bit), integrating over the switch time in log space.
  const logLikCache = [new Map(), new Map()];
  function logLik(n, bit) {
    const cache = logLikCache[bit];
    const hit = cache.get(n);
    if (hit !== undefined) return hit;
    const { ri, rf, g } = dynamics(bit);
    const noSwitch = -g * tau + logPois(n, ri * tau);
    let v = noSwitch;
    if (g > 0) {
      const logG = Math.log(g);
      const integral = logIntegrate(
        (t) => logG - g * t + logPois(n, ri * t + rf * (tau - t)), 0, tau, QUAD_N);
      v = logAddExp(noSwitch, integral);
    }
    cache.set(n, v);
    return v;
  }

  function llr(n) {
    return logLik(n, 1) - logLik(n, 0);
  }

  // Belief-model pmfs on n = 0..nMax, then the threshold minimizing the average error
  // 0.5 [P(n <= nTh | bright) + P(n > nTh | dark)].
  const nMax = Math.ceil(rBright * tau + 10 * Math.sqrt(rBright * tau) + 10);
  const pmfBright = new Float64Array(nMax + 1);
  const pmfDark = new Float64Array(nMax + 1);
  for (let n = 0; n <= nMax; n++) {
    pmfBright[n] = Math.exp(logLik(n, brightBit));
    pmfDark[n] = Math.exp(logLik(n, darkBit));
  }
  // errAt[k] = belief error for threshold k (k = 0..nMax).
  const errAt = new Float64Array(nMax + 1);
  {
    const tailDark = new Float64Array(nMax + 2); // tailDark[k] = sum_{n >= k} pmfDark[n]
    for (let n = nMax; n >= 0; n--) tailDark[n] = tailDark[n + 1] + pmfDark[n];
    let cdfBright = 0;
    for (let k = 0; k <= nMax; k++) {
      cdfBright += pmfBright[k];
      errAt[k] = 0.5 * (cdfBright + tailDark[k + 1]);
    }
  }
  let nTh = 0;
  for (let k = 1; k <= nMax; k++) if (errAt[k] < errAt[nTh]) nTh = k;

  return {
    measure(trueBit, rng) {
      if (trueBit !== 0 && trueBit !== 1) throw new Error(`measure: trueBit must be 0 or 1, got ${trueBit}`);
      const n = sampleCount(trueBit, rng);
      return { hard: n > nTh ? brightBit : darkBit, llr: llr(n), n };
    },
    logLik,
    llr,
    threshold() {
      return nTh;
    },
    idleFlipProbability() {
      return -0.5 * Math.expm1(-tau / t1);
    },
    averageAssignmentError() {
      return errAt[nTh];
    },
    // h[n] = number of the nSamples draws that gave n photons.
    countHistogram(bit, nSamples, rng) {
      const h = [];
      for (let s = 0; s < nSamples; s++) {
        const n = sampleCount(bit, rng);
        while (h.length <= n) h.push(0);
        h[n]++;
      }
      return h;
    },
  };
}
