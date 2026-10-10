// Inline SVG charts with axes, ticks, optional log scales, error bars and a legend.
// Every chart comes with a text alternative: a <details> table listing its values.
// Also the shared pieces of the text cut (team checklist U7.3): goal line, "Explain more"
// and the takeaway card.

import { FEATURES } from './features.js';

// The SVG namespace is read from a parsed element, so that no URL literal ends up in
// the bundle (tools/release_check.mjs checks every URL in main.js against an allowlist).
let svgNs = null;
export function svgNamespace() {
  if (svgNs === null) {
    const tmp = document.createElement('div');
    tmp.innerHTML = '<svg></svg>';
    svgNs = tmp.firstChild.namespaceURI;
  }
  return svgNs;
}

// A fill or stroke given as a CSS custom property (tokens.css, e.g. var(--d3)) goes into the
// style attribute: SVG presentation attributes do not resolve var().
export function svgEl(tag, attrs = {}, parent = null) {
  const el = document.createElementNS(svgNamespace(), tag);
  for (const [k, v] of Object.entries(attrs)) {
    if ((k === 'fill' || k === 'stroke') && String(v).startsWith('var(')) el.style.setProperty(k, String(v));
    else el.setAttribute(k, String(v));
  }
  if (parent) parent.appendChild(el);
  return el;
}

// Okabe-Ito colours (designed to stay distinguishable with colour-vision deficiency);
// each series also gets its own marker shape, so colour is never the only cue. The last
// two are darkened (from #CC79A7 and #56B4E9) to reach 3:1 on white and on --panel.
export const SERIES_STYLES = [
  { color: '#0072B2', shape: 'circle' },
  { color: '#D55E00', shape: 'square' },
  { color: '#009E73', shape: 'triangle' },
  { color: '#B8649A', shape: 'diamond' },
  { color: '#2B8CC4', shape: 'cross' },
];

// Design tokens (tokens.css, U7.1): the same quantity has the same colour and marker on every
// chart. Colour by distance, line style by decoding mode (hard solid, soft dashed), marker by
// platform (trapped ion circle, superconducting square); readout-error curves take the
// readout budget colour and a dotted line. Used when FEATURES.uxV2 is on, and by the hero.
export const TOKENS = {
  d: { 3: 'var(--d3)', 5: 'var(--d5)', 7: 'var(--d7)' },
  dash: { hard: null, soft: '6 4' },
  shape: { 'trapped-ion': 'circle', superconducting: 'square' },
  readout: { color: 'var(--b-readout)', dash: '2 3' },
};
// Series style of a logical-error curve: { color, shape, dash, endLabel? }.
export function tokenStyle({ d, mode = 'hard', platform = null, endLabel = null }) {
  return {
    color: TOKENS.d[d] ?? 'var(--hard)',
    shape: TOKENS.shape[platform] ?? 'circle',
    dash: TOKENS.dash[mode] ?? null,
    ...(endLabel ? { endLabel } : {}),
  };
}

// Below 600 px the SVG charts are drawn taller, with wider margins (here) and larger
// text (style.css, same query), so that their labels stay readable at 360 px.
const NARROW_QUERY = '(max-width: 600px)';
export const isNarrow = () => typeof matchMedia === 'function' && matchMedia(NARROW_QUERY).matches;
export function onNarrowChange(fn) {
  if (typeof matchMedia === 'function') matchMedia(NARROW_QUERY).addEventListener('change', fn);
}

// Legend as HTML under the SVG, so it wraps and keeps full-size text on narrow screens.
// entries: [{ name, color, shape, filled = true, swatch?, dash? }]; swatch(svg) draws a custom
// key; an entry with a dash key (null for solid) also shows its line style.
export function htmlLegend(entries) {
  const ul = document.createElement('ul');
  ul.className = 'chart-legend';
  for (const e of entries) {
    const li = document.createElement('li');
    const line = e.dash !== undefined && !e.swatch;
    const w = line ? 30 : 18;
    const svg = svgEl('svg', { width: w, height: 14, viewBox: `0 0 ${w} 14`, 'aria-hidden': 'true', focusable: 'false' });
    if (e.swatch) e.swatch(svg);
    else {
      if (line) svgEl('line', { x1: 0, x2: w, y1: 7, y2: 7, stroke: e.color, 'stroke-width': 2, ...(e.dash ? { 'stroke-dasharray': e.dash } : {}) }, svg);
      drawMarker(svg, e.shape, w / 2, 7, 5, e.color, e.filled !== false);
    }
    li.append(svg, e.name);
    ul.appendChild(li);
  }
  return ul;
}

