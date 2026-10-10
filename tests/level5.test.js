import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLATFORMS, physOf, chartOptions, sig3, numText, isResolved, MIN_ERRORS_RESOLVED, breakEvenParts, unitOf, sensitivityCounts,
} from '../src/ui/level5.js';
import { findMinimum } from '../src/core/optimum.js';
import { stage2, stage3, stage4 } from '../src/ui/bridge_data.js';

const plat = (id) => PLATFORMS.find((p) => p.id === id);
const physLine = (opts) => opts.vlines.find((v) => v.label === 'τ_phys');

// Catches: fails if the Level 5 superconducting chart marks tau_phys at the belief optimum
// (optima.tauPhys, 0.587 µs, A28 item 2) instead of the minimum of the simulated
// assignment error, in either metric or decoding mode.
test('superconducting tau_phys marker is the empirical minimum in every chart', () => {
  const want = findMinimum(stage3.x.values, stage3.assignment.empirical, { logX: true }).xMin;
  assert.notEqual(want, stage3.optima.tauPhys.xMin);
  for (const mode of ['hard', 'soft']) {
    for (const metric of ['perRound', 'perMicrosecond']) {
      assert.equal(physLine(chartOptions(plat('superconducting'), mode, metric)).x, want);
    }
  }
});

// A53 review item 9 (replaces "trapped-ion tau_phys marker stays optima.tauPhys", which the
// review asked to change). Catches: fails if the trapped-ion chart's dashed tau_phys line sits
// at the model's 23.5 µs (optima.tauPhys) instead of the simulated 23.0 µs
// (optima.tauPhysEmpirical) that the hero and C1 quote, in either metric or mode.
test('trapped-ion tau_phys marker is the stored simulated optimum', () => {
  assert.notEqual(stage2.optima.tauPhysEmpirical.xMin, stage2.optima.tauPhys.xMin);
  for (const mode of ['hard', 'soft']) {
    for (const metric of ['perRound', 'perMicrosecond']) {
      assert.equal(physLine(chartOptions(plat('trapped-ion'), mode, metric)).x, stage2.optima.tauPhysEmpirical.xMin);
    }
  }
});

// Catches: fails if the comparison table loses the belief value it quotes beside the
// superconducting tau_phys, or quotes one for the ion.
test('physOf: belief value carried only for the superconducting platform', () => {
  assert.equal(physOf(plat('superconducting')).belief.xMin, stage3.optima.tauPhys.xMin);
  assert.equal(physOf(plat('trapped-ion')).belief, null);
});

// Catches: fails if table numbers keep more than three significant figures (A28 item 6) or
// switch notation at the wrong place: 0.01 is the boundary (plain), one step below it is
// written with a power of ten.
test('sig3: three significant figures, power of ten below 0.01 and from 1000 on', () => {
  assert.equal(numText(sig3(23.4849)), '23.5');
  assert.equal(numText(sig3(0.586604)), '0.587');
  assert.equal(numText(sig3(0.01)), '0.0100');
  assert.equal(numText(sig3(0.00999)), '9.99×10^-3');
  assert.equal(numText(sig3(999)), '999');
  assert.equal(numText(sig3(1000)), '1.00×10^3');
  assert.equal(numText(sig3(9.9999e-5)), '1.00×10^-4');
});

// Catches: fails if the "not resolved" rule fires at the wrong count: exactly
// MIN_ERRORS_RESOLVED errors at the lowest point is resolved, one fewer is not.
test('isResolved: boundary at MIN_ERRORS_RESOLVED errors at the lowest grid point', () => {
  const res = (k) => ({ series: [{ d: 7, mode: 'hard', pL: [0.5, k / 1000, 0.2], n: [1000, 1000, 1000] }] });
  assert.equal(isResolved(res(MIN_ERRORS_RESOLVED), 7, 'hard'), true);
  assert.equal(isResolved(res(MIN_ERRORS_RESOLVED - 1), 7, 'hard'), false);
});

