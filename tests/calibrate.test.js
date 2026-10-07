import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimatePGate } from '../src/core/calibrate.js';
import { createRng } from '../src/core/rng.js';

// Synthetic detectors from the 4-edge model: each bulk detector is the XOR of 4 independent
// Bernoulli(p) edges. Non-bulk layers are filled with `other` so that reading them shows up.
function synth(d, r, p, nShots, rng, other) {
  const width = d - 1;
  const bulk = r === 1 ? [0] : Array.from({ length: r - 1 }, (_, t) => t + 1);
  const out = [];
  for (let s = 0; s < nShots; s++) {
    const D = new Uint8Array(width * (r + 1)).fill(other);
    for (const k of bulk) {
      for (let j = 0; j < width; j++) {
        let v = 0;
        for (let e = 0; e < 4; e++) if (rng.uniform() < p) v ^= 1;
        D[k * width + j] = v;
      }
    }
    out.push(D);
  }
  return out;
}

// SE of the estimate by the delta method: SE_p = sqrt(q (1 - q) / N) / (4 (1 - 2p)^3),
// with q = P(fire) = (1 - (1 - 2p)^4) / 2 and N = nDetectors * nShots.
function seP(p, N) {
  const q = (1 - (1 - 2 * p) ** 4) / 2;
  return Math.sqrt((q * (1 - q)) / N) / (4 * (1 - 2 * p) ** 3);
}

// Catches: fails if the inversion of P(fire) = (1 - (1-2p)^4)/2 is wrong (e.g. uses 2 or 3
// edges, or returns the firing rate itself), or if layer 0 or the final layer r is counted
// (they are filled with 1s here, which would push p far up). Tolerance: 4 standard errors
// with SE_p from seP above.
test('estimatePGate recovers p = 0.01 within 4 standard errors (d = 5, r = 5)', () => {
  const d = 5;
  const r = 5;
  const p = 0.01;
  const nShots = 20000;
  const res = estimatePGate(synth(d, r, p, nShots, createRng(2026), 1), d, r);
  assert.equal(res.nShots, nShots);
  assert.equal(res.nDetectors, (r - 1) * (d - 1));
  const tol = 4 * seP(p, res.nDetectors * nShots);
  assert.ok(Math.abs(res.p - p) < tol, `p = ${res.p}, expected ${p} +/- ${tol}`);
});

// Catches: fails if r = 1 does not fall back to layer 0 (there are no layers 1..r-1), or if
// it reads the final layer r = 1 (filled with 1s here). Tolerance: 4 SE as above.
test('estimatePGate with r = 1 uses layer 0 only', () => {
  const d = 5;
  const r = 1;
  const p = 0.01;
  const nShots = 40000;
  const res = estimatePGate(synth(d, r, p, nShots, createRng(9), 1), d, r);
  assert.equal(res.nDetectors, d - 1);
  const tol = 4 * seP(p, res.nDetectors * nShots);
  assert.ok(Math.abs(res.p - p) < tol, `p = ${res.p}, expected ${p} +/- ${tol}`);
});

// Catches: fails if a zero rate does not give p = 0, or the bisection does not invert an exact
// rate (one bulk detector in 8 firing gives q = 1/8, so p = (1 - 0.75^(1/4)) / 2).
test('estimatePGate inverts exact rates: q = 0 gives p = 0, q = 1/8 gives the closed form', () => {
  const d = 3;
  const r = 3;
  const zero = Array.from({ length: 4 }, () => new Uint8Array(8));
  assert.equal(estimatePGate(zero, d, r).p, 0);
  // Bulk detectors per shot: layers 1 and 2 -> 4; two shots -> 8; detector 2 (layer 1) fires.
  const a = new Uint8Array(8);
  a[2] = 1;
  const res = estimatePGate([a, new Uint8Array(8)], d, r);
  assert.equal(res.rate, 1 / 8);
  assert.ok(Math.abs(res.p - (1 - 0.75 ** 0.25) / 2) < 1e-12, `p = ${res.p}`);
});
