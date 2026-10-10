// STUB for src/ui/hero3_text.js (the text of the guess, reveal, twist hero, UX1). Same exports
// and return shapes as the contract; the fixed copy is the contract's own, the computed texts
// are neutral placeholders. Replaced through src/ui/bridge_hero3.js when the real module arrives.

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
export const CHART_LABELS = { codeBest: 'code’s best', readoutBest: 'readout’s best', guess: 'your guess', readout: 'readout error', logical: 'logical error' };

const PENDING = '(text pending)';

// The kind follows the contract (an edge of [logLo, logHi] counts as inside); the text is a placeholder.
export function guessVerdict(tau, band) {
  if (!band || band.kind === 'none' || !Number.isFinite(tau) || !Number.isFinite(band.logLo) || !Number.isFinite(band.logHi)) {
    return { kind: 'none', text: PENDING };
  }
  const kind = tau < band.logLo ? 'below' : tau > band.logHi ? 'above' : 'inside';
  return { kind, text: PENDING };
}

export function overlapSentence() {
  return PENDING;
}

export function budgetFor(platformId, basis) {
  if (platformId !== 'trapped-ion' && platformId !== 'superconducting') return null;
  if (basis !== 'Z' && basis !== 'X') return null;
  return { readout: 0, idle: 0, gate: 0, crosstalk: 0, tau_us: 0 };
}

export function whySentence() {
  return PENDING;
}

// A fixed small object in the contract's shape; yMax is fixed at 0.012 (at least 1.15 times the largest hi).
export function twistData() {
  return {
    naive: { hard: { pL: 0.008, lo: 0.007, hi: 0.009 }, soft: { pL: 0.007, lo: 0.006, hi: 0.008 } },
    learned: { hard: { pL: 0.006, lo: 0.005, hi: 0.007 }, soft: { pL: 0.004, lo: 0.003, hi: 0.005 } },
    counts: { naive: 0, learned: 0, n: 0 },
    yMax: 0.012,
  };
}

export function twistCaption() {
  return PENDING;
}

export function twistFootnote() {
  return PENDING;
}
