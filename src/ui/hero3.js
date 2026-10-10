// Hero panel v3 (UX1), behind FEATURES.heroV3: the hero as guess, reveal, twist, one step at a
// time. Step 1: the reader guesses where the code does best on the readout-error curve alone.
// Step 2: the logical curve and both optima are revealed, with a verdict on the guess. Step 3:
// the twist, hard against soft decoding for the two decoders. The optima are hero.js's own
// (heroResults, heroCurves, heroOptima, bandInfo), so both heroes show the same tau*_log and
// tau*_phys. All copy comes from src/ui/bridge_hero3.js (the hero3_text contract).

import {
  HERO_PLATFORMS, heroResults, heroCurves, heroOptima, bandInfo, snapIndex, sliderTau, HERO_DECODER, QUESTION,
} from './hero.js';
import {
  STEP_LABELS, GUESS_PROMPT, GUESS_SLIDER_LABEL, LOCK_LABEL, WHY_SUMMARY, NEXT_LABEL, TWIST_INTRO,
  DECODER_LABELS, TWIST_TITLE, MODE_LABELS, STEPS_LABEL, RESTART_LABEL, CHART_LABELS,
  guessVerdict, overlapSentence, whySentence, twistData, twistCaption, twistFootnote,
} from './bridge_hero3.js';
import {
  createChart, svgEl, htmlLegend, scrollBox, isNarrow, onNarrowChange, formatNumber, TOKENS, intervalCaption,
} from './charts.js';
import { formatTau, currentBasis, onBasisChange, memoryTag } from './level3.js';

// Interface text (not a result, so not in the hero3_text contract): in step 2 or 3, on a platform
// where the reader has not placed a guess, this button takes them to step 1 there.
export const GUESS_AGAIN_LABEL = 'Make your own guess for this platform';

// The grid point nearest the geometric middle of the grid. The guess no longer starts here: on
// the trapped-ion grid that point (20 µs) lies inside the code's-best range, so locking in
// without dragging gave "inside". It starts at the shortest readout time, index 0.
export function middleIndex(grid) {
  return snapIndex(grid, Math.sqrt(grid[0] * grid[grid.length - 1]));
}

// Styles of the vertical lines (inline, over the dashed .vline rule of style.css): the guess a
// thick solid line, tau*_log a thin solid one, tau*_phys dashed. Each also carries its label.
const LINE_STYLE = {
  guess: { 'stroke-dasharray': 'none', 'stroke-width': '2.5' },
  codeBest: { 'stroke-dasharray': 'none', 'stroke-width': '1' },
  readoutBest: { 'stroke-dasharray': '6 4', 'stroke-width': '1.5' },
};

// The chart's vertical lines are the svg's direct line.vline children, in the order given. The
// kinds are kept on the chart, so the styles return after createChart redraws for a new width.
function styleVlines(chart, kinds = chart.vlineKinds) {
  chart.vlineKinds = kinds;
  const svg = chart.root.childNodes[1]?.firstChild;
  if (!svg || !kinds) return;
  if (!svg) return;
  const lines = [...svg.childNodes].filter((n) => n.localName === 'line' && n.getAttribute('class') === 'vline');
  lines.forEach((line, i) => {
    const s = LINE_STYLE[kinds[i]];
    if (s) for (const [k, v] of Object.entries(s)) line.style.setProperty(k, v);
  });
}

// Linear ticks from 0 to yMax at 1, 2 or 5 times a power of ten, at most five.
function yTicks(yMax) {
  const raw = yMax / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => yMax / s <= 5);
  const ticks = [];
  for (let k = 0; k * step <= yMax * (1 + 1e-9); k++) ticks.push(Number((k * step).toPrecision(12)));
  return ticks;
}