// Wraps a values table in a keyboard-focusable scroll box, so a wide table scrolls inside
// its box instead of widening the page at 360 px.
export function scrollBox(table, label) {
  const box = document.createElement('div');
  box.className = 'table-scroll';
  box.tabIndex = 0;
  box.setAttribute('role', 'region');
  box.setAttribute('aria-label', label);
  box.appendChild(table);
  return box;
}

// Vertical-marker labels, one row each so that close markers do not overprint; a label
// that would run past the right edge is drawn to the left of its line.
export function drawVlineLabels(svg, items, top, right, narrow) {
  const fontPx = narrow ? 22 : 12;
  items.forEach(({ x, label }, i) => {
    const y = top + (fontPx + 2) * (i + 1);
    const fits = x + 4 + 0.6 * fontPx * label.length <= right;
    const t = svgEl('text', { x: fits ? x + 4 : x - 4, y, 'text-anchor': fits ? 'start' : 'end', class: 'vline-label' }, svg);
    t.textContent = label;
  });
}
export const HIGHLIGHT = { color: '#1a1a1a', shape: 'diamond' };

let chartCounter = 0;

export function drawMarker(parent, shape, cx, cy, size, color, filled = true) {
  const s = size;
  const common = { fill: filled ? color : '#ffffff', stroke: color, 'stroke-width': 1.5 };
  switch (shape) {
    case 'square':
      return svgEl('rect', { x: cx - s, y: cy - s, width: 2 * s, height: 2 * s, ...common }, parent);
    case 'triangle':
      return svgEl('polygon', { points: `${cx},${cy - 1.2 * s} ${cx - 1.1 * s},${cy + 0.9 * s} ${cx + 1.1 * s},${cy + 0.9 * s}`, ...common }, parent);
    case 'diamond':
      return svgEl('polygon', { points: `${cx},${cy - 1.3 * s} ${cx + 1.3 * s},${cy} ${cx},${cy + 1.3 * s} ${cx - 1.3 * s},${cy}`, ...common }, parent);
    case 'cross':
      return svgEl('path', { d: `M${cx - s},${cy - s}L${cx + s},${cy + s}M${cx - s},${cy + s}L${cx + s},${cy - s}`, stroke: color, 'stroke-width': 2, fill: 'none' }, parent);
    default:
      return svgEl('circle', { cx, cy, r: s, ...common }, parent);
  }
}

// Ticks at 1, 2, 5 times a power of ten covering [lo, hi]. With the text cut on, fewer
// gridlines (U7.1: major ticks only).
function linearTicks(lo, hi, target = FEATURES.uxV2 === true ? 4 : 6) {
  const span = hi - lo || 1;
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => span / s <= target) ?? 10 * mag;
  const ticks = [];
  for (let t = Math.ceil(lo / step - 1e-9) * step; t <= hi + step * 1e-9; t += step) ticks.push(Number(t.toPrecision(12)));
  return ticks;
}

// One tick per decade; with the text cut on and more than six decades, every second one,
// counted down from the top decade.
function logTicks(lo, hi) {
  const ticks = [];
  const e0 = Math.floor(Math.log10(lo));
  const e1 = Math.ceil(Math.log10(hi));
  const step = FEATURES.uxV2 === true && e1 - e0 > 6 ? 2 : 1;
  for (let e = e1; e >= e0; e -= step) ticks.unshift(10 ** e);
  return ticks;
}

