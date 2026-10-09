import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLATFORMS, physOf, chartOptions, sig3, numText, isResolved, MIN_ERRORS_RESOLVED, breakEvenParts, unitOf, sensitivityCounts,
} from '../src/ui/level5.js';
import { findMinimum } from '../src/core/optimum.js';
import { stage2, stage3, stage4 } from '../src/ui/bridge_data.js';

const plat = (id) => PLATFORMS.find((p) => p.id === id);
const physLine = (opts) => opts.vlines.find((v) => v.label === 'τ_phys');

// Catches: fails if the Level 5 superconducting chart marks tau_phys at the belief optimum
// (optima.tauPhys, 0.587 µs, A28 item 2) instead of the minimum of the simulated
// assignment error, in either metric or decoding mode.
test('superconducting tau_phys marker is the empirical minimum in every chart', () => {
  const want = findMinimum(stage3.x.values, stage3.assignment.empirical, { logX: true }).xMin;
  assert.notEqual(want, stage3.optima.tauPhys.xMin);
  for (const mode of ['hard', 'soft']) {
    for (const metric of ['perRound', 'perMicrosecond']) {
      assert.equal(physLine(chartOptions(plat('superconducting'), mode, metric)).x, want);
    }
  }
});

// Catches: fails if the empirical rule leaks into the trapped-ion chart, whose tau_phys
// stays the stored optima.tauPhys.
test('trapped-ion tau_phys marker stays optima.tauPhys', () => {
  assert.equal(physLine(chartOptions(plat('trapped-ion'), 'hard', 'perRound')).x, stage2.optima.tauPhys.xMin);
});

// Catches: fails if the comparison table loses the belief value it quotes beside the
// superconducting tau_phys, or quotes one for the ion.
test('physOf: belief value carried only for the superconducting platform', () => {
  assert.equal(physOf(plat('superconducting')).belief.xMin, stage3.optima.tauPhys.xMin);
  assert.equal(physOf(plat('trapped-ion')).belief, null);
});

// Catches: fails if table numbers keep more than three significant figures (A28 item 6) or
// switch notation at the wrong place: 0.01 is the boundary (plain), one step below it is
// written with a power of ten.
test('sig3: three significant figures, power of ten below 0.01 and from 1000 on', () => {
  assert.equal(numText(sig3(23.4849)), '23.5');
  assert.equal(numText(sig3(0.586604)), '0.587');
  assert.equal(numText(sig3(0.01)), '0.0100');
  assert.equal(numText(sig3(0.00999)), '9.99×10^-3');
  assert.equal(numText(sig3(999)), '999');
  assert.equal(numText(sig3(1000)), '1.00×10^3');
  assert.equal(numText(sig3(9.9999e-5)), '1.00×10^-4');
});

// Catches: fails if the "not resolved" rule fires at the wrong count: exactly
// MIN_ERRORS_RESOLVED errors at the lowest point is resolved, one fewer is not.
test('isResolved: boundary at MIN_ERRORS_RESOLVED errors at the lowest grid point', () => {
  const res = (k) => ({ series: [{ d: 7, mode: 'hard', pL: [0.5, k / 1000, 0.2], n: [1000, 1000, 1000] }] });
  assert.equal(isResolved(res(MIN_ERRORS_RESOLVED), 7, 'hard'), true);
  assert.equal(isResolved(res(MIN_ERRORS_RESOLVED - 1), 7, 'hard'), false);
});

// Catches: fails if the real ion d = 7 optima (3 and 8 errors of 32 000) are shown as
// resolved, or if any other optimum on either platform is marked "not resolved".
test('isResolved on the real results: only ion d = 7 is not resolved', () => {
  const flagged = PLATFORMS.flatMap((p) => [3, 5, 7].flatMap((d) => ['hard', 'soft']
    .filter((m) => !isResolved(p.results, d, m)).map((m) => `${p.id} ${d} ${m}`)));
  assert.deepEqual(flagged, ['trapped-ion 7 hard', 'trapped-ion 7 soft']);
});

// Catches: fails if the soft rows repeat the hard break-even (A28 item 3): the ion has
// ε̄ = 0.236 in hard mode and none in soft mode.
test('breakEvenParts: per decoding mode from breakEven.byMode', () => {
  const be = stage4.platforms['trapped-ion'].breakEven.byMode;
  assert.match(breakEvenParts(be.hard).join(''), /^ε̄ = 0\.236 \[0\.210 to 0\.267\] at τ = 1\.56 µs$/);
  assert.match(breakEvenParts(be.soft).join(''), /^none \(d = 5 below d = 3 at every grid point\)$/);
});

// Catches: fails if parameter-card values lose their units (A28 item 6) or a rate per µs
// is labelled as a time.
test('unitOf: units from the parameter name suffix', () => {
  assert.deepEqual(['R_bright_per_us', 'gamma_bright_to_dark_per_us', 'T1_idle_us', 'kappa_over_2pi_MHz', 'nbar'].map(unitOf),
    ['counts/µs', '/µs', 'µs', 'MHz', '']);
});

// Catches: fails if the verdict table miscounts the sensitivity rows (Person A's table:
// C1 flips 28/28, C3 flips 27 and undetermined 1).
test('sensitivityCounts on the real sweep', () => {
  assert.equal(sensitivityCounts(stage4.sensitivity, 'C1'), 'flips 28 (of 28)');
  assert.equal(sensitivityCounts(stage4.sensitivity, 'C3'), 'flips 27, undetermined 1 (of 28)');
});
