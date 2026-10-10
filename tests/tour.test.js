import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTour, TOUR_STOPS, MAX_CAPTION_WORDS, wordCount, TOUR_LABEL } from '../src/ui/tour.js';

// ---- A minimal DOM: elements with after/remove, attributes, style, focus tracking ----
let focused = null;
class FakeText {
  constructor(data) { this.nodeType = 3; this.data = String(data); this.parentNode = null; }
  get textContent() { return this.data; }
}
class FakeEl {
  constructor(tag) {
    this.nodeType = 1;
    this.localName = tag;
    this.childNodes = [];
    this.attributes = {};
    this.parentNode = null;
    this.className = '';
    this.listeners = {};
    this.style = {};
  }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v) { this.childNodes = []; this.append(String(v)); }
  setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'class') this.className = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  removeAttribute(k) { delete this.attributes[k]; }
  appendChild(n) {
    if (n.parentNode) n.parentNode.childNodes.splice(n.parentNode.childNodes.indexOf(n), 1);
    n.parentNode = this;
    this.childNodes.push(n);
    return n;
  }
  append(...ns) { for (const n of ns) this.appendChild(typeof n === 'string' ? new FakeText(n) : n); }
  after(n) {
    if (n.parentNode) n.parentNode.childNodes.splice(n.parentNode.childNodes.indexOf(n), 1);
    const sibs = this.parentNode.childNodes;
    sibs.splice(sibs.indexOf(this) + 1, 0, n);
    n.parentNode = this.parentNode;
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this), 1);
    this.parentNode = null;
  }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  click() { for (const fn of this.listeners.click || []) fn({}); }
  focus() { focused = this; }
  scrollIntoView() {}
}
function setup({ missing = [] } = {}) {
  focused = null;
  const listeners = {};
  const doc = {
    addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
    removeEventListener: (t, fn) => { listeners[t] = (listeners[t] || []).filter((f) => f !== fn); },
    key: (key) => { for (const fn of [...(listeners.keydown || [])]) fn({ key, preventDefault() {} }); },
    listeners,
  };
  globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (t) => new FakeText(t) };
  const page = new FakeEl('div');
  const startButton = new FakeEl('button');
  page.appendChild(startButton);
  const targets = {};
  const prepared = [];
  for (const s of TOUR_STOPS) {
    targets[s.id] = new FakeEl('section');
    page.appendChild(targets[s.id]);
  }
  const stops = TOUR_STOPS.map((s) => ({
    ...s,
    prepare: () => { prepared.push(s.id); return missing.includes(s.id) ? null : targets[s.id]; },
  }));
  const tour = createTour({ stops, startButton, doc });
  return { doc, page, startButton, targets, tour, prepared };
}
const nextOf = (n) => n.parentNode.childNodes[n.parentNode.childNodes.indexOf(n) + 1];
const button = (tour, text) => {
  const walk = (n) => [n, ...(n.childNodes || []).filter((c) => c.nodeType === 1).flatMap(walk)];
  return walk(tour.box).find((n) => n.localName === 'button' && n.textContent === text);
};

// Catches: fails if a stop is added, dropped or reordered against U7.10 (hero, Level 3 budget bar,
// "Learn the noise" step 3, Level 5 scoreboard), or if a caption grows past 25 words.
test('four stops in U7.10 order, each caption at most 25 words', () => {
  assert.deepEqual(TOUR_STOPS.map((s) => s.id), ['hero', 'budget', 'learnnoise', 'scoreboard']);
  for (const s of TOUR_STOPS) assert.ok(wordCount(s.caption) <= MAX_CAPTION_WORDS, `${s.id}: ${wordCount(s.caption)} words`);
  assert.equal(TOUR_LABEL, '3-minute tour');
});

