import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBank, bitsFromKey, expandShots, split } from '../src/core/bank.js';

// d = 3, r = 2: n_clbits = (d-1)*r + d = 7, layout from the CLAUDE.md formula.
function makeBank(extra = {}) {
  return {
    schema: 's2s-bank/1',
    code: 'repetition',
    d: 3,
    r: 2,
    logical: 0,
    mode: 'fresh-ancilla',
    shots: 10,
    n_qubits: 7,
    n_clbits: 7,
    layout: { ancilla: [[0, 1], [2, 3]], data: [4, 5, 6] },
    bit_order: 'qiskit-little-endian',
    key_encoding: 'hex',
    counts: { '0': 6, '40': 1, '1': 3 },
    checksum: { total_shots: 10, n_keys: 3, sha256: 'not-checked-here' },
    ...extra,
  };
}

// Catches: fails if classical bit 0 is read from the left (most significant) end of the
// key. Boundary pair: only bit 0 set and only bit n-1 set must give mirror-image results.
test('bitsFromKey: only bit 0 set, and only bit n-1 set', () => {
  const n = 7;
  const low = bitsFromKey('1', n);
  assert.deepEqual([...low], [1, 0, 0, 0, 0, 0, 0]);
  const high = bitsFromKey('40', n); // 0x40 = 2^6 = bit n-1
  assert.deepEqual([...high], [0, 0, 0, 0, 0, 0, 1]);
  assert.equal(low.length, n);
  assert.ok(low instanceof Uint8Array);
});

// Catches: fails if a key one bit too wide for n_clbits is silently truncated.
// Boundary: 2^n - 1 fits in n bits, 2^n does not.
test('bitsFromKey: largest key fits, one more is rejected', () => {
  assert.deepEqual([...bitsFromKey('7f', 7)], [1, 1, 1, 1, 1, 1, 1]);
  assert.throws(() => bitsFromKey('80', 7), /does not fit/);
});

// Catches: fails if counts are not expanded (one entry per key instead of per shot),
// or keys are ordered as strings ("40" before "1" would still pass length, so order is checked).
test('expandShots: length equals total shots, keys in ascending numeric order', () => {
  const bank = makeBank({ counts: { '40': 1, '0': 6, 'a': 2, '1': 3 }, shots: 12, checksum: { total_shots: 12, n_keys: 4 } });
  const shots = expandShots(bank);
  assert.equal(shots.length, 12);
  const values = shots.map((s) => s.reduce((acc, b, i) => acc + (b << i), 0));
  assert.deepEqual(values, [0, 0, 0, 0, 0, 0, 1, 1, 1, 10, 10, 64]);
});

// Catches: fails if split swaps ancilla rows and columns, or reads data bits from the
// wrong offset. Hand-built d = 3, r = 2 shot with a distinct pattern in every slot.
test('split: hand-built d = 3, r = 2 shot', () => {
  const layout = { ancilla: [[0, 1], [2, 3]], data: [4, 5, 6] };
  // bit:          0  1  2  3  4  5  6
  const shotBits = Uint8Array.from([1, 0, 0, 1, 1, 1, 0]);
  const { m, x } = split(shotBits, layout, 3, 2);
  assert.equal(m.length, 2);
  assert.deepEqual([...m[0]], [1, 0]); // round 0: checks 0, 1
  assert.deepEqual([...m[1]], [0, 1]); // round 1: checks 0, 1
  assert.deepEqual([...x], [1, 1, 0]);
  assert.ok(m[0] instanceof Uint8Array && x instanceof Uint8Array);
});

// Catches: fails if split ignores the layout and assumes the fixed formula.
test('split: follows a permuted layout', () => {
  const layout = { ancilla: [[6, 5], [4, 3]], data: [2, 1, 0] };
  const shotBits = Uint8Array.from([1, 0, 0, 1, 1, 1, 0]);
  const { m, x } = split(shotBits, layout, 3, 2);
  assert.deepEqual([...m[0]], [0, 1]);
  assert.deepEqual([...m[1]], [1, 1]);
  assert.deepEqual([...x], [0, 0, 1]);
});

// Catches: fails if validateBank rejects extra fields such as "inject" (V4 banks)
// or "fixture" (fixture banks).
test('validateBank accepts extra "inject" and "fixture" fields', () => {
  assert.equal(validateBank(makeBank({ inject: [[1, 0]] })), true);
  assert.equal(validateBank(makeBank({ fixture: true })), true);
});

// Catches: fails if the optional "basis" field is not checked: "X" (phase-flip bank) and an
// absent basis (meaning "Z") must pass, while any other value such as "Y" (or lowercase "x")
// must be rejected rather than silently decoded as one of the two memories.
test('validateBank: basis "X" and "Z" accepted, absent accepted, "Y" rejected', () => {
  assert.equal(validateBank(makeBank({ basis: 'X' })), true);
  assert.equal(validateBank(makeBank({ basis: 'Z' })), true);
  const absent = makeBank();
  assert.equal('basis' in absent, false);
  assert.equal(validateBank(absent), true);
  assert.throws(() => validateBank(makeBank({ basis: 'Y' })), /basis is "Y", expected "Z" or "X"/);
  assert.throws(() => validateBank(makeBank({ basis: 'x' })), /basis is "x"/);
  assert.throws(() => validateBank(makeBank({ basis: null })), /basis is null/);
});

