// Hero panel (team checklist U7.2), above the level tabs, behind FEATURES.hero: "How long
// should you listen to a qubit?" One readout-time slider that snaps to the platform's grid
// points, a trapped ion / superconducting toggle, and one chart on a shared log tau axis with
// the readout error (simulated assignment error) and the logical error (d = 3, hard decoding;
// the decoder HERO_DECODER on both arms: the learned one since the SP5 cut was lifted), each with a dot at the chosen
// tau. The interval between tau*_log and tau*_phys (empirical) is shaded, and a live sentence
// says where the chosen tau sits relative to the two optima. "Go deeper" opens Level 3.
//
// Data: stage2v2 (trapped ion, v2b) and stage3v2 (superconducting, dense grid) from
// bridge_data.js, the files the final Stage 4 uses, so the hero's tau*_log equals Level 5's. Every
// number shown comes from those results: x.values, assignment.empirical (lo, hi), the d = 3
// hard series, optima.tauPhysEmpirical (else findMinimum on assignment.empirical, log x) and
// the matching optima.tauLog entry. The v1 stage-3 file has no decoder field and no
// tauPhysEmpirical; the fallbacks below cover it. With the basis toggle (U7.9) the phase-flip
// memory reads stage2x and stage3x instead, and the chart title names the memory.

import { stage2v2, stage3v2, stage2x, stage3x } from './bridge_data.js';
import { findMinimum } from './bridge_core.js';
import { createChart, TOKENS, intervalOf, intervalCaption } from './charts.js';
import {
  formatTau, currentBasis, onBasisChange, memoryTag, LEARNED_LABEL,
} from './level3.js';

export const HERO_PLATFORMS = [
  { id: 'trapped-ion', label: 'Trapped ion', results: stage2v2, resultsX: stage2x },
  { id: 'superconducting', label: 'Superconducting', results: stage3v2, resultsX: stage3x },
];
// The results file the hero reads for a platform in a basis: the *_x file in the X basis.
export const heroResults = (p, basis = 'Z') => (basis === 'X' ? p.resultsX : p.results);

export const QUESTION = 'How long should you listen to a qubit?';
export const BAND_LABEL = 'listening longer costs more than it gains here';
export const COINCIDE_LABEL = 'here the best readout is also the best for the code';
// tau*_log above tau*_phys beyond the intervals: not covered by U7.2 (no current results
// show it); the band is drawn with this label so that the page never claims the opposite.
export const REVERSE_LABEL = 'the code still gains from listening past the best readout here';

// A series without a decoder field predates the learned decoder, so it is the naive one.
const isNaive = (o) => o.decoder === undefined || o.decoder === 'naive';

// The one decoder the hero shows, on both arms (team checklist U3 rows 14a and 31). null: the
// learned series when the results contain it (else naive). The SP5 cut rule had set it to
// "naive" after V12(b) failed (DECISIONS E4); DECISIONS, Person A, records "SP5 cut lifted
// (V18 passed)" (Sun 11 Oct; data/results/holdout.json, setting1), so U3 row 31 sets it to null.
export const HERO_DECODER = null;

// The two curves: { tau, decoder, readout: { y, lo, hi }, logical: { y, lo, hi, interval } }.
// Logical: the d = 3 hard series of `decoder` ("naive" or "learned"); with decoder null, the
// learned series when the results contain it, else the naive one. A requested learned
// series that is missing falls back to naive (the returned decoder says which was used).
// Its interval is the cluster interval when the series carries one, else Wilson (interval:
// "cluster" or "wilson"; CC-B21 item 2). The readout error's interval is Wilson.
export function heroCurves(results, decoder = null) {
  const tau = results?.x?.values;
  if (!Array.isArray(tau) || tau.length === 0) throw new Error('the results have no readout-time grid');
  if (decoder !== null && decoder !== 'naive' && decoder !== 'learned') throw new Error(`unknown decoder ${decoder}`);
  const hard3 = (results.series || []).filter((s) => s.d === 3 && s.mode === 'hard');
  const learned = decoder === 'naive' ? undefined : hard3.find((s) => s.decoder === 'learned');
  const s = learned ?? hard3.find((u) => u.decoder === undefined) ?? hard3.find(isNaive);
  if (!s) throw new Error('the results have no d = 3 hard series');
  const a = results.assignment;
  if (!a || !Array.isArray(a.empirical) || a.empirical.length !== tau.length) {
    throw new Error('the results have no simulated assignment error on the grid');
  }
  const iv = intervalOf(s);
  return {
    tau,
    decoder: learned ? 'learned' : 'naive',
    readout: { y: a.empirical, lo: a.lo, hi: a.hi },
    logical: { y: s.pL, lo: iv.lo, hi: iv.hi, interval: iv.kind },
  };
}

