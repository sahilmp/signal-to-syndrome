import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FEATURES } from '../src/ui/features.js';
import { writeupData } from '../src/ui/bridge_data.js';
import {
  renderMarkdown, renderWriteup, writeupSections, urlAccepted, ALLOWED_HOSTS, WRITEUP_LABEL,
} from '../src/ui/writeup.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mdBytes = readFileSync(join(root, 'docs', 'project_page.md'));
const checkSource = readFileSync(join(root, 'tools', 'release_check.mjs'), 'utf8');
const literal = (name) => new Function(`return ${new RegExp(`const ${name} = (\\[[^\\]]*\\]);`).exec(checkSource)[1]};`)();
const count = (s, re) => (s.match(re) || []).length;

// Catches: fails if docs/project_page.md was edited without rerunning tools/make_writeup.mjs, so
// the page would show an old copy (the release check has the same row).
test('the write-up copy carries the sha256 of the current docs/project_page.md', () => {
  assert.equal(writeupData.source, 'docs/project_page.md');
  assert.equal(writeupData.sha256, createHash('sha256').update(mdBytes).digest('hex'));
});

// Catches: fails if a source comment (with its file names and planning codes) survives into the
// copy, including a comment over several lines, or if Windows line endings remain.
test('no HTML comment and no carriage return survive in the stored markdown', () => {
  assert.ok(mdBytes.toString('utf8').includes('<!--'), 'the source has comments, so the test is not vacuous');
  assert.ok(!writeupData.markdown.includes('<!--'));
  assert.ok(!writeupData.markdown.includes('-->'));
  assert.ok(!writeupData.markdown.includes('\r'));
});