// Catches: fails if the real ion d = 7 optima (3 and 8 errors of 32 000) are shown as
// resolved, or if any other optimum on either platform is marked "not resolved".
test('isResolved on the real results: only ion d = 7 is not resolved', () => {
  const flagged = PLATFORMS.flatMap((p) => [3, 5, 7].flatMap((d) => ['hard', 'soft']
    .filter((m) => !isResolved(p.results, d, m)).map((m) => `${p.id} ${d} ${m}`)));
  assert.deepEqual(flagged, ['trapped-ion 7 hard', 'trapped-ion 7 soft']);
});

// Catches: fails if the break-even text drops the interval or the τ, rounds to other than
// three significant figures, or reorders its parts (fixed input: the v1 ion hard values).
test('breakEvenParts: exact text for a fixed break-even', () => {
  assert.equal(breakEvenParts({ epsBar: 0.2364465, lo: 0.2095594, hi: 0.2666399, tau_us: 1.5620687 }).join(''),
    'ε̄ = 0.236 [0.210 to 0.267] at τ = 1.56 µs');
  assert.equal(breakEvenParts({ epsBar: null, note: 'd = 5 below d = 3 at every grid point' }).join(''),
    'none (d = 5 below d = 3 at every grid point)');
});

// Catches: fails if the soft rows repeat the hard break-even (A28 item 3): on the real
// stage-4 file the ion has a break-even in hard mode and none in soft mode, and the hard
// text carries that file's own ε̄, interval and τ (read from the file, so a re-run of
// Person A's sweep does not break the test).
test('breakEvenParts: per decoding mode from breakEven.byMode', () => {
  const be = stage4.platforms['trapped-ion'].breakEven.byMode;
  const t = (x) => numText(sig3(x));
  assert.equal(breakEvenParts(be.hard).join(''),
    `ε̄ = ${t(be.hard.epsBar)} [${t(be.hard.lo)} to ${t(be.hard.hi)}] at τ = ${t(be.hard.tau_us)} µs`);
  assert.match(breakEvenParts(be.soft).join(''), /^none \(d = 5 below d = 3 at every grid point\)$/);
});

// Catches: fails if parameter-card values lose their units (A28 item 6) or a rate per µs
// is labelled as a time.
test('unitOf: units from the parameter name suffix', () => {
  assert.deepEqual(['R_bright_per_us', 'gamma_bright_to_dark_per_us', 'T1_idle_us', 'kappa_over_2pi_MHz', 'nbar'].map(unitOf),
    ['counts/µs', '/µs', 'µs', 'MHz', '']);
});

// Catches: fails if the verdict table miscounts the sensitivity rows, lists the verdicts
// other than most frequent first, or reads the wrong conclusion column (fixed rows).
test('sensitivityCounts: exact text for fixed rows', () => {
  const rows = ['flips', 'undetermined', 'flips', 'holds', 'flips', 'undetermined']
    .map((v, i) => ({ C1: v, C3: i === 0 ? 'holds' : 'flips' }));
  assert.equal(sensitivityCounts(rows, 'C1'), 'flips 3, undetermined 2, holds 1 (of 6)');
  assert.equal(sensitivityCounts(rows, 'C3'), 'flips 5, holds 1 (of 6)');
  assert.equal(sensitivityCounts([], 'C1'), '—');
});

// Catches: fails if the verdict table miscounts the real sensitivity rows: every count in
// the text equals the number of rows with that verdict, they add up to the row count, and
// no verdict present in the file is left out (counts read from the file, so a re-run of
// Person A's sweep does not break the test).
test('sensitivityCounts on the real sweep', () => {
  const rows = stage4.sensitivity;
  assert.ok(rows.length > 0);
  for (const c of ['C1', 'C3']) {
    const text = sensitivityCounts(rows, c);
    const m = text.match(/^(.*) \(of (\d+)\)$/);
    assert.ok(m, text);
    assert.equal(Number(m[2]), rows.length);
    const shown = new Map(m[1].split(', ').map((p) => {
      const [v, n] = p.split(' ');
      return [v, Number(n)];
    }));
    const want = new Map();
    for (const r of rows) want.set(r[c], (want.get(r[c]) || 0) + 1);
    assert.deepEqual(shown, want);
  }
});

