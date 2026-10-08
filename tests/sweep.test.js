import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeShot, runPoint, diagnostic, edgeWeights } from '../src/core/sweep.js';
import { createFlatReadout } from '../src/core/readout/flat.js';
import { createIonReadout } from '../src/core/readout/ion.js';
import { createRng } from '../src/core/rng.js';
import { validateBank } from '../src/core/bank.js';
import { buildGraph } from '../src/core/graph.js';
import { decode } from '../src/core/matching.js';

const ionCard = JSON.parse(readFileSync(new URL('../params/ion.json', import.meta.url), 'utf8'));

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

// Stub readout with known, distinct llrs: hard = true bit, |llr| = 1 + 0.5 * (call index),
// sign from the true bit (or llrOf(trueBit) if given). Calls run ancillas round by round,
// then data, so the call index of m[k][j] is k*(d-1) + j and of x[i] is r*(d-1) + i.
// `seen` records the true bits the readout was asked to measure.
function stubReadout({ pIdle = 0, pAvg = 0.02, llrOf = null } = {}) {
  let calls = 0;
  const seen = [];
  return {
    seen,
    measure(trueBit) {
      const mag = 1 + 0.5 * calls++;
      seen.push(trueBit);
      return { hard: trueBit, llr: llrOf ? llrOf(trueBit) : (trueBit ? mag : -mag) };
    },
    idleFlipProbability: () => pIdle,
    averageAssignmentError: () => pAvg,
  };
}

// Independent restatement of the edge rule (DECISIONS: time-like edges include gate noise).
const xor = (a, b) => a * (1 - b) + b * (1 - a);
const w = (p) => Math.log((1 - p) / p);
const pOfMag = (mag) => 1 / (1 + Math.exp(mag));

// Catches: fails if a soft weight reads the llr of the wrong measurement (llrAnc indexed
// [check][round] instead of [round][check], or llrData not by dataQubit), if layers 1..r-1
// miss the idle term or layer 0 gains it, if the final layer or a time-like edge uses the
// average error in soft mode (or an llr in hard mode), or if decodeShot decodes with other
// weights than these. Every llr is distinct, so any index mix-up changes some weight.
test('edge weight table: per-edge p in hard and soft mode from known llrs', () => {
  const d = 3;
  const r = 3;
  const pGate = 0.01;
  const pIdle = 0.003;
  const pAvg = 0.02;
  const layout = layoutFor(d, r);
  const graph = buildGraph(d, r);
  const shotBits = new Uint8Array((d - 1) * r + d);
  shotBits[layout.ancilla[1][0]] = 1; // a vertical pair, so the shot has a path to compare
  for (const mode of ['soft', 'hard']) {
    const readout = stubReadout({ pIdle, pAvg });
    // pIdle = 0.003 over 6 idle draws: seed 2 gives no idle flip, so the bits are as built.
    const res = decodeShot({ shotBits, layout, d, r, readout, mode, pGate, rng: createRng(2) });
    assert.deepEqual(readout.seen.slice(0, 6), [0, 0, 1, 0, 0, 0]);
    for (let k = 0; k < r; k++) {
      for (let j = 0; j < d - 1; j++) assert.equal(Math.abs(res.llrAnc[k][j]), 1 + 0.5 * (k * (d - 1) + j));
    }
    for (let i = 0; i < d; i++) assert.equal(Math.abs(res.llrData[i]), 1 + 0.5 * (r * (d - 1) + i));

    const weights = edgeWeights(graph, { mode, pGate, pIdle, readout, llrAnc: res.llrAnc, llrData: res.llrData });
    for (const e of graph.edges) {
      let p;
      if (e.kind === 'space' && e.layer === 0) p = pGate;
      else if (e.kind === 'space' && e.layer < r) p = xor(pGate, pIdle);
      else if (e.kind === 'space') p = xor(pGate, mode === 'soft' ? pOfMag(1 + 0.5 * (r * (d - 1) + e.dataQubit)) : pAvg);
      else p = xor(pGate, mode === 'soft' ? pOfMag(1 + 0.5 * (e.round * (d - 1) + e.check)) : pAvg);
      assert.ok(Math.abs(weights[e.id] - w(p)) < 1e-12, `${mode} edge ${e.id} (${e.kind}): ${weights[e.id]} vs ${w(p)}`);
    }
    const again = decode(graph, weights, res.detectors);
    assert.equal(res.flip, again.flip);
    assert.deepEqual(res.paths, again.paths);
    assert.ok(res.paths.length > 0);
  }
});

