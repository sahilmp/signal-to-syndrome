# Signal to Syndrome

## Authors

- Soumyajit Pal: physics and data
- Sahil Prabhudesai: decoder, interface and platform

## About

Signal to Syndrome is an open-source lab, published and runnable on Qollab, that shows how qubit-readout physics sets the logical error rate of a repetition-code memory. The circuits are written in Qiskit and run on IonQ's simulator with the forte-1 noise model, submitted in native gates so that IonQ's optimiser does not remove them. Readout is modelled classically in JavaScript (flat, trapped-ion and superconducting models), and the syndromes are decoded by our own exact minimum-weight matching decoder.

The page has five levels: be the decoder (d = 3, one round), time as a dimension (three rounds on the space-time grid), the readout-time trade-off on a trapped ion and a superconducting qubit, hard against soft decoding, and a side-by-side comparison of the two platforms. The full write-up, with results and limitations, is in [docs/project_page.md](docs/project_page.md); screenshots of every level are in [docs/screenshots/](docs/screenshots/).

## Run it on Qollab

- **Main project (the lab):** https://qollab.xyz/u/SQuant/main-project. Open it in a Chromium-based browser (Chrome, Edge or Opera) and run it; the page needs no setup and no network access, because all data are embedded.
- **Bank generator (the IonQ-simulator circuits that produced the data):** https://qollab.xyz/u/SQuant/signal-to-syndrome-bank-genera. One configuration per run, chosen by a variable at the top of the script; the bank is printed between `BEGIN_BANK` and `END_BANK`.
- **Live run (optional):** in the main project, pick IonQ Forte 1 in Qollab's Select QPU dialog, open Level 4 and press the live-run button. Each press submits one new d = 3, r = 3 job (200 shots) to the IonQ simulator with the forte-1 noise model, in native gates, through the Python helper `live.py`, which is uploaded next to the three page files.

## Rebuild locally

Requires Node.js 20 or later.

```bash
npm install
npm test
npm run build
npm run check
```

`npm run build` writes `dist/qollab/` (`index.html`, `main.css`, `main.js`), the three files uploaded to the main Qollab project together with `qollab/live.py` (uploaded at the top level as `live.py`). It also writes `dist/local/preview.html`, a single file that opens in a browser without Qollab (the live run is unavailable there). `npm run check` runs the release check (no network calls, size limit, attribution, licence, valid banks).

To rerun the analysis: `node tools/sweep.mjs --stage 1` (and `--stage 2`, `--stage 3`, `--stage 4`) regenerates `data/results/*.json`; `node tools/sweep.mjs --diag` prints the V9 fingerprint. Local Python validation (V2, V3) uses a virtual environment with `numpy qiskit pymatching pytest`: `validation/pymatching_check.py` (after `node tools/export_vectors.mjs --n 20000 --seed 1`) and `pytest validation/test_circuits.py`.

## Repository layout

- `src/core/`: core logic as ES modules, no runtime dependencies: seeded random numbers, bank parsing, detectors, decoding graph, matching decoder, statistics, sweeps, and the readout models in `src/core/readout/`
- `src/ui/`: user interface (levels 1–5, charts, live-run panel), with the bridges to the core and data and the feature switches; stubs in `src/ui/stubs/`
- `tools/`: Node scripts for the build, sweeps, release check, test vectors and fixtures
- `tests/`: Node test files (`*.test.js`), run with `npm test`
- `qollab/`: Python that runs on Qollab (bank generator, live-run helper)
- `validation/`: local Python validation (PyMatching comparison, circuit tests)
- `data/`: measurement banks from the IonQ simulator, results, test vectors and fixtures
- `params/`: parameter cards (trapped ion, superconducting, cycle times), with a source for every value
- `docs/`: project page, results notes, screenshots, and the planning documents written before the build window

## Methods implemented and sources

<!-- Drafted by Person B from the code and docs/project_page.md for B25; Person A to confirm or replace with the A33 text. -->

All of the following are our own implementations in JavaScript (`src/core/`), with no runtime libraries.

