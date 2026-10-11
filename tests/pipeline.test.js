import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURES } from '../src/ui/features.js';
import { pipelineStages, mountPipeline, PIPELINE_STAGES } from '../src/ui/pipeline.js';

// The level ids of main.js LEVELS, in selector order, with the write-up last.
const ALL_LEVELS = ['level1', 'level2', 'level3', 'level4', 'learnnoise', 'level5', 'writeup'];

// ---- A minimal DOM, as in tests/writeup.test.js: elements with children, attributes, dataset,
// style, text, listeners and the selectors used here ([data-x="y"], .class, tag names). ----
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
    this.listeners = {};
    this.style = { setProperty(k, v) { this[k] = v; } };
    this.classList = { add: (c) => { this.className = `${this.className} ${c}`.trim(); } };
    const el = this;
    this.dataset = new Proxy({}, {
      set(t, k, v) { t[k] = v; el.attributes[`data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`] = String(v); return true; },
    });
  }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v) { this.replaceChildren(String(v)); }
  set innerHTML(html) { this.html = html; this.replaceChildren(); }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  removeAttribute(k) { delete this.attributes[k]; }
  hasAttribute(k) { return k in this.attributes; }
  appendChild(n) {
    if (n.parentNode) n.parentNode.childNodes.splice(n.parentNode.childNodes.indexOf(n), 1);
    n.parentNode = this;
    this.childNodes.push(n);
    return n;
  }
  append(...ns) { for (const n of ns) this.appendChild(typeof n === 'string' ? new FakeText(n) : n); }
  prepend(n) { this.appendChild(n); this.childNodes.unshift(this.childNodes.pop()); }
  replaceChildren(...ns) {
    for (const c of this.childNodes) c.parentNode = null;
    this.childNodes = [];
    this.append(...ns);
  }
  before(n) {
    const p = this.parentNode;
    p.appendChild(n);
    p.childNodes.splice(p.childNodes.indexOf(this), 0, p.childNodes.pop());
  }
  after(n) {
    const p = this.parentNode;
    p.appendChild(n);
    p.childNodes.splice(p.childNodes.indexOf(this) + 1, 0, p.childNodes.pop());
  }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  click() { for (const fn of this.listeners.click || []) fn({ preventDefault() {} }); }
  focus() {}
  scrollIntoView() {}
  matches(sel) {
    const attr = /^\[([\w-]+)="([^"]*)"\]$/.exec(sel);
    if (attr) return this.attributes[attr[1]] === attr[2];
    if (sel.startsWith('.')) return this.className.split(/\s+/).includes(sel.slice(1));
    return this.localName === sel;
  }
  querySelectorAll(sel) { return [...walk(this)].slice(1).filter((n) => n.matches(sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
}
function* walk(n) {
  yield n;
  for (const c of n.childNodes) if (c.nodeType === 1) yield* walk(c);
}
const fakeDocument = (app) => ({
  readyState: 'complete',
  addEventListener() {},
  getElementById: (id) => (id === 's2s-app' ? app : null),
  createElement: (t) => new FakeEl(t),
  createTextNode: (t) => new FakeText(t),
});
const stageButtons = (root) => root.querySelectorAll('.pipeline-stage');
const current = (root) => stageButtons(root).filter((b) => b.getAttribute('aria-current') === 'step')
  .map((b) => b.querySelector('.pipeline-title').childNodes[0].textContent);

// Catches: fails if a level appears in no stage or in two, if the write-up is put in a stage, or
// if a stage's title, subtitle or order differs from the spec.
test('with every level enabled, the stages cover every level except the write-up exactly once', () => {
  const stages = pipelineStages(ALL_LEVELS);
  assert.deepEqual(stages.map((s) => [s.title, s.subtitle]), [
    ['Signal', 'How a qubit is read'], ['Syndrome', 'Checks in space and time'],
    ['Decoder', 'Finding the likely error'], ['Logical error', 'Is the stored bit safe?'],
  ]);
  const covered = stages.flatMap((s) => s.levels);
  assert.deepEqual([...covered].sort(), ALL_LEVELS.filter((id) => id !== 'writeup').sort());
  assert.equal(new Set(covered).size, covered.length);
  assert.deepEqual(stages[0].levels, ['level3', 'level4']);
});

// Catches: fails if a disabled level stays in its stage, or if a stage whose levels are all off
// is still shown (as a button that would open nothing).
test('disabled levels are skipped and an empty stage is hidden', () => {
  const stages = pipelineStages(['level1', 'level4', 'level5']);
  assert.deepEqual(stages.map((s) => [s.id, s.levels]), [['signal', ['level4']], ['syndrome', ['level1']], ['logical', ['level5']]]);
  assert.deepEqual(pipelineStages([]), []);
  globalThis.document = fakeDocument(null);
  const box = new FakeEl('div');
  mountPipeline(box, { open() {}, onLevelChange() {}, levels: ['level1', 'level4', 'level5'] });
  assert.deepEqual(stageButtons(box).map((b) => b.getAttribute('data-stage')), ['signal', 'syndrome', 'logical']);
  assert.equal(PIPELINE_STAGES.length, 4);
});

// Catches: fails if a stage opens a level other than its first enabled one (with Level 3 off,
// "Signal" must open Level 4, not the missing Level 3), or opens nothing.
test('clicking a stage calls open with its first enabled level', () => {
  globalThis.document = fakeDocument(null);
  const opened = [];
  const box = new FakeEl('div');
  mountPipeline(box, { open: (id) => opened.push(id), onLevelChange() {}, levels: ALL_LEVELS });
  for (const b of stageButtons(box)) b.click();
  assert.deepEqual(opened, ['level3', 'level1', 'learnnoise', 'level5']);
  const box2 = new FakeEl('div');
  mountPipeline(box2, { open: (id) => opened.push(id), onLevelChange() {}, levels: ['level4', 'level5'] });
  stageButtons(box2)[0].click();
  assert.equal(opened.at(-1), 'level4');
});

// Catches: fails if the narrow layout is not two by two (charts.js narrow query) or the wide
// one not four in a row, or if the current stage is marked by colour alone (no underline).
test('four in a row, two by two when narrow; the current stage is underlined', () => {
  globalThis.document = fakeDocument(null);
  const saved = globalThis.matchMedia;
  try {
    for (const [narrow, cols] of [[false, 4], [true, 2]]) {
      globalThis.matchMedia = (q) => ({ matches: narrow && q === '(max-width: 600px)', addEventListener() {} });
      const box = new FakeEl('div');
      let report;
      mountPipeline(box, { open() {}, onLevelChange: (fn) => { report = fn; }, levels: ALL_LEVELS });
      assert.match(box.querySelector('ol').style.gridTemplateColumns, new RegExp(`^repeat\\(${cols},`));
      report('level4');
      const titles = box.querySelectorAll('.pipeline-title');
      assert.deepEqual(titles.map((t) => t.style.textDecoration), ['underline', 'none', 'none', 'none']);
    }
  } finally {
    if (saved === undefined) delete globalThis.matchMedia;
    else globalThis.matchMedia = saved;
  }
});

// The page skeleton of src/ui/index.template.html (no diagnostics); main.js starts at import.
let run = 0;
async function startPage(flags) {
  const saved = { ...FEATURES };
  Object.assign(FEATURES, flags);
  const app = new FakeEl('div');
  const header = new FakeEl('header');
  const h1 = new FakeEl('h1');
  const hero = new FakeEl('section');
  hero.setAttribute('data-s2s', 'hero');
  hero.hidden = true;
  const nav = new FakeEl('nav');
  const selector = new FakeEl('div');
  selector.setAttribute('data-s2s', 'levels');
  nav.appendChild(selector);
  header.append(h1, hero, nav);
  const main = new FakeEl('main');
  main.setAttribute('data-s2s', 'main');
  app.append(header, main);
  // The fake document stays: clicks after start-up create elements too.
  globalThis.document = fakeDocument(app);
  try {
    await import(`../src/ui/main.js?pipeline-${run++}`);
  } finally {
    Object.assign(FEATURES, saved);
  }
  return { app, header, nav, selector };
}

// Catches: fails if the marked stage does not follow a level opened by the selector (the
// listener hook in main.js), if two stages are marked at once, if the map is not between the
// findings strip and the level selector, or if clicking a stage does not open its level.
test('with pipelineNav on, the stage of the open level is marked, whatever opened it', async () => {
  const page = await startPage({ pipelineNav: true, hero: false, findingsStrip: true });
  const kids = page.header.childNodes;
  const at = (cls) => kids.findIndex((n) => n.className === cls);
  assert.ok(at('findings-holder') >= 0 && at('pipeline-holder') === at('findings-holder') + 1);
  assert.equal(kids.indexOf(page.nav), at('pipeline-holder') + 1);
  // The first level (Level 1) is open at start.
  assert.deepEqual(current(page.app), ['Syndrome']);
  page.selector.querySelector('[data-level="level5"]').click();
  assert.deepEqual(current(page.app), ['Logical error']);
  page.selector.querySelector('[data-level="learnnoise"]').click();
  assert.deepEqual(current(page.app), ['Decoder']);
  // A stage click opens its first level in the selector too.
  stageButtons(page.app).find((b) => b.getAttribute('data-stage') === 'signal').click();
  assert.equal(page.selector.querySelector('[data-level="level3"]').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(current(page.app), ['Signal']);
});

// Catches: fails if the map, or any trace of it, is mounted while pipelineNav is off (the page
// must stay exactly as before).
test('with pipelineNav off, nothing is mounted', async () => {
  const page = await startPage({ pipelineNav: false, hero: false, findingsStrip: true });
  assert.equal(page.app.querySelector('.pipeline-holder'), null);
  assert.equal(page.app.querySelector('.pipeline'), null);
  assert.equal(stageButtons(page.app).length, 0);
  assert.ok(page.app.querySelector('.findings-holder'));
});