// ---- Level 5 v2 (U7.7) ----
// (imports are hoisted, so they may sit here)
import {
  tradeoffOptions, scoreboardRows, tornadoRows, tornadoOptions, budgetOptions, gateLayers, roundsPerSecondAt, mountLevel5,
  SRC_V2, PLATFORMS_V2, CONCLUSION_ORDER, notRunRows, PROVISIONAL_TEXT, BASIS_NOTES,
} from '../src/ui/level5.js';
import { FEATURES } from '../src/ui/features.js';
import { stage4v2 } from '../src/ui/bridge_data.js';

// A minimal stand-in for the browser DOM, enough for mountLevel5 and charts.js: elements with
// children, attributes, text, tables (createTHead, createTBody, insertRow, insertCell) and
// listeners. Only used to inspect the structure the level builds.
class FakeText {
  constructor(data) { this.nodeType = 3; this.data = String(data); this.parentNode = null; }
  get textContent() { return this.data; }
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
  addEventListener() {}
  focus() {}
  createTHead() { return this.appendChild(new FakeEl('thead')); }
  createTBody() { return this.appendChild(new FakeEl('tbody')); }
  insertRow() { return this.appendChild(new FakeEl('tr')); }
  insertCell() { return this.appendChild(new FakeEl('td')); }
}
function* walk(n) {
  yield n;
  for (const c of n.childNodes || []) if (c.nodeType === 1) yield* walk(c);
}
const hasClass = (n, c) => n.className.split(/\s+/).includes(c);
const within = (n, anc) => { for (let p = n.parentNode; p; p = p.parentNode) if (p === anc) return true; return false; };

// Mounts Level 5 into a fake container with level5v2 set as given, then restores the flag.
function mountWith(v2) {
  const saved = { document: globalThis.document, flag: FEATURES.level5v2 };
  globalThis.document = { createElement: (t) => new FakeEl(t), createElementNS: (ns, t) => new FakeEl(t, 'svg') };
  FEATURES.level5v2 = v2;
  try {
    const root = new FakeEl('div');
    mountLevel5(root);
    return root;
  } finally {
    FEATURES.level5v2 = saved.flag;
    if (saved.document === undefined) delete globalThis.document;
    else globalThis.document = saved.document;
  }
}
const dataExpander = (root) => [...walk(root)].find((n) => n.localName === 'details'
  && n.childNodes[0]?.localName === 'summary' && n.childNodes[0].textContent === 'Data');

// A synthetic stage 4 for the pure functions: one curve whose grid is stored out of order.
const synthSrc = (stage4) => ({ v2: true, stage4, platforms: PLATFORMS_V2, paramsCycle: {}, paramsIon: {}, paramsSc: {} });

// Catches: fails if the trade-off chart merges or drops an (arm, d) curve, draws a curve per
// mode instead of per (arm, d), or leaves a curve's points out of readout-time order (the
// polyline would then zigzag), or pairs a rounds-per-second value with the wrong tau.
test('trade-off chart: one series per (arm, d), points in tau order', () => {
  for (const mode of ['hard', 'soft']) {
    const o = tradeoffOptions(mode);
    const want = PLATFORMS_V2.flatMap((p) => Object.keys(stage4v2.platforms[p.id].tradeoff).map((d) => `${p.id} ${d}`));
    assert.deepEqual(o.series.map((s) => `${s.arm} ${s.d}`).sort(), want.sort());
    assert.equal(new Set(o.series.map((s) => s.name)).size, o.series.length);
    for (const s of o.series) {
      const c = stage4v2.platforms[s.arm].tradeoff[s.d][mode];
      for (let i = 1; i < s.tau.length; i++) assert.ok(s.tau[i] > s.tau[i - 1], `${s.name} tau order at ${i}`);
      s.tau.forEach((t, i) => {
        const j = c.tau.indexOf(t);
        assert.equal(s.x[i], c.roundsPerSecond[j]);
        assert.equal(s.y[i], c.perRound[j]);
      });
    }
  }
});

