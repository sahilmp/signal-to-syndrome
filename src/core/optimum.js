// Locating the minimum of a curve sampled on a grid, and a bootstrap interval for its
// location when every grid value is a mean over the same quantum shots.

import { bootstrap } from './stats.js';

// Least-squares quadratic y = c0 + c1 u + c2 u^2 through the points (u, y); returns
// [c0, c1, c2], or null when the normal equations are singular.
function fitQuadratic(us, ys) {
  // Normal equations A c = b with A[i][j] = sum u^(i+j), b[i] = sum y u^i.
  const s = [0, 0, 0, 0, 0];
  const b = [0, 0, 0];
  for (let t = 0; t < us.length; t++) {
    let pw = 1;
    for (let k = 0; k <= 4; k++) {
      s[k] += pw;
      if (k <= 2) b[k] += ys[t] * pw;
      pw *= us[t];
    }
  }
  const A = [[s[0], s[1], s[2], b[0]], [s[1], s[2], s[3], b[1]], [s[2], s[3], s[4], b[2]]];
  // Gaussian elimination with partial pivoting.
  for (let col = 0; col < 3; col++) {
    let piv = col;
    for (let row = col + 1; row < 3; row++) if (Math.abs(A[row][col]) > Math.abs(A[piv][col])) piv = row;
    if (Math.abs(A[piv][col]) < 1e-300) return null;
    [A[col], A[piv]] = [A[piv], A[col]];
    for (let row = col + 1; row < 3; row++) {
      const f = A[row][col] / A[col][col];
      for (let k = col; k < 4; k++) A[row][k] -= f * A[col][k];
    }
  }
  const c = [0, 0, 0];
  for (let row = 2; row >= 0; row--) {
    let v = A[row][3];
    for (let k = row + 1; k < 3; k++) v -= A[row][k] * c[k];
    c[row] = v / A[row][row];
  }
  return c;
}

// Minimum of ys over the grid xs (ascending). The lowest grid point (the first one on
// ties) and its neighbours are fitted with a quadratic in u = ln x (logX, the default) or
// in u = x: by default the parabola through the lowest point and its two neighbours
// (nPoints = 3); nPoints = 5 is a least-squares fit over up to two neighbours on each side.
// The 5-point fit is pulled by steep, asymmetric flanks (the ion curves fall by decades to
// the left of the minimum and rise slowly to the right), so it is not the default. If the
// lowest point is the first or the last grid point there is no interior minimum: atEdge is
// true and xMin is that grid point. Otherwise xMin is the vertex of the fit, kept between
// the two neighbouring grid points; if the fit does not open upwards, xMin is the lowest
// grid point.
export function findMinimum(xs, ys, { logX = true, nPoints = 3 } = {}) {
  if (nPoints !== 3 && nPoints !== 5) throw new Error(`findMinimum: nPoints must be 3 or 5, got ${nPoints}`);
  const n = xs.length;
  if (n === 0 || ys.length !== n) throw new Error(`findMinimum: xs and ys must be non-empty and of equal length (${n}, ${ys.length})`);
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(xs[i]) || !Number.isFinite(ys[i])) throw new Error(`findMinimum: non-finite value at index ${i}`);
    if (logX && !(xs[i] > 0)) throw new Error(`findMinimum: xs must be positive with logX, got ${xs[i]}`);
    if (i > 0 && !(xs[i] > xs[i - 1])) throw new Error('findMinimum: xs must be strictly ascending');
  }
  let i0 = 0;
  for (let i = 1; i < n; i++) if (ys[i] < ys[i0]) i0 = i;
  if (i0 === 0 || i0 === n - 1) return { xMin: xs[i0], yMin: ys[i0], atEdge: true };

  const toU = logX ? Math.log : (x) => x;
  const fromU = logX ? Math.exp : (u) => u;
  // Centre u on the lowest point for a well-conditioned fit.
  const u0 = toU(xs[i0]);
  const half = (nPoints - 1) / 2;
  const lo = Math.max(0, i0 - half);
  const hi = Math.min(n - 1, i0 + half);
  const us = [];
  const yw = [];
  for (let i = lo; i <= hi; i++) {
    us.push(toU(xs[i]) - u0);
    yw.push(ys[i]);
  }
  const c = fitQuadratic(us, yw);
  if (c === null || !(c[2] > 0)) return { xMin: xs[i0], yMin: ys[i0], atEdge: false };
  const uLeft = toU(xs[i0 - 1]) - u0;
  const uRight = toU(xs[i0 + 1]) - u0;
  const uStar = Math.min(uRight, Math.max(uLeft, -c[1] / (2 * c[2])));
  return { xMin: fromU(uStar + u0), yMin: c[0] + c[1] * uStar + c[2] * uStar * uStar, atEdge: false };
}

// perShotMatrix[g][s] is the value of quantum shot s at grid point g (the same shot index
// at every grid point). The curve is the mean over shots at each grid point. Each of the B
// replicates resamples shot indices with replacement (the same resample at every grid
// point), recomputes the curve and locates its minimum. Returns the minimum of the full
// curve (xMin, yMin, atEdge), the 2.5th and 97.5th percentiles of the replicate minima
// (lo, hi), and the fraction of replicates whose minimum lies at an edge of the grid.
export function minimumWithBootstrap(xs, perShotMatrix, B, rng, { logX = true, nPoints = 3 } = {}) {
  const nGrid = xs.length;
  if (perShotMatrix.length !== nGrid) throw new Error(`minimumWithBootstrap: ${perShotMatrix.length} rows for ${nGrid} grid points`);
  const nShots = perShotMatrix[0].length;
  for (const row of perShotMatrix) {
    if (row.length !== nShots) throw new Error('minimumWithBootstrap: every row must have the same number of shots');
  }
  const curve = (idx) => {
    const ys = new Array(nGrid);
    for (let g = 0; g < nGrid; g++) {
      const row = perShotMatrix[g];
      let sum = 0;
      for (const s of idx) sum += row[s];
      ys[g] = sum / idx.length;
    }
    return ys;
  };
  const all = Array.from({ length: nShots }, (_, s) => s);
  const full = findMinimum(xs, curve(all), { logX, nPoints });
  let nEdge = 0;
  const bs = bootstrap(nShots, (idx) => {
    const m = findMinimum(xs, curve(idx), { logX, nPoints });
    if (m.atEdge) nEdge++;
    return m.xMin;
  }, B, rng);
  return { xMin: full.xMin, yMin: full.yMin, atEdge: full.atEdge, lo: bs.lo, hi: bs.hi, fractionAtEdge: nEdge / B };
}
