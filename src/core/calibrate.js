// Gate-noise calibration from the detector firing rate of a bank.
//
// Model: every bulk detector touches 4 independent edges (2 space-like, 2 time-like),
// each flipping with the same probability p, so P(fire) = (1 - (1 - 2p)^4) / 2.
// Time-like edges are counted as gate-noise edges here because readout noise is off
// during calibration: the bank's raw bits come from the simulator, whose readout is
// perfect (DECISIONS: the Forte noise model has no SPAM error).

const N_EDGES = 4;

export function fireProbability(p) {
  return (1 - Math.pow(1 - 2 * p, N_EDGES)) / 2;
}

// Bulk detector layers: 1..r-1, or layer 0 when r = 1. Never the final layer r.
function bulkLayers(r) {
  if (r === 1) return [0];
  const layers = [];
  for (let k = 1; k <= r - 1; k++) layers.push(k);
  return layers;
}

// detectorArrays: one Uint8Array((d-1)*(r+1)) per shot, from computeDetectors.
// Returns { p, rate, nDetectors, nShots }, where nDetectors is the number of bulk
// detectors per shot and rate is the mean firing rate over all bulk detectors and shots.
export function estimatePGate(detectorArrays, d, r) {
  if (!Number.isInteger(d) || d < 2) throw new Error(`estimatePGate: d must be an integer >= 2, got ${d}`);
  if (!Number.isInteger(r) || r < 1) throw new Error(`estimatePGate: r must be an integer >= 1, got ${r}`);
  const nShots = detectorArrays.length;
  if (nShots === 0) throw new Error('estimatePGate: no shots');
  const width = d - 1;
  const len = width * (r + 1);
  const layers = bulkLayers(r);
  const nDetectors = layers.length * width;

  let fired = 0;
  for (let s = 0; s < nShots; s++) {
    const D = detectorArrays[s];
    if (D.length !== len) throw new Error(`estimatePGate: shot ${s} has ${D.length} detectors, expected ${len}`);
    for (const k of layers) {
      for (let j = 0; j < width; j++) fired += D[k * width + j];
    }
  }
  const rate = fired / (nDetectors * nShots);

  // Bisection on [0, 0.5): fireProbability is increasing from 0 to 1/2 there.
  // A rate of 0 maps exactly to p = 0 (bisection alone would leave a ~1e-31 residue);
  // a rate >= 1/2 converges to the upper end of the interval.
  if (rate === 0) return { p: 0, rate, nDetectors, nShots };
  let lo = 0;
  let hi = 0.5;
  for (let it = 0; it < 100; it++) {
    const mid = (lo + hi) / 2;
    if (fireProbability(mid) < rate) lo = mid;
    else hi = mid;
  }
  return { p: (lo + hi) / 2, rate, nDetectors, nShots };
}
