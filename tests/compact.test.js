import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mountLevel1, SHOT_DETAILS } from '../src/ui/level1.js';
import { mountLevel2 } from '../src/ui/level2.js';
import { mountLevel4 } from '../src/ui/level4.js';
import { mountLevel5, findingRows, compactFindingRows, FINDING_DETAILS, SRC_V2 } from '../src/ui/level5.js';
import { POST_HOC_NOTE } from '../src/ui/findings.js';
import { FEATURES } from '../src/ui/features.js';
import { stage4v2 } from '../src/ui/bridge_data.js';

// ---- A minimal DOM, enough to mount Levels 1, 2, 4 and 5 and read their text ----
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
    this.disabled = false;
    this.dataset = {};
    this.listeners = {};
    this.style = { setProperty(k, v) { this[k] = v; } };
    const self = this;
    this.classList = {
      add(c) { if (!this.contains(c)) self.className = `${self.className} ${c}`.trim(); },
      remove(c) { self.className = self.className.split(/\s+/).filter((x) => x && x !== c).join(' '); },
      contains(c) { return self.className.split(/\s+/).includes(c); },
      toggle(c, on) { if (on ?? !this.contains(c)) this.add(c); else this.remove(c); },
    };
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
  removeAttribute(k) { delete this.attributes[k]; }
  appendChild(n) {
    if (n.parentNode) n.parentNode.childNodes.splice(n.parentNode.childNodes.indexOf(n), 1);
    n.parentNode = this;
    this.childNodes.push(n);
    return n;
  }
  append(...ns) { for (const n of ns) this.appendChild(typeof n === 'string' ? new FakeText(n) : n); }
  prepend(...ns) { const rest = this.childNodes.splice(0); this.append(...ns); for (const n of rest) this.appendChild(n); }
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
const isDetails = (n) => n.localName === 'details';
// Text a reader sees without opening anything: hidden subtrees and every <details> left out.
function visibleText(n) {
  if (n.nodeType === 3) return n.data;
  if (n.hidden || isDetails(n)) return '';
  return n.childNodes.map(visibleText).join(' ');
}
const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;

// Mounts one level with the given flags (live run off, as in sandbox.test.js) and restores them.
function mountWith(mount, flags) {
  const saved = { document: globalThis.document, flags: { ...FEATURES } };
  globalThis.document = {
    createElement: (t) => new FakeEl(t),
    createElementNS: (ns, t) => new FakeEl(t, 'svg'),
    createTextNode: (t) => new FakeText(t),
  };
  Object.assign(FEATURES, { liveRun: false }, flags);
  try {
    const root = new FakeEl('section');
    mount(root);
    return root;
  } finally {
    for (const k of Object.keys(FEATURES)) if (!(k in saved.flags)) delete FEATURES[k];
    Object.assign(FEATURES, saved.flags);
    if (saved.document === undefined) delete globalThis.document;
    else globalThis.document = saved.document;
  }
}
const OFF = { findingsStrip: false, compactText: false };
const ON = { findingsStrip: false, compactText: true };
const SHOT_LEVELS = { level1: mountLevel1, level2: mountLevel2, level4: mountLevel4 };
// The shot sentence: the status line followed by the "Shot details" expander (compact), or the
// status line holding "(stored shot …)" (flags off).
const shotDetails = (root) => [...walk(root)].filter((n) => isDetails(n) && n.childNodes[0]?.textContent === SHOT_DETAILS);
const shotLine = (root) => [...walk(root)].find((n) => hasClass(n, 'status') && /^(Shot|[A-Z][a-z]+ ?[a-z]*, shot) /.test(n.textContent));

// Catches: fails if a visible shot sentence of Level 1, 2 or 4 still says "stored shot" with
// compactText on, if the moved words are not exactly the ones in the title and in the "Shot
// details" expander right after the sentence, or if anything else in the sentence changes
// (the flags-off sentence is the compact one with " (<title>)" put back).
test('compactText: shot sentences of Levels 1, 2 and 4 move "(stored shot …)" to title and details', () => {
  for (const [name, mount] of Object.entries(SHOT_LEVELS)) {
    const off = mountWith(mount, OFF);
    const on = mountWith(mount, ON);
    const lineOff = shotLine(off);
    const lineOn = shotLine(on);
    assert.ok(lineOff && lineOn, `${name}: shot sentence found`);
    assert.equal(shotDetails(off).length, 0, `${name}: no expander with the flag off`);
    const title = lineOn.getAttribute('title');
    assert.match(title, /^stored shot \d+ of [\d,]+(, readout seed \d+)?$/, `${name}: title`);
    assert.doesNotMatch(lineOn.textContent, /stored shot/, `${name}: visible sentence`);
    assert.equal(lineOff.getAttribute('title'), null);
    assert.equal(lineOff.textContent.replace(` (${title})`, ''), lineOn.textContent, `${name}: only the parenthesis moved`);
    assert.ok(lineOff.textContent.includes(` (${title})`), `${name}: flags-off sentence keeps the parenthesis`);
    const [box] = shotDetails(on);
    assert.ok(box && !box.hidden, `${name}: expander shown`);
    const siblings = lineOn.parentNode.childNodes;
    assert.equal(siblings[siblings.indexOf(lineOn) + 1], box, `${name}: expander right after the sentence`);
    assert.equal(box.childNodes[1].textContent, title);
    assert.doesNotMatch(visibleText(on), /stored shot \d/, `${name}: no visible "stored shot i of N"`);
  }
});

