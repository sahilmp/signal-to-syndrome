import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  optimaInfo, PLATFORMS, assignmentText, formatTau, naiveResults, distanceMarkers, scoreBand, challengeResult,
  crosstalkRows, crosstalkShift,
} from '../src/ui/level3.js';
import stage2v2 from '../data/results/stage2_ion.json' with { type: 'json' };
import { budgetAt } from '../src/ui/budget.js';
import { spreadLabels } from '../src/ui/charts.js';

// Synthetic results: the belief optimum (optima.tauPhys) sits at 1, the empirical
// assignment error has its minimum at the grid point 10.
const results = {
  x: { values: [0.1, 1, 10, 100, 1000] },
  assignment: { belief: [0.3, 0.01, 0.02, 0.05, 0.1], empirical: [0.4, 0.2, 0.01, 0.2, 0.4] },
  optima: { tauPhys: { xMin: 1, atEdge: false }, tauLog: [] },
};
const physLine = (info) => info.vlines.find((v) => v.label.includes('τ_phys'));

// Catches: fails if Level 3 marks the superconducting tau_phys at the belief optimum (the
// A28 item 2 bug, 0.587 µs instead of 0.906 µs) rather than at the empirical minimum.
test('physFromEmpirical: tau_phys marker at the empirical minimum, belief value quoted', () => {
  const info = optimaInfo(results, 'hard', [], { physFromEmpirical: true });
  assert.ok(Math.abs(physLine(info).x - 10) < 1e-9);
  assert.match(info.lines[0], /simulated assignment error\): 10 µs/);
  assert.match(info.lines[1], /ignores resonator ring-up, is 1 µs/);
});

// Catches: fails if the empirical rule leaks into the trapped-ion platform, whose
// belief model matches the simulation (V10) and whose tau_phys stays optima.tauPhys.
test('without physFromEmpirical: tau_phys marker at optima.tauPhys', () => {
  const info = optimaInfo(results, 'hard', []);
  assert.equal(physLine(info).x, 1);
  assert.equal(info.lines.length, 1);
});

// Catches: fails if an empirical minimum on the grid edge is drawn as an optimum.
test('physFromEmpirical: empirical minimum at the grid edge gives no marker', () => {
  const edge = { ...results, assignment: { ...results.assignment, empirical: [0.5, 0.4, 0.3, 0.2, 0.1] } };
  const info = optimaInfo(edge, 'hard', [], { physFromEmpirical: true });
  assert.equal(physLine(info), undefined);
  assert.match(info.lines[0], /no interior minimum/);
});

// Catches: fails if the flag is set on the wrong platform (only superconducting has ring-up).
test('only the superconducting platform locates tau_phys on the empirical curve', () => {
  assert.deepEqual(PLATFORMS.map((p) => [p.id, p.physFromEmpirical === true]),
    [['trapped-ion', false], ['superconducting', true]]);
});

const [ION, SC] = PLATFORMS;

// Catches: fails if the superconducting sentence under the slider quotes the model's
// assignment error (0.0853 at 0.1 µs, no ring-up) as the error, which contradicts the IQ
// plot (A28 item 1); the simulated 0.448 must lead and the model value be labelled.
test('assignmentText: superconducting quotes the simulated value, model labelled', () => {
  const t = assignmentText(SC, SC.create(SC.params, 0.1), 0.1);
  assert.match(t, /simulated assignment error .* is 0\.448 /);
  assert.match(t, /readout model, which ignores ring-up .* predicts 0\.0853, signal-to-noise ratio 2\.75\./);
});

// Catches: fails if the trapped-ion sentence is relabelled as a model value or loses its number.
test('assignmentText: trapped ion unchanged apart from three significant figures', () => {
  assert.equal(assignmentText(ION, ION.create(ION.params, 5), 5),
    'At τ = 5 µs the assignment error (average chance of reading the wrong state) is 0.0475.');
});

// Catches: fails if the ion d = 7 hard optimum (3 errors of 32 000 at its lowest point)
// is still presented as an optimum with a marker (A28 item 5), or if d = 3 and 5 lose theirs.
test('optimaInfo: ion d = 7 not resolved and not drawn; d = 3 and 5 drawn', () => {
  const info = optimaInfo(ION.results, 'hard', [3, 5, 7]);
  assert.deepEqual(info.vlines.map((v) => v.label), ['τ_phys', 'τ_log d3', 'τ_log d5']);
  assert.match(info.lines[3], /d = 7 \(hard\): not resolved\. The lowest point has only 3 logical errors/);
});

// Catches: fails if readout times go back to six significant figures (A28 item 6).
test('formatTau: three significant figures', () => {
  assert.equal(formatTau(23.4849), '23.5 µs');
  assert.equal(formatTau(0.586604), '0.587 µs');
  assert.equal(formatTau(500), '500 µs');
});

