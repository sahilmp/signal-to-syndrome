// Level 3, "Listen longer?": readout time against logical error, for the trapped ion and
// (with FEATURES.superconducting) the superconducting qubit. A platform toggle shared with
// level 4; a readout-time slider over the platform's tau grid. Trapped ion: photon-count
// histograms for bright and dark with the threshold. Superconducting: the IQ plane
// (iqview.js) and the stage-3 assignment-error curve. Both: the assignment error, the
// curves of logical error against tau (hard mode) with the optima, and a "Batch" button
// that runs runPoint on 200 shots of bankD3R3 (bankXD3R3 in the phase-flip memory).
// With FEATURES.uxV2 (team checklist U7.5): a distance selector (only the chosen d's tau_log
// marker, with tau_phys and the current tau), the error-budget bar at the current tau, and the
// challenge "Set τ to minimise logical error" with a "Lock in" button.

import { createIonReadout, createScReadout, runPoint, findMinimum } from './bridge_core.js';
import {
  bankD3R3, bankXD3R3, stage2, stage3, stage2v2, stage3v2, stage2x, stage3x, paramsIon, paramsSc,
} from './bridge_data.js';
import { FEATURES } from './features.js';
import { createRng } from '../core/rng.js';
import { expandShots } from '../core/bank.js';
import {
  createChart, svgEl, formatNumber, SERIES_STYLES, isNarrow, onNarrowChange, htmlLegend, scrollBox, drawVlineLabels,
  TOKENS, tokenStyle, goalLine, explainMore, takeawayCard, createStackedBars,
} from './charts.js';
import { budgetAt, budgetBarOptions, budgetSentence } from './budget.js';
import { drawIqView } from './iqview.js';
import { P_GATE } from './level1.js';
import { sampleBank } from './level2.js';

const SEED = 20261012;
const HIST_SAMPLES = 5000;
const IQ_SAMPLES = 1500;
const BATCH_SHOTS = 200;

// Parameter cards store { value, source }; plain values are accepted too.
export const cardValue = (p) => (p !== null && typeof p === 'object' && !Array.isArray(p) && 'value' in p ? p.value : p);

// A results file reduced to the naive decoder: series and optima.tauLog entries without a
// decoder field (written before the learned decoder) or with decoder "naive". Levels 2 to 5
// show the naive decoder until B44 switches them to the learned one (CC-A12 added learned
// series to the same files, which would otherwise draw every curve and marker twice).
export function naiveResults(results) {
  const naive = (o) => o.decoder === undefined || o.decoder === 'naive';
  const out = { ...results, series: (results.series || []).filter(naive) };
  if (results.optima) out.optima = { ...results.optima, tauLog: (results.optima.tauLog || []).filter(naive) };
  return out;
}

// The readout platforms of levels 3 and 4, each behind its FEATURES flag. physFromEmpirical:
// the belief model's tauPhys (results.optima) is not the simulated one, because the belief
// model ignores resonator ring-up (DECISIONS, A28 item 2), so tau_phys is located on
// assignment.empirical instead and the belief value is quoted beside it.
export const PLATFORMS = [
  {
    id: 'trapped-ion', flag: 'ion', label: 'Trapped ion', params: paramsIon, results: naiveResults(stage2), stage: 2, budgetResults: stage2v2,
    resultsX: naiveResults(stage2x), budgetResultsX: stage2x,
    create: createIonReadout, tauName: 'Detection time',
  },
  {
    id: 'superconducting', flag: 'superconducting', label: 'Superconducting', params: paramsSc, results: naiveResults(stage3), stage: 3, budgetResults: stage3v2,
    resultsX: naiveResults(stage3x), budgetResultsX: stage3x,
    create: createScReadout, tauName: 'Integration time', physFromEmpirical: true,
  },
];
export const ION = PLATFORMS[0];

export const enabledPlatforms = () => PLATFORMS.filter((p) => FEATURES[p.flag] === true);

// The platform choice is shared by levels 3 and 4: setPlatform notifies every mounted level.
let currentPlatformId = null;
const platformListeners = new Set();
export function currentPlatform() {
  const en = enabledPlatforms();
  return en.find((p) => p.id === currentPlatformId) || en[0] || ION;
}
export function setPlatform(id) {
  if (id === currentPlatform().id || !enabledPlatforms().some((p) => p.id === id)) return;
  currentPlatformId = id;
  for (const fn of platformListeners) fn(currentPlatform());
}
export function onPlatformChange(fn) {
  platformListeners.add(fn);
}

// The memory basis (team checklist U7.9), shared by the hero and Levels 3-5 like the platform:
// "Z" is the bit-flip memory, "X" the phase-flip memory. Only FEATURES.phaseFlip lets it leave
// "Z". Levels 1-2 (and the stored shots of Levels 3-4) stay in the bit-flip memory.
export const BASES = {
  Z: {
    id: 'Z', memory: 'bit-flip memory', Memory: 'Bit-flip memory', flip: 'bit flip',
    idleName: 'Idle (T1 relaxation)',
    idleText: 'In the bit-flip memory a waiting data qubit loses its value by relaxation, set by T1.',
  },
  X: {
    id: 'X', memory: 'phase-flip memory', Memory: 'Phase-flip memory', flip: 'phase flip',
    idleName: 'Idle (T2 dephasing)',
    idleText: 'In the phase-flip memory a waiting data qubit loses its phase by dephasing, set by T2.',
  },
};
let currentBasisId = 'Z';
const basisListeners = new Set();
export const basisOn = () => FEATURES.phaseFlip === true;
export function currentBasis() {
  return basisOn() && currentBasisId === 'X' ? 'X' : 'Z';
}
export function setBasis(id) {
  if (id !== 'Z' && id !== 'X') throw new Error(`unknown basis ${id}`);
  if (id === currentBasisId) return;
  currentBasisId = id;
  for (const fn of basisListeners) fn(currentBasis());
}
export function onBasisChange(fn) {
  basisListeners.add(fn);
  return () => basisListeners.delete(fn);
}
// " (phase-flip memory)" for chart titles while the toggle exists; nothing without it, so
// the page is unchanged when FEATURES.phaseFlip is off.
export const memoryTag = (basis = currentBasis()) => (basisOn() ? ` (${BASES[basis].memory})` : '');
// A platform's results and error-budget source in a basis: the *_x files in the X basis.
export const resultsFor = (p, basis = currentBasis()) => (basis === 'X' ? p.resultsX : p.results);
export const budgetFor = (p, basis = currentBasis()) => (basis === 'X' ? p.budgetResultsX : p.budgetResults);

