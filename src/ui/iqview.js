// IQ-plane view for the superconducting readout (level 3). Draws the IQ samples of both
// states (the readout object's iqSamples method), the two cluster centres and the
// threshold line. A qubit that decays from |1⟩ to |0⟩ during the integration gives a
// point between the clusters, so decays show as a smear from the |1⟩ cluster towards |0⟩.

import { svgEl, formatNumber, SERIES_STYLES } from './charts.js';

const median = (xs) => {
  const s = Float64Array.from(xs).sort();
  const n = s.length;
  return n === 0 ? NaN : n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

// Cluster centre of one state: the coordinate-wise median of its samples. The Module API
// does not expose the model's centres; the median is not pulled towards the other
// cluster by the minority of samples that decayed during the integration.
export function clusterCentre(samples) {
  return { i: median(samples.map((p) => p.i)), q: median(samples.map((p) => p.q)) };
}

// Unit vector from centre c0 to centre c1 (the axis that separates the states).
export function separationAxis(c0, c1) {
  const di = c1.i - c0.i;
  const dq = c1.q - c0.q;
  const len = Math.hypot(di, dq);
  return len > 0 ? { i: di / len, q: dq / len, len } : { i: 1, q: 0, len: 0 };
}

// Threshold as a position t along the axis from c0 (0 = at c0, len = at c1); the line is
// perpendicular to the axis. The Module API does not expose the model's threshold, so it
// is fitted from measure() when the result carries its IQ point (numeric i and q): the
// t that best separates the points read 0 from those read 1. Otherwise the perpendicular
// bisector of the centres is used (the optimum for equal Gaussian clusters).
export function findIqThreshold(readout, c0, c1, rng, nDraws = 4000) {
  const axis = separationAxis(c0, c1);
  const mid = { t: axis.len / 2, fitted: false };
  const pts = [];
  for (let s = 0; s < nDraws; s++) {
    const res = readout.measure(s % 2, rng);
    if (typeof res.i !== 'number' || typeof res.q !== 'number') return mid;
    pts.push({ t: (res.i - c0.i) * axis.i + (res.q - c0.q) * axis.q, hard: res.hard });
  }
  pts.sort((a, b) => a.t - b.t);
  // Errors with the cut just below point 0: every point read 0 is on the wrong side.
  let errors = pts.filter((p) => p.hard === 0).length;
  let best = errors;
  let bestIdx = -1;
  for (let k = 0; k < pts.length; k++) {
    errors += pts[k].hard === 0 ? -1 : 1;
    if (errors < best) { best = errors; bestIdx = k; }
  }
  if (bestIdx < 0 || bestIdx >= pts.length - 1) return mid;
  return { t: (pts[bestIdx].t + pts[bestIdx + 1].t) / 2, fitted: true };
}

let iqCounter = 0;

// samples0, samples1: [{ i, q }] for the qubit prepared in |0⟩ and in |1⟩.
// Returns a <figure> with the SVG and a table of the samples' projections on the axis.
export function drawIqView({ samples0, samples1, readout, rng, tau, tauText }) {
  const id = `iq${++iqCounter}`;
  const c0 = clusterCentre(samples0);
  const c1 = clusterCentre(samples1);
  const axis = separationAxis(c0, c1);
  const thr = findIqThreshold(readout, c0, c1, rng);
  const proj = (p) => (p.i - c0.i) * axis.i + (p.q - c0.q) * axis.q;
  const wrong0 = samples0.filter((p) => proj(p) > thr.t).length;
  const wrong1 = samples1.filter((p) => proj(p) <= thr.t).length;

  const fig = document.createElement('figure');
  fig.className = 'chart iq-view';
  const cap = document.createElement('figcaption');
  cap.id = `${id}-title`;
  cap.textContent = `IQ plane after integrating for ${tauText(tau)} (${samples0.length} samples per state)`;
  fig.appendChild(cap);

  // Equal scales on both axes, so the threshold looks perpendicular to the axis.
  const all = samples0.concat(samples1);
  const is = all.map((p) => p.i).concat([c0.i, c1.i]);
  const qs = all.map((p) => p.q).concat([c0.q, c1.q]);
  const iMin = Math.min(...is);
  const iMax = Math.max(...is);
  const qMin = Math.min(...qs);
  const qMax = Math.max(...qs);
  const span = 1.08 * Math.max(iMax - iMin, qMax - qMin, 1e-9);
  const iMid = (iMin + iMax) / 2;
  const qMid = (qMin + qMax) / 2;
  const W = 520;
  const m = { left: 56, right: 16, top: 16, bottom: 48 };
  const P = W - m.left - m.right;
  const H = m.top + P + m.bottom + 44;
  const sx = (i) => m.left + ((i - (iMid - span / 2)) / span) * P;
  const sy = (q) => m.top + (1 - (q - (qMid - span / 2)) / span) * P;

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-labelledby': `${id}-title ${id}-desc`, class: 'chart-svg-el iq-svg' });
  const desc = svgEl('desc', { id: `${id}-desc` }, svg);
  const defs = svgEl('defs', {}, svg);
  const clip = svgEl('clipPath', { id: `${id}-clip` }, defs);
  svgEl('rect', { x: m.left, y: m.top, width: P, height: P }, clip);

  const axes = svgEl('g', { class: 'axes' }, svg);
  svgEl('rect', { x: m.left, y: m.top, width: P, height: P, fill: 'none', class: 'axis' }, axes);
  svgEl('text', { x: m.left + P / 2, y: m.top + P + 30, 'text-anchor': 'middle', class: 'axis-label' }, axes).textContent = 'In-phase signal I (arbitrary units)';
  svgEl('text', { x: 16, y: m.top + P / 2, 'text-anchor': 'middle', class: 'axis-label', transform: `rotate(-90 16 ${m.top + P / 2})` }, axes).textContent = 'Quadrature Q';

  // |0⟩: filled circles; |1⟩: outlined squares. Shape, not only colour, tells them apart.
  const g = svgEl('g', { 'clip-path': `url(#${id}-clip)` }, svg);
  const st0 = SERIES_STYLES[0];
  const st1 = SERIES_STYLES[1];
  for (const p of samples0) svgEl('circle', { cx: sx(p.i).toFixed(1), cy: sy(p.q).toFixed(1), r: 1.8, fill: st0.color, 'fill-opacity': 0.45 }, g);
  for (const p of samples1) {
    svgEl('rect', { x: (sx(p.i) - 1.7).toFixed(1), y: (sy(p.q) - 1.7).toFixed(1), width: 3.4, height: 3.4, fill: 'none', stroke: st1.color, 'stroke-width': 0.9, 'stroke-opacity': 0.7 }, g);
  }

  // Threshold: perpendicular to the axis at distance thr.t from c0 (clipped to the plot).
  const tp = { i: c0.i + thr.t * axis.i, q: c0.q + thr.t * axis.q };
  const L = 2 * span;
  svgEl('line', {
    x1: sx(tp.i - L * axis.q), y1: sy(tp.q + L * axis.i), x2: sx(tp.i + L * axis.q), y2: sy(tp.q - L * axis.i), class: 'iq-threshold',
  }, g);

  for (const [c, name] of [[c0, '|0⟩ centre'], [c1, '|1⟩ centre']]) {
    const cx = sx(c.i);
    const cy = sy(c.q);
    svgEl('circle', { cx, cy, r: 7, class: 'iq-centre' }, svg);
    svgEl('line', { x1: cx - 4, x2: cx + 4, y1: cy, y2: cy, class: 'iq-centre-mark' }, svg);
    svgEl('line', { x1: cx, x2: cx, y1: cy - 4, y2: cy + 4, class: 'iq-centre-mark' }, svg);
    const t = svgEl('text', { x: cx, y: cy - 12, 'text-anchor': 'middle', class: 'iq-label' }, svg);
    t.textContent = name;
  }

  const ly = m.top + P + 56;
  svgEl('circle', { cx: m.left + 6, cy: ly - 4, r: 4, fill: st0.color }, svg);
  svgEl('text', { x: m.left + 16, y: ly, class: 'legend-text' }, svg).textContent = 'Prepared in |0⟩ (dots)';
  svgEl('rect', { x: m.left + 170, y: ly - 9, width: 9, height: 9, fill: 'none', stroke: st1.color, 'stroke-width': 1.5 }, svg);
  svgEl('text', { x: m.left + 186, y: ly, class: 'legend-text' }, svg).textContent = 'Prepared in |1⟩ (squares)';
  svgEl('line', { x1: m.left + 340, x2: m.left + 362, y1: ly - 4, y2: ly - 4, class: 'iq-threshold' }, svg);
  svgEl('text', { x: m.left + 368, y: ly, class: 'legend-text' }, svg).textContent = 'Threshold';

  const thrText = thr.fitted ? 'fitted to the model\'s own decisions' : 'midway between the centres';
  desc.textContent = `Scatter of ${samples0.length} IQ samples per state. |0⟩ centre at I = ${formatNumber(c0.i)}, Q = ${formatNumber(c0.q)}; `
    + `|1⟩ centre at I = ${formatNumber(c1.i)}, Q = ${formatNumber(c1.q)}; distance ${formatNumber(axis.len)}. `
    + `Threshold line perpendicular to the line joining the centres, ${thrText}. `
    + `${wrong0} of the |0⟩ samples and ${wrong1} of the |1⟩ samples fall on the wrong side. The table below bins the samples along the line joining the centres.`;

  const holder = document.createElement('div');
  holder.className = 'chart-svg';
  holder.appendChild(svg);
  fig.appendChild(holder);

  const summaryP = document.createElement('p');
  summaryP.className = 'hint';
  summaryP.textContent = `On the wrong side of the threshold: ${wrong0} of ${samples0.length} |0⟩ samples (${formatNumber(wrong0 / samples0.length)}) and `
    + `${wrong1} of ${samples1.length} |1⟩ samples (${formatNumber(wrong1 / samples1.length)}). Threshold ${thrText}.`;
  fig.appendChild(summaryP);
  fig.appendChild(projectionTable(samples0, samples1, proj, axis.len, thr.t));
  return fig;
}

// Text alternative: counts per bin of the projection on the axis from the |0⟩ centre
// (position 0) to the |1⟩ centre (position 1), so a decay smear shows as |1⟩ counts
// between 0 and 1.
function projectionTable(samples0, samples1, proj, len, tThr) {
  const scale = len > 0 ? len : 1;
  const u0 = samples0.map((p) => proj(p) / scale);
  const u1 = samples1.map((p) => proj(p) / scale);
  const lo = Math.floor(Math.min(...u0, ...u1, 0) * 4) / 4;
  const hi = Math.ceil(Math.max(...u0, ...u1, 1) * 4) / 4;
  const nBins = Math.max(1, Math.round((hi - lo) / 0.25));
  const count = (us) => {
    const h = new Array(nBins).fill(0);
    for (const u of us) h[Math.min(nBins - 1, Math.max(0, Math.floor((u - lo) / 0.25)))]++;
    return h;
  };
  const h0 = count(u0);
  const h1 = count(u1);

  const details = document.createElement('details');
  details.className = 'chart-data';
  const summary = document.createElement('summary');
  summary.textContent = 'IQ samples as a table (binned along the line joining the centres)';
  details.appendChild(summary);
  const note = document.createElement('p');
  note.className = 'hint';
  note.textContent = `Position 0 is the |0⟩ centre and 1 the |1⟩ centre; the threshold is at ${formatNumber(tThr / scale)}.`;
  details.appendChild(note);
  const table = document.createElement('table');
  const head = table.createTHead().insertRow();
  for (const h of ['Position along the axis', '|0⟩ samples', '|1⟩ samples']) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = h;
    head.appendChild(th);
  }
  const body = table.createTBody();
  for (let b = 0; b < nBins; b++) {
    if (!(h0[b] || h1[b])) continue;
    const tr = body.insertRow();
    const a = lo + 0.25 * b;
    for (const v of [`${formatNumber(a)} to ${formatNumber(a + 0.25)}`, String(h0[b]), String(h1[b])]) tr.insertCell().textContent = v;
  }
  details.appendChild(table);
  return details;
}
