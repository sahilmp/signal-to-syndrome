import { test } from 'node:test';
import assert from 'node:assert/strict';
import { optimaInfo, PLATFORMS, assignmentText, formatTau } from '../src/ui/level3.js';

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