// Radio group listing only the enabled platforms; arrow keys move between them. With one
// platform it is a plain line of text. `prefix` keeps the ids unique per level.
export function mountPlatformToggle(container, prefix) {
  const en = enabledPlatforms();
  if (en.length < 2) {
    container.appendChild(el('p', { class: 'hint' }, `Platform: ${currentPlatform().label.toLowerCase()}.`));
    return;
  }
  const fs = el('fieldset', { class: 'platform-toggle' });
  fs.appendChild(el('legend', {}, 'Platform'));
  const inputs = en.map((p) => {
    const id = `${prefix}-platform-${p.id}`;
    const input = el('input', { type: 'radio', name: `${prefix}-platform`, id, value: p.id });
    input.checked = p.id === currentPlatform().id;
    input.addEventListener('change', () => { if (input.checked) setPlatform(p.id); });
    const label = el('label', { for: id }, p.label);
    const wrap = el('span', { class: 'platform-option' });
    wrap.append(input, label);
    fs.appendChild(wrap);
    return input;
  });
  onPlatformChange((p) => { for (const i of inputs) i.checked = i.value === p.id; });
  container.appendChild(fs);
}

export function tauGrid(platform = ION) {
  const grid = cardValue(platform.params.tau_grid_us);
  if (!Array.isArray(grid) || grid.length === 0) throw new Error(`the ${platform.label.toLowerCase()} parameter card has no tau_grid_us`);
  return grid.map(Number);
}

// Three significant figures are enough for every readout time on the page (A28 item 6).
export const formatTau = (tau) => `${Number(tau.toPrecision(3))} µs`;

// A tau_log whose curve has fewer logical errors than this at its lowest grid point is
// "not resolved": with k < 10 errors the relative standard error 1/sqrt(k) exceeds 30%, so
// neighbouring grid points cannot be told apart (ion d = 7: 3 and 8 errors of 32 000;
// docs/notes_results.md, Stage 2; DECISIONS, A28 item 5).
export const MIN_ERRORS_RESOLVED = 10;

// Logical errors at the lowest grid point of the results curve for (d, mode), or null.
export function errorsAtMinimum(results, d, mode) {
  const s = (results.series || []).find((u) => u.d === d && u.mode === mode);
  if (!s || !Array.isArray(s.n)) return null;
  let best = -1;
  s.pL.forEach((p, i) => { if (Number.isFinite(p) && (best < 0 || p < s.pL[best])) best = i; });
  return best < 0 ? null : { k: Math.round(s.pL[best] * s.n[best]), n: s.n[best] };
}
export function isResolved(results, d, mode) {
  const c = errorsAtMinimum(results, d, mode);
  return !c || c.k >= MIN_ERRORS_RESOLVED;
}
// Shot counts with a thin space as thousands separator, as in the notes (32 000).
export const formatCount = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009');

// Index of the first grid point whose assignment error is below `target`, so that the
// levels open where readout errors are common enough to see.
export function defaultTauIndex(grid, target = 0.1, platform = ION) {
  for (let i = 0; i < grid.length; i++) {
    try {
      if (platform.create(platform.params, grid[i]).averageAssignmentError() < target) return i;
    } catch {
      // A grid point the model rejects is skipped.
    }
  }
  return 0;
}

// tau_phys of a stage-2 or stage-3 results file: { xMin, atEdge, empirical, belief }, or null.
// Always the simulated value where the file allows it, as the hero and C1 use (A53 review
// item 9: the ion's model value 23.5 µs was shown beside the simulated 23.0 µs). With
// physFromEmpirical (see PLATFORMS) it is the minimum of assignment.empirical (log x), and
// belief carries optima.tauPhys for comparison (the superconducting model ignores ring-up);
// otherwise optima.tauPhysEmpirical (the same rule, stored by Person A's sweep), else
// optima.tauPhys.
export function physicalOptimum(results, { physFromEmpirical = false } = {}) {
  const belief = results.optima?.tauPhys || null;
  const emp = results.assignment?.empirical;
  if (physFromEmpirical && Array.isArray(emp) && emp.length === results.x?.values?.length) {
    const m = findMinimum(results.x.values, emp, { logX: true });
    return { xMin: m.xMin, atEdge: m.atEdge, empirical: true, belief };
  }
  const stored = results.optima?.tauPhysEmpirical;
  if (stored && Number.isFinite(stored.xMin)) return { xMin: stored.xMin, atEdge: stored.atEdge === true, empirical: true, belief: null };
  return belief ? { xMin: belief.xMin, atEdge: belief.atEdge, empirical: false, belief: null } : null;
}

const sig3 = (v) => formatNumber(Number(v.toPrecision(3)));

