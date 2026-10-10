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

// ---- CC-A12: naive and learned noise models ----

// Pinned output of the pre-CC-A12 decodeShot (pGate only, no noise argument), computed with
// that version on this shot: d = 5, r = 3, ion card at tau = 7 us, pGate 0.012, seed 4242,
// bits m[0][1], m[1][1], m[1][3], x[0], x[4] set. Hard and soft choose different matchings.
const PIN_PRE_A12 = {
  detectors: [0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 1, 0, 0, 1],
  hardData: [1, 0, 0, 0, 1],
  llrData: [9.622314262672328, -3.2874774190785274, -3.2874774190785274, -3.2874774190785274, 10.290388751668962],
  hard: [{ a: 1, b: 9, edges: [21, 25] }, { a: 7, b: 11, edges: [27] }, { a: 12, b: 'B', edges: [15] }, { a: 15, b: 'B', edges: [19] }],
  soft: [{ a: 1, b: 9, edges: [21, 25] }, { a: 7, b: 'B', edges: [9] }, { a: 11, b: 15, edges: [31] }, { a: 12, b: 'B', edges: [15] }],
};

// Catches: fails if the naive model changed with CC-A12 (graph gains diagonal edges, weights
// differ, the idle or readout draw order moves, or basis "Z" changes the idle probability),
// for either calling form: pGate alone (every pre-CC-A12 caller) and noise { model: "naive" }.
test('naive decodeShot reproduces the pre-CC-A12 result on a fixed shot, both call forms', () => {
  const d = 5;
  const r = 3;
  const layout = layoutFor(d, r);
  const shotBits = new Uint8Array((d - 1) * r + d);
  for (const [k, j] of [[0, 1], [1, 1], [1, 3]]) shotBits[layout.ancilla[k][j]] = 1;
  shotBits[layout.data[0]] = 1;
  shotBits[layout.data[4]] = 1;
  const readout = createIonReadout(ionCard, 7);
  for (const mode of ['hard', 'soft']) {
    const forms = [
      { pGate: 0.012 },
      { noise: { model: 'naive', pGate: 0.012 } },
      { noise: { model: 'naive', pGate: 0.012 }, basis: 'Z' },
    ];
    for (const form of forms) {
      const res = decodeShot({ shotBits, layout, d, r, readout, mode, rng: createRng(4242), logical: 0, ...form });
      const label = `${mode} ${JSON.stringify(form)}`;
      assert.deepEqual(Array.from(res.detectors), PIN_PRE_A12.detectors, label);
      assert.deepEqual(Array.from(res.hardData), PIN_PRE_A12.hardData, label);
      res.llrData.forEach((l, i) => assert.ok(Math.abs(l - PIN_PRE_A12.llrData[i]) < 1e-9, `${label} llr ${i}`));
      assert.deepEqual(res.paths, PIN_PRE_A12[mode], label);
      assert.equal(res.flip, 1, label);
      assert.equal(res.nDefects, 6, label);
      assert.equal(res.logicalError, 0, label);
    }
  }
});

// Catches: fails if the V9 fingerprint moved (DECISIONS, Person A: 53933f98 for
// rep_d3_r3_L0), i.e. if diagnostic(bank) without options no longer runs the naive model with
// the same calibration, readout, seed and shots, or if { decoder: "naive" } differs from it.
test('diagnostic(rep_d3_r3_L0) still returns the recorded V9 hash', () => {
  const bank = JSON.parse(readFileSync(new URL('../data/banks/rep_d3_r3_L0.json', import.meta.url), 'utf8'));
  validateBank(bank);
  assert.equal(diagnostic(bank), '53933f98');
  assert.equal(diagnostic(bank, { decoder: 'naive' }), '53933f98');
  assert.match(diagnostic(bank, { decoder: 'learned' }), /^[0-9a-f]{8}$/);
  assert.throws(() => diagnostic(bank, { decoder: 'other' }), /decoder/);
});

// Distinct learned rates, so any class mix-up changes some weight.
const RATES = { space: 0.011, spaceBoundary: 0.007, time: 0.013, diag: 0.017 };

