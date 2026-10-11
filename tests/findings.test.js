import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  findingCards, mountFindings, FINDINGS_HEADING, POST_HOC_NOTE, DEFAULT_SOURCES, isPostHoc,
} from '../src/ui/findings.js';

// The results files, read here directly (not through the bridge) so that the card numbers are
// checked against the files themselves.
const readJson = (f) => JSON.parse(readFileSync(new URL(`../data/results/${f}`, import.meta.url), 'utf8'));
const stage4 = readJson('stage4_comparison.json');
const stage3 = readJson('stage3_sc_dense.json');
const SOURCES = { stage3, stage4 };

const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;
// Every number written in a sentence, in order ("0.71 µs" -> 0.71, "520×" -> 520).
const numbersIn = (s) => (s.match(/\d+(?:\.\d+)?/g) || []).map(Number);
const p3 = (x) => Number(x.toPrecision(3)); // formatTau's three significant figures
const p2 = (x) => Number(x.toPrecision(2));

// Catches: fails if the cards come in another order, lose a target, or if a number in a line
// differs from the results file (a typed-in number, the wrong tauLog row, readout and idle
// swapped in the ratio, or the wrong rounding).
test('findingCards on the real data: F1, F2, F3, each number from the results files', () => {
  const cards = findingCards(SOURCES);
  assert.deepEqual(cards.map((c) => c.id), ['F1', 'F2', 'F3']);
  assert.deepEqual(cards.map((c) => c.target), ['learnnoise-3', 'level3:superconducting', 'level3:trapped-ion']);
  const oos = stage4.findings.find((f) => f.id === 'F1').numbers.outOfSample;
  const n = oos.pointsPerDecoder;
  assert.deepEqual(numbersIn(cards[0].line), [oos.softWorseCount.naive, n, oos.softWorseCount.learned, n]);
  const opt = stage3.optima.tauLog.find((t) => t.d === 3 && t.mode === 'hard' && t.decoder === 'learned');
  assert.deepEqual(numbersIn(cards[1].line), [p3(opt.xMin), p3(opt.lo), p3(opt.hi)]);
  const b = stage4.platforms['trapped-ion'].budgetAtOptimum;
  assert.deepEqual(numbersIn(cards[2].line), [p2(b.readout / b.idle)]);
  // The bridge serves the same files: the page's default sources give the same cards.
  assert.deepEqual(findingCards(DEFAULT_SOURCES), cards);
});

// Catches: fails if a title grows past 8 words or a line past 16, if F1 speaks of "readout
// times" instead of "settings", or if F1 loses its post hoc note while the file marks it post hoc.
test('findingCards: short titles and lines, F1 wording and note', () => {
  for (const c of findingCards(SOURCES)) {
    assert.ok(words(c.title) <= 8, `${c.id} title: ${c.title}`);
    assert.ok(c.line && words(c.line) <= 16, `${c.id} line: ${c.line}`);
  }
  const f1 = findingCards(SOURCES)[0];
  assert.match(f1.line, /settings/);
  assert.doesNotMatch(f1.line, /readout times/);
  assert.equal(isPostHoc(stage4.findings[0]), true);
  assert.equal(f1.note, POST_HOC_NOTE);
});

// Catches: fails if a card with missing data prints "undefined" or NaN instead of showing its
// title only, or if one missing value blanks the other cards. F3's idle exactly 0 has no ratio
// (title only); idle a small step above 0 gives one.
test('findingCards: missing values give a title-only card', () => {
  const noF1 = { stage3, stage4: { ...stage4, findings: [] } };
  const [f1, f2, f3] = findingCards(noF1);
  assert.equal(f1.line, null);
  assert.equal(f1.note, null);
  assert.ok(f2.line && f3.line);
  const budget = (idle) => ({
    stage3,
    stage4: { ...stage4, platforms: { ...stage4.platforms, 'trapped-ion': { budgetAtOptimum: { readout: 1e-3, idle } } } },
  });
  assert.equal(findingCards(budget(0))[2].line, null);
  assert.match(findingCards(budget(1e-5))[2].line, /^Idling is 100× smaller/);
  const noOpt = findingCards({ stage3: { optima: { tauLog: [] } }, stage4 });
  assert.equal(noOpt[1].line, null);
  assert.equal(findingCards({})[0].line, null);
});