// The assignment-error sentence under the slider. With physFromEmpirical the model ignores
// ring-up, so its value can be far from what the IQ plot shows (A28 item 1); the simulated
// value from the results (assignment.empirical at this grid point) leads, and the model's
// value and signal-to-noise ratio are labelled as such.
export function assignmentText(plat, readout, tau) {
  const eps = readout.averageAssignmentError();
  const res = resultsFor(plat);
  const a = res.assignment;
  const i = res.x?.values?.findIndex((x) => Math.abs(x - tau) <= 1e-9 * Math.max(1, tau)) ?? -1;
  const snr = typeof readout.snr === 'function' ? readout.snr() : null;
  const snrText = Number.isFinite(snr) ? `, signal-to-noise ratio ${sig3(snr)}` : '';
  if (plat.physFromEmpirical && a && i >= 0 && Number.isFinite(a.empirical?.[i])) {
    const ci = Number.isFinite(a.lo?.[i]) && Number.isFinite(a.hi?.[i]) ? ` (95% interval ${sig3(a.lo[i])} to ${sig3(a.hi[i])})` : '';
    return `At τ = ${formatTau(tau)} the simulated assignment error (average chance of reading the wrong state, with ring-up) is ${sig3(a.empirical[i])}${ci}. `
      + `The readout model, which ignores ring-up and is used for the soft-decoding weights, predicts ${sig3(eps)}${snrText}.`;
  }
  if (plat.physFromEmpirical) {
    return `At τ = ${formatTau(tau)} the readout model (no ring-up) predicts an assignment error of ${sig3(eps)}${snrText}; `
      + 'the simulated value is only available at the grid points of the results.';
  }
  // Trapped ion: the simulated value too, as the budget bar at the same tau quotes it (A53
  // review item 10: the model's 0.0475 beside the budget's 0.048); the model only off the grid.
  if (a && i >= 0 && Number.isFinite(a.empirical?.[i])) {
    const ci = Number.isFinite(a.lo?.[i]) && Number.isFinite(a.hi?.[i]) ? ` (95% interval ${sig3(a.lo[i])} to ${sig3(a.hi[i])})` : '';
    return `At τ = ${formatTau(tau)} the simulated assignment error (average chance of reading the wrong state) is ${sig3(a.empirical[i])}${ci}${snrText}.`;
  }
  return `At τ = ${formatTau(tau)} the assignment error (average chance of reading the wrong state) is ${sig3(eps)}${snrText}.`;
}

// Text for the optima of a stage-2 or stage-3 results file: tauPhys and tauLog per d
// for one mode, "no interior minimum" when the minimum sits at the edge of the grid.
export function optimaInfo(results, mode, ds, { physFromEmpirical = false } = {}) {
  const o = results.optima || {};
  const lines = [];
  const vlines = [];
  const phys = physicalOptimum(results, { physFromEmpirical });
  if (phys) {
    const what = phys.empirical ? 'lowest simulated assignment error' : 'lowest assignment error';
    if (phys.atEdge) lines.push(`Physical optimum τ_phys (${what}): no interior minimum.`);
    else {
      lines.push(`Physical optimum τ_phys (${what}): ${formatTau(phys.xMin)}.`);
      vlines.push({ x: phys.xMin, label: 'τ_phys' });
    }
    if (phys.belief && !phys.belief.atEdge) {
      lines.push(`The readout model's own estimate, which ignores resonator ring-up, is ${formatTau(phys.belief.xMin)}; `
        + 'the logical optima are compared with the simulated value.');
    }
  }
  for (const t of (o.tauLog || []).filter((t) => t.mode === mode && ds.includes(t.d)).sort((a, b) => a.d - b.d)) {
    if (t.atEdge) lines.push(`Logical optimum τ_log for d = ${t.d} (${mode}): no interior minimum.`);
    else {
      const ci = Number.isFinite(t.lo) && Number.isFinite(t.hi) ? ` (95% interval ${formatTau(t.lo)} to ${formatTau(t.hi)})` : '';
      if (isResolved(results, t.d, mode)) {
        lines.push(`Logical optimum τ_log for d = ${t.d} (${mode}): ${formatTau(t.xMin)}${ci}.`);
        vlines.push({ x: t.xMin, label: `τ_log d${t.d}` });
      } else {
        // An unresolved optimum gets no marker, so the chart does not present it as located.
        const c = errorsAtMinimum(results, t.d, mode);
        lines.push(`Logical optimum τ_log for d = ${t.d} (${mode}): not resolved. The lowest point has only ${c.k} logical error${c.k === 1 ? '' : 's'} `
          + `of ${formatCount(c.n)} shots; the estimate ${formatTau(t.xMin)}${ci} is not drawn.`);
      }
    }
  }
  // Optima at the same τ share one marker, so their labels do not overprint.
  const merged = [];
  for (const v of vlines) {
    const same = merged.find((u) => u.x === v.x);
    if (same) same.label += same.label.includes('τ_log') ? `, ${v.label.replace('τ_log ', '')}` : ` + ${v.label}`;
    else merged.push({ ...v });
  }
  return { lines, vlines: merged };
}

// Markers of the logical-error chart with the distance selector (U7.5): the current tau,
// tau_phys and the tau_log of the chosen d only (hard decoding).
export function distanceMarkers(results, d, tau, { physFromEmpirical = false } = {}) {
  return [{ x: tau, label: `τ = ${formatTau(tau)}` }, ...optimaInfo(results, 'hard', [d], { physFromEmpirical }).vlines];
}

// Ion measurement-crosstalk scan (CC-B20, handoff N6), from crosstalkScan of the v2 stage-2
// results: one row per rate in rates_per_us and (d, mode), d = 3 and 5, learned decoder.
// The shift column says "yes" only when the shift is resolved: entry.shiftDelta.resolved
// when shiftDelta exists, otherwise interiorBelowTauPhysResolved. The point-estimate flag
// interiorBelowTauPhys flips with noise (DECISIONS E12) and is never shown.
export const CROSSTALK_TITLE = 'Measurement crosstalk scan (d = 3 and 5, learned decoder)';
export const CROSSTALK_SENTENCE = 'Crosstalk only moves the best readout time when it is far above the measured value.';
// The tau*_phys column is the scan's own crosstalkScan.tauPhys (the readout model's 23.5 µs,
// not the simulated 23.0 µs shown elsewhere), because the shift column was decided against it;
// the header says so (A53 review item 9).
export const CROSSTALK_COLUMNS = [
  'Crosstalk rate', 'd', 'Decoding', 'Best readout time for the code (τ*_log, 95% interval)',
  'Best readout time for one qubit (τ*_phys, readout model, used for the shift test)', 'Shift below the single-qubit optimum',
];
// A53 review item 11: the scan runs at reduced statistics with its own seeds, so its row at the
// measured rate differs from the main learned curve at the same rate.
export function crosstalkNote(scan) {
  const R = Number.isFinite(scan?.readoutDrawsPerShot) ? `R = ${scan.readoutDrawsPerShot}, ` : '';
  return `Scan at reduced statistics (${R}its own seeds); compare its rows with each other, not with the main curve.`;
}
const CARD_RATE = 1.67e-5;
const sameRate = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b));
const formatRate = (r) => (r === 0 ? '0' : r.toExponential());

