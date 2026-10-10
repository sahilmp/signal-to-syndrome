// Hero panel (team checklist U7.2), above the level tabs, behind FEATURES.hero: "How long
// should you listen to a qubit?" One readout-time slider that snaps to the platform's grid
// points, a trapped ion / superconducting toggle, and one chart on a shared log tau axis with
// the readout error (simulated assignment error) and the logical error (d = 3, hard decoding;
// the decoder HERO_DECODER on both arms, naive while the SP5 cut holds), each with a dot at the chosen
// tau. The interval between tau*_log and tau*_phys (empirical) is shaded, and a live sentence
// says where the chosen tau sits relative to the two optima. "Go deeper" opens Level 3.
//
// Data: stage2v2 (trapped ion) and stage3v2 (superconducting) from bridge_data.js. Every
// number shown comes from those results: x.values, assignment.empirical (lo, hi), the d = 3
// hard series, optima.tauPhysEmpirical (else findMinimum on assignment.empirical, log x) and
// the matching optima.tauLog entry. The v1 stage-3 file has no decoder field and no
// tauPhysEmpirical; the fallbacks below cover it. With the basis toggle (U7.9) the phase-flip
// memory reads stage2x and stage3x instead, and the chart title names the memory.

import { stage2v2, stage3v2, stage2x, stage3x } from './bridge_data.js';
import { findMinimum } from './bridge_core.js';
import { createChart, TOKENS } from './charts.js';
import { formatTau, currentBasis, onBasisChange, memoryTag } from './level3.js';

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

// The one decoder the hero shows, on both arms (team checklist U3 row 14a). "naive" while the
// SP5 cut rule is in force: V12(b) failed (DECISIONS E4). Set to null (learned when the
// results contain it) only after a decision recorded in DECISIONS lifts the cut.
export const HERO_DECODER = 'naive';

// The two curves: { tau, decoder, readout: { y, lo, hi }, logical: { y, lo, hi, n } }.
// Logical: the d = 3 hard series of `decoder` ("naive" or "learned"); with decoder null, the
// learned series when the results contain it, else the naive one. A requested learned
// series that is missing falls back to naive (the returned decoder says which was used).
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
  return {
    tau,
    decoder: learned ? 'learned' : 'naive',
    readout: { y: a.empirical, lo: a.lo, hi: a.hi },
    logical: { y: s.pL, lo: s.lo, hi: s.hi },
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
export function bandInfo({ tauLog, tauPhys }) {
  if (!tauLog || !tauPhys || tauLog.atEdge || tauPhys.atEdge || !Number.isFinite(tauLog.xMin) || !Number.isFinite(tauPhys.xMin)) {
    return { kind: 'none', shaded: false, label: null };
  }
  const x0 = Math.min(tauLog.xMin, tauPhys.xMin);
  const x1 = Math.max(tauLog.xMin, tauPhys.xMin);
  const hasCi = Number.isFinite(tauLog.lo) && Number.isFinite(tauLog.hi);
  const inside = hasCi ? tauPhys.xMin >= tauLog.lo && tauPhys.xMin <= tauLog.hi : close(tauPhys.xMin, tauLog.xMin);
  if (inside) return { kind: 'coincide', shaded: false, x0, x1, label: COINCIDE_LABEL };
  if (tauLog.xMin < tauPhys.xMin) return { kind: 'band', shaded: true, x0, x1, label: BAND_LABEL };
  return { kind: 'reverse', shaded: true, x0, x1, label: REVERSE_LABEL };
}

// The live sentence for the chosen tau. Below both optima, between them, above both (U7.2).
// An optimum exactly at tau counts as "between". When the optima coincide, a tau between
// them gets the coincide label instead of the "between" template, which assumes tau*_log <
// tau*_phys (likewise REVERSE_LABEL's case).
export function liveSentence(tau, band) {
  const t = formatTau(tau);
  if (band.kind === 'none') return `At ${t} these results show no interior optimum to compare with.`;
  if (tau < band.x0 && !close(tau, band.x0)) return 'Too short: the readout itself is still unreliable.';
  if (tau > band.x1 && !close(tau, band.x1)) return 'Too long: the waiting costs more than the clearer signal is worth.';
  if (band.kind === 'coincide') return `At ${t}: ${COINCIDE_LABEL}.`;
  if (band.kind === 'reverse') return `At ${t} the readout is already past its best, but the code still gains from the longer wait.`;
  return `At ${t} you read better, but your data qubits lose more than you gain.`;
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
  // Each platform keeps its own slider position; it starts at the grid point nearest tau*_log.
  // A basis change rebuilds the views and keeps each platform's readout time when it is on the
  // new grid.
  let basis = currentBasis();
  const buildViews = (old = null) => new Map(HERO_PLATFORMS.map((p) => {
    const results = heroResults(p, basis);
    const curves = heroCurves(results, HERO_DECODER);
    const optima = heroOptima(results, curves.decoder);
    const band = bandInfo(optima);
    const prev = old?.get(p.id);
    const kept = prev ? curves.tau.indexOf(prev.curves.tau[prev.idx]) : -1;
    const start = kept >= 0 ? kept
      : optima.tauLog && Number.isFinite(optima.tauLog.xMin) ? snapIndex(curves.tau, optima.tauLog.xMin) : 0;
    return [p.id, { p, results, curves, optima, band, idx: start }];
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
          name: `logical error (chance the stored bit is lost), d = 3, hard decoding, ${curves.decoder} decoder`, x: curves.tau, ...curves.logical,
          color: TOKENS.d[3], dash: null, shape, endLabel: 'logical',
        },
      ],
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
    views = buildViews(views);
    setView(view.p.id);
  });
  setView(view.p.id);
}