// Catches: fails if a learned edge takes the wrong class rate (spaceBoundary not used for data
// qubits 0 and d-1, or used for the bulk), if layer 0 gains the idle term or layers 1..r-1
// lose it, if the final layer or a time edge loses its readout term, if a diagonal edge gains
// an idle or readout term, or if the learned graph has no diagonal edges. Pins one edge of
// each class by id and restates the rule for every edge, hard and soft.
test('learned weight table: one edge of each class (including diag) pinned to its expected p', () => {
  const d = 5;
  const r = 3;
  const pIdle = 0.003;
  const pAvg = 0.02;
  const graph = buildGraph(d, r, { diagonal: true });
  const llrAnc = Array.from({ length: r }, (_, k) => Float64Array.from({ length: d - 1 }, (_, j) => 1 + 0.5 * (k * (d - 1) + j)));
  const llrData = Float64Array.from({ length: d }, (_, i) => 1 + 0.5 * (r * (d - 1) + i));
  const readout = stubReadout({ pIdle, pAvg });
  const find = (pred) => graph.edges.find(pred);
  for (const mode of ['hard', 'soft']) {
    const weights = edgeWeights(graph, { mode, rates: RATES, pIdle, readout, llrAnc, llrData });
    const pRead = (mag) => (mode === 'soft' ? pOfMag(mag) : pAvg);
    const pinned = [
      [find((e) => e.kind === 'space' && e.layer === 0 && e.dataQubit === 2), RATES.space],
      [find((e) => e.kind === 'space' && e.layer === 0 && e.dataQubit === 0), RATES.spaceBoundary],
      [find((e) => e.kind === 'space' && e.layer === 1 && e.dataQubit === d - 1), xor(RATES.spaceBoundary, pIdle)],
      [find((e) => e.kind === 'space' && e.layer === 2 && e.dataQubit === 3), xor(RATES.space, pIdle)],
      [find((e) => e.kind === 'space' && e.layer === r && e.dataQubit === 1), xor(RATES.space, pRead(1 + 0.5 * (r * (d - 1) + 1)))],
      [find((e) => e.kind === 'time' && e.round === 1 && e.check === 2), xor(RATES.time, pRead(1 + 0.5 * (1 * (d - 1) + 2)))],
      [find((e) => e.kind === 'diag' && e.round === 2 && e.dataQubit === 3), RATES.diag],
    ];
    for (const [e, p] of pinned) {
      assert.ok(e, 'edge exists');
      assert.ok(Math.abs(weights[e.id] - w(p)) < 1e-12, `${mode} ${e.kind} edge ${e.id}: ${weights[e.id]} vs ${w(p)}`);
    }
    assert.equal(graph.edges.filter((e) => e.kind === 'diag').length, r * (d - 2));
    for (const e of graph.edges) {
      let p;
      if (e.kind === 'diag') p = RATES.diag;
      else if (e.kind === 'time') p = xor(RATES.time, pRead(1 + 0.5 * (e.round * (d - 1) + e.check)));
      else {
        const base = e.dataQubit === 0 || e.dataQubit === d - 1 ? RATES.spaceBoundary : RATES.space;
        if (e.layer === 0) p = base;
        else if (e.layer < r) p = xor(base, pIdle);
        else p = xor(base, pRead(1 + 0.5 * (r * (d - 1) + e.dataQubit)));
      }
      assert.ok(Math.abs(weights[e.id] - w(p)) < 1e-12, `${mode} edge ${e.id} (${e.kind})`);
    }
  }
  // A diagonal edge without learned rates is an error, not a silent pGate edge.
  assert.throws(() => edgeWeights(graph, { mode: 'hard', pGate: 0.01, pIdle, readout, llrAnc, llrData }), /diagonal/);
});

