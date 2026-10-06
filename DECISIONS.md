# DECISIONS

Recorded during the build. Times in IST. Each person edits only their own section.

All rows below were settled by probes run on Tue 6 Oct 2026 on qollab.xyz (Python and JavaScript projects, IonQ remote simulators), plus Qollab, IonQ and qiskit-ionq documentation (sources at the end). Re-check any row that looks wrong at J2 (Sat 06:00).

## Platform facts that affect both people

- **One job per code run.** A second `backend.run` in the same run fails with `ConnectionError … 'The code has already filed one circuit execution job; only one job is allowed per code run'`. Every bank configuration is its own run; the live-run button submits one job per press.
- **IonQ optimises abstract-gate circuits, even on the noisy simulator.** A repetition-code circuit whose CX controls start in \|0⟩ came back with zero detector events (P4, P8). **Submitting in native gates bypasses the optimiser and keeps the noise** (P9). All circuits that must show noise go through the native recipe in D1.
- **The Forte noise model has no readout (SPAM) error.** It only adds gate noise. Fine for us: readout is modelled classically in `src/core/readout/*`.
- **Each person owns their own Qollab project** (D10). Code moves only through GitHub.

## Shared decisions (agreed at J2)

| ID | Question | Answer |
|---|---|---|
| D8 | Shots per configuration | 4000. Each configuration is one run of about 6–8 min on the native path (D3); confirm the total at J2 by multiplying by the number of banks in the plan. |

## Person A

| ID | Question | Answer | Evidence | Time |
|---|---|---|---|---|
| D1 | How the forte-1 noise model is selected (exact keyword or Run-dialog setting) | **Both work: the Select QPU dialog sets it, and a `noise_model="forte-1"` option overrides it.** Use the native recipe: pick **IonQ Forte 1** in the dialog, then `nb = backend.with_name(backend.name, gateset="native", noise_model="forte-1")`; `nb.set_options(noise_model="forte-1", sampler_seed=SEED)`; `qn = transpile(qc, backend=nb)`; `job = nb.run(qn, shots=4000)`. Assert `backend.options.get("noise_model") == "forte-1"` first and store the model, seed and job_id in the bank's provenance. Valid names: `ideal`, `aria-1`, `aria-2`, `forte-1`, `forte-enterprise-1`. | P3a–P3f, P9 | Tue 6 Oct 17:50 |
| D2 | Seed option name (or "none") | **`sampler_seed`, set with `set_options` only.** `nb.set_options(sampler_seed=8151623)` gave identical counts on two runs (hash `b96ef3b1815d` both times). `run(..., sampler_seed=N)` has no effect (qiskit-ionq reads the seed only from `backend.options`). Use a distinct seed per bank; integer 1 to 2^31. | P3b–P3c, P9 ×2 | Tue 6 Oct 19:30 |
| D3 | Duration of a 25-qubit, 4000-shot noisy job | **About 5 min** for a 25-qubit abstract-gate circuit (290 s at 4000 shots, 46 s at 400). **Native path (the one we use):** d=3, r=3 (9 qubits) took 118 s for 1000 shots, so expect **6–8 min per 4000-shot configuration**, more for larger d and r. Time grows linearly with shots. An identical rerun with the same seed returned in 14 s (cached), so time only first runs. | P4b, P9 | Tue 6 Oct 19:30 |
| D6 | Python packages available on Qollab | **Python 3.14.2 (Pyodide, in the browser); qiskit 2.5.2; numpy 2.4.6; scipy 1.18.0; `from js import sendFile`.** Not importable: matplotlib (not needed), pymatching and stim (V2 stays local), qiskit_ionq on the built-in simulator (the IonQ `backend` is supplied by the runtime when an IonQ QPU is picked; `qiskit_ionq` then loads under it). Generator code uses stdlib + qiskit + numpy only. | P2 | Tue 6 Oct 16:36 |
| D7 | Method to copy long Python output | **Print the JSON between `BEGIN_BANK` and `END_BANK` lines and use the console toolbar's copy (or download) button.** 300 000 characters came through intact (sha `2f72e9c07bb84909` reproduced). The console shows one run at a time, so copy before the next run. `sendFile` runs without error but did not visibly deliver a separate file; not needed (a 4000-shot bank is far under 300 KB). | P7 + local check | Tue 6 Oct 18:45 |

Fingerprint (V9), checks, deviations and handoff notes:

- **Bank generator rules (from D1–D3, D7):** one configuration per run, selected by a variable at the top of the script; native recipe from D1; seed via `set_options`; output printed between `BEGIN_BANK` / `END_BANK`; provenance includes `backend.name`, `noise_model`, `sampler_seed`, `job_id`, native op counts and date.
- **Sanity check for every bank:** detector rate must be above 0 (P9, d=3 r=3 L0: 0.0325, events in 15.5% of shots). Zero means the circuit was optimised away.
- **Native transpile output** for d=3, r=3: `gpi2` 48, `ms` 12, `measure` 9 (the transpiler emitted `ms`, not `zz`; IonQ accepted it with forte-1).
- **CLAUDE.md rule 5:** the native recipe derives a backend from Qollab's own `backend` (same provider and credentials, no API keys), which we treat as within the rule. The wording was added to CLAUDE.md rule 5 on 6 Oct; confirm it at J2.
- V9 fingerprint: pending (Sat ~12:00).

