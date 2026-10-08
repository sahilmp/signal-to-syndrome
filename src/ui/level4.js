// Level 4, "Trust but verify": readout with confidence. The level 2 grid with every lit
// detector shaded by the confidence of the measurements that produced it; each shot
// decoded in mode "hard" and in mode "soft" with the same seed, their matchings side by
// side; a running tally over 20 shots; the curves of hard against soft logical error
// against tau. The platform toggle is shared with level 3: the trapped ion uses
// createIonReadout and stage2, the superconducting qubit (FEATURES.superconducting)
// createScReadout and stage3. With FEATURES.liveRun the shots can come from a fresh run.

import { decodeShot } from './bridge_core.js';
import { bankD3R3 } from './bridge_data.js';
import { createRng } from '../core/rng.js';
import { expandShots } from '../core/bank.js';
import { buildGraph, pFromLlr, xorP } from '../core/graph.js';
import { createChart, svgEl, formatNumber } from './charts.js';
import { describeCorrections, P_GATE } from './level1.js';
import {
  tauGrid, defaultTauIndex, formatTau, optimaInfo, currentPlatform, onPlatformChange, mountPlatformToggle,
} from './level3.js';
import { mountLiveRun } from './liverun.js';

const SEED = 20261013;
const SHOTS_PER_SET = 20;

const INTRO = {
  'trapped-ion': 'A photon count far from the threshold is a confident reading; one close to it is a guess. ',
  superconducting: 'An IQ point far from the threshold is a confident reading; one close to it (for example from a qubit that decayed during the readout) is a guess. ',
};
const INTRO_TAIL = 'Hard decoding treats every reading as equally reliable. Soft decoding uses each reading\'s confidence (its log-likelihood ratio), '
  + 'so a path through doubtful readings costs less. Both decoders below see the same readings of the same shot.';

