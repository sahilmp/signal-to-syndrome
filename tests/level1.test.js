import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mountLevel1, epsilonForShot, EPS_SCHEDULE, updateScore, newScore, explainShot, describeCorrections,
} from '../src/ui/level1.js';
import { FEATURES } from '../src/ui/features.js';
import { buildGraph } from '../src/core/graph.js';

// A minimal stand-in for the browser DOM, enough for mountLevel1 and charts.js: elements with
// children, attributes, text, classList, style and click listeners. Only used to inspect the
// structure the level builds and to press its buttons.
class FakeText {
  constructor(data) { this.nodeType = 3; this.data = String(data); this.parentNode = null; }
  get textContent() { return this.data; }
}
class FakeEl {
  constructor(tag) {
    this.nodeType = 1;
    this.localName = tag.toLowerCase();
    this.childNodes = [];
    this.attributes = {};
    this.parentNode = null;
    this.className = '';
    this.hidden = false;
    this.disabled = false;
    this.listeners = {};
    this.style = { setProperty(k, v) { this[k] = v; } };
    const self = this;
    this.classList = {
      add(c) { if (!this.contains(c)) self.className = `${self.className} ${c}`.trim(); },
      remove(c) { self.className = self.className.split(/\s+/).filter((x) => x && x !== c).join(' '); },
      contains(c) { return self.className.split(/\s+/).includes(c); },
      toggle(c, on) { if (on) this.add(c); else this.remove(c); },
    };
  }
  get firstChild() { return this.childNodes[0] ?? null; }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v) { this.replaceChildren(String(v)); }
  set innerHTML(html) {
    const tag = /^<(\w+)>/.exec(html)?.[1];
    this.replaceChildren(...(tag ? [new FakeEl(tag)] : []));
  }
  setAttribute(k, v) {
    this.attributes[k] = String(v);
    if (k === 'class') this.className = String(v);
    if (k === 'id') this.id = String(v);
  }
  getAttribute(k) { return this.attributes[k] ?? null; }
  removeAttribute(k) { delete this.attributes[k]; }
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
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  click() { for (const fn of this.listeners.click || []) fn(); }
  focus() {}
}
function* walk(n) {
  yield n;
  for (const c of n.childNodes || []) if (c.nodeType === 1) yield* walk(c);
}
const buttons = (root) => [...walk(root)].filter((n) => n.localName === 'button');
const byText = (root, re) => buttons(root).find((b) => re.test(b.textContent));

// Mounts Level 1 into a fake container with uxV2 on; returns { root, restore }.
function mountGame() {
  const saved = { document: globalThis.document, flag: FEATURES.uxV2 };
  globalThis.document = { createElement: (t) => new FakeEl(t), createElementNS: (ns, t) => new FakeEl(t) };
  FEATURES.uxV2 = true;
  const root = new FakeEl('div');
  mountLevel1(root);
  const restore = () => {
    FEATURES.uxV2 = saved.flag;
    if (saved.document === undefined) delete globalThis.document;
    else globalThis.document = saved.document;
  };
  return { root, restore };
}

// Catches: fails if the data readout (the values the player must infer) is on the page
// before the player answers, in the buttons, the reveal or anywhere else, or if it is not
// shown once they have answered.
test('game: data readouts are not in the DOM before an answer, and are after', () => {
  const { root, restore } = mountGame();
  try {
    const readout = /read [01]|Data readout/;
    assert.doesNotMatch(root.textContent, readout);
    for (const b of buttons(root)) assert.doesNotMatch(b.getAttribute('aria-label') ?? '', readout);
    byText(root, /^No correction$/).click();
    assert.match(root.textContent, /Data qubit 1: read [01]/);
    assert.match(root.textContent, /Data readout: [01] [01] [01]\./);
    // The next shot hides them again.
    byText(root, /^Next shot$/).click();
    assert.doesNotMatch(root.textContent, readout);
  } finally {
    restore();
  }
});

// Catches: fails if epsilon does not step up every three shots (0.01 for shots 1-3, 0.02 for
// 4-6, 0.05 for 7-9), if the tenth shot is not the hardest at 0.12, or if a step lands one shot
// early or late (shot 3 and shot 4 on either side of the first step).
test('epsilon schedule: rises every three shots, tenth shot at 0.12', () => {
  assert.equal(EPS_SCHEDULE.length, 10);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(epsilonForShot), [0.01, 0.01, 0.01, 0.02, 0.02, 0.02, 0.05, 0.05, 0.05, 0.12]);
  assert.equal(epsilonForShot(3), 0.01);
  assert.equal(epsilonForShot(4), 0.02);
  for (let n = 2; n <= 10; n++) assert.ok(epsilonForShot(n) >= epsilonForShot(n - 1), `shot ${n}`);
});

