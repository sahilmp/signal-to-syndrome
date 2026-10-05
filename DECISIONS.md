# DECISIONS

Recorded during the build. Times in IST. Each person edits only their own section.

Status legend: **DOC** = answer taken from Qollab / IonQ documentation (pre-filled Mon 5 Oct); **PROBE** = must still be confirmed by the named probe on Sat 10 Oct; overwrite the Answer and Time when the probe runs. Sources are listed at the end of the file.

## Shared decisions (agreed at J2)

| ID | Question | Answer |
|---|---|---|
| D8 | Shots per configuration | 4000 (revisit at J2 only if D3 shows a 4000-shot noisy job is too slow or fails with `TooLongPredictedExecutionTime` / `SimulationTimeout`) |

## Person A

| ID | Question | Answer | Evidence | Time |
|---|---|---|---|---|
| D1 | How the forte-1 noise model is selected (exact keyword or Run-dialog setting) | **DOC:** chosen in the Select QPU dialog → "IonQ Forte 1" (Noise model). The runtime passes it to the IonQ simulator as `noise_model="forte-1"`. Qollab does not intercept `run()`, and qiskit-ionq merges call kwargs over backend options, so `backend.run(qc, shots=4000, noise_model="forte-1")` should also force it from code. Plan: pick Forte 1 in the dialog **and** pass `noise_model="forte-1"` in code; print `backend.name` and `backend.options.get("noise_model", "none")` and store both in each bank's provenance. **PROBE:** confirm the kwarg override works (select "Aria 1" in the dialog, pass `noise_model="forte-1"`, check what the job reports). | Docs; Probe P3 | 5 Oct (DOC) / PROBE pending |
| D2 | Seed option name (or "none") | **DOC:** `sampler_seed` (qiskit-ionq option, simulator only; integer 1 to 2^31). IonQ shows it via `backend.set_options(noise_model="forte-1", sampler_seed=…)`; passing it to `backend.run(..., sampler_seed=…)` should work by the same kwarg merge. If omitted, IonQ picks a random seed. Not mentioned in Qollab's docs. **PROBE:** run the same 100-shot circuit twice with `sampler_seed=8151623` and once with a different seed; identical counts for the first two = works. If not identical, record "none" and store the counts as-is. | Docs; Probe P3 | 5 Oct (DOC) / PROBE pending |
| D3 | Duration of a 25-qubit, 4000-shot noisy job | **PROBE only — not documented.** Known: IonQ runs one simulation per shot, so time is roughly linear in shots; IonQ publishes no queue times or job timeout; Qollab runs have no time limit; Forte 1 sim allows up to 29 qubits (Aria 25). Failure modes to watch: `TooLongPredictedExecutionTime`, `SimulationTimeout`, `TooManyShots`. Measure 400 shots first, extrapolate, then run 4000. | Probe P4 | pending |
| D6 | Python packages available on Qollab | **DOC:** Python 3.14 (Pyodide, in the browser) with Qiskit 2.x (`qiskit>=2.5.2,<3.0.0` added automatically) and the IonQ provider supplied as `backend`; NumPy 2.x, SciPy, Matplotlib load on import; any pure-Python PyPI wheel via `requirements.txt` (`name==x.y.z` lines only; no `-r`, `-e`, URLs or markers). Optional Libraries toggles (Visualizations, Algorithms, …). **Not available:** PyMatching (compiled extension), so V2 stays local as planned. **PROBE:** print `sys.version`, `qiskit.__version__`, `numpy.__version__`, and try `import scipy`. | Docs; Probe P2 | 5 Oct (DOC) / PROBE pending |
| D7 | Method to copy long Python output | **DOC:** preferred: `from js import sendFile` then `sendFile("rep_d3_r3_L0.json", "application/json", json.dumps(bank))`, which gives a copy button / download in the console. Fallback: `print(json.dumps(bank))` and the console toolbar's **copy** or **download** button. The console shows one run at a time, so copy before re-running. No output-length limit is documented. **PROBE:** emit a ~1 MB JSON both ways and check it arrives complete (byte count + checksum). | Docs; Probe P7 | 5 Oct (DOC) / PROBE pending |

Fingerprint (V9), checks, deviations and handoff notes:

- Deviation (D1/CLAUDE.md rule 5): passing `noise_model=` / `sampler_seed=` as `run()` options is not "constructing a provider", so it is consistent with the contract; the dialog choice must still be Forte 1.
- V9 fingerprint: pending (A, Sat ~12:00).

## Person B

