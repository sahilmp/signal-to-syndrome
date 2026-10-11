// Level 2, "Time is a dimension": d = 3, three rounds. The space-time detector grid
// with the decoder's matching, an epsilon slider, the stage-1 curves of logical error
// against epsilon for d = 3, 5, 7, and a live runPoint estimate on 1000 bank shots.
// With FEATURES.sandbox, the sandbox (U7.8, sandbox.js) below the chart: the player's own errors
// and matching. The level stays in the bit-flip memory (main.js says so when the basis toggle
// is on the phase-flip memory).

import { decodeShot, runPoint, createFlatReadout } from './bridge_core.js';
import { bankD3R3, stage1 } from './bridge_data.js';
import { createRng } from '../core/rng.js';
import { buildGraph } from '../core/graph.js';
import {
  createChart, svgEl, formatNumber, tokenStyle, goalLine, explainMore, takeawayCard, intervalOf, intervalCaption,
} from './charts.js';
import { FEATURES } from './features.js';
import { headlineResults, decoderLabel } from './level3.js';
import { litShotPool, describeCorrections, learnedNoise, shotSentence } from './level1.js';
import { mountSandbox } from './sandbox.js';

const SEED = 20261011;
const LIVE_SHOTS = 1000;
const EPS_MAX = 0.12;

