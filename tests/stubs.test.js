import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRng } from '../src/core/rng.js';
import { validateBank, expandShots } from '../src/core/bank.js';
import { createFlatReadout } from '../src/ui/stubs/flat_stub.js';
import { createIonReadout } from '../src/ui/stubs/ion_stub.js';
import { createScReadout } from '../src/ui/stubs/sc_stub.js';
import { decodeShot, runPoint, diagnostic } from '../src/ui/stubs/sweep_stub.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`../data/fixtures/${name}`, import.meta.url), 'utf8'));
const sortedKeys = (o) => Object.keys(o).sort();

const paramsIon = fixture('params_ion.json');
const paramsSc = fixture('params_sc.json');
const bankD3R1 = fixture('rep_d3_r1_L0.json');
const bankD3R3 = fixture('rep_d3_r3_L0.json');

const READOUT_FIELDS = ['averageAssignmentError', 'idleFlipProbability', 'measure'];

// Catches: a readout stub whose method set differs from the Module API (a method
// missing, renamed, or an extra one the real module will not have), or whose
// measure result lacks hard or llr.
test('readout stubs expose exactly the Module API methods', () => {
  const rng = createRng(1);
  const cases = [
    [createFlatReadout({ epsilon: 0.02 }), []],
    [createIonReadout(paramsIon, 100), ['countHistogram']],
    [createScReadout(paramsSc, 0.5), ['iqSamples', 'snr']],
  ];
  for (const [ro, extra] of cases) {
    assert.deepEqual(sortedKeys(ro), [...READOUT_FIELDS, ...extra].sort());
    for (const bit of [0, 1]) {
      const res = ro.measure(bit, rng);
      assert.ok(res.hard === 0 || res.hard === 1);
      assert.equal(typeof res.llr, 'number');
    }
    assert.equal(typeof ro.idleFlipProbability(), 'number');
    assert.equal(typeof ro.averageAssignmentError(), 'number');
  }
});

// Catches: the flat stub drifting from the real flat model's contract (llr sign
// or magnitude, assignment error not equal to epsilon, infinite llr at epsilon 0),
// and the 0 <= epsilon < 0.5 boundary: 0.49 is accepted, 0.5 is rejected.
test('flat stub: llr, assignment error and epsilon range', () => {
  const rng = createRng(2);
  const ro = createFlatReadout({ epsilon: 0.1 });
  const res = ro.measure(1, rng);
  assert.equal(res.llr, (res.hard === 1 ? 1 : -1) * Math.log(0.9 / 0.1));
  assert.equal(ro.averageAssignmentError(), 0.1);
  assert.equal(createFlatReadout({ epsilon: 0 }).measure(0, rng).llr, -Infinity);
  assert.doesNotThrow(() => createFlatReadout({ epsilon: 0.49 }));
  assert.throws(() => createFlatReadout({ epsilon: 0.5 }));
});

// Catches: an ion llr that is not n ln(Rb/Rd) - (Rb - Rd) tau, a histogram whose
// entries do not sum to nSamples, or an idle-flip probability other than 0.
test('ion stub: closed-form llr and histogram shape', () => {
  const Rb = paramsIon.R_bright_per_us.value;
  const Rd = paramsIon.R_dark_per_us.value;
  const tau = 100;
  const ro = createIonReadout(paramsIon, tau);
  const res = ro.measure(1, createRng(3));
  assert.ok(Math.abs(res.llr - (res.n * Math.log(Rb / Rd) - (Rb - Rd) * tau)) < 1e-9);
  const h = ro.countHistogram(1, 500, createRng(4));
  assert.ok(Array.isArray(h));
  assert.equal(h.reduce((a, b) => a + b, 0), 500);
  assert.equal(ro.idleFlipProbability(), 0);
  const e = ro.averageAssignmentError();
  assert.ok(e > 0 && e < 0.5);
});

// Catches: sc helpers with the wrong shape (iqSamples not [{ i, q }] of length n),
// snr not 4 sqrt(tau), or an assignment error that is not the normal tail
// 0.5 erfc(SNR / (2 sqrt 2)) (at tau = 1: SNR = 4, tail = Phi(-2) = 0.0227501).
test('sc stub: snr, normal-tail error, idle flip and iqSamples', () => {
  const ro = createScReadout(paramsSc, 1);
  assert.equal(ro.snr(), 4);
  assert.ok(Math.abs(ro.averageAssignmentError() - 0.0227501) < 1e-6);
  assert.ok(Math.abs(ro.idleFlipProbability() - 0.5 * (1 - Math.exp(-1 / 50))) < 1e-15);
  const iq = ro.iqSamples(1, 7, createRng(5));
  assert.equal(iq.length, 7);
  for (const p of iq) assert.deepEqual(sortedKeys(p), ['i', 'q']);
});

