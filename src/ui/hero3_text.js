// Hero, three steps (UX1): the fixed copy and the sentences, with no DOM. Person A owns this
// file and its test by agreement (DECISIONS E16, UX1 split); the panel that shows them is
// Person B's. Contract: the P1 prompts (P1-S and P1-H), unchanged.
//
// Step 1: the reader guesses a readout time; step 2: guessVerdict, overlapSentence and
// whySentence; step 3 (the twist): hard against soft decoding with the two decoders, from the
// F1 finding. Every number comes from the results through bridge_data.js: stage4v2 (Z) or
// stage4x (X) platforms[id].budgetAtOptimum, and stage4v2 findings[F1].numbers.outOfSample
// (holdout.json, setting2). The curves and the band are heroCurves and bandInfo from hero.js.
// No function throws on missing data: it returns null.

import { stage4v2, stage4x } from './bridge_data.js';
import { formatNumber } from './charts.js';
import { formatTau } from './level3.js';

export const STEP_LABELS = ['Step 1 of 3: guess', 'Step 2 of 3: reveal', 'Step 3 of 3: the twist'];
export const GUESS_PROMPT = 'Longer listening gives a clearer reading, but the other qubits wait and decay meanwhile. Where does the code do best?';
export const GUESS_SLIDER_LABEL = 'Your guess';
export const LOCK_LABEL = 'Lock in my guess';
export const WHY_SUMMARY = 'Why?';
export const NEXT_LABEL = 'See what mattered';
export const TWIST_INTRO = 'The stopwatch barely mattered. What did: how well the decoder knows the noise.';
export const DECODER_LABELS = { naive: 'First decoder', learned: 'Decoder that learned the noise' };
export const TWIST_TITLE = 'Trapped ion: hard against soft decoding (d = 3, 20 µs)';
export const MODE_LABELS = { hard: 'Hard', soft: 'Soft' };
export const STEPS_LABEL = 'See it step by step';
export const RESTART_LABEL = 'Start over';
export const CHART_LABELS = {
  codeBest: 'code’s best', readoutBest: 'readout’s best', guess: 'your guess', readout: 'readout error', logical: 'logical error',
};

const finite = (v) => Number.isFinite(v);
// Equal up to rounding, as hero.js compares a tau with the ends of the range.
const close = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b), 1);

// Where the guess sits against tau*_log's range [logLo, logHi] (bandInfo). An end of the
// range counts as inside.
const VERDICTS = {
  inside: 'Your guess is inside the code’s best range.',
  below: 'Shorter than the code wants: the reading is still too noisy there.',
  above: 'Longer than the code wants: the waiting costs more than it gains.',
  none: 'These results show no best readout time to compare your guess with.',
};
export function guessVerdict(tau, band) {
  if (!band || typeof band !== 'object') return null;
  if (band.kind === 'none') return { kind: 'none', text: VERDICTS.none };
  if (!finite(tau) || !finite(band.logLo) || !finite(band.logHi)) return null;
  let kind = 'inside';
  if (tau < band.logLo && !close(tau, band.logLo)) kind = 'below';
  else if (tau > band.logHi && !close(tau, band.logHi)) kind = 'above';
  return { kind, text: VERDICTS[kind] };
}

// tau*_phys of a bandInfo result: x0 and x1 are the two optima in order, so it is the one that
// is not tau*_log.
const tauPhysOf = (band) => (close(band.x0, band.tauLog) ? band.x1 : band.x0);

// The code's best against the readout's best, by band.kind. The bracketed range is tau*_log's
// 95% interval, left out when the band has none.
export function overlapSentence(band) {
  if (!band || typeof band !== 'object') return null;
  if (band.kind === 'none') return 'These results show no interior optimum to compare.';
  if (!finite(band.tauLog) || !finite(band.x0) || !finite(band.x1)) return null;
  const log = formatTau(band.tauLog);
  const phys = formatTau(tauPhysOf(band));
  const hasCi = finite(band.ciLo) && finite(band.ciHi);
  const lo = hasCi ? formatTau(band.ciLo) : null;
  const hi = hasCi ? formatTau(band.ciHi) : null;
  if (band.kind === 'coincide') {
    const within = hasCi ? `overlap within our uncertainty (${lo} to ${hi})` : 'overlap';
    return `The code’s best (${log}) and the readout’s best (${phys}) ${within}. Treat them as the same.`;
  }
  const best = hasCi ? `${log}, ${lo} to ${hi}` : log;
  if (band.kind === 'band') {
    return `The code’s best (${best}) is earlier than the readout’s best (${phys}): idling during readout pulls it in.`;
  }
  if (band.kind === 'reverse') {
    return `The code’s best (${best}) is later than the readout’s best (${phys}): the code still gains from listening longer.`;
  }
  return null;
}

// The error budget per round and per qubit at tau*_log (d = 3, hard, learned), as Stage 4
// stores it: the bit-flip memory (Z) from stage4v2, the phase-flip memory (X) from stage4x.
export function budgetFor(platformId, basis) {
  const file = basis === 'Z' ? stage4v2 : basis === 'X' ? stage4x : null;
  const b = file?.platforms?.[platformId]?.budgetAtOptimum;
  if (!b || typeof b !== 'object') return null;
  const out = { readout: b.readout, idle: b.idle, gate: b.gate, crosstalk: b.crosstalk, tau_us: b.tau_us };
  return Object.values(out).every(finite) ? out : null;
}