// A bank of n shots drawn with replacement (seeded) from `bank`, so that runPoint sees
// a random sample rather than the first n shots of expandShots' sorted order.
export function sampleBank(bank, shots, n, seed) {
  const rng = createRng(seed);
  const counts = {};
  for (let s = 0; s < n; s++) {
    const bits = shots[rng.int(shots.length)];
    let v = 0;
    for (let b = bits.length - 1; b >= 0; b--) v = v * 2 + bits[b];
    const key = v.toString(16);
    counts[key] = (counts[key] || 0) + 1;
  }
  return {
    ...bank, shots: n, counts,
    checksum: { total_shots: n, n_keys: Object.keys(counts).length },
  };
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

// Space-time grid: columns are boundary, checks 1..d-1, boundary; rows are rounds 1..r
// and the final layer. Lit detectors are filled; matched paths are drawn as thick lines.
function drawGrid(graph, res) {
  const { d, r } = graph;
  const nc = d - 1;
  const colW = 110;
  const rowH = 64;
  // Margins leave room for the larger labels of narrow screens (style.css).
  const left = 124;
  const top = 56;
  const width = left + colW * (nc + 1) + 50;
  const height = top + rowH * r + 40;
  const cx = (c) => left + c * colW; // c = 0 left boundary, 1..nc checks, nc+1 right boundary
  const cy = (k) => top + k * rowH;

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-labelledby': 'l2-grid-title l2-grid-desc', class: 'grid-svg' });
  svgEl('title', { id: 'l2-grid-title' }, svg).textContent = 'Space-time detector grid';
  const desc = svgEl('desc', { id: 'l2-grid-desc' }, svg);

  // Boundary columns.
  for (const c of [0, nc + 1]) {
    svgEl('line', { x1: cx(c), x2: cx(c), y1: top - 16, y2: cy(r) + 16, class: 'boundary' }, svg);
    const t = svgEl('text', { x: cx(c), y: top - 28, 'text-anchor': 'middle', class: 'grid-label' }, svg);
    t.textContent = 'Boundary';
  }
  for (let j = 0; j < nc; j++) {
    const t = svgEl('text', { x: cx(j + 1), y: top - 28, 'text-anchor': 'middle', class: 'grid-label' }, svg);
    t.textContent = `Check ${j + 1}`;
  }
  for (let i = 0; i < d; i++) {
    const t = svgEl('text', { x: (cx(i) + cx(i + 1)) / 2, y: top - 10, 'text-anchor': 'middle', class: 'grid-sublabel' }, svg);
    t.textContent = `Data ${i + 1}`;
  }
  for (let k = 0; k <= r; k++) {
    const t = svgEl('text', { x: 12, y: cy(k) + 5, class: 'grid-label' }, svg);
    t.textContent = k < r ? `Round ${k + 1}` : 'Final layer';
  }

  // All graph edges, faint.
  const pos = (node, edge) => {
    if (node === graph.boundary) return [cx(edge.dataQubit === 0 ? 0 : nc + 1), cy(edge.layer)];
    const k = Math.floor(node / nc);
    const j = node % nc;
    return [cx(j + 1), cy(k)];
  };
  for (const e of graph.edges) {
    const [x1, y1] = pos(e.u, e);
    const [x2, y2] = pos(e.v, e);
    svgEl('line', { x1, y1, x2, y2, class: 'edge' }, svg);
  }
  // Matching paths.
  for (const p of res.paths) {
    for (const id of p.edges) {
      const e = graph.edges[id];
      const [x1, y1] = pos(e.u, e);
      const [x2, y2] = pos(e.v, e);
      svgEl('line', { x1, y1, x2, y2, class: 'match' }, svg);
    }
  }
  // Detectors.
  const lit = [];
  for (let k = 0; k <= r; k++) {
    for (let j = 0; j < nc; j++) {
      const on = res.detectors[k * nc + j] === 1;
      if (on) lit.push(`${k < r ? `round ${k + 1}` : 'final layer'}, check ${j + 1}`);
      svgEl('circle', { cx: cx(j + 1), cy: cy(k), r: 13, class: on ? 'det lit' : 'det' }, svg);
    }
  }
  const corrections = describeCorrections(graph, res.paths);
  desc.textContent = `Lit detectors: ${lit.length ? lit.join('; ') : 'none'}. Decoder's matching: ${corrections.length ? corrections.map((c) => c.text).join('; ') : 'no correction'}.`;
  return { svg, lit, corrections };
}

export function mountLevel2(container) {
  const bank = bankD3R3;
  const { d, r } = bank;
  // The learned decoder (U3 rows 14 and 31): its graph has the diagonal edges its paths can use.
  const graph = buildGraph(d, r, { diagonal: true });
  const noise = learnedNoise(bank);
  const { shots, pool } = litShotPool(bank);
  // Seeded shuffle of the lit shots, so previous and next step through a fixed order.
  const order = pool.slice();
  const shuffleRng = createRng(SEED);
  for (let i = order.length - 1; i > 0; i--) {
    const j = shuffleRng.int(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const liveBank = sampleBank(bank, shots, LIVE_SHOTS, SEED + 2);

  let pos = 0;
  let epsilon = 0.02;

  const ux = FEATURES.uxV2 === true;
  const INTRO = 'With three rounds of checks, each detector compares a check with its value in the previous round. '
    + 'A data-qubit flip lights two neighbouring detectors in one row; a wrong check reading lights two detectors in one column. '
    + 'The decoder pairs lit detectors (or joins them to a boundary) along the cheapest paths.';

  container.replaceChildren();
  container.appendChild(el('h2', {}, 'Level 2: Time is a dimension'));
  if (ux) {
    // Text cut (U7.3): the goal, two visible sentences, the rest under "Explain more".
    container.appendChild(goalLine('see how repeated checks turn every error into a pair of lit detectors, in space or in time.'));
    container.appendChild(el('p', { class: 'intro' },
      'A flipped data qubit lights two neighbouring detectors in one row; a misread check lights two in one column. '
      + 'The decoder pairs lit detectors along the cheapest paths.'));
    container.appendChild(explainMore([INTRO,
      'The chart below shows how the logical error of the decoded memory grows with the readout error, for three code distances.']));
  } else {
    container.appendChild(el('p', { class: 'intro' }, INTRO));
  }

  const gridBox = el('div', { class: 'grid-box' });
  container.appendChild(gridBox);
  const gridText = el('p', { class: 'status', 'aria-live': 'polite' });
  container.appendChild(gridText);
  const shotLine = shotSentence(container, gridText);

  const nav = el('div', { class: 'control-row' });
  const prev = el('button', { type: 'button', class: 'secondary' }, 'Previous shot');
  const next = el('button', { type: 'button' }, 'Next shot');
  prev.addEventListener('click', () => { pos = (pos - 1 + order.length) % order.length; renderShot(); });
  next.addEventListener('click', () => { pos = (pos + 1) % order.length; renderShot(); });
  nav.append(prev, next);
  container.appendChild(nav);

  const epsRow = el('div', { class: 'control-row' });
  const epsLabel = el('label', { for: 'l2-eps' }, ux ? 'Readout error ε (chance one measurement is wrong): ' : 'Readout error ε: ');
  const epsOut = el('output', { for: 'l2-eps' }, epsilon.toFixed(3));
  epsLabel.appendChild(epsOut);
  const epsInput = el('input', { id: 'l2-eps', type: 'range', min: '0', max: String(EPS_MAX), step: '0.005', value: String(epsilon) });
  epsRow.append(epsLabel, epsInput);
  container.appendChild(epsRow);

  const live = el('p', { class: 'status', 'aria-live': 'polite' });
  container.appendChild(live);

  // The learned decoder's curves (headlineResults), with the cluster intervals when the file
  // carries them, else Wilson (CC-B21 item 2); the live estimate is a Wilson interval.
  const res1 = headlineResults(stage1);
  const hard1 = res1.series.filter((s) => s.mode === 'hard' && [3, 5, 7].includes(s.d)).sort((a, b) => a.d - b.d);
  const ivs = hard1.map((s) => intervalOf(s));
  const series = hard1.map((s, i) => ({
    name: `d = ${s.d}, r = ${s.r}`, x: res1.x.values, y: s.pL, lo: ivs[i].lo, hi: ivs[i].hi,
    ...(ux ? tokenStyle({ d: s.d, mode: 'hard', endLabel: `d = ${s.d}` }) : {}),
  }));
  const intervals = intervalCaption([...ivs.map((v) => ({ what: 'Curves', kind: v.kind })), { what: 'Live estimate', kind: 'wilson' }]);
  const dec = decoderLabel(res1);
  const chartBase = ux ? {
    title: `Logical error against readout error (flat readout model), ${dec}`,
    xLabel: 'readout error ε (chance one measurement is wrong)', yLabel: 'logical error (chance the stored bit is lost)',
    series, intervals, logY: true, yFloor: 1e-7,
  } : {
    title: `Logical error against readout error (stage 1, flat readout), ${dec}`,
    xLabel: 'Readout error ε', yLabel: 'Logical error probability',
    series, intervals, logY: true, yFloor: 1e-7,
  };
  const chart = createChart({ ...chartBase, vlines: [{ x: epsilon, label: `ε = ${epsilon.toFixed(3)}` }] });
  container.appendChild(chart.root);
  if (ux) {
    container.appendChild(takeawayCard('repeated checks add a time direction: a misread check is matched in time just as a flipped qubit is matched in space.').node);
  }
  if (FEATURES.sandbox === true) {
    const box = el('section', { class: 'sandbox', 'aria-labelledby': 'l2-sandbox-title' });
    container.appendChild(box);
    try {
      mountSandbox(box);
    } catch (err) {
      box.textContent = `The sandbox could not start: ${err.message}`;
    }
  }

  function renderShot() {
    const idx = order[pos];
    // Each shot has its own readout seed, so a shot redraws identically when revisited.
    const res = decodeShot({
      shotBits: shots[idx], layout: bank.layout, d, r,
      readout: createFlatReadout({ epsilon }), mode: 'hard', noise, rng: createRng(SEED + 1000 + idx),
    });
    const { svg, corrections } = drawGrid(graph, res);
    gridBox.replaceChildren(svg);
    const ok = res.corrected === bank.logical;
    shotLine.set(`Shot ${pos + 1} of ${order.length} with a lit detector`, `stored shot ${idx + 1} of ${shots.length}`, `, ε = ${epsilon.toFixed(3)}. `
      + `${res.nDefects} lit detector${res.nDefects === 1 ? '' : 's'}; decoder: ${corrections.length ? corrections.map((c) => c.text).join('; ') : 'no correction'}. `
      + `Logical value ${res.corrected}: ${ok ? 'survived' : 'lost'}.${res.exact ? '' : ' (Matching not exact.)'}`);
  }

  function renderEstimate() {
    const readout = createFlatReadout({ epsilon });
    const pt = runPoint({ bank: liveBank, readout, mode: 'hard', noise, seed: SEED + 3, maxShots: LIVE_SHOTS });
    const w = pt.wilson;
    live.textContent = `Live estimate at ε = ${epsilon.toFixed(3)} (d = 3, r = 3, ${pt.n} shots): ${pt.k} logical errors, `
      + `p = ${formatNumber(w.p)} (95% interval ${formatNumber(w.lo)} to ${formatNumber(w.hi)}).`;
    chart.update({
      ...chartBase,
      vlines: [{ x: epsilon, label: `ε = ${epsilon.toFixed(3)}` }],
      points: [{ name: `Live estimate, d = 3 (${pt.n} shots)`, x: epsilon, y: w.p, lo: w.lo, hi: w.hi }],
    });
  }

  let timer = null;
  epsInput.addEventListener('input', () => {
    epsilon = Number(epsInput.value);
    epsOut.textContent = epsilon.toFixed(3);
    renderShot();
    clearTimeout(timer);
    timer = setTimeout(renderEstimate, 150);
  });

  if (order.length === 0) {
    gridText.textContent = 'The bank has no shots with a lit detector.';
    prev.disabled = true;
    next.disabled = true;
  } else {
    renderShot();
  }
  renderEstimate();
}