- **Repetition-code memory and detectors:** d data qubits, d − 1 parity checks measured for r rounds, detectors as changes of a check between rounds, plus a final layer from the data readout (`detectors.js`, `graph.js`). D. Gottesman, PhD thesis (1997), arXiv:quant-ph/9705052; E. Dennis, A. Kitaev, A. Landahl and J. Preskill, J. Math. Phys. 43, 4452 (2002).
- **Minimum-weight matching decoder:** shortest paths with Dijkstra's algorithm on the space-time decoding graph, then an exact minimum-weight matching of the lit detectors (and the boundary) by dynamic programming over subsets, up to 20 defects; above that a greedy matching, flagged as not exact (`matching.js`). Edge weights w = ln[(1 − p)/p]. Checked against PyMatching (V2): O. Higgott, ACM Trans. Quantum Comput. 3, 16 (2022); O. Higgott and C. Gidney, arXiv:2303.15933. Background: J. Edmonds, Can. J. Math. 17, 449 (1965).
- **Soft decoding:** readout log-likelihood ratios turned into per-edge error probabilities, p = 1/(1 + e^|llr|), combined with the gate-noise rate. C. A. Pattison, M. E. Beverland, M. P. da Silva and N. Delfosse, arXiv:2107.13589.
- **Gate-noise calibration:** the per-edge gate error estimated from the bulk detector firing rate, P(fire) = [1 − (1 − 2p)^n]/2 (`calibrate.js`).
- **Trapped-ion fluorescence readout:** Poisson photon counts from a bright or dark ion with background, with at most one optical-pumping switch during the window; the likelihood integrates over the switch time (`readout/ion.js`). Parameters: C. Crain et al., Commun. Phys. 2, 97 (2019); S. Noek et al., Opt. Lett. 38, 4735 (2013); S. Olmschenk et al., arXiv:0708.0657; A. H. Myerson et al., Phys. Rev. Lett. 100, 200502 (2008).
- **Superconducting dispersive readout:** resonator ring-up to state-dependent coherent states, integrated and projected heterodyne signal with efficiency η, decay of |1⟩ during the window (T1); the belief model has no ring-up (`readout/sc.js`). Assignment error ½ erfc(SNR/2√2) without decay (V8). J. Gambetta et al., Phys. Rev. A 76, 012325 (2007); A. Blais, A. L. Grimsmo, S. M. Girvin and A. Wallraff, Rev. Mod. Phys. 93, 025005 (2021); parameters: T. Walter et al., Phys. Rev. Applied 7, 054020 (2017).
- **Idle errors (Pauli-frame rule):** data qubits waiting during readout flip with probability ½(1 − e^(−τ/T1)) (Pauli-twirled amplitude damping); the X error is applied to the later check results and the final data readout (`idle.js`), checked against an explicit X gate on IonQ's ideal simulator (V4).
- **Per-round and per-microsecond rates:** ε_L = ½[1 − (1 − 2p_L)^(1/r)], divided by the cycle time (`metrics.js`). Cycle times: Robertson et al., arXiv:2603.03801; Google Quantum AI, Nature 638, 920 (2025), arXiv:2408.13687; M. McEwen et al., Nat. Commun. 12, 1761 (2021), arXiv:2102.06131.
- **Wilson score interval** for every error rate: E. B. Wilson, J. Am. Stat. Assoc. 22, 209 (1927) (`stats.js`).
- **Percentile bootstrap** for the location of optimal readout times, with a least-squares quadratic fit around the grid minimum: B. Efron, Ann. Statist. 7, 1 (1979) (`stats.js`, `optimum.js`).
- **Random numbers:** mulberry32 uniform generator, Box–Muller normal draws, Poisson draws by Knuth's multiplication method below mean 30 and by PTRS above: W. Hörmann, "The transformed rejection method for generating Poisson random variables," Insurance: Mathematics and Economics 12, 39 (1993) (`rng.js`).
- **Numerical tools:** Gauss–Legendre quadrature (`quadrature.js`), erfc by its series and continued fraction, and ln Γ by the Lanczos approximation (`special.js`).

## Libraries and tools

- **esbuild:** build-only bundler (`npm run build`); nothing from it ships at runtime
- **Node.js** built-in test runner (`node --test`) for the JavaScript tests
- **Qiskit:** circuit construction and transpilation, in the bank generator and the live-run helper on Qollab
- **The IonQ provider (qiskit-ionq), through Qollab:** IonQ's simulator with the forte-1 noise model (and the ideal model for V4), native gates
- **Qollab:** hosting and running both projects; the page uses the `qollab.live` / `live` Python bridge for the live run, following Qollab's documented JavaScript example (`docs/qollab_js_api_example.txt`)
- **PyMatching, NumPy and pytest:** local validation only (V2, V3); not shipped

The shipped page loads no external resource and makes no network request; all data are embedded at build time.

## AI assistance and planning disclosure

<!-- TODO before submission: check this wording against the form the hackathon rules require (team checklist J0 step 2). -->

- **Planning documents written before the build window.** The project plan, the execution checklist, the team checklist (including the Claude Code prompts in them) and the parameter-card templates in `docs/` were written before the window opened, and are disclosed as such. No project code was written or run before the window.
- **AI assistance.** All code in this repository was generated during the build window with Claude Code (Anthropic), an AI coding assistant, following those prompts under the authors' direction. Every change was reviewed by the authors, cross-reviewed by the other team member, and checked by tests and the validation checks V1–V10. The project page and this README were drafted with Claude Code from the repository's own results files and edited by the authors.
- **Reference code.** `docs/qollab_js_api_example.txt` is Qollab's own example of calling the IonQ backend from JavaScript, copied as a disclosed reference.
- The physics derivations, the choice of parameters and their sources, and the conclusions are the authors' responsibility.

## Licence

MIT. See [LICENSE](LICENSE). Copyright (c) 2026 Soumyajit Pal and Sahil Prabhudesai.

This effort is supported by Qollab & IonQ.