// Catches: decodeShot returning a field set that differs from the Module API, or
// hardAnc / llrAnc without r rows of length d-1, or an error-free shot with
// perfect readout producing defects or a logical error.
test('sweep stub: decodeShot returns exactly the API fields', () => {
  const d = 3;
  const r = 3;
  const shotBits = new Uint8Array((d - 1) * r + d); // all zeros: no errors, logical 0
  const res = decodeShot({
    shotBits, layout: bankD3R3.layout, d, r,
    readout: createFlatReadout({ epsilon: 0 }), mode: 'hard', pGate: 0.01, rng: createRng(6),
  });
  assert.deepEqual(sortedKeys(res), [
    'corrected', 'detectors', 'exact', 'flip', 'hardAnc', 'hardData', 'llrAnc', 'llrData',
    'logicalError', 'nDefects', 'paths',
  ]);
  assert.equal(res.hardAnc.length, r);
  assert.equal(res.llrAnc.length, r);
  for (const row of [...res.hardAnc, ...res.llrAnc]) assert.equal(row.length, d - 1);
  assert.equal(res.hardData.length, d);
  assert.equal(res.llrData.length, d);
  assert.equal(res.detectors.length, (d - 1) * (r + 1));
  assert.equal(res.nDefects, 0);
  assert.equal(res.logicalError, false);
});

// Catches: runPoint or its wilson field with the wrong field set, maxShots not
// limiting n, or diagnostic not returning the fixed 8-character stub marker.
test('sweep stub: runPoint and diagnostic return exactly the API fields', () => {
  const res = runPoint({
    bank: bankD3R3, readout: createFlatReadout({ epsilon: 0.02 }), mode: 'hard', pGate: 0.02, seed: 7, maxShots: 200,
  });
  assert.deepEqual(sortedKeys(res), ['k', 'n', 'nonExact', 'wilson']);
  assert.deepEqual(sortedKeys(res.wilson), ['hi', 'lo', 'p']);
  assert.equal(res.n, 200);
  assert.ok(res.k >= 0 && res.k <= res.n);
  assert.ok(res.wilson.lo <= res.wilson.p && res.wilson.p <= res.wilson.hi);
  assert.equal(diagnostic(bankD3R3), 'stub0000');
  assert.match(diagnostic(bankD3R3), /^[0-9a-z]{8}$/);
});

const RESULTS_123 = ['schema', 'stage', 'platform', 'x', 'series', 'params', 'provenance'];
const SERIES = ['d', 'r', 'mode', 'pL', 'lo', 'hi', 'n'];
const PARAM_ION = [
  'schema', 'platform', 'bright_is_bit', 'R_bright_per_us', 'R_dark_per_us',
  'gamma_bright_to_dark_per_us', 'gamma_dark_to_bright_per_us', 'T1_idle_us', 'tau_grid_us',
];
const PARAM_SC = [
  'schema', 'platform', 'chi_over_2pi_MHz', 'kappa_over_2pi_MHz', 'nbar', 'eta', 'T1_us',
  'detection', 'ringup', 'tau_grid_us',
];
const CYCLE = ['two_qubit_gate_us', 'gate_layers_per_round', 'reset_us'];
const hasAll = (obj, fields, where) => {
  for (const f of fields) assert.ok(f in obj, `${where}: missing "${f}"`);
};