// Catches: fails if the page does not use the schedule (the shot-1 epsilon is not shown, or
// the fourth shot still runs at the first epsilon).
test('game: the page shows the scheduled epsilon for each shot', () => {
  const { root, restore } = mountGame();
  try {
    const eps = () => [...walk(root)].find((n) => n.id === 'l1-eps-out').textContent;
    assert.equal(eps(), '0.01');
    for (let s = 1; s <= 3; s++) {
      byText(root, /^No correction$/).click();
      byText(root, /^Next shot$/).click();
    }
    assert.equal(eps(), '0.02');
    assert.match(root.textContent, /Shot 4 of 10 at ε = 0\.02/);
  } finally {
    restore();
  }
});

// Catches: fails if a miss does not reset the streak, if a decoder miss touches the
// player's streak, or if the best streak is lost when the current one resets.
test('updateScore: player and decoder counts, streak and best streak', () => {
  let s = newScore();
  s = updateScore(s, true, true);
  s = updateScore(s, true, false);
  assert.deepEqual(s, { player: 2, decoder: 1, streak: 2, best: 2 });
  s = updateScore(s, false, true);
  assert.deepEqual(s, { player: 2, decoder: 2, streak: 0, best: 2 });
  s = updateScore(s, true, true);
  assert.deepEqual(s, { player: 3, decoder: 3, streak: 1, best: 2 });
});

// Catches: fails if the score line on the page does not follow the answers (counts and streak).
test('game: the score line counts both players and the streak', () => {
  const { root, restore } = mountGame();
  try {
    byText(root, /^No correction$/).click();
    const line = [...walk(root)].find((n) => n.className === 'score').textContent;
    assert.match(line, /^After 1 of 10 shots: you [01], decoder [01] \(logical value kept\)\. Streak [01], best [01]\.$/);
    const [you, , streak, best] = line.match(/\d+/g).slice(2).map(Number);
    assert.equal(streak, you);
    assert.equal(best, you);
  } finally {
    restore();
  }
});

// Catches: fails if the reason names the wrong data qubit (0-based instead of 1-based), or
// leaves out the checks the flip lit.
test('explainShot: a middle flip names the qubit and both checks it lit', () => {
  const w = explainShot({ hardData: [0, 1, 0], hardAnc: [[1, 1]], logical: 0, d: 3 });
  assert.deepEqual(w.flipped, [1]);
  assert.deepEqual(w.litByFlip, [0, 1]);
  assert.equal(w.sentence, 'Data qubit 2 flipped, which lit checks 1 and 2.');
});

// Catches: fails if an edge flip claims a second check, or a lit check with no flipped
// neighbour is not called a misfire (one-round wording, no round language).
test('explainShot: an edge flip lights one check; a lone lit check misfired', () => {
  const edge = explainShot({ hardData: [1, 1, 1], hardAnc: [[0, 1]], logical: 1, d: 3 });
  assert.deepEqual(edge.flipped, []);
  assert.equal(edge.sentence, 'No data qubit flipped; check 2 misfired.');
  const w = explainShot({ hardData: [1, 0, 0], hardAnc: [[1, 0]], logical: 0, d: 3 });
  assert.equal(w.sentence, 'Data qubit 1 flipped, which lit check 1.');
  const dark = explainShot({ hardData: [1, 0, 0], hardAnc: [[0, 0]], logical: 0, d: 3 });
  assert.equal(dark.sentence, 'Data qubit 1 flipped, but lit no check; check 1 misfired and stayed dark.');
  assert.doesNotMatch(edge.sentence + w.sentence + dark.sentence, /round/);
});

// Catches: fails if the page shows no reason after an answer, or does not highlight the
// flipped qubit (or "No correction") and the checks the reason names.
test('game: after an answer the reason is shown and its qubits and checks are highlighted', () => {
  const { root, restore } = mountGame();
  try {
    byText(root, /^No correction$/).click();
    const reason = [...walk(root)].find((n) => n.className === 'reason');
    assert.ok(reason, 'reason paragraph');
    assert.match(reason.textContent, /^(No data qubit flipped|Data qubits? [0-9, and]+ flipped)/);
    const hl = [...walk(root)].filter((n) => n.classList.contains('reason-hl'));
    assert.ok(hl.length >= 1);
    if (/^No data qubit/.test(reason.textContent)) assert.equal(hl[0].textContent, 'No correction');
    else for (const n of hl) assert.match(n.textContent, /^(Data qubit|Check) \d/);
  } finally {
    restore();
  }
});

// Catches: fails if the one-round decoder answer still uses round language for a misread check.
test('describeCorrections: one-round wording "check j misfired"', () => {
  const g = buildGraph(3, 1);
  const time = g.edges.find((e) => e.kind === 'time' && e.check === 1);
  const [c] = describeCorrections(g, [{ a: 0, b: 'B', edges: [time.id] }], { oneRound: true });
  assert.equal(c.text, 'check 2 misfired');
  const [old] = describeCorrections(g, [{ a: 0, b: 'B', edges: [time.id] }]);
  assert.equal(old.text, 'wrong reading of check 2 in round 1');
});
