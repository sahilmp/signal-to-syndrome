// Detectors of the repetition-code memory. Layer k < r compares check j with the
// previous round (m[-1] = 0); layer r compares the last round with the parity of
// the data readout. Detector index = k*(d-1) + j.

export function computeDetectors(m, x, d, r) {
  const nc = d - 1;
  const D = new Uint8Array(nc * (r + 1));
  for (let k = 0; k < r; k++) {
    for (let j = 0; j < nc; j++) {
      const prev = k > 0 ? m[k - 1][j] : 0;
      D[k * nc + j] = (m[k][j] ^ prev) & 1;
    }
  }
  for (let j = 0; j < nc; j++) {
    D[r * nc + j] = (x[j] ^ x[j + 1] ^ m[r - 1][j]) & 1;
  }
  return D;
}
