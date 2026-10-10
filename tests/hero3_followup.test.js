import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURES } from '../src/ui/features.js';
import { mountHero3, GUESS_AGAIN_LABEL } from '../src/ui/hero3.js';
import { HERO_PLATFORMS, heroResults, heroCurves, heroOptima, bandInfo, HERO_DECODER } from '../src/ui/hero.js';
import {
  STEP_LABELS, LOCK_LABEL, NEXT_LABEL, CHART_LABELS, MODE_LABELS, guessVerdict, twistData,
} from '../src/ui/bridge_hero3.js';
import * as heroText from '../src/ui/hero3_text.js';

// UX1-H follow-up: the guess starts at the shortest readout time, one guess per platform, and
// the keyboard, values-table and reduced-motion checks of the v3 hero. Structure and contract use
// only, not wording, so these pass with the stub and with the real text module.

// ---- The same minimal DOM as tests/hero3.test.js. ----
let focused = null;
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
    this.checked = false;
    this.value = '';
    this.listeners = {};
    this.style = { setProperty(k, v) { this[k] = v; } };
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
  getAttribute(k) { return k === 'class' && !(k in this.attributes) && this.className ? this.className : (this.attributes[k] ?? null); }
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
  fire(type) { for (const fn of this.listeners[type] || []) fn({ preventDefault() {} }); }
  click() { this.fire('click'); }
  focus() { focused = this; }
  scrollIntoView() {}
  createTHead() { return this.appendChild(new FakeEl('thead')); }
  createTBody() { return this.appendChild(new FakeEl('tbody')); }
  insertRow() { return this.appendChild(new FakeEl('tr')); }
  insertCell() { return this.appendChild(new FakeEl('td')); }
}
function* walk(n) {
  yield n;
  for (const c of n.childNodes || []) if (c.nodeType === 1) yield* walk(c);
}
const all = (root, pred) => [...walk(root)].filter(pred);
const hasClass = (n, c) => n.className.split(/\s+/).includes(c);
const steps = (root) => all(root, (n) => hasClass(n, 'hero3-step'));
const visibleStep = (root) => steps(root).findIndex((s) => !s.hidden);
const buttonIn = (root, text) => all(root, (n) => n.localName === 'button' && n.textContent === text)[0];
const radio = (root, name, value) => all(root, (n) => n.localName === 'input' && n.attributes.name === name && n.attributes.value === value)[0];
const choose = (input) => { input.checked = true; input.fire('change'); };
const slider = (root) => all(root, (n) => n.localName === 'input' && n.attributes.type === 'range')[0];
const byClass = (root, c) => all(root, (n) => hasClass(n, c))[0];
const lineLabels = (step) => all(step, (n) => hasClass(n, 'vline-label')).map((n) => n.textContent);
const guessX = (step) => all(step, (n) => hasClass(n, 'vline-label') && n.textContent === CHART_LABELS.guess).map((n) => n.attributes.x)[0];

// Mounts the v3 hero with heroV3 on, a fake document and an optional matchMedia; restores all three.
function withHero(fn, { matchMedia = undefined, text = {} } = {}) {
  const saved = { document: globalThis.document, matchMedia: globalThis.matchMedia, flag: FEATURES.heroV3 };
  globalThis.document = {
    createElement: (t) => new FakeEl(t),
    createElementNS: (ns, t) => new FakeEl(t),
    createTextNode: (t) => new FakeText(t),
  };
  if (matchMedia) globalThis.matchMedia = matchMedia;
  FEATURES.heroV3 = true;
  focused = null;
  try {
    const root = new FakeEl('section');
    mountHero3(root, { goDeeper: () => {}, openLearnNoise: () => {}, text });
    return fn(root);
  } finally {
    FEATURES.heroV3 = saved.flag;
    if (saved.document === undefined) delete globalThis.document;
    else globalThis.document = saved.document;
    if (saved.matchMedia === undefined) delete globalThis.matchMedia;
    else globalThis.matchMedia = saved.matchMedia;
  }
}

function caseOf(platformId) {
  const p = HERO_PLATFORMS.find((q) => q.id === platformId);
  const res = heroResults(p, 'Z');
  const curves = heroCurves(res, HERO_DECODER);
  const band = bandInfo(heroOptima(res, curves.decoder), { grid: curves.tau });
  return { curves, band };
}

