// Tests for src/ui/hero3_text.js (UX1-S): the hero's three-step copy and sentences, on the
// real results. Every expected number is read from the results files here, not typed in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as T from '../src/ui/hero3_text.js';
import {
  guessVerdict, overlapSentence, budgetFor, whySentence, twistData, twistCaption, twistFootnote,
  WHY_SMALL_RATIO, WHY_RIVAL_RATIO,
} from '../src/ui/hero3_text.js';
import { HERO_PLATFORMS, heroResults, heroCurves, heroOptima, bandInfo } from '../src/ui/hero.js';
import { formatTau } from '../src/ui/level3.js';
import { formatNumber } from '../src/ui/charts.js';
import stage4z from '../data/results/stage4_comparison.json' with { type: 'json' };
import stage4x from '../data/results/stage4_comparison_x.json' with { type: 'json' };
import stage3dense from '../data/results/stage3_sc_dense.json' with { type: 'json' };
import holdout from '../data/results/holdout.json' with { type: 'json' };

// The release check's forbidden-text list, read from its source so the two never drift apart.
const releaseSrc = readFileSync(new URL('../tools/release_check.mjs', import.meta.url), 'utf8');
const FORBIDDEN_TEXT = JSON.parse(releaseSrc.match(/const FORBIDDEN_TEXT = (\[[^\]]*\]);/)[1].replace(/'/g, '"'));
const words = (s) => s.split(/\s+/).filter(Boolean).length;
const STAGE4 = { Z: stage4z, X: stage4x };
const PLATFORM_IDS = ['trapped-ion', 'superconducting'];

// The hero's case for one platform, basis and decoder: curves, optima and band (with grid).
function heroCase(platformId, basis, decoder = null) {
  const p = HERO_PLATFORMS.find((u) => u.id === platformId);
  const res = heroResults(p, basis);
  const curves = heroCurves(res, decoder);
  const optima = heroOptima(res, curves.decoder);
  return { res, curves, optima, band: bandInfo(optima, { grid: curves.tau }) };
}
// Every real case: both platforms, both bases, both decoders.
const ALL_CASES = [];
for (const decoder of ['naive', 'learned']) {
  for (const basis of ['Z', 'X']) for (const platformId of PLATFORM_IDS) ALL_CASES.push({ platformId, basis, decoder, ...heroCase(platformId, basis, decoder) });
}

const CONTRACT = {
  STEP_LABELS: 'array', GUESS_PROMPT: 'string', GUESS_SLIDER_LABEL: 'string', LOCK_LABEL: 'string', WHY_SUMMARY: 'string',
  NEXT_LABEL: 'string', TWIST_INTRO: 'string', DECODER_LABELS: 'object', TWIST_TITLE: 'string', MODE_LABELS: 'object',
  STEPS_LABEL: 'string', RESTART_LABEL: 'string', CHART_LABELS: 'object',
  guessVerdict: 'function', overlapSentence: 'function', budgetFor: 'function', whySentence: 'function',
  twistData: 'function', twistCaption: 'function', twistFootnote: 'function',
  WHY_SMALL_RATIO: 'number', WHY_RIVAL_RATIO: 'number',
};

// Catches: fails if a contract name is missing, renamed or of the wrong type, or if the module
// exports a name outside the contract (and the two whySentence thresholds of the amendment).
test('every contract name is exported with the right type, and nothing else', () => {
  for (const [name, type] of Object.entries(CONTRACT)) {
    assert.ok(name in T, `${name} missing`);
    if (type === 'array') assert.ok(Array.isArray(T[name]), name);
    else assert.equal(typeof T[name], type, name);
  }
  assert.deepEqual(Object.keys(T).sort(), Object.keys(CONTRACT).sort());
  assert.deepEqual(T.STEP_LABELS, ['Step 1 of 3: guess', 'Step 2 of 3: reveal', 'Step 3 of 3: the twist']);
  assert.deepEqual(Object.keys(T.DECODER_LABELS).sort(), ['learned', 'naive']);
  assert.deepEqual(Object.keys(T.MODE_LABELS).sort(), ['hard', 'soft']);
  assert.deepEqual(Object.keys(T.CHART_LABELS).sort(), ['codeBest', 'guess', 'logical', 'readout', 'readoutBest']);
  assert.equal(WHY_SMALL_RATIO, 0.1);
  assert.equal(WHY_RIVAL_RATIO, 0.5);
});

// Catches: fails if the superconducting bit-flip case stops being 'coincide' on the dense file,
// or if the overlap sentence drops or misformats tau*_log, tau*_phys or an interval end
// (expected values read from stage3_sc_dense.json optima, learned d = 3 hard).
test('superconducting Z: coincide, and the overlap sentence quotes both optima and the interval', () => {
  const { band } = heroCase('superconducting', 'Z');
  assert.equal(band.kind, 'coincide');
  const row = stage3dense.optima.tauLog.find((t) => t.d === 3 && t.mode === 'hard' && t.decoder === 'learned');
  const phys = stage3dense.optima.tauPhysEmpirical.xMin;
  const s = overlapSentence(band);
  for (const v of [row.xMin, phys, row.lo, row.hi]) assert.ok(s.includes(formatTau(v)), `${formatTau(v)} in ${s}`);
  assert.ok(s.includes('overlap within our uncertainty'));
});

// Catches: fails if overlapSentence mixes up its kinds, keeps an empty bracket when the band has
// no interval, or throws on a missing band.
test('overlapSentence: band, reverse, none, no interval, missing band', () => {
  const band = { kind: 'band', tauLog: 2, x0: 2, x1: 5, ciLo: 1.5, ciHi: 2.5 };
  assert.equal(overlapSentence(band), 'The code’s best (2 µs, 1.5 µs to 2.5 µs) is earlier than the readout’s best (5 µs): idling during readout pulls it in.');
  const rev = { kind: 'reverse', tauLog: 8, x0: 5, x1: 8, ciLo: 7, ciHi: 9 };
  assert.equal(overlapSentence(rev), 'The code’s best (8 µs, 7 µs to 9 µs) is later than the readout’s best (5 µs): the code still gains from listening longer.');
  assert.equal(overlapSentence({ kind: 'none' }), 'These results show no interior optimum to compare.');
  // Replaces 'The code’s best (3 µs) and the readout’s best (3 µs) overlap. Treat them as the same.'
  // because the wording changed after the read-aloud review (both authors).
  assert.equal(overlapSentence({ kind: 'coincide', tauLog: 3, x0: 3, x1: 3, ciLo: null, ciHi: null }), 'The code’s best and the readout’s best are the same here (3 µs).');
  assert.equal(overlapSentence(null), null);
});

// Catches: fails if the trapped-ion cases (Z: idle/readout 0.002; X: 0.022) leave the "smaller"
// branch, or if the ratio shown is not readout / idle from the Stage 4 file through formatNumber,
// or the idle and readout numbers are not the file's through formatNumber.
test('whySentence, trapped ion Z and X: the "smaller" branch with the file ratio', () => {
  for (const basis of ['Z', 'X']) {
    const b = STAGE4[basis].platforms['trapped-ion'].budgetAtOptimum;
    const { curves, band } = heroCase('trapped-ion', basis);
    const s = whySentence({ platformId: 'trapped-ion', basis, curves, band });
    // Replaces Number((b.readout / b.idle).toPrecision(2)) (520, 45) with formatNumber (523, 44.9)
    // because the E17 audit allows only formatNumber rounding when a sentence states no precision.
    const ratio = formatNumber(b.readout / b.idle);
    assert.equal(s, `Idling here is ${ratio}× smaller than the readout error (${formatNumber(b.idle)} against ${formatNumber(b.readout)} per round), too small to move the code’s best.`, basis);
    assert.ok(b.idle / b.readout < WHY_SMALL_RATIO, basis);
  }
});

// Catches: fails if the superconducting cases (idle/readout 1.19 in Z, 0.73 in X; tau*_log below
// tau*_phys) leave the "nudges earlier" branch, or if minPL and maxPL are not the min and max
// of the learned d = 3 hard series at the grid points inside tau*_log's interval (read here
// from the dense results files).
test('whySentence, superconducting Z and X: "nudges earlier" with the valley min and max', () => {
  for (const basis of ['Z', 'X']) {
    const b = STAGE4[basis].platforms.superconducting.budgetAtOptimum;
    const { res, curves, band } = heroCase('superconducting', basis);
    const row = res.optima.tauLog.find((t) => t.d === 3 && t.mode === 'hard' && t.decoder === 'learned');
    const series = res.series.find((u) => u.d === 3 && u.mode === 'hard' && u.decoder === 'learned');
    const inside = res.x.values.map((t, i) => [t, series.pL[i]]).filter(([t]) => t >= row.lo && t <= row.hi).map(([, p]) => p);
    assert.ok(inside.length >= 2, basis);
    assert.ok(row.xMin < res.optima.tauPhysEmpirical.xMin, basis);
    const s = whySentence({ platformId: 'superconducting', basis, curves, band });
    // Replaces "valley is too flat ({minPL} to {maxPL})" with "(logical error {minPL} to {maxPL})"
    // because the wording changed after the read-aloud review (both authors).
    assert.equal(s, `Idling (${formatNumber(b.idle)} per round) rivals the readout error (${formatNumber(b.readout)}) and nudges the code’s best earlier, but the valley is too flat (logical error ${formatNumber(Math.min(...inside))} to ${formatNumber(Math.max(...inside))}) to say how far.`, basis);
  }
});

// Catches: fails if omitting the optional budget does not fall back to budgetFor(platformId,
// basis), i.e. if the default and the explicit file budget give different sentences on any of
// the four real cases.
test('whySentence: omitting budget equals passing budgetFor, on all four real cases', () => {
  for (const basis of ['Z', 'X']) {
    for (const platformId of PLATFORM_IDS) {
      const { curves, band } = heroCase(platformId, basis);
      const implicit = whySentence({ platformId, basis, curves, band });
      const explicit = whySentence({ platformId, basis, curves, band, budget: budgetFor(platformId, basis) });
      assert.equal(typeof implicit, 'string', `${platformId} ${basis}`);
      assert.equal(implicit, explicit, `${platformId} ${basis}`);
    }
  }
});

// Synthetic case for the branches no platform reaches: tau*_log 2 [1, 4], tau*_phys 3.
const SYN_CURVES = { tau: [0.5, 1, 2, 4, 8], logical: { y: [0.5, 0.2, 0.1, 0.3, 0.6] } };
const SYN_BAND = { kind: 'coincide', tauLog: 2, x0: 2, x1: 3, ciLo: 1, ciHi: 4 };
const syn = (idle, band = SYN_BAND) => whySentence({ curves: SYN_CURVES, band, budget: { readout: 1, idle, gate: 0, crosstalk: 0, tau_us: 2 } });

// Catches: fails if a ratio between the two thresholds gets a sentence, if the third branch
// says "earlier" when tau*_log is not below tau*_phys, or if a band that is not 'coincide' or a
// missing budget or interval gets a sentence. Boundaries (non-vacuous): r = 0.1 exactly is null
// and r = 0.05 is "smaller"; r = 0.5 exactly is "rivals" and r = 0.45 is null.
test('whySentence: third branch, thresholds and every null case on synthetic inputs', () => {
  assert.equal(syn(0.3), null);
  assert.equal(syn(0.1), null);
  assert.equal(syn(0.05), 'Idling here is 20× smaller than the readout error (0.05 against 1 per round), too small to move the code’s best.');
  assert.equal(syn(0.45), null);
  // Replaces "too flat (0.1 to 0.3)" with "too flat (logical error 0.1 to 0.3)" (this and the next
  // rivals sentence) because the wording changed after the read-aloud review (both authors).
  assert.equal(syn(0.5), 'Idling (0.5 per round) rivals the readout error (1) and nudges the code’s best earlier, but the valley is too flat (logical error 0.1 to 0.3) to say how far.');
  const later = { kind: 'coincide', tauLog: 3, x0: 2, x1: 3, ciLo: 1, ciHi: 4 };
  assert.equal(syn(0.6, later), 'Idling (0.6 per round) rivals the readout error (1), but the valley is too flat (logical error 0.1 to 0.3) to see where it moves the code’s best.');
  for (const kind of ['band', 'reverse', 'none']) assert.equal(syn(0.6, { ...SYN_BAND, kind }), null, kind);
  assert.equal(syn(0.6, { ...SYN_BAND, ciLo: null }), null);
  assert.equal(syn(0.6, null), null);
  assert.equal(whySentence({ curves: SYN_CURVES, band: SYN_BAND, budget: null }), null);
  assert.equal(whySentence({ platformId: 'flat', basis: 'Z', curves: SYN_CURVES, band: SYN_BAND }), null);
  assert.equal(whySentence(), null);
});

// Catches: fails if no-longer-true wording returns ("as large as", "pulls"), or a why-sentence
// on any real platform, basis or decoder runs past 40 words.
test('whySentence on every real case: no "as large as" or "pulls", at most 40 words', () => {
  let n = 0;
  for (const c of ALL_CASES) {
    const s = whySentence(c);
    if (s === null) continue;
    n += 1;
    assert.ok(!s.includes('as large as') && !s.includes('pulls'), s);
    assert.ok(words(s) <= 40, s);
  }
  assert.ok(n >= 4);
});

// Catches: fails if the guess is compared with the wrong ends, if an exact edge is not inside,
// or if a band with no optimum is not 'none'. Boundaries: 1.5 (the lower end) is inside and 1
// below; 2.5 (the upper end) is inside and 3 above.
test('guessVerdict: below, inside, above, both edges, none', () => {
  const band = { kind: 'band', logLo: 1.5, logHi: 2.5 };
  assert.equal(guessVerdict(1, band).kind, 'below');
  assert.equal(guessVerdict(1, band).text, 'Shorter than the code wants: the reading is still too noisy there.');
  assert.equal(guessVerdict(1.5, band).kind, 'inside');
  assert.equal(guessVerdict(2, band).text, 'Your guess is inside the code’s best range.');
  assert.equal(guessVerdict(2.5, band).kind, 'inside');
  assert.equal(guessVerdict(3, band).kind, 'above');
  // Replaces 'Longer than the code wants: the waiting costs more than it gains.' because past the
  // range the trapped ion loses to optical pumping, not to idling (F3; E17 audit).
  assert.equal(guessVerdict(3, band).text, 'Longer than the code wants: it does better with a shorter readout.');
  assert.doesNotMatch(guessVerdict(3, band).text, /wait|idl/i);
  assert.deepEqual(guessVerdict(2, { kind: 'none' }), { kind: 'none', text: 'These results show no best readout time to compare your guess with.' });
  assert.equal(guessVerdict(2, null), null);
});

// Catches: fails if budgetFor reads the wrong file for a basis or the wrong platform, or
// returns something for an unknown platform or basis.
test('budgetFor equals the Stage 4 files; unknown platform or basis gives null', () => {
  for (const basis of ['Z', 'X']) {
    for (const id of PLATFORM_IDS) {
      const b = STAGE4[basis].platforms[id].budgetAtOptimum;
      assert.deepEqual(budgetFor(id, basis), { readout: b.readout, idle: b.idle, gate: b.gate, crosstalk: b.crosstalk, tau_us: b.tau_us }, `${id} ${basis}`);
    }
  }
  assert.equal(budgetFor('flat', 'Z'), null);
  assert.equal(budgetFor('trapped-ion', 'Y'), null);
});

// Catches: fails if twistData reads other numbers than F1's out-of-sample example (cluster
// bounds as lo/hi), the counts, or yMax; or if the caption's direction disagrees with the paired
// soft-minus-hard interval (naive above 0, learned containing 0); or if the caption and
// footnote do not carry the numbers as formatted.
test('twistData equals F1; caption and footnote carry its numbers', () => {
  const o = stage4z.findings.find((f) => f.id === 'F1').numbers.outOfSample;
  const ex = o.example_d3_tau20;
  const d = twistData();
  for (const dec of ['naive', 'learned']) {
    for (const mode of ['hard', 'soft']) {
      assert.deepEqual(d[dec][mode], { pL: ex[dec][mode].pL, lo: ex[dec][mode].loCluster, hi: ex[dec][mode].hiCluster });
    }
  }
  assert.deepEqual(d.counts, { naive: o.softWorseCount.naive, learned: o.softWorseCount.learned, n: o.pointsPerDecoder });
  assert.equal(d.yMax, Math.max(...['naive', 'learned'].flatMap((k) => [ex[k].hard.hiCluster, ex[k].soft.hiCluster])) * 1.15);
  assert.ok(ex.naive.pairedSoftMinusHard.lo > 0);
  assert.ok(ex.learned.pairedSoftMinusHard.lo <= 0 && ex.learned.pairedSoftMinusHard.hi >= 0);
  // Replaces `${(p * 100).toPrecision(2)}%` (1.0%, 0.49%) with formatNumber (1.02%, 0.491%)
  // because the E17 audit allows only formatNumber rounding when a sentence states no precision.
  const pct = (p) => `${formatNumber(p * 100)}%`;
  // Replaces "{soft}% against {hard}% of stored bits lost." with "{soft}% of stored bits lost,
  // against {hard}% without it." (both captions) because the wording changed after the read-aloud review (both authors).
  assert.equal(twistCaption('naive', d), `Using each reading’s confidence made things worse: ${pct(ex.naive.soft.pL)} of stored bits lost, against ${pct(ex.naive.hard.pL)} without it.`);
  assert.equal(twistCaption('learned', d), `Using each reading’s confidence no longer hurts: ${pct(ex.learned.soft.pL)} of stored bits lost, against ${pct(ex.learned.hard.pL)} without it.`);
  // Footnote: the counts are settings (readout times x distances of holdout.json setting2),
  // not readout times; fails if it calls the 26 "readout times" again, mixes the chart's
  // d = 3, 20 µs into the settings phrase, or quotes numbers other than the files'.
  const s2 = holdout.setting2;
  const ds = [...new Set(s2.distances)].sort((a, b) => a - b);
  assert.equal(s2.pointsPerDecoder, ds.length * s2.x.values.length);
  assert.equal(s2.pointsPerDecoder, o.pointsPerDecoder);
  assert.deepEqual(d.distances, ds);
  const f = twistFootnote(d);
  assert.ok(f.includes('settings'), f);
  assert.ok(f.includes(`${o.softWorseCount.naive} of ${o.pointsPerDecoder} settings (readout times at d = ${ds.slice(0, -1).join(', ')} and ${ds[ds.length - 1]})`), f);
  assert.ok(f.includes(`first decoder and ${o.softWorseCount.learned} with the learned one`), f);
  assert.ok(!/readout times at d = [^)]*µs/.test(f) && !/of \d+ readout times/.test(f), f);
  assert.ok(f.includes('Chart: d = 3, 20 µs.'), f);
  assert.ok(words(f) <= 40, `${words(f)} words: ${f}`);
  assert.equal(twistFootnote({ ...d, distances: null }), null);
  assert.equal(twistCaption('other', d), null);
  assert.equal(twistCaption('naive', null), null);
  assert.equal(twistFootnote(null), null);
});

