// Level 3, "Listen longer?": trapped-ion readout. A detection-time slider over the tau grid
// of paramsIon; photon-count histograms for bright and dark with the threshold; the
// assignment error; the stage-2 curves of logical error against tau (hard mode) with the
// optima; and a "Batch" button that runs runPoint on 200 shots of bankD3R3.

import { createIonReadout, runPoint } from './bridge_core.js';
import { bankD3R3, stage2, paramsIon } from './bridge_data.js';
import { createRng } from '../core/rng.js';
import { expandShots } from '../core/bank.js';
import { createChart, svgEl, formatNumber, SERIES_STYLES } from './charts.js';
import { P_GATE } from './level1.js';
import { sampleBank } from './level2.js';

const SEED = 20261012;
const HIST_SAMPLES = 5000;
const BATCH_SHOTS = 200;

// Parameter cards store { value, source }; plain values are accepted too.
export const cardValue = (p) => (p !== null && typeof p === 'object' && !Array.isArray(p) && 'value' in p ? p.value : p);

export function tauGrid() {
  const grid = cardValue(paramsIon.tau_grid_us);
  if (!Array.isArray(grid) || grid.length === 0) throw new Error('paramsIon has no tau_grid_us');
  return grid.map(Number);
}

export const formatTau = (tau) => `${Number(tau.toPrecision(6))} µs`;

// Index of the first grid point whose assignment error is below `target`, so that the
// levels open where readout errors are common enough to see.
export function defaultTauIndex(grid, target = 0.1) {
  for (let i = 0; i < grid.length; i++) {
    try {
      if (createIonReadout(paramsIon, grid[i]).averageAssignmentError() < target) return i;
    } catch {
      // A grid point the model rejects is skipped.
    }
  }
  return 0;
}