// Catches: fails if decodeShot ignores noise { model: "learned" } (naive graph, no diagonal
// edges), if diagonal edges are marked observable, or if their weight is not w(rates.diag).
// A fault on data qubit 2 between its CNOTs into checks 1 and 2 in round 1 (d = 5, r = 3)
// sets m[1][2], m[2][2], m[2][1] and x[2], which lights exactly detectors (1, 2) and (2, 1):
// one diagonal edge. Learned: one path over that edge, flip 0, cost w(diag). Non-vacuous: the
// naive graph has no such edge and needs two edges for the same pair.
test('one fired diagonal edge decodes through that edge with the learned graph, flip 0, cost w(diag)', () => {
  const d = 5;
  const r = 3;
  const layout = layoutFor(d, r);
  const shotBits = new Uint8Array((d - 1) * r + d);
  shotBits[layout.ancilla[1][2]] = 1;
  shotBits[layout.ancilla[2][2]] = 1;
  shotBits[layout.ancilla[2][1]] = 1;
  shotBits[layout.data[2]] = 1;
  const readout = createFlatReadout({ epsilon: 0 });
  const idx = (k, j) => k * (d - 1) + j;

  const res = decodeShot({ shotBits, layout, d, r, readout, mode: 'hard', noise: { model: 'learned', rates: RATES }, rng: createRng(9), logical: 0 });
  const lit = Array.from(res.detectors).flatMap((v, i) => (v ? [i] : []));
  assert.deepEqual(lit, [idx(1, 2), idx(2, 1)]);
  assert.equal(res.flip, 0);
  assert.equal(res.logicalError, 0);
  assert.equal(res.paths.length, 1);
  assert.equal(res.paths[0].edges.length, 1);
  const graph = buildGraph(d, r, { diagonal: true });
  const edge = graph.edges[res.paths[0].edges[0]];
  assert.equal(edge.kind, 'diag');
  assert.equal(edge.observable, false);
  const weights = edgeWeights(graph, { mode: 'hard', rates: RATES, pIdle: 0, readout, llrAnc: res.llrAnc, llrData: res.llrData });
  const { cost } = decode(graph, weights, res.detectors);
  assert.ok(Math.abs(cost - w(RATES.diag)) < 1e-12, `cost ${cost} vs w(diag) ${w(RATES.diag)}`);

  const naive = decodeShot({ shotBits, layout, d, r, readout, mode: 'hard', noise: { model: 'naive', pGate: 0.01 }, rng: createRng(9), logical: 0 });
  assert.equal(naive.paths.length, 1);
  assert.equal(naive.paths[0].edges.length, 2);
});

// Catches: fails if runPoint drops bank.basis instead of passing it to the readout's
// idleFlipProbability, or if a malformed noise object is accepted silently.
test('runPoint passes bank.basis to idleFlipProbability; malformed noise throws', () => {
  const bank = cleanBank(3, 3, 0, 50);
  const seen = [];
  const readout = { ...stubReadout(), idleFlipProbability: (b) => { seen.push(b); return 0; } };
  runPoint({ bank, readout, mode: 'hard', noise: { model: 'learned', rates: RATES }, seed: 1 });
  assert.ok(seen.length > 0 && seen.every((b) => b === 'Z'));
  seen.length = 0;
  runPoint({ bank: { ...bank, basis: 'X' }, readout, mode: 'hard', pGate: 0.01, seed: 1 });
  assert.ok(seen.length > 0 && seen.every((b) => b === 'X'));
  assert.throws(() => runPoint({ bank, readout, mode: 'hard', noise: { model: 'learned', rates: { ...RATES, diag: undefined } }, seed: 1 }), /rates\.diag/);
  assert.throws(() => runPoint({ bank, readout, mode: 'hard', noise: { model: 'other' }, seed: 1 }), /noise\.model/);
});

// ---- tools/sweep.mjs helpers (CC-A14): error budget, crosstalk scan rates, C1 ion verdict ----

const { errorBudget, crosstalkScanRates, interiorBelowTauPhys } = await import('../tools/sweep.mjs');
const { createScReadout } = await import('../src/core/readout/sc.js');
const scCard = JSON.parse(readFileSync(new URL('../params/sc.json', import.meta.url), 'utf8'));
const cardValue = (card, name) => (card[name] !== null && typeof card[name] === 'object' ? card[name].value : card[name]);

