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
// charts and the budget; the scoreboard, the tornado chart and the "Data" tables stay on the
// bit-flip Stage 4 file (whose conclusions already cover both memories; the sensitivity rows
// are bit-flip only), with notes that say which.

import {
  stage2, stage3, stage4, paramsIon, paramsSc, paramsCycle,
  stage2v2, stage3v2, stage4v2, paramsIonV2, paramsScV2, paramsCycleV2, stage2x, stage3x, stage4x,
} from './bridge_data.js';
import {
  createChart, createStackedBars, createTornado, SERIES_STYLES, TOKENS, tokenStyle, goalLine, explainMore, takeawayCard,
  intervalOf, intervalCaption, formatChange, isResolvedChange,
} from './charts.js';
import { FEATURES } from './features.js';
import {
  cardValue, physicalOptimum, PLATFORMS as LEVEL3_PLATFORMS, MIN_ERRORS_RESOLVED, errorsAtMinimum, isResolved, formatCount,
  naiveResults, headlineResults, decoderLabel, LEARNED_LABEL, BASES, basisOn, currentBasis, onBasisChange, memoryTag, formatTau,
} from './level3.js';
import { POST_HOC_NOTE, isPostHoc, f1Line } from './findings.js';

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
// rule take the same decoder from the stage 2 and 3 files (headlineResults, level3.js, shared
// with Levels 2-4 and the hero since U3 row 31); a file without learned series keeps its naive ones.
export { headlineResults };
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
  // Intervals: the cluster bounds when the results carry them, else Wilson (CC-B21 item 2),
  // converted with the same formula as the values.
  const kinds = [];
  const series = res.series.filter((s) => s.mode === mode).sort((a, b) => a.d - b.d).map((s) => {
    const iv = intervalOf(s);
    kinds.push({ what: 'Curves', kind: iv.kind });
    return {
      name: `d = ${s.d}, r = ${s.r}`,
      x: xs,
      y: s.pL.map((v, i) => conv(v, s.r, xs[i], s.d)),
      lo: iv.lo ? iv.lo.map((v, i) => conv(v, s.r, xs[i], s.d)) : undefined,
      hi: iv.hi ? iv.hi.map((v, i) => conv(v, s.r, xs[i], s.d)) : undefined,
      ...(ux ? tokenStyle({ d: s.d, mode, platform: p.id, endLabel: `d = ${s.d}` }) : {}),
    };
  });
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
    const iv = intervalOf(v);
    kinds.push({ what: 'Stage 4 points', kind: iv.kind });
    points.push({ name: `Stage 4, d = ${t.d}${note}`, x: t.xMin, y: v.value, lo: iv.lo, hi: iv.hi, shape: st.shape, color: st.color });
  }
  const metricLabel = METRICS.find((m) => m.id === metric).label.toLowerCase();
  const fixture = res.fixture || stage4.fixture ? ' — placeholder data' : '';
  // v2 names the decoder (the learned one carries its out-of-sample label, U3 row 31).
  const dec = src.v2 ? `, ${decoderLabel(res)}` : '';
  return {
    title: `${p.label}: logical error ${metricLabel}, ${mode} decoding${memoryTag(src.basis ?? 'Z')}${dec}${fixture}`,
    xLabel: ux ? `readout time τ (${p.tauName.toLowerCase()}, µs)` : `${p.tauName} τ (µs)`,
    yLabel: METRICS.find((m) => m.id === metric).yLabel,
    series, points, vlines, intervals: intervalCaption(kinds),
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

// v2 sensitivity table: the rows' own numbers (the final rows carry no verdicts): error per
// round at d = 3, hard, on the owning arm with its cluster interval, tau*_log there, and the
// paired change against the baseline; rows without an effect say why.
function sensitivityTableV2(src) {
  const { stage4 } = src;
  const table = el('table', { class: 'l5-table' });
  table.appendChild(el('caption', {}, `Sensitivity: each parameter scaled by 0.5 and by 2 in turn${stage4.fixture ? ' (placeholder data)' : ''}`));
  const head = table.createTHead().insertRow();
  for (const h of ['Platform', 'Parameter', 'Scale', 'Error per round (d = 3, hard) [95% interval, resampling quantum shots]', 'Best readout time τ*_log (d = 3, hard)', 'Paired change against the baseline']) head.appendChild(th(h));
  const body = table.createTBody();
  const perRound = (row, arm) => {
    const v = row?.effect?.perRound_d3_hard?.[arm];
    const c = row?.effectCluster?.perRound_d3_hard?.[arm];
    return Number.isFinite(v) ? [...num(sig3(v)), ...intervalParts(c?.loCluster, c?.hiCluster)] : ['—'];
  };
  const tauLog = (row, arm) => {
    const t = row?.effect?.tauLog_d3_hard?.[arm];
    return Number.isFinite(t) ? tauParts(t) : ['—'];
  };
  const base = stage4.sensitivityBaseline;
  if (base) {
    for (const p of src.platforms) {
      const tr = body.insertRow();
      tr.className = 'l5-baseline';
      tr.appendChild(th(`Baseline, ${p.label.toLowerCase()}`, 'row'));
      tr.insertCell().textContent = 'card values, same statistics and seeds';
      tr.insertCell().textContent = '× 1';
      appendParts(tr.insertCell(), perRound(base, p.id));
      appendParts(tr.insertCell(), tauLog(base, p.id));
      tr.insertCell().textContent = '—';
    }
  }
  const notRun = new Map(notRunRows(src).map((n) => [`${n.platform}|${n.parameter}|${n.scale}`, n.status]));
  for (const row of stage4.sensitivity || []) {
    const tr = body.insertRow();
    tr.appendChild(th(ownerLabel(src, row.platform), 'row'));
    tr.insertCell().textContent = paramName(row.parameter);
    tr.insertCell().textContent = `× ${row.scale}`;
    const skipped = notRun.get(`${row.platform}|${row.parameter}|${row.scale}`);
    if (skipped) {
      for (let i = 0; i < 3; i++) tr.insertCell().textContent = skipped;
      continue;
    }
    appendParts(tr.insertCell(), perRound(row, row.platform));
    appendParts(tr.insertCell(), tauLog(row, row.platform));
    tr.insertCell().textContent = pairedCell(row.pairedVsBaseline);
  }
  if (!(stage4.sensitivity || []).length) body.insertRow().insertCell().textContent = 'No sensitivity rows in the stage 4 results.';
  const wrap = el('div', { class: 'table-scroll', tabindex: '0', role: 'region', 'aria-label': 'Sensitivity table' });
  wrap.appendChild(table);
  const box = el('div');
  const note = el('p', { class: 'hint' }, stage4.sensitivityNote || SENSITIVITY_NOTE_V2);
  box.append(FEATURES.uxV2 === true ? explainMore([note]) : note, wrap);
  return box;
}

function sensitivityTable(src = SRC_V1) {
  if (src.v2) return sensitivityTableV2(src);
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
// The "Sensitivity rows" column of the v2 verdict table: the counts when some sensitivity row
// carries the conclusion, "—" when none does (the final rows carry no verdicts; CC-A22).
export const sensitivityColumn = (rows, id) => ((rows || []).some((s) => id in s) ? sensitivityCounts(rows, id) : '—');

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
      // The badge's word, or the grey label (observations, outcomes fixed by construction).
      tr.insertCell().appendChild(el('strong', {}, r.badge ? r.badge.text : r.label.text));
      tr.insertCell().textContent = r.automated === undefined ? '—' : String(r.automated);
      tr.insertCell().textContent = sensitivityColumn(rows, r.id);
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
  const kinds = [];
  for (const p of src.platforms) {
    const P = src.stage4.platforms?.[p.id];
    const tr = P?.tradeoff || {};
    const ds = Object.keys(tr).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    for (const d of ds) {
      const c = tr[d]?.[mode];
      if (!c?.tau?.length) continue;
      const order = c.tau.map((_, i) => i).sort((a, b) => c.tau[a] - c.tau[b]);
      const pick = (arr) => (Array.isArray(arr) ? order.map((i) => arr[i]) : undefined);
      // Cluster bounds when the curve carries them, else Wilson (CC-B21 item 2).
      const civ = intervalOf(c);
      kinds.push({ what: 'Curves', kind: civ.kind });
      series.push({
        name: `${p.label}, d = ${d}`, arm: p.id, d,
        tau: pick(c.tau), x: pick(c.roundsPerSecond), y: pick(c.perRound), lo: pick(civ.lo), hi: pick(civ.hi),
        // No end label: the last point (longest tau) is the curve's left end, where the labels
        // of the three distances overprint; the legend names each curve.
        ...tokenStyle({ d, mode, platform: p.id }),
      });
      const t = stage4TauLog(src, p, mode).find((u) => u.d === d);
      const v = P.perRound?.[mode]?.find((u) => u.d === d);
      const x = roundsPerSecondAt(c, t?.xMin);
      if (!t || !v || !Number.isFinite(x)) continue;
      const note = !t.atEdge && !isResolved(p.results, d, mode) ? ', not resolved' : '';
      const piv = intervalOf(v);
      kinds.push({ what: 'Best readout times', kind: piv.kind });
      points.push({
        name: `${p.label}, d = ${d}: τ*_log = ${numText(sig3(t.xMin))} µs${note}`, arm: p.id, d, tau: t.xMin,
        x, y: v.value, lo: piv.lo, hi: piv.hi, shape: TOKENS.shape[p.id] ?? 'circle', color: TOKENS.d[d] ?? 'var(--hard)', filled: true,
      });
    }
  }
  // The curves are Stage 4's headline decoder: the learned one carries its out-of-sample label.
  const learned = src.stage4.decoder === 'learned';
  return {
    title: `Speed against accuracy, ${mode} decoding${memoryTag(src.basis ?? 'Z')}${learned ? `, ${LEARNED_LABEL}` : ''}${src.stage4.fixture ? ' — placeholder data' : ''}`,
    xLabel: 'Rounds per second', yLabel: 'Logical error per round',
    series, points, intervals: intervalCaption(kinds), logX: true, logY: true, yFloor: 1e-8,
    extra: { key: 'tau', label: 'Readout time τ (µs)' },
  };
}

// Error budget of each arm at its tau*_log (d = 3, hard; budgetAtOptimum), one stacked bar each.
export const BUDGET_SEGMENTS = [
  { key: 'readout', name: 'Readout', color: 'var(--b-readout)' },
  { key: 'idle', name: 'Idle', color: 'var(--b-idle)' },
  // The superconducting arm has no crosstalk by design (always 0); the name says so (A53 review item 13).
  { key: 'crosstalk', name: 'Crosstalk (trapped ion only)', color: 'var(--b-xt)' },
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
// results), each with its plain sentence (the statement when plain is empty) and the statement,
// note and deviations for the expander. A conclusion's type comes from its ID prefix (the
// checklist's structural rule): "C…" is a hypothesis, "O…" an observation.
// - A hypothesis shows a verdict badge (icon and word): held, refuted, undetermined or not
//   applicable. With informative: false its outcome is fixed by construction (C3), so it shows
//   no badge, only the grey label "outcome fixed by construction".
// - An observation shows the neutral label "measurement" and no badge, whatever its stored
//   verdict (O4 keeps "undetermined" in the file).
export const CONCLUSION_ORDER = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'O4'];
const BADGES = {
  held: { icon: '✓', text: 'held' },
  refuted: { icon: '✗', text: 'refuted' },
  undetermined: { icon: '?', text: 'undetermined' },
  'not applicable': { icon: '∅', text: 'not applicable' },
};
export function badgeOf(verdict) {
  if (verdict === undefined) return { icon: '–', text: 'not in the results yet', cls: 'missing' };
  const b = BADGES[verdict];
  return b ? { ...b, cls: verdict.replace(/\s+/g, '-') } : { icon: '!', text: `unknown (${verdict})`, cls: 'unknown' };
}
export const conclusionKind = (id) => (/^O/.test(id) ? 'observation' : /^C/.test(id) ? 'hypothesis' : 'other');
export const MEASUREMENT_LABEL = { text: 'measurement', cls: 'measurement' };
export const FIXED_LABEL = { text: 'outcome fixed by construction', cls: 'fixed' };
export function scoreboardRows(src = SRC_V2) {
  const c = src.stage4.conclusions || {};
  const ids = [...CONCLUSION_ORDER, ...Object.keys(c).filter((id) => !CONCLUSION_ORDER.includes(id))];
  return ids.map((id) => {
    const present = id in c;
    const x = c[id] || {};
    const plain = typeof x.plain === 'string' && x.plain.trim() !== '' ? x.plain : (x.statement ?? '');
    const kind = conclusionKind(id);
    // badge: the verdict badge, or null; label: the grey label shown instead, or null.
    let badge = badgeOf(x.verdict);
    let label = null;
    if (present && kind === 'observation') { badge = null; label = MEASUREMENT_LABEL; }
    else if (present && kind === 'hypothesis' && x.informative === false) { badge = null; label = FIXED_LABEL; }
    return {
      id, kind, plain, statement: x.statement ?? '', note: x.note ?? '', deviations: Array.isArray(x.deviations) ? x.deviations : [],
      verdict: x.verdict, automated: x.automated, informative: x.informative, badge, label,
    };
  });
}
// What a row shows in place of a verdict, in words (the badge or the label).
export const rowMark = (r) => (r.badge ? `${r.badge.icon} ${r.badge.text}` : r.label.text);

// Badge colours only add emphasis; the icon and the word carry the meaning.
const BADGE_STYLE = {
  held: 'background:#e3f1e6;color:#1b5e20;border-color:#1b5e20',
  refuted: 'background:#fbe4e2;color:#8e1c12;border-color:#8e1c12',
  undetermined: 'background:#eef0f3;color:#3c4450;border-color:#3c4450',
  'not-applicable': 'background:#ffffff;color:#3c4450;border-color:#3c4450;border-style:dashed',
  unknown: 'background:#eef0f3;color:#3c4450;border-color:#3c4450',
  missing: 'background:#eef0f3;color:#3c4450;border-color:#3c4450',
};
// The grey labels: plain text in a neutral colour, no border, so they never read as a verdict.
const LABEL_STYLE = 'display:inline-block;margin-right:8px;padding:1px 8px;border-radius:10px;background:#eef0f3;color:#3c4450;font-style:italic';
function scoreboard(src) {
  const list = el('ul', { class: 'l5-scoreboard', style: 'list-style:none;padding:0;margin:0' });
  for (const r of scoreboardRows(src)) {
    const li = el('li', { class: 'l5-score-row', style: 'padding:8px 0;border-bottom:1px solid #c4c8cf' });
    const line = el('p', { style: 'margin:0' });
    let mark;
    if (r.badge) {
      mark = el('span', {
        class: `l5-badge l5-badge-${r.badge.cls}`,
        style: `display:inline-block;min-width:9ch;margin-right:8px;padding:1px 8px;border:1px solid;border-radius:10px;font-weight:600;${BADGE_STYLE[r.badge.cls]}`,
      });
      mark.append(el('span', { 'aria-hidden': 'true' }, `${r.badge.icon} `), r.badge.text);
    } else {
      mark = el('span', { class: `l5-label l5-label-${r.label.cls}`, style: LABEL_STYLE }, r.label.text);
    }
    line.append(el('strong', {}, `${r.id} `), mark, r.plain || '—');
    li.appendChild(line);
    const more = [];
    if (r.statement) more.push(el('p', {}, `Statement: ${r.statement}`));
    if (r.note) more.push(el('p', { class: 'hint' }, `Note: ${r.note}`));
    if (r.deviations.length) {
      const ul = el('ul', { class: 'hint' });
      for (const d of r.deviations) ul.appendChild(el('li', {}, d));
      more.push(el('p', { class: 'hint' }, 'Deviations from the pre-registered reporting:'), ul);
    }
    if (more.length) li.appendChild(explainMore(more, `Details of ${r.id}`));
    list.appendChild(li);
  }
  return list;
}

// Findings (stage4.findings), shown above the scoreboard, F1 first: each statement, and the
// numbers the file gives with it, as sentences (findingLines).
export function findingRows(src = SRC_V2) {
  const fs = Array.isArray(src.stage4.findings) ? src.stage4.findings.slice() : [];
  const key = (id) => (id === 'F1' ? '' : String(id));
  fs.sort((a, b) => key(a.id).localeCompare(key(b.id), 'en', { numeric: true }));
  return fs.map((f) => ({ id: f.id, statement: f.statement ?? '', lines: findingLines(f.numbers) }));
}
// Sentences for the number blocks Stage 4 writes (finding F1: soft worse than hard beyond the
// intervals, per decoder, out of sample and in sample, and the d = 3, tau = 20 µs example).
// Unknown blocks are left out.
export function findingLines(n) {
  if (!n || typeof n !== 'object') return [];
  const out = [];
  const oos = n.outOfSample;
  if (oos?.softWorseCount && Number.isFinite(oos.pointsPerDecoder)) {
    const c = oos.softWorseCount;
    out.push(`Held-out circuits: soft decoding worse than hard beyond the 95% intervals at ${c.naive} of ${oos.pointsPerDecoder} points with the naive decoder `
      + `and ${c.learned} of ${oos.pointsPerDecoder} with the learned decoder.`);
  }
  for (const [k, ex] of Object.entries(oos || {})) {
    const m = /^example_d(\d+)_tau([\d.]+)$/.exec(k);
    const pn = ex?.naive?.pairedSoftMinusHard;
    const pl = ex?.learned?.pairedSoftMinusHard;
    if (!m || !pn || !pl) continue;
    const exp = Math.floor(Math.log10(Math.abs(pn.diff) || 1));
    out.push(`At d = ${m[1]}, τ = ${formatTau(Number(m[2]))}, soft minus hard: naive decoder ${formatChange(pn.diff, pn.lo, pn.hi, { exp })}, `
      + `learned decoder ${formatChange(pl.diff, pl.lo, pl.hi, { exp })} (paired 95% intervals, resampling quantum shots).`);
  }
  // In sample, per decoder over both memories (keys "Z naive", "X learned", …); the memories are
  // not named, so the line reads the same in either memory of the page. The paired count (soft
  // minus hard, paired cluster interval above 0) leads and the Wilson count stands beside it;
  // an entry without a paired count is left out, never quoted by Wilson alone (team checklist
  // 2.1; E17 audit).
  const ins = n.inSample;
  if (ins && typeof ins === 'object') {
    const by = new Map();
    for (const [k, v] of Object.entries(ins)) {
      if (!Number.isFinite(v?.paired) || !Number.isFinite(v?.wilson) || !Number.isFinite(v?.points)) continue;
      const dec = k.split(' ')[1] ?? k;
      if (!by.has(dec)) by.set(dec, { paired: 0, wilson: 0, points: 0 });
      by.get(dec).paired += v.paired;
      by.get(dec).wilson += v.wilson;
      by.get(dec).points += v.points;
    }
    const parts = [...by].map(([dec, v]) => `${dec} decoder ${v.paired} of ${v.points} (Wilson intervals: ${v.wilson})`);
    if (parts.length) out.push(`In sample (rates learned from the same stored shots), points where soft decoding is worse than hard by the paired 95% interval, both memories together: ${parts.join(', ')}.`);
  }
  return out;
}
// One finding as the page has always shown it: the statement, then its number lines.
function findingItem(f) {
  const li = el('li', { class: 'l5-finding', style: 'padding:8px 0;border-bottom:1px solid #c4c8cf' });
  li.appendChild(el('p', { style: 'margin:0' }, '')).append(el('strong', {}, `${f.id} `), f.statement);
  for (const t of f.lines) li.appendChild(el('p', { class: 'hint', style: 'margin:4px 0 0' }, t));
  return li;
}
// With FEATURES.compactText, what each finding shows outside its expander: the plain sentence
// (the statement when plain is empty), the badge "Found after seeing the data" for a finding
// found after seeing the data (findings.js isPostHoc), and for F1 the short held-out count line
// of the findings strip (findings.js f1Line); row is findingRows' row, shown in full under
// "Details and caveats". In the order of findingRows.
export const FINDING_DETAILS = 'Details and caveats';
export function compactFindingRows(src = SRC_V2) {
  const raw = Array.isArray(src.stage4.findings) ? src.stage4.findings : [];
  return findingRows(src).map((row) => {
    const f = raw.find((x) => x.id === row.id) || {};
    const plain = typeof f.plain === 'string' && f.plain.trim() !== '' ? f.plain : row.statement;
    const short = row.id === 'F1' ? f1Line(f) : null;
    return { id: row.id, plain, postHoc: isPostHoc(f), short: short ? `${short}.` : null, row };
  });
}
const POST_HOC_STYLE = 'display:inline-block;margin-right:4px;padding:1px 8px;border-radius:10px;background:#eef0f3;color:#3c4450;font-style:italic';
function findingsList(src) {
  const rows = findingRows(src);
  if (!rows.length) return null;
  if (FEATURES.compactText === true) {
    const list = el('ul', { class: 'l5-findings-compact', style: 'list-style:none;padding:0;margin:0' });
    for (const c of compactFindingRows(src)) {
      const li = el('li', { class: 'l5-finding-compact', style: 'padding:8px 0;border-bottom:1px solid #c4c8cf' });
      const line = el('p', { style: 'margin:0' });
      line.append(el('strong', {}, `${c.id} `));
      if (c.postHoc) line.append(el('span', { class: 'l5-label l5-label-posthoc', style: POST_HOC_STYLE }, POST_HOC_NOTE), ' ');
      line.append(c.plain);
      li.appendChild(line);
      if (c.short) li.appendChild(el('p', { class: 'hint', style: 'margin:4px 0 0' }, c.short));
      // The finding exactly as shown without the flag, one click deeper.
      const full = el('ul', { class: 'l5-findings', style: 'list-style:none;padding:0;margin:0' });
      full.appendChild(findingItem(c.row));
      li.appendChild(explainMore([full], FINDING_DETAILS));
      list.appendChild(li);
    }
    return list;
  }
  const list = el('ul', { class: 'l5-findings', style: 'list-style:none;padding:0;margin:0' });
  for (const f of rows) list.appendChild(findingItem(f));
  return list;
}

// Tornado chart: for each parameter, the change in error per round at d = 3, hard, on each
// arm when the parameter is scaled by 0.5 and by 2. The change is the row's effect minus the
// baseline's (sensitivityBaseline.effect, the same reduced statistics); parameters are sorted
// by their largest absolute change.
// Readable names of the sensitivity parameters (A53 review item 7: the raw card keys were shown);
// an unknown key is shown as it is.
export const PARAM_NAMES = {
  R_bright_per_us: 'bright count rate', R_dark_per_us: 'dark count rate',
  gamma_bright_to_dark_per_us: 'bright-to-dark leak rate', gamma_dark_to_bright_per_us: 'dark-to-bright leak rate',
  T1_idle_us: 'idle T1', T2_idle_us: 'idle T2', crosstalk_rate_per_us: 'measurement crosstalk rate',
  chi_over_2pi_MHz: 'dispersive shift χ/2π', kappa_over_2pi_MHz: 'resonator linewidth κ/2π', nbar: 'readout photon number n̄',
  eta: 'measurement efficiency η', T1_us: 'T1', T2_us: 'T2',
  'cycle.two_qubit_gate_us': 'two-qubit gate time', 'cycle.reset_us': 'reset time',
};
const paramName = (k) => PARAM_NAMES[k] ?? k;
const ownerLabel = (src, id) => src.platforms.find((p) => p.id === id)?.label ?? id;

// Tornado rows: each parameter belongs to one arm, and the other arm's bars are zero by
// construction, so only the owning arm's bars are drawn (A53 review item 7).
export function tornadoRows(src = SRC_V2) {
  const base = src.stage4.sensitivityBaseline?.effect?.perRound_d3_hard || {};
  const armIndex = (id) => src.platforms.findIndex((p) => p.id === id);
  const groups = new Map();
  for (const row of src.stage4.sensitivity || []) {
    const eff = row.effect?.perRound_d3_hard;
    if (!eff) continue;
    const key = `${row.platform}|${row.parameter}`;
    if (!groups.has(key)) {
      groups.set(key, { key, platform: row.platform, parameter: row.parameter, label: `${ownerLabel(src, row.platform)}: ${paramName(row.parameter)}`, bars: [] });
    }
    for (const p of src.platforms) {
      if (p.id !== row.platform) continue;
      const value = Number(eff[p.id]);
      if (!Number.isFinite(value)) continue;
      const b = Number(base[p.id]);
      const baseline = Number.isFinite(b) ? b : 0;
      groups.get(key).bars.push({
        arm: p.id, armLabel: p.label, scale: row.scale, value, baseline, change: value - baseline, paired: row.pairedVsBaseline ?? null,
      });
    }
  }
  const rows = [...groups.values()].filter((g) => g.bars.length);
  for (const g of rows) {
    g.bars.sort((a, b) => armIndex(a.arm) - armIndex(b.arm) || a.scale - b.scale);
    g.maxAbs = Math.max(...g.bars.map((b) => Math.abs(b.change)));
  }
  return rows.sort((a, b) => b.maxAbs - a.maxAbs || a.label.localeCompare(b.label));
}
// Sensitivity rows without an effect (A53 review item 7: such rows were dropped silently). The
// reason is the row's own note, else the T2 <= 2 T1 rule (CLAUDE.md, Idle errors) checked on the
// arm's card with the scaled value ("T2 would exceed 2·T1"), else none. `status` is the cell
// text of the tornado's values table, `text` the line in the list under the chart.
const T_PAIRS = { T1_us: ['T1_us', 'T2_us'], T2_us: ['T1_us', 'T2_us'], T1_idle_us: ['T1_idle_us', 'T2_idle_us'], T2_idle_us: ['T1_idle_us', 'T2_idle_us'] };
export function notRunRows(src = SRC_V2) {
  const cards = { 'trapped-ion': src.paramsIon, superconducting: src.paramsSc };
  const out = [];
  for (const row of src.stage4.sensitivity || []) {
    if (row.effect?.perRound_d3_hard) continue;
    let reason = typeof row.note === 'string' && row.note.trim() !== '' ? row.note.trim() : null;
    const pair = T_PAIRS[row.parameter];
    const card = cards[row.platform];
    if (!reason && pair && card) {
      let t1 = Number(cardValue(card[pair[0]]));
      let t2 = Number(cardValue(card[pair[1]]));
      if (row.parameter === pair[0]) t1 *= row.scale;
      else t2 *= row.scale;
      if (Number.isFinite(t1) && Number.isFinite(t2) && t2 > 2 * t1) reason = 'T2 would exceed 2·T1';
    }
    const status = `not run${reason ? ` (${reason})` : ''}`;
    out.push({
      platform: row.platform, parameter: row.parameter, scale: row.scale, status,
      label: `${ownerLabel(src, row.platform)}: ${paramName(row.parameter)}`, armLabel: ownerLabel(src, row.platform),
      text: `${ownerLabel(src, row.platform)}: ${paramName(row.parameter)} × ${row.scale}: ${status}.`,
    });
  }
  return out;
}
// The paired change of pL against the baseline (pairedVsBaseline: d = 3, hard, at the
// baseline's tau*_log, on the same shots and seeds), for the tornado's values table. Resolved only
// when its 95% interval excludes 0 strictly (isResolvedChange): "+5.69×10⁻³ [4.19, 7.19]×10⁻³ at
// τ = 0.7 µs, d = 3, hard"; otherwise "not resolved (interval includes 0)".
export const NOT_RESOLVED_CHANGE = 'not resolved (interval includes 0)';
export function pairedCell(pv) {
  if (!pv || ![pv.diff, pv.lo, pv.hi].every(Number.isFinite)) return '—';
  if (!isResolvedChange(pv.lo, pv.hi)) return NOT_RESOLVED_CHANGE;
  const where = [Number.isFinite(pv.tau_us) ? `τ = ${formatTau(pv.tau_us)}` : null, Number.isFinite(pv.d) ? `d = ${pv.d}` : null, pv.mode ?? null].filter(Boolean);
  return `${formatChange(pv.diff, pv.lo, pv.hi)}${where.length ? ` at ${where.join(', ')}` : ''}`;
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
      columns: ['Parameter', 'Arm', 'Scale', 'Error per round, scaled', 'Error per round, baseline', valueLabel,
        'Paired change of the logical error against the baseline (d = 3, hard, at the baseline’s best readout time)'],
      rows: [
        ...rows.flatMap((r) => r.bars.map((b) => [r.label, b.armLabel, `× ${b.scale}`, b.value, b.baseline, b.change, pairedCell(b.paired)])),
        ...notRunRows(src).map((n) => [n.label, n.armLabel, `× ${n.scale}`, n.status, '—', '—', n.status]),
      ],
      caption: 'Paired change: 95% interval, resampling quantum shots; a change counts only when its interval excludes 0.',
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

// A53 review item 1 (blocking): while a Stage 4 file is marked provisional, every place that
// shows its verdicts or sensitivity rows carries a visible banner (icon and words, not colour
// alone). It disappears by itself when the final file (provisional false or absent) lands.
export const PROVISIONAL_TEXT = 'Provisional: these verdicts and sensitivity rows come from a preliminary run and may still change. '
  + 'The final verdicts replace them before publication.';
export const isProvisional = (...stage4s) => stage4s.some((s) => s?.provisional === true);
function provisionalBanner(...stage4s) {
  if (!isProvisional(...stage4s)) return null;
  const p = el('p', {
    class: 'l5-provisional', role: 'note',
    style: 'margin:8px 0;padding:6px 10px;border:2px solid #8a5a00;border-radius:6px;background:#fff4d6;color:#4a3000;font-weight:600',
  });
  p.append(el('span', { 'aria-hidden': 'true' }, '⚠ '), PROVISIONAL_TEXT);
  return p;
}

// Notes in the phase-flip memory (A53 review item 8): the scoreboard already covers both
// memories (C1 and C2 pool both bases; C6 and O4 compare them); only the sensitivity rows and
// the comparison table below are bit-flip only.
export const BASIS_NOTES = {
  scoreboard: 'The scoreboard covers both memories.',
  sensitivity: 'The sensitivity rows were run in the bit-flip memory only.',
  data: 'The comparison and sensitivity tables below are from the bit-flip memory; the verdicts cover both memories.',
};

function mountLevel5v2(container) {
  const src = level5Source(currentBasis());
  // The scoreboard, the tornado chart and the tables always read the bit-flip file (see the top).
  const zSrc = SRC_V2;
  const xNote = (key) => (src.basis === 'X' ? el('p', { class: 'hint basis-note' }, BASIS_NOTES[key]) : null);
  let mode = 'hard';
  const ux = FEATURES.uxV2 === true;
  const hint = (text) => explainMore([el('p', { class: 'hint' }, text)]);
  container.replaceChildren();
  container.appendChild(el('h2', {}, 'Level 5: Two readout models, same gates'));
  if (ux) container.appendChild(goalLine('compare two readout models at the same gate noise.'));
  container.appendChild(el('p', { class: 'l5-caption' }, src.stage4.framing || CAPTION));
  const topBanner = provisionalBanner(src.stage4, zSrc.stage4);
  if (topBanner) container.appendChild(topBanner);
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
  for (const n of [provisionalBanner(zSrc.stage4), xNote('scoreboard')]) if (n) container.appendChild(n);
  // The findings (F1 first) above the hypotheses (CC-B21 item 5).
  const findings = findingsList(zSrc);
  if (findings) container.append(el('h4', {}, 'Findings'), findings, el('h4', {}, 'Hypotheses and observations'));
  container.appendChild(scoreboard(zSrc));

  container.appendChild(el('h3', {}, 'Which parameters matter'));
  for (const n of [provisionalBanner(zSrc.stage4), xNote('sensitivity')]) if (n) container.appendChild(n);
  const sensNote = zSrc.stage4.sensitivityNote || SENSITIVITY_NOTE_V2;
  if (zSrc.stage4.sensitivity === null) {
    // No sensitivity run: no chart and no "not run" list, only the file's note.
    container.appendChild(el('p', { class: 'hint l5-sensitivity-note' }, sensNote));
  } else {
    container.appendChild(safeChart(createTornado, () => tornadoOptions(zSrc), 'sensitivity chart').root);
    const notRun = notRunRows(zSrc);
    if (notRun.length) {
      const ul = el('ul', { class: 'l5-not-run hint' });
      for (const r of notRun) ul.appendChild(el('li', {}, r.text));
      container.append(el('p', { class: 'hint' }, 'Rows not in the chart:'), ul);
    }
    container.appendChild(hint(`${sensNote} Each bar is the change from the baseline row, on the arm the parameter belongs to; `
      + 'parameters are sorted by their largest change.'));
  }

  if (ux) {
    container.appendChild(takeawayCard('at the same gate noise, the readout model sets both how fast the code can run '
      + 'and how much error each round adds.').node);
  }

  const dataNote = xNote('data');
  const dataBanner = provisionalBanner(zSrc.stage4);
  container.appendChild(explainMore([...(dataBanner ? [dataBanner] : []), ...(dataNote ? [dataNote] : []), ...dataSections(zSrc, hint)], 'Data'));
}
