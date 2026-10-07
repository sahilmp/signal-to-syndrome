import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFlatReadout } from '../src/core/readout/flat.js';
import { createRng } from '../src/core/rng.js';

// Validation V1. Catches: fails if measure flips with the wrong probability (e.g. 1 - eps,
// eps/2, or flips only one value of trueBit). Tolerance: 4 binomial standard errors,
// SE = sqrt(eps (1 - eps) / N) with N = 200000 draws per trueBit (SE ~ 4.9e-4).
test('V1: empirical flip rate equals epsilon = 0.05 within 4 standard errors', () => {
  const eps = 0.05;
  const N = 200000;
  const ro = createFlatReadout({ epsilon: eps });
  const rng = createRng(20261007);
  const se = Math.sqrt((eps * (1 - eps)) / N);
  for (const bit of [0, 1]) {
    let flips = 0;
    for (let s = 0; s < N; s++) if (ro.measure(bit, rng).hard !== bit) flips++;
    const rate = flips / N;
    assert.ok(Math.abs(rate - eps) < 4 * se, `trueBit=${bit}: rate ${rate} vs ${eps} (4 SE = ${4 * se})`);
  }
});

// Catches: fails if the llr has the wrong sign convention (llr = ln[p(s|1)/p(s|0)] must be
// positive for hard = 1) or the wrong magnitude ln((1-eps)/eps).
test('llr is +ln((1-eps)/eps) for hard 1 and its negative for hard 0', () => {
  const eps = 0.1;
  const ro = createFlatReadout({ epsilon: eps });
  const rng = createRng(7);
  const mag = Math.log((1 - eps) / eps);
  for (let s = 0; s < 2000; s++) {
    const { hard, llr } = ro.measure(s % 2, rng);
    assert.ok(Math.abs(llr - (hard === 1 ? mag : -mag)) < 1e-12, `hard=${hard}, llr=${llr}`);
  }
});

// Catches: fails if perfect readout ever flips (e.g. uniform() <= eps with uniform() = 0),
// or if |llr| is finite or NaN (ln(1/0) must be handled as Infinity).
test('epsilon = 0 never flips and gives infinite |llr|', () => {
  const ro = createFlatReadout({ epsilon: 0 });
  const rng = createRng(3);
  for (let s = 0; s < 20000; s++) {
    const bit = s % 2;
    const { hard, llr } = ro.measure(bit, rng);
    assert.equal(hard, bit);
    assert.equal(llr, bit === 1 ? Infinity : -Infinity);
  }
});

// Catches: fails if the range check is wrong at either end: epsilon = 0.5 (no information)
// must be rejected while 0.49 is accepted; 0 is accepted while -0.01 is rejected.
test('epsilon range: 0.5 rejected, 0.49 accepted, 0 accepted, -0.01 rejected', () => {
  assert.throws(() => createFlatReadout({ epsilon: 0.5 }));
  assert.doesNotThrow(() => createFlatReadout({ epsilon: 0.49 }));
  assert.doesNotThrow(() => createFlatReadout({ epsilon: 0 }));
  assert.throws(() => createFlatReadout({ epsilon: -0.01 }));
  assert.throws(() => createFlatReadout({ epsilon: NaN }));
});

// Catches: fails if the flat model reports idle errors or a wrong average assignment error.
test('idleFlipProbability is 0 and averageAssignmentError is epsilon', () => {
  const ro = createFlatReadout({ epsilon: 0.03 });
  assert.equal(ro.idleFlipProbability(), 0);
  assert.equal(ro.averageAssignmentError(), 0.03);
});
