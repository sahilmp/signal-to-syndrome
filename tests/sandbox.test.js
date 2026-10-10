import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sandboxGraph, sandboxWeights, sandboxRates, sandboxDetectors, injectBits, shortestPath, playerMatching,
  decoderMatching, bitKept, unpaired, mountSandbox, SANDBOX_D, SANDBOX_R,
} from '../src/ui/sandbox.js';
import { weightFromP } from '../src/core/graph.js';
import { FEATURES } from '../src/ui/features.js';
import {
  PLATFORMS, resultsFor, budgetFor, currentBasis, setBasis, memoryTag, BASES, mountLevel3, naiveResults,
} from '../src/ui/level3.js';
import { HERO_PLATFORMS, heroResults, mountHero } from '../src/ui/hero.js';
import { level5Source, SRC_V2, mountLevel5, tradeoffOptions, budgetOptions } from '../src/ui/level5.js';
import { mountLevel4 } from '../src/ui/level4.js';
import {
  stage2v2, stage3v2, stage4v2, stage2x, stage3x, stage4x, demForte1,
} from '../src/ui/bridge_data.js';

const d = SANDBOX_D;
const r = SANDBOX_R;
const nc = d - 1;
const det = (k, j) => k * nc + j;
const litList = (D) => [...D].flatMap((v, i) => (v ? [i] : []));
const graph = sandboxGraph();
const weights = sandboxWeights(graph);
const edgeOf = (pred) => graph.edges.find(pred);

// ---- Faults and detectors ----

// Catches: fails if a data flip lights the wrong row (an off-by-one between "before round t"
// and layer t), lights a whole column (the flip applied to one round only, so the next round's
// comparison lights again), or lights a detector next to a boundary qubit that has no check
// there. Data 2 (index 1) before round 2 lights both detectors of layer 1; data 1 (index 0) in
// the same slot lights only check 1 of layer 1 (its other side is the boundary).
test('a data flip lights the predicted horizontal pair, or one detector next to a boundary', () => {
  assert.deepEqual(litList(sandboxDetectors(d, r, { dataFlips: [{ qubit: 1, layer: 1 }] })), [det(1, 0), det(1, 1)]);
  assert.deepEqual(litList(sandboxDetectors(d, r, { dataFlips: [{ qubit: 0, layer: 1 }] })), [det(1, 0)]);
  assert.deepEqual(litList(sandboxDetectors(d, r, { dataFlips: [{ qubit: 2, layer: 1 }] })), [det(1, 1)]);
  // Each lit set is the end points of the space edge of that layer and qubit.
  for (const i of [0, 1, 2]) {
    const e = edgeOf((x) => x.kind === 'space' && x.layer === 1 && x.dataQubit === i);
    const want = [e.u, e.v].filter((n) => n !== graph.boundary).sort((a, b) => a - b);
    assert.deepEqual(litList(sandboxDetectors(d, r, { dataFlips: [{ qubit: i, layer: 1 }] })), want);
  }
});

// Catches: fails if the last slot (before the final readout, layer r) is treated like a round
// slot or dropped: on that boundary only the data readout changes, so the final layer lights,
// while one slot earlier (before round r, layer r-1) the pair lights in round r instead.
test('data flip before the final readout lights the final layer; one slot earlier, round r', () => {
  assert.deepEqual(litList(sandboxDetectors(d, r, { dataFlips: [{ qubit: 1, layer: r }] })), [det(r, 0), det(r, 1)]);
  assert.deepEqual(litList(sandboxDetectors(d, r, { dataFlips: [{ qubit: 1, layer: r - 1 }] })), [det(r - 1, 0), det(r - 1, 1)]);
  assert.throws(() => injectBits(d, r, { dataFlips: [{ qubit: 1, layer: r + 1 }] }), /layer/);
});

