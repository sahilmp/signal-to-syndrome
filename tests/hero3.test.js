import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURES } from '../src/ui/features.js';
import { mountHero3, middleIndex } from '../src/ui/hero3.js';
import {
  HERO_PLATFORMS, heroResults, heroCurves, heroOptima, bandInfo, HERO_DECODER, QUESTION, mountHero,
} from '../src/ui/hero.js';
import {
  STEP_LABELS, LOCK_LABEL, NEXT_LABEL, RESTART_LABEL, CHART_LABELS, DECODER_LABELS,
  guessVerdict, overlapSentence, twistData, twistCaption,
} from '../src/ui/bridge_hero3.js';

// These tests check the structure of the v3 hero and its use of the hero3_text contract (the
// bridge), not the wording, so they pass with the stub and with the real text module.

// ---- A minimal DOM, as in the other UI tests: elements with children, attributes, text,
// hidden, style, listeners, table helpers and focus tracking. ----
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
const visibleSteps = (root) => steps(root).filter((s) => !s.hidden);
const buttonIn = (root, text) => all(root, (n) => n.localName === 'button' && n.textContent === text)[0];
const radio = (root, name, value) => all(root, (n) => n.localName === 'input' && n.attributes.name === name && n.attributes.value === value)[0];
const choose = (input) => { input.checked = true; input.fire('change'); };
const slider = (root) => all(root, (n) => n.localName === 'input' && n.attributes.type === 'range')[0];
const byClass = (root, c) => all(root, (n) => hasClass(n, c))[0];

// Mounts the v3 hero with heroV3 on and a fake document; restores both afterwards.
function withHero(fn, opts = {}) {
  const saved = { document: globalThis.document, flag: FEATURES.heroV3 };
  globalThis.document = {
    createElement: (t) => new FakeEl(t),
    createElementNS: (ns, t) => new FakeEl(t),
    createTextNode: (t) => new FakeText(t),
  };
  FEATURES.heroV3 = true;
  focused = null;
  try {
    const root = new FakeEl('section');
    const calls = { deeper: [], learn: 0 };
    mountHero3(root, { goDeeper: (id) => calls.deeper.push(id), openLearnNoise: () => { calls.learn += 1; }, ...opts });
    return fn(root, calls);
  } finally {
    FEATURES.heroV3 = saved.flag;
    if (saved.document === undefined) delete globalThis.document;
    else globalThis.document = saved.document;
  }
}

// The case the hero computes for a platform in the bit-flip memory, through hero.js.
function caseOf(platformId) {
  const p = HERO_PLATFORMS.find((q) => q.id === platformId);
  const res = heroResults(p, 'Z');
  const curves = heroCurves(res, HERO_DECODER);
  const band = bandInfo(heroOptima(res, curves.decoder), { grid: curves.tau });
  return { curves, band };
}

// Catches: fails if more than one step shows at once, if a step's heading does not carry its
// STEP_LABELS entry, or if focus does not move to the new step's heading on a step change.
test('one step visible at a time, headed by STEP_LABELS[i], focus on the heading', () => {
  withHero((root) => {
    assert.equal(steps(root).length, 3);
    const check = (i) => {
      const vis = visibleSteps(root);
      assert.equal(vis.length, 1, `step ${i}: ${vis.length} visible`);
      const h = all(vis[0], (n) => n.localName === 'h3')[0];
      assert.equal(h.textContent, STEP_LABELS[i]);
      return h;
    };
    check(0);
    buttonIn(root, LOCK_LABEL).click();
    assert.equal(focused, check(1));
    buttonIn(root, NEXT_LABEL).click();
    assert.equal(focused, check(2));
  });
});

