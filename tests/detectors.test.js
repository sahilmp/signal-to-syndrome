import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDetectors } from '../src/core/detectors.js';

function zeros(d, r) {
  return { m: Array.from({ length: r }, () => new Uint8Array(d - 1)), x: new Uint8Array(d) };
}

// Flip data qubit i before round k, by hand: checks i-1 and i (those that exist)
// in rounds k..r-1, and the data readout x[i].
function flipDataBefore(m, x, d, r, i, k) {
  for (let kk = k; kk < r; kk++) {
    if (i - 1 >= 0) m[kk][i - 1] ^= 1;
    if (i <= d - 2) m[kk][i] ^= 1;
  }
  x[i] ^= 1;
}

function lit(D) {
  const out = [];
  D.forEach((v, idx) => { if (v) out.push(idx); });
  return out;
}

const idx = (d, k, j) => k * (d - 1) + j;

// Catches: fails if a detector is non-zero without errors (e.g. m[-1] taken as 1, or the
// final layer omits m[r-1]), or the output has the wrong length or type.
test('no errors gives all zeros', () => {
  for (const [d, r] of [[3, 2], [5, 3], [7, 7]]) {
    const { m, x } = zeros(d, r);
    const D = computeDetectors(m, x, d, r);
    assert.ok(D instanceof Uint8Array);
    assert.equal(D.length, (d - 1) * (r + 1));
    assert.deepEqual(lit(D), []);
  }
});

// Catches: fails if detectors compare with the wrong round, use the wrong index
// (k*(d-1) + j), or the final layer does not cancel a data flip that the last round saw.
test('interior data flip before round k lights exactly D[k][i-1] and D[k][i]', () => {
  const d = 5;
  const r = 3;
  for (let i = 1; i <= d - 2; i++) {
    for (let k = 0; k < r; k++) {
      const { m, x } = zeros(d, r);
      flipDataBefore(m, x, d, r, i, k);
      const D = computeDetectors(m, x, d, r);
      assert.deepEqual(lit(D), [idx(d, k, i - 1), idx(d, k, i)], `i=${i}, k=${k}`);
    }
  }
});

// Catches: fails if the end qubits are treated like interior ones (e.g. reading check -1
// or check d-1), which would light two detectors instead of one.
test('end-qubit data flip lights exactly one detector', () => {
  const d = 5;
  const r = 3;
  for (let k = 0; k < r; k++) {
    let s = zeros(d, r);
    flipDataBefore(s.m, s.x, d, r, 0, k);
    assert.deepEqual(lit(computeDetectors(s.m, s.x, d, r)), [idx(d, k, 0)], `i=0, k=${k}`);
    s = zeros(d, r);
    flipDataBefore(s.m, s.x, d, r, d - 1, k);
    assert.deepEqual(lit(computeDetectors(s.m, s.x, d, r)), [idx(d, k, d - 2)], `i=${d - 1}, k=${k}`);
  }
});

// Catches: fails if a measurement error is not seen by both neighbouring layers
// (missing XOR with the previous round).
test('single wrong m[k][j] with k < r-1 lights D[k][j] and D[k+1][j]', () => {
  const d = 5;
  const r = 3;
  for (let k = 0; k < r - 1; k++) {
    for (let j = 0; j < d - 1; j++) {
      const { m, x } = zeros(d, r);
      m[k][j] = 1;
      assert.deepEqual(lit(computeDetectors(m, x, d, r)), [idx(d, k, j), idx(d, k + 1, j)], `k=${k}, j=${j}`);
    }
  }
});

// Catches: fails if the final layer omits m[r-1][j], so a wrong last-round measurement
// lights only one detector.
test('wrong m[r-1][j] lights D[r-1][j] and final-layer D[r][j]', () => {
  const d = 5;
  const r = 3;
  for (let j = 0; j < d - 1; j++) {
    const { m, x } = zeros(d, r);
    m[r - 1][j] = 1;
    assert.deepEqual(lit(computeDetectors(m, x, d, r)), [idx(d, r - 1, j), idx(d, r, j)], `j=${j}`);
  }
});
