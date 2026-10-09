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
import { createChart, SERIES_STYLES } from './charts.js';
import {
  cardValue, physicalOptimum, PLATFORMS as LEVEL3_PLATFORMS, MIN_ERRORS_RESOLVED, errorsAtMinimum, isResolved, formatCount,
} from './level3.js';

export const CAPTION = 'Both readout models are classical models with literature parameters, applied to the same IonQ-simulated circuit noise. '
  + 'This is a controlled comparison of readout physics, not a hardware benchmark.';

export const PLATFORMS = [
  { id: 'trapped-ion', label: 'Trapped ion', results: stage2, params: paramsIon, tauName: 'Detection time' },
  { id: 'superconducting', label: 'Superconducting', results: stage3, params: paramsSc, tauName: 'Integration time' },
];
// tau_phys as in level 3: the superconducting value comes from the simulated assignment error,
// because the belief model ignores ring-up (DECISIONS, A28 item 2).
export const physOf = (p) => physicalOptimum(p.results, {
  physFromEmpirical: LEVEL3_PLATFORMS.find((q) => q.id === p.id)?.physFromEmpirical === true,
});
const MODES = [
  { id: 'hard', label: 'Hard' },
  { id: 'soft', label: 'Soft' },
];
const METRICS = [
  { id: 'perRound', label: 'Per round', yLabel: 'Logical error per round' },
  { id: 'perMicrosecond', label: 'Per microsecond', yLabel: 'Logical error per µs' },
];
// [id, plan statement, verdict from the full-statistics runs]. The verdicts are Person A's
// wording in docs/notes_results.md, "Verdicts (A28)"; the automated stage-4 rules are
// stricter or weaker in places, so both are shown (DECISIONS, A28 item 4).
const HYPOTHESES = [
  ['C1', 'Superconducting readout has an idle-driven interior optimum below τ_phys; the ion has none.',
    'Held at d = 3 and 5; undetermined at d = 7.'],
  ['C2', 'Soft decoding lowers the logical error at every τ, most where readouts are short.',
    'Refuted as stated: fails on the ion arm, holds on the superconducting arm.'],
  ['C3', 'Per round the ion can match or beat the superconducting qubit; per microsecond the order reverses.',
    'Refuted: the ion arm is lower in both metrics.'],
  ['C4', 'The break-even assignment error (where d = 5 beats d = 3) is similar for both platforms.',
    'Refuted on the empirical ε̄ axis; undetermined on the belief axis.'],
];
// Person A's caveat for the sensitivity table (DECISIONS, A28 item 4).
export const SENSITIVITY_NOTE = 'Rows rerun at reduced statistics (R = 1, ≤ 1000 shots per bank, no bootstrap); compare with the baseline row. '
  + 'The C1 ion “flips” comes from an idle threshold of 1e-6, crossed between 20 and 30 µs, not from an idle-driven minimum; '
  + 'C2 “holds” reflects too few shots to resolve the ion loss.';
export { MIN_ERRORS_RESOLVED, errorsAtMinimum, isResolved };
// Why the automated stage-4 rules disagree with the full-statistics verdicts
// (docs/notes_results.md, "Verdicts (A28)", C1 and C4).
export const AUTOMATED_NOTE = 'The automated rules are stricter than the plan in places. C1 “flips” because the ion’s idle flip probability '
  + 'passes 1e-6 between 20 and 30 µs, although it never drives a minimum (at most 2.5×10⁻⁵, about 20× below the readout error). '
  + 'C4 is “undetermined” on the readout model’s ε̄ axis, where the superconducting grid only reaches ε̄ = 0.166; on the simulated axis '
  + 'its break-even lies above 0.45, far from the ion’s 0.236. Verdicts: docs/notes_results.md.';
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

// Numbers in tables: three significant figures; below 0.01 or from 1000 on, a mantissa
// times a power of ten with a superscript exponent (A28 item 6). { text, exp? }.
export function sig3(v) {
  if (!Number.isFinite(v)) return { text: '—' };
  if (v === 0) return { text: '0' };
  const a = Math.abs(v);
  if (a >= 0.01 && a < 1000) return { text: v.toPrecision(3) };
  let e = Math.floor(Math.log10(a));
  let m = v / 10 ** e;
  if (Math.abs(Number(m.toPrecision(3))) >= 10) { e += 1; m /= 10; }
  return { text: `${m.toPrecision(3)}×10`, exp: e };
}
// A parameter-card value exactly as written (no rounding), in the same notation.
export function exact(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return { text: String(v) };
  const a = Math.abs(v);
  if (v === 0 || (a >= 1e-3 && a < 1e5)) return { text: String(v) };
  const [m, e] = v.toExponential().split('e');
  return { text: `${m}×10`, exp: Number(e) };
}
// Plain-text form, for tests and lists inside one cell.
export const numText = (n) => (n.exp === undefined ? n.text : `${n.text}^${n.exp}`);
function num(n) {
  if (n.exp === undefined) return [n.text];
  const sup = document.createElement('sup');
  sup.textContent = n.exp < 0 ? `\u2212${-n.exp}` : String(n.exp);
  return [n.text, sup];
}
function appendParts(node, parts) {
  for (const x of parts) node.append(typeof x === 'string' ? x : x.cloneNode(true));
  return node;
}
const tauParts = (tau) => [...num(sig3(tau)), ' µs'];
const intervalParts = (lo, hi, unit = '') => (Number.isFinite(lo) && Number.isFinite(hi)
  ? [' [', ...num(sig3(lo)), ' to ', ...num(sig3(hi)), `${unit}]`] : []);