// Catches: fails if the budget takes idle or crosstalk from the wrong basis (T1 instead of T2
// in the X basis), drops the crosstalk part, takes readout from anything other than the
// empirical array, averages the gate classes wrongly (or leaves one out), or if importing
// tools/sweep.mjs starts a stage (it would print and write results during the tests).
test('errorBudget: readout, idle and crosstalk per tau by basis; gate = mean of the four classes', () => {
  const taus = [1, 10, 100];
  const rate = 1e-3;
  const readouts = taus.map((tau) => createIonReadout(ionCard, tau, { crosstalkRate: rate }));
  const empirical = [0.1, 0.01, 0.001];
  const gateRates = { space: 0.01, spaceBoundary: 0.02, time: 0.03, diag: 0.04 };
  const t1 = cardValue(ionCard, 'T1_idle_us');
  const t2 = cardValue(ionCard, 'T2_idle_us');
  const half = (x) => 0.5 * (1 - Math.exp(-x));
  const rel = (a, b) => Math.abs(a - b) <= 1e-5 * Math.abs(b); // results are rounded to 6 significant digits
  for (const basis of ['Z', 'X']) {
    const b = errorBudget({ taus, readouts, empirical, basis, gateRates });
    assert.equal(b.label, 'error sources per round, per qubit (approximate)');
    assert.deepEqual(b.tau_us, taus);
    assert.deepEqual(b.readout, empirical);
    assert.ok(Math.abs(b.gate - 0.025) < 1e-12, `gate ${b.gate}`);
    taus.forEach((tau, t) => {
      const idle = half(tau / (basis === 'Z' ? t1 : t2));
      assert.ok(rel(b.idle[t], idle), `${basis} idle at tau ${tau}: ${b.idle[t]} vs ${idle}`);
      assert.ok(rel(b.crosstalk[t], half(rate * tau)), `${basis} crosstalk at tau ${tau}: ${b.crosstalk[t]}`);
    });
  }
  // T2 < T1 on the card, so the X-basis idle part is larger.
  const z = errorBudget({ taus, readouts, empirical, basis: 'Z', gateRates });
  const x = errorBudget({ taus, readouts, empirical, basis: 'X', gateRates });
  assert.ok(x.idle[2] > z.idle[2]);
  // Superconducting: no crosstalk part.
  const sc = errorBudget({ taus: [0.5], readouts: [createScReadout(scCard, 0.5)], empirical: [0.01], basis: 'X', gateRates });
  assert.deepEqual(sc.crosstalk, [0]);
  assert.throws(() => errorBudget({ taus, readouts, empirical, basis: 'Z', gateRates: { ...gateRates, diag: undefined } }), /gateRates\.diag/);
  assert.throws(() => errorBudget({ taus, readouts: readouts.slice(1), empirical, basis: 'Z', gateRates }), /readouts/);
});

// Catches: fails if the card crosstalk rate is not added to the scan when it is off the grid,
// is added twice when it is on the grid, or if the rates are not in ascending order.
test('crosstalkScanRates adds the card value once and sorts', () => {
  const grid = [0, 1e-6, 1e-5, 1e-4, 1e-3];
  assert.deepEqual(crosstalkScanRates(grid, 1.67e-5), [0, 1e-6, 1e-5, 1.67e-5, 1e-4, 1e-3]);
  assert.deepEqual(crosstalkScanRates(grid, 1e-5), grid);
  assert.deepEqual(crosstalkScanRates(grid, undefined), grid);
});

// Catches: fails if a tau*_log at the grid edge counts as interior, or if the comparison with
// tau*_phys is <= instead of <. Boundary: xMin exactly at tau*_phys is not below it; one step
// of 0.01 us below it is.
test('interiorBelowTauPhys: strict, interior only; boundary at tau*_phys', () => {
  const tauPhys = 23.4849;
  assert.equal(interiorBelowTauPhys({ xMin: tauPhys, atEdge: false }, tauPhys), false);
  assert.equal(interiorBelowTauPhys({ xMin: tauPhys - 0.01, atEdge: false }, tauPhys), true);
  assert.equal(interiorBelowTauPhys({ xMin: 1, atEdge: true }, tauPhys), false);
});

// ---- tools/sweep.mjs helpers (CC-A19): dense grid, shiftDelta, --set overrides ----

const { denseGrid, shiftDeltaPoints, shiftDelta, applyOverrides } = await import('../tools/sweep.mjs');