// Catches: fails if a results file that carries both decoders (CC-A12) reaches the levels
// unfiltered, drawing every curve and tau_log marker twice, or if the v1 series without a
// decoder field are dropped as not naive.
test('naiveResults: keeps decoder-less and naive entries, drops learned ones', () => {
  const both = {
    x: { values: [1, 2] },
    series: [{ d: 3, mode: 'hard' }, { d: 3, mode: 'hard', decoder: 'naive' }, { d: 3, mode: 'hard', decoder: 'learned' }],
    optima: { tauPhys: { xMin: 1 }, tauLog: [{ d: 3, decoder: 'naive' }, { d: 3, decoder: 'learned' }, { d: 5 }] },
  };
  const n = naiveResults(both);
  assert.deepEqual(n.series.map((s) => s.decoder), [undefined, 'naive']);
  assert.deepEqual(n.optima.tauLog.map((t) => t.d), [3, 5]);
  assert.equal(n.optima.tauPhys, both.optima.tauPhys);
  assert.equal(both.series.length, 3);
});

// --- U7.5 (CC-B14): distance selector, challenge, error budget ---

// Catches: fails if the chart with the distance selector marks another d's tau_log (or all of
// them), or drops tau_phys or the current tau.
test('distanceMarkers: only the chosen d has a tau_log marker', () => {
  const res = {
    x: { values: [1, 10, 100] },
    series: [3, 5, 7].map((d) => ({ d, mode: 'hard', pL: [0.1, 0.01, 0.1], n: [1e5, 1e5, 1e5] })),
    optima: { tauPhys: { xMin: 5, atEdge: false }, tauLog: [{ d: 3, mode: 'hard', xMin: 8 }, { d: 5, mode: 'hard', xMin: 12 }, { d: 7, mode: 'hard', xMin: 20 }] },
  };
  for (const d of [3, 5, 7]) {
    const labels = distanceMarkers(res, d, 10).map((v) => v.label);
    assert.deepEqual(labels, ['τ = 10 µs', 'τ_phys', `τ_log d${d}`]);
  }
  // On the real ion results as well: one tau_log marker, the chosen one.
  const real = distanceMarkers(ION.results, 5, 20).filter((v) => v.label.includes('τ_log'));
  assert.deepEqual(real.map((v) => v.label), ['τ_log d5']);
});

// Catches: fails if a band boundary is off: ratio exactly 1.1 is "spot on" and 1.1 + 0.001
// "close"; exactly 1.5 is "close" and 1.5 + 0.001 "try again".
test('scoreBand: boundaries at 1.1 and 1.5', () => {
  assert.equal(scoreBand(1), 'spot on');
  assert.equal(scoreBand(1.1), 'spot on');
  assert.equal(scoreBand(1.101), 'close');
  assert.equal(scoreBand(1.5), 'close');
  assert.equal(scoreBand(1.501), 'try again');
});

// Catches: fails if the challenge compares against the wrong point (not the curve's lowest),
// inverts the ratio, or accepts a tau that is not on the grid.
test('challengeResult: ratio to the lowest point, its band and the revealed optimum', () => {
  const xs = [1, 2, 5, 10];
  const s = { pL: [0.4, 0.012, 0.01, 0.02] };
  assert.deepEqual(challengeResult(xs, s, 5), { tau: 5, pL: 0.01, best: { tau: 5, pL: 0.01 }, ratio: 1, band: 'spot on' });
  const r2 = challengeResult(xs, s, 2);
  assert.ok(Math.abs(r2.ratio - 1.2) < 1e-12);
  assert.equal(r2.band, 'close');
  assert.equal(r2.best.tau, 5);
  assert.equal(challengeResult(xs, s, 10).band, 'try again');
  assert.equal(challengeResult(xs, s, 3), null);
});

// Catches: fails if the budget bar drops or double-counts a source, so its segments no longer
// add up to the stored values (readout + idle + crosstalk + gate at that tau), or if the
// crosstalk segment shows for the ion without the crosstalk switch.
test('budgetAt: segments sum to the stored total within 1e-12, crosstalk only when on', () => {
  for (const p of PLATFORMS) {
    const b = p.budgetResults.budget;
    b.tau_us.forEach((tau, i) => {
      for (const crosstalk of [false, true]) {
        const e = budgetAt(p.budgetResults, tau, { crosstalk });
        const stored = b.readout[i] + b.idle[i] + (crosstalk ? b.crosstalk[i] : 0) + b.gate;
        const sum = e.segments.reduce((acc, g) => acc + g.value, 0);
        assert.ok(Math.abs(sum - stored) <= 1e-12, `${p.id} tau ${tau}: ${sum} vs ${stored}`);
        assert.ok(Math.abs(e.total - stored) <= 1e-12);
        assert.deepEqual(e.segments.map((g) => g.key), crosstalk ? ['readout', 'idle', 'crosstalk', 'gate'] : ['readout', 'idle', 'gate']);
      }
    });
  }
  // A tau that is not on the budget grid has no bar.
  assert.equal(budgetAt(ION.budgetResults, 4), null);
});

