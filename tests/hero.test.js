import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  heroCurves, heroOptima, bandInfo, liveSentence, sliderTau, snapIndex,
  BAND_LABEL, COINCIDE_LABEL, REVERSE_LABEL, HERO_DECODER, HERO_PLATFORMS,
} from '../src/ui/hero.js';
import stage3v1 from '../data/results/stage3_sc.json' with { type: 'json' };

// Synthetic v2 results: tau*_log (learned) = 2 [1.5, 2.5], tau*_phys (empirical) = 5, so
// the logical optimum sits below the physical one and the band is [2, 5].
const GRID = [0.5, 1, 2, 3, 5, 10];
const results = {
  x: { name: 'tau_us', values: GRID },
  series: [
    { d: 3, r: 3, mode: 'hard', decoder: 'naive', pL: [0.5, 0.2, 0.1, 0.12, 0.2, 0.3] },
    { d: 3, r: 3, mode: 'hard', decoder: 'learned', pL: [0.4, 0.1, 0.05, 0.06, 0.1, 0.2] },
    { d: 5, r: 3, mode: 'hard', decoder: 'learned', pL: [0.3, 0.1, 0.01, 0.02, 0.05, 0.1] },
  ],
  assignment: { empirical: [0.3, 0.2, 0.1, 0.05, 0.01, 0.02], lo: [0, 0, 0, 0, 0, 0], hi: [1, 1, 1, 1, 1, 1] },
  optima: {
    tauPhysEmpirical: { xMin: 5, atEdge: false },
    tauLog: [
      { d: 3, mode: 'hard', decoder: 'naive', xMin: 3, lo: 2, hi: 4, atEdge: false },
      { d: 3, mode: 'hard', decoder: 'learned', xMin: 2, lo: 1.5, hi: 2.5, atEdge: false },
    ],
  },
};
const optima = heroOptima(results, 'learned');
const band = bandInfo(optima);

// Catches: fails if the three regions share a template, or if the boundaries are
// misplaced: tau = 1 (one grid step below tau*_log = 2) is "too short", tau = 2 (exactly on
// tau*_log) and 3 are "between", tau = 5 (exactly on tau*_phys) is "between" and tau = 10
// (one grid step above) is "too long".
test('live sentence below, between and above the two optima', () => {
  const below = liveSentence(1, band);
  const between = liveSentence(3, band);
  const above = liveSentence(10, band);
  assert.equal(below, 'Too short: the readout itself is still unreliable.');
  assert.equal(between, 'At 3 µs you read better, but your data qubits lose more than you gain.');
  assert.equal(above, 'Too long: the waiting costs more than the clearer signal is worth.');
  assert.equal(new Set([below, between, above]).size, 3);
  assert.equal(liveSentence(2, band), 'At 2 µs you read better, but your data qubits lose more than you gain.');
  assert.equal(liveSentence(5, band), 'At 5 µs you read better, but your data qubits lose more than you gain.');
});

// Catches: fails if the band is drawn between the wrong optima (the naive tau_log 3, or
// the d = 5 entry) or with its ends swapped, or without the U7.2 label.
test('shaded interval runs from tau*_log to tau*_phys (empirical), learned decoder', () => {
  assert.equal(band.kind, 'band');
  assert.equal(band.shaded, true);
  assert.equal(band.x0, 2);
  assert.equal(band.x1, 5);
  assert.equal(band.label, BAND_LABEL);
});

// Catches: fails if tau*_phys inside tau*_log's interval still draws a band (U7.2: no band,
// the coincide label), and if a tau*_phys just past the interval's end does not.
test('optima coinciding within the interval: no band, the coincide label', () => {
  const inside = bandInfo({ tauLog: { xMin: 2, lo: 1.5, hi: 2.5, atEdge: false }, tauPhys: { xMin: 2.5, atEdge: false } });
  assert.equal(inside.kind, 'coincide');
  assert.equal(inside.shaded, false);
  assert.equal(inside.label, COINCIDE_LABEL);
  assert.equal(liveSentence(2, inside), `At 2 µs: ${COINCIDE_LABEL}.`);
  const past = bandInfo({ tauLog: { xMin: 2, lo: 1.5, hi: 2.5, atEdge: false }, tauPhys: { xMin: 3, atEdge: false } });
  assert.equal(past.kind, 'band');
  assert.deepEqual([past.x0, past.x1], [2, 3]);
});

// Catches: fails if a tau*_log above tau*_phys is labelled "listening longer costs more than
// it gains", which would state the opposite of the data.
test('tau*_log above tau*_phys: reversed band, its own label', () => {
  const rev = bandInfo({ tauLog: { xMin: 8, lo: 7, hi: 9, atEdge: false }, tauPhys: { xMin: 3, atEdge: false } });
  assert.equal(rev.kind, 'reverse');
  assert.deepEqual([rev.x0, rev.x1], [3, 8]);
  assert.equal(rev.label, REVERSE_LABEL);
  assert.notEqual(liveSentence(5, rev), liveSentence(5, band));
});