| ID | Question | Answer | Evidence | Time |
|---|---|---|---|---|
| D4 | Can JavaScript submit a job; exact call syntax | **DOC: yes.** `import { QuantumCircuit } from 'qiskit';` … `const job = await backend.run(circuit, { shots: 200 });` then `const counts = (await job.result()).get_counts().toJs();` (top-level await works; `backend` is pre-created; no `new`). Status polling: `import { JobStatus } from 'qiskit.providers.jobstatus'` and await the injected `setTimeout` while checking `job.status()` against `JobStatus.DONE` / `JobStatus.ERROR`. Noise model comes from the Select QPU dialog. **PROBE:** (1) Bell example runs on IonQ Forte 1; (2) whether `noise_model` / `sampler_seed` inside the `{ … }` object are honoured, or need `backend.run.callKwargs(circuit, { shots, noise_model: 'forte-1' })`; (3) whether `job.result()` waits or must be polled. Until then live-run relies on the dialog only. | Docs; Probe P5 | 5 Oct (DOC) / PROBE pending |
| D5 | Largest JavaScript pane content that saves and reloads | **DOC:** 2 MB per file (100 files per project, 200 MB per account). Planning limit until probed: **app bundle ≤ 1.8 MB** (10 % margin). **PROBE P6:** 600 000-char test, then also try ~1.5 MB; record the largest size that saves, reloads and runs. | Docs; Probe P6 | 5 Oct (DOC) / PROBE pending |
| D9 | HTML pane: full document or body fragment | **DOC: body fragment.** "index.html is placed inside the page body, so write body content only. The runtime drops `<html>`, `<head>` and `<body>` tags." `<script>` tags do not run (code goes in `main.js`); `main.css` is the only stylesheet loaded; other .html/.css files are ignored; JS cannot `fetch()` project files. **PROBE P5:** confirm only. | Docs; Probe P5 | 5 Oct (DOC) / PROBE pending |
| D10 | Can two accounts edit one Qollab project | **DOC: very likely no.** FAQ: "You can only edit projects you own." Drafts are visible only to the owner. A **Contributors** field "adds collaborators" to the project page (credit), but editing rights aren't documented. Workaround already in the plan: B owns and uploads the main project; A owns the bank-generator project; code is shared via GitHub; add each other as Contributors. **PROBE (B2):** add A as contributor and check whether A can open and edit the draft. | Docs; B2 | 5 Oct (DOC) / PROBE pending |

PyMatching tie counts, published links, deviations and handoff notes:

- **Deviation (D9, affects CC-B6 build tool):** Qollab's JS project files are named `index.html`, `main.js` and `main.css` at the top level. A project with all three of `index.html`, `main.js`, `main.py` runs as JS. Have `tools/build.mjs` write `dist/qollab/index.html`, `main.js`, `main.css`, **not** `app.js` / `style.css`, and update the CC-B6 prompt, the release check and J3 step 4 accordingly.
- **Release-check note (CLAUDE.md rule 3):** the GET-only `fetch` is allowed by Qollab, but our contract forbids it anyway; keep the check.
- PyMatching tie counts (V2): pending (B7, Sat ~10:15).
- Published links: main project — pending (SP1); bank generator (H14) — pending.

## Sources (read 5 Oct 2026)

- Qollab docs: [runtime-environment](https://qollab.xyz/learn/docs/runtime-environment), [js-qiskit-projects](https://qollab.xyz/learn/docs/js-qiskit-projects), [python-qiskit-projects](https://qollab.xyz/learn/docs/python-qiskit-projects), [run-your-code](https://qollab.xyz/learn/docs/run-your-code), [compute-backends](https://qollab.xyz/learn/docs/compute-backends), [ideal-vs-noise-model-simulators](https://qollab.xyz/learn/docs/ideal-vs-noise-model-simulators), [error-reference](https://qollab.xyz/learn/docs/error-reference), [faq](https://qollab.xyz/learn/docs/faq), [publish](https://qollab.xyz/learn/docs/publish), [write-your-project-page](https://qollab.xyz/learn/docs/write-your-project-page), [noise-and-the-real-machine lesson](https://qollab.xyz/learn/programming-your-first-quantum-circuits/noise-and-the-real-machine)
- IonQ: [Simulation with noise models](https://docs.ionq.com/guides/simulation-with-noise-models)
- qiskit-ionq: [README](https://github.com/qiskit-community/qiskit-ionq), `qiskit_ionq/ionq_backend.py` (`_default_options`: `sampler_seed`, `noise_model`)
