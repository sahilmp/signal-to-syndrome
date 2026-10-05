# CLAUDE.md — Contract for Signal to Syndrome

This file is the contract for all code in this repository. Authority order: this file > DECISIONS.md > docs/*.md plans > the current prompt. If a prompt conflicts with this file, stop and say so.

## What the project is
An open-source lab, published and runnable on Qollab, showing how qubit-readout physics sets the logical error rate of a repetition-code memory. Circuits: Qiskit on IonQ's simulator (forte-1 noise). Readout models: classical, in JavaScript. Decoder: our own exact minimum-weight matching.

## Architecture rules
1. Core logic lives in `src/core/` as ES modules (package "type": "module"). No runtime dependencies. No DOM, network or file-system access in `src/core/`.
2. The user interface lives in `src/ui/` and imports from `src/core/`.
3. The shipped artefact is `dist/qollab/` (index.html, style.css, app.js), built by `tools/build.mjs` with esbuild into one IIFE with all data embedded. Nothing in `dist/` may load an external resource or call fetch, XMLHttpRequest, WebSocket or dynamic import().
4. Node scripts for builds, sweeps and checks live in `tools/` as .mjs files. They may read and write files.
5. Python appears only in `qollab/` (runs on Qollab: standard library plus qiskit, uses the pre-existing `backend` object, never constructs providers or reads API keys) and `validation/` (runs locally with %USERPROFILE%\venvs\s2s\Scripts\python.exe).

## Conventions
- Indexing in code is 0-based. Data qubits i = 0..d-1. Check j = 0..d-2 measures Z_j Z_{j+1}. Rounds k = 0..r-1. Detector layers k = 0..r, where layer r is the final layer computed from the data readout. Detector index = k*(d-1) + j. Boundary node index = (d-1)*(r+1).
- Classical-bit layout (fixed): check j of round k is classical bit k*(d-1) + j; data qubit i is classical bit (d-1)*r + i.
- Bit order: Qiskit little-endian. Classical bit 0 is the least significant bit of the integer (the rightmost character of a binary key). Banks store keys as lowercase hexadecimal without prefix. n_clbits <= 29, so parseInt(hex, 16) is exact.
- Logical observable: the Z value of data qubit 0. Observable edges are the edges representing a flip of data qubit 0.
- Idle errors: an X on data qubit i after round k (k = 0..r-2) flips m[k'][i-1] and m[k'][i] (checks that exist) for all k' > k, and flips x[i]. No idle error is applied after the last round, because the data are read out together with the last ancillas.
- Units: time in microseconds. Frequencies in parameter files are ordinary frequencies in MHz, converted to angular frequency 2*pi*f in rad/us at load. Count rates in counts per microsecond.
- Randomness: every function that draws random numbers takes an explicit rng from createRng(seed). Never use Math.random.
- Readout-model contract: measure(trueBit, rng) -> { hard, llr }; idleFlipProbability(); averageAssignmentError(). llr = ln[p(s|1)/p(s|0)]; +/-Infinity is allowed for perfect readout.
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
| A | qollab/*; validation/test_circuits.py; tools/assemble_bank.mjs; tools/sweep.mjs; src/core/readout/*; src/core/idle.js; src/core/calibrate.js; src/core/stats.js; src/core/sweep.js; src/core/quadrature.js; src/core/special.js; src/core/optimum.js; src/core/metrics.js; params/*; data/banks/*; data/raw/*; data/results/*; docs/notes_results.md; the tests for these files |
| B | package.json; package-lock.json; .gitignore; LICENSE; README.md; src/core/rng.js; src/core/bank.js; src/core/detectors.js; src/core/graph.js; src/core/matching.js; src/core/logical.js; src/ui/* (including stubs, bridges and features.js); tools/build.mjs; tools/release_check.mjs; tools/export_vectors.mjs; tools/make_fixtures.mjs; validation/pymatching_check.py; data/vectors/*; data/fixtures/*; docs/qollab_js_api_example.txt; the tests for these files |
| Both | CLAUDE.md; DECISIONS.md (own section only); docs/project_page.md (sections as assigned) |

## Module API (stable; changes need both people)
- rng.js (B): createRng(seed) -> { uniform(), normal(), exponential(rate), poisson(lambda), int(n) }.
- bank.js (B): validateBank(obj) (throws on error; extra fields allowed); bitsFromKey(hexKey, nClbits) -> Uint8Array; expandShots(bank) -> Uint8Array[]; split(shotBits, layout, d, r) -> { m: Uint8Array[] (r rows of length d-1), x: Uint8Array(d) }.
- detectors.js (B): computeDetectors(m, x, d, r) -> Uint8Array((d-1)*(r+1)).
- graph.js (B): buildGraph(d, r) -> { d, r, nDetectors, boundary, edges: [{ id, u, v, kind: "space" | "time", layer, dataQubit, check, round, observable }] }; weightFromP(p); weightFromLlr(llr); pFromLlr(llr); xorP(a, b).
- matching.js (B): decode(graph, weights, detectorBits) -> { flip, nDefects, exact, cost, paths }, where weights is a Float64Array indexed by edge id and paths is [{ a, b, edges }] with b = "B" for the boundary and edges the edge ids along the chosen path.
- logical.js (B): correctedLogical(xHat0, flip); isLogicalError(corrected, logical).
- Readout models (A): createFlatReadout({ epsilon }), createIonReadout(params, tau), createScReadout(params, tau). Each returns an object with measure(trueBit, rng) -> { hard, llr, ... }, idleFlipProbability() and averageAssignmentError(). The ion object also has the method countHistogram(bit, nSamples, rng) -> array of counts. The superconducting object also has the methods snr() and iqSamples(bit, n, rng) -> [{ i, q }].
- idle.js (A): applyX(m, x, d, r, i, k); injectIdle(m, x, d, r, p, rng).
- calibrate.js (A): estimatePGate(detectorArrays, d, r) -> { p, rate, nDetectors, nShots }.
- stats.js (A): wilson(k, n, z = 1.96) -> { p, lo, hi }; bootstrap(nItems, statFn, B, rng) -> { mean, lo, hi }.
- sweep.js (A): decodeShot({ shotBits, layout, d, r, readout, mode, pGate, rng }) -> { logicalError, corrected, flip, nDefects, exact, detectors, paths, hardAnc, hardData, llrAnc, llrData } (hardAnc and llrAnc have r rows of length d-1); runPoint({ bank, readout, mode, pGate, seed, maxShots }) -> { k, n, wilson, nonExact }; diagnostic(bank) -> 8-character hexadecimal string.
- optimum.js (A): findMinimum(xs, ys, { logX }); minimumWithBootstrap(xs, perShotMatrix, B, rng).
- metrics.js (A): perRound, perRoundToTotal, cycleTime, perMicrosecond, breakEven.

## Results format (s2s-results/1)
- Stages 1 to 3: { "schema": "s2s-results/1", "stage": 1 | 2 | 3, "platform": "flat" | "trapped-ion" | "superconducting", "x": { "name": "epsilon" | "tau_us", "values": [...] }, "series": [{ "d", "r", "mode": "hard" | "soft", "pL": [...], "lo": [...], "hi": [...], "n": [...] }], "assignment": { "belief": [...], "empirical": [...], "lo": [...], "hi": [...] } (stages 2 and 3), "optima": { "tauPhys": { "xMin", "atEdge" }, "tauLog": [{ "d", "mode", "xMin", "lo", "hi", "atEdge" }] } (stages 2 and 3), "params": {...}, "provenance": {...} }.
- Stage 4: { "schema": "s2s-results/1", "stage": 4, "platforms": { "trapped-ion": P, "superconducting": P }, "sensitivity": [{ "platform", "parameter", "scale", "C1", "C2", "C3", "C4" }], "provenance": {...} }, where P = { "tauLog": {...}, "perRound": { "hard", "soft" }, "perMicrosecond": { "hard", "soft" }, "breakEven": { "epsBar", "tau_us" } } and each C value is "holds", "flips" or "undetermined".