// Catches: fails if any fixed string or any sentence returned on the real data (both platforms,
// both bases, both decoders) runs past 40 words or contains a word on the release check's
// forbidden-text list.
test('every exported string and every real sentence: at most 40 words, no forbidden word', () => {
  const texts = [];
  const collect = (v) => {
    if (typeof v === 'string') texts.push(v);
    else if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === 'object') Object.values(v).forEach(collect);
  };
  for (const [name, v] of Object.entries(T)) if (typeof v !== 'function') collect(v);
  for (const c of ALL_CASES) {
    collect(overlapSentence(c.band));
    collect(whySentence(c));
    for (const t of c.curves.tau) collect(guessVerdict(t, c.band)?.text);
  }
  collect(guessVerdict(1, { kind: 'none' }).text);
  const d = twistData();
  collect([twistCaption('naive', d), twistCaption('learned', d), twistFootnote(d)]);
  assert.ok(texts.length > 30);
  for (const s of texts) {
    assert.ok(words(s) <= 40, `${words(s)} words: ${s}`);
    const hits = FORBIDDEN_TEXT.filter((w) => s.toLowerCase().includes(w.toLowerCase()));
    assert.deepEqual(hits, [], s);
  }
});

// Read-aloud fixes. Catches: fails if the intro is not the reviewed copy; if the trapped-ion Z
// overlap sentence (both optima print as 23 µs) quotes the same value twice instead of the "are
// the same here" form, or the superconducting Z one (0.71 against 0.91 µs) takes that form; if
// a caption puts the hard number before the soft one; or if any of these runs past 40 words.
test('read-aloud fixes: intro, equal-optima overlap, caption order, 40 words', () => {
  // Replaces 'The stopwatch barely mattered. What did: how well the decoder knows the noise.'
  // because the wording changed after the read-aloud review (both authors).
  assert.equal(T.TWIST_INTRO, 'Once the readout time is right, fine-tuning it barely mattered. What did: how well the decoder knows the noise.');
  const ion = heroCase('trapped-ion', 'Z').band;
  const sc = heroCase('superconducting', 'Z').band;
  const row = stage4z.platforms['trapped-ion'].budgetAtOptimum;
  assert.equal(formatTau(ion.tauLog), formatTau(ion.x0 === ion.tauLog ? ion.x1 : ion.x0));
  assert.equal(overlapSentence(ion), `The code’s best and the readout’s best are the same here (${formatTau(row.tau_us)}; uncertainty ${formatTau(ion.ciLo)} to ${formatTau(ion.ciHi)}).`);
  assert.ok(!overlapSentence(sc).includes('are the same here'), overlapSentence(sc));
  const d = twistData();
  const texts = [T.TWIST_INTRO, overlapSentence(ion), overlapSentence(sc)];
  for (const dec of ['naive', 'learned']) {
    const c = twistCaption(dec, d);
    // Replaces toPrecision(2) with formatNumber in these two lookups (E17 audit, as above).
    const soft = c.indexOf(`${formatNumber(d[dec].soft.pL * 100)}%`);
    const hard = c.indexOf(`${formatNumber(d[dec].hard.pL * 100)}%`, soft + 1);
    assert.ok(soft >= 0 && hard > soft && c.indexOf('without it') > hard, c);
    texts.push(c);
  }
  for (const basis of ['Z', 'X']) for (const id of PLATFORM_IDS) texts.push(whySentence({ platformId: id, basis, ...heroCase(id, basis) }));
  for (const t of texts) assert.ok(typeof t === 'string' && words(t) <= 40, `${t}`);
});
