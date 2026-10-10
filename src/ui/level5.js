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
//
// With FEATURES.level5v2 (team checklist U7.7), "Two readout models, same gates": a trade-off
// chart (rounds per second against error per round, one curve per arm and d) with a "Per µs"
// tab holding the charts above, the error budget of each arm at its tau*_log, the hypothesis
// scoreboard, a tornado chart of the sensitivity effects, and every table above inside a
// "Data" expander. It reads stage2v2, stage3v2, stage4v2 and the v2 parameter cards.
// With the basis toggle (U7.9), the phase-flip memory reads stage2x, stage3x and stage4x for the
// charts and the budget; the scoreboard, the tornado chart and the "Data" tables have no
// phase-flip counterpart, so they stay on the bit-flip results and say so.

import {
  stage2, stage3, stage4, paramsIon, paramsSc, paramsCycle,
  stage2v2, stage3v2, stage4v2, paramsIonV2, paramsScV2, paramsCycleV2, stage2x, stage3x, stage4x,
} from './bridge_data.js';
import {
  createChart, createStackedBars, createTornado, SERIES_STYLES, TOKENS, tokenStyle, goalLine, explainMore, takeawayCard,
} from './charts.js';
import { FEATURES } from './features.js';
import {
  cardValue, physicalOptimum, PLATFORMS as LEVEL3_PLATFORMS, MIN_ERRORS_RESOLVED, errorsAtMinimum, isResolved, formatCount,
  naiveResults, BASES, basisOn, currentBasis, onBasisChange, memoryTag,
} from './level3.js';

export const CAPTION = 'Both readout models are classical models with literature parameters, applied to the same IonQ-simulated circuit noise. '
  + 'This is a controlled comparison of readout physics, not a hardware benchmark.';

export const PLATFORMS = [
  { id: 'trapped-ion', label: 'Trapped ion', results: naiveResults(stage2), params: paramsIon, tauName: 'Detection time' },
  { id: 'superconducting', label: 'Superconducting', results: naiveResults(stage3), params: paramsSc, tauName: 'Integration time' },
];
// tau_phys as in level 3: the superconducting value comes from the simulated assignment error,
// because the belief model ignores ring-up (DECISIONS, A28 item 2).
export const physOf = (p) => physicalOptimum(p.results, {
  physFromEmpirical: LEVEL3_PLATFORMS.find((q) => q.id === p.id)?.physFromEmpirical === true,
});

// Stage 4 v2 reports the learned decoder (CC-A15). The per-µs curves and the "not resolved"
// rule take the same decoder from the stage 2 and 3 files when they hold it; a file without
// learned series (the v1 stage 3 file) keeps its naive series.
export function headlineResults(results) {
  if (!(results.series || []).some((s) => s.decoder === 'learned')) return naiveResults(results);
  const learned = (o) => o.decoder === 'learned';
  const out = { ...results, series: results.series.filter(learned) };
  if (results.optima) out.optima = { ...results.optima, tauLog: (results.optima.tauLog || []).filter(learned) };
  return out;
}
export const PLATFORMS_V2 = [
  { ...PLATFORMS[0], results: headlineResults(stage2v2), params: paramsIonV2 },
  { ...PLATFORMS[1], results: headlineResults(stage3v2), params: paramsScV2 },
];
// Data sources of the two versions of the level; every table and chart takes one.
export const SRC_V1 = { v2: false, stage4, paramsCycle, paramsIon, paramsSc, platforms: PLATFORMS };
export const SRC_V2 = {
  v2: true, basis: 'Z', stage4: stage4v2, paramsCycle: paramsCycleV2, paramsIon: paramsIonV2, paramsSc: paramsScV2, platforms: PLATFORMS_V2,
};
// The phase-flip memory (U7.9): the X-basis stage 2-4 files, the same cards.
export const PLATFORMS_X = [
  { ...PLATFORMS_V2[0], results: headlineResults(stage2x) },
  { ...PLATFORMS_V2[1], results: headlineResults(stage3x) },
];
export const SRC_X = { ...SRC_V2, basis: 'X', stage4: stage4x, platforms: PLATFORMS_X };
export const level5Source = (basis = 'Z') => (basis === 'X' ? SRC_X : SRC_V2);

