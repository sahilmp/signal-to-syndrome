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

// CC-B21 item 5 (changed because the Stage 4 file became final: its sensitivity rows carry no
// C1-C4 verdicts, DECISIONS, Person A, CC-A22). Catches: fails if the "Sensitivity rows" column
// of the verdict table shows anything but "—" for a conclusion that no row carries (it used to
// count "undefined" verdicts), or if it stops counting when rows do carry one. On the real file:
// every conclusion gives "—", and the rows carry none of C1-C6, O4. Non-vacuous: the same
// function on rows that carry C1 gives the exact counts.
test('sensitivityCounts on the real sweep', () => {
  const rows = stage4.sensitivity;
  assert.ok(rows.length > 0);
  for (const id of CONCLUSION_ORDER) {
    assert.ok(rows.every((r) => !(id in r)), `a final sensitivity row carries ${id}`);
    assert.equal(sensitivityColumn(rows, id), '—', id);
  }
  const withC1 = rows.map((r, i) => ({ ...r, C1: i === 0 ? 'refuted' : 'held' }));
  assert.equal(sensitivityColumn(withC1, 'C1'), `held ${rows.length - 1}, refuted 1 (of ${rows.length})`);
  assert.equal(sensitivityColumn(withC1, 'C2'), '—');
});

// ---- Level 5 v2 (U7.7) ----
// (imports are hoisted, so they may sit here)
import {
  tradeoffOptions, scoreboardRows, tornadoRows, tornadoOptions, budgetOptions, gateLayers, roundsPerSecondAt, mountLevel5,
  SRC_V2, PLATFORMS_V2, CONCLUSION_ORDER, notRunRows, PROVISIONAL_TEXT, BASIS_NOTES,
  sensitivityColumn, rowMark, pairedCell, findingRows, NOT_RESOLVED_CHANGE,
} from '../src/ui/level5.js';
import { isResolvedChange, formatChange } from '../src/ui/charts.js';
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

// CC-B21 item 5 (changed because the Stage 4 file became final, with the verdict "not
// applicable", informative: false and observation rows; DECISIONS, Person A, CC-A22). Catches:
// fails if the scoreboard drops, reorders or duplicates a conclusion; shows the wrong badge
// (e.g. "held" for a refuted hypothesis, or colour without the word and icon); shows "?
// undetermined" for C6's "not applicable"; gives C3 (informative: false) a verdict badge instead
// of the grey "outcome fixed by construction"; or gives an observation (an ID starting with "O")
// a verdict badge instead of the neutral "measurement" label, whatever its stored verdict (O4
// keeps "undetermined"). The type is read from the ID prefix: a synthetic "O9" with verdict
// "held" is a measurement too, and the same verdict on "C9" is a badge. Each row shows plain.
test('scoreboard: one row per conclusion, C1–C6 then O4, with the right badge', () => {
  const rows = scoreboardRows();
  assert.deepEqual(rows.map((r) => r.id), CONCLUSION_ORDER);
  const want = {
    C1: '✗ refuted', C2: '✓ held', C3: 'outcome fixed by construction', C4: '? undetermined', C5: '✓ held',
    C6: '∅ not applicable', O4: 'measurement',
  };
  for (const r of rows) {
    const c = stage4v2.conclusions[r.id];
    assert.equal(r.verdict, c.verdict);
    assert.equal(rowMark(r), want[r.id], r.id);
    assert.equal(r.statement, c.statement);
    assert.equal(r.note, c.note);
    assert.equal(r.plain, c.plain, `${r.id} shows plain`);
    assert.deepEqual(r.deviations, c.deviations);
  }
  assert.equal(stage4v2.conclusions.C3.informative, false);
  assert.equal(stage4v2.conclusions.O4.verdict, 'undetermined');
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(byId.C3.badge, null);
  assert.equal(byId.O4.badge, null);
  assert.equal(byId.C6.badge.cls, 'not-applicable');
  // The ID prefix decides, not the verdict or the note.
  const synth = scoreboardRows(synthSrc({
    conclusions: {
      O9: { statement: 'S', verdict: 'held', plain: 'P', informative: true },
      C9: { statement: 'S', verdict: 'held', plain: 'P', informative: true },
    },
  }));
  assert.equal(rowMark(synth.find((r) => r.id === 'O9')), 'measurement');
  assert.equal(rowMark(synth.find((r) => r.id === 'C9')), '✓ held');
});

