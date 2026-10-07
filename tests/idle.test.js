import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyX, injectIdle } from '../src/core/idle.js';
import { createRng } from '../src/core/rng.js';

const d = 3;
const r = 3;

function zeros() {
  return { m: Array.from({ length: r }, () => new Uint8Array(d - 1)), x: new Uint8Array(d) };
}
const plain = ({ m, x }) => ({ m: m.map((row) => Array.from(row)), x: Array.from(x) });

// Scripted rng: uniform() returns the listed values in order and counts the draws.
function scripted(values) {
  let n = 0;
  return {
    uniform() {
      if (n >= values.length) throw new Error('scripted rng exhausted');
      return values[n++];
    },
    get count() {
      return n;
    },
  };
}

// Catches: fails if an X after round k also flips round k itself (k' >= k instead of k' > k),
// or if the left end qubit flips a non-existent check -1 instead of only check 0.
test('applyX end qubit i = 0 after round 0 (d = 3, r = 3)', () => {
  const s = zeros();
  const out = applyX(s.m, s.x, d, r, 0, 0);
  assert.deepEqual(plain(out), { m: [[0, 0], [1, 0], [1, 0]], x: [1, 0, 0] });
});

// Catches: fails if the interior qubit does not flip both neighbouring checks i-1 and i.
test('applyX interior qubit i = 1 after round 0', () => {
  const s = zeros();
  const out = applyX(s.m, s.x, d, r, 1, 0);
  assert.deepEqual(plain(out), { m: [[0, 0], [1, 1], [1, 1]], x: [0, 1, 0] });
});

// Catches: fails if the right end qubit i = d-1 flips check d-1 (out of range) instead of
// only check d-2, or if the flip is assigned (not XORed) onto an existing pattern.
test('applyX right end qubit i = 2 after round 1 XORs onto existing values', () => {
  const s = {
    m: [Uint8Array.from([1, 0]), Uint8Array.from([0, 1]), Uint8Array.from([1, 1])],
    x: Uint8Array.from([0, 0, 1]),
  };
  const out = applyX(s.m, s.x, d, r, 2, 1);
  assert.deepEqual(plain(out), { m: [[1, 0], [0, 1], [1, 0]], x: [0, 0, 0] });
});

// Catches: fails if k = r-1 touches any check (it must flip only x[i]), and if k = r is
// accepted (boundary: k = r-1 valid, k = r one step past it rejected; same for i = d).
test('applyX k = r-1 flips only x[i]; k = r is rejected', () => {
  const s = zeros();
  const out = applyX(s.m, s.x, d, r, 1, r - 1);
  assert.deepEqual(plain(out), { m: [[0, 0], [0, 0], [0, 0]], x: [0, 1, 0] });
  assert.throws(() => applyX(s.m, s.x, d, r, 1, r));
  assert.doesNotThrow(() => applyX(s.m, s.x, d, r, d - 1, 0));
  assert.throws(() => applyX(s.m, s.x, d, r, d, 0));
});

// Catches: fails if applyX mutates its inputs or returns the same array objects.
test('applyX does not mutate its inputs', () => {
  const s = zeros();
  const out = applyX(s.m, s.x, d, r, 1, 0);
  assert.deepEqual(plain(s), plain(zeros()));
  assert.notEqual(out.x, s.x);
  out.m.forEach((row, k) => assert.notEqual(row, s.m[k]));
});

// Catches: fails if injectIdle applies errors after the last round (k = r-1: it would draw
// 9 times instead of (r-1)*d = 6), or draws in a different order than k outer, i inner.
// Fired events: (k=0, i=0) and (k=1, i=2), result computed by hand.
test('injectIdle with a scripted rng fires the chosen (k, i) events only', () => {
  const s = zeros();
  const rng = scripted([0.0, 0.9, 0.9, 0.9, 0.9, 0.0]);
  const out = injectIdle(s.m, s.x, d, r, 0.5, rng);
  assert.equal(rng.count, (r - 1) * d);
  assert.deepEqual(plain(out), { m: [[0, 0], [1, 0], [1, 1]], x: [1, 0, 1] });
});

// Catches: fails if p = 1 includes the last round. With X on every qubit after rounds 0 and 1,
// each check flips an even number of times and each x[i] flips twice, so all stay 0; an
// extra round r-1 would leave x = [1, 1, 1].
test('injectIdle p = 1 flips every qubit after rounds 0..r-2 only', () => {
  const s = zeros();
  const out = injectIdle(s.m, s.x, d, r, 1, createRng(1));
  assert.deepEqual(plain(out), plain(zeros()));
});

// Catches: fails if p = 0 changes anything, mutates the inputs, or returns the input arrays.
test('injectIdle p = 0 leaves values unchanged and inputs untouched', () => {
  const s = {
    m: [Uint8Array.from([1, 0]), Uint8Array.from([0, 1]), Uint8Array.from([1, 1])],
    x: Uint8Array.from([1, 0, 1]),
  };
  const before = plain(s);
  const out = injectIdle(s.m, s.x, d, r, 0, createRng(42));
  assert.deepEqual(plain(out), before);
  assert.deepEqual(plain(s), before);
  assert.notEqual(out.x, s.x);
  out.m.forEach((row, k) => assert.notEqual(row, s.m[k]));
});
