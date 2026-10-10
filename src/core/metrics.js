// Stage 4 comparison metrics: per-round logical error from the error after r rounds (and the
// inverse), the QEC cycle time of a platform, rounds per second and the trade-off curve, the
// error per microsecond, the C3 dominance rule, and the break-even point where d = 5 starts
// to beat d = 3.

function checkRounds(r, name) {
  if (!Number.isInteger(r) || r < 1) throw new Error(`${name}: r must be an integer >= 1, got ${r}`);
}

// Per-round error eps from the logical error pL after r independent rounds:
// eps = 0.5 (1 - (1 - 2 pL)^(1/r)), the inverse of compounding r rounds (perRoundToTotal).
// Written with log1p/expm1 so that small pL keeps full relative precision. pL >= 0.5 is a
// fully random outcome after r rounds and gives 0.5.
export function perRound(pL, r) {
  checkRounds(r, 'perRound');
  if (!(pL >= 0 && pL <= 1)) throw new Error(`perRound: pL must be in [0, 1], got ${pL}`);
  if (pL >= 0.5) return 0.5;
  return -0.5 * Math.expm1(Math.log1p(-2 * pL) / r);
}

// Logical error after r independent rounds of per-round error eps: 0.5 (1 - (1 - 2 eps)^r).
export function perRoundToTotal(eps, r) {
  checkRounds(r, 'perRoundToTotal');
  if (!(eps >= 0 && eps <= 0.5)) throw new Error(`perRoundToTotal: eps must be in [0, 0.5], got ${eps}`);
  return -0.5 * Math.expm1(r * Math.log1p(-2 * eps));
}

// Parameter cards store { value, source }; plain numbers are accepted too.
const cardValue = (card, name) => {
  const p = card[name];
  return p !== null && typeof p === 'object' && 'value' in p ? p.value : p;
};

function cardNumber(card, name) {
  const v = cardValue(card, name);
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
    throw new Error(`cycleTime: ${name} must be a finite number >= 0, got ${v}`);
  }
  return v;
}

// Two-qubit gate layers per round: a number, or the one accepted expression "2*(d-1)" (the
// 2(d - 1) CNOTs of a repetition-code round run one after another; DECISIONS E8), which
// needs the distance d. Any other expression throws: the card is data, never evaluated code.
const SEQUENTIAL_LAYERS = '2*(d-1)';
function gateLayers(card, d) {
  const v = cardValue(card, 'gate_layers_per_round');
  if (typeof v === 'string') {
    if (v.replace(/\s+/g, '') !== SEQUENTIAL_LAYERS) {
      throw new Error(`cycleTime: gate_layers_per_round expression "${v}" is not supported (only "${SEQUENTIAL_LAYERS}")`);
    }
    if (!Number.isInteger(d) || d < 2) throw new Error(`cycleTime: gate_layers_per_round "${v}" needs an integer distance d >= 2, got ${d}`);
    return 2 * (d - 1);
  }
  return cardNumber(card, 'gate_layers_per_round');
}

// QEC cycle time in microseconds: layers * two_qubit_gate_us + tau + reset_us, with layers =
// gate_layers_per_round (a number, or "2*(d-1)" evaluated at d). `card` is one platform's entry
// of params/cycle.json; tau is the readout time in us; d is needed only by the expression.
export function cycleTime(card, tau, d) {
  if (card === null || typeof card !== 'object') throw new Error('cycleTime: card must be an object');
  if (typeof tau !== 'number' || !Number.isFinite(tau) || tau < 0) throw new Error(`cycleTime: tau must be a finite number >= 0, got ${tau}`);
  return gateLayers(card, d) * cardNumber(card, 'two_qubit_gate_us') + tau + cardNumber(card, 'reset_us');
}