// Catches: fails if the dense band misses a point of 0.40..1.30 in 0.05 steps, repeats a card
// point that is already in the band (0.4, 0.5, 0.7, 1.0), drops a card point, or is unsorted.
test('denseGrid: the card grid plus 0.40..1.30 us in 0.05 steps, once each, ascending', () => {
  const card = cardValue(scCard, 'tau_grid_us');
  const g = denseGrid(card);
  for (let k = 40; k <= 130; k += 5) assert.equal(g.filter((x) => Math.abs(x - k / 100) < 1e-9).length, 1, `tau ${k / 100}`);
  for (const x of card) assert.ok(g.includes(x), `card point ${x}`);
  for (let i = 1; i < g.length; i++) assert.ok(g[i] > g[i - 1]);
  assert.equal(g.length, card.length + 19 - card.filter((x) => x >= 0.4 - 1e-9 && x <= 1.3 + 1e-9 && Math.abs(x * 20 - Math.round(x * 20)) < 1e-9).length);
});

// Catches: fails if tauRef is the nearest point in tau instead of ln tau, or tauShort is not the
// point below it. Boundary: on [1, 2, 4] the ln-midpoint of 2 and 4 is sqrt(8) = 2.828;
// tauPhys = 2.82 gives tauRef 2 and 2.83 (a step of 0.01 past) gives 4 (in linear tau both
// would give 2, since the linear midpoint is 3). At the grid start there is no tauShort.
test('shiftDeltaPoints: nearest grid point in ln tau, the point below it; dense step 0.15 us', () => {
  const taus = [1, 2, 4];
  assert.deepEqual(shiftDeltaPoints(taus, 2.82), { ref: 1, short: 0 });
  assert.deepEqual(shiftDeltaPoints(taus, 2.83), { ref: 2, short: 1 });
  assert.equal(shiftDeltaPoints(taus, 1.1), null);
  const dense = denseGrid(cardValue(scCard, 'tau_grid_us'));
  const p = shiftDeltaPoints(dense, 0.9, { dense: true });
  assert.ok(Math.abs(dense[p.ref] - 0.9) < 1e-9 && Math.abs(dense[p.short] - 0.75) < 1e-9, JSON.stringify(p));
  // tauRef 0.4: 0.25 us is not on the dense grid, so there is no dense tauShort.
  assert.equal(shiftDeltaPoints(dense, 0.41, { dense: true }), null);
});

// Catches: fails if diff has the wrong sign (pL(tauShort) - pL(tauRef)), if tauRef and tauShort
// are swapped, or if "resolved" accepts lo = 0. Identical rows give lo = 0 exactly (boundary:
// not resolved); adding failures at tauRef on every 4th shot (shift 0.25 * 2 / 2 = 0.25 of a
// rate, many SE from 0 at n = 400) is resolved.
test('shiftDelta: paired pL(tauRef) - pL(tauShort); resolved only when lo > 0', () => {
  const taus = [1, 2, 4];
  const n = 400;
  const base = Uint8Array.from({ length: n }, (_, i) => (i % 10 === 0 ? 1 : 0));
  const flat = shiftDelta(taus, 2, [base, base, base], 2, 200, createRng(19));
  assert.deepEqual(flat, { tauRef: 2, tauShort: 1, diff: 0, lo: 0, hi: 0, resolved: false });
  const up = Uint8Array.from(base, (f, i) => (i % 4 === 0 ? 2 : f));
  const s = shiftDelta(taus, 2, [base, up, base], 2, 200, createRng(19));
  const expected = up.reduce((a, f, i) => a + f - base[i], 0) / (n * 2);
  assert.ok(Math.abs(s.diff - expected) < 1e-12, `${s.diff} vs ${expected}`);
  assert.ok(s.resolved && s.lo > 0, JSON.stringify(s));
  const down = shiftDelta(taus, 2, [up, base, base], 2, 200, createRng(19));
  assert.ok(down.diff < 0 && !down.resolved, JSON.stringify(down));
});

