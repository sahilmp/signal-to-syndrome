// Stage 4 comparison metrics: per-round logical error from the error after r rounds (and the
// inverse), the QEC cycle time of a platform, the error per microsecond, and the break-even
// point where d = 5 starts to beat d = 3.

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
function cardNumber(card, name) {
  const p = card[name];
  const v = p !== null && typeof p === 'object' && 'value' in p ? p.value : p;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
    throw new Error(`cycleTime: ${name} must be a finite number >= 0, got ${v}`);
  }
  return v;
}

// QEC cycle time in microseconds: gate_layers_per_round * two_qubit_gate_us + tau + reset_us.
// `card` is one platform's entry of params/cycle.json; tau is the readout time in us.
export function cycleTime(card, tau) {
  if (card === null || typeof card !== 'object') throw new Error('cycleTime: card must be an object');
  if (typeof tau !== 'number' || !Number.isFinite(tau) || tau < 0) throw new Error(`cycleTime: tau must be a finite number >= 0, got ${tau}`);
  return cardNumber(card, 'gate_layers_per_round') * cardNumber(card, 'two_qubit_gate_us') + tau + cardNumber(card, 'reset_us');
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