// Catches: fails if the curve keeps the stored order instead of sorting by tau: the grid
// below is stored as 3, 1, 2 µs and must come out as 1, 2, 3 with its values carried along.
test('trade-off chart: an unsorted stored grid is drawn in tau order', () => {
  const curve = { tau: [3, 1, 2], roundsPerSecond: [30, 10, 20], perRound: [0.3, 0.1, 0.2], lo: [0.25, 0.05, 0.15], hi: [0.35, 0.15, 0.25] };
  const o = tradeoffOptions('hard', synthSrc({ platforms: { 'trapped-ion': { tradeoff: { 3: { hard: curve } } } } }));
  assert.equal(o.series.length, 1);
  assert.deepEqual(o.series[0].tau, [1, 2, 3]);
  assert.deepEqual(o.series[0].x, [10, 20, 30]);
  assert.deepEqual(o.series[0].y, [0.1, 0.2, 0.3]);
  assert.deepEqual(o.series[0].lo, [0.05, 0.15, 0.25]);
});

// Catches: fails if the enlarged tau*_log point uses a wrong rounds-per-second value: on a
// grid point it is the stored value; off the grid it follows T_cyc = fixed + tau
// (fixed 100 µs here: 1e6 / (100 + 50) at tau = 50 µs).
test('roundsPerSecondAt: stored value on the grid, cycle-time rule off it', () => {
  const curve = { tau: [10, 100], roundsPerSecond: [1e6 / 110, 1e6 / 200] };
  assert.equal(roundsPerSecondAt(curve, 100), 1e6 / 200);
  assert.ok(Math.abs(roundsPerSecondAt(curve, 50) - 1e6 / 150) < 1e-9);
  const o = tradeoffOptions('hard');
  assert.equal(o.points.length, o.series.length);
  for (const p of o.points) assert.equal(p.filled, true);
});

// Catches: fails if the cycle time cannot read the sequential-gate expression of U5, reads it
// with the wrong d (d = 5 gives 8 layers, d = 3 gives 4), or accepts an unknown expression.
test('gateLayers: number, "2*(d-1)", and anything else throws', () => {
  assert.equal(gateLayers({ value: 2 }, 5), 2);
  assert.equal(gateLayers({ value: '2*(d-1)' }, 5), 8);
  assert.equal(gateLayers({ value: '2*(d-1)' }, 3), 4);
  assert.throws(() => gateLayers({ value: 'd+1' }, 5), /unknown gate-layer expression/);
});

// Catches: fails if the scoreboard drops, reorders or duplicates a conclusion, or shows the
// wrong badge (e.g. "held" for a refuted hypothesis, or colour without the word and icon).
test('scoreboard: one row per conclusion, C1–C6 then O4, with the right badge', () => {
  const rows = scoreboardRows();
  assert.deepEqual(rows.map((r) => r.id), CONCLUSION_ORDER);
  const want = { held: '✓ held', refuted: '✗ refuted', undetermined: '? undetermined' };
  for (const r of rows) {
    assert.equal(r.verdict, stage4v2.conclusions[r.id].verdict);
    assert.equal(`${r.badge.icon} ${r.badge.text}`, want[r.verdict]);
    assert.equal(r.statement, stage4v2.conclusions[r.id].statement);
    assert.equal(r.note, stage4v2.conclusions[r.id].note);
  }
});

// Catches: fails if an unexpected verdict word (the v1 "holds") is shown as a known badge, a
// missing conclusion row disappears, or an empty plain sentence leaves the row blank.
test('scoreboard: unknown verdicts and missing conclusions are said in words', () => {
  const rows = scoreboardRows(synthSrc({ conclusions: { C1: { statement: 'S1', verdict: 'holds', plain: '' } } }));
  assert.equal(rows.length, CONCLUSION_ORDER.length);
  assert.equal(rows[0].badge.text, 'unknown (holds)');
  assert.equal(rows[0].plain, 'S1');
  assert.equal(rows[1].badge.text, 'not in the results yet');
});

