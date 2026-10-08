// Gauss-Legendre quadrature on [-1, 1], mapped to [a, b].

const cache = new Map();

// Nodes (ascending) and weights of the n-point rule, by Newton iteration on P_n.
export function gaussLegendre(n) {
  if (!Number.isInteger(n) || n < 1) throw new Error(`gaussLegendre: n must be a positive integer, got ${n}`);
  if (cache.has(n)) return cache.get(n);
  const nodes = new Array(n);
  const weights = new Array(n);
  const m = Math.ceil(n / 2);
  for (let i = 0; i < m; i++) {
    // Initial guess for the i-th largest root.
    let x = Math.cos(Math.PI * (i + 0.75) / (n + 0.5));
    let dp = 1;
    for (let iter = 0; iter < 100; iter++) {
      // Three-term recurrence for P_n(x); dp is P_n'(x).
      let p0 = 1;
      let p1 = x;
      for (let k = 2; k <= n; k++) {
        const p2 = ((2 * k - 1) * x * p1 - (k - 1) * p0) / k;
        p0 = p1;
        p1 = p2;
      }
      const pn = n === 1 ? x : p1;
      const pPrev = n === 1 ? 1 : p0;
      dp = n * (x * pn - pPrev) / (x * x - 1);
      const dx = pn / dp;
      x -= dx;
      if (Math.abs(dx) < 1e-16) break;
    }
    // Recompute the derivative at the converged root for the weight.
    let q0 = 1;
    let q1 = x;
    for (let k = 2; k <= n; k++) {
      const q2 = ((2 * k - 1) * x * q1 - (k - 1) * q0) / k;
      q0 = q1;
      q1 = q2;
    }
    dp = n * (x * (n === 1 ? x : q1) - (n === 1 ? 1 : q0)) / (x * x - 1);
    const w = 2 / ((1 - x * x) * dp * dp);
    nodes[i] = -x;
    nodes[n - 1 - i] = x;
    weights[i] = w;
    weights[n - 1 - i] = w;
  }
  const rule = { nodes, weights };
  cache.set(n, rule);
  return rule;
}

export function integrate(f, a, b, n = 64) {
  const { nodes, weights } = gaussLegendre(n);
  const half = (b - a) / 2;
  const mid = (a + b) / 2;
  let s = 0;
  for (let i = 0; i < n; i++) s += weights[i] * f(mid + half * nodes[i]);
  return half * s;
}

// log of the integral of exp(logF) over [a, b], by log-sum-exp over the nodes.
// Returns -Infinity when every node value is -Infinity.
export function logIntegrate(logF, a, b, n = 64) {
  const { nodes, weights } = gaussLegendre(n);
  const half = (b - a) / 2;
  const mid = (a + b) / 2;
  const terms = new Array(n);
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const t = logF(mid + half * nodes[i]) + Math.log(weights[i]);
    terms[i] = t;
    if (t > max) max = t;
  }
  if (max === -Infinity) return -Infinity;
  if (max === Infinity) return Infinity;
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.exp(terms[i] - max);
  return max + Math.log(s) + Math.log(half);
}