// Text for the optima of a stage-2 or stage-3 results file: tauPhys and tauLog per d
// for one mode, "no interior minimum" when the minimum sits at the edge of the grid.
export function optimaInfo(results, mode, ds) {
  const o = results.optima || {};
  const lines = [];
  const vlines = [];
  if (o.tauPhys) {
    if (o.tauPhys.atEdge) lines.push('Physical optimum τ_phys (lowest assignment error): no interior minimum.');
    else {
      lines.push(`Physical optimum τ_phys (lowest assignment error): ${formatTau(o.tauPhys.xMin)}.`);
      vlines.push({ x: o.tauPhys.xMin, label: 'τ_phys' });
    }
  }
  for (const t of (o.tauLog || []).filter((t) => t.mode === mode && ds.includes(t.d)).sort((a, b) => a.d - b.d)) {
    if (t.atEdge) lines.push(`Logical optimum τ_log for d = ${t.d} (${mode}): no interior minimum.`);
    else {
      const ci = Number.isFinite(t.lo) && Number.isFinite(t.hi) ? ` (95% interval ${formatTau(t.lo)} to ${formatTau(t.hi)})` : '';
      lines.push(`Logical optimum τ_log for d = ${t.d} (${mode}): ${formatTau(t.xMin)}${ci}.`);
      vlines.push({ x: t.xMin, label: `τ_log d${t.d}` });
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
  const W = 640;
  const H = 300;
  const m = { left: 64, right: 16, top: 16, bottom: 72 };
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
    svgEl('text', { x: m.left - 8, y: y + 4, 'text-anchor': 'end', class: 'tick' }, axes).textContent = String(Math.round(v));
  }
  const step = Math.max(1, Math.ceil(nMax / 12));
  for (let n = 0; n < nMax; n += step) {
    svgEl('text', { x: sx(n) + bw / 2, y: H - m.bottom + 18, 'text-anchor': 'middle', class: 'tick' }, axes).textContent = String(n);
  }
  svgEl('line', { x1: m.left, x2: W - m.right, y1: H - m.bottom, y2: H - m.bottom, class: 'axis' }, axes);
  svgEl('line', { x1: m.left, x2: m.left, y1: m.top, y2: H - m.bottom, class: 'axis' }, axes);
  svgEl('text', { x: m.left + plotW / 2, y: H - m.bottom + 38, 'text-anchor': 'middle', class: 'axis-label' }, axes).textContent = 'Photons counted';
  svgEl('text', { x: 16, y: m.top + plotH / 2, 'text-anchor': 'middle', class: 'axis-label', transform: `rotate(-90 16 ${m.top + plotH / 2})` }, axes).textContent = 'Samples';

  // Dark first (behind), then bright; each bar takes half the bin.
  for (let n = 0; n < nMax; n++) {
    const vd = dark[n] || 0;
    const vb = bright[n] || 0;
    if (vd > 0) svgEl('rect', { x: sx(n) + bw * 0.5, y: sy(vd), width: Math.max(1, bw * 0.45), height: sy(0) - sy(vd), fill: `url(#${id}-hatch)`, stroke: SERIES_STYLES[1].color, 'stroke-width': 1.5 }, svg);
    if (vb > 0) svgEl('rect', { x: sx(n) + bw * 0.05, y: sy(vb), width: Math.max(1, bw * 0.45), height: sy(0) - sy(vb), fill: SERIES_STYLES[0].color }, svg);
  }
  const tx = sx(threshold.x + 0.5);
  svgEl('line', { x1: tx, x2: tx, y1: m.top, y2: H - m.bottom, class: 'vline' }, svg);
  svgEl('text', { x: Math.min(tx + 4, W - 80), y: m.top + 12, class: 'vline-label' }, svg).textContent = 'Threshold';

  const ly = H - 16;
  svgEl('rect', { x: m.left, y: ly - 10, width: 14, height: 12, fill: SERIES_STYLES[0].color }, svg);
  svgEl('text', { x: m.left + 20, y: ly, class: 'legend-text' }, svg).textContent = 'Bright (ion in the bright state), solid bars';
  svgEl('rect', { x: m.left + 300, y: ly - 10, width: 14, height: 12, fill: `url(#${id}-hatch)`, stroke: SERIES_STYLES[1].color, 'stroke-width': 1.5 }, svg);
  svgEl('text', { x: m.left + 320, y: ly, class: 'legend-text' }, svg).textContent = 'Dark, hatched bars';

  const sum = (h) => h.reduce((s, v, n) => s + v * n, 0) / Math.max(1, h.reduce((s, v) => s + v, 0));
  desc.textContent = `Histogram of photon counts. Bright: mean ${formatNumber(sum(bright))} photons; dark: mean ${formatNumber(sum(dark))} photons. Threshold: ${threshold.text}. Counts are listed in the table below.`;
  const holder = document.createElement('div');
  holder.className = 'chart-svg';
  holder.appendChild(svg);
  fig.appendChild(holder);

  const details = document.createElement('details');
  details.className = 'chart-data';
  const summary = document.createElement('summary');
  summary.textContent = 'Histogram values as a table';
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
  details.appendChild(table);
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

export function mountLevel3(container) {
  const grid = tauGrid();
  let idx = defaultTauIndex(grid);
  const shots = expandShots(bankD3R3);
  const batchBank = sampleBank(bankD3R3, shots, BATCH_SHOTS, SEED + 1);
  let batch = null; // { tau, pt }

  container.replaceChildren();
  container.appendChild(el('h2', {}, 'Level 3: Listen longer?'));
  container.appendChild(el('p', { class: 'intro' },
    'A trapped ion is read out by shining a laser on it and counting the photons it scatters: the bright state glows, the dark state stays (almost) dark. '
    + 'Counting for longer separates the two histograms, so fewer readings fall on the wrong side of the threshold. '
    + 'But a longer readout also makes every round slower and gives the ion more time to change state, so the logical error does not keep falling.'));

  const row = el('div', { class: 'control-row' });
  const label = el('label', { for: 'l3-tau' }, 'Detection time τ: ');
  const out = el('output', { for: 'l3-tau' }, formatTau(grid[idx]));
  label.appendChild(out);
  const input = el('input', { id: 'l3-tau', type: 'range', min: '0', max: String(grid.length - 1), step: '1', value: String(idx) });
  row.append(label, input);
  container.appendChild(row);

  const assign = el('p', { class: 'status', 'aria-live': 'polite' });
  container.appendChild(assign);
  const histBox = el('div');
  container.appendChild(histBox);

  const batchRow = el('div', { class: 'control-row' });
  const batchBtn = el('button', { type: 'button' }, 'Batch');
  const batchHelp = el('span', { class: 'hint' }, `Decode ${BATCH_SHOTS} shots of the d = 3, r = 3 bank at this τ (hard mode).`);
  batchRow.append(batchBtn, batchHelp);
  container.appendChild(batchRow);
  const batchOut = el('p', { class: 'status', 'aria-live': 'polite' });
  container.appendChild(batchOut);

  const hard = stage2.series.filter((s) => s.mode === 'hard').sort((a, b) => a.d - b.d);
  const ds = hard.map((s) => s.d);
  const optima = optimaInfo(stage2, 'hard', ds);
  const series = hard.map((s) => ({ name: `d = ${s.d}, r = ${s.r}`, x: stage2.x.values, y: s.pL, lo: s.lo, hi: s.hi }));
  const chartBase = {
    title: `Logical error against detection time (stage 2, trapped ion, hard decoding)${stage2.fixture ? ' — placeholder data' : ''}`,
    xLabel: 'Detection time τ (µs)', yLabel: 'Logical error probability',
    series, logX: true, logY: true, yFloor: 1e-7,
  };
  const chart = createChart({ ...chartBase, vlines: [] });
  container.appendChild(chart.root);
  const optList = el('ul', { class: 'optima' });
  for (const t of optima.lines) optList.appendChild(el('li', {}, t));
  container.appendChild(optList);

  function render() {
    const tau = grid[idx];
    out.textContent = formatTau(tau);
    input.setAttribute('aria-valuetext', formatTau(tau));
    let readout;
    try {
      readout = createIonReadout(paramsIon, tau);
    } catch (err) {
      assign.textContent = `The readout model rejected τ = ${formatTau(tau)}: ${err.message}`;
      histBox.replaceChildren();
      batchBtn.disabled = true;
      return;
    }
    batchBtn.disabled = false;
    const rng = createRng(SEED + idx);
    const brightBit = paramsIon.bright_is_bit === 0 ? 0 : 1;
    const bright = readout.countHistogram(brightBit, HIST_SAMPLES, rng);
    const dark = readout.countHistogram(1 - brightBit, HIST_SAMPLES, rng);
    const threshold = findThreshold(readout, tau, rng);
    const eps = readout.averageAssignmentError();
    assign.textContent = `At τ = ${formatTau(tau)} the assignment error (average chance of reading the wrong state) is ${formatNumber(eps)}.`;
    histBox.replaceChildren(drawHistogram(bright, dark, threshold, tau));

    const showBatch = batch && batch.tau === tau;
    if (!showBatch) batchOut.textContent = '';
    chart.update({
      ...chartBase,
      vlines: [{ x: tau, label: `τ = ${formatTau(tau)}` }, ...optima.vlines],
      points: showBatch ? [{ name: `Batch, d = 3 (${batch.pt.n} shots)`, x: tau, y: batch.pt.wilson.p, lo: batch.pt.wilson.lo, hi: batch.pt.wilson.hi }] : [],
    });
  }

  batchBtn.addEventListener('click', () => {
    const tau = grid[idx];
    const pt = runPoint({ bank: batchBank, readout: createIonReadout(paramsIon, tau), mode: 'hard', pGate: P_GATE, seed: SEED + 2, maxShots: BATCH_SHOTS });
    batch = { tau, pt };
    const w = pt.wilson;
    render();
    batchOut.textContent = `Batch at τ = ${formatTau(tau)} (d = 3, r = 3, ${pt.n} shots, hard decoding): ${pt.k} logical error${pt.k === 1 ? '' : 's'}, `
      + `p = ${formatNumber(w.p)} (95% interval ${formatNumber(w.lo)} to ${formatNumber(w.hi)}).${pt.nonExact ? ` ${pt.nonExact} matchings were not exact.` : ''}`;
  });

  input.addEventListener('input', () => {
    idx = Number(input.value);
    render();
  });
  render();
}
