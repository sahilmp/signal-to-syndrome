// Idle errors on data qubits during readout of the ancillas (CLAUDE.md, Conventions).
// An X on data qubit i after round k flips m[k'][i-1] and m[k'][i] (checks that exist)
// for every later round k' > k, and flips the final data readout x[i].

function copy(m, x) {
  return { m: m.map((row) => Uint8Array.from(row)), x: Uint8Array.from(x) };
}

function check(m, x, d, r) {
  if (!Number.isInteger(d) || d < 2) throw new Error(`idle: d must be an integer >= 2, got ${d}`);
  if (!Number.isInteger(r) || r < 1) throw new Error(`idle: r must be an integer >= 1, got ${r}`);
  if (m.length !== r) throw new Error(`idle: m must have ${r} rows, got ${m.length}`);
  for (const row of m) {
    if (row.length !== d - 1) throw new Error(`idle: each m row must have length ${d - 1}, got ${row.length}`);
  }
  if (x.length !== d) throw new Error(`idle: x must have length ${d}, got ${x.length}`);
}

// In place, no validation (callers validate).
function flipInPlace(m, x, d, r, i, k) {
  for (let kk = k + 1; kk < r; kk++) {
    if (i - 1 >= 0) m[kk][i - 1] ^= 1;
    if (i <= d - 2) m[kk][i] ^= 1;
  }
  x[i] ^= 1;
}

// One X on data qubit i after round k (k = 0..r-1; k = r-1 flips only x[i]).
// Returns new arrays { m, x }; the inputs are not mutated.
export function applyX(m, x, d, r, i, k) {
  check(m, x, d, r);
  if (!Number.isInteger(i) || i < 0 || i >= d) throw new Error(`applyX: i must be in 0..${d - 1}, got ${i}`);
  if (!Number.isInteger(k) || k < 0 || k >= r) throw new Error(`applyX: k must be in 0..${r - 1}, got ${k}`);
  const out = copy(m, x);
  flipInPlace(out.m, out.x, d, r, i, k);
  return out;
}

// Applies an X independently with probability p for every data qubit i and every round
// k = 0..r-2 (no idle error after the last round). Draw order: k outer, i inner, one
// rng.uniform() per (k, i). Returns new arrays { m, x }; the inputs are not mutated.
export function injectIdle(m, x, d, r, p, rng) {
  check(m, x, d, r);
  if (!(p >= 0 && p <= 1)) throw new Error(`injectIdle: p must be in [0, 1], got ${p}`);
  const out = copy(m, x);
  for (let k = 0; k <= r - 2; k++) {
    for (let i = 0; i < d; i++) {
      if (rng.uniform() < p) flipInPlace(out.m, out.x, d, r, i, k);
    }
  }
  return out;
}