// Catches: fails if a misreport flips the check for the rest of the memory (a data flip, not a
// misreport) or lights a horizontal pair: a wrong report of check 1 in round 2 lights that
// detector and the one below it. In the last round the lower one is the final layer.
test('a misreport lights the vertical pair', () => {
  assert.deepEqual(litList(sandboxDetectors(d, r, { misreports: [{ check: 0, round: 1 }] })), [det(1, 0), det(2, 0)]);
  assert.deepEqual(litList(sandboxDetectors(d, r, { misreports: [{ check: 1, round: r - 1 }] })), [det(r - 1, 1), det(r, 1)]);
  const e = edgeOf((x) => x.kind === 'time' && x.check === 0 && x.round === 1);
  assert.deepEqual([e.u, e.v].sort((a, b) => a - b), [det(1, 0), det(2, 0)]);
});

// Catches: fails if the stored bit is counted as lost for flips of data qubits other than the
// observable one, or for misreports, or if two flips of data 1 do not cancel.
test('only flips of data qubit 0 change the stored bit', () => {
  assert.equal(injectBits(d, r, { dataFlips: [{ qubit: 0, layer: 2 }] }).logicalFlip, 1);
  assert.equal(injectBits(d, r, { dataFlips: [{ qubit: 0, layer: 2 }, { qubit: 0, layer: 0 }] }).logicalFlip, 0);
  assert.equal(injectBits(d, r, { dataFlips: [{ qubit: 1, layer: 2 }], misreports: [{ check: 0, round: 0 }] }).logicalFlip, 0);
});

// ---- Matching ----

// Catches: fails if the sandbox does not use the learned d = 3, r = 3 rates of demForte1 (the
// decoder's own weights), for example one naive rate on every edge, or the d = 5 bank.
test('sandbox weights are the learned d = 3, r = 3 class rates', () => {
  const c = sandboxRates();
  const bank = demForte1.banks.find((b) => b.d === 3 && b.r === 3 && (b.basis ?? 'Z') === 'Z');
  assert.deepEqual(c, bank.classes);
  assert.ok(graph.edges.some((e) => e.kind === 'diag'), 'the learned graph has diagonal edges');
  for (const e of graph.edges) {
    const p = e.kind === 'time' ? c.time : e.kind === 'diag' ? c.diag
      : e.dataQubit === 0 || e.dataQubit === d - 1 ? c.spaceBoundary : c.space;
    assert.equal(weights[e.id], weightFromP(p), `edge ${e.id}`);
  }
});

// Catches: fails if the player's cost is not the sum of the weights of the edges on the chosen
// paths (for example the number of edges, or only the last pair's cost), or if a boundary pair
// is ignored. Two separate pairs: a two-detector pair and a boundary pair.
test("the player's matching cost equals the sum of the chosen path weights", () => {
  const faults = { dataFlips: [{ qubit: 1, layer: 1 }, { qubit: 0, layer: 3 }] };
  const D = sandboxDetectors(d, r, faults);
  assert.deepEqual(litList(D), [det(1, 0), det(1, 1), det(3, 0)]);
  const pairs = [[det(1, 0), det(1, 1)], [det(3, 0), 'B']];
  const m = playerMatching(graph, weights, pairs);
  let sum = 0;
  for (const p of m.paths) for (const id of p.edges) sum += weights[id];
  assert.ok(Math.abs(m.cost - sum) < 1e-12, `${m.cost} against ${sum}`);
  // Each pair here is one edge: the space edge of data 2 in layer 1 and of data 1 in layer 3.
  const e1 = edgeOf((x) => x.kind === 'space' && x.layer === 1 && x.dataQubit === 1);
  const e2 = edgeOf((x) => x.kind === 'space' && x.layer === 3 && x.dataQubit === 0);
  assert.deepEqual(m.paths.map((p) => p.edges), [[e1.id], [e2.id]]);
  assert.ok(Math.abs(m.cost - (weights[e1.id] + weights[e2.id])) < 1e-12);
  // The boundary path crosses the observable edge, so the correction flips data qubit 0 back.
  assert.equal(m.flip, 1);
  assert.equal(bitKept(injectBits(d, r, faults).logicalFlip, m.flip), true);
  assert.deepEqual(unpaired(D, pairs), []);
  assert.deepEqual(unpaired(D, pairs.slice(0, 1)), [det(3, 0)]);
});

