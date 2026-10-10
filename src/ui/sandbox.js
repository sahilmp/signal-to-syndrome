// Level 2 sandbox (team checklist U7.8), behind FEATURES.sandbox: the d = 3, r = 3 space-time
// grid with errors chosen by the player. Clicking a data qubit between two rounds flips it
// (it lights the horizontal pair of that row, or a single detector next to a boundary);
// clicking a check report makes it misreport (the vertical pair). "Draw a matching": click two
// lit detectors, or a detector and a boundary, to pair them along the shortest path; the
// player's total cost and logical outcome are shown against the decoder's, both on the learned
// graph (space, time and diagonal edges) with the d = 3, r = 3 bit-flip rates of demForte1.
//
// The faults act on the measured bits, as on the other levels: a flip of data qubit i before
// layer t < r flips m[k][i-1] and m[k][i] (the checks that exist) for every round k >= t, and
// x[i]; before the final readout (t = r) it flips x[i] only. A misreport flips m[k][j] only.
// The detectors then come from computeDetectors.

import { demForte1 } from './bridge_data.js';
import { buildGraph } from '../core/graph.js';
import { decode } from '../core/matching.js';
import { computeDetectors } from '../core/detectors.js';
import { svgEl, formatNumber, explainMore } from './charts.js';
import { edgeWeights } from './learnnoise.js';

export const SANDBOX_D = 3;
export const SANDBOX_R = 3;

// The learned graph and its weights: w = ln[(1-p)/p] per edge class (no readout term).
export function sandboxGraph(d = SANDBOX_D, r = SANDBOX_R) {
  return buildGraph(d, r, { diagonal: true });
}
export function sandboxRates(dem = demForte1, d = SANDBOX_D, r = SANDBOX_R) {
  const bank = (dem?.banks || []).find((b) => b.d === d && b.r === r && (b.basis ?? 'Z') === 'Z');
  if (!bank?.classes) throw new Error(`the learned edge rates for d = ${d}, r = ${r} are missing`);
  return bank.classes;
}
export function sandboxWeights(graph, dem = demForte1) {
  return edgeWeights(graph, { classes: sandboxRates(dem, graph.d, graph.r) });
}

// The measured bits after the chosen faults, from an error-free memory storing 0.
// faults = { dataFlips: [{ qubit, layer }], misreports: [{ check, round }] }; a fault chosen twice
// cancels. Returns { m, x, logicalFlip }, logicalFlip = 1 when data qubit 0 flipped an odd
// number of times (the stored bit is then lost unless the correction flips it back).
export function injectBits(d, r, { dataFlips = [], misreports = [] } = {}) {
  const nc = d - 1;
  const m = Array.from({ length: r }, () => new Uint8Array(nc));
  const x = new Uint8Array(d);
  let logicalFlip = 0;
  for (const { qubit: i, layer: t } of dataFlips) {
    if (!Number.isInteger(i) || i < 0 || i >= d) throw new Error(`injectBits: qubit must be 0..${d - 1}, got ${i}`);
    if (!Number.isInteger(t) || t < 0 || t > r) throw new Error(`injectBits: layer must be 0..${r}, got ${t}`);
    for (let k = t; k < r; k++) {
      if (i - 1 >= 0) m[k][i - 1] ^= 1;
      if (i < nc) m[k][i] ^= 1;
    }
    x[i] ^= 1;
    if (i === 0) logicalFlip ^= 1;
  }
  for (const { check: j, round: k } of misreports) {
    if (!Number.isInteger(j) || j < 0 || j >= nc) throw new Error(`injectBits: check must be 0..${nc - 1}, got ${j}`);
    if (!Number.isInteger(k) || k < 0 || k >= r) throw new Error(`injectBits: round must be 0..${r - 1}, got ${k}`);
    m[k][j] ^= 1;
  }
  return { m, x, logicalFlip };
}

export function sandboxDetectors(d, r, faults) {
  const { m, x } = injectBits(d, r, faults);
  return computeDetectors(m, x, d, r);
}