// ---- A minimal DOM, enough to mount the strip and press its cards ----
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
    this.dataset = {};
    this.listeners = {};
    this.style = { setProperty(k, v) { this[k] = v; } };
  }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v) { this.replaceChildren(String(v)); }
  setAttribute(k, v) {
    this.attributes[k] = String(v);
    if (k === 'class') this.className = String(v);
    if (k === 'style') for (const m of String(v).matchAll(/grid-template-columns:([^;]+)/g)) this.style.gridTemplateColumns = m[1];
  }
  getAttribute(k) { return this.attributes[k] ?? null; }
  appendChild(n) {
    n.parentNode = this;
    this.childNodes.push(n);
    return n;
  }
  append(...ns) { for (const n of ns) this.appendChild(typeof n === 'string' ? new FakeText(n) : n); }
  replaceChildren(...ns) {
    this.childNodes = [];
    this.append(...ns);
  }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  dispatch(type, ev = {}) { for (const fn of this.listeners[type] || []) fn(ev); }
  click() { this.dispatch('click'); }
}
function* walk(n) {
  yield n;
  for (const c of n.childNodes || []) if (c.nodeType === 1) yield* walk(c);
}
function withDom(fn, { narrow = null } = {}) {
  const saved = { document: globalThis.document, matchMedia: globalThis.matchMedia };
  globalThis.document = { createElement: (t) => new FakeEl(t) };
  if (narrow !== null) globalThis.matchMedia = () => ({ matches: narrow, addEventListener() {} });
  try {
    return fn();
  } finally {
    for (const k of ['document', 'matchMedia']) {
      if (saved[k] === undefined) delete globalThis[k];
      else globalThis[k] = saved[k];
    }
  }
}
const mountStrip = (opts) => {
  const root = new FakeEl('div');
  mountFindings(root, opts);
  return root;
};
const cardButtons = (root) => [...walk(root)].filter((n) => n.localName === 'button');

// Catches: fails if a card is not a single button (so not reachable with Tab), if clicking it or
// pressing Enter on it opens the wrong target or none, if Enter opens twice (the native click is
// not prevented), or if another key opens it.
test('mountFindings: each card is one button; click and Enter call open with its target', () => {
  withDom(() => {
    const calls = [];
    const root = mountStrip({ open: (t) => calls.push(t), sources: SOURCES });
    const btns = cardButtons(root);
    assert.equal(btns.length, 3);
    for (const b of btns) assert.equal(b.attributes.type, 'button');
    const want = findingCards(SOURCES).map((c) => c.target);
    for (const b of btns) b.click();
    assert.deepEqual(calls, want);
    calls.length = 0;
    for (const b of btns) {
      let prevented = 0;
      b.dispatch('keydown', { key: 'Enter', preventDefault: () => { prevented++; } });
      assert.equal(prevented, 1);
      b.dispatch('keydown', { key: 'a', preventDefault: () => { prevented++; } });
      assert.equal(prevented, 1);
    }
    assert.deepEqual(calls, want);
  });
});

// Catches: fails if the heading is missing or reworded, if a card's button loses its title,
// line or note, or if a title-only card still prints an empty line.
test('mountFindings: heading, then title, line and note inside each button', () => {
  withDom(() => {
    const root = mountStrip({ open() {}, sources: SOURCES });
    const h = [...walk(root)].find((n) => n.localName === 'h2');
    assert.equal(h.textContent, FINDINGS_HEADING);
    assert.equal(FINDINGS_HEADING, 'What we found');
    const cards = findingCards(SOURCES);
    cardButtons(root).forEach((b, i) => {
      const c = cards[i];
      assert.equal(b.textContent, `${c.title}${c.line}${c.note ?? ''}`);
    });
    const bare = mountStrip({ open() {}, sources: { stage3, stage4: { ...stage4, findings: [] } } });
    assert.equal(cardButtons(bare)[0].textContent, cards[0].title);
  });
});

// Catches: fails if the cards do not stack into one column under the narrow query of charts.js
// (max-width: 600px), or stay in one column on a wide screen.
test('mountFindings: three columns when wide, one when narrow', () => {
  const cols = (narrow) => withDom(() => {
    const root = mountStrip({ open() {}, sources: SOURCES });
    return [...walk(root)].find((n) => n.className === 'findings-cards').style.gridTemplateColumns;
  }, { narrow });
  assert.match(cols(false), /^repeat\(3,/);
  assert.equal(cols(true), '1fr');
});
