// STUB for Person A's src/core/readout/ion.js: placeholder physics only.
// Poisson photon counts with means R_bright*tau and R_dark*tau, no state switching,
// threshold at the midpoint of the means. Replaced through src/ui/bridge_core.js (H7).

// Parameter cards store { value, source }; plain numbers are accepted too.
const val = (p) => (p !== null && typeof p === 'object' && 'value' in p ? p.value : p);

function logPoissonPmf(n, lambda) {
  if (lambda === 0) return n === 0 ? 0 : -Infinity;
  let lf = 0;
  for (let i = 2; i <= n; i++) lf += Math.log(i);
  return n * Math.log(lambda) - lambda - lf;
}

// P(N <= m) for N ~ Poisson(lambda), by direct summation (m is small in the stub).
function poissonCdf(m, lambda) {
  if (m < 0) return 0;
  let s = 0;
  for (let n = 0; n <= m; n++) s += Math.exp(logPoissonPmf(n, lambda));
  return Math.min(1, s);
}

export function createIonReadout(params, tau) {
  const Rb = val(params.R_bright_per_us);
  const Rd = val(params.R_dark_per_us);
  const brightBit = params.bright_is_bit === 0 ? 0 : 1;
  if (!(Rb > 0) || !(Rd >= 0) || !(Rb > Rd)) throw new Error(`createIonReadout: need R_bright > R_dark >= 0, got ${Rb}, ${Rd}`);
  if (!(tau > 0)) throw new Error(`createIonReadout: tau must be positive, got ${tau}`);
  const meanB = Rb * tau;
  const meanD = Rd * tau;
  const nTh = (meanB + meanD) / 2;
  const nThInt = Math.floor(nTh); // hard = bright if n > nTh, i.e. n > nThInt

  // ln[p(n|bright)/p(n|dark)] = n ln(Rb/Rd) - (Rb - Rd) tau; Rd = 0 handled explicitly.
  function llrBright(n) {
    if (Rd === 0) return n > 0 ? Infinity : -Rb * tau;
    return n * Math.log(Rb / Rd) - (Rb - Rd) * tau;
  }

  function sample(bit, rng) {
    return rng.poisson(bit === brightBit ? meanB : meanD);
  }

  return {
    measure(trueBit, rng) {
      const n = sample(trueBit, rng);
      const hard = n > nTh ? brightBit : 1 - brightBit;
      const l = llrBright(n);
      return { hard, llr: brightBit === 1 ? l : -l, n };
    },
    idleFlipProbability() {
      return 0;
    },
    // Mean of P(bright read as dark) = P(N_b <= nTh) and P(dark read as bright) = P(N_d > nTh).
    averageAssignmentError() {
      return 0.5 * (poissonCdf(nThInt, meanB) + (1 - poissonCdf(nThInt, meanD)));
    },
    // h[n] = number of the nSamples draws that gave n photons.
    countHistogram(bit, nSamples, rng) {
      const h = [];
      for (let s = 0; s < nSamples; s++) {
        const n = sample(bit, rng);
        while (h.length <= n) h.push(0);
        h[n]++;
      }
      return h;
    },
  };
}