// Shortest path from node a to node b (detector indices or graph.boundary) on non-negative
// weights: { edges (edge ids from a to b), cost (the sum of their weights), parity (the number
// of observable edges on it, mod 2) }. Dijkstra over the (small) graph.
export function shortestPath(graph, weights, a, b) {
  const n = graph.nDetectors + 1;
  const dist = new Float64Array(n).fill(Infinity);
  const via = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  dist[a] = 0;
  for (;;) {
    let u = -1;
    for (let v = 0; v < n; v++) if (!done[v] && dist[v] < Infinity && (u < 0 || dist[v] < dist[u])) u = v;
    if (u < 0 || u === b) break;
    done[u] = 1;
    for (const e of graph.edges) {
      if (e.u !== u && e.v !== u) continue;
      const v = e.u === u ? e.v : e.u;
      const nd = dist[u] + weights[e.id];
      if (nd < dist[v]) {
        dist[v] = nd;
        via[v] = e.id;
      }
    }
  }
  if (dist[b] === Infinity) throw new Error(`shortestPath: node ${b} cannot be reached from ${a}`);
  const edges = [];
  for (let v = b; v !== a;) {
    const e = graph.edges[via[v]];
    edges.push(e.id);
    v = e.u === v ? e.v : e.u;
  }
  edges.reverse();
  let cost = 0;
  let parity = 0;
  for (const id of edges) {
    cost += weights[id];
    if (graph.edges[id].observable) parity ^= 1;
  }
  return { edges, cost, parity };
}

// The player's matching: pairs [[a, b]] of lit detectors, b = "B" for the boundary. Each pair
// becomes its shortest path; cost is the sum of the path costs and flip the parity of the
// observable edges on them (whether the correction flips data qubit 0).
export function playerMatching(graph, weights, pairs) {
  const paths = pairs.map(([a, b]) => ({ a, b, ...shortestPath(graph, weights, a, b === 'B' ? graph.boundary : b) }));
  let cost = 0;
  let flip = 0;
  for (const p of paths) {
    cost += p.cost;
    flip ^= p.parity;
  }
  return { paths, cost, flip };
}

// The decoder's matching on the same graph and weights, with its cost summed the same way.
export function decoderMatching(graph, weights, detectors) {
  const res = decode(graph, weights, detectors);
  let cost = 0;
  for (const p of res.paths) for (const id of p.edges) cost += weights[id];
  return { ...res, cost };
}

// The stored bit survives when the correction undoes the true flip of data qubit 0.
export const bitKept = (logicalFlip, correctionFlip) => (logicalFlip ^ correctionFlip) === 0;

// Lit detectors not yet in a pair.
export function unpaired(detectors, pairs) {
  const used = new Set(pairs.flatMap(([a, b]) => (b === 'B' ? [a] : [a, b])));
  const out = [];
  detectors.forEach((v, i) => { if (v && !used.has(i)) out.push(i); });
  return out;
}

const nodeName = (graph, i) => {
  if (i === 'B' || i === graph.boundary) return 'the boundary';
  const nc = graph.d - 1;
  const k = Math.floor(i / nc);
  return `${k < graph.r ? `round ${k + 1}` : 'final layer'}, check ${(i % nc) + 1}`;
};
const slotName = (graph, t) => (t < graph.r ? `before round ${t + 1}` : 'before the final readout');

// Injected faults are filled, free slots outlined (inline: the colours are the page tokens).
const slotStyle = (on) => ({ fill: on ? 'var(--text)' : 'var(--bg)', stroke: 'var(--text)', 'stroke-width': 2 });

function el(tag, attrs = {}, text = null) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  if (text !== null) e.textContent = text;
  return e;
}

// An SVG element that acts as a button: focusable, Enter and Space activate it.
function svgButton(node, label, onActivate) {
  node.setAttribute('role', 'button');
  node.setAttribute('tabindex', '0');
  node.setAttribute('aria-label', label);
  node.addEventListener('click', onActivate);
  node.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      onActivate();
    }
  });
  return node;
}

