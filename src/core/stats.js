// Confidence intervals: Wilson score interval for binomial proportions, a percentile
// bootstrap for arbitrary statistics, and cluster (quantum-shot) bootstraps of failure rates.

// Wilson score interval for k successes out of n at normal quantile z.
export function wilson(k, n, z = 1.96) {
  if (!Number.isInteger(n) || n <= 0) throw new Error(`wilson: n must be a positive integer, got ${n}`);
  if (!Number.isInteger(k) || k < 0 || k > n) throw new Error(`wilson: k must be an integer in 0..n, got ${k}`);
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / denom;
  return { p, lo: Math.max(0, center - half), hi: Math.min(1, center + half) };
}

// Linear interpolation between order statistics (type 7); sorted is ascending.
function quantile(sorted, q) {
  const h = (sorted.length - 1) * q;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

// Percentile bootstrap. Each of the B replicates calls statFn with an array of nItems
// indices drawn uniformly with replacement from 0..nItems-1. Returns the mean of the
// replicates and their 2.5th and 97.5th percentiles.
export function bootstrap(nItems, statFn, B, rng) {
  if (!Number.isInteger(nItems) || nItems <= 0) throw new Error(`bootstrap: nItems must be a positive integer, got ${nItems}`);
  if (!Number.isInteger(B) || B <= 0) throw new Error(`bootstrap: B must be a positive integer, got ${B}`);
  const vals = new Float64Array(B);
  for (let b = 0; b < B; b++) {
    const idx = new Array(nItems);
    for (let t = 0; t < nItems; t++) idx[t] = rng.int(nItems);
    vals[b] = statFn(idx);
  }
  let sum = 0;
  for (const v of vals) sum += v;
  const sorted = Float64Array.from(vals).sort();
  return { mean: sum / B, lo: quantile(sorted, 0.025), hi: quantile(sorted, 0.975) };
}

// failCounts[i] in 0..R: failed readout draws of quantum shot i (R draws per shot).
function checkFailCounts(name, failCounts, R) {
  if (!Number.isInteger(R) || R <= 0) throw new Error(`${name}: R must be a positive integer, got ${R}`);
  if (failCounts.length === 0) throw new Error(`${name}: failCounts must be non-empty`);
  for (let i = 0; i < failCounts.length; i++) {
    const f = failCounts[i];
    if (!Number.isInteger(f) || f < 0 || f > R) throw new Error(`${name}: failCounts[${i}] must be an integer in 0..${R}, got ${f}`);
  }
}

// Cluster (quantum-shot) bootstrap of a failure rate. The R readout draws of one quantum shot
// share its gate faults, so they are not independent; resampling whole shots keeps that
// correlation. Each of the B replicates draws nShots shot indices with replacement;
// rate = sum of their failCounts / (nShots * R). Returns the full-data rate and the 2.5th and
// 97.5th percentiles of the replicates.
export function clusterBootstrapRate(failCounts, R, B, rng) {
  checkFailCounts('clusterBootstrapRate', failCounts, R);
  const n = failCounts.length;
  let total = 0;
  for (let i = 0; i < n; i++) total += failCounts[i];
  const res = bootstrap(n, (idx) => {
    let s = 0;
    for (let t = 0; t < n; t++) s += failCounts[idx[t]];
    return s / (n * R);
  }, B, rng);
  return { rate: total / (n * R), lo: res.lo, hi: res.hi };
}

// Paired cluster bootstrap of rateA - rateB when A and B are the same quantum shots (index i
// is the same shot in both): every replicate uses the same resampled indices for A and B,
// so shot-to-shot variation common to both cancels. Returns { diff, lo, hi }.
export function pairedClusterDiff(failA, failB, R, B, rng) {
  checkFailCounts('pairedClusterDiff', failA, R);
  checkFailCounts('pairedClusterDiff', failB, R);
  const n = failA.length;
  if (failB.length !== n) throw new Error(`pairedClusterDiff: ${n} shots in A, ${failB.length} in B`);
  const delta = new Int32Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) {
    delta[i] = failA[i] - failB[i];
    total += delta[i];
  }
  const res = bootstrap(n, (idx) => {
    let s = 0;
    for (let t = 0; t < n; t++) s += delta[idx[t]];
    return s / (n * R);
  }, B, rng);
  return { diff: total / (n * R), lo: res.lo, hi: res.hi };
}