// Catches: fails if two chart labels closer than one line height are left to overprint
// (the end labels "d = 3", "d = 5", "d = 7" of curves that finish close together), or if
// spreading reorders them or pushes one outside the plot.
test('spreadLabels: at least one gap apart, order kept, inside the bounds', () => {
  const ys = [100, 104, 103, 300];
  const out = spreadLabels(ys, 14, 20, 400);
  const sorted = out.map((y, i) => [y, i]).sort((a, b) => a[0] - b[0]);
  for (let k = 1; k < sorted.length; k++) assert.ok(sorted[k][0] - sorted[k - 1][0] >= 14 - 1e-9);
  assert.deepEqual(sorted.map(([, i]) => i), [0, 2, 1, 3]);
  assert.equal(out[3], 300);
  // Crowded at the bottom edge: pushed back up inside hi.
  const low = spreadLabels([398, 399, 400], 14, 20, 400);
  assert.ok(Math.max(...low) <= 400 && Math.min(...low) >= 20);
  // Already apart: unchanged.
  assert.deepEqual(spreadLabels([10, 50], 14), [10, 50]);
});

// Crosstalk scan (CC-B20). Two entries with the point-estimate flag on: one resolved, one not.
const scanEntry = (over) => ({
  rate: 0, d: 3, mode: 'hard', tauLog: { xMin: 15.2, lo: 13.9, hi: 27.4, atEdge: false },
  interiorBelowTauPhys: true, interiorBelowTauPhysResolved: false, ...over,
});

// Catches: fails if the shift column follows the raw point-estimate flag interiorBelowTauPhys
// (DECISIONS E12: it flips with noise) instead of the resolved flag. Non-vacuous: the same
// entry with the resolved flag true says "yes".
test('crosstalkShift: point-estimate flag true but not resolved gives "not resolved"', () => {
  assert.equal(crosstalkShift(scanEntry()), 'not resolved');
  assert.equal(crosstalkShift(scanEntry({ interiorBelowTauPhysResolved: true })), 'yes');
});

// Catches: fails if shiftDelta, when present, is ignored in favour of the resolved flag: each
// case sets the two to opposite values, so either fallback gives the other answer.
test('crosstalkShift: reads shiftDelta.resolved when shiftDelta exists', () => {
  assert.equal(crosstalkShift(scanEntry({ interiorBelowTauPhysResolved: true, shiftDelta: { diff: 1e-3, lo: -1e-4, hi: 2e-3, resolved: false } })), 'not resolved');
  assert.equal(crosstalkShift(scanEntry({ interiorBelowTauPhysResolved: false, shiftDelta: { diff: 1e-3, lo: 1e-4, hi: 2e-3, resolved: true } })), 'yes');
});

// Catches: fails if a row is missing or duplicated, if d = 7 leaks in, if the card rate is not
// labelled as the measured lower bound (or a scan rate is), or if any cell shows a raw boolean.
test('crosstalkRows: one row per rate and (d, mode), card rate labelled, no raw booleans', () => {
  const scan = {
    rates_per_us: [0, 1.67e-5], cardRate_per_us: 1.67e-5, tauPhys: 23.4849,
    entries: [
      scanEntry(), scanEntry({ mode: 'soft' }), scanEntry({ d: 5 }), scanEntry({ d: 7 }),
      scanEntry({ rate: 1.67e-5, interiorBelowTauPhys: false }),
      scanEntry({ rate: 1.67e-5, d: 5, mode: 'soft', tauLog: { xMin: 500, lo: 10, hi: 500, atEdge: true } }),
    ],
  };
  const rows = crosstalkRows(scan);
  assert.deepEqual(rows.map((r) => `${r.rate}|${r.d}|${r.mode}`), [
    '0 /µs (scan)|3|hard', '0 /µs (scan)|3|soft', '0 /µs (scan)|5|hard',
    '1.67e-5 /µs (measured lower bound)|3|hard', '1.67e-5 /µs (measured lower bound)|5|soft',
  ]);
  assert.equal(rows[0].tauLog, '15.2 µs (13.9 µs to 27.4 µs)');
  assert.equal(rows[0].tauPhys, '23.5 µs');
  assert.match(rows[4].tauLog, /^no interior minimum/);
  for (const r of rows) for (const v of Object.values(r)) assert.ok(v !== 'true' && v !== 'false', `raw boolean in ${JSON.stringify(r)}`);
});

// Catches: fails if the real Stage 2 scan (handoff N6) loses or duplicates rows, or if the
// card rate is not found among its rates (every (d, mode) of it labelled as the lower bound).
test('crosstalkRows: the real ion scan has one row per rate and (d, mode)', () => {
  const scan = stage2v2.crosstalkScan;
  const rows = crosstalkRows(scan);
  assert.equal(rows.length, scan.rates_per_us.length * 4);
  assert.equal(rows.filter((r) => r.rate.includes('measured lower bound')).length, 4);
  assert.ok(rows.every((r) => r.shift === 'yes' || r.shift === 'not resolved'));
});
