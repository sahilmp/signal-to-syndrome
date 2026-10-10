// "Learn the noise" (team checklist Appendix U7.6): three steps. 1. Inject a fault on a d = 3
// circuit timeline and see which detectors light. 2. Ask the naive decoder to explain the
// diagonal pair: it needs two edges. 3. The p_ij heatmap of the forte-1 banks, the space-time
// lattice with edge thickness proportional to p, and a naive / learned graph toggle with the
// logical error from decoderComparison. Graphs and matching come from graph.js and
// matching.js; edge rates from demForte1 (dem.js classes, bridge_data.js).

import { demForte1, holdout } from './bridge_data.js';
import { buildGraph, weightFromP } from '../core/graph.js';
import { decode } from '../core/matching.js';
import {
  svgEl, formatNumber, createHeatmap, goalLine, explainMore, takeawayCard, isNarrow, onNarrowChange,
} from './charts.js';
import { FEATURES } from './features.js';

// Step 1 and 2 geometry: the d = 3, r = 3 bank (U7.6 step 1).
const D1 = 3;
const R1 = 3;
// Step 3 banks (U7.6 step 3 selector).
export const HEATMAP_BANKS = [{ d: 5, r: 5 }, { d: 7, r: 3 }];
export const SLOTS = ['before', 'mid', 'after'];

// Detectors lit by one fault (U7.6 rule). fault = { qubit: i, round: k, slot }:
// "before" flips both checks of qubit i from round k on and x[i]: lights (k, i-1) and (k, i);
// "mid" (1 <= i <= d-2) flips m[k][i] (the later check of round k), m[k'][i-1] and m[k'][i] for
// k' > k, and x[i]: lights (k, i) and (k+1, i-1), the diagonal pair;
// "after" (k = r-1 only) flips x[i] only: lights (r, i-1) and (r, i).
// Checks that do not exist (j = -1 or j = d-1) are skipped. Detector index = k*(d-1) + j.
export function faultDetectors(d, r, fault) {
  const { qubit: i, round: k, slot } = fault;
  if (!Number.isInteger(i) || i < 0 || i >= d) throw new Error(`faultDetectors: qubit must be 0..${d - 1}, got ${i}`);
  if (!Number.isInteger(k) || k < 0 || k >= r) throw new Error(`faultDetectors: round must be 0..${r - 1}, got ${k}`);
  const nc = d - 1;
  const D = new Uint8Array(nc * (r + 1));
  const light = (layer, j) => { if (j >= 0 && j < nc) D[layer * nc + j] ^= 1; };
  if (slot === 'before') {
    light(k, i - 1);
    light(k, i);
  } else if (slot === 'mid') {
    if (i < 1 || i > d - 2) throw new Error(`faultDetectors: "mid" needs a qubit with two CNOTs (1..${d - 2}), got ${i}`);
    light(k, i);
    light(k + 1, i - 1);
  } else if (slot === 'after') {
    if (k !== r - 1) throw new Error(`faultDetectors: "after" is only defined in the last round (${r - 1}), got ${k}`);
    light(r, i - 1);
    light(r, i);
  } else {
    throw new Error(`faultDetectors: unknown slot ${slot}`);
  }
  return D;
}

// Visible name of a detector, 1-based as on the other levels.
export function detectorName(d, r, index) {
  const nc = d - 1;
  const k = Math.floor(index / nc);
  const j = index % nc;
  return k < r ? `round ${k + 1}, check ${j + 1}` : `final layer, check ${j + 1}`;
}

// Edge probabilities: the naive graph has one rate on every edge; the learned graph uses the
// dem.js classes (spaceBoundary for data qubits 0 and d-1). No readout term: this level shows
// the gate-noise graph only.
export function edgeProbabilities(graph, { naiveP = null, classes = null }) {
  return graph.edges.map((e) => {
    if (classes === null) return naiveP;
    if (e.kind === 'space') return e.dataQubit === 0 || e.dataQubit === graph.d - 1 ? classes.spaceBoundary : classes.space;
    if (e.kind === 'time') return classes.time;
    return classes.diag;
  });
}
export function edgeWeights(graph, rates) {
  return Float64Array.from(edgeProbabilities(graph, rates), (p) => weightFromP(p));
}

// Upper-triangle cells (i < j) of the diagonal pairs (k, j+1)-(k+1, j) in detector order.
export function diagonalCells(d, r) {
  const nc = d - 1;
  const cells = [];
  for (let k = 0; k < r; k++) {
    for (let j = 0; j <= d - 3; j++) cells.push([k * nc + j + 1, (k + 1) * nc + j]);
  }
  return cells;
}

// The n largest off-diagonal pair rates (each pair once), largest first.
export function topPairs(pij, n = 10) {
  const out = [];
  for (let a = 0; a < pij.length; a++) for (let b = a + 1; b < pij.length; b++) out.push({ a, b, p: pij[a][b] });
  out.sort((x, y) => y.p - x.p || x.a - y.a || x.b - y.b);
  return out.slice(0, n);
}

const KIND_NAME = { space: 'space (data flip)', time: 'time (misread check)', diag: 'diagonal (fault between CNOTs)' };
// Edge type joining detectors a and b in the learned graph, or null.
export function pairKind(graph, a, b) {
  const e = graph.edges.find((x) => (x.u === a && x.v === b) || (x.u === b && x.v === a));
  return e ? e.kind : null;
}