export function crosstalkShift(entry) {
  if (entry.shiftDelta && typeof entry.shiftDelta === 'object') return entry.shiftDelta.resolved === true ? 'yes' : 'not resolved';
  return entry.interiorBelowTauPhysResolved === true ? 'yes' : 'not resolved';
}

export function crosstalkRows(scan) {
  if (!scan || !Array.isArray(scan.entries)) return [];
  const card = Number.isFinite(scan.cardRate_per_us) ? scan.cardRate_per_us : CARD_RATE;
  const rates = Array.isArray(scan.rates_per_us) ? scan.rates_per_us : [...new Set(scan.entries.map((e) => e.rate))];
  const rows = [];
  for (const rate of rates) {
    const entries = scan.entries
      .filter((e) => sameRate(e.rate, rate) && (e.d === 3 || e.d === 5))
      .sort((a, b) => a.d - b.d || (a.mode === b.mode ? 0 : a.mode === 'hard' ? -1 : 1));
    const rateText = sameRate(rate, card) ? `${formatRate(rate)} /µs (measured lower bound)` : `${formatRate(rate)} /µs (scan)`;
    for (const e of entries) {
      const t = e.tauLog || {};
      const ci = Number.isFinite(t.lo) && Number.isFinite(t.hi) ? ` (${formatTau(t.lo)} to ${formatTau(t.hi)})` : '';
      const tauLog = !Number.isFinite(t.xMin) ? 'not available'
        : t.atEdge ? `no interior minimum (lowest at ${formatTau(t.xMin)}, the grid edge)${ci}` : `${formatTau(t.xMin)}${ci}`;
      const phys = Number.isFinite(e.tauPhys) ? e.tauPhys : scan.tauPhys;
      rows.push({
        rate: rateText, d: String(e.d), mode: e.mode, tauLog,
        tauPhys: Number.isFinite(phys) ? formatTau(phys) : 'not available',
        shift: crosstalkShift(e),
      });
    }
  }
  return rows;
}

function crosstalkTable(results) {
  const box = el('div', { class: 'crosstalk-scan' });
  box.appendChild(el('p', {}, CROSSTALK_SENTENCE));
  const table = el('table');
  table.createCaption().textContent = `${CROSSTALK_TITLE}${results?.fixture ? ' — placeholder data' : ''}`;
  const hr = table.createTHead().insertRow();
  for (const c of CROSSTALK_COLUMNS) hr.appendChild(el('th', { scope: 'col' }, c));
  const body = table.createTBody();
  for (const r of crosstalkRows(results?.crosstalkScan)) {
    const tr = body.insertRow();
    for (const v of [r.rate, r.d, r.mode, r.tauLog, r.tauPhys, r.shift]) tr.insertCell().textContent = v;
  }
  box.appendChild(scrollBox(table, CROSSTALK_TITLE));
  box.appendChild(el('p', { class: 'hint' }, crosstalkNote(results?.crosstalkScan)));
  return box;
}

// Challenge score bands by pL(chosen) / pL(min) (U7.5).
export const CHALLENGE_BANDS = [{ max: 1.1, text: 'spot on' }, { max: 1.5, text: 'close' }];
export function scoreBand(ratio) {
  return (CHALLENGE_BANDS.find((b) => ratio <= b.max) || { text: 'try again' }).text;
}

// The challenge after "Lock in": the chosen tau's logical error against the lowest point of
// the same curve (one results series on the grid xs), or null when tau is not on the grid.
// Returns { tau, pL, best: { tau, pL }, ratio, band }.
export function challengeResult(xs, series, tau) {
  const i = xs.findIndex((x) => Math.abs(x - tau) <= 1e-9 * Math.max(1, tau));
  if (i < 0 || !Number.isFinite(series.pL[i])) return null;
  let b = -1;
  series.pL.forEach((p, k) => { if (Number.isFinite(p) && (b < 0 || p < series.pL[b])) b = k; });
  const pL = series.pL[i];
  const pMin = series.pL[b];
  const ratio = pMin > 0 ? pL / pMin : (pL > 0 ? Infinity : 1);
  return { tau: xs[i], pL, best: { tau: xs[b], pL: pMin }, ratio, band: scoreBand(ratio) };
}

// Threshold in photon counts. The Module API does not expose it, so it is read from the
// hard decisions of sampled measurements when the model reports the count n (the gap
// between the largest count read as dark and the smallest read as bright); otherwise the
// midpoint of the mean counts R_bright*tau and R_dark*tau is shown and labelled as such.
function findThreshold(readout, tau, rng) {
  const brightBit = paramsIon.bright_is_bit === 0 ? 0 : 1;
  let maxDark = -Infinity;
  let minBright = Infinity;
  let haveN = true;
  for (let s = 0; s < 4000 && haveN; s++) {
    const res = readout.measure(s % 2, rng);
    if (typeof res.n !== 'number') { haveN = false; break; }
    if (res.hard === brightBit) minBright = Math.min(minBright, res.n);
    else maxDark = Math.max(maxDark, res.n);
  }
  if (haveN && Number.isFinite(maxDark) && Number.isFinite(minBright) && maxDark < minBright) {
    return { x: (maxDark + minBright) / 2, text: `counts above ${maxDark} are read as bright` };
  }
  const mid = (cardValue(paramsIon.R_bright_per_us) * tau + cardValue(paramsIon.R_dark_per_us) * tau) / 2;
  return { x: mid, text: `shown at the midpoint of the mean counts, ${formatNumber(mid)}` };
}

let histCounter = 0;

