// Seeded random numbers. Every function in src/core that draws random numbers
// takes an rng from createRng(seed); Math.random is never used.

// ln(n!) via the Lanczos approximation of ln Gamma(n + 1) (g = 7, n = 9).
const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];
function logFactorial(n) {
  const x = n; // ln Gamma(x + 1)
  let a = LANCZOS[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// The seed is reduced to a 32-bit unsigned integer (Math.trunc, then mod 2^32), so seeds
// that agree after that reduction (e.g. 1.5 and 1, or 2^32 + 1 and 1) give the same stream.
// Use integer seeds in 0..2^32-1.
export function createRng(seed) {
  if (!Number.isFinite(seed)) throw new Error(`createRng: seed must be a finite number, got ${seed}`);
  let state = Math.trunc(seed) >>> 0;
  let spareNormal = null;

  // mulberry32: uniform in [0, 1).
  function uniform() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Box-Muller; the second value of each pair is cached for the next call.
  function normal() {
    if (spareNormal !== null) {
      const z = spareNormal;
      spareNormal = null;
      return z;
    }
    const u1 = 1 - uniform(); // (0, 1], so the log is finite
    const u2 = uniform();
    const rad = Math.sqrt(-2 * Math.log(u1));
    const theta = 2 * Math.PI * u2;
    spareNormal = rad * Math.sin(theta);
    return rad * Math.cos(theta);
  }

  function exponential(rate) {
    if (!(rate > 0) || !Number.isFinite(rate)) throw new Error(`exponential: rate must be positive and finite, got ${rate}`);
    return -Math.log(1 - uniform()) / rate;
  }

  // Knuth's multiplication method; expected cost O(lambda), used for lambda < 30.
  function poissonKnuth(lambda) {
    const limit = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= uniform();
    } while (p > limit);
    return k - 1;
  }

  // PTRS: transformed rejection with squeeze (Hormann 1993), used for lambda >= 30.
  function poissonPtrs(lambda) {
    const slam = Math.sqrt(lambda);
    const loglam = Math.log(lambda);
    const b = 0.931 + 2.53 * slam;
    const a = -0.059 + 0.02483 * b;
    const invAlpha = 1.1239 + 1.1328 / (b - 3.4);
    const vr = 0.9277 - 3.6224 / (b - 2);
    for (;;) {
      const u = uniform() - 0.5;
      const v = uniform();
      const us = 0.5 - Math.abs(u);
      const k = Math.floor((2 * a / us + b) * u + lambda + 0.43);
      if (us >= 0.07 && v <= vr) return k;
      if (k < 0 || (us < 0.013 && v > us)) continue;
      if (Math.log(v) + Math.log(invAlpha) - Math.log(a / (us * us) + b)
          <= -lambda + k * loglam - logFactorial(k)) {
        return k;
      }
    }
  }

  function poisson(lambda) {
    if (!(lambda >= 0) || !Number.isFinite(lambda)) throw new Error(`poisson: lambda must be finite and >= 0, got ${lambda}`);
    if (lambda === 0) return 0;
    return lambda < 30 ? poissonKnuth(lambda) : poissonPtrs(lambda);
  }

  // Integer uniform on 0..n-1.
  function int(n) {
    if (!Number.isInteger(n) || n <= 0) throw new Error(`int: n must be a positive integer, got ${n}`);
    return Math.floor(uniform() * n);
  }

  return { uniform, normal, exponential, poisson, int };
}
