// Live run: one fresh d = 3, r = 3, L0 experiment on the IonQ simulator, fed to level 4.
// The circuit must be submitted in native gates or IonQ's optimiser removes the noise
// (DECISIONS, platform facts and D4), so JavaScript does not build it: it calls Person A's
// Python helper qollab/live.py through the module that tools/build.mjs imports on the
// first line of main.js as globalThis.s2sLive (CLAUDE.md rule 3, probe P10, D11).
// Without that module (liveRun off, the local preview, or D11 "does not work") the panel
// shows a note with a link to the bank-generator project instead of the button.
// U7.12 (B50): the panel moves through the states idle, submitting, running (elapsed timer),
// done and error (data-state on the panel); when done it sets the fresh shots' detector rate
// and logical error beside the stored bank's, with 95% intervals, and says whether they agree.

import { FEATURES } from './features.js';
import { validateBank, expandShots, split } from '../core/bank.js';
import { computeDetectors } from '../core/detectors.js';
import { buildGraph, weightFromP } from '../core/graph.js';
import { decode } from '../core/matching.js';
import { correctedLogical, isLogicalError } from '../core/logical.js';

export const LIVE_D = 3;
export const LIVE_R = 3;
export const LIVE_SHOTS = 200;
export const BANK_GENERATOR_URL = 'https://qollab.xyz/u/SQuant/signal-to-syndrome-bank-genera';

// Seeds are integers in 1..2^31 (DECISIONS D2); a new one per press, never the previous one.
export function nextSeed(previous, now) {
  let s = now % 2 ** 31;
  if (s === 0) s = 1;
  if (s === previous) s = (s % (2 ** 31 - 1)) + 1;
  return s;
}

// Binary-key counts from Qiskit (classical bit 0 is the rightmost character) to an
// in-memory s2s-bank/1 bank for d = 3, r = 3, logical 0, with the fixed CLAUDE.md layout
// and hex keys; validated with validateBank before it is returned.
export function countsToBank(counts, { seed, d = LIVE_D, r = LIVE_R, date = null } = {}) {
  const nClbits = (d - 1) * r + d;
  const hexCounts = {};
  for (const [rawKey, rawCount] of Object.entries(counts)) {
    const key = String(rawKey).replace(/\s+/g, '');
    if (!/^[01]+$/.test(key)) throw new Error(`count key "${rawKey}" is not a binary string`);
    if (key.length > nClbits && /1/.test(key.slice(0, key.length - nClbits))) {
      throw new Error(`count key "${rawKey}" has more than ${nClbits} classical bits`);
    }
    const c = Number(rawCount);
    if (!Number.isInteger(c) || c < 0) throw new Error(`count for key "${rawKey}" is not a non-negative integer: ${rawCount}`);
    if (c === 0) continue;
    const hex = parseInt(key, 2).toString(16);
    hexCounts[hex] = (hexCounts[hex] || 0) + c;
  }
  const total = Object.values(hexCounts).reduce((s, c) => s + c, 0);
  const ancilla = [];
  for (let k = 0; k < r; k++) ancilla.push(Array.from({ length: d - 1 }, (_, j) => k * (d - 1) + j));
  const bank = {
    schema: 's2s-bank/1',
    code: 'repetition',
    d, r, logical: 0,
    shots: total,
    n_clbits: nClbits,
    layout: { ancilla, data: Array.from({ length: d }, (_, i) => (d - 1) * r + i) },
    bit_order: 'qiskit-little-endian',
    key_encoding: 'hex',
    counts: hexCounts,
    checksum: { total_shots: total, n_keys: Object.keys(hexCounts).length },
    noise_model: 'forte-1',
    sampler_seed: seed,
    source: 'live run (qollab/live.py)',
    date,
  };
  validateBank(bank);
  return bank;
}

// Fraction of shots with at least one lit detector; 0 means the circuit lost its noise.
export function litFraction(bank) {
  const shots = expandShots(bank);
  if (shots.length === 0) return 0;
  let lit = 0;
  for (const bits of shots) {
    const { m, x } = split(bits, bank.layout, bank.d, bank.r);
    if (computeDetectors(m, x, bank.d, bank.r).some((v) => v === 1)) lit++;
  }
  return lit / shots.length;
}