// Catches: fails if step 1 gives the answer away: a logical-error series (a second curve) or
// the code's-best mark on the guess chart.
test('step 1 draws the readout curve only, with no code\'s-best mark', () => {
  withHero((root) => {
    const s1 = visibleSteps(root)[0];
    const fig = all(s1, (n) => n.localName === 'figure')[0];
    assert.equal(all(fig, (n) => n.localName === 'polyline').length, 1);
    assert.ok(!fig.textContent.includes(CHART_LABELS.logical), 'logical series on step 1');
    assert.ok(!fig.textContent.includes(CHART_LABELS.codeBest), 'code\'s best on step 1');
    assert.ok(fig.textContent.includes(CHART_LABELS.guess));
    // Every chart has its values table.
    assert.ok(all(fig, (n) => n.localName === 'details' && hasClass(n, 'chart-data')).length === 1);
  });
});

// Catches: fails if the guess does not start at the grid point nearest the grid's geometric
// middle, or if the reveal's verdict and overlap texts are not the contract functions' output for
// the guess and band the hero shows (checked at the start and after moving the slider).
test('lock reveals step 2 with guessVerdict and overlapSentence for the same inputs', () => {
  const { curves, band } = caseOf('superconducting');
  const grid = curves.tau;
  const mid = middleIndex(grid);
  assert.equal(mid, grid.reduce((b, t, i) => (Math.abs(Math.log(t / Math.sqrt(grid[0] * grid.at(-1)))) < Math.abs(Math.log(grid[b] / Math.sqrt(grid[0] * grid.at(-1)))) ? i : b), 0));
  withHero((root) => {
    assert.equal(slider(root).value, String(mid));
    const moved = mid === 0 ? 1 : 0;
    slider(root).value = String(moved);
    slider(root).fire('input');
    buttonIn(root, LOCK_LABEL).click();
    assert.equal(visibleSteps(root)[0], steps(root)[1]);
    assert.equal(byClass(root, 'hero3-verdict').textContent, guessVerdict(grid[moved], band).text);
    assert.equal(byClass(root, 'hero3-overlap').textContent, overlapSentence(band));
    const fig = all(steps(root)[1], (n) => n.localName === 'figure')[0];
    assert.equal(all(fig, (n) => n.localName === 'polyline').length, 2);
    assert.ok(fig.textContent.includes(CHART_LABELS.codeBest));
    assert.ok(fig.textContent.includes(CHART_LABELS.readoutBest));
  });
});

// Catches: fails if the decoder toggle does not swap the caption to twistCaption(decoder, data),
// or if the y axis rescales between the two decoders (it is fixed at twistData().yMax).
test('decoder toggle swaps the caption; the y-axis maximum stays fixed', () => {
  const data = twistData();
  assert.ok(data, 'twistData');
  withHero((root) => {
    buttonIn(root, LOCK_LABEL).click();
    buttonIn(root, NEXT_LABEL).click();
    const s3 = steps(root)[2];
    const svgOf = () => all(s3, (n) => n.localName === 'svg' && n.attributes['data-y-max'] !== undefined)[0];
    const ticks = () => all(svgOf(), (n) => hasClass(n, 'tick')).map((n) => n.textContent).join('|');
    const cap = byClass(s3, 'hero3-twist-caption');
    assert.equal(cap.attributes['aria-live'], 'polite');
    assert.equal(cap.textContent, twistCaption('naive', data));
    assert.equal(Number(svgOf().attributes['data-y-max']), data.yMax);
    const before = ticks();
    choose(radio(root, 'hero3-decoder', 'learned'));
    assert.equal(cap.textContent, twistCaption('learned', data));
    assert.equal(Number(svgOf().attributes['data-y-max']), data.yMax);
    assert.equal(ticks(), before);
    assert.ok(s3.textContent.includes(DECODER_LABELS.learned));
  });
});

