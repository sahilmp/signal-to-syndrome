// Level 1, "Be the decoder": d = 3, one round. The player sees the two check lights,
// picks the data qubit they think flipped (or no correction), then the decoder's answer
// and the logical outcome are revealed. Score over 10 shots.
// With FEATURES.uxV2 it is the decoding game of team checklist U7.4: the readout error rises
// on a fixed schedule, the player plays against the decoder with a streak counter, and each
// answer highlights the flipped data qubit and the checks it lit, with one sentence of reason.

import { decodeShot, createFlatReadout } from './bridge_core.js';
import { bankD3R1 } from './bridge_data.js';
import { createRng } from '../core/rng.js';
import { expandShots, split } from '../core/bank.js';
import { computeDetectors } from '../core/detectors.js';
import { buildGraph } from '../core/graph.js';
import { FEATURES } from './features.js';
import { goalLine, explainMore, takeawayCard, prefersReducedMotion } from './charts.js';

// Gate-error estimate passed to decodeShot for the edge weights (mode "hard").
export const P_GATE = 0.01;
const SEED = 20261010;
const SHOTS_PER_GAME = 10;

// Game schedule (U7.4): epsilon rises every three shots, and the tenth shot is the hardest.
// U7.4 also lists 0.08, which does not fit ten shots in steps of three; see the report.
export const EPS_SCHEDULE = [0.01, 0.01, 0.01, 0.02, 0.02, 0.02, 0.05, 0.05, 0.05, 0.12];
export const epsilonForShot = (shotNo) => EPS_SCHEDULE[Math.min(Math.max(shotNo, 1), EPS_SCHEDULE.length) - 1];
// How long the reason highlight stays after an answer (it stays until the next shot under
// reduced motion).
export const HIGHLIGHT_MS = 1500;

// Score after one answer: player and decoder counts of kept logical values, and the
// player's current and best run of kept values.
export function updateScore(score, playerOk, decoderOk) {
  const streak = playerOk ? score.streak + 1 : 0;
  return {
    player: score.player + (playerOk ? 1 : 0),
    decoder: score.decoder + (decoderOk ? 1 : 0),
    streak,
    best: Math.max(score.best, streak),
  };
}
export const newScore = () => ({ player: 0, decoder: 0, streak: 0, best: 0 });

// Why the checks look as they do, for a one-round shot (r = 1): the data qubits read
// opposite to the stored logical value flipped; a check is lit by the flips when exactly one
// of its two data qubits flipped, and any check that differs from that misfired.
// Returns { flipped, lit, litByFlip, misfired, sentence } with 0-based indices.
export function explainShot({ hardData, hardAnc, logical, d }) {
  const flipped = [];
  for (let i = 0; i < d; i++) if (hardData[i] !== logical) flipped.push(i);
  const isFlipped = (i) => flipped.includes(i);
  const lit = [];
  const litByFlip = [];
  const misfired = [];
  for (let j = 0; j < d - 1; j++) {
    const on = hardAnc[0][j] === 1;
    const expected = isFlipped(j) !== isFlipped(j + 1);
    if (on) lit.push(j);
    if (on && expected) litByFlip.push(j);
    if (on !== expected) misfired.push(j);
  }
  const list = (xs) => (xs.length < 2 ? String(xs[0] + 1) : `${xs.slice(0, -1).map((x) => x + 1).join(', ')} and ${xs[xs.length - 1] + 1}`);
  const checks = (xs) => `check${xs.length > 1 ? 's' : ''} ${list(xs)}`;
  const parts = [];
  if (flipped.length === 0) parts.push('No data qubit flipped');
  else {
    const who = `Data qubit${flipped.length > 1 ? 's' : ''} ${list(flipped)} flipped`;
    parts.push(litByFlip.length ? `${who}, which lit ${checks(litByFlip)}` : `${who}, but lit no check`);
  }
  for (const j of misfired) parts.push(`check ${j + 1} misfired${hardAnc[0][j] === 1 ? '' : ' and stayed dark'}`);
  if (flipped.length === 0 && misfired.length === 0) parts.push('no check lit');
  const sentence = `${parts[0]}${parts.length > 1 ? `; ${parts.slice(1).join('; ')}` : ''}.`;
  return { flipped, lit, litByFlip, misfired, sentence };
}

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

