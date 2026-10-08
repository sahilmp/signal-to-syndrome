// Level 5, "Two platforms": the trapped ion and the superconducting qubit side by side.
// Two charts of logical error against tau (each on its own tau axis), per round or per
// microsecond, hard or soft decoding; the stage-4 comparison table; the sensitivity table;
// and every parameter card with its sources. Reads stage2, stage3, stage4 and the three
// parameter cards from bridge_data.js only.
//
// The curves are converted with the formulas of the project plan (Section 16.5), because
// metrics.js is not on the bridges: per round eps_L = (1 - (1 - 2 pL)^(1/r)) / 2, per
// microsecond eps_L / T_cyc with T_cyc = gate_layers_per_round * two_qubit_gate_us + tau
// + reset_us. The stage-4 values at tau*_log are drawn on top as a cross-check.

import { stage2, stage3, stage4, paramsIon, paramsSc, paramsCycle } from './bridge_data.js';
import { createChart, formatNumber } from './charts.js';
import { cardValue, formatTau } from './level3.js';

export const CAPTION = 'Both readout models are classical models with literature parameters, applied to the same IonQ-simulated circuit noise. '
  + 'This is a controlled comparison of readout physics, not a hardware benchmark.';

const PLATFORMS = [
  { id: 'trapped-ion', label: 'Trapped ion', results: stage2, params: paramsIon, tauName: 'Detection time' },
  { id: 'superconducting', label: 'Superconducting', results: stage3, params: paramsSc, tauName: 'Integration time' },
];
const MODES = [
  { id: 'hard', label: 'Hard' },
  { id: 'soft', label: 'Soft' },
];
const METRICS = [
  { id: 'perRound', label: 'Per round', yLabel: 'Logical error per round' },
  { id: 'perMicrosecond', label: 'Per microsecond', yLabel: 'Logical error per µs' },
];
const HYPOTHESES = [
  ['C1', 'Superconducting readout has an idle-driven interior optimum below τ_phys; the ion has none.'],
  ['C2', 'Soft decoding lowers the logical error at every τ, most where readouts are short.'],
  ['C3', 'Per round the ion can match or beat the superconducting qubit; per microsecond the order reverses.'],
  ['C4', 'The break-even assignment error (where d = 5 beats d = 3) is similar for both platforms.'],
];
const VERDICTS = new Set(['holds', 'flips', 'undetermined']);
// Top-level fields of a parameter card that describe the file rather than the physics.
const CARD_META = new Set(['schema', 'platform', 'fixture']);

// Per-round logical error from pL after r rounds; pL >= 0.5 is a fully random outcome.
export function perRoundFromTotal(pL, r) {
  if (!Number.isFinite(pL)) return NaN;
  if (pL >= 0.5) return 0.5;
  if (pL <= 0) return 0;
  return 0.5 * (1 - (1 - 2 * pL) ** (1 / r));
}

// Cycle time in microseconds from the platform's entry in the cycle card.
export function cycleTimeUs(platformId, tau) {
  const c = paramsCycle[platformId];
  if (!c) throw new Error(`the cycle card has no entry for ${platformId}`);
  const layers = Number(cardValue(c.gate_layers_per_round));
  const t2q = Number(cardValue(c.two_qubit_gate_us));
  const reset = Number(cardValue(c.reset_us));
  if (![layers, t2q, reset].every(Number.isFinite)) throw new Error(`the cycle card for ${platformId} is incomplete`);
  return layers * t2q + tau + reset;
}

// True when a source is missing or carries the UNSOURCED label.
export const isUnsourced = (source) => typeof source !== 'string' || source.trim() === '' || /unsourced/i.test(source);

function el(tag, attrs = {}, text = null) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  if (text !== null) e.textContent = text;
  return e;
}

function th(text, scope = 'col') {
  const h = el('th', { scope }, text);
  return h;
}

// Radio group in a fieldset; arrow keys move between options (native radio behaviour).
function radioGroup(name, legend, options, selected, onChange) {
  const fs = el('fieldset', { class: 'platform-toggle' });
  fs.appendChild(el('legend', {}, legend));
  for (const o of options) {
    const id = `l5-${name}-${o.id}`;
    const input = el('input', { type: 'radio', name: `l5-${name}`, id, value: o.id });
    input.checked = o.id === selected;
    input.addEventListener('change', () => { if (input.checked) onChange(o.id); });
    const wrap = el('span', { class: 'platform-option' });
    wrap.append(input, el('label', { for: id }, o.label));
    fs.appendChild(wrap);
  }
  return fs;
}

