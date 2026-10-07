import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeShot, runPoint, diagnostic } from '../src/core/sweep.js';
import { createFlatReadout } from '../src/core/readout/flat.js';
import { createRng } from '../src/core/rng.js';
import { validateBank } from '../src/core/bank.js';
import { buildGraph } from '../src/core/graph.js';

// Standard layout from CLAUDE.md: check j of round k is bit k*(d-1) + j, data i is (d-1)*r + i.
function layoutFor(d, r) {
  const ancilla = [];
  for (let k = 0; k < r; k++) ancilla.push(Array.from({ length: d - 1 }, (_, j) => k * (d - 1) + j));
  const data = Array.from({ length: d }, (_, i) => (d - 1) * r + i);
  return { ancilla, data };
}

// Error-free bank: every shot has all ancillas 0 and every data bit equal to `logical`.
function cleanBank(d, r, logical, shots) {
  const nClbits = (d - 1) * r + d;
  const layout = layoutFor(d, r);
  let value = 0;
  if (logical === 1) for (const b of layout.data) value += 2 ** b;
  const bank = {
    schema: 's2s-bank/1', code: 'repetition', d, r, logical, shots, n_clbits: nClbits,
    layout, bit_order: 'qiskit-little-endian', key_encoding: 'hex',
    counts: { [value.toString(16)]: shots }, checksum: { total_shots: shots, n_keys: 1 },
  };
  validateBank(bank);
  return bank;
}

// Catches: fails if decodeShot misreads the shot (wrong split or bit order would light
// detectors), if epsilon = 0 still flips bits, if the decoder flips the logical on an empty
// syndrome, or if any Module API field is missing or has the wrong shape (r rows of d-1 for
// hardAnc and llrAnc, d entries for hardData and llrData).
test('decodeShot on an error-free shot: no defects, no logical error, every API field', () => {
  const d = 5;
  const r = 3;
  const shotBits = new Uint8Array((d - 1) * r + d); // logical 0, all bits 0
  const res = decodeShot({
    shotBits, layout: layoutFor(d, r), d, r,
    readout: createFlatReadout({ epsilon: 0 }), mode: 'hard', pGate: 0, rng: createRng(1),
  });
  for (const f of ['logicalError', 'corrected', 'flip', 'nDefects', 'exact', 'detectors', 'paths',
    'hardAnc', 'hardData', 'llrAnc', 'llrData']) {
    assert.ok(f in res, `missing field ${f}`);
  }
  assert.equal(res.nDefects, 0);
  assert.equal(res.logicalError, 0);
  assert.equal(res.corrected, 0);
  assert.equal(res.flip, 0);
  assert.equal(res.exact, true);
  assert.deepEqual(res.paths, []);
  assert.equal(res.detectors.length, (d - 1) * (r + 1));
  assert.ok(res.detectors.every((v) => v === 0));
  assert.equal(res.hardAnc.length, r);
  assert.equal(res.llrAnc.length, r);
  for (let k = 0; k < r; k++) {
    assert.equal(res.hardAnc[k].length, d - 1);
    assert.equal(res.llrAnc[k].length, d - 1);
    for (const l of res.llrAnc[k]) assert.equal(l, -Infinity); // perfect readout of a 0
  }
  assert.equal(res.hardData.length, d);
  assert.equal(res.llrData.length, d);
});

// Catches: fails if time-like edges carry only the readout probability (at epsilon = 0 they
// would cost ln(1e12) ~ 27.6, so the decoder would route the vertical pair through two
// space-like boundary edges, cost 2 w(pGate)) instead of xorP(pGate, pRead) = pGate here.
// A misreport of m[1][0] lights detectors (1, 0) and (2, 0); the cheapest explanation is
// the one time-like edge between them, cost w(pGate).
test('time-like edges include gate noise: a vertical pair at epsilon = 0 uses the time-like edge', () => {
  const d = 3;
  const r = 3;
  const pGate = 0.01;
  const layout = layoutFor(d, r);
  const shotBits = new Uint8Array((d - 1) * r + d);
  shotBits[layout.ancilla[1][0]] = 1;
  const res = decodeShot({
    shotBits, layout, d, r,
    readout: createFlatReadout({ epsilon: 0 }), mode: 'hard', pGate, rng: createRng(5),
  });
  assert.equal(res.nDefects, 2);
  assert.equal(res.paths.length, 1);
  assert.equal(res.paths[0].edges.length, 1);
  const edge = buildGraph(d, r).edges[res.paths[0].edges[0]];
  assert.equal(edge.kind, 'time');
  assert.equal(edge.round, 1);
  assert.equal(edge.check, 0);
  assert.equal(res.logicalError, 0);
});

// Catches: fails if runPoint compares against logical 0 instead of the bank's logical
// state (the L1 bank would then count every shot as an error), if it miscounts n, or if
// error-free shots produce any logical error.
test('runPoint on error-free synthetic banks gives k = 0 for both logical states', () => {
  for (const logical of [0, 1]) {
    const bank = cleanBank(3, 3, logical, 200);
    const res = runPoint({ bank, readout: createFlatReadout({ epsilon: 0 }), mode: 'hard', pGate: 0, seed: 3 });
    assert.equal(res.k, 0, `logical ${logical}`);
    assert.equal(res.n, 200);
    assert.equal(res.nonExact, 0);
    assert.equal(res.wilson.p, 0);
  }
  const capped = runPoint({ bank: cleanBank(3, 3, 0, 200), readout: createFlatReadout({ epsilon: 0 }), mode: 'hard', pGate: 0, seed: 3, maxShots: 50 });
  assert.equal(capped.n, 50);
});

// Catches: fails if diagnostic depends on anything besides the bank (unseeded randomness,
// module-level state carried between calls), which would make the V9 fingerprint useless,
// or if it is not 8 lowercase hexadecimal characters.
test('diagnostic is deterministic and 8 hexadecimal characters', () => {
  // A bank with a few error shots, so the flags are not all zero.
  const bank = cleanBank(3, 3, 0, 1200);
  bank.counts = { 0: 1000, 1: 100, 40: 100 };
  bank.checksum.n_keys = 3;
  validateBank(bank);
  const a = diagnostic(bank);
  const b = diagnostic(bank);
  assert.match(a, /^[0-9a-f]{8}$/);
  assert.equal(a, b);
});
