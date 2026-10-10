// Error budget of Level 3 (team checklist U7.5): the error sources per round, per qubit, at
// one readout time, from the "budget" arrays of a stage-2 or stage-3 results file (U4):
// readout, idle, crosstalk (trapped ion, only when FEATURES.crosstalk is on) and gate.
// Pure functions here; Level 3 draws the bar with charts.js createStackedBars.

import { formatNumber } from './charts.js';

// Segment order, names and colours (tokens.css budget tokens), as in the Level 5 bars.
export const BUDGET_SEGMENTS = [
  { key: 'readout', name: 'Readout', color: 'var(--b-readout)' },
  { key: 'idle', name: 'Idle', color: 'var(--b-idle)' },
  { key: 'crosstalk', name: 'Crosstalk', color: 'var(--b-xt)' },
  { key: 'gate', name: 'Gate', color: 'var(--b-gate)' },
];
export const BUDGET_LABEL = 'error sources per round, per qubit (approximate)';

// Index of tau on the budget's grid (relative tolerance 1e-9), or -1.
export function budgetIndex(budget, tau) {
  const grid = budget?.tau_us;
  if (!Array.isArray(grid)) return -1;
  return grid.findIndex((t) => Math.abs(t - tau) <= 1e-9 * Math.max(1, Math.abs(tau)));
}

// The budget at one tau: { tau, label, segments: [{ key, name, value, color }], total }, or null
// when the results have no budget or tau is not on its grid. The crosstalk segment is included
// only with { crosstalk: true } (the trapped ion with FEATURES.crosstalk on). total is the sum of
// the stored values of the included sources, read straight from the arrays.
export function budgetAt(results, tau, { crosstalk = false } = {}) {
  const b = results?.budget;
  const i = budgetIndex(b, tau);
  if (i < 0) return null;
  const stored = { readout: b.readout?.[i], idle: b.idle?.[i], crosstalk: b.crosstalk?.[i], gate: b.gate };
  const keys = BUDGET_SEGMENTS.map((s) => s.key).filter((k) => k !== 'crosstalk' || crosstalk);
  if (keys.some((k) => !Number.isFinite(stored[k]))) return null;
  const segments = BUDGET_SEGMENTS.filter((s) => keys.includes(s.key)).map((s) => ({ ...s, value: stored[s.key] }));
  let total = 0;
  for (const k of keys) total += stored[k];
  return { tau: b.tau_us[i], label: b.label || BUDGET_LABEL, segments, total };
}

// Options for createStackedBars: one bar at the current tau.
export function budgetBarOptions(entry, { tauText, placeholder = false }) {
  return {
    title: `${entry.label[0].toUpperCase()}${entry.label.slice(1)}, at τ = ${tauText}${placeholder ? ' — placeholder data' : ''}`,
    valueLabel: 'error per round, per qubit',
    categories: [{ label: `τ = ${tauText}`, segments: entry.segments.map(({ name, value, color }) => ({ name, value, color })) }],
  };
}

// One sentence under the bar: the total and the largest source.
export function budgetSentence(entry, tauText) {
  const top = entry.segments.reduce((m, s) => (s.value > m.value ? s : m));
  return `At τ = ${tauText} the sources add up to about ${formatNumber(entry.total)} per round, per qubit; `
    + `the largest is ${top.name.toLowerCase()} (${formatNumber(top.value)}).`;
}