// Catches: fails if a path of two or more edges is costed as its first edge only, or if the
// shortest path takes a costlier route: the pair (round 1, check 1)-(round 3, check 1) is two
// time edges, the cheapest connection when a check misreported twice in a row is not modelled.
test('a longer pair costs the sum of its edges, and is the cheapest route', () => {
  const a = det(0, 0);
  const b = det(2, 0);
  const p = shortestPath(graph, weights, a, b);
  let sum = 0;
  for (const id of p.edges) sum += weights[id];
  assert.ok(p.edges.length >= 2);
  assert.ok(Math.abs(p.cost - sum) < 1e-12);
  assert.ok(Math.abs(p.cost - 2 * weightFromP(sandboxRates().time)) < 1e-9, 'two time edges');
});

// Catches: fails if the decoder's cost is summed differently from the player's, so a player
// who finds the decoder's own matching would be told it is not the cheapest.
test("the decoder's matching costs no more than the player's, and the same when they agree", () => {
  const faults = { dataFlips: [{ qubit: 1, layer: 1 }], misreports: [{ check: 0, round: 2 }] };
  const D = sandboxDetectors(d, r, faults);
  const dec = decoderMatching(graph, weights, D);
  const mine = playerMatching(graph, weights, dec.paths.map((p) => [p.a, p.b]));
  assert.ok(Math.abs(mine.cost - dec.cost) < 1e-9);
  assert.equal(mine.flip, dec.flip);
  const lits = litList(D);
  const other = playerMatching(graph, weights, [[lits[0], lits[3]], [lits[1], lits[2]]]);
  assert.ok(other.cost >= dec.cost - 1e-9);
});

// ---- A minimal DOM, enough to mount the levels and read their text (as in level5.test.js) ----
class FakeText {
  constructor(data) { this.nodeType = 3; this.data = String(data); this.parentNode = null; }
  get textContent() { return this.data; }
  set textContent(v) { this.data = String(v); }
  cloneNode() { return new FakeText(this.data); }
}
class FakeEl {
  constructor(tag, ns = 'html') {
    this.nodeType = 1;
    this.localName = tag.toLowerCase();
    this.namespaceURI = ns;
    this.childNodes = [];
    this.attributes = {};
    this.parentNode = null;
    this.className = '';
    this.hidden = false;
    this.listeners = {};
    this.style = { setProperty(k, v) { this[k] = v; } };
  }
  get firstChild() { return this.childNodes[0] ?? null; }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v) { this.replaceChildren(String(v)); }
  set innerHTML(html) {
    const tag = /^<(\w+)>/.exec(html)?.[1];
    this.replaceChildren(...(tag ? [new FakeEl(tag, tag === 'svg' ? 'svg' : 'html')] : []));
  }
  setAttribute(k, v) {
    this.attributes[k] = String(v);
    if (k === 'class') this.className = String(v);
    if (k === 'id') this.id = String(v);
  }
  getAttribute(k) { return k === 'class' ? this.className : (this.attributes[k] ?? null); }
  appendChild(n) {
    if (n.parentNode) n.parentNode.childNodes.splice(n.parentNode.childNodes.indexOf(n), 1);
    n.parentNode = this;
    this.childNodes.push(n);
    return n;
  }
  append(...ns) { for (const n of ns) this.appendChild(typeof n === 'string' ? new FakeText(n) : n); }
  replaceChildren(...ns) {
    for (const c of this.childNodes) c.parentNode = null;
    this.childNodes = [];
    this.append(...ns);
  }
  cloneNode(deep) {
    const c = new FakeEl(this.localName, this.namespaceURI);
    c.attributes = { ...this.attributes };
    c.className = this.className;
    if (deep) for (const k of this.childNodes) c.appendChild(k.cloneNode(true));
    return c;
  }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  click() { for (const fn of this.listeners.click || []) fn({ preventDefault() {} }); }
  scrollIntoView() {}
  focus() {}
  createTHead() { return this.appendChild(new FakeEl('thead')); }
  createTBody() { return this.appendChild(new FakeEl('tbody')); }
  createCaption() { return this.appendChild(new FakeEl('caption')); }
  insertRow() { return this.appendChild(new FakeEl('tr')); }
  insertCell() { return this.appendChild(new FakeEl('td')); }
}
function* walk(n) {
  yield n;
  for (const c of n.childNodes || []) if (c.nodeType === 1) yield* walk(c);
}
const hasClass = (n, c) => n.className.split(/\s+/).includes(c);
// Visible labels: hidden subtrees and the explicit "stays in the bit-flip memory" notes
// (class basis-note) left out, and so are Level 5's scoreboard and "Data" tables. Those show the
// hypotheses' own statements (C6 compares the two memories in words) from the bit-flip results,
// under a basis-note that says so; they are results text, not labels.
const isDataExpander = (n) => n.localName === 'details' && n.childNodes[0]?.localName === 'summary' && n.childNodes[0].textContent === 'Data';
function visibleText(n) {
  if (n.nodeType === 3) return n.data;
  if (n.hidden || hasClass(n, 'basis-note') || hasClass(n, 'l5-scoreboard') || isDataExpander(n)) return '';
  return n.childNodes.map(visibleText).join(' ');
}
const notes = (root) => [...walk(root)].filter((n) => hasClass(n, 'basis-note') && !n.hidden).map((n) => n.textContent);