// { tauPhys: { xMin, atEdge, from }, tauLog: { xMin, lo, hi, atEdge } | null } for the decoder
// of heroCurves. tauPhys is optima.tauPhysEmpirical, else the minimum of assignment.empirical
// located with findMinimum on log x (as Level 3 does for the superconducting qubit).
export function heroOptima(results, decoder) {
  const e = results.optima?.tauPhysEmpirical;
  let tauPhys;
  if (e && Number.isFinite(e.xMin)) {
    tauPhys = { xMin: e.xMin, atEdge: e.atEdge === true, from: 'tauPhysEmpirical' };
  } else {
    const m = findMinimum(results.x.values, results.assignment.empirical, { logX: true });
    tauPhys = { xMin: m.xMin, atEdge: m.atEdge === true, from: 'findMinimum' };
  }
  const logs = (results.optima?.tauLog || []).filter((t) => t.d === 3 && t.mode === 'hard');
  const tauLog = (decoder === 'learned'
    ? logs.find((t) => t.decoder === 'learned')
    : logs.find((t) => t.decoder === undefined) ?? logs.find(isNaive)) ?? null;
  return { tauPhys, tauLog };
}

const close = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b), 1);

// The shaded interval between the two optima.
// kind "band": tau*_log < tau*_phys, shaded [tau*_log, tau*_phys] with BAND_LABEL.
// kind "coincide": tau*_phys lies inside tau*_log's 95% interval (or equals tau*_log when it
// has none): no band, COINCIDE_LABEL. kind "reverse": tau*_log > tau*_phys beyond the
// interval, shaded [tau*_phys, tau*_log] with REVERSE_LABEL. kind "none": an optimum is
// missing or on the grid edge. x0 <= x1 are the two optima whenever both exist.
// With `grid` (the slider's grid), the live sentence's range [logLo, logHi] also takes in the
// grid point nearest tau*_log: an interpolated tau*_log can have an interval narrower than the
// grid step (superconducting X, d = 3 naive: 0.526 µs, interval 0.519 to 0.533 µs), and the
// lowest measured point, 0.5 µs, must not then be called "too short".
export function bandInfo({ tauLog, tauPhys }, { grid = null } = {}) {
  if (!tauLog || !tauPhys || tauLog.atEdge || tauPhys.atEdge || !Number.isFinite(tauLog.xMin) || !Number.isFinite(tauPhys.xMin)) {
    return { kind: 'none', shaded: false, label: null };
  }
  const x0 = Math.min(tauLog.xMin, tauPhys.xMin);
  const x1 = Math.max(tauLog.xMin, tauPhys.xMin);
  const hasCi = Number.isFinite(tauLog.lo) && Number.isFinite(tauLog.hi);
  // tau*_log's 95% interval (tau*_log itself without one) and its nearest grid point.
  const near = Array.isArray(grid) && grid.length ? grid[snapIndex(grid, tauLog.xMin)] : tauLog.xMin;
  const log = {
    tauLog: tauLog.xMin, ciLo: hasCi ? tauLog.lo : null, ciHi: hasCi ? tauLog.hi : null,
    logLo: Math.min(hasCi ? tauLog.lo : tauLog.xMin, near), logHi: Math.max(hasCi ? tauLog.hi : tauLog.xMin, near),
  };
  const inside = hasCi ? tauPhys.xMin >= tauLog.lo && tauPhys.xMin <= tauLog.hi : close(tauPhys.xMin, tauLog.xMin);
  if (inside) return { kind: 'coincide', shaded: false, x0, x1, ...log, label: COINCIDE_LABEL };
  if (tauLog.xMin < tauPhys.xMin) return { kind: 'band', shaded: true, x0, x1, ...log, label: BAND_LABEL };
  return { kind: 'reverse', shaded: true, x0, x1, ...log, label: REVERSE_LABEL };
}