// Catches: a fixture file missing "fixture": true (so the release check could not
// tell it from real data), or one that drops a field the CLAUDE.md results format
// or the checklist parameter-card template requires, or whose arrays do not line up
// with the x grid.
test('every fixture file has its required fields and "fixture": true', () => {
  const names = [
    'stage1_flat.json', 'stage2_ion.json', 'stage3_sc.json', 'stage4_comparison.json',
    'rep_d3_r1_L0.json', 'rep_d3_r3_L0.json', 'params_ion.json', 'params_sc.json', 'params_cycle.json',
  ];
  for (const name of names) assert.equal(fixture(name).fixture, true, name);

  for (const [name, stage, platform, xName] of [
    ['stage1_flat.json', 1, 'flat', 'epsilon'],
    ['stage2_ion.json', 2, 'trapped-ion', 'tau_us'],
    ['stage3_sc.json', 3, 'superconducting', 'tau_us'],
  ]) {
    const st = fixture(name);
    hasAll(st, RESULTS_123, name);
    assert.equal(st.schema, 's2s-results/1');
    assert.equal(st.stage, stage);
    assert.equal(st.platform, platform);
    assert.equal(st.x.name, xName);
    const nx = st.x.values.length;
    for (const s of st.series) {
      hasAll(s, SERIES, `${name} series`);
      assert.ok(s.mode === 'hard' || s.mode === 'soft');
      for (const f of ['pL', 'lo', 'hi', 'n']) assert.equal(s[f].length, nx, `${name} ${f}`);
    }
    if (stage > 1) {
      hasAll(st.assignment, ['belief', 'empirical', 'lo', 'hi'], `${name} assignment`);
      for (const f of ['belief', 'empirical', 'lo', 'hi']) assert.equal(st.assignment[f].length, nx);
      hasAll(st.optima.tauPhys, ['xMin', 'atEdge'], `${name} tauPhys`);
      for (const o of st.optima.tauLog) hasAll(o, ['d', 'mode', 'xMin', 'lo', 'hi', 'atEdge'], `${name} tauLog`);
    }
  }

  const st4 = fixture('stage4_comparison.json');
  hasAll(st4, ['schema', 'stage', 'platforms', 'sensitivity', 'provenance'], 'stage4');
  assert.equal(st4.schema, 's2s-results/1');
  assert.equal(st4.stage, 4);
  for (const pf of ['trapped-ion', 'superconducting']) {
    const P = st4.platforms[pf];
    hasAll(P, ['tauLog', 'perRound', 'perMicrosecond', 'breakEven'], `stage4 ${pf}`);
    hasAll(P.perRound, ['hard', 'soft'], `stage4 ${pf} perRound`);
    hasAll(P.perMicrosecond, ['hard', 'soft'], `stage4 ${pf} perMicrosecond`);
    hasAll(P.breakEven, ['epsBar', 'tau_us'], `stage4 ${pf} breakEven`);
  }
  assert.ok(st4.sensitivity.length > 0);
  for (const row of st4.sensitivity) {
    hasAll(row, ['platform', 'parameter', 'scale', 'C1', 'C2', 'C3', 'C4'], 'stage4 sensitivity');
    for (const c of ['C1', 'C2', 'C3', 'C4']) assert.ok(['holds', 'flips', 'undetermined'].includes(row[c]));
  }

  const ion = fixture('params_ion.json');
  hasAll(ion, PARAM_ION, 'params_ion');
  assert.equal(ion.platform, 'trapped-ion');
  const sc = fixture('params_sc.json');
  hasAll(sc, PARAM_SC, 'params_sc');
  assert.equal(sc.platform, 'superconducting');
  const cyc = fixture('params_cycle.json');
  for (const pf of ['trapped-ion', 'superconducting']) hasAll(cyc[pf], CYCLE, `params_cycle ${pf}`);
  for (const card of [ion, sc, cyc]) assert.equal(card.schema, 's2s-params/1');
});

// Catches: fixture banks that the interface would reject (bad checksum totals,
// wrong n_clbits or layout, keys not lowercase hex) or that were not simulated as
// specified (2000 shots, seed 11, d = 3 with r = 1 and r = 3, logical 0).
test('validateBank accepts both fixture banks', () => {
  for (const [bank, r] of [[bankD3R1, 1], [bankD3R3, 3]]) {
    assert.equal(validateBank(bank), true);
    assert.equal(bank.d, 3);
    assert.equal(bank.r, r);
    assert.equal(bank.logical, 0);
    assert.equal(bank.shots, 2000);
    assert.equal(bank.sampler_seed, 11);
    assert.equal(expandShots(bank).length, 2000);
  }
});

// Catches: a bank simulation where noise was switched off or wildly mis-scaled.
// With data and measurement flips at p = 0.02, the d = 3, r = 3 detector rate is
// about 2p(1-p) + p(1-p) ~ 0.06 per detector; a rate of 0 would mean no noise and
// a rate above 0.2 would mean flips were applied far too often.
test('fixture bank detector rates show the specified noise level', () => {
  for (const bank of [bankD3R1, bankD3R3]) {
    assert.ok(bank.detector_rate > 0.03 && bank.detector_rate < 0.2, `detector_rate ${bank.detector_rate}`);
  }
});