export function mountSandbox(container) {
  const graph = sandboxGraph();
  const weights = sandboxWeights(graph);
  const { d, r } = graph;
  const nc = d - 1;
  const faults = { dataFlips: [], misreports: [] };
  let pairs = [];
  let selected = null; // a lit detector waiting for its partner

  container.replaceChildren();
  container.appendChild(el('h3', { id: 'l2-sandbox-title' }, 'Sandbox: make your own errors'));
  container.appendChild(el('p', { class: 'hint' },
    'Click a data qubit between rounds to flip it, or a check report to make it misreport; then pair the lit detectors yourself.'));
  container.appendChild(explainMore([
    'Squares between the checks are data qubits: a flip there lights the two detectors on either side in that row (one, next to a boundary). '
    + 'Diamonds between two rows are check reports: a wrong report lights the detectors above and below it.',
    'To draw a matching, click a lit detector, then another lit detector or a boundary line; click a paired detector again to undo its pair. '
    + 'Each pair is joined along its cheapest path. The cost of a path is the sum of its edge weights ln[(1 − p)/p], '
    + 'with the error rates p learned from the stored IonQ simulator shots, so a cheaper matching is a more likely explanation.',
  ]));

  const gridBox = el('div', { class: 'grid-box' });
  container.appendChild(gridBox);
  const controls = el('div', { class: 'control-row' });
  const boundaryBtn = el('button', { type: 'button', class: 'secondary' }, 'Pair the selected detector with the boundary');
  const clearBtn = el('button', { type: 'button', class: 'secondary' }, 'Clear');
  controls.append(boundaryBtn, clearBtn);
  container.appendChild(controls);
  const status = el('p', { class: 'status', 'aria-live': 'polite' });
  container.appendChild(status);
  const result = el('p', { class: 'score', 'aria-live': 'polite' });
  container.appendChild(result);

  const toggle = (list, item, same) => {
    const i = list.findIndex((f) => same(f, item));
    if (i >= 0) list.splice(i, 1);
    else list.push(item);
    pairs = [];
    selected = null;
    render();
  };
  const flipData = (qubit, layer) => toggle(faults.dataFlips, { qubit, layer }, (f, g) => f.qubit === g.qubit && f.layer === g.layer);
  const misreport = (check, round) => toggle(faults.misreports, { check, round }, (f, g) => f.check === g.check && f.round === g.round);

  function pickDetector(i, detectors) {
    if (!detectors[i]) return;
    const at = pairs.findIndex(([a, b]) => a === i || b === i);
    if (at >= 0) {
      pairs.splice(at, 1);
      selected = null;
    } else if (selected === null) {
      selected = i;
    } else if (selected === i) {
      selected = null;
    } else {
      pairs.push([selected, i]);
      selected = null;
    }
    render();
  }
  function pickBoundary() {
    if (selected === null) return;
    pairs.push([selected, 'B']);
    selected = null;
    render();
  }

  // Layout as in the Level 2 grid: boundary, checks 1..d-1, boundary; rows are the layers. The
  // top margin is larger, so the data labels clear the first row of data squares.
  const colW = 110;
  const rowH = 64;
  const left = 124;
  const top = 76;
  const width = left + colW * (nc + 1) + 50;
  const height = top + rowH * r + 40;
  const cx = (c) => left + c * colW;
  const cy = (k) => top + k * rowH;
  const pos = (node, e) => {
    if (node === graph.boundary) return [cx(e.dataQubit === 0 ? 0 : nc + 1), cy(e.layer ?? 0)];
    return [cx((node % nc) + 1), cy(Math.floor(node / nc))];
  };

  function render() {
    const detectors = sandboxDetectors(d, r, faults);
    const lit = [...detectors].reduce((n, v) => n + v, 0);
    const player = playerMatching(graph, weights, pairs);
    const open = unpaired(detectors, pairs);
    const complete = open.length === 0;
    const { logicalFlip } = injectBits(d, r, faults);
    const decoder = complete ? decoderMatching(graph, weights, detectors) : null;

    const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, role: 'group', 'aria-labelledby': 'l2-sandbox-title', class: 'grid-svg sandbox-svg' });
    for (const c of [0, nc + 1]) {
      const line = svgEl('line', { x1: cx(c), x2: cx(c), y1: top - 16, y2: cy(r) + 16, class: 'boundary' }, svg);
      if (selected !== null) svgButton(line, `Pair ${nodeName(graph, selected)} with the boundary`, pickBoundary);
      svgEl('text', { x: cx(c), y: top - 44, 'text-anchor': 'middle', class: 'grid-label' }, svg).textContent = 'Boundary';
    }
    for (let j = 0; j < nc; j++) {
      svgEl('text', { x: cx(j + 1), y: top - 44, 'text-anchor': 'middle', class: 'grid-label' }, svg).textContent = `Check ${j + 1}`;
    }
    for (let i = 0; i < d; i++) {
      svgEl('text', { x: (cx(i) + cx(i + 1)) / 2, y: top - 22, 'text-anchor': 'middle', class: 'grid-sublabel' }, svg).textContent = `Data ${i + 1}`;
    }
    for (let k = 0; k <= r; k++) {
      svgEl('text', { x: 12, y: cy(k) + 5, class: 'grid-label' }, svg).textContent = k < r ? `Round ${k + 1}` : 'Final layer';
    }
    for (const e of graph.edges) {
      const [x1, y1] = pos(e.u, e);
      const [x2, y2] = pos(e.v, e);
      svgEl('line', { x1, y1, x2, y2, class: 'edge' }, svg);
    }
    // The decoder's matching (dashed) once the player's is complete, then the player's (solid).
    if (decoder) {
      for (const p of decoder.paths) {
        for (const id of p.edges) {
          const e = graph.edges[id];
          const [x1, y1] = pos(e.u, e);
          const [x2, y2] = pos(e.v, e);
          svgEl('line', { x1, y1, x2, y2, class: 'decoder-match', stroke: 'var(--d3)', 'stroke-width': 4, 'stroke-dasharray': '6 4' }, svg);
        }
      }
    }
    for (const p of player.paths) {
      for (const id of p.edges) {
        const e = graph.edges[id];
        const [x1, y1] = pos(e.u, e);
        const [x2, y2] = pos(e.v, e);
        svgEl('line', { x1, y1, x2, y2, class: 'match' }, svg);
      }
    }
    // Data-qubit slots (squares, on the space edges) and check reports (diamonds, on the time edges).
    for (let t = 0; t <= r; t++) {
      for (let i = 0; i < d; i++) {
        const on = faults.dataFlips.some((f) => f.qubit === i && f.layer === t);
        const x = (cx(i) + cx(i + 1)) / 2;
        const g = svgEl('rect', { x: x - 8, y: cy(t) - 8, width: 16, height: 16, class: 'slot data-slot', ...slotStyle(on) }, svg);
        g.setAttribute('aria-pressed', String(on));
        svgButton(g, `Flip data ${i + 1} ${slotName(graph, t)}`, () => flipData(i, t));
      }
    }
    for (let k = 0; k < r; k++) {
      for (let j = 0; j < nc; j++) {
        const on = faults.misreports.some((f) => f.check === j && f.round === k);
        const x = cx(j + 1);
        const y = (cy(k) + cy(k + 1)) / 2;
        const g = svgEl('polygon', { points: `${x},${y - 9} ${x + 9},${y} ${x},${y + 9} ${x - 9},${y}`, class: 'slot report-slot', ...slotStyle(on) }, svg);
        g.setAttribute('aria-pressed', String(on));
        svgButton(g, `Misreport check ${j + 1} in round ${k + 1}`, () => misreport(j, k));
      }
    }
    for (let k = 0; k <= r; k++) {
      for (let j = 0; j < nc; j++) {
        const i = k * nc + j;
        const on = detectors[i] === 1;
        const c = svgEl('circle', { cx: cx(j + 1), cy: cy(k), r: 13, class: on ? 'det lit' : 'det' }, svg);
        // The selected detector gets a second, wider ring (shape, not colour alone).
        if (selected === i) svgEl('circle', { cx: cx(j + 1), cy: cy(k), r: 19, fill: 'none', stroke: 'var(--focus)', 'stroke-width': 3 }, svg);
        if (on) {
          const paired = pairs.some(([a, b]) => a === i || b === i);
          svgButton(c, `${paired ? 'Undo the pair of' : selected === i ? 'Deselect' : 'Pair'} lit detector ${nodeName(graph, i)}`, () => pickDetector(i, detectors));
        }
      }
    }
    gridBox.replaceChildren(svg);
    boundaryBtn.disabled = selected === null;

    const nFaults = faults.dataFlips.length + faults.misreports.length;
    status.textContent = nFaults === 0
      ? 'No errors yet: every detector is dark.'
      : `${nFaults} error${nFaults === 1 ? '' : 's'}, ${lit} lit detector${lit === 1 ? '' : 's'}. `
        + (selected !== null ? `Selected: ${nodeName(graph, selected)}; pick its partner or a boundary. ` : '')
        + (complete ? '' : `${open.length} still unpaired.`);
    if (nFaults === 0 || !complete) {
      result.textContent = '';
      return;
    }
    const verdict = (flip) => (bitKept(logicalFlip, flip) ? 'the stored bit survives' : 'the stored bit is lost');
    const same = Math.abs(player.cost - decoder.cost) <= 1e-9 * Math.max(1, decoder.cost);
    result.textContent = `Your matching costs ${formatNumber(player.cost)} and ${verdict(player.flip)}. `
      + `The decoder's (dashed) costs ${formatNumber(decoder.cost)} and ${verdict(decoder.flip)}. `
      + (same ? 'You found a cheapest matching.' : player.cost > decoder.cost ? 'The decoder found a cheaper one.' : '');
  }

  boundaryBtn.addEventListener('click', pickBoundary);
  clearBtn.addEventListener('click', () => {
    faults.dataFlips = [];
    faults.misreports = [];
    pairs = [];
    selected = null;
    render();
  });
  render();
}
