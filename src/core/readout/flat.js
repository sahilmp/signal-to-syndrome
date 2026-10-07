// Flat readout model: every measurement flips the true bit with the same probability
// epsilon, independent of everything else. No idle errors during readout.

export function createFlatReadout({ epsilon }) {
  if (!(epsilon >= 0 && epsilon < 0.5)) {
    throw new Error(`createFlatReadout: epsilon must satisfy 0 <= epsilon < 0.5, got ${epsilon}`);
  }
  // |llr| = ln[(1 - eps)/eps]; Infinity for perfect readout.
  const mag = epsilon === 0 ? Infinity : Math.log((1 - epsilon) / epsilon);
  return {
    // llr = ln[p(s|1)/p(s|0)]: positive when the hard result is 1.
    measure(trueBit, rng) {
      if (trueBit !== 0 && trueBit !== 1) throw new Error(`measure: trueBit must be 0 or 1, got ${trueBit}`);
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