// Bar histogram of photon counts: bright bars filled, dark bars outlined and hatched,
// so the two differ by more than colour. Returns a <figure> with a values table.
function drawHistogram(bright, dark, threshold, tau) {
  const id = `hist${++histCounter}`;
  const fig = document.createElement('figure');
  fig.className = 'chart';
  const cap = document.createElement('figcaption');
  cap.id = `${id}-title`;
  cap.textContent = `Photon counts in ${formatTau(tau)} (${HIST_SAMPLES} samples each)`;
  fig.appendChild(cap);

  const nMax = Math.max(bright.length, dark.length, Math.ceil(threshold.x) + 2);
  const yMax = Math.max(1, ...bright, ...dark);
  const narrow = isNarrow();
  const W = 640;
  const H = narrow ? 400 : 276;
  const m = narrow ? { left: 84, right: 20, top: 16, bottom: 76 } : { left: 64, right: 16, top: 16, bottom: 52 };
  const plotW = W - m.left - m.right;
  const plotH = H - m.top - m.bottom;
  const bw = plotW / nMax;
  const sx = (n) => m.left + n * bw;
  const sy = (v) => m.top + plotH * (1 - v / yMax);

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-labelledby': `${id}-title ${id}-desc`, class: 'chart-svg-el' });
  const desc = svgEl('desc', { id: `${id}-desc` }, svg);
  const defs = svgEl('defs', {}, svg);
  const pat = svgEl('pattern', { id: `${id}-hatch`, patternUnits: 'userSpaceOnUse', width: 6, height: 6, patternTransform: 'rotate(45)' }, defs);
  svgEl('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: SERIES_STYLES[1].color, 'stroke-width': 2 }, pat);

  const axes = svgEl('g', { class: 'axes' }, svg);
  for (let f = 0; f <= 4; f++) {
    const v = (yMax * f) / 4;
    const y = sy(v);
    svgEl('line', { x1: m.left, x2: W - m.right, y1: y, y2: y, class: 'grid' }, axes);
    svgEl('text', { x: m.left - 8, y: y + (narrow ? 7 : 4), 'text-anchor': 'end', class: 'tick' }, axes).textContent = String(Math.round(v));
  }
  const step = Math.max(1, Math.ceil(nMax / (narrow ? 8 : 12)));
  for (let n = 0; n < nMax; n += step) {
    svgEl('text', { x: sx(n) + bw / 2, y: H - m.bottom + (narrow ? 28 : 18), 'text-anchor': 'middle', class: 'tick' }, axes).textContent = String(n);
  }
  svgEl('line', { x1: m.left, x2: W - m.right, y1: H - m.bottom, y2: H - m.bottom, class: 'axis' }, axes);
  svgEl('line', { x1: m.left, x2: m.left, y1: m.top, y2: H - m.bottom, class: 'axis' }, axes);
  svgEl('text', { x: m.left + plotW / 2, y: H - 12, 'text-anchor': 'middle', class: 'axis-label' }, axes).textContent = 'Photons counted';
  const ylx = narrow ? 20 : 16;
  svgEl('text', { x: ylx, y: m.top + plotH / 2, 'text-anchor': 'middle', class: 'axis-label', transform: `rotate(-90 ${ylx} ${m.top + plotH / 2})` }, axes).textContent = 'Samples';

  // Dark first (behind), then bright; each bar takes half the bin.
  for (let n = 0; n < nMax; n++) {
    const vd = dark[n] || 0;
    const vb = bright[n] || 0;
    if (vd > 0) svgEl('rect', { x: sx(n) + bw * 0.5, y: sy(vd), width: Math.max(1, bw * 0.45), height: sy(0) - sy(vd), fill: `url(#${id}-hatch)`, stroke: SERIES_STYLES[1].color, 'stroke-width': 1.5 }, svg);
    if (vb > 0) svgEl('rect', { x: sx(n) + bw * 0.05, y: sy(vb), width: Math.max(1, bw * 0.45), height: sy(0) - sy(vb), fill: SERIES_STYLES[0].color }, svg);
  }
  const tx = sx(threshold.x + 0.5);
  svgEl('line', { x1: tx, x2: tx, y1: m.top, y2: H - m.bottom, class: 'vline' }, svg);
  drawVlineLabels(svg, [{ x: tx, label: 'Threshold' }], m.top - 2, W - m.right, narrow);

  const sum = (h) => h.reduce((s, v, n) => s + v * n, 0) / Math.max(1, h.reduce((s, v) => s + v, 0));
  desc.textContent = `Histogram of photon counts. Bright: mean ${formatNumber(sum(bright))} photons; dark: mean ${formatNumber(sum(dark))} photons. Threshold: ${threshold.text}. Counts are listed in the table below.`;
  const holder = document.createElement('div');
  holder.className = 'chart-svg';
  holder.appendChild(svg);
  fig.appendChild(holder);
  // The hatch pattern lives in the chart SVG; each legend key draws its own copy.
  const hatchKey = (key) => {
    const p = svgEl('pattern', { id: `${id}-hatch-key`, patternUnits: 'userSpaceOnUse', width: 6, height: 6, patternTransform: 'rotate(45)' }, svgEl('defs', {}, key));
    svgEl('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: SERIES_STYLES[1].color, 'stroke-width': 2 }, p);
    svgEl('rect', { x: 2, y: 1, width: 14, height: 12, fill: `url(#${id}-hatch-key)`, stroke: SERIES_STYLES[1].color, 'stroke-width': 1.5 }, key);
  };
  fig.appendChild(htmlLegend([
    { name: 'Bright (ion in the bright state), solid bars', swatch: (key) => svgEl('rect', { x: 2, y: 1, width: 14, height: 12, fill: SERIES_STYLES[0].color }, key) },
    { name: 'Dark, hatched bars', swatch: hatchKey },
  ]));

  const details = document.createElement('details');
  details.className = 'chart-data';
  const summary = document.createElement('summary');
  summary.textContent = 'Histogram values as a table';
  summary.setAttribute('aria-describedby', cap.id);
  details.appendChild(summary);
  const table = document.createElement('table');
  const head = table.createTHead().insertRow();
  for (const h of ['Photons', 'Bright samples', 'Dark samples']) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = h;
    head.appendChild(th);
  }
  const body = table.createTBody();
  for (let n = 0; n < nMax; n++) {
    if (!(bright[n] || dark[n])) continue;
    const tr = body.insertRow();
    for (const v of [n, bright[n] || 0, dark[n] || 0]) tr.insertCell().textContent = String(v);
  }
  details.appendChild(scrollBox(table, 'Histogram values'));
  fig.appendChild(details);
  return fig;
}

function el(tag, attrs = {}, text = null) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  if (text !== null) e.textContent = text;
  return e;
}