function withDom(flags, fn) {
  const saved = { document: globalThis.document, flags: { ...FEATURES } };
  globalThis.document = {
    createElement: (t) => new FakeEl(t),
    createElementNS: (ns, t) => new FakeEl(t, 'svg'),
    createTextNode: (t) => new FakeText(t),
  };
  Object.assign(FEATURES, flags);
  try {
    return fn();
  } finally {
    Object.assign(FEATURES, saved.flags);
    if (saved.document === undefined) delete globalThis.document;
    else globalThis.document = saved.document;
  }
}

// Catches: fails if the sandbox does not build (a missing rate, a broken SVG path) or if a
// click on a data slot does not light the pair and add to the error count.
test('sandbox mounts, and a click on a data slot lights two detectors', () => {
  withDom({ sandbox: true }, () => {
    const root = new FakeEl('div');
    mountSandbox(root);
    assert.match(root.textContent, /No errors yet/);
    const slot = [...walk(root)].find((n) => n.attributes['aria-label'] === 'Flip data 2 before round 2');
    assert.ok(slot, 'data slot button');
    slot.click();
    assert.match(root.textContent, /1 error, 2 lit detectors/);
    const lit = [...walk(root)].filter((n) => n.localName === 'circle' && n.className === 'det lit');
    assert.equal(lit.length, 2);
  });
});

// ---- Basis toggle (U7.9) ----

// Catches: fails if the toggle leaves any results source of the hero or Levels 3-5 on the
// bit-flip file (for example the error budget, the crosstalk scan or Stage 4), or if the
// phase-flip memory reads a file other than its *_x counterpart.
test('the phase-flip memory swaps every results source to its *_x counterpart', () => {
  const zFiles = { 'trapped-ion': stage2v2, superconducting: stage3v2 };
  const xFiles = { 'trapped-ion': stage2x, superconducting: stage3x };
  for (const p of HERO_PLATFORMS) {
    assert.equal(heroResults(p, 'Z'), zFiles[p.id]);
    assert.equal(heroResults(p, 'X'), xFiles[p.id]);
  }
  for (const p of PLATFORMS) {
    assert.deepEqual(resultsFor(p, 'X'), naiveResults(xFiles[p.id]), `${p.id} curves`);
    assert.equal(budgetFor(p, 'X'), xFiles[p.id], `${p.id} budget`);
    assert.equal(budgetFor(p, 'Z'), zFiles[p.id]);
    assert.notDeepEqual(resultsFor(p, 'X').series.map((s) => s.pL), resultsFor(p, 'Z').series.map((s) => s.pL));
  }
  assert.equal(level5Source('Z'), SRC_V2);
  assert.equal(level5Source('Z').stage4, stage4v2);
  const x = level5Source('X');
  assert.equal(x.stage4, stage4x);
  for (const p of x.platforms) {
    assert.ok(p.results.series.length > 0);
    assert.ok(p.results.series.every((s) => xFiles[p.id].series.includes(s)), `${p.id} level 5 series from the X file`);
  }
  // The X Stage 4 has no tauLog of its own, so the enlarged trade-off points come from the X
  // results' optima: still one per (arm, d) with a perRound value.
  assert.ok(tradeoffOptions('hard', x).points.length > 0);
  assert.deepEqual(budgetOptions(x).categories.map((c) => c.segments.find((s) => s.name.startsWith('Idle')).value),
    x.platforms.map((p) => stage4x.platforms[p.id].budgetAtOptimum.idle));
});