// QEC rounds per second for a cycle time in microseconds: 1e6 / Tcyc_us.
export function roundsPerSecond(Tcyc_us) {
  if (!(Tcyc_us > 0) || !Number.isFinite(Tcyc_us)) throw new Error(`roundsPerSecond: Tcyc_us must be a positive finite number, got ${Tcyc_us}`);
  return 1e6 / Tcyc_us;
}

// The trade-off curve of one (platform, d, mode): at each readout time tau, the rounds per
// second 1e6 / cycleTime(card, tau, d) and the per-round error perRound(pL, r).
export function tradeoffCurve(taus, pLs, r, card, d) {
  if (taus.length !== pLs.length) throw new Error(`tradeoffCurve: taus and pLs must have equal length (${taus.length}, ${pLs.length})`);
  return {
    tau: [...taus],
    roundsPerSecond: taus.map((tau) => roundsPerSecond(cycleTime(card, tau, d))),
    perRound: pLs.map((pL) => perRound(pL, r)),
  };
}

// C3 dominance rule (team checklist Appendix U4), on two arms' trade-off points at their own
// tau*_log: { perRound, lo, hi, roundsPerSecond }. Arm A dominates if its per-round error is
// lower beyond the intervals (A.hi < B.lo) and its rounds per second higher. Returns "A", "B"
// or null (neither dominates). Exported for sweep.mjs; not part of the Module API.
export function dominance(a, b) {
  for (const [name, p] of [['A', a], ['B', b]]) {
    if (![p.perRound, p.lo, p.hi, p.roundsPerSecond].every(Number.isFinite)) throw new Error(`dominance: arm ${name} needs finite perRound, lo, hi and roundsPerSecond`);
  }
  if (a.hi < b.lo && a.roundsPerSecond > b.roundsPerSecond) return 'A';
  if (b.hi < a.lo && b.roundsPerSecond > a.roundsPerSecond) return 'B';
  return null;
}

// Logical error per microsecond of wall-clock time: eps / Tcyc.
export function perMicrosecond(eps, Tcyc) {
  if (!Number.isFinite(eps)) throw new Error(`perMicrosecond: eps must be finite, got ${eps}`);
  if (!(Tcyc > 0) || !Number.isFinite(Tcyc)) throw new Error(`perMicrosecond: Tcyc must be a positive finite number, got ${Tcyc}`);
  return eps / Tcyc;
}

// The first sign change of yD5 - yD3, scanning the arrays in their given order (for Stage 4
// that is ascending tau, so xs need not be monotone). Returns { x, index, fraction }: the
// crossing lies between points index and index + 1 at the given fraction of the way, and x is
// the linear interpolation of xs there. A difference of exactly 0 at a point is a crossing at
// that point (fraction 0). Returns null if the difference never changes sign. Exported for
// sweep.mjs (which also needs the tau of the crossing); not part of the Module API.
export function breakEvenDetail(xs, yD3, yD5) {
  const n = xs.length;
  if (yD3.length !== n || yD5.length !== n) throw new Error(`breakEven: xs, yD3 and yD5 must have equal length (${n}, ${yD3.length}, ${yD5.length})`);
  for (let i = 0; i < n; i++) {
    if (![xs[i], yD3[i], yD5[i]].every(Number.isFinite)) throw new Error(`breakEven: non-finite value at index ${i}`);
  }
  for (let i = 0; i < n; i++) {
    const a = yD5[i] - yD3[i];
    if (a === 0) return { x: xs[i], index: i, fraction: 0 };
    if (i === n - 1) break;
    const b = yD5[i + 1] - yD3[i + 1];
    if (a * b < 0) {
      const fraction = a / (a - b);
      return { x: xs[i] + fraction * (xs[i + 1] - xs[i]), index: i, fraction };
    }
  }
  return null;
}

// The x where yD5 - yD3 changes sign (linear interpolation), or null if it never does.
export function breakEven(xs, yD3, yD5) {
  const c = breakEvenDetail(xs, yD3, yD5);
  return c === null ? null : c.x;
}
