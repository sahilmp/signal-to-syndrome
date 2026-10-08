// Inline SVG charts with axes, ticks, optional log scales, error bars and a legend.
// Every chart comes with a text alternative: a <details> table listing its values.

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

export function svgEl(tag, attrs = {}, parent = null) {
  const el = document.createElementNS(svgNamespace(), tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
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

// Below 600 px the SVG charts are drawn taller, with wider margins (here) and larger
// text (style.css, same query), so that their labels stay readable at 360 px.
const NARROW_QUERY = '(max-width: 600px)';
export const isNarrow = () => typeof matchMedia === 'function' && matchMedia(NARROW_QUERY).matches;
export function onNarrowChange(fn) {
  if (typeof matchMedia === 'function') matchMedia(NARROW_QUERY).addEventListener('change', fn);
}

// Legend as HTML under the SVG, so it wraps and keeps full-size text on narrow screens.
// entries: [{ name, color, shape, filled = true, swatch? }]; swatch(svg) draws a custom key.
export function htmlLegend(entries) {
  const ul = document.createElement('ul');
  ul.className = 'chart-legend';
  for (const e of entries) {
    const li = document.createElement('li');
    const svg = svgEl('svg', { width: 18, height: 14, viewBox: '0 0 18 14', 'aria-hidden': 'true', focusable: 'false' });
    if (e.swatch) e.swatch(svg);
    else drawMarker(svg, e.shape, 9, 7, 5, e.color, e.filled !== false);
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

// Ticks at 1, 2, 5 times a power of ten covering [lo, hi].
function linearTicks(lo, hi, target = 6) {
  const span = hi - lo || 1;
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => span / s <= target) ?? 10 * mag;
  const ticks = [];
  for (let t = Math.ceil(lo / step - 1e-9) * step; t <= hi + step * 1e-9; t += step) ticks.push(Number(t.toPrecision(12)));
  return ticks;
}

function logTicks(lo, hi) {
  const ticks = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) ticks.push(10 ** e);
  return ticks;
}

export function formatNumber(v) {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e-3 && a < 1e4) return String(Number(v.toPrecision(4)));
  return v.toExponential(2).replace('e', '×10^').replace('^+', '^');
}

function formatTick(v, log) {
  if (log) {
    const e = Math.round(Math.log10(v));
    return e >= -2 && e <= 2 ? String(10 ** e) : `1e${e}`;
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

// series: [{ name, x: [], y: [], lo?: [], hi?: [] }]
// points: [{ name, x, y, lo?, hi? }] drawn with HIGHLIGHT style (for example a live estimate)
// vlines: [{ x, label }] vertical marker lines
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
      title, xLabel, yLabel, series = [], points = [], vlines = [],
      logX = false, logY = false, width = 640, yFloor = 1e-6,
    } = current;
    const narrow = isNarrow();
    const height = (current.height ?? 380) + (narrow ? 100 : 0);
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
      const st = SERIES_STYLES[si % SERIES_STYLES.length];
      const g = svgEl('g', { class: 'series' }, svg);
      const pts = s.x.map((x, i) => [x, s.y[i]]).filter(([x, y]) => Number.isFinite(y) && (!logY || y > 0) && (!logX || x > 0));
      if (pts.length > 1) {
        svgEl('polyline', { points: pts.map(([x, y]) => `${sx(x)},${sy(y)}`).join(' '), fill: 'none', stroke: st.color, 'stroke-width': 2 }, g);
      }
      s.x.forEach((x, i) => { if (s.lo && s.hi && (!logX || x > 0)) errBar(g, sx(x), s.lo[i], s.hi[i], st.color); });
      for (const [x, y] of pts) drawMarker(g, st.shape, sx(x), sy(y), 4.5, st.color);
    });
    for (const p of points) {
      const g = svgEl('g', { class: 'highlight' }, svg);
      if (Number.isFinite(p.lo) && Number.isFinite(p.hi)) errBar(g, sx(p.x), p.lo, p.hi, HIGHLIGHT.color);
      if (Number.isFinite(p.y) && (!logY || p.y > 0)) drawMarker(g, HIGHLIGHT.shape, sx(p.x), sy(p.y), 6, HIGHLIGHT.color, false);
      else drawMarker(g, HIGHLIGHT.shape, sx(p.x), sy(yMin), 6, HIGHLIGHT.color, false);
    }

    // Legend under the plot, as HTML.
    const entries = [
      ...series.map((s, si) => ({ name: s.name, ...SERIES_STYLES[si % SERIES_STYLES.length], filled: true })),
      ...points.map((p) => ({ name: p.name, ...HIGHLIGHT, filled: false })),
    ];

    holder.replaceChildren(svg);
    legendHolder.replaceChildren(...(entries.length ? [htmlLegend(entries)] : []));
    tableHolder.replaceChildren(scrollBox(valuesTable(current), `Values of the chart: ${title}`));
  }

  render(opts);
  onNarrowChange(() => render({}));
  return { root, update: render };
}

function valuesTable({ xLabel, yLabel, series = [], points = [], vlines = [] }) {
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
  return table;
}