// decoderComparison row for an arm, x, d, r, basis and mode. The comparison was run at one r
// (params.decoderComparison.r); for another r the row of that r is returned with rUsed set.
export function comparisonFor(dem, { arm, x, d, r, basis = 'Z', mode = 'hard' }) {
  const rows = (dem.decoderComparison || []).filter((c) => c.arm === arm && c.x === x && c.d === d
    && (c.basis ?? 'Z') === basis && c.mode === mode);
  const exact = rows.find((c) => c.r === r);
  if (exact) return { row: exact, rUsed: r };
  if (rows.length) return { row: rows[0], rUsed: rows[0].r };
  return { row: null, rUsed: null };
}

export function outOfSampleFor(dem, { d, r, basis = 'Z' }) {
  return (dem.outOfSample || []).filter((o) => o.d === d && o.r === r && (o.basis ?? 'Z') === basis);
}

// The held-out test (V18, data/results/holdout.json setting1), which step 3 leads with (A53
// review item 6): rates learned from the original stored shots only, tested on circuits run
// afterwards. One clause per pooled distance; null without the file.
const thin = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
export function heldOutText(h) {
  const s = h?.setting1;
  if (!s || !Array.isArray(s.pooled) || !s.pooled.length) return null;
  const setup = s.readout === 'flat' ? `flat readout ε = ${s.epsilon}, ${s.mode} decoding` : `${s.readout} readout, ${s.mode} decoding`;
  const parts = s.pooled.map((p) => `d = ${p.d}: naive ${p.naive.k} of ${thin(p.naive.n)}, learned ${p.learned.k} of ${thin(p.learned.n)}`
    + (p.learnedBelowBeyondIntervals ? ' (learned lower beyond the 95% intervals)' : ''));
  return `Held-out test: the rates were learned from the original stored shots and tested on new circuits run afterwards (${setup}). `
    + `Logical errors, ${parts.join('; ')}.`;
}
export const IN_SAMPLE = 'In sample (rates learned from the same stored shots): ';

// "naive → learned" sentence with the factor; no factor when the learned decoder made no error.
export function comparisonSentence(row) {
  const { naive, learned } = row;
  const base = `Naive graph ${formatNumber(naive.pL)} → learned graph ${formatNumber(learned.pL)}`;
  if (learned.k === 0) return `${base}: no logical error in ${learned.n} shots with the learned graph (naive: ${naive.k}).`;
  const f = naive.pL / learned.pL;
  if (f >= 1) return `${base}: ${formatNumber(f)} times fewer logical errors.`;
  return `${base}: ${formatNumber(1 / f)} times more logical errors.`;
}

// Every cheapest explanation of the lit detectors with at most maxErrors edges (A53 review
// item 5: with one rate on every naive edge, a diagonal pair has three two-error explanations
// of equal cost, and only one of them flips data 1, so the naive decoder's choice is a
// tie-break). Returns { nErrors, cost, sets: [{ edges, flip }] } (flip: the parity of the
// observable edges), or null when no set of at most maxErrors edges explains them.
export function cheapestExplanations(graph, weights, lit, maxErrors = 2) {
  const target = [];
  lit.forEach((v, i) => { if (v) target.push(i); });
  const key = (edges) => {
    const odd = new Set();
    for (const id of edges) {
      for (const n of [graph.edges[id].u, graph.edges[id].v]) {
        if (n === graph.boundary) continue;
        if (odd.has(n)) odd.delete(n);
        else odd.add(n);
      }
    }
    return [...odd].sort((a, b) => a - b).join(',');
  };
  const want = target.join(',');
  const found = [];
  const m = graph.edges.length;
  const visit = (start, chosen) => {
    if (chosen.length && key(chosen) === want) found.push([...chosen]);
    if (chosen.length === maxErrors) return;
    for (let id = start; id < m; id++) visit(id + 1, [...chosen, id]);
  };
  visit(0, []);
  if (!found.length) return null;
  const cost = (edges) => edges.reduce((s, id) => s + weights[id], 0);
  const best = Math.min(...found.map(cost));
  const sets = found.filter((s) => Math.abs(cost(s) - best) <= 1e-9 * Math.max(1, best))
    .map((edges) => ({ edges, flip: edges.filter((id) => graph.edges[id].observable).length % 2 }));
  return { nErrors: Math.min(...sets.map((s) => s.edges.length)), cost: best, sets };
}

const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const numberWord = (n) => NUMBER_WORDS[n] ?? String(n);
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// The step 2 sentences about the naive decoder's choice. With a tie whose explanations differ in
// what they do to data 1, the choice is a tie-break and is said to be one; otherwise the old
// wording (the fault itself never flips data 1, so a correction that does loses the bit).
export function tieSentences(expl, naiveFlip) {
  const outcome = naiveFlip === 1
    ? 'its correction flips data 1, which holds the stored bit, so the logical value is lost'
    : 'its correction leaves data 1, which holds the stored bit, alone, so the logical value survives';
  const nFlip = expl ? expl.sets.filter((s) => s.flip === 1).length : 0;
  if (!expl || expl.sets.length < 2 || nFlip === 0 || nFlip === expl.sets.length) {
    return { tie: false, text: `${capital(outcome)}.` };
  }
  return {
    tie: true,
    text: `${capital(numberWord(expl.sets.length))} explanations with ${numberWord(expl.nErrors)} errors each cost the same, `
      + `and ${numberWord(nFlip)} of them flip${nFlip === 1 ? 's' : ''} data 1. Which one the decoder picks is a tie-break, `
      + `so the naive decoder loses the bit on this fault some of the time. This time ${outcome}.`,
  };
}