// The live sentence for the chosen tau, worded by where tau sits against tau*_log's 95%
// interval [logLo, logHi] (see bandInfo), not against the readout's reliability (A53 review
// item 4: in the phase-flip memory 20 µs was called "too short" although the readout there is
// within 4% of its best). Below the range: too short; above it: too long; inside it: at or near
// the code's best. The shaded band between the range and tau*_phys keeps its own sentence
// (U7.2). A tau exactly on an end of the range or of the band counts as inside.
export const TOO_SHORT = 'Too short: listening longer still lowers the logical error.';
export const TOO_LONG = 'Too long: the waiting costs more than the clearer signal is worth.';
export function liveSentence(tau, band) {
  const t = formatTau(tau);
  if (band.kind === 'none') return `At ${t} these results show no interior optimum to compare with.`;
  if (tau < band.logLo && !close(tau, band.logLo)) {
    if (band.kind === 'reverse' && (tau > band.x0 || close(tau, band.x0))) {
      return `At ${t} the readout is already past its best, but the code still gains from the longer wait.`;
    }
    return TOO_SHORT;
  }
  if (tau > band.logHi && !close(tau, band.logHi)) {
    if (band.kind === 'band' && (tau < band.x1 || close(tau, band.x1))) {
      return `At ${t} you read better, but your data qubits lose more than you gain.`;
    }
    return TOO_LONG;
  }
  if (band.kind === 'coincide') return `At ${t}: ${COINCIDE_LABEL}.`;
  const ci = Number.isFinite(band.ciLo) && Number.isFinite(band.ciHi) ? `, 95% interval ${formatTau(band.ciLo)} to ${formatTau(band.ciHi)}` : '';
  return `At ${t} you are at or near the code's best readout time (τ*_log = ${formatTau(band.tauLog)}${ci}).`;
}

// The slider's starting index for one case: the grid point nearest tau*_log, else 0. The hero
// returns to it whenever the platform or the basis changes (A53 review item 4).
export function startIndex(curves, optima) {
  return optima.tauLog && Number.isFinite(optima.tauLog.xMin) ? snapIndex(curves.tau, optima.tauLog.xMin) : 0;
}

// The slider runs over grid indices (step 1), so every position is a grid point; a value
// between two positions is rounded and clamped.
export function sliderTau(grid, value) {
  const i = Math.min(grid.length - 1, Math.max(0, Math.round(Number(value) || 0)));
  return { index: i, tau: grid[i] };
}

