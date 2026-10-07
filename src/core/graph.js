// Decoding graph of the repetition-code memory and edge-weight helpers.
// Nodes: detectors 0..(d-1)*(r+1)-1 (index k*(d-1) + j) and the boundary node
// B = (d-1)*(r+1). Space-like edges are data-qubit flips within a layer; time-like
// edges are wrong reports of m[k][j]. Observable edges are flips of data qubit 0.

const P_MIN = 1e-12;
const P_MAX = 0.5;

export function buildGraph(d, r) {
  if (!Number.isInteger(d) || d < 3 || d % 2 === 0) throw new Error(`buildGraph: d must be an odd integer >= 3, got ${d}`);
  if (!Number.isInteger(r) || r < 1) throw new Error(`buildGraph: r must be an integer >= 1, got ${r}`);
  const nc = d - 1;
  const nDetectors = nc * (r + 1);
  const boundary = nDetectors;
  const node = (k, j) => k * nc + j;
  const edges = [];
  const add = (e) => edges.push({ id: edges.length, ...e });

  // Space-like: layer k = 0..r, one edge per data qubit. Fields that do not apply are null.
  for (let k = 0; k <= r; k++) {
    for (let i = 0; i < d; i++) {
      const u = i === 0 ? node(k, 0) : node(k, i - 1);
      const v = i === 0 ? boundary : i === d - 1 ? boundary : node(k, i);
      add({ u, v, kind: 'space', layer: k, dataQubit: i, check: null, round: null, observable: i === 0 });
    }
  }
  // Time-like: check j, round k = 0..r-1, joins layer k to layer k+1.
  for (let k = 0; k < r; k++) {
    for (let j = 0; j < nc; j++) {
      add({ u: node(k, j), v: node(k + 1, j), kind: 'time', layer: null, dataQubit: null, check: j, round: k, observable: false });
    }
  }
  return { d, r, nDetectors, boundary, edges };
}

// w = ln[(1-p)/p] with p clamped to [1e-12, 0.5].
export function weightFromP(p) {
  const q = Math.min(P_MAX, Math.max(P_MIN, p));
  return Math.log((1 - q) / q);
}

// Soft weight of a single readout: |llr| (Infinity for perfect readout).
export function weightFromLlr(llr) {
  return Math.abs(llr);
}

// Probability that the hard decision is wrong given the llr.
export function pFromLlr(llr) {
  return 1 / (1 + Math.exp(Math.abs(llr)));
}

// Probability that exactly one of two independent flips occurs.
export function xorP(a, b) {
  return a + b - 2 * a * b;
}
