// Live run: one fresh d = 3, r = 3, L0 experiment on the IonQ simulator, fed to level 4.
// The circuit must be submitted in native gates or IonQ's optimiser removes the noise
// (DECISIONS, platform facts and D4), so JavaScript does not build it: it calls Person A's
// Python helper qollab/live.py through the module that tools/build.mjs imports on the
// first line of main.js as globalThis.s2sLive (CLAUDE.md rule 3, probe P10, D11).
// Without that module (liveRun off, the local preview, or D11 "does not work") the panel
// shows a note with a link to the bank-generator project instead of the button.

import { FEATURES } from './features.js';
import { validateBank, expandShots, split } from '../core/bank.js';
import { computeDetectors } from '../core/detectors.js';

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
export function mountLiveRun(container, { onBank }) {
  const box = el('div', { class: 'live-run', role: 'region', 'aria-label': 'Fresh experiment' });
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
  const status = el('p', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const elapsed = el('p', { class: 'hint' });
  box.append(status, elapsed);

  let lastSeed = 0;
  let timer = null;

  btn.addEventListener('click', async () => {
    const seed = nextSeed(lastSeed, Date.now());
    lastSeed = seed;
    seedOut.textContent = `Seed ${seed}`;
    btn.disabled = true;
    status.className = 'status';
    status.textContent = `Job running on the IonQ simulator (seed ${seed}, ${LIVE_SHOTS} shots). Expect tens of seconds to a few minutes.`;
    const t0 = performance.now();
    elapsed.textContent = 'Elapsed: 0 s';
    clearInterval(timer);
    timer = setInterval(() => { elapsed.textContent = `Elapsed: ${Math.round((performance.now() - t0) / 1000)} s`; }, 1000);
    try {
      if (typeof backend === 'undefined') throw new Error('no backend: press Run with an IonQ simulator picked in the Select QPU dialog');
      const raw = (await globalThis.s2sLive.run_live.callPromising(backend, LIVE_SHOTS, seed)).toJs();
      const counts = raw instanceof Map ? Object.fromEntries(raw) : raw;
      const bank = countsToBank(counts, { seed, date: new Date().toISOString() });
      const frac = litFraction(bank);
      const secs = ((performance.now() - t0) / 1000).toFixed(1);
      status.textContent = `Done in ${secs} s: ${bank.shots} shots, ${Object.keys(bank.counts).length} distinct outcomes, `
        + `${(100 * frac).toFixed(1)}% of shots with a lit detector. Level 4 now decodes these shots.`
        + (frac === 0 ? ' Warning: no shot lit a detector, so the noise may have been optimised away.' : '');
      onBank(bank, `fresh experiment, seed ${seed}`);
    } catch (err) {
      status.className = 'status error';
      status.textContent = `The live run failed: ${err && err.name ? `${err.name}: ` : ''}${String(err && err.message ? err.message : err).slice(0, 300)}. The stored bank is still in use.`;
    } finally {
      clearInterval(timer);
      btn.disabled = false;
    }
  });
}