// tau*_log entries of one arm and mode: stage 4's own, or, for a stage 4 file without them
// (stage4_comparison_x.json has tradeoff, perRound and budgetAtOptimum only), the arm's
// results file (the same decoder, headlineResults).
export function stage4TauLog(src, p, mode) {
  const own = src.stage4.platforms?.[p.id]?.tauLog?.[mode];
  if (Array.isArray(own)) return own;
  return (p.results.optima?.tauLog || []).filter((t) => t.mode === mode);
}
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
export const SENSITIVITY_NOTE_V2 = 'Rows rerun at reduced statistics (R = 1, ≤ 1000 shots per bank, no bootstrap); compare with the baseline row.';
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

// Gate layers per round from the cycle card: a number, or the expression "2*(d-1)"
// (sequential two-qubit gates, U5); any other expression throws.
export function gateLayers(entry, d) {
  const v = cardValue(entry);
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.replace(/\s+/g, '') === '2*(d-1)') {
    if (!Number.isInteger(d)) throw new Error('gate layers "2*(d-1)" need the code distance');
    return 2 * (d - 1);
  }
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  throw new Error(`unknown gate-layer expression ${JSON.stringify(v)}`);
}

// Cycle time in microseconds from the platform's entry in the cycle card.
export function cycleTimeUs(platformId, tau, d = null, card = paramsCycle) {
  const c = card[platformId];
  if (!c) throw new Error(`the cycle card has no entry for ${platformId}`);
  const layers = gateLayers(c.gate_layers_per_round, d);
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
export function chartOptions(p, mode, metric, src = SRC_V1) {
  const ux = FEATURES.uxV2 === true;
  const res = p.results;
  const stage4 = src.stage4;
  const s4 = stage4.platforms?.[p.id];
  const xs = res.x.values;
  const conv = (pL, r, tau, d) => {
    const e = perRoundFromTotal(pL, r);
    return metric === 'perRound' ? e : e / cycleTimeUs(p.id, tau, d, src.paramsCycle);
  };
  const series = res.series.filter((s) => s.mode === mode).sort((a, b) => a.d - b.d).map((s) => ({
    name: `d = ${s.d}, r = ${s.r}`,
    x: xs,
    y: s.pL.map((v, i) => conv(v, s.r, xs[i], s.d)),
    lo: s.lo ? s.lo.map((v, i) => conv(v, s.r, xs[i], s.d)) : undefined,
    hi: s.hi ? s.hi.map((v, i) => conv(v, s.r, xs[i], s.d)) : undefined,
    ...(ux ? tokenStyle({ d: s.d, mode, platform: p.id, endLabel: `d = ${s.d}` }) : {}),
  }));
  const vlines = [];
  const phys = physOf(p);
  if (phys && !phys.atEdge && Number.isFinite(phys.xMin)) vlines.push({ x: phys.xMin, label: 'τ_phys' });
  const points = [];
  const tl = stage4TauLog(src, p, mode);
  const vals = s4?.[metric]?.[mode] || [];
  // Each stage-4 point takes the shape and colour of its distance's series, drawn open, so
  // the legend tells them apart (A28 item 6, CC-B10).
  const seriesDs = res.series.filter((s) => s.mode === mode).map((s) => s.d).sort((a, b) => a - b);
  for (const t of [...tl].sort((a, b) => a.d - b.d)) {
    const v = vals.find((u) => u.d === t.d);
    if (!v || !Number.isFinite(t.xMin)) continue;
    const st = ux ? { color: TOKENS.d[t.d] ?? 'var(--hard)', shape: TOKENS.shape[p.id] ?? 'circle' }
      : SERIES_STYLES[Math.max(0, seriesDs.indexOf(t.d)) % SERIES_STYLES.length];
    const note = !t.atEdge && !isResolved(res, t.d, mode) ? ' (not resolved)' : '';
    points.push({ name: `Stage 4, d = ${t.d}${note}`, x: t.xMin, y: v.value, lo: v.lo, hi: v.hi, shape: st.shape, color: st.color });
  }
  const metricLabel = METRICS.find((m) => m.id === metric).label.toLowerCase();
  const fixture = res.fixture || stage4.fixture ? ' — placeholder data' : '';
  return {
    title: `${p.label}: logical error ${metricLabel}, ${mode} decoding${memoryTag(src.basis ?? 'Z')}${fixture}`,
    xLabel: ux ? `readout time τ (${p.tauName.toLowerCase()}, µs)` : `${p.tauName} τ (µs)`,
    yLabel: METRICS.find((m) => m.id === metric).yLabel,
    series, points, vlines,
    logX: true, logY: true, yFloor: metric === 'perRound' ? 1e-8 : 1e-12, width: 460, height: 340,
  };
}

function comparisonTable(src = SRC_V1) {
  const { stage4 } = src;
  const table = el('table', { class: 'l5-table' });
  table.appendChild(el('caption', {}, `Stage 4 comparison at the logical optimum τ*_log, per platform, decoding mode and distance${stage4.fixture ? ' (placeholder data)' : ''}`));
  const head = table.createTHead().insertRow();
  for (const h of ['Platform', 'Decoding', 'd', 'τ*_phys', 'τ*_log [95% interval]', 'Per round [interval]', 'Per µs [interval]', 'Break-even assignment error']) head.appendChild(th(h));
  const body = table.createTBody();
  for (const p of src.platforms) {
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

function sensitivityTable(src = SRC_V1) {
  const { stage4 } = src;
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
    const plat = src.platforms.find((p) => p.id === row.platform);
    tr.appendChild(th(plat ? plat.label : String(row.platform), 'row'));
    tr.insertCell().textContent = String(row.parameter);
    tr.insertCell().textContent = `× ${row.scale}`;
    for (const c of ['C1', 'C2', 'C3', 'C4']) verdictCell(tr, row[c]);
  }
  if (!(stage4.sensitivity || []).length) body.insertRow().insertCell().textContent = 'No sensitivity rows in the stage 4 results.';
  const wrap = el('div', { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': 'Sensitivity table' });
  wrap.appendChild(table);
  const box = el('div');
  // The v1 caveat on the C1 ion threshold and C2 belongs to the v1 sweep; v2 keeps only the
  // reduced-statistics sentence, which CC-A15 reuses.
  const note = el('p', { class: 'hint' }, src.v2 ? SENSITIVITY_NOTE_V2 : SENSITIVITY_NOTE);
  box.append(FEATURES.uxV2 === true ? explainMore([note]) : note, wrap);
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
// In v2 the statements and verdicts come from the results' conclusions (C1–C6, O4), not
// from the v1 list above.
function verdictTable(src = SRC_V1) {
  const { stage4 } = src;
  const table = el('table', { class: 'l5-table' });
  const rows = stage4.sensitivity || [];
  if (src.v2) {
    table.appendChild(el('caption', {}, `Hypotheses: verdicts${stage4.fixture ? ' (placeholder data)' : ''}`));
    const head = table.createTHead().insertRow();
    for (const h of ['Hypothesis', 'Statement', 'Verdict', 'Automated rule', 'Sensitivity rows']) head.appendChild(th(h));
    const body = table.createTBody();
    for (const r of scoreboardRows(src)) {
      const tr = body.insertRow();
      tr.appendChild(th(r.id, 'row'));
      tr.insertCell().textContent = r.statement || '—';
      tr.insertCell().appendChild(el('strong', {}, r.badge.text));
      tr.insertCell().textContent = r.automated === undefined ? '—' : String(r.automated);
      tr.insertCell().textContent = rows.some((s) => r.id in s) ? sensitivityCounts(rows, r.id) : '—';
    }
    const wrap = el('div', { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': 'Hypotheses verdicts' });
    wrap.appendChild(table);
    return wrap;
  }
  table.appendChild(el('caption', {}, `Hypotheses C1–C4: verdicts${stage4.fixture ? ' (placeholder data)' : ''}`));
  const head = table.createTHead().insertRow();
  for (const h of ['Hypothesis', 'Statement', 'Verdict (full statistics)', 'Automated stage 4 rule', 'Sensitivity rows']) head.appendChild(th(h));
  const body = table.createTBody();
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
  const note = el('p', { class: 'hint' }, AUTOMATED_NOTE);
  box.append(wrap, FEATURES.uxV2 === true ? explainMore([note]) : note);
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
  table.appendChild(el('caption', {}, `${title}${card.fixture ? ' (placeholder values, not sourced)' : ''}`));
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

// Containers already listening for basis changes (a remount must not add a second listener).
const basisMounted = new WeakSet();

export function mountLevel5(container) {
  // The basis toggle rebuilds the level in the new memory (only the decoding mode is lost).
  if (basisOn() && !basisMounted.has(container)) {
    basisMounted.add(container);
    onBasisChange(() => mountLevel5(container));
  }
  if (FEATURES.level5v2 === true) {
    mountLevel5v2(container);
    return;
  }
  const src = SRC_V1;
  let mode = 'hard';
  let metric = 'perRound';
  const v1Note = currentBasis() === 'X'
    ? el('p', { class: 'hint basis-note' }, 'This version of the level shows the bit-flip memory only.') : null;

  const ux = FEATURES.uxV2 === true;
  // Text cut (U7.3): with uxV2 the goal and the caption (two sentences) stay visible; the
  // introduction and every note move under "Explain more".
  const hint = (text) => (ux ? explainMore([el('p', { class: 'hint' }, text)]) : el('p', { class: 'hint' }, text));
  const INTRO = 'The same IonQ-simulated circuits, decoded with two different readout models. A trapped ion reads out slowly; '
    + 'a superconducting qubit reads out fast but can decay while it is read. Compare them per round, then per microsecond: '
    + 'the ion cycle is much longer, so the two measures need not rank the platforms the same way (hypothesis C3). '
    + 'Each chart has its own readout-time axis, because the two platforms work on very different time scales.';
  container.replaceChildren();
  container.appendChild(el('h2', {}, 'Level 5: Two platforms'));
  if (v1Note) container.appendChild(v1Note);
  if (ux) container.appendChild(goalLine('compare two readout models at the same gate noise.'));
  if (!ux) container.appendChild(el('p', { class: 'intro' }, INTRO));
  container.appendChild(el('p', { class: 'l5-caption' }, CAPTION));
  if (ux) container.appendChild(explainMore([INTRO]));

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
  container.appendChild(hint(
    'Per round: (1 − (1 − 2 p_L)^(1/r)) / 2 from the logical error p_L after r rounds. Per µs: the per-round value divided by the cycle time, '
    + '(gate layers per round) × (two-qubit gate time) + τ + (reset time), from the cycle card below. '
    + `${ux ? 'Open markers' : 'Open diamonds'}: the stage 4 values at τ*_log. The dashed line marks τ_phys, the readout time with the lowest assignment error; for the superconducting qubit `
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
  if (ux) {
    container.appendChild(takeawayCard('at the same gate noise, the readout model alone moves both the best readout time '
      + 'and the logical error per round.').node);
  }

  container.append(...dataSections(src, hint));
}

// The tables of the level, in order: comparison at the optimum, verdicts, sensitivity and the
// parameter cards, each under its heading. v1 shows them on the page; v2 puts them in "Data".
function dataSections(src, hint) {
  const out = [];
  out.push(el('h3', {}, 'Comparison at the optimum'));
  out.push(hint(
    'Break-even assignment error: the average assignment error ε̄ (the readout model’s value) at which d = 5 starts to beat d = 3, '
    + 'for each decoding mode, with its 95% interval and the readout time where that happens; “none” means the curves do not cross on the grid. '
    + `A τ*_log is “not resolved” when its curve has fewer than ${MIN_ERRORS_RESOLVED} logical errors at the lowest grid point.`));
  out.push(comparisonTable(src));

  out.push(el('h3', {}, 'What the results say'));
  out.push(verdictTable(src));

  out.push(el('h3', {}, 'How robust are the conclusions?'));
  out.push(sensitivityTable(src));

  out.push(el('h3', {}, 'Parameter cards and sources'));
  const cards = [
    cardTable('Trapped-ion readout card', src.paramsIon),
    cardTable('Superconducting readout card', src.paramsSc),
    ...src.platforms.map((p) => cardTable(`Cycle-time card, ${p.label.toLowerCase()}`, { fixture: src.paramsCycle.fixture, ...(src.paramsCycle[p.id] || {}) })),
  ];
  const nUnsourced = cards.reduce((s, c) => s + c.unsourced, 0);
  out.push(hint(nUnsourced
    ? `${nUnsourced} value${nUnsourced === 1 ? ' is' : 's are'} labelled UNSOURCED (illustrative, not taken from the literature).`
    : 'Every value below has a literature source.'));
  for (const c of cards) out.push(c.node);
  return out;
}

// ---- Level 5 v2 (U7.7) ----

// Rounds per second at readout time tau on one trade-off curve. The cycle time is
// (fixed part) + tau, so the fixed part is read from the grid point nearest tau (in log tau)
// and tau added back; on a grid point this returns the stored value.
export function roundsPerSecondAt(curve, tau) {
  if (!curve || !Number.isFinite(tau) || tau <= 0 || !curve.tau?.length) return NaN;
  let best = -1;
  for (let i = 0; i < curve.tau.length; i++) {
    if (!(curve.tau[i] > 0) || !(curve.roundsPerSecond?.[i] > 0)) continue;
    if (best < 0 || Math.abs(Math.log(curve.tau[i] / tau)) < Math.abs(Math.log(curve.tau[best] / tau))) best = i;
  }
  if (best < 0) return NaN;
  if (curve.tau[best] === tau) return curve.roundsPerSecond[best];
  return 1e6 / (1e6 / curve.roundsPerSecond[best] - curve.tau[best] + tau);
}

// Trade-off chart: rounds per second (x) against error per round (y), both log, one series
// per (arm, d) with its points in readout-time order, and each curve's tau*_log as an enlarged
// filled point (stage 4's own per-round value there, with its interval).
export function tradeoffOptions(mode, src = SRC_V2) {
  const series = [];
  const points = [];
  for (const p of src.platforms) {
    const P = src.stage4.platforms?.[p.id];
    const tr = P?.tradeoff || {};
    const ds = Object.keys(tr).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    for (const d of ds) {
      const c = tr[d]?.[mode];
      if (!c?.tau?.length) continue;
      const order = c.tau.map((_, i) => i).sort((a, b) => c.tau[a] - c.tau[b]);
      const pick = (arr) => (Array.isArray(arr) ? order.map((i) => arr[i]) : undefined);
      series.push({
        name: `${p.label}, d = ${d}`, arm: p.id, d,
        tau: pick(c.tau), x: pick(c.roundsPerSecond), y: pick(c.perRound), lo: pick(c.lo), hi: pick(c.hi),
        // No end label: the last point (longest tau) is the curve's left end, where the labels
        // of the three distances overprint; the legend names each curve.
        ...tokenStyle({ d, mode, platform: p.id }),
      });
      const t = stage4TauLog(src, p, mode).find((u) => u.d === d);
      const v = P.perRound?.[mode]?.find((u) => u.d === d);
      const x = roundsPerSecondAt(c, t?.xMin);
      if (!t || !v || !Number.isFinite(x)) continue;
      const note = !t.atEdge && !isResolved(p.results, d, mode) ? ', not resolved' : '';
      points.push({
        name: `${p.label}, d = ${d}: τ*_log = ${numText(sig3(t.xMin))} µs${note}`, arm: p.id, d, tau: t.xMin,
        x, y: v.value, lo: v.lo, hi: v.hi, shape: TOKENS.shape[p.id] ?? 'circle', color: TOKENS.d[d] ?? 'var(--hard)', filled: true,
      });
    }
  }
  return {
    title: `Speed against accuracy, ${mode} decoding${memoryTag(src.basis ?? 'Z')}${src.stage4.fixture ? ' — placeholder data' : ''}`,
    xLabel: 'Rounds per second', yLabel: 'Logical error per round',
    series, points, logX: true, logY: true, yFloor: 1e-8,
    extra: { key: 'tau', label: 'Readout time τ (µs)' },
  };
}

// Error budget of each arm at its tau*_log (d = 3, hard; budgetAtOptimum), one stacked bar each.
export const BUDGET_SEGMENTS = [
  { key: 'readout', name: 'Readout', color: 'var(--b-readout)' },
  { key: 'idle', name: 'Idle', color: 'var(--b-idle)' },
  { key: 'crosstalk', name: 'Crosstalk', color: 'var(--b-xt)' },
  { key: 'gate', name: 'Gate', color: 'var(--b-gate)' },
];
export function budgetOptions(src = SRC_V2) {
  const categories = [];
  for (const p of src.platforms) {
    const b = src.stage4.platforms?.[p.id]?.budgetAtOptimum;
    if (!b) continue;
    categories.push({
      label: `${p.label}, τ*_log = ${numText(sig3(b.tau_us))} µs`,
      // With the basis toggle the idle segment names its physics (T1 or T2).
      segments: BUDGET_SEGMENTS.map((s) => ({
        name: s.key === 'idle' && basisOn() ? BASES[src.basis ?? 'Z'].idleName : s.name, value: Number(b[s.key]), color: s.color,
      })),
    });
  }
  return {
    title: `Error sources per round, per qubit (approximate), at each arm's best readout time (d = 3, hard decoding)${memoryTag(src.basis ?? 'Z')}${src.stage4.fixture ? ' — placeholder data' : ''}`,
    valueLabel: 'Error per round, per qubit', categories,
  };
}

// Hypothesis scoreboard: C1–C6 and O4 in this order (then any other conclusion in the
// results), each with its plain sentence, a badge in words and an icon, and the statement
// and note for the expander.
export const CONCLUSION_ORDER = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'O4'];
const BADGES = {
  held: { icon: '✓', text: 'held' },
  refuted: { icon: '✗', text: 'refuted' },
  undetermined: { icon: '?', text: 'undetermined' },
};
export function badgeOf(verdict) {
  if (verdict === undefined) return { icon: '–', text: 'not in the results yet', cls: 'missing' };
  const b = BADGES[verdict];
  return b ? { ...b, cls: verdict } : { icon: '!', text: `unknown (${verdict})`, cls: 'unknown' };
}
export function scoreboardRows(src = SRC_V2) {
  const c = src.stage4.conclusions || {};
  const ids = [...CONCLUSION_ORDER, ...Object.keys(c).filter((id) => !CONCLUSION_ORDER.includes(id))];
  return ids.map((id) => {
    const x = c[id] || {};
    const plain = typeof x.plain === 'string' && x.plain.trim() !== '' ? x.plain : (x.statement ?? '');
    return {
      id, plain, statement: x.statement ?? '', note: x.note ?? '', verdict: x.verdict, automated: x.automated, badge: badgeOf(x.verdict),
    };
  });
}

// Badge colours only add emphasis; the icon and the word carry the meaning.
const BADGE_STYLE = {
  held: 'background:#e3f1e6;color:#1b5e20;border-color:#1b5e20',
  refuted: 'background:#fbe4e2;color:#8e1c12;border-color:#8e1c12',
  undetermined: 'background:#eef0f3;color:#3c4450;border-color:#3c4450',
  unknown: 'background:#eef0f3;color:#3c4450;border-color:#3c4450',
  missing: 'background:#eef0f3;color:#3c4450;border-color:#3c4450',
};
function scoreboard(src) {
  const list = el('ul', { class: 'l5-scoreboard', style: 'list-style:none;padding:0;margin:0' });
  for (const r of scoreboardRows(src)) {
    const li = el('li', { class: 'l5-score-row', style: 'padding:8px 0;border-bottom:1px solid #c4c8cf' });
    const line = el('p', { style: 'margin:0' });
    const badge = el('span', {
      class: `l5-badge l5-badge-${r.badge.cls}`,
      style: `display:inline-block;min-width:9ch;margin-right:8px;padding:1px 8px;border:1px solid;border-radius:10px;font-weight:600;${BADGE_STYLE[r.badge.cls]}`,
    });
    badge.append(el('span', { 'aria-hidden': 'true' }, `${r.badge.icon} `), r.badge.text);
    line.append(el('strong', {}, `${r.id} `), badge, r.plain || '—');
    li.appendChild(line);
    const more = [];
    if (r.statement) more.push(el('p', {}, `Statement: ${r.statement}`));
    if (r.note) more.push(el('p', { class: 'hint' }, `Note: ${r.note}`));
    if (more.length) li.appendChild(explainMore(more, `Details of ${r.id}`));
    list.appendChild(li);
  }
  return list;
}

// Tornado chart: for each parameter, the change in error per round at d = 3, hard, on each
// arm when the parameter is scaled by 0.5 and by 2. The change is the row's effect minus the
// baseline's (sensitivityBaseline.effect, the same reduced statistics); parameters are sorted
// by their largest absolute change.
export function tornadoRows(src = SRC_V2) {
  const base = src.stage4.sensitivityBaseline?.effect?.perRound_d3_hard || {};
  const armIndex = (id) => src.platforms.findIndex((p) => p.id === id);
  const groups = new Map();
  for (const row of src.stage4.sensitivity || []) {
    const eff = row.effect?.perRound_d3_hard;
    if (!eff) continue;
    const key = `${row.platform}|${row.parameter}`;
    if (!groups.has(key)) {
      const owner = src.platforms.find((p) => p.id === row.platform);
      groups.set(key, { key, platform: row.platform, parameter: row.parameter, label: `${owner ? owner.label : row.platform}: ${row.parameter}`, bars: [] });
    }
    for (const p of src.platforms) {
      const value = Number(eff[p.id]);
      if (!Number.isFinite(value)) continue;
      const b = Number(base[p.id]);
      const baseline = Number.isFinite(b) ? b : 0;
      groups.get(key).bars.push({ arm: p.id, armLabel: p.label, scale: row.scale, value, baseline, change: value - baseline });
    }
  }
  const rows = [...groups.values()].filter((g) => g.bars.length);
  for (const g of rows) {
    g.bars.sort((a, b) => armIndex(a.arm) - armIndex(b.arm) || a.scale - b.scale);
    g.maxAbs = Math.max(...g.bars.map((b) => Math.abs(b.change)));
  }
  return rows.sort((a, b) => b.maxAbs - a.maxAbs || a.label.localeCompare(b.label));
}
const ARM_COLOR = { 'trapped-ion': 'var(--ion)', superconducting: 'var(--sc)' };
export function tornadoOptions(src = SRC_V2) {
  const rows = tornadoRows(src);
  const valueLabel = 'Change in error per round (d = 3, hard)';
  return {
    title: `Which parameters matter: each scaled by 0.5 and by 2${src.stage4.fixture ? ' — placeholder data' : ''}`,
    valueLabel,
    groups: rows.map((r) => ({
      label: r.label,
      bars: r.bars.map((b) => ({ label: `${b.armLabel}, × ${b.scale}`, value: b.change, color: ARM_COLOR[b.arm] ?? 'var(--hard)', filled: b.scale > 1 })),
    })),
    legend: src.platforms.flatMap((p) => [
      { name: `${p.label}, × 0.5 (open)`, color: ARM_COLOR[p.id] ?? 'var(--hard)', filled: false },
      { name: `${p.label}, × 2 (filled)`, color: ARM_COLOR[p.id] ?? 'var(--hard)', filled: true },
    ]),
    table: {
      columns: ['Parameter', 'Arm', 'Scale', 'Error per round, scaled', 'Error per round, baseline', valueLabel],
      rows: rows.flatMap((r) => r.bars.map((b) => [r.label, b.armLabel, `× ${b.scale}`, b.value, b.baseline, b.change])),
    },
  };
}

// Two tabs with arrow-key movement (WAI-ARIA tabs pattern); returns { node, panels }.
function tabSet(items, label) {
  const node = el('div', { class: 'l5-tabs' });
  const list = el('div', { role: 'tablist', 'aria-label': label, class: 'control-row' });
  const buttons = [];
  const panels = [];
  const select = (i, focus = false) => {
    buttons.forEach((b, j) => {
      b.setAttribute('aria-selected', String(i === j));
      // Selected tab filled, the others outlined (style.css "secondary").
      b.className = i === j ? '' : 'secondary';
      b.tabIndex = i === j ? 0 : -1;
      panels[j].hidden = i !== j;
    });
    if (focus) buttons[i].focus();
  };
  items.forEach((it, i) => {
    const b = el('button', { type: 'button', role: 'tab', id: `l5-tab-${it.id}`, 'aria-controls': `l5-tabpanel-${it.id}` }, it.label);
    b.addEventListener('click', () => select(i));
    b.addEventListener('keydown', (e) => {
      const n = items.length;
      const to = { ArrowRight: (i + 1) % n, ArrowLeft: (i + n - 1) % n, Home: 0, End: n - 1 }[e.key];
      if (to !== undefined) { e.preventDefault(); select(to, true); }
    });
    buttons.push(b);
    panels.push(el('div', { role: 'tabpanel', id: `l5-tabpanel-${it.id}`, 'aria-labelledby': b.id, tabindex: '0' }));
    list.appendChild(b);
  });
  node.append(list, ...panels);
  select(0);
  return { node, panels };
}

// A chart, or a sentence saying why it could not be drawn.
function safeChart(make, opts, what) {
  try {
    return make(opts());
  } catch (err) {
    const root = el('p', { class: 'status error' }, `The ${what} could not be drawn: ${err.message}`);
    return { root, update: () => {} };
  }
}
function safeUpdate(chart, opts, what) {
  try {
    chart.update(opts());
  } catch (err) {
    chart.root.replaceChildren(el('p', { class: 'status error' }, `The ${what} could not be drawn: ${err.message}`));
  }
}

function mountLevel5v2(container) {
  const src = level5Source(currentBasis());
  // No phase-flip counterpart: the scoreboard, the tornado chart and the tables (see the top).
  const zSrc = SRC_V2;
  const zOnly = (what) => (src.basis === 'X'
    ? el('p', { class: 'hint basis-note' }, `${what} come from the bit-flip memory; the phase-flip results have no counterpart.`) : null);
  let mode = 'hard';
  const ux = FEATURES.uxV2 === true;
  const hint = (text) => explainMore([el('p', { class: 'hint' }, text)]);
  container.replaceChildren();
  container.appendChild(el('h2', {}, 'Level 5: Two readout models, same gates'));
  if (ux) container.appendChild(goalLine('compare two readout models at the same gate noise.'));
  container.appendChild(el('p', { class: 'l5-caption' }, src.stage4.framing || CAPTION));
  container.appendChild(explainMore([
    'Both arms decode the same IonQ-simulated circuits; only the readout model, the idle physics and the cycle time differ. '
    + 'A trapped ion reads out slowly; a superconducting qubit reads out fast but can decay while it is read.',
    CAPTION,
  ]));

  const controls = el('div', { class: 'control-row' });
  container.appendChild(controls);

  const tabs = tabSet([{ id: 'tradeoff', label: 'Trade-off' }, { id: 'per-us', label: 'Per µs' }], 'Chart view');
  container.appendChild(tabs.node);
  const trade = safeChart(createChart, () => tradeoffOptions(mode, src), 'trade-off chart');
  tabs.panels[0].append(trade.root, hint(
    'Each curve runs through the readout times τ of one arm and distance: longer readouts move it left (fewer rounds per second). '
    + 'Error per round: (1 − (1 − 2 p_L)^(1/r)) / 2 from the logical error p_L after r rounds. Rounds per second: one over the cycle time, '
    + '(gate layers per round) × (two-qubit gate time) + τ + (reset time). Filled enlarged markers: each curve’s best readout time τ*_log. '
    + 'Lower is more accurate, further right is faster.'));
  const pair = el('div', { class: 'l5-pair' });
  const usCharts = src.platforms.map((p) => {
    const c = safeChart(createChart, () => chartOptions(p, mode, 'perMicrosecond', src), `${p.label.toLowerCase()} chart`);
    const panel = el('div', { class: 'l5-panel' });
    panel.appendChild(c.root);
    pair.appendChild(panel);
    return c;
  });
  tabs.panels[1].append(pair, hint(
    'Per µs: the per-round value divided by the cycle time. Open markers: the stage 4 values at τ*_log. The dashed line marks τ_phys, '
    + 'the readout time with the lowest assignment error; for the superconducting qubit this is the simulated assignment error, '
    + 'because the readout model ignores resonator ring-up.'));
  const render = () => {
    safeUpdate(trade, () => tradeoffOptions(mode, src), 'trade-off chart');
    src.platforms.forEach((p, i) => safeUpdate(usCharts[i], () => chartOptions(p, mode, 'perMicrosecond', src), `${p.label.toLowerCase()} chart`));
  };
  controls.appendChild(radioGroup('mode', 'Decoding', MODES, mode, (v) => { mode = v; render(); }));

  container.appendChild(el('h3', {}, 'Where the error comes from'));
  container.appendChild(safeChart(createStackedBars, () => budgetOptions(src), 'error-budget chart').root);

  container.appendChild(el('h3', {}, 'Scoreboard'));
  const sbNote = zOnly('The scoreboard verdicts');
  if (sbNote) container.appendChild(sbNote);
  container.appendChild(scoreboard(zSrc));

  container.appendChild(el('h3', {}, 'Which parameters matter'));
  const tnNote = zOnly('The sensitivity effects');
  if (tnNote) container.appendChild(tnNote);
  container.appendChild(safeChart(createTornado, () => tornadoOptions(zSrc), 'sensitivity chart').root);
  container.appendChild(hint(`${SENSITIVITY_NOTE_V2} Each bar is the change from the baseline row; parameters are sorted by their largest change.`));

  if (ux) {
    container.appendChild(takeawayCard('at the same gate noise, the readout model sets both how fast the code can run '
      + 'and how much error each round adds.').node);
  }

  const dataNote = zOnly('The tables below');
  container.appendChild(explainMore([...(dataNote ? [dataNote] : []), ...dataSections(zSrc, hint)], 'Data'));
}