// Catches: fails if --set changes the loaded card object in place, drops the field's object form,
// accepts a key the card does not have, or bypasses the card checks: T2 <= 2*T1 (T1 = 50 us)
// must still be enforced by createScReadout. Boundary: T2 = 100 us is allowed, 100.5 us is not.
test('applyOverrides: --set T2_us=25 on a copy; unknown keys refused; card checks still run', () => {
  const before = JSON.stringify(scCard);
  const { card, overrides } = applyOverrides(scCard, ['T2_us=25']);
  assert.equal(JSON.stringify(scCard), before);
  assert.equal(card.T2_us.value, 25);
  assert.equal(card.T2_us.source, 'override (--set)');
  assert.deepEqual(overrides, { T2_us: 25 });
  assert.ok(Math.abs(createScReadout(card, 0.5).idleBreakdown('X').idle - 0.5 * (1 - Math.exp(-0.5 / 25))) < 1e-15);
  assert.throws(() => applyOverrides(scCard, ['T3_us=25']), /unknown parameter-card key T3_us/);
  assert.throws(() => applyOverrides(scCard, ['T2_us']), /key=value/);
  assert.doesNotThrow(() => createScReadout(applyOverrides(scCard, ['T2_us=100']).card, 0.5));
  assert.throws(() => createScReadout(applyOverrides(scCard, ['T2_us=100.5']).card, 0.5), /exceeds 2 \* T1_us/);
});

// ---- tools/sweep.mjs helpers (CC-A21): Stage holdout, V18 ----

const { parseHeldoutName, holdoutTrainingFiles, holdoutTraining, v18Verdict } = await import('../tools/sweep.mjs');

// Catches: fails if a held-out bank reaches ratesFromBanks or estimatePGate in Stage holdout:
// the training files must be the original L0/L1 names (never an _h suffix), holdoutTraining must
// pass only the banks it was given to ratesFromBanks and (through detectorArraysOf) to
// estimatePGate, and it must refuse a held-out bank by name or by directory.
test('holdout: nothing is learned from a held-out bank', () => {
  assert.deepEqual(holdoutTrainingFiles(5, 3), ['rep_d5_r3_L0.json', 'rep_d5_r3_L1.json']);
  for (const f of holdoutTrainingFiles(3, 3)) assert.equal(parseHeldoutName(f), null);
  assert.deepEqual(parseHeldoutName('rep_d5_r3_L1_h4.json'), { d: 5, r: 3, L: 1, h: 4 });
  const train = [0, 1].map((L) => ({ file: `rep_d3_r3_L${L}.json`, bank: cleanBank(3, 3, L, 10) }));
  const seen = { rates: [], det: [] };
  const deps = {
    ratesFromBanks: (banks) => { seen.rates.push(...banks); return { classes: { space: 0.01, spaceBoundary: 0.01, time: 0.01, diag: 0.01 } }; },
    detectorArraysOf: (bank) => { seen.det.push(bank); return []; },
    estimatePGate: () => ({ p: 0.01 }),
  };
  const out = holdoutTraining(train, 3, 3, deps);
  assert.equal(out.pGate, 0.01);
  assert.deepEqual(seen.rates, train.map((b) => b.bank));
  assert.deepEqual(seen.det, train.map((b) => b.bank));
  const held = { file: 'rep_d3_r3_L0_h1.json', bank: cleanBank(3, 3, 0, 10) };
  assert.throws(() => holdoutTraining([train[0], held], 3, 3, deps), /held-out bank rep_d3_r3_L0_h1\.json/);
  assert.throws(() => holdoutTraining([{ file: 'data/banks/heldout/rep_d3_r3_L0.json', bank: train[0].bank }], 3, 3, deps), /held-out/);
});

// Catches: fails if V18 passes on clause 1 alone, if clause 2 uses overlapping intervals or the
// d = 3 row, or if clause 1 is not required at every row. Boundary for clause 2: learned.hi
// equal to naive.lo is not "beyond" (fail); 1e-5 below it is (pass).
test('v18Verdict: the V12(b) two-clause rule; clause 1 alone is not a pass', () => {
  const row = (d, nk, nlo, lk, lhi) => ({ d, naive: { k: nk, lo: nlo }, learned: { k: lk, hi: lhi } });
  assert.deepEqual(v18Verdict([row(3, 10, 0.001, 9, 0.01), row(5, 20, 0.002, 9, 0.002)]), { clause1: true, clause2: false, verdict: 'fail' });
  assert.deepEqual(v18Verdict([row(3, 10, 0.001, 9, 0.01), row(5, 20, 0.002, 9, 0.002 - 1e-5)]), { clause1: true, clause2: true, verdict: 'pass' });
  assert.deepEqual(v18Verdict([row(3, 10, 0.001, 11, 0.01), row(5, 20, 0.002, 9, 0.001)]), { clause1: false, clause2: true, verdict: 'fail' });
  assert.equal(v18Verdict([row(3, 10, 0.5, 1, 0.1)]).verdict, 'fail'); // no d = 5 row
});