## Person B

| ID | Question | Answer | Evidence | Time |
|---|---|---|---|---|
| D4 | Can JavaScript submit a job; exact call syntax | **Yes.** `import { QuantumCircuit } from 'qiskit';` … `const job = await backend.run(qc, { shots: 200, noise_model: 'forte-1' });` `const counts = (await job.result()).get_counts().toJs();` gives a **plain object** (keep a `Map` guard). Options in the object reach IonQ. `backend.run.callKwargs` does **not** exist. 12-qubit GHZ, 500 shots, Forte 1: err 0.140, 14 s. **Caveat for the live run:** abstract gates are optimised (see platform facts), so the d=3, r=3 L0 live run needs the native recipe, probably through a Python helper called with `.callPromising` (probe P10, team checklist Appendix T4; result in D11). If P10 fails, `liveRun` stays off and the page links to the bank generator. | P5a–P5c | Tue 6 Oct 19:15 |
| D5 | Largest JavaScript pane content that saves and reloads | **At least 1.9 MB.** `main.js` files of 600 000, 1 500 000 and 1 900 000 characters each saved, survived a reload and ran. Docs cap each file at 2 MB. Release-check limit: **`main.js` + `index.html` ≤ 1 900 000 bytes.** | P6 | Tue 6 Oct 19:40 |
| D9 | HTML pane: full document or body fragment | **Body fragment.** `<html>`, `<head>`, `<body>` are stripped; inline `<script>` does not run; `main.css` applies. Qollab file names are **`index.html`, `main.css`, `main.js`** at the top level. Build output: `dist/qollab/index.html` (body content only), `main.css`, `main.js`, with no `<script>` or `<link>` tags. | P5a–P5c | Tue 6 Oct 19:15 |
| D10 | Can two accounts edit one Qollab project | **No.** With A added as a contributor, A could see B's project when private and when public, but could not edit it. A could fork it and edit the fork, but changes do not flow back. **Rule:** B owns and uploads the main project; A owns and publishes the bank-generator project; all code moves through GitHub; each lists the other as a contributor for credit. | B2 | Tue 6 Oct 19:50 |
| D11 | Live run through a Python helper (`qollab/live.py` called with `.callPromising`) | **Pending (probe P10, before Sat).** Record `distinct`, `allZeroFraction` and the time. Pass: `distinct` > 1 and `allZeroFraction` < 1, so `liveRun` may be switched on at J4. ERROR or `distinct=1`: `liveRun` stays off. Also record whether the `qollab/` folder worked or `live.py` had to sit at the top level (import `'live'`). | P10 | |

PyMatching tie counts, published links, deviations and handoff notes:

- **Deviation from the checklist (D9):** the build writes `main.js` and `main.css`, not `app.js` and `style.css`. Applied on 6 Oct to CLAUDE.md rule 3 and to the team checklist (CC-B6, CC-B7, J3 step 4, J9 step 1).
- **Release check:** Qollab allows GET `fetch`, but our contract forbids it; keep the check.
- PyMatching tie counts (V2): pending (B7, Sat ~10:15).
- Published links: main project pending (SP1); bank generator (H14) pending.

## Sources (read 5–6 Oct 2026)

- Qollab docs: [runtime-environment](https://qollab.xyz/learn/docs/runtime-environment), [js-qiskit-projects](https://qollab.xyz/learn/docs/js-qiskit-projects), [python-qiskit-projects](https://qollab.xyz/learn/docs/python-qiskit-projects), [run-your-code](https://qollab.xyz/learn/docs/run-your-code), [compute-backends](https://qollab.xyz/learn/docs/compute-backends), [ideal-vs-noise-model-simulators](https://qollab.xyz/learn/docs/ideal-vs-noise-model-simulators), [how-your-circuit-is-compiled](https://qollab.xyz/learn/docs/how-your-circuit-is-compiled), [error-reference](https://qollab.xyz/learn/docs/error-reference), [faq](https://qollab.xyz/learn/docs/faq), [publish](https://qollab.xyz/learn/docs/publish), [fork-and-remix](https://qollab.xyz/learn/docs/fork-and-remix), [noise-and-the-real-machine lesson](https://qollab.xyz/learn/programming-your-first-quantum-circuits/noise-and-the-real-machine)
- IonQ: [Simulation with noise models](https://docs.ionq.com/guides/simulation-with-noise-models), [Getting started with native gates](https://docs.ionq.com/features/getting-started-with-native-gates), [Native gates in Qiskit](https://docs.ionq.com/sdks/qiskit/native-gates-qiskit)
- qiskit-ionq: [README](https://github.com/qiskit-community/qiskit-ionq), `qiskit_ionq/ionq_backend.py`, `qiskit_ionq/helpers.py` (noise seed read from `backend.options.sampler_seed`)
