# CLAUDE.md — Contract for Signal to Syndrome

This file is the contract for all code in this repository. Authority order: this file > DECISIONS.md > docs/*.md plans > the current prompt. If a prompt conflicts with this file, stop and say so.

Plans: `docs/signal-to-syndrome-team-checklist.md` and `docs/signal-to-syndrome-execution-checklist.md` (v2) govern all current work. The `-v1.md` files are a historical record; do not follow them.

## What the project is
An open-source lab, published and runnable on Qollab, showing how qubit-readout physics sets the logical error rate of repetition-code memories (bit-flip and phase-flip), as a comparison of two readout physics models at fixed gate noise. Circuits: Qiskit on IonQ's simulator (forte-1 noise), submitted in native gates. Readout models and idle physics: classical, in JavaScript. Decoder: our own exact minimum-weight matching on a naive graph (space and time edges, one calibrated rate) or a learned graph (space, time and diagonal edges, per-class rates learned from detector correlations).

## Architecture rules
1. Core logic lives in `src/core/` as ES modules (package "type": "module"). No runtime dependencies. No DOM, network or file-system access in `src/core/`.
2. The user interface lives in `src/ui/` and imports from `src/core/`.
3. The shipped artefact is `dist/qollab/` (index.html, main.css, main.js; index.html is a body fragment), built by `tools/build.mjs` with esbuild into one IIFE with all data embedded. Nothing in `dist/` may load an external resource or call fetch, XMLHttpRequest, WebSocket or dynamic import(). Only exception: when the liveRun feature is on, main.js begins with the single line `import * as s2sLive from 'qollab.live'; globalThis.s2sLive = s2sLive;` before the IIFE (`'live'` instead of `'qollab.live'` if D11 says so). It loads the Python helper qollab/live.py, which is uploaded to the main project with the three files (DECISIONS D11).
4. Node scripts for builds, sweeps and checks live in `tools/` as .mjs files. They may read and write files.
5. Python appears only in `qollab/` (runs on Qollab: standard library plus qiskit, uses the pre-existing `backend` object, never constructs providers or reads API keys; it may derive a native-gate backend with backend.with_name(backend.name, gateset="native", noise_model="forte-1") (DECISIONS D1)) and `validation/` (runs locally with %USERPROFILE%\venvs\s2s\Scripts\python.exe).

## Conventions
- Indexing in code is 0-based. Data qubits i = 0..d-1. Check j = 0..d-2 measures Z_j Z_{j+1} in the Z basis (bit-flip memory) and X_j X_{j+1} in the X basis (phase-flip memory). Rounds k = 0..r-1. Detector layers k = 0..r, where layer r is the final layer computed from the data readout. Detector index = k*(d-1) + j. Boundary node index = (d-1)*(r+1). Banks carry "basis": "Z" | "X"; absent means "Z".
- Classical-bit layout (fixed): check j of round k is classical bit k*(d-1) + j; data qubit i is classical bit (d-1)*r + i.
- Bit order: Qiskit little-endian. Classical bit 0 is the least significant bit of the integer (the rightmost character of a binary key). Banks store keys as lowercase hexadecimal without prefix. n_clbits <= 29, so parseInt(hex, 16) is exact.
- Logical observable: the value of data qubit 0 in the memory's basis (Z or X). Observable edges are the edges representing a flip of data qubit 0.
- Decoding graph: space edges (data qubit flips within a layer; data qubits 0 and d-1 join the boundary), time edges (wrong reports of m[k][j]), and, in the learned graph only, diagonal edges (k, j+1)-(k+1, j) for k = 0..r-1, j = 0..d-3: a fault on data qubit j+1 between its CNOT into check j and its CNOT into check j+1 in round k. Diagonal edges are never observable. Callers pass { diagonal } explicitly.
- Idle errors: an error on data qubit i after round k (k = 0..r-2) flips m[k'][i-1] and m[k'][i] (checks that exist) for all k' > k, and flips x[i]; in the X basis the error is a Z, with the same bit pattern. No idle error after the last round. Idle errors act on the true bits before readout. Probabilities for a wait tau: Z basis 1/2 (1 - exp(-tau/T1)); X basis 1/2 (1 - exp(-tau/T2)) with T2 <= 2*T1; ion crosstalk 1/2 (1 - exp(-Gamma_xt tau)) in either basis, combined with xorP.
- Units: time in microseconds. Frequencies in parameter files are ordinary frequencies in MHz, converted to angular frequency 2*pi*f in rad/us at load. Count rates in counts per microsecond.
- Randomness: every function that draws random numbers takes an explicit rng from createRng(seed). Never use Math.random.
- Readout-model contract: measure(trueBit, rng) -> { hard, llr }; idleFlipProbability(basis = "Z"); idleBreakdown(basis = "Z") -> { idle, crosstalk, total }; averageAssignmentError(). llr = ln[p(s|1)/p(s|0)]; +/-Infinity is allowed for perfect readout.
- Edge weights: w = ln[(1-p)/p] with p clamped to [1e-12, 0.5]; soft weights use p = 1/(1 + exp(|llr|)) for the readout part.

## Testing rules
- Node's built-in runner: `npm test` runs `node --test`. Test files are tests/*.test.js.
- Every test carries a comment that states, in words, the break it catches (for example "fails if classical bit 0 is read from the left end of the key").
- Boundary tests are non-vacuous: one case exactly on the boundary and one a fixed step past it, with different expected outcomes.
- Statistical tests use fixed seeds and tolerances of at least 4 standard errors; the comment states the formula.
- Never delete or weaken an existing test to make new code pass. Report the conflict instead.

## Scope rules
- Create or modify only the files named in the prompt. If another file must change, stop and explain why first.
- No new dependencies unless the prompt says so.
- Do not run git commands; the human commits.
- Do not invent Qollab APIs. For anything Qollab-specific use only DECISIONS.md and docs/qollab_js_api_example.txt; if they do not cover it, stop and ask.

## Report format (end every task with this)
1. Files created or changed.
2. Commands run, with summarized output (test counts, pass/fail).
3. Assumptions made.
4. Open issues and deviations from the prompt.

## Team rules (two people)
- Person A owns physics and data. Person B owns the decoder core, the interface and the platform work. Every prompt names its owner. Create or modify only files owned by that person (table below). If a change is needed in a file the other person owns, stop and write the request in the report instead.
- CLAUDE.md changes only with both people's agreement. In DECISIONS.md each person edits only their own section.
- Code may use the other person's modules only through the Module API below. The API changes only with both people's agreement.
- Stubs and fixtures (Person B) live only in src/ui/stubs/ and data/fixtures/; every fixture JSON contains "fixture": true. The interface reaches Person A's modules and data only through src/ui/bridge_core.js and src/ui/bridge_data.js. A feature may be switched on in src/ui/features.js only when every bridge line it needs points to Person A's real module or data; tools/release_check.mjs enforces this.

| Owner | Files |
|---|---|
| A | qollab/*; validation/test_circuits.py; tools/assemble_bank.mjs; tools/sweep.mjs; src/core/readout/*; src/core/idle.js; src/core/calibrate.js; src/core/dem.js; src/core/stats.js; src/core/sweep.js; src/core/quadrature.js; src/core/special.js; src/core/optimum.js; src/core/metrics.js; params/*; data/banks/*; data/raw/*; data/results/*; docs/notes_results.md; the tests for these files |
| B | package.json; package-lock.json; .gitignore; LICENSE; README.md; src/core/rng.js; src/core/bank.js; src/core/detectors.js; src/core/graph.js; src/core/matching.js; src/core/logical.js; src/ui/* (including stubs, bridges, features.js, tokens.css); tools/build.mjs; tools/release_check.mjs; tools/export_vectors.mjs; tools/make_fixtures.mjs; tools/curate.mjs; validation/pymatching_check.py; data/vectors/*; data/fixtures/*; data/curated/*; docs/qollab_js_api_example.txt; docs/screenshots/*; the tests for these files |
| Both | CLAUDE.md; DECISIONS.md (own section only); docs/project_page.md (sections as assigned); docs/notes_results.md (B: "Interface notes" section only) |

## Module API (stable; changes need both people)
- rng.js (B): createRng(seed) -> { uniform(), normal(), exponential(rate), poisson(lambda), int(n) }.
- bank.js (B): validateBank(obj) (throws on error; extra fields allowed); bitsFromKey(hexKey, nClbits) -> Uint8Array; expandShots(bank) -> Uint8Array[]; split(shotBits, layout, d, r) -> { m: Uint8Array[] (r rows of length d-1), x: Uint8Array(d) }.
- detectors.js (B): computeDetectors(m, x, d, r) -> Uint8Array((d-1)*(r+1)).
- graph.js (B): buildGraph(d, r, { diagonal = false } = {}) -> { d, r, nDetectors, boundary, edges: [{ id, u, v, kind: "space" | "time" | "diag", layer, dataQubit, check, round, observable }] }; space and time edges come first with the same ids as the naive graph; weightFromP(p); weightFromLlr(llr); pFromLlr(llr); xorP(a, b).
- matching.js (B): decode(graph, weights, detectorBits) -> { flip, nDefects, exact, cost, paths }, where weights is a Float64Array indexed by edge id and paths is [{ a, b, edges }] with b = "B" for the boundary and edges the edge ids along the chosen path.
- logical.js (B): correctedLogical(xHat0, flip); isLogicalError(corrected, logical).
- Readout models (A): createFlatReadout({ epsilon }), createIonReadout(params, tau, { crosstalkRate } = {}), createScReadout(params, tau). Each returns measure(trueBit, rng) -> { hard, llr, ... }, idleFlipProbability(basis = "Z"), idleBreakdown(basis = "Z") -> { idle, crosstalk, total }, averageAssignmentError(). Ion: countHistogram(bit, nSamples, rng). Superconducting: snr(), iqSamples(bit, n, rng).
- idle.js (A): applyX(m, x, d, r, i, k); injectIdle(m, x, d, r, p, rng).
- calibrate.js (A): estimatePGate(detectorArrays, d, r) -> { p, rate, nDetectors, nShots } (naive model, unchanged).
- dem.js (A): pairRate(xi, xj, xij); estimateEdgeRates(detectorArrays, d, r) -> { classes: { space, spaceBoundary, time, diag }, counts, pij, firing, antiDiag, nShots }; ratesFromBanks(banks) -> the same, pooled over banks of equal d, r, basis.
- stats.js (A): wilson(k, n, z = 1.96) -> { p, lo, hi }; bootstrap(nItems, statFn, B, rng) -> { mean, lo, hi }.
- sweep.js (A): decodeShot({ shotBits, layout, d, r, readout, mode, noise, basis, rng, logical = 0 }) with noise = { model: "naive", pGate } | { model: "learned", rates }; pGate alone is accepted as the naive model; returns { logicalError, corrected, flip, nDefects, exact, detectors, paths, hardAnc, hardData, llrAnc, llrData }; runPoint({ bank, readout, mode, noise, seed, maxShots }) -> { k, n, wilson, nonExact }; diagnostic(bank, { decoder = "naive" } = {}) -> 8-character hexadecimal string (naive: V9, learned: V9L).
- optimum.js (A): findMinimum(xs, ys, { logX }); minimumWithBootstrap(xs, perShotMatrix, B, rng).
- metrics.js (A): perRound, perRoundToTotal, cycleTime(card, tau, d), perMicrosecond, roundsPerSecond, tradeoffCurve, breakEven.

## Results format (s2s-results/1)
- Stages 1 to 3: { "schema": "s2s-results/1", "stage": 1 | 2 | 3, "platform": "flat" | "trapped-ion" | "superconducting", "x": { "name": "epsilon" | "tau_us", "values": [...] }, "series": [{ "d", "r", "mode": "hard" | "soft", "pL": [...], "lo": [...], "hi": [...], "n": [...] }], "assignment": { "belief": [...], "empirical": [...], "lo": [...], "hi": [...] } (stages 2 and 3), "optima": { "tauPhys": { "xMin", "atEdge" }, "tauLog": [{ "d", "mode", "xMin", "lo", "hi", "atEdge" }] } (stages 2 and 3), "params": {...}, "provenance": {...} }.
- Stage 4: { "schema": "s2s-results/1", "stage": 4, "platforms": { "trapped-ion": P, "superconducting": P }, "sensitivity": [{ "platform", "parameter", "scale", "C1", "C2", "C3", "C4" }], "provenance": {...} }, where P = { "tauLog": {...}, "perRound": { "hard", "soft" }, "perMicrosecond": { "hard", "soft" }, "breakEven": { "epsBar", "tau_us" } } and each C value is "holds", "flips" or "undetermined".

Results formats are s2s-results/1 (v1 fields) plus the v2 fields in docs/signal-to-syndrome-team-checklist.md, Appendix U4. New fields are additive; v1 readers ignore them.

## Integrity rules (v2)
- Never rewrite pushed history, amend pushed commits, force push or change dates.
- Every number on the page or in the README comes from data/results, params or DECISIONS, with a source comment.
- The comparison is always described as two readout physics models at fixed gate noise.