// Catches: fails if the tornado keeps the input order (A, B, C) instead of sorting by the
// largest absolute change (B: |−0.5|, A: 0.3, C: 0.1), ignores a negative change's size, or
// forgets to subtract the baseline (A's ion change at × 0.5 is 0.25 − 0.25 = 0). A's 0.3 is
// its ion change at × 2 (0.55 − 0.25); before A53 review item 7 it came from the
// superconducting bar of this ion parameter, which is no longer drawn (its values, up to 0.3,
// would reorder the rows if they leaked in).
test('tornado: parameters sorted by largest absolute change from the baseline', () => {
  const row = (parameter, scale, ion, sc) => ({ platform: 'trapped-ion', parameter, scale, effect: { perRound_d3_hard: { 'trapped-ion': ion, superconducting: sc } } });
  const src = synthSrc({
    sensitivityBaseline: { effect: { perRound_d3_hard: { 'trapped-ion': 0.25, superconducting: 0 } } },
    sensitivity: [row('A', 0.5, 0.25, 0.3), row('A', 2, 0.55, 0.1), row('B', 0.5, -0.25, 0.9), row('C', 2, 0.35, 0.05)],
  });
  const rows = tornadoRows(src);
  assert.deepEqual(rows.map((r) => r.parameter), ['B', 'A', 'C']);
  assert.ok(Math.abs(rows[0].maxAbs - 0.5) < 1e-12);
  assert.equal(rows[1].bars.find((b) => b.arm === 'trapped-ion' && b.scale === 0.5).change, 0);
  // A53 review item 7 (changed from four bars per parameter, both arms): only the arm that owns
  // the parameter is drawn; the superconducting values above (0.3, 0.1, 0, 0.05) must not appear.
  assert.deepEqual(rows[1].bars.map((b) => `${b.arm} ${b.scale}`), ['trapped-ion 0.5', 'trapped-ion 2']);
  const opts = tornadoOptions(src);
  assert.deepEqual(opts.groups.map((g) => g.label), rows.map((r) => r.label));
});

// A53 review item 7. Catches: fails if a bar of the arm that does not own the parameter is
// drawn on the real data (those bars are zero by construction, e.g. "Superconducting: χ ->
// Trapped ion, change 0"), or if the raw card key is the visible name.
test('tornado on the real data: only the owning arm, readable names', () => {
  const rows = tornadoRows();
  for (const r of rows) {
    assert.ok(r.bars.length > 0 && r.bars.every((b) => b.arm === r.platform), `${r.label}: ${r.bars.map((b) => b.arm)}`);
  }
  assert.ok(rows.some((r) => r.label === 'Superconducting: dispersive shift χ/2π'));
  assert.ok(!rows.some((r) => /_per_us|_MHz|_us$/.test(r.label)), 'raw parameter key shown');
});

// A53 review item 7. Catches: fails if the two superconducting rows without an effect (T1 × 0.5,
// T2 × 2) disappear silently or get the wrong reason: T1 = 25 µs gives 2·T1 = 50 < T2 = 77, and
// T2 = 154 > 2·T1 = 100. Non-vacuous: T2 × 0.5 (38.5 ≤ 100) has an effect and is not listed.
test('notRunRows: the rows that would break T2 ≤ 2·T1 are listed with the reason', () => {
  const rows = notRunRows();
  assert.deepEqual(rows.map((r) => r.text), [
    'Superconducting: T1 × 0.5: not run: would break T2 ≤ 2·T1 (T2 = 77 µs, 2·T1 = 50 µs).',
    'Superconducting: T2 × 2: not run: would break T2 ≤ 2·T1 (T2 = 154 µs, 2·T1 = 100 µs).',
  ]);
  assert.ok(stage4v2.sensitivity.some((r) => r.parameter === 'T2_us' && r.scale === 0.5 && r.effect));
});

// A53 review item 13. Catches: fails if the budget legend names "Crosstalk" plainly although
// the superconducting arm has none by design (its value is 0).
test('budget bars: the crosstalk segment says it is trapped ion only', () => {
  const o = budgetOptions();
  const sc = o.categories.find((c) => c.label.startsWith('Superconducting'));
  const xt = sc.segments.find((s) => s.name.startsWith('Crosstalk'));
  assert.equal(xt.name, 'Crosstalk (trapped ion only)');
  assert.equal(xt.value, 0);
});