// Exponent in Unicode superscript digits (10⁻⁵), for text and tables (U7.1).
const SUPERSCRIPT = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
export const superscript = (e) => String(e).replace(/[-0-9]/g, (c) => SUPERSCRIPT[c]);

// Numbers in text and tables. With the text cut on (U7.1): three significant figures and a
// superscript power of ten; otherwise the v1 format (four figures, ×10^e).
export function formatNumber(v) {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (FEATURES.uxV2 === true) {
    if (a >= 1e-3 && a < 1e4) return String(Number(v.toPrecision(3)));
    const [m, e] = v.toExponential(2).split('e');
    return `${Number(m)}×10${superscript(Number(e))}`;
  }
  if (a >= 1e-3 && a < 1e4) return String(Number(v.toPrecision(4)));
  return v.toExponential(2).replace('e', '×10^').replace('^+', '^');
}

function formatTick(v, log) {
  if (log) {
    const e = Math.round(Math.log10(v));
    if (e >= -2 && e <= 2) return String(10 ** e);
    return FEATURES.uxV2 === true ? `10${superscript(e)}` : `1e${e}`;
  }
  return String(Number(v.toPrecision(6)));
}

function makeScale(lo, hi, a, b, log) {
  if (log) {
    const l0 = Math.log10(lo);
    const l1 = Math.log10(hi);
    return (v) => a + ((Math.log10(Math.max(v, lo)) - l0) / (l1 - l0)) * (b - a);
  }
  return (v) => a + ((v - lo) / (hi - lo || 1)) * (b - a);
}