const INTRO = {
  'trapped-ion': 'A trapped ion is read out by shining a laser on it and counting the photons it scatters: the bright state glows, the dark state stays (almost) dark. '
    + 'Counting for longer separates the two histograms, so fewer readings fall on the wrong side of the threshold. '
    + 'But a longer readout also makes every round slower and gives the ion more time to change state, so the logical error does not keep falling.',
  superconducting: 'A superconducting qubit is read out through a microwave resonator: the reflected signal lands at one point of the IQ plane for |0⟩ and at another for |1⟩. '
    + 'Integrating the signal for longer averages away the amplifier noise, so the two clusters separate. '
    + 'The resonator first has to ring up, so below about 0.5 µs there is less signal than a fully rung-up resonator would give. '
    + 'But the qubit can decay from |1⟩ to |0⟩ while it is being read, which smears points from the |1⟩ cluster towards |0⟩, and a longer readout also leaves the other qubits idle for longer. '
    + 'So the logical error has an optimum integration time.',
};
// Text cut (U7.3): the two sentences that stay visible; INTRO moves under "Explain more".
const SHORT_INTRO = {
  'trapped-ion': 'Counting photons for longer separates bright from dark, so fewer readings are wrong. '
    + 'But every round gets slower, and the ion has more time to change state.',
  superconducting: 'Integrating the resonator signal for longer separates |0⟩ from |1⟩, so fewer readings are wrong. '
    + 'But the qubit can decay while it is read, and the other qubits wait longer.',
};