// Confidence of detector (k, j): 1 - 2 p, where p is the chance that the readouts behind
// it give the wrong parity (xor of the error probabilities pFromLlr(llr) of those
// readouts). Layer 0 uses m[0][j]; layers 1..r-1 use m[k][j] and m[k-1][j]; the final
// layer uses m[r-1][j], x[j] and x[j+1] (as in computeDetectors).
export function detectorConfidence(llrAnc, llrData, d, r) {
  const nc = d - 1;
  const conf = new Float64Array(nc * (r + 1));
  for (let k = 0; k <= r; k++) {
    for (let j = 0; j < nc; j++) {
      const ls = k < r ? [llrAnc[k][j], ...(k > 0 ? [llrAnc[k - 1][j]] : [])] : [llrAnc[r - 1][j], llrData[j], llrData[j + 1]];
      const p = ls.reduce((acc, l) => xorP(acc, pFromLlr(l)), 0);
      conf[k * nc + j] = Math.max(0, Math.min(1, 1 - 2 * p));
    }
  }
  return conf;
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

let gridCounter = 0;

// The level 2 space-time grid; a lit detector's fill opacity and ring thickness both grow
// with its confidence, so the cue does not rely on colour.
function drawGrid(graph, res, conf, title) {
  const id = `l4grid${++gridCounter}`;
  const { d, r } = graph;
  const nc = d - 1;
  const colW = 90;
  const rowH = 60;
  const left = 96;
  const top = 56;
  const width = left + colW * (nc + 1) + 30;
  const height = top + rowH * r + 34;
  const cx = (c) => left + c * colW;
  const cy = (k) => top + k * rowH;

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-labelledby': `${id}-t ${id}-d`, class: 'grid-svg' });
  svgEl('title', { id: `${id}-t` }, svg).textContent = title;
  const desc = svgEl('desc', { id: `${id}-d` }, svg);

  for (const c of [0, nc + 1]) {
    svgEl('line', { x1: cx(c), x2: cx(c), y1: top - 16, y2: cy(r) + 16, class: 'boundary' }, svg);
    svgEl('text', { x: cx(c), y: top - 28, 'text-anchor': 'middle', class: 'grid-label' }, svg).textContent = 'Boundary';
  }
  for (let j = 0; j < nc; j++) {
    svgEl('text', { x: cx(j + 1), y: top - 28, 'text-anchor': 'middle', class: 'grid-label' }, svg).textContent = `Check ${j + 1}`;
  }
  for (let i = 0; i < d; i++) {
    svgEl('text', { x: (cx(i) + cx(i + 1)) / 2, y: top - 10, 'text-anchor': 'middle', class: 'grid-sublabel' }, svg).textContent = `Data ${i + 1}`;
  }
  for (let k = 0; k <= r; k++) {
    svgEl('text', { x: 8, y: cy(k) + 5, class: 'grid-label' }, svg).textContent = k < r ? `Round ${k + 1}` : 'Final';
  }
  const pos = (node, edge) => {
    if (node === graph.boundary) return [cx(edge.dataQubit === 0 ? 0 : nc + 1), cy(edge.layer)];
    return [cx((node % nc) + 1), cy(Math.floor(node / nc))];
  };
  for (const e of graph.edges) {
    const [x1, y1] = pos(e.u, e);
    const [x2, y2] = pos(e.v, e);
    svgEl('line', { x1, y1, x2, y2, class: 'edge' }, svg);
  }
  for (const p of res.paths) {
    for (const eid of p.edges) {
      const e = graph.edges[eid];
      const [x1, y1] = pos(e.u, e);
      const [x2, y2] = pos(e.v, e);
      svgEl('line', { x1, y1, x2, y2, class: 'match' }, svg);
    }
  }
  const lit = [];
  for (let k = 0; k <= r; k++) {
    for (let j = 0; j < nc; j++) {
      const n = k * nc + j;
      if (res.detectors[n] === 1) {
        const c = conf[n];
        lit.push(`${k < r ? `round ${k + 1}` : 'final layer'}, check ${j + 1} (confidence ${Math.round(100 * c)}%)`);
        svgEl('circle', { cx: cx(j + 1), cy: cy(k), r: 13, class: 'det lit-conf', 'fill-opacity': (0.15 + 0.85 * c).toFixed(3), 'stroke-width': (1 + 5 * c).toFixed(2) }, svg);
      } else {
        svgEl('circle', { cx: cx(j + 1), cy: cy(k), r: 13, class: 'det' }, svg);
      }
    }
  }
  const corr = describeCorrections(graph, res.paths);
  desc.textContent = `Lit detectors: ${lit.length ? lit.join('; ') : 'none'}. Matching: ${corr.length ? corr.map((c) => c.text).join('; ') : 'no correction'}.`;
  return { svg, corr };
}

export function mountLevel4(container) {
  // Each platform keeps its own slider position.
  const positions = new Map();
  let plat = currentPlatform();
  let grid = tauGrid(plat);
  let idx = defaultTauIndex(grid, 0.1, plat);
  positions.set(plat.id, idx);
  let source = { bank: bankD3R3, label: 'stored IonQ simulator bank' };
  let shots = expandShots(source.bank);
  let graph = buildGraph(source.bank.d, source.bank.r);
  let drawRng = createRng(SEED);
  let current = null; // { index, seed }
  let tally = null;

  container.replaceChildren();
  container.appendChild(el('h2', {}, 'Level 4: Trust but verify'));
  mountPlatformToggle(container, 'l4');
  const intro = el('p', { class: 'intro' }, INTRO[plat.id] + INTRO_TAIL);
  container.appendChild(intro);

  const row = el('div', { class: 'control-row' });
  const labelText = document.createTextNode(`${plat.tauName} τ: `);
  const label = el('label', { for: 'l4-tau' });
  const out = el('output', { for: 'l4-tau' }, formatTau(grid[idx]));
  label.append(labelText, out);
  const input = el('input', { id: 'l4-tau', type: 'range', min: '0', max: String(grid.length - 1), step: '1', value: String(idx) });
  row.append(label, input);
  container.appendChild(row);

  const sourceLine = el('p', { class: 'hint' });
  container.appendChild(sourceLine);
  container.appendChild(el('p', { class: 'hint' },
    'Lit detectors: a solid fill and a thick ring mean the readings behind the detector are trustworthy; a faint fill and a thin ring mean they are doubtful.'));

  const pair = el('div', { class: 'l4-pair' });
  const panels = ['hard', 'soft'].map((mode) => {
    const fig = el('figure', { class: 'l4-panel' });
    const cap = el('figcaption', {}, mode === 'hard' ? 'Hard decoding' : 'Soft decoding');
    const box = el('div', { class: 'grid-box' });
    const verdict = el('p', { class: 'verdict' });
    fig.append(cap, box, verdict);
    pair.appendChild(fig);
    return { mode, box, verdict };
  });
  container.appendChild(pair);
  const shotText = el('p', { class: 'status', 'aria-live': 'polite' });
  container.appendChild(shotText);

  const nav = el('div', { class: 'control-row' });
  const nextBtn = el('button', { type: 'button' }, 'Next shot');
  nav.appendChild(nextBtn);
  container.appendChild(nav);
  const tallyText = el('p', { class: 'score', 'aria-live': 'polite' });
  container.appendChild(tallyText);

  // Chart: hard against soft for one distance.
  let dSel = 3;
  const dRow = el('div', { class: 'control-row' });
  const dLabel = el('label', { for: 'l4-d' }, 'Distance shown in the chart: ');
  const dSelect = el('select', { id: 'l4-d' });
  function fillDistances() {
    const ds = [...new Set(plat.results.series.map((s) => s.d))].sort((a, b) => a - b);
    if (!ds.includes(dSel)) dSel = ds.includes(3) ? 3 : ds[0];
    dSelect.replaceChildren(...ds.map((d) => {
      const o = el('option', { value: String(d) }, `d = ${d}`);
      if (d === dSel) o.selected = true;
      return o;
    }));
  }
  fillDistances();
  dRow.append(dLabel, dSelect);
  container.appendChild(dRow);
  const chartOpts = () => {
    const res = plat.results;
    return {
      title: `Hard against soft decoding: logical error against ${plat.tauName.toLowerCase()} (stage ${plat.stage}, ${plat.label.toLowerCase()}, d = ${dSel})${res.fixture ? ' — placeholder data' : ''}`,
      xLabel: `${plat.tauName} τ (µs)`, yLabel: 'Logical error probability',
      series: res.series.filter((s) => s.d === dSel).sort((a, b) => (a.mode === b.mode ? 0 : a.mode === 'hard' ? -1 : 1))
        .map((s) => ({ name: `${s.mode === 'hard' ? 'Hard' : 'Soft'}, d = ${s.d}, r = ${s.r}`, x: res.x.values, y: s.pL, lo: s.lo, hi: s.hi })),
      logX: true, logY: true, yFloor: 1e-7,
      vlines: [{ x: grid[idx], label: `τ = ${formatTau(grid[idx])}` }],
    };
  };
  const chart = createChart(chartOpts());
  container.appendChild(chart.root);
  const optList = el('ul', { class: 'optima' });
  container.appendChild(optList);
  function renderChart() {
    chart.update(chartOpts());
    const lines = ['hard', 'soft'].flatMap((mode) => optimaInfo(plat.results, mode, [dSel]).lines.filter((l) => l.includes('τ_log')));
    optList.replaceChildren(...lines.map((t) => el('li', {}, t)));
  }

  const liveBox = el('div');
  container.appendChild(liveBox);

  function resetTally() {
    tally = { n: 0, hard: 0, soft: 0, differ: 0 };
  }
  function renderTally() {
    const times = (n) => `${n} time${n === 1 ? '' : 's'}`;
    tallyText.textContent = `After ${tally.n} of ${SHOTS_PER_SET} shots: hard decoding kept the logical value ${times(tally.hard)}, soft decoding ${times(tally.soft)}; their matchings differed in ${tally.differ}.`;
  }

  function decodeBoth() {
    const tau = grid[idx];
    const readout = plat.create(plat.params, tau);
    const { bank } = source;
    const args = { shotBits: shots[current.index], layout: bank.layout, d: bank.d, r: bank.r, readout, pGate: P_GATE };
    // The same seed for both modes, so both decoders see identical readings.
    const hard = decodeShot({ ...args, mode: 'hard', rng: createRng(current.seed) });
    const soft = decodeShot({ ...args, mode: 'soft', rng: createRng(current.seed) });
    return { hard, soft };
  }

  const pathKey = (res) => res.paths.map((p) => p.edges.slice().sort((a, b) => a - b).join('.')).sort().join('|');

  // Draws the current shot; returns the two results.
  function renderShot() {
    const tau = grid[idx];
    let both;
    try {
      both = decodeBoth();
    } catch (err) {
      shotText.textContent = `This shot could not be decoded: ${err.message}`;
      return null;
    }
    const { bank } = source;
    const conf = detectorConfidence(both.hard.llrAnc, both.hard.llrData, bank.d, bank.r);
    for (const pnl of panels) {
      const res = both[pnl.mode];
      const { svg, corr } = drawGrid(graph, res, conf, `${pnl.mode === 'hard' ? 'Hard' : 'Soft'} decoding: space-time detector grid`);
      pnl.box.replaceChildren(svg);
      const kept = res.corrected === bank.logical;
      pnl.verdict.className = `verdict ${kept ? 'kept' : 'lost'}`;
      pnl.verdict.textContent = `${kept ? '✓ Logical value kept' : '✗ Logical value lost'} (${res.corrected}). Correction: ${corr.length ? corr.map((c) => c.text).join('; ') : 'none'}.${res.exact ? '' : ' (Matching not exact.)'}`;
    }
    const same = pathKey(both.hard) === pathKey(both.soft);
    shotText.textContent = `${plat.label}, shot ${tally.n} of ${SHOTS_PER_SET} (bank shot ${current.index + 1} of ${shots.length}, readout seed ${current.seed}), τ = ${formatTau(tau)}: `
      + `${both.hard.nDefects} lit detector${both.hard.nDefects === 1 ? '' : 's'}. ${same ? 'Both decoders chose the same matching.' : 'The decoders chose different matchings.'}`;
    return { ...both, same };
  }

  function nextShot() {
    if (tally.n >= SHOTS_PER_SET) resetTally();
    current = { index: drawRng.int(shots.length), seed: 1 + drawRng.int(2 ** 31 - 1) };
    tally.n++;
    const res = renderShot();
    if (res) {
      if (res.hard.corrected === source.bank.logical) tally.hard++;
      if (res.soft.corrected === source.bank.logical) tally.soft++;
      if (!res.same) tally.differ++;
    }
    nextBtn.textContent = tally.n >= SHOTS_PER_SET ? 'New set of 20 shots' : 'Next shot';
    renderTally();
  }

  function renderSource() {
    const b = source.bank;
    sourceLine.textContent = `Shots from the ${source.label}: d = ${b.d}, r = ${b.r}, ${b.shots} shots${b.sampler_seed ? `, simulator seed ${b.sampler_seed}` : ''}${b.fixture ? ' (placeholder fixture data)' : ''}.`;
  }

  function setTau() {
    out.textContent = formatTau(grid[idx]);
    input.setAttribute('aria-valuetext', formatTau(grid[idx]));
  }

  // Redraws the same shot with the new readout; the tally restarts because the readout changed.
  function redrawShot() {
    resetTally();
    tally.n = 1;
    const res = renderShot();
    if (res) {
      if (res.hard.corrected === source.bank.logical) tally.hard++;
      if (res.soft.corrected === source.bank.logical) tally.soft++;
      if (!res.same) tally.differ++;
    }
    nextBtn.textContent = 'Next shot';
    renderTally();
    renderChart();
  }

  input.addEventListener('input', () => {
    idx = Number(input.value);
    positions.set(plat.id, idx);
    setTau();
    redrawShot();
  });
  onPlatformChange((p) => {
    plat = p;
    grid = tauGrid(p);
    if (!positions.has(p.id)) positions.set(p.id, defaultTauIndex(grid, 0.1, p));
    idx = positions.get(p.id);
    intro.textContent = INTRO[p.id] + INTRO_TAIL;
    labelText.textContent = `${p.tauName} τ: `;
    input.max = String(grid.length - 1);
    input.value = String(idx);
    setTau();
    fillDistances();
    redrawShot();
  });
  dSelect.addEventListener('change', () => {
    dSel = Number(dSelect.value);
    renderChart();
  });
  nextBtn.addEventListener('click', nextShot);

  mountLiveRun(liveBox, {
    onBank(bank, labelText) {
      source = { bank, label: labelText };
      shots = expandShots(bank);
      graph = buildGraph(bank.d, bank.r);
      drawRng = createRng(bank.sampler_seed || SEED);
      renderSource();
      resetTally();
      nextShot();
    },
  });

  setTau();
  renderSource();
  renderChart();
  resetTally();
  nextShot();
}
