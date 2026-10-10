export { decodeShot, runPoint, diagnostic } from '../core/sweep.js';
export { createFlatReadout } from '../core/readout/flat.js';
export { createIonReadout } from '../core/readout/ion.js';
export { createScReadout } from '../core/readout/sc.js';
export { findMinimum } from '../core/optimum.js';

// dem.js estimateEdgeRates is a build-time tool (tools/sweep.mjs --stage dem); the page reads
// the learned rates from demForte1 in bridge_data.js and never calls this. buildGraph and decode
// are Person B's own modules: the interface imports them from src/core directly.
export function estimateEdgeRates() {
  throw new Error('estimateEdgeRates is not available in the browser');
}