// Catches: fails if checksum totals are not compared with the counts.
test('validateBank rejects a wrong total', () => {
  const bad = makeBank({ checksum: { total_shots: 11, n_keys: 3 } });
  assert.throws(() => validateBank(bad), /total_shots is 11, but the counts sum to 10/);
  const badShots = makeBank({ shots: 9 });
  assert.throws(() => validateBank(badShots), /shots is 9/);
});

// Catches: fails if missing fields, wrong schema, a wrong n_keys or an uppercase key slip through.
test('validateBank rejects missing fields, wrong schema, wrong n_keys, bad keys', () => {
  const missing = makeBank();
  delete missing.layout;
  assert.throws(() => validateBank(missing), /missing required field "layout"/);
  assert.throws(() => validateBank(makeBank({ schema: 's2s-bank/2' })), /schema/);
  assert.throws(() => validateBank(makeBank({ checksum: { total_shots: 10, n_keys: 2 } })), /n_keys/);
  assert.throws(
    () => validateBank(makeBank({ counts: { '0': 6, '4A': 4 }, checksum: { total_shots: 10, n_keys: 2 } })),
    /not lowercase hexadecimal/,
  );
  assert.throws(
    () => validateBank(makeBank({ counts: { '0': 6, '80': 4 }, checksum: { total_shots: 10, n_keys: 2 } })),
    /does not fit/,
  );
});

// Catches: fails if n_clbits is not checked against (d-1)*r + d, so a bank whose keys are
// read with the wrong width would be split into the wrong bits.
test('validateBank rejects an n_clbits that does not match d and r', () => {
  assert.throws(() => validateBank(makeBank({ n_clbits: 8 })), /n_clbits is 8, expected/);
});

// A bank with n_clbits = (d-1)*r + d and the formula layout; one shot of the all-zero key.
function sizedBank(d, r) {
  const nClbits = (d - 1) * r + d;
  const ancilla = Array.from({ length: r }, (_, k) => Array.from({ length: d - 1 }, (_, j) => k * (d - 1) + j));
  const data = Array.from({ length: d }, (_, i) => (d - 1) * r + i);
  return makeBank({
    d, r, n_clbits: nClbits, layout: { ancilla, data },
    shots: 1, counts: { '0': 1 }, checksum: { total_shots: 1, n_keys: 1 },
  });
}

// Catches: fails if the 29-bit limit (parseInt of the hex key must stay exact and fit the
// bit operations) is off by one. Boundary pair: d = 5, r = 6 gives n_clbits = 29 and is
// accepted; d = 2, r = 28 gives n_clbits = 30 and is rejected.
test('validateBank: n_clbits = 29 accepted, 30 rejected', () => {
  assert.equal(validateBank(sizedBank(5, 6)), true);
  assert.throws(() => validateBank(sizedBank(2, 28)), /at most 29/);
});

// Catches: fails if a layout may use a classical bit twice or point outside 0..n_clbits-1,
// so two checks would read the same bit or split would read undefined.
test('validateBank rejects duplicate and out-of-range layout bits', () => {
  const dup = makeBank({ layout: { ancilla: [[0, 1], [2, 3]], data: [4, 5, 5] } });
  assert.throws(() => validateBank(dup), /used twice/);
  const out = makeBank({ layout: { ancilla: [[0, 1], [2, 3]], data: [4, 5, 7] } });
  assert.throws(() => validateBank(out), /is not a classical bit in 0\.\.6/);
  const neg = makeBank({ layout: { ancilla: [[-1, 1], [2, 3]], data: [4, 5, 6] } });
  assert.throws(() => validateBank(neg), /is not a classical bit/);
});

// Catches: fails if zero, negative or fractional counts are accepted. Boundary pair: a
// count of 1 is accepted, a count of 0 is rejected.
test('validateBank rejects non-positive and non-integer counts', () => {
  const one = makeBank({ counts: { '0': 9, '40': 1 }, checksum: { total_shots: 10, n_keys: 2 } });
  assert.equal(validateBank(one), true);
  const zero = makeBank({ counts: { '0': 10, '40': 0 }, checksum: { total_shots: 10, n_keys: 2 } });
  assert.throws(() => validateBank(zero), /must be a positive integer, got 0/);
  const neg = makeBank({ counts: { '0': 11, '40': -1 }, checksum: { total_shots: 10, n_keys: 2 } });
  assert.throws(() => validateBank(neg), /must be a positive integer, got -1/);
  const frac = makeBank({ counts: { '0': 9.5, '40': 0.5 }, checksum: { total_shots: 10, n_keys: 2 } });
  assert.throws(() => validateBank(frac), /must be a positive integer/);
});