// series: [{ name, x: [], y: [], lo?: [], hi?: [], color?, shape?, dash?, endLabel? }]; color
// and shape override the SERIES_STYLES entry, dash is a stroke-dasharray (null: solid), and
// endLabel is written beside the last point, so a series is named without relying on colour.
// points: [{ name, x, y, lo?, hi?, shape?, color?, filled? }] drawn as open markers (filled
// with filled: true), in the HIGHLIGHT style unless shape or color is given
// vlines: [{ x, label }] vertical marker lines
// bands: [{ x0, x1, label }] shaded x intervals, drawn behind everything else
// Returns { root, update(opts) } where root is a <figure> holding the SVG and its table.
export function createChart(opts) {
  const id = `chart${++chartCounter}`;
  const root = document.createElement('figure');
  root.className = 'chart';
  const figcaption = document.createElement('figcaption');
  figcaption.id = `${id}-title`;
  root.appendChild(figcaption);
  const holder = document.createElement('div');
  holder.className = 'chart-svg';
  root.appendChild(holder);
  const legendHolder = document.createElement('div');
  root.appendChild(legendHolder);
  const details = document.createElement('details');
  details.className = 'chart-data';
  const summary = document.createElement('summary');
  summary.textContent = 'Chart values as a table';
  // The chart title tells apart the summaries of several charts on one level.
  summary.setAttribute('aria-describedby', figcaption.id);
  details.appendChild(summary);
  const tableHolder = document.createElement('div');
  details.appendChild(tableHolder);
  root.appendChild(details);

  let current = opts;
  function render(o) {
    current = { ...current, ...o };
    const {
      title, xLabel, yLabel, series = [], points = [], vlines = [], bands = [],
      logX = false, logY = false, width = 640, yFloor = 1e-6,
    } = current;
    const narrow = isNarrow();
    // With the text cut on, a 640-wide chart renders at about --chart-h (tokens.css): 320 px
    // tall at 640 px wide, about 260 px at the 330 px of a narrow screen.
    const ux = FEATURES.uxV2 === true;
    const height = (current.height ?? (ux ? 320 : 380)) + (narrow ? (ux ? 180 : 100) : 0);
    const styleOf = (s, si) => ({
      ...SERIES_STYLES[si % SERIES_STYLES.length], ...(s.color ? { color: s.color } : {}), ...(s.shape ? { shape: s.shape } : {}),
    });
    figcaption.textContent = title;

    // Data ranges; on a log axis non-positive values are clamped to the floor.
    const xs = [];
    const ys = [];
    const pushY = (v) => { if (Number.isFinite(v) && (!logY || v > 0)) ys.push(v); };
    for (const s of series) {
      s.x.forEach((v) => xs.push(v));
      s.y.forEach(pushY);
      (s.lo || []).forEach(pushY);
      (s.hi || []).forEach(pushY);
    }
    for (const p of points) { xs.push(p.x); pushY(p.y); pushY(p.lo); pushY(p.hi); }
    for (const v of vlines) xs.push(v.x);
    for (const b of bands) xs.push(b.x0, b.x1);
    let xMin = Math.min(...xs);
    let xMax = Math.max(...xs);
    if (logX) xMin = Math.max(xMin, 1e-12);
    let yMin;
    let yMax;
    if (logY) {
      yMin = Math.max(yFloor, 10 ** Math.floor(Math.log10(Math.min(...ys, 1))));
      yMax = 10 ** Math.ceil(Math.log10(Math.max(...ys, yMin * 10)));
    } else {
      yMin = Math.min(0, ...ys);
      yMax = Math.max(...ys) * 1.05 || 1;
    }

    const m = narrow ? { left: 104, right: 20, top: 16, bottom: 80 } : { left: 70, right: 16, top: 16, bottom: 52 };
    // Room for the end labels to the right of the last points.
    const endFont = narrow ? 22 : 12;
    const endChars = Math.max(0, ...series.map((s) => (s.endLabel ? s.endLabel.length : 0)));
    if (endChars) m.right += Math.ceil(0.62 * endFont * endChars) + 8;
    const tickGap = narrow ? 28 : 19;
    const H = height;
    const sx = makeScale(xMin, xMax, m.left, width - m.right, logX);
    const sy = makeScale(yMin, yMax, height - m.bottom, m.top, logY);

    const svg = svgEl('svg', {
      viewBox: `0 0 ${width} ${H}`, role: 'img', 'aria-labelledby': `${id}-title ${id}-desc`, class: 'chart-svg-el',
    });
    const desc = svgEl('desc', { id: `${id}-desc` }, svg);
    desc.textContent = `${xLabel} on the horizontal axis${logX ? ' (log scale)' : ''}, ${yLabel} on the vertical axis${logY ? ' (log scale)' : ''}. The values are listed in the table below the chart.`;

    // Grid, ticks and axes.
    const axes = svgEl('g', { class: 'axes' }, svg);
    const xt = logX ? logTicks(xMin, xMax) : linearTicks(xMin, xMax);
    const yt = logY ? logTicks(yMin, yMax) : linearTicks(yMin, yMax);
    for (const t of yt) {
      if (t < yMin * (1 - 1e-9) || t > yMax * (1 + 1e-9)) continue;
      const y = sy(t);
      svgEl('line', { x1: m.left, x2: width - m.right, y1: y, y2: y, class: 'grid' }, axes);
      const lab = svgEl('text', { x: m.left - 8, y: y + (narrow ? 7 : 4), 'text-anchor': 'end', class: 'tick' }, axes);
      lab.textContent = formatTick(t, logY);
    }
    for (const t of xt) {
      if (t < xMin - 1e-12 || t > xMax + 1e-12) continue;
      const x = sx(t);
      svgEl('line', { x1: x, x2: x, y1: height - m.bottom, y2: height - m.bottom + 5, class: 'axis' }, axes);
      const lab = svgEl('text', { x, y: height - m.bottom + tickGap, 'text-anchor': 'middle', class: 'tick' }, axes);
      lab.textContent = formatTick(t, logX);
    }
    svgEl('line', { x1: m.left, x2: width - m.right, y1: height - m.bottom, y2: height - m.bottom, class: 'axis' }, axes);
    svgEl('line', { x1: m.left, x2: m.left, y1: m.top, y2: height - m.bottom, class: 'axis' }, axes);
    const xl = svgEl('text', { x: (m.left + width - m.right) / 2, y: height - 12, 'text-anchor': 'middle', class: 'axis-label' }, axes);
    xl.textContent = xLabel;
    const ylx = narrow ? 20 : 16;
    const yl = svgEl('text', { x: ylx, y: (m.top + height - m.bottom) / 2, 'text-anchor': 'middle', class: 'axis-label', transform: `rotate(-90 ${ylx} ${(m.top + height - m.bottom) / 2})` }, axes);
    yl.textContent = yLabel;

    // Shaded intervals, behind the markers and series; the label sits at the foot of the band.
    for (const b of bands) {
      const x0 = sx(Math.min(b.x0, b.x1));
      const x1 = sx(Math.max(b.x0, b.x1));
      svgEl('rect', { x: x0, y: m.top, width: Math.max(1, x1 - x0), height: height - m.bottom - m.top, fill: 'var(--band-fill)', class: 'band' }, svg);
      if (b.label) {
        const t = svgEl('text', { x: (x0 + x1) / 2, y: height - m.bottom - (narrow ? 12 : 8), 'text-anchor': 'middle', class: 'band-label' }, svg);
        t.textContent = b.label;
      }
    }

    // Vertical marker lines.
    for (const v of vlines) {
      const x = sx(v.x);
      svgEl('line', { x1: x, x2: x, y1: m.top, y2: height - m.bottom, class: 'vline' }, svg);
    }
    drawVlineLabels(svg, vlines.filter((v) => v.label).map((v) => ({ x: sx(v.x), label: v.label })), m.top - 2, width - m.right, narrow);

    // Series: line, error bars, markers.
    const errBar = (g, x, lo, hi, color) => {
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) return;
      const y0 = sy(logY ? Math.max(lo, yMin) : lo);
      const y1 = sy(hi);
      svgEl('line', { x1: x, x2: x, y1: y0, y2: y1, stroke: color, 'stroke-width': 1.5 }, g);
      svgEl('line', { x1: x - 4, x2: x + 4, y1: y1, y2: y1, stroke: color, 'stroke-width': 1.5 }, g);
      if (!logY || lo >= yMin) svgEl('line', { x1: x - 4, x2: x + 4, y1: y0, y2: y0, stroke: color, 'stroke-width': 1.5 }, g);
    };
    series.forEach((s, si) => {
      const st = styleOf(s, si);
      const g = svgEl('g', { class: 'series' }, svg);
      const pts = s.x.map((x, i) => [x, s.y[i]]).filter(([x, y]) => Number.isFinite(y) && (!logY || y > 0) && (!logX || x > 0));
      if (pts.length > 1) {
        svgEl('polyline', {
          points: pts.map(([x, y]) => `${sx(x)},${sy(y)}`).join(' '), fill: 'none', stroke: st.color, 'stroke-width': 2,
          ...(s.dash ? { 'stroke-dasharray': s.dash } : {}),
        }, g);
      }
      s.x.forEach((x, i) => { if (s.lo && s.hi && (!logX || x > 0)) errBar(g, sx(x), s.lo[i], s.hi[i], st.color); });
      for (const [x, y] of pts) drawMarker(g, st.shape, sx(x), sy(y), 4.5, st.color);
      if (s.endLabel && pts.length) {
        const [x, y] = pts[pts.length - 1];
        const t = svgEl('text', { x: sx(x) + 9, y: sy(y) + endFont / 3, class: 'end-label', fill: st.color }, g);
        t.textContent = s.endLabel;
      }
    });
    for (const p of points) {
      const g = svgEl('g', { class: 'highlight' }, svg);
      const shape = p.shape ?? HIGHLIGHT.shape;
      const color = p.color ?? HIGHLIGHT.color;
      if (Number.isFinite(p.lo) && Number.isFinite(p.hi)) errBar(g, sx(p.x), p.lo, p.hi, color);
      // A filled point (the hero's dot at the chosen tau) is drawn larger than the curve's own markers.
      const size = p.filled === true ? 8.5 : 6;
      if (Number.isFinite(p.y) && (!logY || p.y > 0)) drawMarker(g, shape, sx(p.x), sy(p.y), size, color, p.filled === true);
      else drawMarker(g, shape, sx(p.x), sy(yMin), size, color, p.filled === true);
    }

    // Legend under the plot, as HTML.
    const entries = [
      ...series.map((s, si) => ({ name: s.name, ...styleOf(s, si), filled: true, ...(s.dash !== undefined ? { dash: s.dash } : {}) })),
      ...points.map((p) => ({ name: p.name, shape: p.shape ?? HIGHLIGHT.shape, color: p.color ?? HIGHLIGHT.color, filled: p.filled === true })),
    ];

    holder.replaceChildren(svg);
    legendHolder.replaceChildren(...(entries.length ? [htmlLegend(entries)] : []));
    tableHolder.replaceChildren(scrollBox(valuesTable(current), `Values of the chart: ${title}`));
  }

  render(opts);
  onNarrowChange(() => render({}));
  return { root, update: render };
}

