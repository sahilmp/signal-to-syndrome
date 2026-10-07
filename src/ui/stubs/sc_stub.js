// STUB for Person A's src/core/readout/sc.js: placeholder physics only.
// Signal mu0 = 0, mu1 = 4 sqrt(tau), noise sigma = 1, no decay during readout.
// Replaced through src/ui/bridge_core.js (H9).

const val = (p) => (p !== null && typeof p === 'object' && 'value' in p ? p.value : p);

// erfc via the Numerical Recipes erfcc approximation (fractional error < 1.2e-7).
function erfc(x) {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418
    + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587
    + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}

export function createScReadout(params, tau) {
  if (!(tau > 0)) throw new Error(`createScReadout: tau must be positive, got ${tau}`);
  const T1 = val(params.T1_us);
  const mu0 = 0;
  const mu1 = 4 * Math.sqrt(tau);
  const sigma = 1;
  const mid = (mu0 + mu1) / 2;
  const mean = (bit) => (bit === 1 ? mu1 : mu0);
  const snr = () => (mu1 - mu0) / sigma;

  return {
    measure(trueBit, rng) {
      const s = mean(trueBit) + sigma * rng.normal();
      const hard = s > mid ? 1 : 0;
      // Gaussian llr: ln[N(s; mu1, sigma) / N(s; mu0, sigma)].
      const llr = ((mu1 - mu0) * (s - mid)) / (sigma * sigma);
      return { hard, llr, s };
    },
    idleFlipProbability() {
      return 0.5 * (1 - Math.exp(-tau / T1));
    },
    // Normal tail beyond the midpoint: 0.5 erfc(SNR / (2 sqrt 2)).
    averageAssignmentError() {
      return 0.5 * erfc(snr() / (2 * Math.SQRT2));
    },
    snr,
    iqSamples(bit, n, rng) {
      const out = [];
      for (let s = 0; s < n; s++) out.push({ i: mean(bit) + sigma * rng.normal(), q: sigma * rng.normal() });
      return out;
    },
  };
}