// Index of the grid point nearest to tau on a log axis (the slider's starting point).
export function snapIndex(grid, tau) {
  let best = 0;
  for (let i = 1; i < grid.length; i++) {
    if (Math.abs(Math.log(grid[i] / tau)) < Math.abs(Math.log(grid[best] / tau))) best = i;
  }
  return best;
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

// goDeeper(platformId): opens Level 3 on that platform; null when Level 3 is off.
export function mountHero(container, { goDeeper = null } = {}) {
  // The slider starts at the grid point nearest the current case's tau*_log and returns there
  // whenever the platform or the basis changes, so the status never describes another case's
  // readout time (A53 review item 4: the bit-flip 20 µs was kept in the phase-flip memory).
  let basis = currentBasis();
  const buildViews = () => new Map(HERO_PLATFORMS.map((p) => {
    const results = heroResults(p, basis);
    const curves = heroCurves(results, HERO_DECODER);
    const optima = heroOptima(results, curves.decoder);
    const band = bandInfo(optima, { grid: curves.tau });
    const start = startIndex(curves, optima);
    return [p.id, { p, results, curves, optima, band, start, idx: start }];
  }));
  let views = buildViews();
  let view = views.get(HERO_PLATFORMS[0].id);

  container.replaceChildren();
  container.setAttribute('aria-labelledby', 'hero-question');
  container.appendChild(el('h2', { id: 'hero-question', class: 'hero-question' }, QUESTION));

  const controls = el('div', { class: 'control-row hero-controls' });
  const fs = el('fieldset', { class: 'platform-toggle' });
  fs.appendChild(el('legend', {}, 'Platform'));
  for (const { p } of views.values()) {
    const id = `hero-platform-${p.id}`;
    const input = el('input', { type: 'radio', name: 'hero-platform', id, value: p.id });
    input.checked = p.id === view.p.id;
    input.addEventListener('change', () => { if (input.checked) setView(p.id); });
    const wrap = el('span', { class: 'platform-option' });
    wrap.append(input, el('label', { for: id }, p.label));
    fs.appendChild(wrap);
  }
  const sliderRow = el('div', { class: 'hero-slider' });
  const label = el('label', { for: 'hero-tau' }, 'Readout time τ: ');
  const out = el('output', { for: 'hero-tau' });
  label.appendChild(out);
  const input = el('input', { id: 'hero-tau', type: 'range', min: '0', step: '1' });
  sliderRow.append(label, input);
  controls.append(fs, sliderRow);
  container.appendChild(controls);

  const live = el('p', { class: 'hero-live', 'aria-live': 'polite' });
  container.appendChild(live);

  const chart = createChart({ title: '', xLabel: '', yLabel: '', series: [] });
  container.appendChild(chart.root);
  const note = el('p', { class: 'hero-note' });
  container.appendChild(note);

  if (goDeeper) {
    const link = el('a', { href: '#s2s-level3', class: 'hero-deeper' }, 'Go deeper: Level 3, Listen longer?');
    link.addEventListener('click', (ev) => {
      ev.preventDefault();
      goDeeper(view.p.id);
    });
    container.appendChild(el('p', {}, '')).appendChild(link);
  }

  function render() {
    const { p, results: res, curves, optima, band, idx } = view;
    const tau = curves.tau[idx];
    out.textContent = formatTau(tau);
    input.setAttribute('aria-valuetext', formatTau(tau));
    live.textContent = liveSentence(tau, band);

    const shape = TOKENS.shape[p.id];
    // The learned decoder's results carry the out-of-sample label (U3 row 31).
    const decoderName = curves.decoder === 'learned' ? LEARNED_LABEL : 'naive decoder';
    const { interval, ...logical } = curves.logical;
    const vlines = [];
    if (optima.tauLog && !optima.tauLog.atEdge) vlines.push({ x: optima.tauLog.xMin, label: 'τ*_log' });
    if (!optima.tauPhys.atEdge) vlines.push({ x: optima.tauPhys.xMin, label: 'τ*_phys' });
    chart.update({
      title: `${p.label}: readout error and logical error against readout time${memoryTag(basis)}${res.fixture ? ' — placeholder data' : ''}`,
      xLabel: 'readout time τ (µs)',
      yLabel: 'error probability',
      logX: true, logY: true, yFloor: 1e-6,
      series: [
        {
          name: 'readout error (chance one measurement is wrong)', x: curves.tau, ...curves.readout,
          color: TOKENS.readout.color, dash: TOKENS.readout.dash, shape, endLabel: 'readout',
        },
        {
          name: `logical error (chance the stored bit is lost), d = 3, hard decoding, ${decoderName}`, x: curves.tau, ...logical,
          color: TOKENS.d[3], dash: null, shape, endLabel: 'logical',
        },
      ],
      intervals: intervalCaption([{ what: 'Logical error', kind: interval }, { what: 'Readout error', kind: 'wilson' }]),
      points: [
        { name: `readout error at τ = ${formatTau(tau)}`, x: tau, y: curves.readout.y[idx], color: TOKENS.readout.color, shape, filled: true },
        { name: `logical error at τ = ${formatTau(tau)}`, x: tau, y: curves.logical.y[idx], color: TOKENS.d[3], shape, filled: true },
      ],
      bands: band.shaded ? [{ x0: band.x0, x1: band.x1, label: band.label }] : [],
      vlines,
    });
    // The band label also in text (the chart's label is inside the SVG); the coincide label
    // has no band to sit on.
    const phys = `τ*_phys = ${formatTau(optima.tauPhys.xMin)} (lowest readout error)`;
    const log = optima.tauLog ? `τ*_log = ${formatTau(optima.tauLog.xMin)} (lowest logical error)` : 'τ*_log: none';
    note.textContent = band.kind === 'none' ? `${log}; ${phys}.` : `${log}; ${phys}: ${band.label}.`;
  }

  function setView(id) {
    view = views.get(id);
    view.idx = view.start;
    input.max = String(view.curves.tau.length - 1);
    input.value = String(view.idx);
    render();
  }

  input.addEventListener('input', () => {
    view.idx = sliderTau(view.curves.tau, input.value).index;
    input.value = String(view.idx);
    render();
  });
  onBasisChange((b) => {
    basis = b;
    views = buildViews();
    setView(view.p.id);
  });
  setView(view.p.id);
}