// The twist chart: hard and soft decoding of one decoder, a point with its interval bar each,
// on a linear y axis from 0 to data.yMax (fixed, so the two decoders compare by eye).
function createTwistChart() {
  const root = document.createElement('figure');
  root.className = 'chart';
  const figcaption = document.createElement('figcaption');
  figcaption.id = 'hero3-twist-title';
  figcaption.textContent = TWIST_TITLE;
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
  summary.setAttribute('aria-describedby', figcaption.id);
  details.appendChild(summary);
  const tableHolder = document.createElement('div');
  details.appendChild(tableHolder);
  root.appendChild(details);

  let current = null;
  function render(state = current) {
    current = state;
    if (!state) return;
    const { data, decoder } = state;
    const narrow = isNarrow();
    const width = 640;
    const height = 320 + (narrow ? 180 : 0);
    const m = narrow ? { left: 120, right: 20, top: 16, bottom: 80 } : { left: 80, right: 16, top: 16, bottom: 52 };
    const yMax = data.yMax;
    const sy = (v) => height - m.bottom - (Math.min(Math.max(v, 0), yMax) / yMax) * (height - m.bottom - m.top);
    const modes = ['hard', 'soft'];
    const sx = (i) => m.left + ((i + 1) / (modes.length + 1)) * (width - m.left - m.right);

    const svg = svgEl('svg', {
      viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-labelledby': `${figcaption.id} hero3-twist-desc`,
      class: 'chart-svg-el', 'data-y-max': String(yMax),
    });
    svgEl('desc', { id: 'hero3-twist-desc' }, svg).textContent = `${MODE_LABELS.hard}, ${MODE_LABELS.soft}: ${CHART_LABELS.logical}, 0 – ${formatNumber(yMax)}.`;
    const axes = svgEl('g', { class: 'axes' }, svg);
    for (const t of yTicks(yMax)) {
      const y = sy(t);
      svgEl('line', { x1: m.left, x2: width - m.right, y1: y, y2: y, class: 'grid' }, axes);
      svgEl('text', { x: m.left - 8, y: y + (narrow ? 7 : 4), 'text-anchor': 'end', class: 'tick' }, axes).textContent = formatNumber(t);
    }
    svgEl('line', { x1: m.left, x2: width - m.right, y1: height - m.bottom, y2: height - m.bottom, class: 'axis' }, axes);
    svgEl('line', { x1: m.left, x2: m.left, y1: m.top, y2: height - m.bottom, class: 'axis' }, axes);
    const ylx = narrow ? 20 : 16;
    const ymid = (m.top + height - m.bottom) / 2;
    svgEl('text', { x: ylx, y: ymid, 'text-anchor': 'middle', class: 'axis-label', transform: `rotate(-90 ${ylx} ${ymid})` }, axes).textContent = CHART_LABELS.logical;

    const color = TOKENS.d[3];
    modes.forEach((mode, i) => {
      const pt = data[decoder][mode];
      const x = sx(i);
      svgEl('text', { x, y: height - m.bottom + (narrow ? 28 : 19), 'text-anchor': 'middle', class: 'tick' }, axes).textContent = MODE_LABELS[mode];
      const g = svgEl('g', { class: 'series' }, svg);
      if (Number.isFinite(pt?.lo) && Number.isFinite(pt?.hi)) {
        const y0 = sy(pt.lo);
        const y1 = sy(pt.hi);
        svgEl('line', { x1: x, x2: x, y1: y0, y2: y1, stroke: color, 'stroke-width': 1.5 }, g);
        svgEl('line', { x1: x - 6, x2: x + 6, y1: y0, y2: y0, stroke: color, 'stroke-width': 1.5 }, g);
        svgEl('line', { x1: x - 6, x2: x + 6, y1: y1, y2: y1, stroke: color, 'stroke-width': 1.5 }, g);
      }
      // Hard a filled circle, soft an open one: the marker tells the modes apart without colour.
      if (Number.isFinite(pt?.pL)) {
        svgEl('circle', { cx: x, cy: sy(pt.pL), r: 7, fill: mode === 'hard' ? color : '#ffffff', stroke: color, 'stroke-width': 2 }, g);
      }
    });
    holder.replaceChildren(svg);
    legendHolder.replaceChildren(htmlLegend(modes.map((mode) => ({
      name: `${DECODER_LABELS[decoder]}, ${MODE_LABELS[mode]}`, color, shape: 'circle', filled: mode === 'hard',
    }))));

    const table = document.createElement('table');
    const caption = intervalCaption([{ what: CHART_LABELS.logical, kind: 'cluster' }]);
    if (caption) {
      const c = document.createElement('caption');
      c.className = 'interval-note';
      c.textContent = caption;
      table.appendChild(c);
    }
    const head = table.createTHead().insertRow();
    for (const h of [DECODER_LABELS[decoder], CHART_LABELS.logical, 'Lower bound', 'Upper bound']) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = h;
      head.appendChild(th);
    }
    const body = table.createTBody();
    for (const mode of modes) {
      const pt = data[decoder][mode] || {};
      const tr = body.insertRow();
      for (const v of [MODE_LABELS[mode], pt.pL, pt.lo, pt.hi]) tr.insertCell().textContent = typeof v === 'number' ? formatNumber(v) : (v ?? '—');
    }
    tableHolder.replaceChildren(scrollBox(table, `${TWIST_TITLE}: ${DECODER_LABELS[decoder]}`));
  }
  onNarrowChange(() => render());
  return { root, update: render };
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

