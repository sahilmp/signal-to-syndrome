// Level 1, "Be the decoder": d = 3, one round. The player sees the two check lights,
// picks the data qubit they think flipped (or no correction), then the decoder's answer
// and the logical outcome are revealed. Score over 10 shots.

import { decodeShot, createFlatReadout } from './bridge_core.js';
import { bankD3R1 } from './bridge_data.js';
import { createRng } from '../core/rng.js';
import { expandShots, split } from '../core/bank.js';
import { computeDetectors } from '../core/detectors.js';
import { buildGraph } from '../core/graph.js';

// Gate-error estimate passed to decodeShot for the edge weights (mode "hard").
export const P_GATE = 0.01;
const SEED = 20261010;
const SHOTS_PER_GAME = 10;

// Indices (into expandShots(bank)) of the shots whose raw bank bits light at least one detector.
export function litShotPool(bank) {
  const shots = expandShots(bank);
  const pool = [];
  shots.forEach((bits, s) => {
    const { m, x } = split(bits, bank.layout, bank.d, bank.r);
    if (computeDetectors(m, x, bank.d, bank.r).some((v) => v === 1)) pool.push(s);
  });
  return { shots, pool };
}

// Human-readable list of what the decoder's matching corrects (1-based labels).
export function describeCorrections(graph, paths) {
  const items = [];
  for (const p of paths) {
    for (const id of p.edges) {
      const e = graph.edges[id];
      items.push(e.kind === 'space'
        ? { kind: 'data', index: e.dataQubit, text: `flip of data qubit ${e.dataQubit + 1}${graph.r > 1 ? (e.layer < graph.r ? ` before round ${e.layer + 1}` : ' before the final readout') : ''}` }
        : { kind: 'check', index: e.check, text: `wrong reading of check ${e.check + 1} in round ${e.round + 1}` });
    }
  }
  return items;
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

export function mountLevel1(container) {
  const bank = bankD3R1;
  const { d, r } = bank;
  const graph = buildGraph(d, r);
  const { shots, pool } = litShotPool(bank);

  const drawRng = createRng(SEED);
  const readoutRng = createRng(SEED + 1);
  let epsilon = 0.02;
  let shotNo = 0;
  let scorePlayer = 0;
  let scoreDecoder = 0;
  let current = null; // { index, res }
  let answered = false;

  container.replaceChildren();
  container.appendChild(el('h2', { id: 'level1-title' }, 'Level 1: Be the decoder'));
  container.appendChild(el('p', { class: 'intro' },
    'Three data qubits store one logical bit (all 0 or all 1). Two checks compare neighbours: a lit check means its two data qubits disagree. '
    + 'Read the checks and choose the data qubit you think flipped, or no correction. The logical value is read from data qubit 1 after the correction.'));

  // Epsilon control.
  const epsRow = el('div', { class: 'control-row' });
  const epsLabel = el('label', { for: 'l1-eps' }, 'Readout error ε: ');
  const epsInput = el('input', { id: 'l1-eps', type: 'range', min: '0', max: '0.12', step: '0.005', value: String(epsilon) });
  const epsOut = el('output', { for: 'l1-eps', id: 'l1-eps-out' }, epsilon.toFixed(3));
  epsLabel.appendChild(epsOut);
  epsRow.append(epsLabel, epsInput);
  epsInput.addEventListener('input', () => {
    epsilon = Number(epsInput.value);
    epsOut.textContent = epsilon.toFixed(3);
  });
  container.appendChild(epsRow);

  const status = el('p', { class: 'status', 'aria-live': 'polite' });
  container.appendChild(status);

  // Board: data qubits alternate with check lights.
  const board = el('div', { class: 'l1-board', role: 'group', 'aria-label': 'Data qubits and check lights' });
  const qubitButtons = [];
  const checkLights = [];
  for (let i = 0; i < d; i++) {
    const b = el('button', { type: 'button', class: 'qubit' });
    b.addEventListener('click', () => answer(i));
    qubitButtons.push(b);
    board.appendChild(b);
    if (i < d - 1) {
      const c = el('span', { class: 'check', role: 'img', 'aria-label': `Check ${i + 1}` }, `Check ${i + 1}`);
      checkLights.push(c);
      board.appendChild(c);
    }
  }
  container.appendChild(board);

  const actions = el('div', { class: 'control-row' });
  const noneBtn = el('button', { type: 'button', class: 'secondary' }, 'No correction');
  noneBtn.addEventListener('click', () => answer(null));
  const nextBtn = el('button', { type: 'button' }, 'Next shot');
  nextBtn.addEventListener('click', () => nextShot());
  actions.append(noneBtn, nextBtn);
  container.appendChild(actions);

  const reveal = el('div', { class: 'reveal', 'aria-live': 'polite' });
  container.appendChild(reveal);
  const score = el('p', { class: 'score', 'aria-live': 'polite' });
  container.appendChild(score);

  function renderScore() {
    score.textContent = `Score after ${shotNo - (answered ? 0 : 1)} of ${SHOTS_PER_GAME} shots: you ${scorePlayer}, decoder ${scoreDecoder} (logical value kept).`;
  }

  function nextShot(focus = true) {
    if (shotNo >= SHOTS_PER_GAME) {
      // A new game continues the same seeded sequences of shots and readouts.
      shotNo = 0;
      scorePlayer = 0;
      scoreDecoder = 0;
    }
    const index = pool[drawRng.int(pool.length)];
    const readout = createFlatReadout({ epsilon });
    const res = decodeShot({ shotBits: shots[index], layout: bank.layout, d, r, readout, mode: 'hard', pGate: P_GATE, rng: readoutRng });
    current = { index, res };
    answered = false;
    shotNo++;
    // Check j lights when its round-0 reading is 1 (for r = 1 this is detector D[0][j]).
    checkLights.forEach((c, j) => {
      const lit = res.hardAnc[0][j] === 1;
      c.classList.toggle('lit', lit);
      c.setAttribute('aria-label', `Check ${j + 1} (data qubits ${j + 1} and ${j + 2}): ${lit ? 'lit' : 'dark'}`);
      c.textContent = `Check ${j + 1}`;
    });
    qubitButtons.forEach((b, i) => {
      b.disabled = false;
      b.className = 'qubit';
      b.textContent = `Data qubit ${i + 1}`;
      b.setAttribute('aria-label', `Data qubit ${i + 1}: choose as the flipped qubit`);
    });
    noneBtn.disabled = false;
    nextBtn.disabled = true;
    status.textContent = `Shot ${shotNo} of ${SHOTS_PER_GAME} (bank shot ${index + 1} of ${shots.length}). Which data qubit flipped?`;
    reveal.replaceChildren();
    renderScore();
    if (focus) qubitButtons[0].focus();
  }

  function answer(guess) {
    if (answered || !current) return;
    answered = true;
    const { res } = current;
    // Player's correction of data qubit 0 decides the logical value, as for the decoder.
    const playerFlip0 = guess === 0 ? 1 : 0;
    const playerLogical = res.hardData[0] ^ playerFlip0;
    const playerOk = playerLogical === bank.logical;
    const decoderOk = res.corrected === bank.logical;
    if (playerOk) scorePlayer++;
    if (decoderOk) scoreDecoder++;

    const corrections = describeCorrections(graph, res.paths);
    const decoderQubits = new Set(corrections.filter((c) => c.kind === 'data').map((c) => c.index));
    // The picks are written on the buttons, so the coloured rings are never the only cue;
    // the visible text becomes the accessible name.
    qubitButtons.forEach((b, i) => {
      b.disabled = true;
      b.removeAttribute('aria-label');
      b.textContent = `Data qubit ${i + 1}: read ${res.hardData[i]}`;
      const tags = [];
      if (guess === i) { b.classList.add('player-pick'); tags.push('your pick'); }
      if (decoderQubits.has(i)) { b.classList.add('decoder-pick'); tags.push('decoder\'s pick'); }
      if (tags.length) b.append(' ', el('span', { class: 'pick-tag' }, tags.join(', ')));
    });
    noneBtn.disabled = true;
    nextBtn.disabled = false;

    const lines = [
      `Your answer: ${guess === null ? 'no correction' : `data qubit ${guess + 1}`}. Logical value ${playerLogical}: ${playerOk ? 'survived' : 'lost'}.`,
      `Decoder's answer: ${corrections.length ? corrections.map((c) => c.text).join('; ') : 'no correction'}. Logical value ${res.corrected}: ${decoderOk ? 'survived' : 'lost'}.`,
      `Data readout: ${Array.from(res.hardData).join(' ')}. Lit detectors (including the final layer from the data): ${res.nDefects}.`,
    ];
    reveal.replaceChildren(...lines.map((t) => el('p', {}, t)));
    if (shotNo >= SHOTS_PER_GAME) {
      reveal.appendChild(el('p', { class: 'final' }, `Game over: you kept the logical value in ${scorePlayer} of ${SHOTS_PER_GAME} shots, the decoder in ${scoreDecoder}.`));
      nextBtn.textContent = 'New game';
    } else {
      nextBtn.textContent = 'Next shot';
    }
    renderScore();
    nextBtn.focus();
  }

  if (pool.length === 0) {
    status.textContent = 'The bank has no shots with a lit detector.';
    return;
  }
  nextShot(false);
}