// Words for one decoding-graph edge (1-based, as on the other levels).
export function edgeText(graph, e) {
  if (e.kind === 'space') return `flip of data ${e.dataQubit + 1} ${e.layer < graph.r ? `before round ${e.layer + 1}` : 'before the final readout'}`;
  if (e.kind === 'time') return `misread of check ${e.check + 1} in round ${e.round + 1}`;
  return `fault on data ${e.dataQubit + 1} between its two CNOTs in round ${e.round + 1}`;
}

function bankOf(d, r, basis = 'Z') {
  return (demForte1.banks || []).find((b) => b.d === d && b.r === r && (b.basis ?? 'Z') === basis) || null;
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

// Space-time lattice: columns are boundary, checks 1..d-1, boundary; rows are rounds and the
// final layer. lit: detector bits; paths: matching paths drawn thick; widths: per-edge stroke
// width (null: the faint uniform style). Returns the SVG. Compact (narrow screens, d >= 5):
// short labels (B, 1..d-1, R1.., Final) and narrow columns, so that the labels stay readable
// at 360 px; the caller then shows LATTICE_KEY next to it.
export const LATTICE_KEY = 'Columns: B is the boundary, 1, 2, … are the checks; rows: R1, R2, … are the rounds.';
export const compactLattice = (d) => isNarrow() && d >= 5;
let latticeCounter = 0;
function drawLattice(graph, { lit = null, paths = [], widths = null, title, summary }) {
  const { d, r } = graph;
  const nc = d - 1;
  const id = `ln-lattice${++latticeCounter}`;
  const compact = compactLattice(d);
  const colW = compact ? 60 : d > 5 ? 84 : 104;
  const rowH = r > 3 ? 56 : 64;
  const left = compact ? 64 : 124;
  const top = 56;
  const width = left + colW * (nc + 1) + (compact ? 24 : 50);
  const height = top + rowH * r + 40;
  const cx = (c) => left + c * colW;
  const cy = (k) => top + k * rowH;
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-labelledby': `${id}-t ${id}-d`, class: 'grid-svg' });
  svgEl('title', { id: `${id}-t` }, svg).textContent = title;
  svgEl('desc', { id: `${id}-d` }, svg).textContent = summary;

  for (const c of [0, nc + 1]) {
    svgEl('line', { x1: cx(c), x2: cx(c), y1: top - 16, y2: cy(r) + 16, class: 'boundary' }, svg);
    svgEl('text', { x: cx(c), y: top - 28, 'text-anchor': 'middle', class: 'grid-label' }, svg).textContent = compact ? 'B' : 'Boundary';
  }
  for (let j = 0; j < nc; j++) {
    svgEl('text', { x: cx(j + 1), y: top - 28, 'text-anchor': 'middle', class: 'grid-label' }, svg).textContent = compact ? String(j + 1) : `Check ${j + 1}`;
  }
  for (let k = 0; k <= r; k++) {
    const name = compact ? (k < r ? `R${k + 1}` : 'Final') : (k < r ? `Round ${k + 1}` : 'Final layer');
    svgEl('text', { x: compact ? 4 : 12, y: cy(k) + 5, class: 'grid-label' }, svg).textContent = name;
  }
  const pos = (node, e) => {
    if (node === graph.boundary) return [cx(e.dataQubit === 0 ? 0 : nc + 1), cy(e.layer)];
    return [cx((node % nc) + 1), cy(Math.floor(node / nc))];
  };
  for (const e of graph.edges) {
    const [x1, y1] = pos(e.u, e);
    const [x2, y2] = pos(e.v, e);
    if (widths) {
      svgEl('line', {
        x1, y1, x2, y2, stroke: e.kind === 'diag' ? 'var(--match)' : 'var(--b-gate)', 'stroke-width': widths[e.id],
        'stroke-linecap': 'round', ...(e.kind === 'diag' ? { 'stroke-dasharray': '6 4' } : {}),
      }, svg);
    } else {
      svgEl('line', { x1, y1, x2, y2, class: 'edge', ...(e.kind === 'diag' ? { 'stroke-dasharray': '6 4' } : {}) }, svg);
    }
  }
  for (const p of paths) {
    for (const eid of p.edges) {
      const e = graph.edges[eid];
      const [x1, y1] = pos(e.u, e);
      const [x2, y2] = pos(e.v, e);
      svgEl('line', { x1, y1, x2, y2, class: 'match' }, svg);
    }
  }
  for (let k = 0; k <= r; k++) {
    for (let j = 0; j < nc; j++) {
      const on = lit && lit[k * nc + j] === 1;
      svgEl('circle', { cx: cx(j + 1), cy: cy(k), r: 13, class: on ? 'det lit' : 'det' }, svg);
    }
  }
  return svg;
}

// Step 1 timeline (d = 3): data qubits and checks as rows, the four CNOTs in circuit order
// (check 1: data 1 then data 2; check 2: data 2 then data 3), then the check measurements.
// Fault slots are SVG buttons (Enter or Space), "between" on data 2 only and "after" in the
// last round only. On narrow screens the same circuit is drawn on a 400-wide box (so that its
// text stays above 9.8 px at 360 px), with larger slots; every slot has an invisible 44 x 44
// hit area (about 36 px on a 360 px screen).
const TL_WIDE = {
  width: 580, slot: 22, plus: 14,
  rows: { data: [40, 120, 200], check: [80, 160] },
  x: { label: 8, start: 100, before: 130, cnot: [190, 250, 350, 410], mid: 300, meas: 470, after: 530, end: 560 },
};
const TL_NARROW = {
  width: 400, slot: 26, plus: 18,
  rows: TL_WIDE.rows,
  x: { label: 4, start: 72, before: 92, cnot: [140, 180, 256, 296], mid: 218, meas: 340, after: 378, end: 396 },
};
const CNOTS = [{ data: 0, check: 0 }, { data: 1, check: 0 }, { data: 1, check: 1 }, { data: 2, check: 1 }];
const SLOT_TEXT = { before: 'before the round', mid: 'between its two CNOTs', after: 'after the round' };

function drawTimeline({ round, fault, onPick }) {
  const TL = isNarrow() ? TL_NARROW : TL_WIDE;
  const svg = svgEl('svg', { viewBox: `0 0 ${TL.width} 236`, class: 'grid-svg', role: 'group', 'aria-label': `Circuit of round ${round + 1}: choose where a fault happens` });
  const { rows, x } = TL;
  rows.data.forEach((y, i) => {
    svgEl('line', { x1: x.start, x2: x.end, y1: y, y2: y, stroke: 'var(--text)', 'stroke-width': 2 }, svg);
    svgEl('text', { x: x.label, y: y + 5, class: 'grid-label' }, svg).textContent = `Data ${i + 1}`;
  });
  rows.check.forEach((y, j) => {
    svgEl('line', { x1: x.start, x2: x.meas, y1: y, y2: y, stroke: 'var(--muted)', 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }, svg);
    svgEl('text', { x: x.label, y: y + 5, class: 'grid-sublabel' }, svg).textContent = `Check ${j + 1}`;
    svgEl('rect', { x: x.meas - 14, y: y - 12, width: 28, height: 24, fill: 'var(--bg)', stroke: 'var(--muted)', 'stroke-width': 1.5 }, svg);
    svgEl('text', { x: x.meas, y: y + 5, 'text-anchor': 'middle', class: 'grid-sublabel' }, svg).textContent = 'M';
  });
  CNOTS.forEach((c, n) => {
    const cxp = x.cnot[n];
    const yc = rows.data[c.data];
    const yt = rows.check[c.check];
    svgEl('line', { x1: cxp, x2: cxp, y1: yc, y2: yt, stroke: 'var(--text)', 'stroke-width': 2 }, svg);
    svgEl('circle', { cx: cxp, cy: yc, r: 5, fill: 'var(--text)' }, svg);
    svgEl('circle', { cx: cxp, cy: yt, r: 10, fill: 'var(--bg)', stroke: 'var(--text)', 'stroke-width': 2 }, svg);
    svgEl('line', { x1: cxp - 10, x2: cxp + 10, y1: yt, y2: yt, stroke: 'var(--text)', 'stroke-width': 2 }, svg);
    svgEl('line', { x1: cxp, x2: cxp, y1: yt - 10, y2: yt + 10, stroke: 'var(--text)', 'stroke-width': 2 }, svg);
  });
  svgEl('text', { x: x.before, y: 16, 'text-anchor': 'middle', class: 'grid-sublabel' }, svg).textContent = 'before';
  svgEl('text', { x: x.mid, y: 16, 'text-anchor': 'middle', class: 'grid-sublabel' }, svg).textContent = 'between';
  if (round === R1 - 1) svgEl('text', { x: x.after, y: 16, 'text-anchor': 'middle', class: 'grid-sublabel' }, svg).textContent = 'after';

  const slotButtons = [];
  for (let i = 0; i < D1; i++) {
    for (const slot of SLOTS) {
      if (slot === 'mid' && (i < 1 || i > D1 - 2)) continue;
      if (slot === 'after' && round !== R1 - 1) continue;
      const chosen = fault && fault.qubit === i && fault.slot === slot && fault.round === round;
      const g = svgEl('g', {
        role: 'button', tabindex: 0, 'aria-pressed': String(Boolean(chosen)),
        'aria-label': `Fault on data ${i + 1} ${SLOT_TEXT[slot]} in round ${round + 1}`, style: 'cursor: pointer',
      }, svg);
      const sx = x[slot];
      const sy = rows.data[i];
      const h = TL.slot / 2;
      svgEl('rect', { x: sx - 22, y: sy - 22, width: 44, height: 44, fill: 'none', 'pointer-events': 'all' }, g);
      const ring = svgEl('rect', { x: sx - h - 4, y: sy - h - 4, width: 2 * h + 8, height: 2 * h + 8, rx: 4, fill: 'none', stroke: 'none', 'stroke-width': 3 }, g);
      svgEl('rect', {
        x: sx - h, y: sy - h, width: 2 * h, height: 2 * h, rx: 3,
        fill: chosen ? 'var(--lit)' : 'var(--bg)', stroke: chosen ? 'var(--text)' : 'var(--accent)', 'stroke-width': 2,
        ...(chosen ? {} : { 'stroke-dasharray': '3 2' }),
      }, g);
      const t = svgEl('text', { x: sx, y: sy + TL.plus / 3, 'text-anchor': 'middle', 'font-size': TL.plus, fill: chosen ? '#ffffff' : 'var(--accent)' }, g);
      t.textContent = chosen ? '✕' : '+';
      g.addEventListener('click', () => onPick({ qubit: i, round, slot }));
      g.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onPick({ qubit: i, round, slot }); }
      });
      g.addEventListener('focus', () => ring.setAttribute('stroke', 'var(--focus)'));
      g.addEventListener('blur', () => ring.setAttribute('stroke', 'none'));
      g.dataset.slot = `${i}-${slot}`;
      slotButtons.push(g);
    }
  }
  return { svg, slotButtons };
}