export function mountLevel3(container) {
  // The batch decodes the stored d = 3, r = 3 shots of the current memory (the X-basis bank in
  // the phase-flip memory, A53 review item 14); runPoint reads the basis from the bank.
  const batchBanks = Object.fromEntries([['Z', bankD3R3], ['X', bankXD3R3]]
    .filter(([, b]) => b)
    .map(([basis, b]) => [basis, sampleBank(b, expandShots(b), BATCH_SHOTS, SEED + 1)]));
  // Each platform keeps its own slider position (and its last batch result).
  const state = new Map();
  let plat = currentPlatform();
  let grid = [];
  let idx = 0;
  const platState = (p) => {
    if (!state.has(p.id)) {
      const g = tauGrid(p);
      state.set(p.id, { grid: g, idx: defaultTauIndex(g, 0.1, p), batch: null });
    }
    return state.get(p.id);
  };

  const ux = FEATURES.uxV2 === true;
  container.replaceChildren();
  container.appendChild(el('h2', {}, 'Level 3: Listen longer?'));
  if (ux) container.appendChild(goalLine('find the readout time that gives the lowest logical error.'));
  mountPlatformToggle(container, 'l3');
  const intro = el('p', { class: 'intro' });
  container.appendChild(intro);
  // With the text cut on, the full introduction sits under "Explain more".
  const longIntro = el('p');
  if (ux) container.appendChild(explainMore([longIntro]));

  const row = el('div', { class: 'control-row' });
  const labelText = document.createTextNode('');
  const label = el('label', { for: 'l3-tau' });
  const out = el('output', { for: 'l3-tau' });
  label.append(labelText, out);
  const input = el('input', { id: 'l3-tau', type: 'range', min: '0', step: '1' });
  row.append(label, input);
  container.appendChild(row);

  const assign = el('p', { class: 'status', 'aria-live': 'polite' });
  container.appendChild(assign);
  const visualBox = el('div');
  container.appendChild(visualBox);

  // Superconducting only: the stage-3 assignment-error U-curve.
  const assignChart = createChart({ title: '', xLabel: 'Integration time τ (µs)', yLabel: 'Assignment error', series: [], logX: true, logY: true, yFloor: 1e-6 });
  container.appendChild(assignChart.root);

  const batchRow = el('div', { class: 'control-row' });
  // With the text cut on, the button says what it does and the help sentence goes.
  const batchBtn = el('button', { type: 'button' }, ux ? `Decode ${BATCH_SHOTS} shots at this τ` : 'Batch');
  batchRow.appendChild(batchBtn);
  if (!ux) batchRow.appendChild(el('span', { class: 'hint' }, `Decode ${BATCH_SHOTS} shots of the d = 3, r = 3 bank at this τ (hard mode).`));
  container.appendChild(batchRow);
  const batchOut = el('p', { class: 'status', 'aria-live': 'polite' });
  container.appendChild(batchOut);

  // Distance selector (uxV2): which d's tau_log marker the chart shows, and the challenge's d.
  let selD = 3;
  const challengeOut = el('p', { class: 'status', 'aria-live': 'polite' });
  if (ux) {
    const fs = el('fieldset', { class: 'platform-toggle' });
    fs.appendChild(el('legend', {}, 'Code distance d (whose optimum the chart marks)'));
    for (const d of [3, 5, 7]) {
      const id = `l3-d-${d}`;
      const input = el('input', { type: 'radio', name: 'l3-d', id, value: String(d) });
      input.checked = d === selD;
      input.addEventListener('change', () => {
        if (!input.checked) return;
        selD = d;
        challengeOut.textContent = '';
        render();
      });
      const wrap = el('span', { class: 'platform-option' });
      wrap.append(input, el('label', { for: id }, `d = ${d}`));
      fs.appendChild(wrap);
    }
    container.appendChild(fs);
  }

  const chart = createChart({ title: '', xLabel: '', yLabel: 'Logical error probability', series: [], logX: true, logY: true, yFloor: 1e-7 });
  container.appendChild(chart.root);

  // Error budget at the current tau (uxV2), under the curves, with its values table.
  const budgetBox = el('div', { class: 'budget' });
  const budgetNote = el('p', { class: 'status', 'aria-live': 'polite' });
  let budgetChart = null;
  if (ux) {
    budgetBox.appendChild(budgetNote);
    container.appendChild(budgetBox);
  }

  // Challenge (uxV2): lock in a tau, scored against the lowest point of the chosen d's curve.
  const challengeBtn = el('button', { type: 'button' }, 'Lock in');
  const challengeText = el('p', {});
  if (ux) {
    const box = el('section', { class: 'challenge', 'aria-labelledby': 'l3-challenge-title' });
    box.appendChild(el('h3', { id: 'l3-challenge-title' }, 'Challenge: set τ to minimise logical error'));
    box.append(challengeText, challengeBtn, challengeOut);
    container.appendChild(box);
  }
  const optList = el('ul', { class: 'optima' });
  container.appendChild(ux ? explainMore([optList], 'Explain more: the optima in numbers') : optList);
  // Trapped ion only, behind FEATURES.crosstalk: the crosstalk scan (CC-B20).
  // In the phase-flip memory the scan comes from the X-basis file (U7.9).
  const crosstalkHolder = el('div');
  const crosstalkBox = FEATURES.crosstalk === true && ION.budgetResults?.crosstalkScan
    ? explainMore([crosstalkHolder], 'Explain more: measurement crosstalk')
    : null;
  if (crosstalkBox) container.appendChild(crosstalkBox);
  // The idle physics of the chosen memory (U7.9: T1 in the bit-flip memory, T2 in the phase-flip one).
  const idleLine = el('p', { class: 'hint' });
  if (basisOn()) container.appendChild(idleLine);
  if (ux) {
    container.appendChild(takeawayCard('the readout time with the fewest wrong readings is not always the best for the code: '
      + 'a longer wait has its own cost.').node);
  }

  let chartBase = null;
  let optima = null;
  let assignBase = null;

  // Everything that depends on the platform but not on τ.
  function setPlatformView(p) {
    plat = p;
    const st = platState(p);
    grid = st.grid;
    idx = st.idx;
    intro.textContent = ux ? SHORT_INTRO[p.id] : INTRO[p.id];
    longIntro.textContent = INTRO[p.id];
    labelText.textContent = ux ? `Readout time τ (${p.tauName.toLowerCase()}): ` : `${p.tauName} τ: `;
    input.max = String(grid.length - 1);
    input.value = String(idx);
    const basis = currentBasis();
    const res = resultsFor(p, basis);
    const tag = `stage ${p.stage}, ${p.label.toLowerCase()}`;
    const mem = memoryTag(basis);
    const hard = res.series.filter((s) => s.mode === 'hard').sort((a, b) => a.d - b.d);
    optima = optimaInfo(res, 'hard', hard.map((s) => s.d), { physFromEmpirical: p.physFromEmpirical });
    chartBase = {
      title: `Logical error against ${p.tauName.toLowerCase()} (${tag}, hard decoding)${mem}${res.fixture ? ' — placeholder data' : ''}`,
      xLabel: `${p.tauName} τ (µs)`, yLabel: 'Logical error probability',
      series: hard.map((s) => ({
        name: `d = ${s.d}, r = ${s.r}`, x: res.x.values, y: s.pL, lo: s.lo, hi: s.hi,
        ...(ux ? tokenStyle({ d: s.d, mode: 'hard', platform: p.id, endLabel: `d = ${s.d}` }) : {}),
      })),
      logX: true, logY: true, yFloor: 1e-7,
      ...(ux ? {
        title: `Logical error against readout time (${p.label.toLowerCase()}, hard decoding)${mem}${res.fixture ? ' — placeholder data' : ''}`,
        xLabel: 'readout time τ (µs)', yLabel: 'logical error (chance the stored bit is lost)',
      } : {}),
    };
    optList.replaceChildren(...optima.lines.map((t) => el('li', {}, t)));
    if (crosstalkBox) {
      crosstalkBox.hidden = p.id !== 'trapped-ion';
      const ctSrc = budgetFor(ION, basis);
      crosstalkHolder.replaceChildren(...(ctSrc?.crosstalkScan ? [crosstalkTable(ctSrc)] : []));
    }
    idleLine.textContent = BASES[basis].idleText;

    const a = p.id === 'superconducting' ? res.assignment : null;
    assignChart.root.hidden = !a;
    assignBase = a && ux ? {
      title: `Readout error against readout time (${p.label.toLowerCase()})${res.fixture ? ' — placeholder data' : ''}`,
      xLabel: 'readout time τ (µs)', yLabel: 'readout error (chance one measurement is wrong)', logX: true, logY: true, yFloor: 1e-6,
      series: [
        {
          name: 'the readout model’s own estimate (no ring-up)', x: res.x.values, y: a.belief,
          color: 'var(--b-gate)', shape: 'diamond', dash: '6 4', endLabel: 'model',
        },
        {
          name: 'simulated readout error', x: res.x.values, y: a.empirical, lo: a.lo, hi: a.hi,
          color: TOKENS.readout.color, shape: TOKENS.shape[p.id], dash: TOKENS.readout.dash, endLabel: 'simulated',
        },
      ],
    } : a ? {
      title: `Assignment error against integration time (${tag})${res.fixture ? ' — placeholder data' : ''}`,
      xLabel: 'Integration time τ (µs)', yLabel: 'Assignment error', logX: true, logY: true, yFloor: 1e-6,
      series: [
        { name: 'Model (belief)', x: res.x.values, y: a.belief },
        { name: 'Simulated (empirical)', x: res.x.values, y: a.empirical, lo: a.lo, hi: a.hi },
      ],
    } : null;
    render();
  }

  function renderVisual(readout, tau, rng) {
    if (plat.id === 'superconducting') {
      const s0 = readout.iqSamples(0, IQ_SAMPLES, rng);
      const s1 = readout.iqSamples(1, IQ_SAMPLES, rng);
      visualBox.replaceChildren(drawIqView({ samples0: s0, samples1: s1, readout, rng, tau, tauText: formatTau }));
      return;
    }
    const brightBit = paramsIon.bright_is_bit === 0 ? 0 : 1;
    const bright = readout.countHistogram(brightBit, HIST_SAMPLES, rng);
    const dark = readout.countHistogram(1 - brightBit, HIST_SAMPLES, rng);
    const threshold = findThreshold(readout, tau, rng);
    visualBox.replaceChildren(drawHistogram(bright, dark, threshold, tau));
  }

  function render() {
    const tau = grid[idx];
    const st = platState(plat);
    out.textContent = formatTau(tau);
    input.setAttribute('aria-valuetext', formatTau(tau));
    const tauLine = { x: tau, label: `τ = ${formatTau(tau)}` };
    // With the distance selector only the chosen d's tau_log is marked.
    const marks = ux ? distanceMarkers(resultsFor(plat), selD, tau, { physFromEmpirical: plat.physFromEmpirical }) : [tauLine, ...optima.vlines];
    if (ux) {
      renderBudget(tau);
      challengeText.textContent = `Move the slider to the readout time you think gives d = ${selD} its lowest logical error, then lock it in.`;
      challengeBtn.textContent = `Lock in τ = ${formatTau(tau)}`;
    }
    if (assignBase) {
      const phys = optima.vlines.filter((v) => v.label.includes('τ_phys')).map((v) => ({ x: v.x, label: 'τ_phys' }));
      assignChart.update({ ...assignBase, vlines: [tauLine, ...phys] });
    }
    let readout;
    try {
      readout = plat.create(plat.params, tau);
    } catch (err) {
      assign.textContent = `The readout model rejected τ = ${formatTau(tau)}: ${err.message}`;
      visualBox.replaceChildren();
      batchBtn.disabled = true;
      chart.update({ ...chartBase, vlines: marks, points: [] });
      return;
    }
    batchBtn.disabled = !batchBanks[currentBasis()];
    const rng = createRng(SEED + idx);
    assign.textContent = assignmentText(plat, readout, tau);
    try {
      renderVisual(readout, tau, rng);
    } catch (err) {
      visualBox.replaceChildren(el('p', { class: 'status error' }, `The readout picture could not be drawn: ${err.message}`));
    }

    // A batch result belongs to the memory it was decoded in.
    const batch = st.batch && st.batch.tau === tau && st.batch.basis === currentBasis() ? st.batch : null;
    batchOut.textContent = batch ? batch.text : '';
    batchOut.className = 'status';
    chart.update({
      ...chartBase,
      vlines: marks,
      points: batch ? [{ name: `Batch, d = 3 (${batch.pt.n} shots)`, x: tau, y: batch.pt.wilson.p, lo: batch.pt.wilson.lo, hi: batch.pt.wilson.hi }] : [],
    });
  }

  function renderBudget(tau) {
    const basis = currentBasis();
    const src = budgetFor(plat, basis);
    const stored = budgetAt(src, tau, { crosstalk: plat.id === 'trapped-ion' && FEATURES.crosstalk === true });
    // With the basis toggle the idle segment names its physics (T1 or T2).
    const entry = stored && basisOn()
      ? { ...stored, segments: stored.segments.map((g) => (g.key === 'idle' ? { ...g, name: BASES[basis].idleName } : g)) }
      : stored;
    if (!entry) {
      if (budgetChart) budgetChart.root.hidden = true;
      budgetNote.textContent = `No error budget is stored for τ = ${formatTau(tau)}.`;
      return;
    }
    const opts = budgetBarOptions(entry, { tauText: formatTau(tau), placeholder: src?.fixture === true });
    opts.title += memoryTag(basis);
    if (!budgetChart) {
      budgetChart = createStackedBars(opts);
      budgetBox.replaceChildren(budgetChart.root, budgetNote);
    } else budgetChart.update(opts);
    budgetChart.root.hidden = false;
    budgetNote.textContent = budgetSentence(entry, formatTau(tau));
  }

  challengeBtn.addEventListener('click', () => {
    const tau = grid[idx];
    const res = resultsFor(plat);
    const series = res.series.find((u) => u.d === selD && u.mode === 'hard');
    const r = series ? challengeResult(res.x.values, series, tau) : null;
    if (!r) {
      challengeOut.textContent = `There is no stored logical error for d = ${selD} at τ = ${formatTau(tau)}.`;
      return;
    }
    const verdict = { 'spot on': 'Spot on!', close: 'Close.', 'try again': 'Try again.' }[r.band];
    const ratio = Number.isFinite(r.ratio) ? `${sig3(r.ratio)} times the lowest` : 'while the lowest is zero';
    challengeOut.textContent = `${verdict} At τ = ${formatTau(r.tau)} the logical error for d = ${selD} is ${formatNumber(r.pL)}, ${ratio}. `
      + `The true optimum on the grid is τ = ${formatTau(r.best.tau)}, with ${formatNumber(r.best.pL)}.`;
  });

  batchBtn.addEventListener('click', () => {
    const tau = grid[idx];
    const basis = currentBasis();
    const bank = batchBanks[basis];
    if (!bank) return;
    const pt = runPoint({ bank, readout: plat.create(plat.params, tau), mode: 'hard', pGate: P_GATE, seed: SEED + 2, maxShots: BATCH_SHOTS });
    const w = pt.wilson;
    const mem = basisOn() ? `${BASES[basis].memory}, ` : '';
    const text = `Batch at τ = ${formatTau(tau)} (${plat.label.toLowerCase()}, ${mem}d = 3, r = 3, ${pt.n} shots, hard decoding): ${pt.k} logical error${pt.k === 1 ? '' : 's'}, `
      + `p = ${formatNumber(w.p)} (95% interval ${formatNumber(w.lo)} to ${formatNumber(w.hi)}).${pt.nonExact ? ` ${pt.nonExact} matchings were not exact.` : ''}`;
    platState(plat).batch = { tau, basis, pt, text };
    render();
  });

  input.addEventListener('input', () => {
    idx = Number(input.value);
    platState(plat).idx = idx;
    render();
  });
  onPlatformChange(setPlatformView);
  onBasisChange(() => setPlatformView(plat));
  // The histogram and the IQ plane are redrawn for the new layout (the charts redraw themselves).
  onNarrowChange(() => render());
  setPlatformView(plat);
}