// Catches: fails if the guess starts anywhere but the shortest readout time, which on trapped ion
// (the grid's geometric middle, 20 µs, lies inside the code's-best range) let a reader who never
// dragged be told "inside". Non-vacuous on the real data: index 0 is "below", the middle is not.
test('trapped ion: the guess starts at index 0, and Lock in without moving is "below"', () => {
  const { curves, band } = caseOf('trapped-ion');
  assert.equal(guessVerdict(curves.tau[0], band).kind, 'below');
  withHero((root) => {
    choose(radio(root, 'hero3-platform', 'trapped-ion'));
    assert.equal(slider(root).value, '0');
    buttonIn(root, LOCK_LABEL).click();
    assert.equal(visibleStep(root), 1);
    assert.equal(byClass(root, 'hero3-verdict').textContent, guessVerdict(curves.tau[0], band).text);
    assert.ok(lineLabels(steps(root)[1]).includes(CHART_LABELS.guess));
  });
});

// Catches: fails if one platform's guess is shown (line or verdict) on the other platform, or if
// switching back loses or changes the placed guess. Superconducting's guess is moved off index 0
// first, so "unchanged" is not the default.
test('one guess per platform: no guess line or verdict where none is placed; it returns unchanged', () => {
  withHero((root) => {
    slider(root).value = '3';
    slider(root).fire('input');
    buttonIn(root, LOCK_LABEL).click();
    const s2 = steps(root)[1];
    const verdict = byClass(root, 'hero3-verdict').textContent;
    const x = guessX(s2);
    assert.ok(x !== undefined && verdict.length > 0);
    const { curves, band } = caseOf('superconducting');
    assert.equal(verdict, guessVerdict(curves.tau[3], band).text);

    choose(radio(root, 'hero3-platform', 'trapped-ion'));
    assert.equal(visibleStep(root), 1);
    assert.ok(!lineLabels(s2).includes(CHART_LABELS.guess), 'guess line on trapped ion');
    assert.ok(lineLabels(s2).includes(CHART_LABELS.codeBest), 'the reveal still shows the code\'s best');
    assert.equal(byClass(root, 'hero3-verdict').textContent, '');
    const again = buttonIn(root, GUESS_AGAIN_LABEL);
    assert.ok(again && !again.parentNode.hidden, 'GUESS_AGAIN_LABEL button');

    choose(radio(root, 'hero3-platform', 'superconducting'));
    assert.equal(byClass(root, 'hero3-verdict').textContent, verdict);
    assert.equal(guessX(s2), x);
    assert.equal(buttonIn(root, GUESS_AGAIN_LABEL).parentNode.hidden, true);
  });
});

// Catches: fails if the "make your own guess" button leaves the reader in step 2, switches the
// platform, or does not put focus on step 1's heading.
test('the GUESS_AGAIN_LABEL button goes to step 1 on the current platform', () => {
  withHero((root) => {
    buttonIn(root, LOCK_LABEL).click();
    choose(radio(root, 'hero3-platform', 'trapped-ion'));
    buttonIn(root, GUESS_AGAIN_LABEL).click();
    assert.equal(visibleStep(root), 0);
    assert.equal(focused?.textContent, STEP_LABELS[0]);
    assert.equal(radio(root, 'hero3-platform', 'trapped-ion').checked, true);
    const { curves } = caseOf('trapped-ion');
    assert.equal(slider(root).max, String(curves.tau.length - 1));
    assert.equal(slider(root).value, '0');
  });
});

// Catches: fails if a chart in any step lacks its "Chart values as a table" expander, or if the
// table leaves out a plotted point (one row per grid point and series; one per decoding mode).
test('every chart in the three steps has a values table with a row per plotted point', () => {
  withHero((root) => {
    const { curves } = caseOf('superconducting');
    const n = curves.tau.length;
    const tableOf = (step) => {
      const figs = all(step, (n2) => n2.localName === 'figure');
      assert.equal(figs.length, 1);
      const det = all(figs[0], (d) => d.localName === 'details')[0];
      assert.ok(det, 'details');
      assert.equal(det.childNodes[0].localName, 'summary');
      assert.equal(det.childNodes[0].textContent, 'Chart values as a table');
      return all(det, (r) => r.localName === 'tr' && r.parentNode.localName === 'tbody').map((r) => r.childNodes[0].textContent);
    };
    const count = (rows, name) => rows.filter((r) => r === name).length;
    const t1 = tableOf(steps(root)[0]);
    assert.equal(count(t1, CHART_LABELS.readout), n);
    buttonIn(root, LOCK_LABEL).click();
    const t2 = tableOf(steps(root)[1]);
    assert.equal(count(t2, CHART_LABELS.readout), n);
    assert.equal(count(t2, CHART_LABELS.logical), n);
    buttonIn(root, NEXT_LABEL).click();
    const t3 = tableOf(steps(root)[2]);
    if (twistData()) assert.deepEqual(t3, [MODE_LABELS.hard, MODE_LABELS.soft]);
  });
});