// Catches: fails if compactText changes any text of Levels 1, 2 and 4 other than the shot
// sentence, or adds anything other than the "Shot details" expander: the whole level's text
// with the flag on, with the expander dropped and the parenthesis put back, equals the text
// rendered with both new flags off.
test('compactText: Levels 1, 2 and 4 otherwise read exactly as with the flags off', () => {
  for (const [name, mount] of Object.entries(SHOT_LEVELS)) {
    const off = mountWith(mount, OFF);
    const on = mountWith(mount, ON);
    const lineOn = shotLine(on);
    const title = lineOn.getAttribute('title');
    for (const b of shotDetails(on)) b.parentNode.childNodes.splice(b.parentNode.childNodes.indexOf(b), 1);
    const text = (n) => (n.nodeType === 3 ? n.data : n.childNodes.map(text).join('\n'));
    lineOn.textContent = shotLine(off).textContent;
    assert.ok(shotLine(off).textContent.includes(title));
    assert.equal(text(on), text(off), name);
  }
});

const f1Compact = (root) => [...walk(root)].find((n) => hasClass(n, 'l5-finding-compact'));

// Catches: fails if Level 5's F1 shows more than 45 words before "Details and caveats" is
// opened, drops the "Found after seeing the data" badge or the plain sentence, or if the full
// statement and the number lines shown today are not inside the expander.
test('compactText: Level 5 F1 is short, keeps its badge, and holds the full text in details', () => {
  const root = mountWith(mountLevel5, ON);
  const li = f1Compact(root);
  assert.ok(li, 'compact F1 rendered');
  const f1 = stage4v2.findings.find((f) => f.id === 'F1');
  const vis = visibleText(li).replace(/\s+/g, ' ').trim();
  assert.ok(words(vis) <= 45, `${words(vis)} words: ${vis}`);
  assert.ok(vis.includes(POST_HOC_NOTE), vis);
  assert.ok(vis.includes(f1.plain), vis);
  assert.doesNotMatch(vis, /Post hoc/);
  const box = li.childNodes.find((n) => isDetails(n));
  assert.equal(box.childNodes[0].textContent, FINDING_DETAILS);
  const inside = box.textContent;
  assert.ok(inside.includes(f1.statement));
  const row = findingRows(SRC_V2).find((r) => r.id === 'F1');
  for (const line of row.lines) assert.ok(inside.includes(line), line);
  assert.ok(row.lines.some((l) => l.startsWith('In sample')));
  assert.equal(compactFindingRows(SRC_V2)[0].postHoc, true);
});

// Catches: fails if compactText changes what findingRows returns (rule 4: only the rendering
// changes), or if Level 5 changes anywhere outside its findings block.
test('compactText: findingRows identical with the flag on and off; rest of Level 5 unchanged', () => {
  const rows = (flags) => {
    const saved = { ...FEATURES };
    Object.assign(FEATURES, flags);
    try { return findingRows(SRC_V2); } finally { Object.assign(FEATURES, saved); }
  };
  assert.deepEqual(rows(ON), rows(OFF));
  const strip = (root, cls) => {
    const n = [...walk(root)].find((x) => hasClass(x, cls));
    n.parentNode.childNodes.splice(n.parentNode.childNodes.indexOf(n), 1);
    return root.textContent;
  };
  const off = mountWith(mountLevel5, OFF);
  const on = mountWith(mountLevel5, ON);
  assert.ok(![...walk(off)].some((n) => hasClass(n, 'l5-findings-compact')));
  assert.equal(strip(on, 'l5-findings-compact'), strip(off, 'l5-findings'));
});

// Catches: fails if a finding not found after seeing the data gets the badge, or if a finding
// with an empty plain sentence shows nothing (it shows its statement). The boundary: a statement
// that opens "Post hoc" is post hoc; inSample true with another opening is not.
test('compactFindingRows: badge rule and plain fallback', () => {
  const src = {
    ...SRC_V2,
    stage4: { findings: [
      { id: 'F1', statement: 'Post hoc: x', inSample: true, plain: '' },
      { id: 'F2', statement: 'Pre-registered: y', inSample: true, plain: 'P2' },
    ] },
  };
  const [a, b] = compactFindingRows(src);
  assert.equal(a.postHoc, true);
  assert.equal(a.plain, 'Post hoc: x');
  assert.equal(a.short, null);
  assert.equal(b.postHoc, false);
  assert.equal(b.plain, 'P2');
});