function tauLogParts(t, results, mode) {
  if (!t) return ['—'];
  const parts = [...tauParts(t.xMin), ...intervalParts(t.lo, t.hi, ' µs')];
  if (t.atEdge) parts.push(', at the grid edge (no interior minimum)');
  else if (!isResolved(results, t.d, mode)) {
    const c = errorsAtMinimum(results, t.d, mode);
    parts.push(`, not resolved (${c.k} logical error${c.k === 1 ? '' : 's'} of ${formatCount(c.n)} shots at the lowest point)`);
  }
  return parts;
}

const valueParts = (v) => (v ? [...num(sig3(v.value)), ...intervalParts(v.lo, v.hi)] : ['—']);

// Break-even of one decoding mode (stage 4 breakEven.byMode[mode], belief axis).
export function breakEvenParts(b) {
  if (!b || !Number.isFinite(b.epsBar)) return [`none${b?.note ? ` (${b.note})` : ''}`];
  return ['ε̄ = ', ...num(sig3(b.epsBar)), ...intervalParts(b.lo, b.hi),
    ...(Number.isFinite(b.tau_us) ? [' at τ = ', ...tauParts(b.tau_us)] : [])];
}

// Chart options for one platform: one series per d for the chosen mode and metric, the
// optima as vertical lines and the stage-4 values at tau*_log as highlighted points.
export function chartOptions(p, mode, metric) {
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
  const phys = physOf(p);
  if (phys && !phys.atEdge && Number.isFinite(phys.xMin)) vlines.push({ x: phys.xMin, label: 'τ_phys' });
  const points = [];
  const tl = s4?.tauLog?.[mode] || [];
  const vals = s4?.[metric]?.[mode] || [];
  // Each stage-4 point takes the shape and colour of its distance's series, drawn open, so
  // the legend tells them apart (A28 item 6, CC-B10).
  const seriesDs = res.series.filter((s) => s.mode === mode).map((s) => s.d).sort((a, b) => a - b);
  for (const t of [...tl].sort((a, b) => a.d - b.d)) {
    const v = vals.find((u) => u.d === t.d);
    if (!v || !Number.isFinite(t.xMin)) continue;
    const st = SERIES_STYLES[Math.max(0, seriesDs.indexOf(t.d)) % SERIES_STYLES.length];
    const note = !t.atEdge && !isResolved(res, t.d, mode) ? ' (not resolved)' : '';
    points.push({ name: `Stage 4, d = ${t.d}${note}`, x: t.xMin, y: v.value, lo: v.lo, hi: v.hi, shape: st.shape, color: st.color });
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
    const phys = physOf(p);
    const physParts = !phys ? ['—'] : [...tauParts(phys.xMin), ...(phys.atEdge ? [', at the grid edge'] : [])];
    if (phys?.empirical) {
      physParts.push(' (simulated');
      if (phys.belief && !phys.belief.atEdge) physParts.push('; model without ring-up ', ...tauParts(phys.belief.xMin));
      physParts.push(')');
    }
    for (const m of MODES) {
      const tl = s4.tauLog?.[m.id] || [];
      const ds = [...new Set(tl.map((t) => t.d))].sort((a, b) => a - b);
      for (const d of ds) {
        const tr = body.insertRow();
        tr.appendChild(th(p.label, 'row'));
        for (const v of [
          [m.label], [String(d)], physParts,
          tauLogParts(tl.find((t) => t.d === d), p.results, m.id),
          valueParts(s4.perRound?.[m.id]?.find((u) => u.d === d)),
          valueParts(s4.perMicrosecond?.[m.id]?.find((u) => u.d === d)),
          breakEvenParts(s4.breakEven?.byMode?.[m.id]),
        ]) appendParts(tr.insertCell(), v);
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
  const verdictCell = (tr, v) => {
    const cell = tr.insertCell();
    // The verdict is written out in words; the class only adds weight, never meaning.
    cell.textContent = VERDICTS.has(v) ? v : `unknown (${v})`;
    cell.className = `verdict-${VERDICTS.has(v) ? v : 'unknown'}`;
  };
  const base = stage4.sensitivityBaseline;
  if (base) {
    const tr = body.insertRow();
    tr.className = 'l5-baseline';
    tr.appendChild(th('Baseline, both platforms', 'row'));
    tr.insertCell().textContent = 'card values, same reduced statistics';
    tr.insertCell().textContent = '× 1';
    for (const c of ['C1', 'C2', 'C3', 'C4']) verdictCell(tr, base[c]?.verdict);
  }
  for (const row of stage4.sensitivity || []) {
    const tr = body.insertRow();
    const plat = PLATFORMS.find((p) => p.id === row.platform);
    tr.appendChild(th(plat ? plat.label : String(row.platform), 'row'));
    tr.insertCell().textContent = String(row.parameter);
    tr.insertCell().textContent = `× ${row.scale}`;
    for (const c of ['C1', 'C2', 'C3', 'C4']) verdictCell(tr, row[c]);
  }
  if (!(stage4.sensitivity || []).length) body.insertRow().insertCell().textContent = 'No sensitivity rows in the stage 4 results.';
  const wrap = el('div', { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': 'Sensitivity table' });
  wrap.appendChild(table);
  const box = el('div');
  box.append(el('p', { class: 'hint' }, SENSITIVITY_NOTE), wrap);
  return box;
}

// Sensitivity verdict counts for one hypothesis, e.g. "flips 27, undetermined 1 (of 28)".
export function sensitivityCounts(rows, c) {
  const counts = new Map();
  for (const r of rows) counts.set(r[c], (counts.get(r[c]) || 0) + 1);
  const parts = [...counts].sort((a, b) => b[1] - a[1]).map(([v, n]) => `${v} ${n}`);
  return rows.length ? `${parts.join(', ')} (of ${rows.length})` : '—';
}

// The four hypotheses with the full-statistics verdict beside the automated stage-4 one.
function verdictTable() {
  const table = el('table', { class: 'l5-table' });
  table.appendChild(el('caption', {}, `Hypotheses C1–C4: verdicts${stage4.fixture ? ' (placeholder data)' : ''}`));
  const head = table.createTHead().insertRow();
  for (const h of ['Hypothesis', 'Statement', 'Verdict (full statistics)', 'Automated stage 4 rule', 'Sensitivity rows']) head.appendChild(th(h));
  const body = table.createTBody();
  const rows = stage4.sensitivity || [];
  for (const [id, statement, verdict] of HYPOTHESES) {
    const tr = body.insertRow();
    tr.appendChild(th(id, 'row'));
    tr.insertCell().textContent = statement;
    tr.insertCell().appendChild(el('strong', {}, verdict));
    const auto = stage4.conclusions?.[id]?.verdict;
    tr.insertCell().textContent = auto === undefined ? '—' : String(auto);
    tr.insertCell().textContent = sensitivityCounts(rows, id);
  }
  const wrap = el('div', { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': 'Hypotheses C1–C4 verdicts' });
  wrap.appendChild(table);
  const box = el('div');
  box.append(wrap, el('p', { class: 'hint' }, AUTOMATED_NOTE));
  return box;
}

// Unit of a parameter-card value, from the suffix of its name (CLAUDE.md, Units).
export function unitOf(name) {
  if (/_per_us$/.test(name)) return /^R_/.test(name) ? 'counts/µs' : '/µs';
  if (/_us$/.test(name)) return 'µs';
  if (/_MHz$/.test(name)) return 'MHz';
  return '';
}
// A card value with its unit; very long times also in seconds (T1_idle_us: 1×10⁷ µs (10 s)).
function cardValueParts(name, v) {
  const unit = unitOf(name) ? ` ${unitOf(name)}` : '';
  if (Array.isArray(v)) return [v.map((x) => numText(exact(x))).join(', '), unit];
  const parts = [...num(exact(v)), unit];
  if (unit === ' µs' && typeof v === 'number' && v >= 1e6) parts.push(` (${Number((v / 1e6).toPrecision(3))} s)`);
  return parts;
}

// Rows of a parameter card: { value, source } entries carry a source; other fields are
// model settings. Missing or UNSOURCED sources are labelled in words.
function cardRows(card) {
  const rows = [];
  for (const [k, v] of Object.entries(card)) {
    if (CARD_META.has(k)) continue;
    if (v !== null && typeof v === 'object' && !Array.isArray(v) && 'value' in v) rows.push({ name: k, value: cardValueParts(k, v.value), source: v.source, setting: false });
    else rows.push({ name: k, value: cardValueParts(k, v), source: null, setting: true });
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
    appendParts(tr.insertCell(), r.value);
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
      // A source that itself starts with "UNSOURCED" drops that word after the badge (A28 item 6).
      const text = typeof r.source === 'string' ? r.source.trim().replace(/^UNSOURCED\b\s*/i, '') : '';
      cell.append(text !== '' ? text : 'no source given');
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
    + 'Open diamonds: the stage 4 values at τ*_log. The dashed line marks τ_phys, the readout time with the lowest assignment error; for the superconducting qubit '
    + 'this is the simulated assignment error, because the readout model ignores resonator ring-up.'));

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
    'Break-even assignment error: the average assignment error ε̄ (the readout model’s value) at which d = 5 starts to beat d = 3, '
    + 'for each decoding mode, with its 95% interval and the readout time where that happens; “none” means the curves do not cross on the grid. '
    + `A τ*_log is “not resolved” when its curve has fewer than ${MIN_ERRORS_RESOLVED} logical errors at the lowest grid point.`));
  container.appendChild(comparisonTable());

  container.appendChild(el('h3', {}, 'What the results say'));
  container.appendChild(verdictTable());

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