// Catches: fails if the word count is off by one at the limit (a 25-word caption counted as 26,
// or 26 as 25), or counts runs of spaces as words.
test('wordCount: 25 words is within the limit, 26 is not', () => {
  const words = (n) => Array.from({ length: n }, (_, i) => `w${i}`).join('  ');
  assert.equal(wordCount(` ${words(25)} `), 25);
  assert.ok(wordCount(words(25)) <= MAX_CAPTION_WORDS);
  assert.ok(!(wordCount(words(26)) <= MAX_CAPTION_WORDS));
});

// Catches: fails if focus does not move to each stop's target on start, Next and Back, if the
// caption box is not placed right after the target (so Tab would not reach Next), or if the tour
// advances by itself (prepare called for a stop the reader has not asked for).
test('the tour moves focus to each target with Next and Back, without auto-advance', () => {
  const { startButton, targets, tour, prepared } = setup();
  startButton.click();
  assert.equal(tour.index, 0);
  assert.equal(focused, targets.hero);
  assert.equal(nextOf(targets.hero), tour.box);
  assert.equal(targets.hero.getAttribute('tabindex'), '-1');
  assert.match(tour.box.textContent, /Stop 1 of 4/);
  assert.match(tour.box.textContent, /Start here\./);
  assert.deepEqual(prepared, ['hero']);
  for (const [i, id] of [[1, 'budget'], [2, 'learnnoise'], [3, 'scoreboard']]) {
    button(tour, 'Next').click();
    assert.equal(tour.index, i);
    assert.equal(focused, targets[id]);
    assert.equal(nextOf(targets[id]), tour.box);
  }
  // The previous target got its tabindex and outline back.
  assert.equal(targets.hero.getAttribute('tabindex'), null);
  assert.equal(targets.hero.style.outline, '');
  assert.ok(button(tour, 'Finish'));
  button(tour, 'Back').click();
  assert.equal(tour.index, 2);
  assert.equal(focused, targets.learnnoise);
  assert.deepEqual(prepared, ['hero', 'budget', 'learnnoise', 'scoreboard', 'learnnoise']);
});

// Catches: fails if Back at the first stop moves off the page or wraps to the last stop.
test('Back at the first stop stays there', () => {
  const { startButton, targets, tour } = setup();
  startButton.click();
  assert.equal(button(tour, 'Back').getAttribute('aria-disabled'), 'true');
  button(tour, 'Back').click();
  assert.equal(tour.index, 0);
  assert.equal(focused, targets.hero);
});

// Catches: fails if Escape does not end the tour (box left on the page, target still outlined, the
// keydown listener left behind) or if focus is lost instead of returning to the tour button; other
// keys must not end it.
test('Escape ends the tour and returns focus to the tour button', () => {
  const { doc, startButton, targets, tour } = setup();
  startButton.click();
  button(tour, 'Next').click();
  doc.key('Enter');
  assert.equal(tour.active, true);
  doc.key('Escape');
  assert.equal(tour.active, false);
  assert.equal(tour.box.parentNode, null);
  assert.equal(focused, startButton);
  assert.equal(targets.budget.style.outline, '');
  assert.equal(targets.budget.getAttribute('tabindex'), null);
  assert.equal((doc.listeners.keydown || []).length, 0);
  // It can start again from the first stop.
  startButton.click();
  assert.equal(tour.index, 0);
});

// Catches: fails if Finish on the last stop does not end the tour like Escape does.
test('Finish on the last stop ends the tour', () => {
  const { startButton, tour } = setup();
  startButton.click();
  for (let i = 0; i < 3; i++) button(tour, 'Next').click();
  button(tour, 'Finish').click();
  assert.equal(tour.active, false);
  assert.equal(focused, startButton);
});

// Catches: fails if a stop whose target is missing breaks the tour (an exception, or the caption
// never shown); the caption box then sits after the tour button with focus on Next.
test('a stop without a target still shows its caption', () => {
  const { startButton, tour } = setup({ missing: ['hero'] });
  startButton.click();
  assert.equal(nextOf(startButton), tour.box);
  assert.equal(focused, button(tour, 'Next'));
  assert.match(tour.box.textContent, /Stop 1 of 4/);
});
