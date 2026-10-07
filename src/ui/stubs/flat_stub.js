// STUB for Person A's src/core/readout/flat.js (same API, same behaviour as specified).
// Replaced through src/ui/bridge_core.js when the real module arrives (H5).

export function createFlatReadout({ epsilon }) {
  if (!(epsilon >= 0 && epsilon < 0.5)) throw new Error(`createFlatReadout: epsilon must satisfy 0 <= epsilon < 0.5, got ${epsilon}`);
  const mag = epsilon === 0 ? Infinity : Math.log((1 - epsilon) / epsilon);
  return {
    // Flips trueBit with probability epsilon; llr = +/- ln((1-eps)/eps) by the hard result.
    measure(trueBit, rng) {
      const hard = rng.uniform() < epsilon ? 1 - trueBit : trueBit;
      return { hard, llr: hard === 1 ? mag : -mag };
    },
    idleFlipProbability() {
      return 0;
    },
    averageAssignmentError() {
      return epsilon;
    },
  };
}