// Catches: fails if "Start over" does not return to step 1 or leaves the moved guess (and the
// chosen decoder) in place.
test('restart returns to step 1 and resets the guess', () => {
  withHero((root) => {
    const mid = slider(root).value;
    slider(root).value = '0';
    slider(root).fire('input');
    assert.notEqual(slider(root).value, mid);
    buttonIn(root, LOCK_LABEL).click();
    buttonIn(root, NEXT_LABEL).click();
    choose(radio(root, 'hero3-decoder', 'learned'));
    buttonIn(root, RESTART_LABEL).click();
    assert.equal(visibleSteps(root)[0], steps(root)[0]);
    assert.equal(slider(root).value, mid);
    assert.equal(focused?.textContent, STEP_LABELS[0]);
    assert.equal(radio(root, 'hero3-decoder', 'naive').checked, true);
  });
});

// Catches: fails if the hero does not start on Superconducting, if switching the platform sends
// the reader back to step 1, or if the reveal keeps the other platform's verdict.
test('platform switch keeps the current step and recomputes', () => {
  withHero((root) => {
    assert.equal(radio(root, 'hero3-platform', 'superconducting').checked, true);
    buttonIn(root, LOCK_LABEL).click();
    choose(radio(root, 'hero3-platform', 'trapped-ion'));
    assert.equal(visibleSteps(root)[0], steps(root)[1]);
    const { curves, band } = caseOf('trapped-ion');
    assert.equal(byClass(root, 'hero3-verdict').textContent, guessVerdict(curves.tau[middleIndex(curves.tau)], band).text);
    buttonIn(root, NEXT_LABEL).click();
    choose(radio(root, 'hero3-platform', 'superconducting'));
    assert.equal(visibleSteps(root)[0], steps(root)[2]);
  });
});

// Catches: fails if the v3 hero drops the h2#hero-question the tour's hero stop and the panel's
// aria-labelledby rely on.
test('h2#hero-question holds QUESTION', () => {
  withHero((root) => {
    const h = all(root, (n) => n.localName === 'h2' && n.id === 'hero-question');
    assert.equal(h.length, 1);
    assert.equal(h[0].textContent, QUESTION);
    assert.equal(root.attributes['aria-labelledby'], 'hero-question');
  });
});

// Catches: fails if the step-2 and step-3 links do not call their callbacks, or if a missing
// callback still leaves its control on the page.
test('Go deeper and "See it step by step" call their callbacks; absent callbacks hide them', () => {
  withHero((root, calls) => {
    buttonIn(root, LOCK_LABEL).click();
    all(root, (n) => n.localName === 'a' && hasClass(n, 'hero-deeper'))[0].click();
    assert.deepEqual(calls.deeper, ['superconducting']);
    buttonIn(root, NEXT_LABEL).click();
    const steps3 = all(steps(root)[2], (n) => n.localName === 'button' && n.textContent !== RESTART_LABEL);
    assert.equal(steps3.length, 1);
    steps3[0].click();
    assert.equal(calls.learn, 1);
  });
  withHero((root) => {
    assert.equal(all(root, (n) => hasClass(n, 'hero-deeper')).length, 0);
    assert.equal(all(steps(root)[2], (n) => n.localName === 'button').length, 1);
  }, { goDeeper: null, openLearnNoise: null });
});

// Catches: fails if main.js picks the v3 hero while heroV3 is off (the page must stay as before),
// or keeps the old hero once it is on.
test('main.js mounts mountHero with heroV3 off and mountHero3 with it on', async () => {
  const saved = { document: globalThis.document, flag: FEATURES.heroV3 };
  // readyState "loading" keeps main.js from starting the page on import.
  globalThis.document = { readyState: 'loading', addEventListener() {} };
  try {
    const { heroMount } = await import('../src/ui/main.js');
    FEATURES.heroV3 = false;
    assert.equal(heroMount(), mountHero);
    FEATURES.heroV3 = true;
    assert.equal(heroMount(), mountHero3);
  } finally {
    FEATURES.heroV3 = saved.flag;
    if (saved.document === undefined) delete globalThis.document;
    else globalThis.document = saved.document;
  }
  assert.equal(FEATURES.heroV3, saved.flag);
});