// CC-B21 item 5. Catches: fails if the scoreboard rows in the page lose the grey labels or the
// badge words (C3, O4, C6), or if the findings are not shown above the scoreboard with F1 first.
test('Level 5 v2: findings above the scoreboard, F1 first, and the labels in the page', () => {
  const root = mountWith(true);
  const all = [...walk(root)];
  const findings = all.find((n) => hasClass(n, 'l5-findings'));
  const board = all.find((n) => hasClass(n, 'l5-scoreboard'));
  assert.ok(findings && board);
  assert.ok(all.indexOf(findings) < all.indexOf(board), 'findings below the scoreboard');
  const first = findings.childNodes[0].textContent;
  assert.ok(first.startsWith(`F1 ${stage4v2.findings.find((f) => f.id === 'F1').statement}`), first);
  assert.match(first, /13 of 26 points with the naive decoder and 0 of 26 with the learned decoder/);
  const rowText = (id) => all.filter((n) => hasClass(n, 'l5-score-row')).map((n) => n.childNodes[0].textContent).find((t) => t.startsWith(`${id} `));
  assert.match(rowText('C3'), /^C3 outcome fixed by construction/);
  assert.match(rowText('O4'), /^O4 measurement/);
  assert.match(rowText('C6'), /^C6 ∅ not applicable/);
  // F1 first even when the file lists another finding before it.
  const f = findingRows(synthSrc({ findings: [{ id: 'F2', statement: 'b' }, { id: 'F1', statement: 'a' }] }));
  assert.deepEqual(f.map((x) => x.id), ['F1', 'F2']);
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

// A53 review item 7; CC-B21 item 5 (changed because the Stage 4 file became final: its six rows
// are γ dark→bright, η and T1, so the χ/2π row checked before no longer exists). Catches: fails
// if a bar of the arm that does not own the parameter is drawn on the real data (those bars are
// zero by construction), if the raw card key is the visible name, or if a final row is missing
// or drawn twice: exactly the five rows with an effect, as three parameters on their own arms.
test('tornado on the real data: only the owning arm, readable names', () => {
  const rows = tornadoRows();
  for (const r of rows) {
    assert.ok(r.bars.length > 0 && r.bars.every((b) => b.arm === r.platform), `${r.label}: ${r.bars.map((b) => b.arm)}`);
  }
  assert.deepEqual(rows.map((r) => r.label).sort(), [
    'Superconducting: T1', 'Superconducting: measurement efficiency η', 'Trapped ion: dark-to-bright leak rate',
  ]);
  assert.deepEqual(rows.flatMap((r) => r.bars.map((b) => `${r.parameter} ${b.scale}`)).sort(),
    ['T1_us 2', 'eta 0.5', 'eta 2', 'gamma_dark_to_bright_per_us 0.5', 'gamma_dark_to_bright_per_us 2']);
  assert.ok(rows.some((r) => r.label === 'Superconducting: measurement efficiency η'));
  assert.ok(!rows.some((r) => /_per_us|_MHz|_us$/.test(r.label)), 'raw parameter key shown');
});

// A53 review item 7; CC-B21 item 5 (changed because the Stage 4 file became final: only
// superconducting T1 × 0.5 is not run, and the wording is now "not run (T2 would exceed 2·T1)").
// Catches: fails if the row without an effect disappears silently or gets the wrong reason
// (T1 = 25 µs gives 2·T1 = 50 < T2 = 77), or if it is missing from the tornado's values table.
// Non-vacuous: T1 × 2 (2·T1 = 200 ≥ 77) has an effect and is not listed.
test('notRunRows: the rows that would break T2 ≤ 2·T1 are listed with the reason', () => {
  const rows = notRunRows();
  assert.deepEqual(rows.map((r) => r.text), ['Superconducting: T1 × 0.5: not run (T2 would exceed 2·T1).']);
  assert.ok(stage4v2.sensitivity.some((r) => r.parameter === 'T1_us' && r.scale === 2 && r.effect));
  const tableRows = tornadoOptions().table.rows.filter((r) => r.includes('not run (T2 would exceed 2·T1)'));
  assert.equal(tableRows.length, 1);
  assert.deepEqual(tableRows[0].slice(0, 3), ['Superconducting: T1', 'Superconducting', '× 0.5']);
});

// CC-B21 item 5. Catches: fails if a paired change whose 95% interval touches 0 is shown as
// resolved (the rule is strict: lo > 0 or hi < 0), or the cell text loses its sign, interval,
// power of ten or tau. Boundary: [−1.9×10⁻⁴, 0] is not resolved; the same interval moved one
// step past 0 is (1e-12 for the rule itself, one shot in 32 000 for the cell text).
test('pairedCell: resolved only when the interval excludes 0 strictly', () => {
  assert.equal(isResolvedChange(-1.9e-4, 0), false);
  assert.equal(isResolvedChange(-1.9e-4, -1e-12), true);
  assert.equal(isResolvedChange(0, 2e-4), false);
  assert.equal(isResolvedChange(1e-12, 2e-4), true);
  const base = { tau_us: 20, d: 3, mode: 'hard', diff: -6.25e-5 };
  assert.equal(pairedCell({ ...base, lo: -1.875e-4, hi: 0 }), NOT_RESOLVED_CHANGE);
  // The same interval moved one step (3.125×10⁻⁵, one shot in 32 000) below 0: resolved.
  assert.equal(pairedCell({ ...base, diff: -9.375e-5, lo: -2.1875e-4, hi: -3.125e-5 }), '−9.38×10⁻⁵ [−21.9, −3.13]×10⁻⁵ at τ = 20 µs, d = 3, hard');
  assert.equal(pairedCell({ tau_us: 0.7, d: 3, mode: 'hard', diff: 0.0056875, lo: 0.0041875, hi: 0.0071875 }),
    '+5.69×10⁻³ [4.19, 7.19]×10⁻³ at τ = 0.7 µs, d = 3, hard');
  assert.equal(formatChange(-0.000625, -0.0010625, -0.0003125), '−6.25×10⁻⁴ [−10.6, −3.13]×10⁻⁴');
});

// CC-B21 item 5. Catches: fails if the tornado's values table misses the paired change against
// the baseline, or resolves a row whose interval includes 0. On the final file exactly three rows
// are resolved, all superconducting: η × 0.5 (+), η × 2 (−) and T1 × 2 (−); ion γ × 0.5 (interval
// ending at 0) and γ × 2 are not.
test('tornado values table: paired change against the baseline, three rows resolved', () => {
  const t = tornadoOptions().table;
  const col = t.columns.length - 1;
  assert.match(t.columns[col], /^Paired change/);
  const cell = (label, scale) => t.rows.find((r) => r[0] === label && r[2] === `× ${scale}`)[col];
  assert.equal(cell('Superconducting: measurement efficiency η', 0.5), '+5.69×10⁻³ [4.19, 7.19]×10⁻³ at τ = 0.7 µs, d = 3, hard');
  assert.equal(cell('Superconducting: measurement efficiency η', 2), '−6.25×10⁻⁴ [−10.6, −3.13]×10⁻⁴ at τ = 0.7 µs, d = 3, hard');
  assert.equal(cell('Superconducting: T1', 2), '−2.44×10⁻³ [−3.81, −1.06]×10⁻³ at τ = 0.7 µs, d = 3, hard');
  assert.equal(cell('Trapped ion: dark-to-bright leak rate', 0.5), NOT_RESOLVED_CHANGE);
  assert.equal(cell('Trapped ion: dark-to-bright leak rate', 2), NOT_RESOLVED_CHANGE);
  const resolved = t.rows.filter((r) => / at τ = /.test(r[col]));
  assert.deepEqual(resolved.map((r) => r[1]), ['Superconducting', 'Superconducting', 'Superconducting']);
  assert.ok(/resampling quantum shots/.test(t.caption));
});

// CC-B21 item 5. Catches: fails if a Stage 4 file with sensitivity null still draws the tornado
// or the "not run" list, or hides the file's sensitivityNote. Non-vacuous: the real file draws
// the tornado and the list.
test('Level 5 v2: sensitivity null hides the tornado and shows sensitivityNote', () => {
  const tornadoTitle = (root) => [...walk(root)].some((n) => n.localName === 'figcaption' && /^Which parameters matter/.test(n.textContent));
  const real = mountWith(true);
  assert.ok(tornadoTitle(real));
  assert.ok([...walk(real)].some((n) => hasClass(n, 'l5-not-run')));
  const saved = { sensitivity: stage4v2.sensitivity, note: stage4v2.sensitivityNote };
  stage4v2.sensitivity = null;
  stage4v2.sensitivityNote = 'No sensitivity run in this file.';
  try {
    const root = mountWith(true);
    assert.equal(tornadoTitle(root), false);
    assert.equal([...walk(root)].some((n) => hasClass(n, 'l5-not-run')), false);
    const note = [...walk(root)].find((n) => hasClass(n, 'l5-sensitivity-note'));
    assert.equal(note?.textContent, 'No sensitivity run in this file.');
  } finally {
    stage4v2.sensitivity = saved.sensitivity;
    stage4v2.sensitivityNote = saved.note;
  }
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

// A53 review item 1 (blocking); CC-B21 item 5 (changed because the Stage 4 file became final,
// provisional: false; the banners are now checked on a synthetic provisional file). Catches:
// fails if Level 5 v2 shows provisional Stage 4 verdicts without a visible banner at the top,
// above the scoreboard and above the tornado chart (and inside "Data"), or if any banner shows
// on the real final file.
test('Level 5 v2: provisional banner while stage4.provisional is true, none when final', () => {
  const banners = (root) => [...walk(root)].filter((n) => hasClass(n, 'l5-provisional'));
  assert.equal(stage4v2.provisional, false);
  assert.equal(banners(mountWith(true)).length, 0);
  const saved = stage4v2.provisional;
  stage4v2.provisional = true;
  try {
    const on = banners(mountWith(true));
    assert.equal(on.length, 4);
    for (const b of on) assert.equal(b.textContent, `⚠ ${PROVISIONAL_TEXT}`);
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

// ---- CC-B21 items 1 and 2: decoder label and intervals on the Level 5 charts ----
import { LEARNED_LABEL } from '../src/ui/level3.js';

// Catches: fails if the per-µs chart draws the Wilson bounds while the results carry cluster
// bounds (in both the curves and the Stage 4 points, which carry loCluster/hiCluster), if the
// trade-off chart does the same, if a caption does not say which interval it shows, or if the
// learned decoder's results lose their out-of-sample label in the chart titles.
test('Level 5 v2 charts: cluster intervals and the learned label', () => {
  const p = PLATFORMS_V2.find((q) => q.id === 'superconducting');
  const o = chartOptions(p, 'hard', 'perRound', SRC_V2);
  const s3 = p.results.series.find((s) => s.mode === 'hard' && s.d === 3);
  const i = 5;
  assert.ok(Math.abs(o.series[0].lo[i] - 0.5 * (1 - (1 - 2 * s3.loCluster[i]) ** (1 / s3.r))) < 1e-15);
  assert.notEqual(s3.loCluster[i], s3.lo[i]);
  const v = stage4v2.platforms.superconducting.perRound.hard.find((u) => u.d === 3);
  const pt = o.points.find((q) => q.name.startsWith('Stage 4, d = 3'));
  assert.deepEqual([pt.lo, pt.hi], [v.loCluster, v.hiCluster]);
  assert.equal(o.intervals, 'Lower and upper bounds: 95% interval, resampling quantum shots.');
  assert.ok(o.title.endsWith(LEARNED_LABEL), o.title);
  const t = tradeoffOptions('hard');
  const c = stage4v2.platforms.superconducting.tradeoff[3].hard;
  const ts = t.series.find((s) => s.arm === 'superconducting' && s.d === 3);
  assert.equal(ts.lo[ts.tau.indexOf(c.tau[0])], c.loCluster[0]);
  const tp = t.points.find((q) => q.arm === 'superconducting' && q.d === 3);
  assert.deepEqual([tp.lo, tp.hi], [v.loCluster, v.hiCluster]);
  assert.equal(t.intervals, 'Lower and upper bounds: 95% interval, resampling quantum shots.');
  assert.ok(t.title.includes(LEARNED_LABEL));
  // The v1 level (flag off): its curves (v1 files) carry no cluster bounds, its Stage 4 points
  // do, and the caption names each.
  assert.equal(chartOptions(PLATFORMS[0], 'hard', 'perRound').intervals,
    'Curves: 95% Wilson interval. Stage 4 points: 95% interval, resampling quantum shots.');
});