// Catches: fails if the stored copy holds a URL the release check's URL row would reject (the
// JSON is embedded in main.js, which that row scans), or if the write-up's allowlist drifts from
// the row's.
test('the write-up uses the URL row allowlist and its copy holds no rejected URL', () => {
  assert.deepEqual(ALLOWED_HOSTS, literal('ALLOWED_HOSTS'));
  const urls = writeupData.markdown.match(/https?:\/\/[^\s"'`<>()\\]+/gi) || [];
  assert.ok(urls.length > 0);
  for (const u of urls) assert.ok(urlAccepted(u), u);
});

// Catches: fails if source text reaches the page as markup: a script tag in the markdown must
// come out as visible, escaped text, never as an element.
test('renderMarkdown escapes HTML in the source before adding markup', () => {
  const html = renderMarkdown('Before <script>alert(1)</script> after & "quoted" **bold <b>**');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!/<script/i.test(html));
  assert.ok(!html.includes('<b>'));
  assert.ok(html.includes('&amp;') && html.includes('&quot;quoted&quot;'));
  assert.ok(html.includes('<strong>bold &lt;b&gt;</strong>'));
});

// Catches: fails if a "##" section is lost, doubled or reordered, if more than the first section
// starts open, or if the "#" title is not the level's h2.
test('every ## heading becomes exactly one details summary, in order; only the first is open', () => {
  const md = '# Title\n\nIntro **text**.\n\n## One\n\nA.\n\n### Sub\n\nB.\n\n## Two\n\nC.\n\n## Three *x*\n\nD.\n';
  const html = renderWriteup(md);
  assert.deepEqual([...html.matchAll(/<summary>(.*?)<\/summary>/g)].map((m) => m[1]), ['One', 'Two', 'Three <em>x</em>']);
  assert.equal(count(html, /<details /g), 3);
  assert.equal(count(html, /<details [^>]*\bopen\b/g), 1);
  assert.match(html, /^<h2>Title<\/h2>/);
  assert.ok(html.includes('<h3>Sub</h3>'));
  // The real page: one summary per "##" line of docs/project_page.md, in the same order.
  const headings = [...writeupData.markdown.matchAll(/^## (.*)$/gm)].map((m) => m[1].trim());
  const sections = writeupSections(writeupData.markdown).sections;
  assert.ok(headings.length >= 10);
  assert.equal(sections.length, headings.length);
  assert.deepEqual(sections.map((s) => s.summary.replace(/<[^>]+>/g, '')), headings);
  assert.deepEqual(sections.map((s) => s.open), headings.map((_, k) => k === 0));
});

// Catches: fails if a table's header or rows are dropped or merged, or if a cell's pipe split
// goes wrong (each row must have the header's number of cells).
test('a table becomes a <table> with one row per line', () => {
  const md = 'Before.\n\n| A | B |\n|---|---|\n| 1 | **2** |\n| 3 | `4` |\n| 5 | |\n\nAfter.';
  const html = renderMarkdown(md);
  assert.equal(count(html, /<table/g), 1);
  assert.equal(count(html, /<tr>/g), 4);
  assert.equal(count(html, /<th /g), 2);
  assert.equal(count(html, /<td>/g), 6);
  assert.ok(html.includes('<td><strong>2</strong></td>') && html.includes('<td><code>4</code></td>'));
  // The project page has three tables.
  assert.equal(count(renderWriteup(writeupData.markdown), /<table/g), 3);
});

// Catches: fails if a link the URL row would reject becomes an anchor (the page would link off
// the allowlist) or loses its text; the allowed host next to it must still be a link.
test('a link the URL row would reject is rendered as its text only', () => {
  const html = renderMarkdown('See [the paper](https://www.nature.com/articles/x), [arXiv](https://arxiv.org/abs/1) and [README](../README.md).');
  assert.equal(count(html, /<a /g), 1);
  assert.ok(html.includes('<a href="https://arxiv.org/abs/1"'));
  assert.ok(html.includes('the paper') && !html.includes('nature.com'));
  assert.ok(html.includes('README') && !html.includes('README.md'));
  assert.equal(urlAccepted('https://arxiv.org/abs/1'), true);
  assert.equal(urlAccepted('https://www.nature.com/x'), false);
  assert.equal(urlAccepted('javascript:alert(1)'), false);
});

// Catches: fails if the readout-time notation τ*_phys or τ_log is read as emphasis (a stray
// <em> would swallow the text between two of them), or if lists, code and line breaks break.
test('renderMarkdown keeps notation, lists, fenced code, footnotes and line breaks', () => {
  const html = renderMarkdown([
    'At τ*_phys = 0.9 µs and τ*_log, with τ_phys and τ_log; *Figure: x.*', '',
    '- **A:** one', '  - nested', '- two', '', '1. first', '2. second', '',
    '```bash', 'npm <test>', '```', '', 'line one\\', 'line two', '', '¹ A footnote[^2].',
  ].join('\n'));
  assert.equal(count(html, /<em>/g), 1);
  assert.ok(html.includes('τ*_phys = 0.9 µs and τ*_log, with τ_phys and τ_log; <em>Figure: x.</em>'));
  assert.equal(count(html, /<ul>/g), 2);
  assert.equal(count(html, /<ol>/g), 1);
  assert.ok(html.includes('<pre><code>npm &lt;test&gt;</code></pre>'));
  assert.ok(html.includes('line one<br>'));
  assert.ok(html.includes('<p class="writeup-footnote">¹ A footnote<sup>2</sup>.</p>'));
});

// ---- A minimal DOM for running main.js: elements with children, attributes, dataset, text,
// listeners, focus and the selectors main.js uses ([data-x="y"], tag names). ----
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
    return this.localName === sel;
  }
  querySelectorAll(sel) { return [...walk(this)].slice(1).filter((n) => n.matches(sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
}
function* walk(n) {
  yield n;
  for (const c of n.childNodes) if (c.nodeType === 1) yield* walk(c);
}

// The page skeleton of src/ui/index.template.html, without the diagnostics; main.js starts at
// import (readyState "complete"). A query string gives each run its own copy of main.js.
let run = 0;
async function startPage(flags) {
  const saved = { ...FEATURES };
  Object.assign(FEATURES, flags);
  const app = new FakeEl('div');
  const header = new FakeEl('header');
  const h1 = new FakeEl('h1');
  h1.textContent = 'Signal to Syndrome';
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
  // The fake document stays in place: clicks after start-up create elements too. Nothing else in
  // this file reads globalThis.document.
  globalThis.document = {
    readyState: 'complete',
    addEventListener() {},
    getElementById: (id) => (id === 's2s-app' ? app : null),
    createElement: (t) => new FakeEl(t),
    createTextNode: (t) => new FakeText(t),
  };
  try {
    await import(`../src/ui/main.js?writeup-${run++}`);
  } finally {
    Object.assign(FEATURES, saved);
  }
  return { app, header, selector, main };
}
const labels = (selector) => selector.childNodes.map((b) => b.textContent);

// Catches: fails if the write-up entry is missing, not last, or present with the flag off (the
// page must stay exactly as before), or if it does not open through the selector like a level.
test('with writeup on, "Read the full write-up" is the last level; with it off, the selector is unchanged', async () => {
  const off = await startPage({ writeup: false, hero: false, findingsStrip: false });
  const on = await startPage({ writeup: true, hero: false, findingsStrip: false });
  assert.equal(WRITEUP_LABEL, 'Read the full write-up');
  assert.ok(!labels(off.selector).includes(WRITEUP_LABEL));
  assert.deepEqual(labels(on.selector), [...labels(off.selector), WRITEUP_LABEL]);
  const button = on.selector.childNodes.at(-1);
  assert.equal(button.getAttribute('data-level'), 'writeup');
  button.click();
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  const section = on.main.querySelector('[aria-label="Read the full write-up"]');
  assert.ok(section && !section.hidden);
  assert.match(section.childNodes[0].html, /^<h2>Signal to Syndrome<\/h2>/);
});
