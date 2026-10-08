import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimatePGate } from '../src/core/calibrate.js';
import { createRng } from '../src/core/rng.js';

// Synthetic detectors from the edge model: each bulk detector is the XOR of nEdges
// independent Bernoulli(p) edges (4 for r >= 2, 3 for r = 1, where layer 0 has no time-like
// edge below it). Non-bulk layers are filled with `other` so that reading them shows up.
function synth(d, r, p, nShots, rng, other, nEdges = r === 1 ? 3 : 4) {
  const width = d - 1;
  const bulk = r === 1 ? [0] : Array.from({ length: r - 1 }, (_, t) => t + 1);
  const out = [];
  for (let s = 0; s < nShots; s++) {
    const D = new Uint8Array(width * (r + 1)).fill(other);
    for (const k of bulk) {
      for (let j = 0; j < width; j++) {
        let v = 0;
        for (let e = 0; e < nEdges; e++) if (rng.uniform() < p) v ^= 1;
        D[k * width + j] = v;
      }
    }
    out.push(D);
  }
  return out;
}

// SE of the estimate by the delta method: SE_p = sqrt(q (1 - q) / N) / (n (1 - 2p)^(n-1)),
// with q = P(fire) = (1 - (1 - 2p)^n) / 2, n edges per detector and N = nDetectors * nShots.
function seP(p, N, n = 4) {
  const q = (1 - (1 - 2 * p) ** n) / 2;
  return Math.sqrt((q * (1 - q)) / N) / (n * (1 - 2 * p) ** (n - 1));
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

// Catches: fails if r = 1 does not fall back to layer 0 (there are no layers 1..r-1), if
// it reads the final layer r = 1 (filled with 1s here), or if it inverts with 4 edges
// instead of 3 (that would give p ~ 0.0075 here, about 9 SE low). Tolerance: 4 SE with
// the 3-edge SE.
test('estimatePGate with r = 1 uses layer 0 only, with 3 edges per detector', () => {
  const d = 5;
  const r = 1;
  const p = 0.01;
  const nShots = 40000;
  const res = estimatePGate(synth(d, r, p, nShots, createRng(9), 1), d, r);
  assert.equal(res.nDetectors, d - 1);
  const tol = 4 * seP(p, res.nDetectors * nShots, 3);
  assert.ok(Math.abs(res.p - p) < tol, `p = ${res.p}, expected ${p} +/- ${tol}`);
});

// Catches: fails if the edge count does not depend on r (both rates below are the same, so
// the same edge count would give the same p), or if either closed form is wrong. The Stage 1
// r = 1 firing rate 0.020 gives p = (1 - 0.96^(1/3)) / 2 ~ 0.0068 with 3 edges, and the same
// rate at r = 3 gives (1 - 0.96^(1/4)) / 2 ~ 0.0051 with 4 edges.
test('estimatePGate: rate 0.02 inverts with 3 edges at r = 1 and 4 edges at r = 3', () => {
  const d = 3;
  const shots = (r, n) => Array.from({ length: n }, (_, s) => {
    const D = new Uint8Array((d - 1) * (r + 1));
    const bulk = r === 1 ? 0 : 1;
    if (s === 0) D[bulk * (d - 1)] = 1; // one firing among (d - 1) * nBulk * n detectors
    return D;
  });
  const r1 = estimatePGate(shots(1, 25), d, 1); // 50 bulk detectors, 1 fires: rate 0.02
  assert.equal(r1.rate, 0.02);
  assert.ok(Math.abs(r1.p - (1 - 0.96 ** (1 / 3)) / 2) < 1e-12, `r = 1: p = ${r1.p}`);
  const r3 = estimatePGate(shots(3, 25), d, 3); // 4 bulk detectors per shot: 100, 1 fires
  assert.equal(r3.rate, 0.01);
  assert.ok(Math.abs(r3.p - (1 - 0.98 ** (1 / 4)) / 2) < 1e-12, `r = 3: p = ${r3.p}`);
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