// ---- CC-A22: final Stage 4 helpers ----
const { STAGE4_INPUTS, pickStage4Input, cardMatchesParams, unpairedClusterDiff, perRoundBounds, c6Conclusion, PLAIN } = await import('../tools/sweep.mjs');
const { perRound: perRoundM, perMicrosecond: perMicrosecondM } = await import('../src/core/metrics.js');

// Catches: fails if Stage 4 reads the pre-2.1 files (stage2_ion.json, stage3_sc.json) instead of
// the v2b and dense ones, if the X-basis superconducting input does not fall back to the
// standard-grid file when the dense one is missing, or if a missing input passes silently.
test('pickStage4Input: v2b and dense files; X superconducting falls back to the standard grid', () => {
  assert.equal(pickStage4Input('Z', 'trapped-ion', () => true), 'stage2_ion_v2b.json');
  assert.equal(pickStage4Input('Z', 'superconducting', () => true), 'stage3_sc_dense.json');
  assert.equal(pickStage4Input('X', 'trapped-ion', () => true), 'stage2_ion_x_v2b.json');
  assert.equal(pickStage4Input('X', 'superconducting', () => true), 'stage3_sc_x_dense.json');
  assert.equal(pickStage4Input('X', 'superconducting', (n) => n !== 'stage3_sc_x_dense.json'), 'stage3_sc_x.json');
  assert.throws(() => pickStage4Input('Z', 'superconducting', () => false), /stage3_sc_dense\.json/);
  assert.ok(!Object.values(STAGE4_INPUTS).some((b) => Object.values(b).flat().includes('stage2_ion.json')));
});

// Catches: fails if a results file whose card differs from params/*.json is accepted, or if a
// difference recorded in provenance.overrides (--set) is refused. Boundary: the recorded
// override T2_us = 25 with a file card at 25 matches; the same record with the file at 26 does not.
test('cardMatchesParams: equal cards and recorded overrides pass; anything else is refused', () => {
  assert.equal(cardMatchesParams(scCard, scCard, {}), true);
  const at = (v) => ({ ...scCard, T2_us: { ...scCard.T2_us, value: v, source: 'override (--set)' } });
  assert.equal(cardMatchesParams(at(25), scCard, { T2_us: 25 }), true);
  assert.equal(cardMatchesParams(at(26), scCard, { T2_us: 25 }), false);
  assert.equal(cardMatchesParams(at(25), scCard, {}), false);
  assert.equal(cardMatchesParams({ ...scCard, eta: { ...scCard.eta, value: 0.31 } }, scCard, undefined), false);
});

// Catches: fails if the unpaired difference uses the wrong sign (it is b - a), adds the
// half-widths linearly instead of in quadrature, or pairs a lower bound with a lower bound.
// Hand numbers: a = 0.010 (0.008, 0.013), b = 0.014 (0.011, 0.018): diff 0.004,
// lo = 0.004 - hypot(0.003, 0.003), hi = 0.004 + hypot(0.004, 0.002).
test('unpairedClusterDiff: b - a with cluster half-widths in quadrature', () => {
  const r = unpairedClusterDiff({ pL: 0.010, loCluster: 0.008, hiCluster: 0.013 }, { pL: 0.014, loCluster: 0.011, hiCluster: 0.018 });
  assert.ok(Math.abs(r.diff - 0.004) < 1e-15);
  assert.ok(Math.abs(r.lo - (0.004 - Math.hypot(0.003, 0.003))) < 1e-15);
  assert.ok(Math.abs(r.hi - (0.004 + Math.hypot(0.004, 0.002))) < 1e-15);
});