const fmt = (v) => (Number.isFinite(v) ? formatNumber(v) : '—');
const interval = (lo, hi, unit = '') => (Number.isFinite(lo) && Number.isFinite(hi) ? ` [${formatNumber(lo)}${unit} to ${formatNumber(hi)}${unit}]` : '');

function tauLogText(t) {
  if (!t) return '—';
  const base = `${formatTau(t.xMin)}${interval(t.lo, t.hi, ' µs')}`;
  return t.atEdge ? `${base}, at the grid edge (no interior minimum)` : base;
}

function valueText(v) {
  if (!v) return '—';
  return `${fmt(v.value)}${interval(v.lo, v.hi)}`;
}

function breakEvenText(b) {
  if (!b || !Number.isFinite(b.epsBar)) return 'no crossing in range';
  return `ε̄ = ${formatNumber(b.epsBar)}${Number.isFinite(b.tau_us) ? ` (τ = ${formatTau(b.tau_us)})` : ''}`;
}

// Chart options for one platform: one series per d for the chosen mode and metric, the
// optima as vertical lines and the stage-4 values at tau*_log as highlighted points.
function chartOptions(p, mode, metric) {
  const res = p.results;
  const s4 = stage4.platforms?.[p.id];
  const xs = res.x.values;
  const conv = (pL, r, tau) => {
    const e = perRoundFromTotal(pL, r);
    return metric === 'perRound' ? e : e / cycleTimeUs(p.id, tau);
  };
  const series = res.series.filter((s) => s.mode === mode).sort((a, b) => a.d - b.d).map((s) => ({
    name: `d = ${s.d}, r = ${s.r}`,
    x: xs,
    y: s.pL.map((v, i) => conv(v, s.r, xs[i])),
    lo: s.lo ? s.lo.map((v, i) => conv(v, s.r, xs[i])) : undefined,
    hi: s.hi ? s.hi.map((v, i) => conv(v, s.r, xs[i])) : undefined,
  }));
  const vlines = [];
  const phys = res.optima?.tauPhys;
  if (phys && !phys.atEdge && Number.isFinite(phys.xMin)) vlines.push({ x: phys.xMin, label: 'τ_phys' });
  const points = [];
  const tl = s4?.tauLog?.[mode] || [];
  const vals = s4?.[metric]?.[mode] || [];
  for (const t of [...tl].sort((a, b) => a.d - b.d)) {
    const v = vals.find((u) => u.d === t.d);
    if (!v || !Number.isFinite(t.xMin)) continue;
    points.push({ name: `Stage 4, d = ${t.d}`, x: t.xMin, y: v.value, lo: v.lo, hi: v.hi });
  }
  const metricLabel = METRICS.find((m) => m.id === metric).label.toLowerCase();
  const fixture = res.fixture || stage4.fixture ? ' — placeholder data' : '';
  return {
    title: `${p.label}: logical error ${metricLabel}, ${mode} decoding${fixture}`,
    xLabel: `${p.tauName} τ (µs)`,
    yLabel: METRICS.find((m) => m.id === metric).yLabel,
    series, points, vlines,
    logX: true, logY: true, yFloor: metric === 'perRound' ? 1e-8 : 1e-12, width: 460, height: 340,
  };
}