// Human-readable list of what the decoder's matching corrects (1-based labels). With
// oneRound (the U7.4 wording) a wrong check reading is "check j misfired", without rounds.
export function describeCorrections(graph, paths, { oneRound = false } = {}) {
  const items = [];
  for (const p of paths) {
    for (const id of p.edges) {
      const e = graph.edges[id];
      items.push(e.kind === 'space'
        ? { kind: 'data', index: e.dataQubit, text: `flip of data qubit ${e.dataQubit + 1}${graph.r > 1 ? (e.layer < graph.r ? ` before round ${e.layer + 1}` : ' before the final readout') : ''}` }
        : { kind: 'check', index: e.check, text: oneRound && graph.r === 1 ? `check ${e.check + 1} misfired` : `wrong reading of check ${e.check + 1} in round ${e.round + 1}` });
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
  let game = newScore();

  const ux = FEATURES.uxV2 === true;
  if (ux) epsilon = epsilonForShot(1);
  const INTRO = 'Three data qubits store one logical bit (all 0 or all 1). Two checks compare neighbours: a lit check means its two data qubits disagree. '
    + 'Read the checks and choose the data qubit you think flipped, or no correction. The logical value is read from data qubit 1 after the correction.';

  container.replaceChildren();
  container.appendChild(el('h2', { id: 'level1-title' }, 'Level 1: Be the decoder'));
  if (ux) {
    // Text cut (U7.3): the goal, two visible sentences, the rest under "Explain more".
    container.appendChild(goalLine('read the two check lights and pick the data qubit that flipped.'));
    container.appendChild(el('p', { class: 'intro' }, 'Three data qubits store one bit, all 0 or all 1. A lit check means its two neighbouring data qubits disagree.'));
    container.appendChild(explainMore([INTRO,
      'The readout error ε is the chance that one check reading comes out wrong, so a lit check can also be a misread check.']));
  } else {
    container.appendChild(el('p', { class: 'intro' }, INTRO));
  }

  // Epsilon: a slider, or in the game (uxV2) the schedule's value for the current shot.
  const epsRow = el('div', { class: 'control-row' });
  let epsOut;
  if (ux) {
    epsOut = el('output', { id: 'l1-eps-out' }, String(epsilonForShot(1)));
    const p = el('p', { class: 'hint' }, 'Readout error ε (chance one measurement is wrong) for this shot: ');
    p.append(epsOut, '. It rises every three shots.');
    epsRow.appendChild(p);
  } else {
    const epsLabel = el('label', { for: 'l1-eps' }, 'Readout error ε: ');
    const epsInput = el('input', { id: 'l1-eps', type: 'range', min: '0', max: '0.12', step: '0.005', value: String(epsilon) });
    epsOut = el('output', { for: 'l1-eps', id: 'l1-eps-out' }, epsilon.toFixed(3));
    epsLabel.appendChild(epsOut);
    epsRow.append(epsLabel, epsInput);
    epsInput.addEventListener('input', () => {
      epsilon = Number(epsInput.value);
      epsOut.textContent = epsilon.toFixed(3);
    });
  }
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
  // Shown when the game ends, or when the reader scrolls past the board.
  const takeaway = ux ? takeawayCard('one flipped qubit lights the checks on either side of it, so two checks can find it; '
    + 'but a single misread check can fool you and the decoder alike.') : null;
  if (takeaway) container.appendChild(takeaway.node);

  function renderScore() {
    const played = shotNo - (answered ? 0 : 1);
    score.textContent = ux
      ? `After ${played} of ${SHOTS_PER_GAME} shots: you ${game.player}, decoder ${game.decoder} (logical value kept). Streak ${game.streak}, best ${game.best}.`
      : `Score after ${played} of ${SHOTS_PER_GAME} shots: you ${scorePlayer}, decoder ${scoreDecoder} (logical value kept).`;
  }

  // The reason highlight (U7.4): outlined qubits, checks or "No correction" for 1.5 s.
  let highlighted = [];
  let highlightTimer = null;
  function clearHighlight() {
    if (highlightTimer !== null) clearTimeout(highlightTimer);
    highlightTimer = null;
    for (const n of highlighted) {
      n.classList.remove('reason-hl');
      n.style.outline = '';
      n.style.outlineOffset = '';
    }
    highlighted = [];
  }
  function highlight(nodes) {
    clearHighlight();
    for (const n of nodes) {
      n.classList.add('reason-hl');
      n.style.outline = '4px solid var(--match)';
      n.style.outlineOffset = '3px';
    }
    highlighted = nodes;
    // Under reduced motion nothing changes by itself: the highlight stays until the next shot.
    if (!prefersReducedMotion()) highlightTimer = setTimeout(clearHighlight, HIGHLIGHT_MS);
  }

  function nextShot(focus = true) {
    if (shotNo >= SHOTS_PER_GAME) {
      // A new game continues the same seeded sequences of shots and readouts.
      shotNo = 0;
      scorePlayer = 0;
      scoreDecoder = 0;
      game = newScore();
    }
    clearHighlight();
    if (ux) {
      epsilon = epsilonForShot(shotNo + 1);
      epsOut.textContent = String(epsilon);
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
    status.textContent = ux
      ? `Shot ${shotNo} of ${SHOTS_PER_GAME} at ε = ${epsilon} (stored shot ${index + 1} of ${shots.length}). Which data qubit flipped?`
      : `Shot ${shotNo} of ${SHOTS_PER_GAME} (stored shot ${index + 1} of ${shots.length}). Which data qubit flipped?`;
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
    game = updateScore(game, playerOk, decoderOk);

    const corrections = describeCorrections(graph, res.paths, { oneRound: ux });
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
    // With the game on: one sentence of reason first, and the flipped qubit (or "No
    // correction") highlighted with the checks it lit.
    const why = ux ? explainShot({ hardData: res.hardData, hardAnc: res.hardAnc, logical: bank.logical, d }) : null;
    reveal.replaceChildren(...(why ? [el('p', { class: 'reason' }, why.sentence)] : []), ...lines.map((t) => el('p', {}, t)));
    if (why) {
      highlight(why.flipped.length
        ? [...why.flipped.map((i) => qubitButtons[i]), ...why.litByFlip.map((j) => checkLights[j])]
        : [noneBtn]);
    }
    if (shotNo >= SHOTS_PER_GAME) {
      reveal.appendChild(el('p', { class: 'final' }, ux
        ? `Game over: you kept the logical value in ${game.player} of ${SHOTS_PER_GAME} shots, the decoder in ${game.decoder}; your best streak was ${game.best}.`
        : `Game over: you kept the logical value in ${scorePlayer} of ${SHOTS_PER_GAME} shots, the decoder in ${scoreDecoder}.`));
      nextBtn.textContent = 'New game';
      if (takeaway) takeaway.show();
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