// Catches: fails if the cluster bounds are not carried through the per-round transform and on to
// per microsecond the same way as the value (perRound, then divide by the cycle time), or if lo
// and hi are swapped.
test('perRoundBounds: cluster bounds through perRound and perMicrosecond', () => {
  const b = perRoundBounds(0.002, 0.005, 3, 1.1);
  assert.equal(b.perRound.lo, perRoundM(0.002, 3));
  assert.equal(b.perRound.hi, perRoundM(0.005, 3));
  assert.equal(b.perMicrosecond.lo, perMicrosecondM(perRoundM(0.002, 3), 1.1));
  assert.ok(b.perRound.lo < b.perRound.hi && b.perMicrosecond.lo < b.perMicrosecond.hi);
});

// Synthetic superconducting files for C6: one (d = 3, hard) learned tau*_log per file.
function c6Files({ zTau, xTau, xTied = 0, T1 = 50, T2 = 77 }) {
  const res = (tl, card) => ({
    x: { values: [0.5, 0.7, 1] },
    params: { card },
    optima: { tauLog: [{ d: 3, mode: 'hard', decoder: 'learned', ...tl }] },
    series: [{ d: 3, mode: 'hard', decoder: 'learned', pL: [0.01, 0.008, 0.009], loCluster: [0.009, 0.007, 0.008], hiCluster: [0.011, 0.009, 0.010] }],
  });
  const card = { ...scCard, T1_us: { ...scCard.T1_us, value: T1 }, T2_us: { ...scCard.T2_us, value: T2 } };
  return {
    Z: { names: { superconducting: 'z.json' }, superconducting: res({ xMin: zTau[0], lo: zTau[1], hi: zTau[2], fractionTied: 0 }, card) },
    X: { names: { superconducting: 'x.json' }, superconducting: res({ xMin: xTau[0], lo: xTau[1], hi: xTau[2], fractionTied: xTied }, card) },
  };
}

// Catches: fails if C6 gets a held/refuted verdict while its premise T2 < T1 is not met (it must
// be "not applicable"), if the premise check is <= instead of <, or if an UNRESOLVED tau*_log
// (fractionTied >= 0.5) enters the rule. Boundary: T2 = T1 = 50 is not applicable, T2 = 49 with
// X entirely below Z is held; an X row tied exactly 50% is left out (undetermined), 49.5% is used.
test('c6Conclusion: not applicable unless T2 < T1; the tie rule excludes UNRESOLVED rows', () => {
  const below = { zTau: [0.8, 0.75, 0.85], xTau: [0.6, 0.55, 0.65] };
  const na = c6Conclusion(c6Files({ ...below, T2: 50 }), null);
  assert.equal(na.conclusion.verdict, 'not applicable');
  assert.equal(na.conclusion.automated, 'not applicable');
  assert.equal(na.detail.ruleResultWithCard, 'held');
  assert.equal(c6Conclusion(c6Files({ ...below, T2: 49 }), null).conclusion.verdict, 'held');
  assert.equal(c6Conclusion(c6Files({ ...below, T2: 49, xTied: 0.5 }), null).conclusion.verdict, 'undetermined');
  assert.equal(c6Conclusion(c6Files({ ...below, T2: 49, xTied: 0.495 }), null).conclusion.verdict, 'held');
  // Variant card: its rule result goes to the detail; the verdict stays "not applicable".
  const variant = c6Files({ ...below, T2: 25 }).X.superconducting;
  const withVariant = c6Conclusion(c6Files({ ...below, T2: 77 }), variant);
  assert.equal(withVariant.conclusion.verdict, 'not applicable');
  assert.equal(withVariant.detail.variant.result, 'held');
  assert.match(withVariant.conclusion.note, /UNSOURCED/);
  assert.equal(withVariant.detail.variant.cases['d3 hard'].pLDiff.paired, false);
});

// Catches: fails if a draft plain-language sentence grows past the 20-word limit of CC-A22, or if
// a conclusion verdict, the framing or F1 has no draft at all.
test('PLAIN: a draft of at most 20 words for every conclusion verdict, F1 and the framing', () => {
  const words = (s) => s.trim().split(/\s+/).length;
  const all = [PLAIN.framing, PLAIN.F1, ...['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'O4'].flatMap((id) => Object.values(PLAIN[id]))];
  for (const s of all) {
    assert.ok(s.length > 0);
    assert.ok(words(s) <= 20, `${words(s)} words: ${s}`);
  }
  assert.ok('not applicable' in PLAIN.C6);
});