// Catches: fails if a control in any step is a clickable element that the keyboard cannot reach
// (a div or span with a click handler, or a positive tabindex), or if the slider is not a native
// range input on the grid's indices, which the browser moves one step per arrow key (simulated
// here as the value one higher plus an input event).
test('keyboard: every control is a native button, radio, range input or link; the slider follows the arrow keys', () => {
  withHero((root) => {
    buttonIn(root, LOCK_LABEL).click();
    choose(radio(root, 'hero3-platform', 'trapped-ion'));
    buttonIn(root, NEXT_LABEL).click();
    const controls = all(root, (n) => Object.keys(n.listeners).length > 0);
    assert.ok(controls.length > 0);
    for (const c of controls) {
      const ok = c.localName === 'button' || (c.localName === 'input' && ['radio', 'range'].includes(c.attributes.type))
        || (c.localName === 'a' && c.attributes.href);
      assert.ok(ok, `${c.localName} ${JSON.stringify(c.attributes)} is not a native control`);
      if (c.localName === 'button') assert.equal(c.attributes.type, 'button');
    }
    for (const n of all(root, (e) => e.attributes.tabindex !== undefined)) {
      assert.ok(Number(n.attributes.tabindex) <= 0, `tabindex ${n.attributes.tabindex}`);
    }
    // Back to step 1 on trapped ion; ArrowRight on the slider, then ArrowLeft back.
    buttonIn(root, GUESS_AGAIN_LABEL).click();
    assert.equal(visibleStep(root), 0);
    const s = slider(root);
    assert.equal(s.attributes.step, '1');
    assert.equal(s.attributes.min, '0');
    assert.equal(s.listeners.keydown, undefined, 'no key handler overrides the native arrows');
    const before = guessX(steps(root)[0]);
    s.value = String(Number(s.value) + 1);
    s.fire('input');
    assert.equal(s.value, '1');
    assert.notEqual(guessX(steps(root)[0]), before);
    s.value = String(Number(s.value) - 1);
    s.fire('input');
    assert.equal(s.value, '0');
    assert.equal(guessX(steps(root)[0]), before);
  });
});

// Catches: fails if any element in the three steps carries a transition or an animation (inline
// style or SVG animate element) while the reader asks for reduced motion.
test('prefers-reduced-motion: no transition or animation anywhere in the three steps', () => {
  const matchMedia = (q) => ({ matches: q.includes('prefers-reduced-motion: reduce'), addEventListener() {} });
  withHero((root) => {
    const check = () => {
      for (const n of walk(root)) {
        assert.ok(!['animate', 'animatetransform', 'animatemotion', 'set'].includes(n.localName), n.localName);
        const styles = [...Object.keys(n.style), String(n.attributes.style ?? '')].join(' ');
        assert.ok(!/transition|animation/i.test(styles), `${n.localName}: ${styles}`);
      }
    };
    check();
    buttonIn(root, LOCK_LABEL).click();
    check();
    buttonIn(root, NEXT_LABEL).click();
    check();
  }, { matchMedia });
});

// Addendum. Catches: fails if a null twistFootnote (hero3_text.js returns null when the held-out
// distances are missing or do not match pointsPerDecoder) shows an empty footnote or the word
// "null". Non-vacuous: the same data with its distances gives a footnote string, without them null.
test('twist footnote: hidden when twistFootnote returns null, and no "null" on the page', () => {
  const full = heroText.twistData();
  assert.ok(full && full.distances, 'the real twistData carries distances');
  assert.equal(typeof heroText.twistFootnote(full), 'string');
  const { distances, ...noDistances } = full;
  assert.equal(heroText.twistFootnote(noDistances), null);
  withHero((root) => {
    buttonIn(root, LOCK_LABEL).click();
    buttonIn(root, NEXT_LABEL).click();
    const s3 = steps(root)[2];
    assert.ok(all(s3, (n) => n.localName === 'figure').length === 1, 'the twist chart still shows');
    const foot = all(s3, (n) => hasClass(n, 'hero3-twist-footnote'));
    assert.ok(foot.every((f) => f.hidden && f.textContent === ''), 'footnote shown');
    assert.ok(!/null/.test(root.textContent), 'the text "null" is rendered');
  }, { text: { twistData: () => noDistances, twistFootnote: heroText.twistFootnote, twistCaption: heroText.twistCaption } });
  // With the distances the footnote shows.
  withHero((root) => {
    buttonIn(root, LOCK_LABEL).click();
    buttonIn(root, NEXT_LABEL).click();
    const f = byClass(steps(root)[2], 'hero3-twist-footnote');
    assert.equal(f.hidden, false);
    assert.equal(f.textContent, heroText.twistFootnote(full));
  }, { text: { twistData: () => full, twistFootnote: heroText.twistFootnote, twistCaption: heroText.twistCaption } });
});