// Catches: fails if the basis can leave the bit-flip memory while FEATURES.phaseFlip is off
// (the toggle is not on the page then), or if setBasis accepts an unknown basis.
test('without FEATURES.phaseFlip the basis stays Z', () => {
  withDom({ phaseFlip: false }, () => {
    setBasis('X');
    assert.equal(currentBasis(), 'Z');
    assert.equal(memoryTag('X'), '');
    setBasis('Z');
  });
  assert.throws(() => setBasis('Y'), /unknown basis/);
});

// Mounts the hero and Levels 3-5 with the toggle on, in the given basis, and returns each
// one's visible text and shown notes (read before the basis is restored, because restoring it
// re-renders the mounted levels).
function mountAll(basis) {
  return withDom({ phaseFlip: true, liveRun: false }, () => {
    setBasis(basis);
    try {
      const roots = { hero: new FakeEl('section'), level3: new FakeEl('section'), level4: new FakeEl('section'), level5: new FakeEl('section') };
      mountHero(roots.hero);
      mountLevel3(roots.level3);
      mountLevel4(roots.level4);
      mountLevel5(roots.level5);
      return Object.fromEntries(Object.entries(roots).map(([k, root]) => [k, { text: visibleText(root), notes: notes(root) }]));
    } finally {
      setBasis('Z');
    }
  });
}

// Catches: fails if a visible label in the hero or Levels 3-5 still says "bit flip" in the
// phase-flip memory (or "phase flip" in the bit-flip memory), if a level does not name its
// memory, or if the idle text keeps T1 in the phase-flip memory. The only "bit-flip" text left
// in the phase-flip memory are the notes that say what stays in the bit-flip memory.
test('the toggle swaps every visible "bit flip" label to "phase flip", and T1 to T2', () => {
  const z = mountAll('Z');
  const x = mountAll('X');
  for (const [name, { text: t }] of Object.entries(x)) {
    assert.doesNotMatch(t, /bit[- ]flip/i, `${name} (phase-flip memory) still says bit flip`);
    assert.match(t, /phase-flip memory/, `${name} names the phase-flip memory`);
  }
  for (const [name, { text: t, notes: n }] of Object.entries(z)) {
    assert.doesNotMatch(t, /phase[- ]flip/i, `${name} (bit-flip memory) says phase flip`);
    assert.match(t, /bit-flip memory/, `${name} names the bit-flip memory`);
    assert.deepEqual(n, [], `${name} shows a bit-flip-only note in the bit-flip memory`);
  }
  assert.ok(x.level3.text.includes(BASES.X.idleText));
  assert.doesNotMatch(x.level3.text, /T1/);
  assert.ok(z.level3.text.includes(BASES.Z.idleText));
  // Level 4's stored shots and Level 5's scoreboard stay bit-flip, and say so.
  assert.ok(x.level4.notes.some((n) => /shots above come from the bit-flip memory/.test(n)));
  assert.ok(x.level5.notes.some((n) => /scoreboard/i.test(n)));
});