// Thresholds on r = idle / readout for whySentence. Set on Sun 11 Oct after the data were
// seen; they are wording rules (which sentence is true to say), not results.
export const WHY_SMALL_RATIO = 0.1;
export const WHY_RIVAL_RATIO = 0.5;

// Why the code's best sits where it does, only when it overlaps the readout's best (band.kind
// 'coincide'). Idling under a tenth of the readout error is too small to move it; idling at
// least half of it rivals the readout error, but the logical curve is flat across tau*_log's
// 95% interval, so the shift is not resolved (docs/project_page.md, F2, F3). The rival
// sentence says "earlier" only when tau*_log lies below tau*_phys. Every other case: null.
// `budget` (optional, same shape as budgetFor) replaces the file's budget; the tests use it
// for ratios no platform has.
export function whySentence({ platformId, basis, curves, band, budget } = {}) {
  const b = budget === undefined ? budgetFor(platformId, basis) : budget;
  if (!b || !band || band.kind !== 'coincide' || !(b.readout > 0)) return null;
  const r = b.idle / b.readout;
  const idle = formatNumber(b.idle);
  const readout = formatNumber(b.readout);
  if (r < WHY_SMALL_RATIO) {
    if (!(b.idle > 0)) return null;
    const ratio = Number((b.readout / b.idle).toPrecision(2));
    return `Idling here is ${ratio}× smaller than the readout error (${idle} against ${readout} per round), too small to move the code’s best.`;
  }
  if (r < WHY_RIVAL_RATIO) return null;
  if (!finite(band.ciLo) || !finite(band.ciHi) || !finite(band.tauLog) || !finite(band.x0) || !finite(band.x1)) return null;
  const tau = curves?.tau;
  const y = curves?.logical?.y;
  if (!Array.isArray(tau) || !Array.isArray(y)) return null;
  const inside = tau
    .map((t, i) => ({ t, p: y[i] }))
    .filter(({ t, p }) => finite(p) && (t >= band.ciLo || close(t, band.ciLo)) && (t <= band.ciHi || close(t, band.ciHi)))
    .map(({ p }) => p);
  if (inside.length === 0) return null;
  const flat = `${formatNumber(Math.min(...inside))} to ${formatNumber(Math.max(...inside))}`;
  if (band.tauLog < tauPhysOf(band)) {
    return `Idling (${idle} per round) rivals the readout error (${readout}) and nudges the code’s best earlier, but the valley is too flat (${flat}) to say how far.`;
  }
  return `Idling (${idle} per round) rivals the readout error (${readout}), but the valley is too flat (${flat}) to see where it moves the code’s best.`;
}

// The twist: F1 out of sample (held-out banks, trapped ion, d = 3, 20 µs), always from the
// bit-flip file. lo and hi are the cluster bounds; yMax leaves 15% headroom above the
// largest hi.
export function twistData() {
  const f1 = (stage4v2?.findings || []).find((f) => f?.id === 'F1');
  const o = f1?.numbers?.outOfSample;
  const ex = o?.example_d3_tau20;
  if (!ex) return null;
  const point = (q) => (q && [q.pL, q.loCluster, q.hiCluster].every(finite) ? { pL: q.pL, lo: q.loCluster, hi: q.hiCluster } : null);
  const out = {};
  for (const dec of ['naive', 'learned']) {
    const hard = point(ex[dec]?.hard);
    const soft = point(ex[dec]?.soft);
    if (!hard || !soft) return null;
    out[dec] = { hard, soft };
  }
  const counts = { naive: o.softWorseCount?.naive, learned: o.softWorseCount?.learned, n: o.pointsPerDecoder };
  if (!Object.values(counts).every(finite)) return null;
  out.counts = counts;
  out.yMax = Math.max(out.naive.hard.hi, out.naive.soft.hi, out.learned.hard.hi, out.learned.soft.hi) * 1.15;
  return out;
}

const percent = (p) => (p * 100).toPrecision(2);

export function twistCaption(decoder, data) {
  const c = data?.[decoder];
  if (!c || !finite(c.soft?.pL) || !finite(c.hard?.pL)) return null;
  const nums = `${percent(c.soft.pL)}% against ${percent(c.hard.pL)}% of stored bits lost.`;
  if (decoder === 'naive') return `Using each reading’s confidence made things worse: ${nums}`;
  if (decoder === 'learned') return `Using each reading’s confidence no longer hurts: ${nums}`;
  return null;
}

export function twistFootnote(data) {
  const c = data?.counts;
  if (!c || ![c.naive, c.learned, c.n].every(finite)) return null;
  return `On fresh simulator circuits, confidence hurt at ${c.naive} of ${c.n} readout times with the first decoder and ${c.learned} of ${c.n} with the learned one. Trapped ion, d = 3, 20 µs. Found after seeing the data.`;
}
