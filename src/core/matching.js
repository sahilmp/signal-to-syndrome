// Minimum-weight matching decoder. Each lit detector is matched either to another
// lit detector or to the boundary, along shortest paths in the decoding graph.
// Up to EXACT_MAX defects the matching is exact (dynamic programming over subsets);
// above that a greedy matching is used and exact = false.

const EXACT_MAX = 20;
const BOUNDARY = 'B';

// Adjacency lists, built once per graph: for node n, a flat list of [neighbour, edgeId].
const adjacencyCache = new WeakMap();
function adjacency(graph) {
  let adj = adjacencyCache.get(graph);
  if (adj) return adj;
  adj = Array.from({ length: graph.nDetectors + 1 }, () => []);
  for (const e of graph.edges) {
    adj[e.u].push(e.v, e.id);
    adj[e.v].push(e.u, e.id);
  }
  adjacencyCache.set(graph, adj);
  return adj;
}

// Binary min-heap of [dist, node], ordered by dist then node index.
function heapLess(a, b) {
  return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
}
function heapPush(h, item) {
  h.push(item);
  let i = h.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (!heapLess(h[i], h[p])) break;
    [h[i], h[p]] = [h[p], h[i]];
    i = p;
  }
}
function heapPop(h) {
  const top = h[0];
  const last = h.pop();
  if (h.length > 0) {
    h[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < h.length && heapLess(h[l], h[m])) m = l;
      if (r < h.length && heapLess(h[r], h[m])) m = r;
      if (m === i) break;
      [h[i], h[m]] = [h[m], h[i]];
      i = m;
    }
  }
  return top;
}

// Distances closer than this (relative) count as ties, so that floating-point
// summation order does not decide between paths of equal weight.
const TIE_TOL = 1e-12;
function sameDist(a, b) {
  return Math.abs(a - b) <= TIE_TOL * Math.max(1, Math.abs(a), Math.abs(b));
}

// Dijkstra from src over all nodes (boundary included). Ties are broken by lower
// observable parity, then by lower predecessor index. Infinity edges are skipped.
function dijkstra(graph, adj, weights, src) {
  const n = graph.nDetectors + 1;
  const dist = new Float64Array(n).fill(Infinity);
  const parity = new Uint8Array(n);
  const pred = new Int32Array(n).fill(-1);
  const predEdge = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  const edges = graph.edges;
  dist[src] = 0;
  const heap = [[0, src]];
  while (heap.length > 0) {
    const [du, u] = heapPop(heap);
    if (done[u] || du !== dist[u]) continue;
    done[u] = 1;
    const list = adj[u];
    for (let t = 0; t < list.length; t += 2) {
      const v = list[t];
      if (done[v]) continue;
      const id = list[t + 1];
      const w = weights[id];
      if (w === Infinity) continue;
      const nd = du + w;
      const np = parity[u] ^ (edges[id].observable ? 1 : 0);
      let better;
      if (dist[v] === Infinity) better = true;
      else if (sameDist(nd, dist[v])) better = np < parity[v] || (np === parity[v] && u < pred[v]);
      else better = nd < dist[v];
      if (better) {
        dist[v] = nd;
        parity[v] = np;
        pred[v] = u;
        predEdge[v] = id;
        heapPush(heap, [nd, v]);
      }
    }
  }
  return { dist, parity, predEdge, pred };
}

// Edge ids along the shortest-path tree from its source to target, in order source -> target.
function pathEdges(tree, target) {
  const out = [];
  for (let v = target; tree.pred[v] !== -1; v = tree.pred[v]) out.push(tree.predEdge[v]);
  return out.reverse();
}

function checkInputs(graph, weights, detectorBits) {
  if (!weights || weights.length !== graph.edges.length) {
    throw new Error(`decode: weights must have one entry per edge (${graph.edges.length}), got ${weights ? weights.length : weights}`);
  }
  for (let i = 0; i < weights.length; i++) {
    if (!(weights[i] >= 0)) throw new Error(`decode: weight of edge ${i} must be non-negative, got ${weights[i]}`);
  }
  if (!detectorBits || detectorBits.length !== graph.nDetectors) {
    throw new Error(`decode: detectorBits must have length ${graph.nDetectors}, got ${detectorBits ? detectorBits.length : detectorBits}`);
  }
}