// Boundary test (non-vacuous pair) for the idle order (DECISIONS: Person A, M1). Catches:
// fails if idle errors are applied after readout (flipping hard bits and negating llrs)
// instead of to the true bits before readout. d = 3, r = 2, pIdle = 1: an X on every data
// qubit after round 0 flips each check of round 1 twice (no change) and every data bit once,
// so the readout must see x = 111. The stub is asymmetric (llr +5 for a true 1, -2 for a
// true 0): reading the flipped bit gives +5, while negating the llr of an unflipped read
// would give +2. At pIdle = 0 the readout sees x = 000 and llr -2.
test('idle errors act on the true bits before readout', () => {
  const d = 3;
  const r = 2;
  const layout = layoutFor(d, r);
  const shotBits = new Uint8Array((d - 1) * r + d);
  const llrOf = (bit) => (bit ? 5 : -2);
  const on = stubReadout({ pIdle: 1, llrOf });
  const a = decodeShot({ shotBits, layout, d, r, readout: on, mode: 'soft', pGate: 0.01, rng: createRng(1) });
  assert.deepEqual(on.seen, [0, 0, 0, 0, 1, 1, 1]);
  assert.deepEqual(Array.from(a.hardData), [1, 1, 1]);
  assert.deepEqual(Array.from(a.llrData), [5, 5, 5]);

  const off = stubReadout({ pIdle: 0, llrOf });
  const b = decodeShot({ shotBits, layout, d, r, readout: off, mode: 'soft', pGate: 0.01, rng: createRng(1) });
  assert.deepEqual(off.seen, [0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(Array.from(b.llrData), [-2, -2, -2]);
});

// Catches: fails if the correction is not applied to the noisy data readout (corrected =
// hardData[0] xor flip), if a final-layer flip of data qubit 0 is not matched through its
// observable edge, or if logicalError ignores the prepared state. Non-vacuous: the same L0
// shot counts as an error when judged against logical 1, and the L1 mirror image (x = 011)
// is corrected to 1.
test('non-zero correction: corrected = noisy x[0] xor flip', () => {
  const d = 3;
  const r = 3;
  const layout = layoutFor(d, r);
  const readout = createFlatReadout({ epsilon: 0 });
  const graph = buildGraph(d, r);
  const l0 = new Uint8Array((d - 1) * r + d);
  l0[layout.data[0]] = 1; // data qubit 0 flipped after the last round: x = 100
  const a = decodeShot({ shotBits: l0, layout, d, r, readout, mode: 'hard', pGate: 0.01, rng: createRng(4), logical: 0 });
  assert.equal(a.hardData[0], 1);
  assert.equal(a.flip, 1);
  assert.equal(a.corrected, 0);
  assert.equal(a.logicalError, 0);
  assert.equal(a.paths.length, 1);
  assert.equal(graph.edges[a.paths[0].edges[0]].observable, true);
  const wrongState = decodeShot({ shotBits: l0, layout, d, r, readout, mode: 'hard', pGate: 0.01, rng: createRng(4), logical: 1 });
  assert.equal(wrongState.logicalError, 1);

  const l1 = new Uint8Array((d - 1) * r + d);
  l1[layout.data[1]] = 1;
  l1[layout.data[2]] = 1; // logical 1 with data qubit 0 flipped: x = 011
  const b = decodeShot({ shotBits: l1, layout, d, r, readout, mode: 'hard', pGate: 0.01, rng: createRng(4), logical: 1 });
  assert.equal(b.hardData[0], 0);
  assert.equal(b.flip, 1);
  assert.equal(b.corrected, 1);
  assert.equal(b.logicalError, 0);
});

// Statistical test (fixed seeds). Catches: fails if soft decoding is not better than hard
// on data drawn from the decoder's own edge model (every edge of the d = 3, r = 3 graph
// flips with pGate = 0.0125) read out with the ion card at tau = 5 us, both logical states
// pooled; a wrong llr sign, a soft weight read from the wrong measurement or a broken
// pFromLlr would remove the gain. Hard and soft see identical readout draws (same rng seed
// per shot), so the comparison is paired: with b shots wrong only in hard and c wrong only
// in soft, out of n, the SE of (errors_hard - errors_soft) is sqrt(b + c - (b - c)^2 / n).
// Pass: errors_hard - errors_soft > 4 SE (about 7.8 SE with these seeds). Per logical state
// soft is worse on L0 and better on L1 (minimum-weight matching with correct priors
// minimises the error averaged over L), so only the pooled rate is asserted.
test('soft beats hard on model-matched synthetic data (ion, tau = 5), paired, > 4 SE', () => {
  const d = 3;
  const r = 3;
  const pGate = 0.0125;
  const nPerState = 20000;
  const layout = layoutFor(d, r);
  const readout = createIonReadout(ionCard, 5);
  const draw = (logical, g) => {
    const e = new Uint8Array(d).fill(logical);
    const m = [];
    for (let k = 0; k < r; k++) {
      for (let i = 0; i < d; i++) if (g.uniform() < pGate) e[i] ^= 1; // space-like, layer k
      m.push(Array.from({ length: d - 1 }, (_, j) => e[j] ^ e[j + 1]));
    }
    for (let k = 0; k < r; k++) for (let j = 0; j < d - 1; j++) if (g.uniform() < pGate) m[k][j] ^= 1; // time-like
    for (let i = 0; i < d; i++) if (g.uniform() < pGate) e[i] ^= 1; // space-like, layer r
    const bits = new Uint8Array((d - 1) * r + d);
    m.forEach((row, k) => row.forEach((v, j) => { bits[layout.ancilla[k][j]] = v; }));
    e.forEach((v, i) => { bits[layout.data[i]] = v; });
    return bits;
  };
  let hard = 0;
  let soft = 0;
  let b = 0;
  let c = 0;
  for (const logical of [0, 1]) {
    const g = createRng(31 + logical);
    for (let s = 0; s < nPerState; s++) {
      const shotBits = draw(logical, g);
      const seed = 700000 + 100000 * logical + s;
      const h = decodeShot({ shotBits, layout, d, r, readout, mode: 'hard', pGate, rng: createRng(seed), logical }).logicalError;
      const so = decodeShot({ shotBits, layout, d, r, readout, mode: 'soft', pGate, rng: createRng(seed), logical }).logicalError;
      hard += h;
      soft += so;
      if (h && !so) b++;
      if (so && !h) c++;
    }
  }
  const n = 2 * nPerState;
  const se = Math.sqrt(b + c - (b - c) ** 2 / n);
  assert.ok(hard - soft > 4 * se, `hard ${hard}, soft ${soft}, paired SE ${se.toFixed(1)}`);
});