function button(text, onClick, cls = null) {
  const b = el('button', { type: 'button', ...(cls ? { class: cls } : {}) }, text);
  b.addEventListener('click', onClick);
  return b;
}

// A named radio pair: [{ value, label }], `checked` the starting value; onChange(value).
function radioPair(name, options, checked, onChange, { legend = null, labelledBy = null } = {}) {
  const fs = el('fieldset', { class: 'platform-toggle', ...(labelledBy ? { 'aria-labelledby': labelledBy } : {}) });
  if (legend) fs.appendChild(el('legend', {}, legend));
  const inputs = new Map();
  for (const o of options) {
    const id = `${name}-${o.value}`;
    const input = el('input', { type: 'radio', name, id, value: o.value });
    input.checked = o.value === checked;
    input.addEventListener('change', () => { if (input.checked) onChange(o.value); });
    const wrap = el('span', { class: 'platform-option' });
    wrap.append(input, el('label', { for: id }, o.label));
    fs.appendChild(wrap);
    inputs.set(o.value, input);
  }
  return { root: fs, inputs };
}

// goDeeper(platformId): opens Level 3 on that platform; openLearnNoise(): opens "Learn the
// noise" at its step 3. Either may be null (that level is off), and its control is then left out.
export function mountHero3(container, { goDeeper = null, openLearnNoise = null } = {}) {
  let basis = currentBasis();
  let platformId = 'superconducting';
  let step = 0;
  let decoder = 'naive';
  let view = null;
  // One guess per platform and basis: { idx, placed }. placed turns true when the reader moves
  // the slider or presses Lock in there; until then the guess sits at index 0 and step 2 shows
  // no guess line and no verdict for it.
  const guesses = new Map();
  const guess = () => {
    const key = `${platformId}|${basis}`;
    if (!guesses.has(key)) guesses.set(key, { idx: 0, placed: false });
    return guesses.get(key);
  };

  const buildView = () => {
    const p = HERO_PLATFORMS.find((q) => q.id === platformId);
    const results = heroResults(p, basis);
    const curves = heroCurves(results, HERO_DECODER);
    const optima = heroOptima(results, curves.decoder);
    const band = bandInfo(optima, { grid: curves.tau });
    return { p, results, curves, optima, band };
  };

  container.replaceChildren();
  container.setAttribute('aria-labelledby', 'hero-question');
  container.appendChild(el('h2', { id: 'hero-question', class: 'hero-question' }, QUESTION));

  // The platform radio pair, as in hero.js; it stays at the top through all three steps.
  const controls = el('div', { class: 'control-row hero-controls' });
  const platforms = radioPair('hero3-platform', HERO_PLATFORMS.map((p) => ({ value: p.id, label: p.label })), platformId, (id) => {
    platformId = id;
    recompute();
  }, { legend: 'Platform' });
  controls.appendChild(platforms.root);
  container.appendChild(controls);

  const steps = STEP_LABELS.map((label, i) => {
    const section = el('div', { class: 'hero3-step', 'data-step': String(i) });
    const heading = el('h3', { id: `hero3-step-${i}`, tabindex: '-1' }, label);
    section.setAttribute('aria-labelledby', heading.getAttribute('id'));
    section.appendChild(heading);
    container.appendChild(section);
    return { section, heading };
  });

  // Step 1: guess.
  const s1 = steps[0].section;
  s1.appendChild(el('p', { class: 'hero-live' }, GUESS_PROMPT));
  const chart1 = createChart({ title: '', xLabel: '', yLabel: '', series: [] });
  // Registered after createChart's own listener, so it runs after the redraw.
  onNarrowChange(() => styleVlines(chart1));
  s1.appendChild(chart1.root);
  const sliderRow = el('div', { class: 'hero-slider' });
  const sliderLabel = el('label', { for: 'hero3-guess' }, `${GUESS_SLIDER_LABEL}: `);
  const out = el('output', { for: 'hero3-guess', 'aria-live': 'polite' });
  sliderLabel.appendChild(out);
  const slider = el('input', { id: 'hero3-guess', type: 'range', min: '0', step: '1' });
  sliderRow.append(sliderLabel, slider);
  s1.appendChild(sliderRow);
  s1.appendChild(el('p', {})).appendChild(button(LOCK_LABEL, () => {
    guess().placed = true;
    goTo(1);
  }));

  // Step 2: reveal.
  const s2 = steps[1].section;
  const chart2 = createChart({ title: '', xLabel: '', yLabel: '', series: [] });
  onNarrowChange(() => styleVlines(chart2));
  s2.appendChild(chart2.root);
  const reveal = el('div', { 'aria-live': 'polite' });
  const verdictP = el('p', { class: 'hero-live hero3-verdict' });
  const guessAgainP = el('p', { class: 'hero3-guess-again' });
  guessAgainP.appendChild(button(GUESS_AGAIN_LABEL, () => goTo(0)));
  const overlapP = el('p', { class: 'hero3-overlap' });
  const why = el('details', { class: 'explain hero3-why' });
  why.appendChild(el('summary', {}, WHY_SUMMARY));
  const whyP = el('p', {});
  why.appendChild(whyP);
  reveal.append(verdictP, guessAgainP, overlapP, why);
  s2.appendChild(reveal);
  const s2Buttons = el('p', { class: 'control-row' });
  s2Buttons.appendChild(button(NEXT_LABEL, () => goTo(2)));
  if (goDeeper) {
    const link = el('a', { href: '#s2s-level3', class: 'hero-deeper' }, 'Go deeper: Level 3, Listen longer?');
    link.addEventListener('click', (ev) => {
      ev.preventDefault();
      goDeeper(platformId);
    });
    s2Buttons.appendChild(link);
  }
  s2.appendChild(s2Buttons);

  // Step 3: the twist.
  const s3 = steps[2].section;
  s3.appendChild(el('p', { id: 'hero3-twist-intro', class: 'hero-live' }, TWIST_INTRO));
  const data = twistData();
  let twist = null;
  let resetDecoder = null;
  let captionP = null;
  if (data) {
    const decoders = radioPair('hero3-decoder', ['naive', 'learned'].map((d) => ({ value: d, label: DECODER_LABELS[d] })), decoder, (d) => {
      decoder = d;
      renderTwist();
    }, { labelledBy: 'hero3-twist-intro' });
    s3.appendChild(el('div', { class: 'control-row' })).appendChild(decoders.root);
    twist = createTwistChart();
    s3.appendChild(twist.root);
    captionP = el('p', { class: 'hero3-twist-caption', 'aria-live': 'polite' });
    s3.appendChild(captionP);
    s3.appendChild(el('p', { class: 'hero-note hero3-twist-footnote' }, twistFootnote(data)));
    resetDecoder = () => {
      decoder = 'naive';
      decoders.inputs.get('naive').checked = true;
      renderTwist();
    };
  }
  const s3Buttons = el('p', { class: 'control-row' });
  if (openLearnNoise) s3Buttons.appendChild(button(STEPS_LABEL, () => openLearnNoise(), 'secondary'));
  s3Buttons.appendChild(button(RESTART_LABEL, () => restart(), 'secondary'));
  s3.appendChild(s3Buttons);

  function renderTwist() {
    if (!data) return;
    twist.update({ data, decoder });
    captionP.textContent = twistCaption(decoder, data);
  }

  const chartBase = () => ({
    title: `${view.p.label}${memoryTag(basis)}`,
    xLabel: 'readout time τ (µs)',
    yLabel: 'error probability',
    logX: true, logY: true, yFloor: 1e-6,
  });
  const readoutSeries = () => ({
    name: CHART_LABELS.readout, x: view.curves.tau, ...view.curves.readout,
    color: TOKENS.readout.color, dash: TOKENS.readout.dash, shape: TOKENS.shape[view.p.id], endLabel: CHART_LABELS.readout,
  });
  const guessTau = () => view.curves.tau[guess().idx];

  function renderStep1() {
    const tau = guessTau();
    out.textContent = formatTau(tau);
    slider.setAttribute('aria-valuetext', formatTau(tau));
    chart1.update({
      ...chartBase(),
      series: [readoutSeries()],
      intervals: intervalCaption([{ what: CHART_LABELS.readout, kind: 'wilson' }]),
      points: [], bands: [],
      vlines: [{ x: tau, label: CHART_LABELS.guess }],
    });
    styleVlines(chart1, ['guess']);
  }

  function renderStep2() {
    const { curves, optima, band, p } = view;
    const tau = guessTau();
    const { placed } = guess();
    const { interval, ...logical } = curves.logical;
    const vlines = placed ? [{ x: tau, label: CHART_LABELS.guess }] : [];
    const kinds = placed ? ['guess'] : [];
    const tauLog = band.kind !== 'none' ? band.tauLog : (optima.tauLog && !optima.tauLog.atEdge ? optima.tauLog.xMin : null);
    if (Number.isFinite(tauLog)) {
      vlines.push({ x: tauLog, label: CHART_LABELS.codeBest });
      kinds.push('codeBest');
    }
    if (!optima.tauPhys.atEdge && Number.isFinite(optima.tauPhys.xMin)) {
      vlines.push({ x: optima.tauPhys.xMin, label: CHART_LABELS.readoutBest });
      kinds.push('readoutBest');
    }
    const hasCi = band.kind !== 'none' && Number.isFinite(band.ciLo) && Number.isFinite(band.ciHi);
    chart2.update({
      ...chartBase(),
      series: [
        readoutSeries(),
        { name: CHART_LABELS.logical, x: curves.tau, ...logical, color: TOKENS.d[3], dash: null, shape: TOKENS.shape[p.id], endLabel: CHART_LABELS.logical },
      ],
      intervals: intervalCaption([{ what: CHART_LABELS.logical, kind: interval }, { what: CHART_LABELS.readout, kind: 'wilson' }]),
      points: [],
      bands: hasCi ? [{ x0: band.ciLo, x1: band.ciHi, label: null }] : [],
      vlines,
    });
    styleVlines(chart2, kinds);
    verdictP.textContent = placed ? guessVerdict(tau, band).text : '';
    verdictP.hidden = !placed;
    guessAgainP.hidden = placed;
    overlapP.textContent = overlapSentence(band);
    const w = whySentence({ platformId: p.id, basis, curves, band });
    if (typeof w === 'string' && w) {
      whyP.textContent = w;
      why.hidden = false;
    } else {
      whyP.textContent = '';
      why.hidden = true;
    }
  }

  function render() {
    steps.forEach((s, i) => { s.section.hidden = i !== step; });
    if (step === 0) renderStep1();
    else if (step === 1) renderStep2();
  }

  function goTo(i) {
    step = i;
    render();
    steps[i].heading.focus();
  }

  // The slider shows the current platform's guess on its own grid.
  function syncSlider() {
    slider.max = String(view.curves.tau.length - 1);
    slider.value = String(guess().idx);
  }

  // A new platform or memory has its own grid and its own guess; the step stays.
  function recompute() {
    view = buildView();
    syncSlider();
    render();
  }

  // Start over: every guess back to index 0, not placed.
  function restart() {
    guesses.clear();
    syncSlider();
    if (resetDecoder) resetDecoder();
    goTo(0);
  }

  slider.addEventListener('input', () => {
    const g = guess();
    g.idx = sliderTau(view.curves.tau, slider.value).index;
    g.placed = true;
    slider.value = String(g.idx);
    renderStep1();
  });
  onBasisChange((b) => {
    basis = b;
    recompute();
  });

  recompute();
  renderTwist();
  return {
    get step() { return step; },
    get guess() { return guessTau(); },
  };
}