export function mountLearnNoise(container) {
  const dem = demForte1;
  const naiveSmall = buildGraph(D1, R1);
  const learnedSmall = buildGraph(D1, R1, { diagonal: true });
  const smallBank = bankOf(D1, R1, 'Z');
  if (!smallBank) throw new Error('the d = 3, r = 3 edge rates are missing');

  let step = 0;
  let round = 1;
  let fault = null;

  container.replaceChildren();
  container.appendChild(el('h2', {}, 'Learn the noise'));
  container.appendChild(goalLine('find an error our first decoder cannot see, then let the data teach it.'));
  container.appendChild(el('p', { class: 'intro' },
    'IonQ\'s noise model makes a fault between two gates light a pair of detectors that no single error of the first decoder explains. '
    + 'Learning how often each pair of detectors lights together adds that error to the graph.'));
  container.appendChild(explainMore([
    'Each check compares two neighbouring data qubits through two CNOT gates. A fault on a middle data qubit between its two CNOTs reaches only the second check in that round, and both checks from the next round on.',
    'The first (naive) decoder only knows data flips (pairs in one row) and misread checks (pairs in one column), all with one rate. The learned decoder estimates a rate for every kind of pair from the detector correlations of the stored shots, including the diagonal pairs.',
  ]));

  const stepLabel = el('p', { class: 'status', 'aria-live': 'polite' });
  container.appendChild(stepLabel);
  const panes = [0, 1, 2].map(() => el('div', { class: 'learn-step' }));
  for (const p of panes) container.appendChild(p);
  const nav = el('div', { class: 'control-row' });
  const back = el('button', { type: 'button', class: 'secondary' }, 'Back');
  const next = el('button', { type: 'button' }, 'Next');
  nav.append(back, next);
  container.appendChild(nav);
  const takeaway = takeawayCard('the learned graph adds the diagonal error that IonQ\'s noise model makes, and the decoder stops inventing two errors where one happened.');
  container.appendChild(takeaway.node);

  // ---- Step 1: inject a fault.
  const s1 = panes[0];
  s1.appendChild(el('h3', {}, 'Step 1 of 3: Inject a fault'));
  s1.appendChild(el('p', {}, 'Pick a round, then a place on a data qubit for the fault. The lit detectors appear on the grid.'));
  const roundRow = el('div', { class: 'control-row', role: 'group', 'aria-label': 'Round shown in detail' });
  const roundButtons = [];
  for (let k = 0; k < R1; k++) {
    const b = el('button', { type: 'button', class: 'secondary', 'aria-pressed': String(k === round) }, `Round ${k + 1}`);
    b.addEventListener('click', () => { round = k; renderStep1(); });
    roundButtons.push(b);
    roundRow.appendChild(b);
  }
  s1.appendChild(roundRow);
  const s1Box = el('div', { class: 'control-row' });
  const timelineBox = el('div', { style: 'flex: 1 1 320px; min-width: 0' });
  const gridBox1 = el('div', { style: 'flex: 1 1 260px; min-width: 0' });
  s1Box.append(timelineBox, gridBox1);
  s1.appendChild(s1Box);
  const s1Hint = el('p', { class: 'intro' });
  s1.appendChild(s1Hint);
  const s1Status = el('p', { class: 'status', 'aria-live': 'polite' });
  s1.appendChild(s1Status);

  function renderStep1(focusSlot = null) {
    // style.css has no pressed state for secondary buttons, so the chosen round is filled here.
    roundButtons.forEach((b, k) => {
      b.setAttribute('aria-pressed', String(k === round));
      b.style.background = k === round ? 'var(--accent)' : '';
      b.style.color = k === round ? 'var(--accent-text)' : '';
    });
    const { svg, slotButtons } = drawTimeline({
      round, fault, onPick: (f) => { fault = f; renderStep1(`${f.qubit}-${f.slot}`); },
    });
    timelineBox.replaceChildren(svg);
    if (focusSlot) slotButtons.find((g) => g.dataset.slot === focusSlot)?.focus();
    s1Hint.textContent = round === R1 - 1
      ? 'This is the last round, so a fault after it is caught only by the final data readout.'
      : 'In this round, a fault after the round is the same as one before the next round.';
    const shown = fault && fault.round === round ? fault : null;
    const lit = shown ? faultDetectors(D1, R1, shown) : new Uint8Array(naiveSmall.nDetectors);
    const names = [...lit].map((v, ix) => (v ? detectorName(D1, R1, ix) : null)).filter(Boolean);
    let text;
    if (!shown) text = 'No fault in this round yet. Choose one of the marked places on the circuit.';
    else {
      text = `Fault on data ${shown.qubit + 1} ${SLOT_TEXT[shown.slot]} in round ${shown.round + 1}: lights ${names.join(' and ')}`;
      if (names.length === 1) text += ' (the other check would be beyond the edge of the code)';
      text += shown.slot === 'mid' ? ': a diagonal pair, one check and round apart.' : '.';
    }
    s1Status.textContent = text;
    gridBox1.replaceChildren(drawLattice(naiveSmall, {
      lit, title: 'Detectors lit by the fault',
      summary: names.length ? `Lit: ${names.join('; ')}.` : 'No detector lit.',
    }));
  }

  // ---- Step 2: hit the limit.
  const s2 = panes[1];
  s2.appendChild(el('h3', {}, 'Step 2 of 3: Hit the limit'));
  const askBtn = el('button', { type: 'button' }, 'Ask the naive decoder');
  s2.appendChild(el('div', { class: 'control-row' })).appendChild(askBtn);
  const s2Note = el('p', { class: 'intro' });
  s2.appendChild(s2Note);
  const gridBox2 = el('div', { class: 'grid-box' });
  s2.appendChild(gridBox2);
  const s2Status = el('div', { 'aria-live': 'polite' });
  s2.appendChild(s2Status);
  let asked = false;
  askBtn.addEventListener('click', () => { asked = true; renderStep2(); });

  // The pair decoded in step 2: the player's fault if it is between the CNOTs, otherwise the
  // same fault on data 2 in the round shown.
  const pairFault = () => (fault && fault.slot === 'mid' ? fault : { qubit: 1, round, slot: 'mid' });

  function renderStep2() {
    const f = pairFault();
    const lit = faultDetectors(D1, R1, f);
    const names = [...lit].map((v, ix) => (v ? detectorName(D1, R1, ix) : null)).filter(Boolean);
    s2Note.textContent = `${fault && fault.slot === 'mid' ? 'Your fault' : 'The fault'}: data ${f.qubit + 1} between its two CNOTs in round ${f.round + 1}, lighting ${names.join(' and ')}.`;
    const pNaive = smallBank.pGateNaive;
    const wNaive = weightFromP(pNaive);
    const naive = asked ? decode(naiveSmall, edgeWeights(naiveSmall, { naiveP: pNaive }), lit) : null;
    gridBox2.replaceChildren(drawLattice(naiveSmall, {
      lit, paths: naive ? naive.paths : [], title: 'The naive decoder\'s explanation',
      summary: naive ? `Lit: ${names.join('; ')}. Naive decoder's path: ${naive.paths.flatMap((p) => p.edges).map((id) => edgeText(naiveSmall, naiveSmall.edges[id])).join('; ')}.` : `Lit: ${names.join('; ')}.`,
    }));
    if (!naive) {
      s2Status.replaceChildren(el('p', { class: 'status' }, 'Press the button to see how the naive decoder explains this pair.'));
      return;
    }
    const used = naive.paths.flatMap((p) => p.edges);
    const learned = decode(learnedSmall, edgeWeights(learnedSmall, { classes: smallBank.classes }), lit);
    const lEdges = learned.paths.flatMap((p) => p.edges).map((id) => learnedSmall.edges[id]);
    // A53 review item 5: the naive choice among equal-cost explanations is a tie-break.
    const tie = tieSentences(cheapestExplanations(naiveSmall, edgeWeights(naiveSmall, { naiveP: pNaive }), lit), naive.flip);
    s2Status.replaceChildren(
      el('p', { class: 'status' }, `The naive decoder pairs them with ${used.length} errors: ${used.map((id) => edgeText(naiveSmall, naiveSmall.edges[id])).join(', and ')}. `
        + `Cost ${formatNumber(naive.cost)}, against ${formatNumber(wNaive)} for one error (every error costs ln[(1 − p)/p] with p = ${formatNumber(pNaive)}). `
        + tie.text),
      el('p', { class: 'takeaway' }, 'The naive decoder has no single error that explains this pattern, so it invents two.'),
      el('p', { class: 'intro' }, `The learned graph has that error as one edge${tie.tie ? ', which removes the tie' : ''}: ${lEdges.map((e) => edgeText(learnedSmall, e)).join(', and ')}, `
        + `with p = ${formatNumber(smallBank.classes.diag)} learned from the stored d = 3, r = 3 shots, cost ${formatNumber(learned.cost)}.`),
    );
  }

  // ---- Step 3: reveal and pay off.
  const s3 = panes[2];
  s3.appendChild(el('h3', {}, 'Step 3 of 3: Reveal and pay off'));
  s3.appendChild(el('p', {}, 'How often each pair of detectors lit together in the stored shots. The diagonal pairs stand out as strongly as the pairs the naive decoder knows.'));
  const basisOn = FEATURES.phaseFlip === true;
  let sel = 0;
  let basis = 'Z';
  let learnedOn = false;
  const arms = demForte1.params?.decoderComparison?.arms || [];
  let armIx = Math.max(0, arms.findIndex((a) => a.arm === 'superconducting'));
  let xIx = arms[armIx] ? Math.floor((arms[armIx].xs.length - 1) / 2) : 0;

  const ctl = el('div', { class: 'control-row' });
  const bankLabel = el('label', { for: 'ln-bank' }, 'Code: ');
  const bankSel = el('select', { id: 'ln-bank' });
  HEATMAP_BANKS.forEach((b, i) => bankSel.appendChild(el('option', { value: String(i) }, `d = ${b.d}, r = ${b.r}`)));
  bankLabel.appendChild(bankSel);
  ctl.appendChild(bankLabel);
  let basisSel = null;
  if (basisOn) {
    const lab = el('label', { for: 'ln-basis' }, 'Memory: ');
    basisSel = el('select', { id: 'ln-basis' });
    basisSel.append(el('option', { value: 'Z' }, 'bit-flip'), el('option', { value: 'X' }, 'phase-flip'));
    lab.appendChild(basisSel);
    ctl.appendChild(lab);
    basisSel.addEventListener('change', () => { basis = basisSel.value; renderStep3(); });
  }
  s3.appendChild(ctl);
  bankSel.addEventListener('change', () => { sel = Number(bankSel.value); renderStep3(); });

  const s3Box = el('div', { class: 'control-row', style: 'align-items: flex-start' });
  const heatBox = el('div', { style: 'flex: 1 1 340px; min-width: 0' });
  const latticeCol = el('div', { style: 'flex: 1 1 300px; min-width: 0' });
  s3Box.append(heatBox, latticeCol);
  s3.appendChild(s3Box);
  const toggle = el('button', { type: 'button', role: 'switch', 'aria-checked': 'false', class: 'secondary' });
  toggle.addEventListener('click', () => { learnedOn = !learnedOn; renderStep3(); });
  const latticeBox = el('div');
  const latticeText = el('p', { class: 'status' });
  latticeCol.append(el('div', { class: 'control-row' }), latticeBox, latticeText);
  latticeCol.firstChild.appendChild(toggle);

  const armRow = el('div', { class: 'control-row' });
  const armLabel = el('label', { for: 'ln-arm' }, 'Readout model: ');
  const armSel = el('select', { id: 'ln-arm' });
  const ARM_NAME = { flat: 'flat readout', 'trapped-ion': 'trapped ion', superconducting: 'superconducting' };
  arms.forEach((a, i) => armSel.appendChild(el('option', { value: String(i) }, ARM_NAME[a.arm] || a.arm)));
  armSel.value = String(armIx);
  armLabel.appendChild(armSel);
  const xLabel = el('label', { for: 'ln-x' });
  const xSel = el('select', { id: 'ln-x' });
  armRow.append(armLabel, xLabel, xSel);
  s3.appendChild(armRow);
  armSel.addEventListener('change', () => {
    armIx = Number(armSel.value);
    xIx = Math.floor((arms[armIx].xs.length - 1) / 2);
    renderStep3();
  });
  xSel.addEventListener('change', () => { xIx = Number(xSel.value); renderStep3(); });

  // The held-out test comes first; the in-sample comparison below it is labelled as such.
  const heldOut = el('p', { class: 'status' });
  s3.appendChild(heldOut);
  const result = el('div', { 'aria-live': 'polite' });
  s3.appendChild(result);
  const smallPrint = el('p', { class: 'intro', style: 'font-size: var(--fs-s)' });
  s3.appendChild(smallPrint);

  let heat = null;
  const xText = (a, x) => (a.xName === 'epsilon' ? (x < 1e-6 ? 'ε ≈ 0' : `ε = ${x}`) : `τ = ${x} µs`);

  function renderStep3() {
    const { d, r } = HEATMAP_BANKS[sel];
    const bank = bankOf(d, r, basis);
    toggle.setAttribute('aria-checked', String(learnedOn));
    toggle.textContent = `Graph: ${learnedOn ? 'learned' : 'naive'} (switch to ${learnedOn ? 'naive' : 'learned'})`;
    if (!bank) {
      heatBox.replaceChildren(el('p', { class: 'status' }, `No stored ${basis === 'X' ? 'phase-flip' : 'bit-flip'} shots for d = ${d}, r = ${r} yet.`));
      latticeBox.replaceChildren();
      latticeText.textContent = '';
      result.replaceChildren();
      smallPrint.textContent = '';
      heat = null;
      return;
    }
    const n = bank.pij.length;
    const nc = d - 1;
    const labels = Array.from({ length: n }, (_, i) => detectorName(d, r, i));
    const graphL = buildGraph(d, r, { diagonal: true });
    const top = topPairs(bank.pij, 10);
    const kindOf = (a, b) => { const k = pairKind(graphL, a, b); return k ? KIND_NAME[k] : 'no single error'; };
    const rows = [
      ...top.map((t) => [`${labels[t.a]} with ${labels[t.b]}`, kindOf(t.a, t.b), t.p]),
      ['Mean over space pairs', KIND_NAME.space, bank.classes.space],
      ['Mean over boundary data flips', 'space, at the edge', bank.classes.spaceBoundary],
      ['Mean over time pairs', KIND_NAME.time, bank.classes.time],
      ['Mean over diagonal pairs', KIND_NAME.diag, bank.classes.diag],
    ];
    const heatOpts = {
      title: `How often two detectors light together, d = ${d}, r = ${r} (${n} detectors)`,
      matrix: bank.pij, labels, valueLabel: 'pair rate p',
      mask: (i, j) => i === j, maskNote: 'a detector with itself',
      groups: Array.from({ length: r + 1 }, (_, k) => ({ start: k * nc, size: nc, label: k < r ? `R${k + 1}` : 'final' })),
      bands: [{ label: 'diagonal', cells: diagonalCells(d, r), dash: '3 2' }],
      table: { columns: ['Detector pair or class', 'Error that joins them', 'Pair rate p'], rows },
    };
    if (heat) heat.update(heatOpts);
    else { heat = createHeatmap(heatOpts); heatBox.replaceChildren(heat.root); }

    // Lattice: edge thickness proportional to p, on one scale for both graphs.
    const graph = learnedOn ? graphL : buildGraph(d, r);
    const probs = edgeProbabilities(graph, learnedOn ? { classes: bank.classes } : { naiveP: bank.pGateNaive });
    const pMax = Math.max(bank.pGateNaive, ...Object.values(bank.classes));
    const widths = probs.map((p) => 1 + (9 * p) / pMax);
    const nDiag = graph.edges.filter((e) => e.kind === 'diag').length;
    const summary = learnedOn
      ? `Learned graph: ${graph.edges.length} edges. Space p = ${formatNumber(bank.classes.space)} (edge qubits ${formatNumber(bank.classes.spaceBoundary)}), time p = ${formatNumber(bank.classes.time)}, ${nDiag} diagonal edges p = ${formatNumber(bank.classes.diag)} (the slanted lines).`
      : `Naive graph: ${graph.edges.length} space and time edges, all with p = ${formatNumber(bank.pGateNaive)}; no diagonal edges.`;
    latticeBox.replaceChildren(drawLattice(graph, { widths, title: `Space-time lattice, ${learnedOn ? 'learned' : 'naive'} graph, line width proportional to p`, summary }));
    latticeText.textContent = compactLattice(d) ? `${LATTICE_KEY} ${summary}` : summary;

    // Big number: decoderComparison for the arm and readout time.
    const arm = arms[armIx];
    xLabel.textContent = arm && arm.xName === 'epsilon' ? ' Readout error: ' : ' Readout time: ';
    xSel.replaceChildren(...(arm ? arm.xs.map((x, i) => el('option', { value: String(i) }, xText(arm, x))) : []));
    xSel.value = String(xIx);
    const { row, rUsed } = arm ? comparisonFor(dem, { arm: arm.arm, x: arm.xs[xIx], d, r, basis }) : { row: null };
    if (!row) {
      result.replaceChildren(el('p', { class: 'status' }, `No decoder comparison for d = ${d} with this readout.`));
    } else {
      const cur = learnedOn ? row.learned : row.naive;
      const big = el('p', { style: 'font-size: var(--fs-xxl); font-weight: 700; margin: var(--sp-2) 0 0' }, formatNumber(cur.pL));
      result.replaceChildren(
        big,
        el('p', { class: 'intro' }, `logical error (chance the stored bit is lost), ${learnedOn ? 'learned' : 'naive'} graph, ${ARM_NAME[arm.arm] || arm.arm}, ${xText(arm, arm.xs[xIx])}, d = ${d}, r = ${rUsed}, hard decoding: ${cur.k} of ${cur.n} shots (95% interval ${formatNumber(cur.lo)} to ${formatNumber(cur.hi)}).`
          + (rUsed !== r ? ` The comparison was run at r = ${rUsed} only.` : '')),
        el('p', { class: 'status' }, `${IN_SAMPLE}${comparisonSentence(row)}`),
      );
    }
    const held = heldOutText(holdout);
    heldOut.textContent = !held ? '' : basis === 'X' ? `${held} (Run in the bit-flip memory.)` : held;
    const oos = outOfSampleFor(dem, { d, r, basis });
    const po = dem.params?.outOfSample || {};
    smallPrint.textContent = oos.length
      ? `A second, weaker check within the stored shots (rates learned on the shots that stored one logical value, tested on the shots that stored the other; flat readout ε = ${po.epsilon}, ${po.mode} decoding): `
        + oos.map((o) => `learned on stored ${o.trainedOn.replace('L', '')}, tested on stored ${o.testedOn.replace('L', '')}: naive ${formatNumber(o.naive.pL)} (${o.naive.k} of ${o.naive.n}), learned ${formatNumber(o.learned.pL)} (${o.learned.k} of ${o.learned.n})`).join('; ') + '.'
      : '';
  }

  function showStep(s, focus) {
    step = s;
    panes.forEach((p, i) => { p.hidden = i !== s; });
    stepLabel.textContent = `Step ${s + 1} of 3`;
    // aria-disabled rather than disabled, so the button keeps keyboard focus (as on Level 4).
    back.setAttribute('aria-disabled', String(s === 0));
    next.textContent = s === 2 ? 'Back to step 1' : 'Next';
    if (s === 0) renderStep1();
    if (s === 1) renderStep2();
    if (s === 2) { renderStep3(); takeaway.show(); }
    if (focus) {
      const h = panes[s].querySelector('h3');
      h.tabIndex = -1;
      h.focus();
    }
  }
  back.addEventListener('click', () => { if (step > 0) showStep(step - 1, true); });
  next.addEventListener('click', () => showStep(step === 2 ? 0 : step + 1, true));
  showStep(0, false);
  // The timeline and the lattices switch layout at the narrow-screen width.
  onNarrowChange(() => showStep(step, false));
}
