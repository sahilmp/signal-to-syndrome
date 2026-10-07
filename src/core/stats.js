// Confidence intervals: Wilson score interval for binomial proportions, and a
// percentile bootstrap for arbitrary statistics.

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