// A53 review item 1 (blocking). Catches: fails if Level 5 v2 shows the provisional Stage 4
// verdicts without a visible banner at the top, above the scoreboard and above the tornado chart
// (and inside "Data"), or if the banner stays once the file is final. Non-vacuous: the same
// mount with provisional false has no banner.
test('Level 5 v2: provisional banner while stage4.provisional is true, none when final', () => {
  assert.equal(stage4v2.provisional, true);
  const banners = (root) => [...walk(root)].filter((n) => hasClass(n, 'l5-provisional'));
  const on = banners(mountWith(true));
  assert.equal(on.length, 4);
  for (const b of on) assert.equal(b.textContent, `⚠ ${PROVISIONAL_TEXT}`);
  const saved = stage4v2.provisional;
  stage4v2.provisional = false;
  try {
    assert.equal(banners(mountWith(true)).length, 0);
  } finally {
    stage4v2.provisional = saved;
  }
});

// A53 review item 8. Catches: fails if the phase-flip notes say again that the verdicts come
// from the bit-flip memory only (C1 and C2 pool both bases; C6 and O4 compare them).
test('phase-flip notes: the scoreboard covers both memories', () => {
  assert.equal(BASIS_NOTES.scoreboard, 'The scoreboard covers both memories.');
  assert.equal(BASIS_NOTES.sensitivity, 'The sensitivity rows were run in the bit-flip memory only.');
  for (const t of Object.values(BASIS_NOTES)) assert.ok(!t.includes('no counterpart'));
});

// Catches: fails if the tornado on the results is not sorted by its largest change.
test('tornado on the stage 4 v2 data: largest effect first', () => {
  const rows = tornadoRows();
  assert.ok(rows.length > 0);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].maxAbs >= rows[i].maxAbs);
});

// Catches: fails if a budget bar reads a segment from the wrong field or drops an arm.
test('budget bars: one per arm from budgetAtOptimum', () => {
  const o = budgetOptions();
  assert.equal(o.categories.length, 2);
  o.categories.forEach((c, i) => {
    const b = stage4v2.platforms[PLATFORMS_V2[i].id].budgetAtOptimum;
    assert.deepEqual(c.segments.map((s) => s.value), [b.readout, b.idle, b.crosstalk, b.gate]);
  });
});

// Catches: fails if any chart of Level 5 v2 (trade-off, the two per-µs charts, budget,
// tornado) is drawn without its values table, or fails to draw at all.
test('Level 5 v2: every chart has its values table', () => {
  const root = mountWith(true);
  const all = [...walk(root)];
  assert.equal(all.filter((n) => hasClass(n, 'error')).length, 0, 'a chart failed to draw');
  const figures = all.filter((n) => n.localName === 'figure' && hasClass(n, 'chart'));
  assert.equal(figures.length, 5);
  for (const f of figures) {
    const details = [...walk(f)].find((n) => n.localName === 'details' && hasClass(n, 'chart-data'));
    assert.ok(details, `${f.childNodes[0].textContent}: no values table`);
    const body = [...walk(details)].find((n) => n.localName === 'tbody');
    assert.ok(body && body.childNodes.length > 0, `${f.childNodes[0].textContent}: empty values table`);
  }
  const rows = all.filter((n) => hasClass(n, 'l5-score-row'));
  assert.equal(rows.length, CONCLUSION_ORDER.length);
});

// Catches: fails if an old table (comparison, verdicts, sensitivity, the four parameter
// cards) is left outside the "Data" expander in v2, or if v1 (flag off) changes: there the
// same seven tables stay on the page and no "Data" expander exists.
test('Level 5 v2: the old tables are inside the "Data" expander; v1 unchanged', () => {
  const v2 = mountWith(true);
  const data = dataExpander(v2);
  assert.ok(data, 'no Data expander');
  const tables = [...walk(v2)].filter((n) => hasClass(n, 'l5-table'));
  assert.equal(tables.length, 7);
  for (const t of tables) assert.ok(within(t, data), `${t.childNodes[0]?.textContent} is outside Data`);

  const v1 = mountWith(false);
  assert.equal(dataExpander(v1), undefined);
  assert.equal([...walk(v1)].filter((n) => hasClass(n, 'l5-table')).length, 7);
  assert.equal([...walk(v1)].find((n) => n.localName === 'h2').textContent, 'Level 5: Two platforms');
  assert.equal([...walk(v2)].find((n) => n.localName === 'h2').textContent, 'Level 5: Two readout models, same gates');
  assert.equal(SRC_V2.stage4, stage4v2);
});