// Wilson score interval (95%) for k of n; the same formula as stats.js wilson, written here
// because stats.js is not on the bridges and this panel needs only this one line of it.
export function wilsonInterval(k, n, z = 1.96) {
  if (n === 0) return { p: 0, lo: 0, hi: 1 };
  const p = k / n;
  const z2 = z * z;
  const den = 1 + z2 / n;
  const mid = (p + z2 / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
  return { p, lo: Math.max(0, mid - half), hi: Math.min(1, mid + half) };
}

// The recorded shots of a bank, without any readout model: the detector rate (fraction of
// detectors lit, with a 95% interval over shots, since the detectors of one shot are correlated)
// and the logical error after decoding with the naive graph at pGate, with a Wilson interval.
export function bankSummary(bank, pGate) {
  const shots = expandShots(bank);
  const { d, r } = bank;
  const graph = buildGraph(d, r);
  const weights = new Float64Array(graph.edges.length).fill(weightFromP(pGate));
  const nDet = (d - 1) * (r + 1);
  let sum = 0;
  let sum2 = 0;
  let errors = 0;
  for (const bits of shots) {
    const { m, x } = split(bits, bank.layout, d, r);
    const det = computeDetectors(m, x, d, r);
    const f = det.reduce((a, v) => a + v, 0) / nDet;
    sum += f;
    sum2 += f * f;
    const { flip } = decode(graph, weights, det);
    if (isLogicalError(correctedLogical(x[0], flip), bank.logical)) errors++;
  }
  const n = shots.length;
  const mean = n ? sum / n : 0;
  const sd = n > 1 ? Math.sqrt(Math.max(0, (sum2 - n * mean * mean) / (n - 1))) : 0;
  const half = n ? (1.96 * sd) / Math.sqrt(n) : 0;
  return {
    n,
    detectorRate: { p: mean, lo: Math.max(0, mean - half), hi: Math.min(1, mean + half) },
    logical: { k: errors, n, ...wilsonInterval(errors, n) },
  };
}

const overlap = (a, b) => a.lo <= b.hi && b.lo <= a.hi;
const fmt = (v) => (v === 0 ? '0' : v.toPrecision(2));
const iv = (s) => `${fmt(s.p)} [${fmt(s.lo)}, ${fmt(s.hi)}]`;

// Fresh against stored: the two lines and one sentence on whether they agree (both 95%
// intervals overlap, for the detector rate and for the logical error).
export function compareRuns(fresh, stored) {
  const detOk = overlap(fresh.detectorRate, stored.detectorRate);
  const logOk = overlap(fresh.logical, stored.logical);
  const differ = [!detOk && 'detector rate', !logOk && 'logical error'].filter(Boolean);
  return {
    agree: differ.length === 0,
    lines: [
      `Detector rate (share of detectors lit): fresh ${iv(fresh.detectorRate)}, stored ${iv(stored.detectorRate)}.`,
      `Logical error (recorded bits, no readout model, naive decoder): fresh ${iv(fresh.logical)} (${fresh.logical.k} of ${fresh.logical.n}), stored ${iv(stored.logical)} (${stored.logical.k} of ${stored.logical.n}).`,
    ],
    sentence: differ.length === 0
      ? 'The fresh shots agree with the stored bank: both 95% intervals overlap.'
      : `The fresh shots differ from the stored bank in the ${differ.join(' and the ')}: the 95% intervals do not overlap.`,
  };
}

export const LIVE_STATES = ['idle', 'submitting', 'running', 'done', 'error'];

export function liveRunAvailable() {
  return FEATURES.liveRun === true && typeof globalThis.s2sLive !== 'undefined' && globalThis.s2sLive !== null;
}

function el(tag, attrs = {}, text = null) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  if (text !== null) e.textContent = text;
  return e;
}

function noteWithLink(box, reason) {
  const p = el('p', { class: 'live-note' });
  p.append(`${reason} To run your own experiment on the IonQ simulator, use the `);
  p.appendChild(el('a', { href: BANK_GENERATOR_URL, target: '_blank', rel: 'noopener' }, 'bank generator project on Qollab'));
  p.append(', which writes shot banks in the same format as the ones used here.');
  box.appendChild(p);
}