function comparisonTable() {
  const table = el('table', { class: 'l5-table' });
  table.appendChild(el('caption', {}, `Stage 4 comparison at the logical optimum τ*_log, per platform, decoding mode and distance${stage4.fixture ? ' (placeholder data)' : ''}`));
  const head = table.createTHead().insertRow();
  for (const h of ['Platform', 'Decoding', 'd', 'τ*_phys', 'τ*_log [95% interval]', 'Per round [interval]', 'Per µs [interval]', 'Break-even assignment error']) head.appendChild(th(h));
  const body = table.createTBody();
  for (const p of PLATFORMS) {
    const s4 = stage4.platforms?.[p.id] || {};
    const phys = p.results.optima?.tauPhys;
    const physText = !phys ? '—' : phys.atEdge ? `${formatTau(phys.xMin)}, at the grid edge` : formatTau(phys.xMin);
    for (const m of MODES) {
      const tl = s4.tauLog?.[m.id] || [];
      const ds = [...new Set(tl.map((t) => t.d))].sort((a, b) => a - b);
      for (const d of ds) {
        const tr = body.insertRow();
        tr.appendChild(th(p.label, 'row'));
        for (const v of [
          m.label, String(d), physText,
          tauLogText(tl.find((t) => t.d === d)),
          valueText(s4.perRound?.[m.id]?.find((u) => u.d === d)),
          valueText(s4.perMicrosecond?.[m.id]?.find((u) => u.d === d)),
          breakEvenText(s4.breakEven),
        ]) tr.insertCell().textContent = v;
      }
    }
  }
  const wrap = el('div', { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': 'Stage 4 comparison table' });
  wrap.appendChild(table);
  return wrap;
}

function sensitivityTable() {
  const table = el('table', { class: 'l5-table' });
  table.appendChild(el('caption', {}, `Sensitivity: each parameter scaled by 0.5 and by 2 in turn; does each hypothesis hold, flip or stay undetermined?${stage4.fixture ? ' (placeholder data)' : ''}`));
  const head = table.createTHead().insertRow();
  for (const h of ['Platform', 'Parameter', 'Scale', 'C1', 'C2', 'C3', 'C4']) head.appendChild(th(h));
  const body = table.createTBody();
  for (const row of stage4.sensitivity || []) {
    const tr = body.insertRow();
    const plat = PLATFORMS.find((p) => p.id === row.platform);
    tr.appendChild(th(plat ? plat.label : String(row.platform), 'row'));
    tr.insertCell().textContent = String(row.parameter);
    tr.insertCell().textContent = `× ${row.scale}`;
    for (const c of ['C1', 'C2', 'C3', 'C4']) {
      const v = row[c];
      const cell = tr.insertCell();
      // The verdict is written out in words; the class only adds weight, never meaning.
      cell.textContent = VERDICTS.has(v) ? v : `unknown (${v})`;
      cell.className = `verdict-${VERDICTS.has(v) ? v : 'unknown'}`;
    }
  }
  if (!(stage4.sensitivity || []).length) body.insertRow().insertCell().textContent = 'No sensitivity rows in the stage 4 results.';
  const wrap = el('div', { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': 'Sensitivity table' });
  wrap.appendChild(table);
  const key = el('dl', { class: 'l5-key' });
  for (const [id, text] of HYPOTHESES) key.append(el('dt', {}, id), el('dd', {}, text));
  const box = el('div');
  box.append(wrap, key);
  return box;
}

const valueToText = (v) => (Array.isArray(v) ? v.join(', ') : String(v));

// Rows of a parameter card: { value, source } entries carry a source; other fields are
// model settings. Missing or UNSOURCED sources are labelled in words.
function cardRows(card) {
  const rows = [];
  for (const [k, v] of Object.entries(card)) {
    if (CARD_META.has(k)) continue;
    if (v !== null && typeof v === 'object' && !Array.isArray(v) && 'value' in v) rows.push({ name: k, value: valueToText(v.value), source: v.source, setting: false });
    else rows.push({ name: k, value: valueToText(v), source: null, setting: true });
  }
  return rows;
}

function cardTable(title, card) {
  const table = el('table', { class: 'l5-table l5-card' });
  table.appendChild(el('caption', {}, `${title}${card.fixture ? ' (placeholder fixture, not sourced values)' : ''}`));
  const head = table.createTHead().insertRow();
  for (const h of ['Parameter', 'Value', 'Source']) head.appendChild(th(h));
  const body = table.createTBody();
  let unsourced = 0;
  for (const r of cardRows(card)) {
    const tr = body.insertRow();
    tr.appendChild(th(r.name, 'row'));
    tr.insertCell().textContent = r.value;
    const cell = tr.insertCell();
    if (r.setting) {
      cell.textContent = 'Model setting, not a measured value';
      cell.className = 'hint-cell';
    } else {
      if (isUnsourced(r.source)) {
        unsourced++;
        cell.appendChild(el('strong', { class: 'unsourced' }, 'UNSOURCED'));
        cell.append(' ');
      }
      if (typeof r.source === 'string' && r.source.trim() !== '') cell.append(r.source);
      else cell.append('no source given');
    }
  }
  const wrap = el('div', { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': title });
  wrap.appendChild(table);
  return { node: wrap, unsourced };
}

export function mountLevel5(container) {
  let mode = 'hard';
  let metric = 'perRound';

  container.replaceChildren();
  container.appendChild(el('h2', {}, 'Level 5: Two platforms'));
  container.appendChild(el('p', { class: 'intro' },
    'The same IonQ-simulated circuits, decoded with two different readout models. A trapped ion reads out slowly; '
    + 'a superconducting qubit reads out fast but can decay while it is read. Compare them per round, then per microsecond: '
    + 'the ion cycle is much longer, so the two measures need not rank the platforms the same way (hypothesis C3). '
    + 'Each chart has its own readout-time axis, because the two platforms work on very different time scales.'));
  container.appendChild(el('p', { class: 'l5-caption' }, CAPTION));

  const controls = el('div', { class: 'control-row' });
  const charts = PLATFORMS.map(() => null);
  const render = () => {
    PLATFORMS.forEach((p, i) => {
      try {
        charts[i].update(chartOptions(p, mode, metric));
      } catch (err) {
        charts[i].root.replaceChildren(el('p', { class: 'status error' }, `The ${p.label.toLowerCase()} chart could not be drawn: ${err.message}`));
      }
    });
  };
  controls.append(
    radioGroup('metric', 'Logical error', METRICS, metric, (v) => { metric = v; render(); }),
    radioGroup('mode', 'Decoding', MODES, mode, (v) => { mode = v; render(); }),
  );
  container.appendChild(controls);
  container.appendChild(el('p', { class: 'hint' },
    'Per round: (1 − (1 − 2 p_L)^(1/r)) / 2 from the logical error p_L after r rounds. Per µs: the per-round value divided by the cycle time, '
    + '(gate layers per round) × (two-qubit gate time) + τ + (reset time), from the cycle card below. '
    + 'Open diamonds: the stage 4 values at τ*_log. The dashed line marks τ_phys, the readout time with the lowest assignment error.'));

  const pair = el('div', { class: 'l5-pair' });
  PLATFORMS.forEach((p, i) => {
    const panel = el('div', { class: 'l5-panel' });
    try {
      charts[i] = createChart(chartOptions(p, mode, metric));
      panel.appendChild(charts[i].root);
    } catch (err) {
      charts[i] = { root: panel, update: () => {} };
      panel.appendChild(el('p', { class: 'status error' }, `The ${p.label.toLowerCase()} chart could not be drawn: ${err.message}`));
    }
    pair.appendChild(panel);
  });
  container.appendChild(pair);

  container.appendChild(el('h3', {}, 'Comparison at the optimum'));
  container.appendChild(el('p', { class: 'hint' },
    'Break-even assignment error: the average assignment error ε̄ at which d = 5 starts to beat d = 3, and the readout time where that happens. '
    + 'Stage 4 reports it once per platform, so both decoding modes show the same value.'));
  container.appendChild(comparisonTable());

  container.appendChild(el('h3', {}, 'How robust are the conclusions?'));
  container.appendChild(sensitivityTable());

  container.appendChild(el('h3', {}, 'Parameter cards and sources'));
  const cards = [
    cardTable('Trapped-ion readout card', paramsIon),
    cardTable('Superconducting readout card', paramsSc),
    ...PLATFORMS.map((p) => cardTable(`Cycle-time card, ${p.label.toLowerCase()}`, { fixture: paramsCycle.fixture, ...(paramsCycle[p.id] || {}) })),
  ];
  const nUnsourced = cards.reduce((s, c) => s + c.unsourced, 0);
  container.appendChild(el('p', { class: 'hint' }, nUnsourced
    ? `${nUnsourced} value${nUnsourced === 1 ? ' is' : 's are'} labelled UNSOURCED (illustrative, not taken from the literature).`
    : 'Every value below has a literature source.'));
  for (const c of cards) container.appendChild(c.node);
}