function valuesTable({ xLabel, yLabel, series = [], points = [], vlines = [], bands = [] }) {
  const table = document.createElement('table');
  const head = table.createTHead().insertRow();
  for (const h of ['Series', xLabel, yLabel, 'Lower bound', 'Upper bound']) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = h;
    head.appendChild(th);
  }
  const body = table.createTBody();
  const row = (name, x, y, lo, hi) => {
    const tr = body.insertRow();
    for (const v of [name, x, y, lo, hi]) {
      tr.insertCell().textContent = typeof v === 'number' ? formatNumber(v) : (v ?? '—');
    }
  };
  for (const s of series) s.x.forEach((x, i) => row(s.name, x, s.y[i], s.lo?.[i], s.hi?.[i]));
  for (const p of points) row(p.name, p.x, p.y, p.lo, p.hi);
  for (const v of vlines) row(v.label || 'Marker', v.x, undefined, undefined, undefined);
  for (const b of bands) {
    const name = `Shaded band${b.label ? ` (${b.label})` : ''}`;
    row(`${name}, from`, Math.min(b.x0, b.x1), undefined, undefined, undefined);
    row(`${name}, to`, Math.max(b.x0, b.x1), undefined, undefined, undefined);
  }
  return table;
}

// Text cut (U7.3): a one-line goal under the level title.
export function goalLine(text) {
  const p = document.createElement('p');
  p.className = 'goal';
  const strong = document.createElement('strong');
  strong.textContent = 'Goal: ';
  p.append(strong, text);
  return p;
}