// Mounts the live-run panel into `container`. onBank(bank, label) is called with a
// validated bank after a successful run.
// storedBank and pGate (optional) give the comparison of U7.12.
export function mountLiveRun(container, { onBank, storedBank = null, pGate = 0.01 }) {
  const box = el('div', { class: 'live-run', role: 'region', 'aria-label': 'Fresh experiment' });
  box.setAttribute('data-state', 'idle');
  box.appendChild(el('h3', {}, 'Run a fresh experiment'));
  container.appendChild(box);

  if (!liveRunAvailable()) {
    noteWithLink(box, FEATURES.liveRun === true
      ? 'The live run needs the Qollab runtime and its Python helper, which are not available here.'
      : 'The live run is switched off in this build.');
    return;
  }

  box.appendChild(el('p', { class: 'intro' },
    `Submit a new d = ${LIVE_D}, r = ${LIVE_R} memory experiment (logical 0, ${LIVE_SHOTS} shots) to the IonQ simulator chosen in the Select QPU dialog, `
    + 'in native gates with the Forte 1 noise model. The shots then replace the stored bank in this level. A run takes from tens of seconds to a few minutes.'));
  const row = el('div', { class: 'control-row' });
  const btn = el('button', { type: 'button' }, 'Run a fresh experiment');
  const seedOut = el('span', { class: 'hint' });
  row.append(btn, seedOut);
  box.appendChild(row);
  const status = el('p', { class: 'status', role: 'status', 'aria-live': 'polite' }, 'Ready: no fresh experiment has run yet.');
  const elapsed = el('p', { class: 'hint' });
  const compare = el('div', { class: 'live-compare' });
  box.append(status, elapsed, compare);
  let storedSummary = null;
  const setState = (st) => box.setAttribute('data-state', st);

  let lastSeed = 0;
  let timer = null;
  let running = false;

  // While a job runs the button is marked aria-disabled rather than disabled, so that it
  // keeps the keyboard focus; a press during the run does nothing (one job per run).
  btn.addEventListener('click', async () => {
    if (running) return;
    running = true;
    const seed = nextSeed(lastSeed, Date.now());
    lastSeed = seed;
    seedOut.textContent = `Seed ${seed}`;
    btn.setAttribute('aria-disabled', 'true');
    compare.replaceChildren();
    setState('submitting');
    status.className = 'status';
    status.textContent = `Submitting the job to the IonQ simulator (seed ${seed}, ${LIVE_SHOTS} shots).`;
    const t0 = performance.now();
    elapsed.textContent = '';
    clearInterval(timer);
    try {
      if (typeof backend === 'undefined') throw new Error('no backend: press Run with an IonQ simulator picked in the Select QPU dialog');
      const pending = globalThis.s2sLive.run_live.callPromising(backend, LIVE_SHOTS, seed);
      setState('running');
      status.textContent = `Running on the IonQ simulator (seed ${seed}, ${LIVE_SHOTS} shots). Expect tens of seconds to a few minutes.`;
      elapsed.textContent = 'Elapsed: 0 s';
      timer = setInterval(() => { elapsed.textContent = `Elapsed: ${Math.round((performance.now() - t0) / 1000)} s`; }, 1000);
      const raw = (await pending).toJs();
      const counts = raw instanceof Map ? Object.fromEntries(raw) : raw;
      const bank = countsToBank(counts, { seed, date: new Date().toISOString() });
      const frac = litFraction(bank);
      const secs = ((performance.now() - t0) / 1000).toFixed(1);
      status.textContent = `Done in ${secs} s: ${bank.shots} shots, ${Object.keys(bank.counts).length} distinct outcomes, `
        + `${(100 * frac).toFixed(1)}% of shots with a lit detector. Level 4 now decodes these shots.`
        + (frac === 0 ? ' Warning: no shot lit a detector, so the noise may have been optimised away.' : '');
      if (storedBank) {
        if (!storedSummary) storedSummary = bankSummary(storedBank, pGate);
        const c = compareRuns(bankSummary(bank, pGate), storedSummary);
        compare.replaceChildren(...c.lines.map((t) => el('p', {}, t)), el('p', { class: 'status' }, c.sentence));
      }
      setState('done');
      onBank(bank, `fresh experiment, seed ${seed}`);
    } catch (err) {
      setState('error');
      status.className = 'status error';
      status.textContent = `The live run failed: ${err && err.name ? `${err.name}: ` : ''}${String(err && err.message ? err.message : err).slice(0, 300)}. The stored bank is still in use.`;
    } finally {
      clearInterval(timer);
      btn.removeAttribute('aria-disabled');
      running = false;
    }
  });
}