// Exact minimum-weight matching. dp[mask] is the cheapest way to resolve the defects
// not in mask; the lowest unresolved defect goes to the boundary or to a higher
// unresolved defect. choice[mask] = -1 for the boundary, else the partner index.
function matchExact(n, pairCost, boundaryCost) {
  const full = (1 << n) - 1;
  const dp = new Float64Array(1 << n);
  const choice = new Int8Array(1 << n);
  dp[full] = 0;
  for (let mask = full - 1; mask >= 0; mask--) {
    let i = 0;
    while (mask & (1 << i)) i++;
    const mi = mask | (1 << i);
    let best = boundaryCost[i] + dp[mi];
    let bestJ = -1;
    for (let j = i + 1; j < n; j++) {
      if (mask & (1 << j)) continue;
      const c = pairCost[i * n + j] + dp[mi | (1 << j)];
      if (c < best) {
        best = c;
        bestJ = j;
      }
    }
    dp[mask] = best;
    choice[mask] = bestJ;
  }
  const pairs = [];
  let mask = 0;
  while (mask !== full) {
    let i = 0;
    while (mask & (1 << i)) i++;
    const j = choice[mask];
    pairs.push([i, j]);
    mask |= 1 << i;
    if (j >= 0) mask |= 1 << j;
  }
  return pairs;
}

// Greedy matching: take the cheapest remaining option (pair or boundary) whose
// defects are all still unmatched. Ties go to the earlier option in the list.
function matchGreedy(n, pairCost, boundaryCost) {
  const options = [];
  for (let i = 0; i < n; i++) {
    options.push([boundaryCost[i], i, -1]);
    for (let j = i + 1; j < n; j++) options.push([pairCost[i * n + j], i, j]);
  }
  options.forEach((o, idx) => o.push(idx));
  options.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[3] - b[3]));
  const used = new Uint8Array(n);
  const pairs = [];
  let left = n;
  for (const [, i, j] of options) {
    if (left === 0) break;
    if (used[i] || (j >= 0 && used[j])) continue;
    pairs.push([i, j]);
    used[i] = 1;
    left--;
    if (j >= 0) {
      used[j] = 1;
      left--;
    }
  }
  return pairs;
}

export function decode(graph, weights, detectorBits) {
  checkInputs(graph, weights, detectorBits);
  const lit = [];
  for (let i = 0; i < detectorBits.length; i++) if (detectorBits[i]) lit.push(i);
  const n = lit.length;
  if (n === 0) return { flip: 0, nDefects: 0, exact: true, cost: 0, paths: [] };

  const adj = adjacency(graph);
  const B = graph.boundary;
  const trees = lit.map((src) => dijkstra(graph, adj, weights, src));
  const pairCost = new Float64Array(n * n);
  const pairParity = new Uint8Array(n * n);
  const boundaryCost = new Float64Array(n);
  const boundaryParity = new Uint8Array(n);
  for (let a = 0; a < n; a++) {
    const t = trees[a];
    boundaryCost[a] = t.dist[B];
    boundaryParity[a] = t.parity[B];
    for (let b = a + 1; b < n; b++) {
      pairCost[a * n + b] = t.dist[lit[b]];
      pairParity[a * n + b] = t.parity[lit[b]];
    }
  }

  const exact = n <= EXACT_MAX;
  const pairs = exact ? matchExact(n, pairCost, boundaryCost) : matchGreedy(n, pairCost, boundaryCost);

  let flip = 0;
  let cost = 0;
  const paths = [];
  for (const [i, j] of pairs) {
    if (j < 0) {
      flip ^= boundaryParity[i];
      cost += boundaryCost[i];
      paths.push({ a: lit[i], b: BOUNDARY, edges: pathEdges(trees[i], B) });
    } else {
      flip ^= pairParity[i * n + j];
      cost += pairCost[i * n + j];
      paths.push({ a: lit[i], b: lit[j], edges: pathEdges(trees[i], lit[j]) });
    }
  }
  return { flip, nDefects: n, exact, cost, paths };
}