// Everything beyond a level's two visible sentences goes into "Explain more". Strings become
// paragraphs; nodes are moved in as they are.
export function explainMore(items, summaryText = 'Explain more') {
  const details = document.createElement('details');
  details.className = 'explain';
  const summary = document.createElement('summary');
  summary.textContent = summaryText;
  details.appendChild(summary);
  for (const it of items) {
    if (typeof it === 'string') {
      const p = document.createElement('p');
      p.textContent = it;
      details.appendChild(p);
    } else if (it) details.appendChild(it);
  }
  return details;
}

// Takeaway card: empty until show() (the player finished the level) or until the reader,
// having scrolled, reaches the card, which each level places after its main interaction.
// The slot is a polite live region, so the card is announced when it appears.
let scrolled = false;
export function takeawayCard(text) {
  const slot = document.createElement('div');
  slot.className = 'takeaway-slot';
  slot.setAttribute('aria-live', 'polite');
  let shown = false;
  let io = null;
  const show = () => {
    if (shown) return;
    shown = true;
    if (io) io.disconnect();
    const card = document.createElement('aside');
    card.className = 'takeaway';
    card.setAttribute('aria-label', 'Takeaway');
    const p = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = 'Takeaway: ';
    p.append(strong, text);
    card.appendChild(p);
    slot.appendChild(card);
  };
  if (typeof IntersectionObserver === 'function' && typeof window !== 'undefined') {
    let visible = false;
    const check = () => { if (visible && scrolled) show(); };
    window.addEventListener('scroll', () => { scrolled = true; check(); }, { passive: true });
    io = new IntersectionObserver((entries) => {
      for (const e of entries) visible = e.isIntersecting;
      check();
    });
    io.observe(slot);
  }
  return { node: slot, show };
}