// Catches: fails if the slider can land between grid points: every slider value, including
// fractional and out-of-range ones, maps to a grid point (rounded to the nearer index, 1.4 ->
// index 1 and 1.6 -> index 2).
test('slider snaps to grid points', () => {
  for (const v of [-3, 0, 0.49, 0.51, 1.4, 1.6, 2.5, 4.2, 5, 99, 'x']) {
    const { index, tau } = sliderTau(GRID, v);
    assert.ok(GRID.includes(tau), `slider value ${v} gave ${tau}`);
    assert.equal(tau, GRID[index]);
  }
  assert.equal(sliderTau(GRID, 1.4).tau, 1);
  assert.equal(sliderTau(GRID, 1.6).tau, 2);
  assert.equal(sliderTau(GRID, -3).tau, 0.5);
  assert.equal(sliderTau(GRID, 99).tau, 10);
});

// Catches: fails if the starting position is chosen on a linear instead of a log axis: the
// log midpoint of 1 and 10 is sqrt(10) = 3.162, so 3.1 snaps to 1 and 3.2 to 10 (a linear
// rule would send both to 1).
test('starting position: nearest grid point on a log axis', () => {
  assert.equal(snapIndex([1, 10, 100], 3.1), 0);
  assert.equal(snapIndex([1, 10, 100], 3.2), 1);
  assert.equal(snapIndex(GRID, 2), 2);
});

// Catches: fails if the hero picks the naive curve when a learned one exists, or the d = 5
// curve, or the model's (belief) assignment error instead of the simulated one.
test('curves: learned d = 3 hard series and the simulated assignment error', () => {
  const c = heroCurves(results);
  assert.equal(c.decoder, 'learned');
  assert.deepEqual(c.logical.y, results.series[1].pL);
  assert.deepEqual(c.readout.y, results.assignment.empirical);
  assert.equal(optima.tauLog.decoder, 'learned');
  assert.equal(optima.tauPhys.from, 'tauPhysEmpirical');
});

// Catches: fails if the fallbacks for the v1 superconducting file (no decoder field, no
// tauPhysEmpirical) break: the hero must use its naive d = 3 hard series and tau_log, and
// locate tau*_phys on assignment.empirical with findMinimum (0.906 µs, DECISIONS A28 item 2),
// not the belief optimum optima.tauPhys (0.587 µs).
test('v1 stage-3 file: naive series, its tau_log, tau*_phys from findMinimum', () => {
  const c = heroCurves(stage3v1);
  assert.equal(c.decoder, 'naive');
  const s = stage3v1.series.find((u) => u.d === 3 && u.mode === 'hard');
  assert.deepEqual(c.logical.y, s.pL);
  const o = heroOptima(stage3v1, c.decoder);
  assert.equal(o.tauPhys.from, 'findMinimum');
  assert.ok(Math.abs(o.tauPhys.xMin - 0.9057) < 1e-3, `tau_phys ${o.tauPhys.xMin}`);
  assert.equal(o.tauLog.xMin, stage3v1.optima.tauLog.find((t) => t.d === 3 && t.mode === 'hard').xMin);
  // tau*_log 0.793 [0.436, 0.854] lies below 0.906, outside the interval: a band.
  assert.equal(bandInfo(o).kind, 'band');
});

// Catches: fails if a missing learned series falls back to a v2 naive series by mistake
// when it is labelled explicitly ("naive") rather than absent.
test('v2 file without a learned series: explicit naive series', () => {
  const naiveOnly = { ...results, series: results.series.filter((s) => s.decoder === 'naive') };
  const c = heroCurves(naiveOnly);
  assert.equal(c.decoder, 'naive');
  assert.equal(heroOptima(naiveOnly, c.decoder).tauLog.xMin, 3);
});

// SP5 cut rule (U3 row 14a; DECISIONS E4: V12(b) failed). Catches: fails if the hero still
// picks the learned curve when the results contain one while the cut holds, if an explicit
// "naive" request returns the learned series or the learned tau_log, or if an unknown decoder
// name is accepted silently. Non-vacuous: the same results with decoder null give "learned".
test('SP5 cut: HERO_DECODER is naive and heroCurves(results, "naive") ignores the learned series', () => {
  assert.equal(HERO_DECODER, 'naive');
  const c = heroCurves(results, HERO_DECODER);
  assert.equal(c.decoder, 'naive');
  assert.deepEqual(c.logical.y, results.series[0].pL);
  assert.equal(heroOptima(results, c.decoder).tauLog.xMin, 3);
  assert.equal(heroCurves(results, null).decoder, 'learned');
  assert.equal(heroCurves(results, 'learned').decoder, 'learned');
  assert.throws(() => heroCurves(results, 'other'), /unknown decoder/);
});

// Catches: fails if the two arms of the real hero data end up on different decoders (the
// trapped-ion results contain a learned series, the v1 superconducting file does not), which
// the K2 gate forbids ("the hero uses the same decoder on both arms").
test('SP5 cut: both hero arms use the same decoder on the real results', () => {
  const decoders = HERO_PLATFORMS.map((p) => heroCurves(p.results, HERO_DECODER).decoder);
  assert.deepEqual(decoders, ['naive', 'naive']);
  assert.ok(HERO_PLATFORMS[0].results.series.some((s) => s.decoder === 'learned'), 'ion results contain a learned series');
});
