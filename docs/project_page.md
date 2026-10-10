# Signal to Syndrome

<!-- Shared file (CLAUDE.md, Team rules). Person A's sections ("Summary", "Findings", "Who did what", "What runs where", "The physics in plain language", "Results", "Validation", "Limitations") rewritten for v2 by CC-A16 (revision 2.1), Sun 11 Oct 2026, from docs/notes_results.md, DECISIONS.md and data/results/*.json only (plus params/*.json for card values). Person B edits "How to run it", "The five levels" and "Accessibility". Every number carries an HTML comment naming its source file and field. Intervals: square brackets are Wilson 95% for error rates and 95% bootstrap over quantum shots (B = 200) for optimal readout times; paired differences use the paired cluster interval (DECISIONS E14 (a)). "Simulated" readout error = the empirical assignment error (`assignment.empirical`, `tauPhysEmpirical`); "the readout model's own estimate" = `assignment.belief`, `tauPhys` (the release check forbids the internal word for it in visible text). Unless stated otherwise, results use the learned decoder, the bit-flip memory (Z basis), d = 3 and hard decoding. -->

**Listening longer to a qubit makes its readout cleaner, but the rest of the code keeps ageing while you listen. Signal to Syndrome lets you find, in your browser, the readout time that actually minimises the logical error of an error-corrected memory, and shows that it is not always the time that gives the cleanest readout.**

## Summary

Signal to Syndrome compares two readout physics models at fixed gate noise: a trapped ion and a superconducting qubit read out the same IonQ-simulated repetition-code memories with the same decoder, so every difference comes from the readout, the idling during readout and the cycle time. <!-- source: data/results/stage4_comparison.json (framing); CLAUDE.md (What the project is) --> Learning the simulator's noise turns soft decoding from a loss into a gain on the ion; on both platforms the best readout time for the code cannot be told apart from the best for a single qubit, because the minima are flat. <!-- source: data/results/stage4_comparison.json (findings[F1].plain; conclusions.C1.plain, verdict "refuted") -->

## Findings

### F1. Learning IonQ's noise rescues soft decoding

Soft decoding uses how confident each readout was. With our first, naive decoder (one calibrated error rate for every edge) it made the ion worse: soft was above hard beyond the intervals at 13 of 39 points, for example 0.0074 [0.0065, 0.0084] against 0.0035 [0.0029, 0.0042] at 20 µs. <!-- source: data/results/stage2_ion_v2b.json (validation.C2 softAboveBeyondIntervals, naive: 13 of 39; series naive d = 3 at τ = 20 µs: soft pL 0.007375 [0.006495, 0.008373], hard 0.003469 [0.002881, 0.004175]); docs/notes_results.md (Verdicts v2, F1) --> It lacks a whole error class: a fault between a data qubit's two gates lights a diagonal pair of detectors, and the simulator produces it as often as a wrong check reading (0.0099 against 0.0100 per edge). <!-- source: data/results/dem_forte1.json (banks, d3 r3: diag 0.0099, time 0.0100); CLAUDE.md (Decoding graph) --> The learned decoder adds diagonal edges and learns one rate per edge class from detector correlations; soft is then never above hard (0 of 39 points, both memories). <!-- source: data/results/stage2_ion_v2b.json, stage2_ion_x_v2b.json (validation.C2, learned: 0 of 39 each; paired: 0 of 39 each) --> **This holds out of sample:** on 12 banks from new simulator seeds, decoded with rates learned only from the original banks, soft is worse than hard at 13 of 26 points with the naive decoder and 0 of 26 with the learned one (at 20 µs, soft minus hard: +0.0053 [+0.0037, +0.0071] naive, +0.0001 [−0.0003, +0.0005] learned). <!-- source: data/results/holdout.json (params.banksUsed: 12 of 12; setting2.softWorseCount naive 13, learned 0, pointsPerDecoder 26); data/results/stage4_comparison.json (findings[F1].numbers.outOfSample.example_d3_tau20.pairedSoftMinusHard: naive 0.00528 [0.00373, 0.00711], learned 0.00009 [−0.00028, 0.00050]) --> F1 was found after seeing the data and is shown for the ion only. <!-- source: data/results/stage4_comparison.json (findings[F1].statement); docs/notes_results.md (F1 out of sample) --> *Figure: the "Learn the noise" view.*

### F2. Superconducting: idling pulls the code's optimum earlier, inside a flat valley

The simulated superconducting readout error is lowest at τ*_phys = 0.910 µs. <!-- source: data/results/stage3_sc_dense.json (optima.tauPhysEmpirical = 0.909707) --> Meanwhile the data qubits wait and decay with probability ½(1 − e^(−τ/T1)) per round, 0.0070 at 0.7 µs. <!-- source: CLAUDE.md (Idle errors); data/results/stage3_sc_dense.json (budget.idle at 0.7 µs = 0.00695) --> **One-line estimate:** the code's optimum sits where the falling readout error and the rising idle error have equal and opposite slopes, the minimum of their sum: 0.75 µs on the simulated readout curve. <!-- source: computed for CC-A16 from data/results/stage3_sc_dense.json: minimum over x.values of assignment.empirical + budget.idle is 0.01275 at τ = 0.75 µs (readout 0.00531 + idle 0.00744) --> **The simulation agrees:** the logical optimum is 0.710 µs [0.662, 0.990], and lies below τ*_phys in 8 of 9 resolved cases. <!-- source: data/results/stage3_sc_dense.json (optima.tauLog, learned d = 3 hard: 0.709963 [0.66208, 0.990054]); docs/notes_results.md (Verdicts v2, C1 superconducting: 8 of 9 resolved rows) --> **But the shift is not resolved:** the logical error is flat across the valley (0.0065 to 0.0073 from 0.65 to 1.0 µs), only 1 of 8 intervals at d = 3 and 5 lies wholly below τ*_phys, and pL(0.9 µs) − pL(0.75 µs) = +0.0004 [−0.0004, +0.0013] is not above zero. <!-- source: docs/notes_results.md (Verdicts v2, C1 superconducting: flat valley 0.0065–0.0073; only X d = 3 soft below 0.910); data/results/stage4_comparison.json (conclusionDetail.C1.superconducting.cases["Z d3 hard"].shiftDelta: 0.0004375 [−0.000360, 0.00134]) --> The readout model's own estimate, which ignores ring-up, would give 0.45 µs, outside every interval. <!-- source: computed for CC-A16 from data/results/stage3_sc_dense.json: minimum of assignment.belief + budget.idle at τ = 0.45 µs; lowest lower bound of optima.tauLog (learned, d = 3 and 5) is 0.518 µs --> *Figure: Level 3, superconducting qubit.*

### F3. Trapped ion: optical pumping, not idling, sets the readout optimum

The ion's readout error falls as photons accumulate, then rises because the detection light pumps the ion between states. <!-- source: docs/notes_results.md (Stage 2, F1-ion: "driven by dark→bright pumping") --> Its simulated minimum is τ*_phys = 23.0 µs (5.7e-4 at 20 µs); without pumping the model's error falls all the way to the end of the grid at 500 µs.¹ <!-- source: data/results/stage2_ion_v2b.json (optima.tauPhysEmpirical = 23.0163; assignment.empirical at 20 µs = 5.70e-4); docs/notes_results.md (Stage 2, F1-ion: no pumping, lowest at the grid end) --> Idling plays no part: at the optimum the idle error is 1.2e-6 per round, against 6.1e-4 for readout and 8.7e-3 for gates, and the logical optimum, 23.0 µs [20.0, 47.5], contains τ*_phys. <!-- source: data/results/stage4_comparison.json (platforms.trapped-ion.budgetAtOptimum: idle 1.17e-6, readout 6.13e-4, gate 8.68e-3; tauLog.hard d = 3: 23.02 [19.98, 47.48]) --> Measurement crosstalk, a neighbour's detection light flipping a waiting qubit, is sourced at 1.67e-5 /µs, a lower bound. At that rate every interval contains τ*_phys; an optimum wholly below it appears only at 1e-3 /µs, about 60 times higher, where crosstalk rivals gate noise. <!-- source: params/ion.json (crosstalk_rate_per_us, crosstalk_scan_per_us); DECISIONS.md (E6); docs/notes_results.md (Verdicts v2, C1 ion (b) and (c)); data/results/stage2_ion_v2b.json, stage2_ion_x_v2b.json (crosstalkScan) --> *Figure: Level 3, trapped ion.*

¹ The IonQ simulator (forte-1) shows no measurable readout error of its own: at most 3.7 × 10⁻⁴ per measurement (95% bound; V19), and the two flips seen are consistent with gate error. <!-- source: DECISIONS.md (E13, footnote wording) -->

## Who did what

The authors chose the physics, sourced the parameters, diagnosed why soft decoding failed and decided to learn the error model from the data. The code was written with Claude Code under their direction ([AI assistance and planning disclosure](../README.md#ai-assistance-and-planning-disclosure)). <!-- source: README.md (Authors; AI assistance and planning disclosure) -->

## What it is

Signal to Syndrome is an open-source lab, published and runnable on Qollab, that shows how qubit-readout physics sets the logical error rate of a repetition-code memory. The circuits are written in Qiskit and run on IonQ's simulator with the forte-1 noise model, submitted in native gates so that IonQ's optimiser does not remove them. Readout is modelled classically in JavaScript (flat, trapped-ion and superconducting models), and the syndromes are decoded by our own exact minimum-weight matching decoder. <!-- source: README.md -->

It is a controlled comparison of readout physics, not a hardware benchmark: both platforms decode the same IonQ-simulator measurement banks with the same gate noise, so every difference between them comes from the readout model, the idle errors and the cycle time. <!-- source: docs/notes_results.md (Verdicts, A28); DECISIONS.md (A28 item 8) -->

Authors: Soumyajit Pal (physics and data) and Sahil Prabhudesai (decoder, interface and platform). <!-- source: README.md -->

## How to run it

- **On Qollab:** open the main project, https://qollab.xyz/u/SQuant/main-project, in a Chromium-based browser (Chrome, Edge or Opera) and run it. Nothing needs installing: the page makes no network requests and all measurement banks and results are embedded. <!-- source: README.md; CLAUDE.md rule 3 --> Pick a level with the buttons at the top; each level opens with a short explanation. The bank generator that produced the measurement data is a separate project: https://qollab.xyz/u/SQuant/signal-to-syndrome-bank-genera. <!-- source: README.md; DECISIONS.md (Person B, published links) -->
- **Live run (optional):** pick IonQ Forte 1 in Qollab's Select QPU dialog, open Level 4 and press the live-run button under "Run a fresh experiment". Each press submits one new d = 3, r = 3 memory experiment (logical 0, 200 shots) <!-- source: src/ui/liverun.js; DECISIONS.md (Person B, CC-A1 part E note) --> to the IonQ simulator with the forte-1 noise model, in native gates, through the Python helper `live.py`, and decodes the new shots on the page. Expect tens of seconds to a few minutes per job. Qollab allows one job per code run, so each press is one job. <!-- source: DECISIONS.md (D11; platform facts); src/ui/liverun.js --> Outside Qollab the panel links to the bank generator instead.
- **Locally:** with Node.js 20 or later <!-- source: README.md -->, run

  ```bash
  npm install
  npm test
  npm run build
  ```

  The build writes `dist/qollab/` (`index.html`, `main.css`, `main.js`), the three files uploaded to Qollab, and `dist/local/preview.html`, a single file that opens directly in a browser (without the live run). <!-- source: README.md; CLAUDE.md rule 3; tools/build.mjs -->
- **Rerun the analysis:** `node tools/sweep.mjs --stage 1` (and `--stage 2`, `--stage 3`, `--stage 4`) regenerates `data/results/*.json`; `node tools/sweep.mjs --diag` prints the V9 fingerprint, which the page also shows under "Diagnostics" at the bottom. <!-- source: docs/notes_results.md; DECISIONS.md (Person A); src/ui/diag.js -->

## The five levels

Every chart has a "Chart values as a table" link under it, and every level works with the keyboard. Screenshots are in `docs/screenshots/`. <!-- source: DECISIONS.md (CC-B10) -->

1. **Be the decoder.** Three data qubits hold one logical bit and two checks compare neighbours. Each shot comes from the stored d = 3 IonQ-simulator bank with flat readout error ε (slider). You read the lit checks and pick the data qubit you think flipped, or no correction; then the decoder's answer, the data readout and whether the logical value survived are shown, and you play ten shots against the decoder. Concept: syndrome → correction. <!-- source: src/ui/level1.js --> ![Level 1](screenshots/level1.png)
2. **Time is a dimension.** The same d = 3 code over three rounds, drawn as a space-time grid of detectors: a data-qubit flip lights two neighbours in a row, a wrong check reading lights two in a column, and the decoder's matching is drawn as paths between lit detectors or to a boundary. Step through the shots with a lit detector; the ε slider updates a live estimate (1000 bank shots) on top of the Stage 1 curves for d = 3, 5 and 7. Concept: measurement errors are vertical pairs. <!-- source: src/ui/level2.js --> ![Level 2](screenshots/level2.png)
3. **Listen longer?** Choose the trapped ion or the superconducting qubit and move the readout-time slider τ. The ion shows photon-count histograms for bright and dark with the threshold; the superconducting qubit shows the two IQ clouds, the threshold and the signal-to-noise ratio. Charts show the assignment error and the logical error against τ for d = 3, 5 and 7, with the physical optimum τ_phys and the logical optima τ_log marked, and a "Batch" button decodes 200 shots of the d = 3 bank at the current τ. Concept: physical optimum against logical optimum. <!-- source: src/ui/level3.js --> ![Level 3, trapped ion](screenshots/level3-ion.png) ![Level 3, superconducting](screenshots/level3-sc.png)
4. **Trust but verify.** The same shot is decoded twice, side by side: hard decoding treats every reading as equally reliable, soft decoding uses each reading's confidence. Lit detectors are shaded by confidence (solid fill and thick ring: trustworthy; faint fill and thin ring: doubtful), each panel shows its matching and whether the logical value was kept, and a tally counts 20 shots. A chart compares hard and soft logical error against τ for the chosen distance. This level also holds the live-run panel. <!-- source: src/ui/level4.js; src/ui/liverun.js --> ![Level 4, trapped ion](screenshots/level4-ion.png) ![Level 4, superconducting](screenshots/level4-sc.png)
5. **Two platforms.** Side-by-side curves for the trapped ion and the superconducting qubit, each on its own readout-time axis, per round or per µs and hard or soft, with the Stage 4 values at τ*_log, a table of the four hypotheses with their verdicts, the comparison and sensitivity tables, and every parameter card with its sources and units. Optima resting on fewer than 10 logical errors are marked "not resolved". <!-- source: src/ui/level5.js --> **Level 5 is switched off in the current build** <!-- source: src/ui/features.js (level5: false) -->; the review items from A28 that concern it are fixed (DECISIONS.md, Person B), and the screenshot `screenshots/level5-preview.png` is from a local build with it switched on.

## What runs where

| Part | Where it runs | Notes |
|---|---|---|
| Repetition-code circuits, bit-flip and phase-flip memories | **IonQ simulator**, forte-1 noise model, native gates, submitted from Qiskit on Qollab | A fresh ancilla per check and round, all measured at the end; 4000 shots and one fixed seed per bank, plus 12 held-out banks. <!-- source: qollab/bank_generator.py (build_memory_circuit, provenance mode "fresh-ancilla"); DECISIONS.md (D1, D2, D8, E11) --> |
| Injection checks (V4, V13) and the readout-error check (V19) | **IonQ simulator**, `ideal` and forte-1 | <!-- source: DECISIONS.md (A23, E13); docs/notes_results.md (A49 check table) --> |
| Live run (optional) | **IonQ simulator**, forte-1, through `live.py` on Qollab | 200 shots per press. <!-- source: DECISIONS.md (Person B, CC-A1 part E note; D11) --> |
| Readout (flat, trapped-ion, superconducting), idle errors, ion crosstalk | **Classical**, JavaScript in the browser (and Node.js for the sweeps) | Applied to the measured bits. <!-- source: CLAUDE.md (What the project is; Idle errors) --> |
| Learning the error model; decoding | **Classical**, JavaScript; rates from detector correlations, exact minimum-weight matching | <!-- source: CLAUDE.md (What the project is; Module API, dem.js) --> |
| PyMatching comparison (V2, V2b), circuit tests (V3) | **Classical**, local Python | Not shipped. <!-- source: CLAUDE.md rule 5; DECISIONS.md (Person B, V2b) --> |

The simulator contributes the gate noise: correlated faults through the circuit, including the diagonal detector pairs, as frequent as wrong check readings. <!-- source: data/results/dem_forte1.json (banks, d3 r3: diag 0.0099, time 0.0100) --> Readout, idling and crosstalk are classical models applied to the measured bits; the idle-injection rule matches explicit gates on the simulator bit for bit (V4, V13). <!-- source: docs/notes_results.md (Stage 3 validation V4; A49 check table V13) --> **Does forte-1 add readout error of its own? No measurable amount:** 0 of 20 000 qubits prepared in 0 read 1, and 2 of 20 000 prepared in 1 read 0 (at most 3.7 × 10⁻⁴, 95% bound), consistent with gate error. So ε is the whole measurement error in the pipeline, not an addition to the simulator's. <!-- source: DECISIONS.md (E13: 0 / 20 000, upper bound 1.9e-4; 2 / 20 000 = 1.0e-4 [2.7e-5, 3.7e-4]) -->

## The physics in plain language

**The code.** A repetition code stores one bit in d data qubits and repeatedly compares neighbours with ancillas. A comparison that changes between rounds (a detector event) marks an error; the decoder finds the likeliest errors explaining all events and corrects the bit. We use d = 3, 5 and 7 with r = 3 rounds. <!-- source: CLAUDE.md (Conventions); docs/notes_results.md (Stage 1) -->

**The two readouts.** A trapped ion is read by counting fluorescence photons for a time τ; the card uses published lab rates for ¹⁷¹Yb⁺ (0.472 counts/µs bright; pumping 3.41e-4 /µs bright→dark, 1.64e-5 /µs dark→bright). <!-- source: params/ion.json (R_bright_per_us, gamma_bright_to_dark_per_us, gamma_dark_to_bright_per_us); DECISIONS.md (A15) --> A superconducting qubit is read by integrating a resonator signal; the card is representative (χ/2π = 1 MHz, κ/2π = 2 MHz, n̄ = 5 illustrative, η = 0.3, T1 = 50 µs, ring-up on). <!-- source: params/sc.json --> A cycle is the gate layers plus τ plus reset: 2(d − 1) sequential gates of 970 µs and a 50 µs reset for the ion, 2 layers of 0.042 µs and a 0.25 µs reset for the superconducting qubit. <!-- source: params/cycle.json; DECISIONS.md (E8) -->

**Phase-flip memory and T2.** The bit-flip memory protects against flips between 0 and 1; the phase-flip memory runs the same code in the rotated basis, protecting against flips of the relative sign. A waiting qubit loses its bit value on the decay time T1 and its phase on the coherence time T2 (never more than 2T1), so the phase-flip idle error is ½(1 − e^(−τ/T2)). Our superconducting card has T2 = 77 µs, longer than T1 = 50 µs, so phase-flip idling is the smaller error. <!-- source: CLAUDE.md (Conventions; Idle errors); params/sc.json (T1_us, T2_us); DECISIONS.md (E7) -->

**Crosstalk.** Reading one ion means shining light that a waiting neighbour can scatter, disturbing it. It adds an idle error, ½(1 − e^(−Γτ)), during every readout. Γ = 1.67e-5 /µs comes from a published measurement on ions 110 µm apart, taken with a technique that suppresses crosstalk more than tenfold; ions in one chain sit much closer, so the true value is probably higher, and we scan up to 1e-3 /µs. <!-- source: CLAUDE.md (Idle errors); params/ion.json (crosstalk_rate_per_us, crosstalk_scan_per_us); DECISIONS.md (E6) -->

**The detector error model.** Each kind of fault lights a characteristic pair of detectors: a data-qubit flip two neighbours in one round, a wrong check reading one check in two rounds, a fault between a data qubit's two gates a diagonal pair. The decoder needs each pair's probability. The naive decoder uses one calibrated rate and has no diagonal edges; the learned decoder measures how often each pair fires together, solves for one rate per class, and adds the diagonal edges. <!-- source: CLAUDE.md (Decoding graph); DECISIONS.md (E3) -->

**Hard and soft decoding.** A hard decoder sees only the bit each readout reports. A soft decoder also uses how confident each readout was and makes uncertain readings cheaper to blame for an error. <!-- source: CLAUDE.md (Edge weights) -->

## Results

The hypotheses were registered before the reruns, each with its refutation condition. <!-- source: docs/notes_results.md (v2 hypotheses, pre-registered Sat 10 Oct) --> Verdicts use the learned decoder, both memories and full statistics. Brackets are 95% intervals (Wilson for error rates, bootstrap for optimal readout times); an optimum with half or more of its bootstrap samples tied is unresolved and enters no verdict. <!-- source: data/results/stage4_comparison.json (decoder; conclusions); docs/notes_results.md (Tie rule) -->

| | Hypothesis (short) | Verdict | Why |
|---|---|---|---|
| C1 | Superconducting: the code's optimum comes before the single-qubit optimum. Ion: no idle-driven optimum without crosstalk; an earlier one at the sourced crosstalk rate | **Refuted** | Superconducting: 1 of 8 intervals at d = 3 and 5 lies below 0.910 µs (F2). Ion: no earlier optimum at the sourced rate (F3) <!-- source: data/results/stage4_comparison.json (conclusions.C1 verdict, note; conclusionDetail.C1) --> |
| C2 | Soft decoding at or below hard at every τ, with most gain where readouts are short | **Held** | Soft above hard at 0 of 240 points; largest gain at short τ <!-- source: data/results/stage4_comparison.json (conclusions.C2 note: 0 of 39 + 81 + 39 + 81) --> |
| C3 | Neither dominates: the ion has the lower error per round, the superconducting qubit more rounds per second | **Held**, descriptive: the outcome is fixed by construction | Shared gate noise and cycles about 3800× apart: it could not fail with these cards <!-- source: data/results/stage4_comparison.json (conclusions.C3, informative false; platforms.*.perMicrosecond.hard[d = 3].cycle_us: 3953.02 and 1.043963, ratio 3787) --> |
| C4 | The readout error at which d = 5 beats d = 3 is similar on both platforms | **Undetermined** | Ion: 0.237 [0.210, 0.266] at 1.56 µs (hard). Superconducting: d = 5 below d = 3 everywhere, no crossing <!-- source: data/results/stage4_comparison.json (platforms.trapped-ion.breakEven.empiricalAxis.hard; platforms.superconducting.breakEven note; conclusions.C4) --> |
| C5 | The learned error model lowers the logical error against the naive one everywhere at the optimum, out of sample | **Held** | Learned above naive in 0 of 15 resolved cases, below in 13; out of sample only for the ion bit-flip memory, d = 3 and 5 <!-- source: data/results/stage4_comparison.json (conclusions.C5 note; decoderComparison) --> |
| C6 | In the phase-flip memory the superconducting optimum is shorter than in the bit-flip memory when T2 < T1 | **Not applicable** with the card (T2 = 77 µs > T1 = 50 µs). T2 < T1 variant: **undetermined** | Variant T2 = 25 µs (illustrative): shorter in all 4 point estimates, intervals overlap <!-- source: data/results/stage4_comparison.json (conclusions.C6); params/sc.json (T1_us, T2_us); data/results/stage3_sc_x_T2_25.json (provenance.overrides T2_us = 25) --> |
| O4 | Detector-rate ratio, phase-flip to bit-flip banks | Measurement, no verdict | 1.000 to 1.041; all 5 intervals contain 1 <!-- source: data/results/dem_forte1.json (ratioXoverZ); DECISIONS.md (E5) --> |

**Changed since the first version:** C2 was called refuted on the ion, an artefact of the naive decoder (F1); the superconducting C1 held with the naive decoder on a coarse grid, where the dense grid shows a flat valley. <!-- source: docs/notes_results.md (Verdicts v2, "Decoder artefacts in v1"; C1 superconducting, "Changed from v1") -->

**Deviations from the registered plan, all decided after seeing data:** <!-- source: DECISIONS.md (E12, E14); data/results/stage4_comparison.json (conclusions.*.deviations) -->

- **The crosstalk flag (C1, ion).** The registered rule used the point estimate of the optimum, which flips with noise in a flat minimum: at the sourced rate it finds an earlier optimum in the phase-flip memory but not in the bit-flip memory. We also report whether the whole interval lies below τ*_phys, and the paired difference pL(20 µs) − pL(15 µs); both refute the clause in both memories. C1 is refuted either way, because its superconducting part is. <!-- source: DECISIONS.md (E12 (a), E14 (b)); docs/notes_results.md (Verdicts v2, C1 ion (b)) -->
- A 27-point superconducting grid replaced the 12-point one (on the coarse grid C1 held at d = 3); the tie rule, the C6 variant card and the descriptive C3 were added; cluster and paired intervals sit beside the Wilson ones and change no verdict. <!-- source: DECISIONS.md (E12 (b), (c); E14 (a), (d)); docs/notes_results.md (Where a cluster or paired result changes a verdict) -->

**The trade-off.** At its optimum (d = 3) the ion has a logical error of 0.00112 [0.00093, 0.00135] per round at 253 rounds per second, the superconducting qubit 0.00221 [0.00193, 0.00253] at 958 000. <!-- source: data/results/stage4_comparison.json (conclusions.C3 note; platforms.*.perRound.hard d = 3) --> Along the grids the ion stays at 0.0011–0.0019 per round from 10 to 500 µs (226–254 rounds per second), the superconducting qubit at 0.0022–0.0069 from 0.5 to 3 µs (300 000–1 200 000). <!-- source: data/results/stage4_comparison.json (platforms.*.tradeoff["3"].hard: perRound, roundsPerSecond) --> Neither wins on both axes: the ion is about twice as accurate per round, the superconducting qubit about 3800 times faster. Per microsecond of storage the ion's error is far lower (2.8e-7 against 2.1e-3); a task needing a fixed number of rounds, which we did not measure, would favour the faster clock. <!-- source: data/results/stage4_comparison.json (platforms.*.perMicrosecond.hard d = 3: 2.84e-7, 2.12e-3); docs/notes_results.md (Verdicts, C3: time to finish a fixed number of logical operations not measured) --> In sensitivity runs, halving the superconducting η raises its error at 0.7 µs by 0.0057 [0.0042, 0.0072]; changing the ion's pumping rate has no resolved effect. <!-- source: data/results/stage4_comparison.json (sensitivity[*].pairedVsBaseline: eta 0.5 +0.0056875 [0.0041875, 0.0071875]; gamma_dark_to_bright 0.5 and 2 intervals contain 0) -->

## Validation

| ID | Check | Outcome |
|---|---|---|
| V1 | Flat readout flips with probability ε | **Pass** <!-- source: docs/notes_results.md (Stage 1 validation) --> |
| V2, V2b | Our decoder against PyMatching, without and with diagonal edges | **Pass:** 0 cost mismatches <!-- source: DECISIONS.md (Person B, V2; V2b) --> |
| V3 | Circuits on Qiskit's ideal simulator give the predicted bits | **Pass** <!-- source: DECISIONS.md (Person B, CC-A1 part E note) --> |
| V4 | Idle-error injection rule against explicit gates on IonQ's ideal simulator | **Pass**, bit for bit <!-- source: docs/notes_results.md (Stage 3 validation) --> |
| V5 | Gate-noise floor consistent across banks | **Pass**, one pair of intervals just misses <!-- source: docs/notes_results.md (Stage 1 validation) --> |
| V6 | Logical 0 against logical 1 | **Pass**, 1 difference in 48 comparisons, no pattern <!-- source: docs/notes_results.md (v2 Stage 1 rerun) --> |
| V7 | Ion sampler against Poisson tails | **Pass** <!-- source: docs/notes_results.md (A49 check table) --> |
| V8 | Superconducting sampler against the analytic error | **Pass** <!-- source: docs/notes_results.md (A49 check table) --> |
| V9, V9L | Browser against Node.js fingerprint | Node.js and the local preview agree (`53933f98`); on Qollab **not yet redone** <!-- source: DECISIONS.md (Person A, V9 fingerprint; E9; Person B, B44 entry, local preview) --> |
| V10 | Confidence calibration where the model is exact | **Pass** <!-- source: docs/notes_results.md (A49 check table) --> |
| V10r | Calibration with ring-up in the model | **Not run** <!-- source: docs/signal-to-syndrome-team-checklist.md (A56 not done) --> |
| V11 | Learned decoder at ε = 0 and 1e-9 | **Pass** <!-- source: docs/notes_results.md (v2 Stage 1 rerun) --> |
| V12 | (a) Rates recovered on synthetic data; (b) learned against naive, one logical state's bank to the other's | (a) **Pass**; (b) **Fail**: too few errors at d = 5, replaced by V18 <!-- source: DECISIONS.md (E3, E4) --> |
| V13 | Phase-flip circuits and injection | **Pass** <!-- source: docs/notes_results.md (A49 check table) --> |
| V14 | Idle physics per memory; T2 ≤ 2T1; crosstalk | **Pass** <!-- source: tests/ion.test.js (V14), npm test Sun 11 Oct 327/332, all V14 tests pass --> |
| V15 | Trade-off values by hand, one point per platform | **Pass**, 3 significant figures <!-- source: DECISIONS.md (CC-A22, V15) --> |
| V16 | Fault-to-detector map of "Learn the noise" | **Pass** <!-- source: DECISIONS.md (Person B, V16) --> |
| V17 | Cluster and paired intervals | **Pass** <!-- source: tests/stats.test.js (V17), npm test Sun 11 Oct 327/332, all V17 tests pass; docs/notes_results.md (v2b files carry the A48 pL values) --> |
| V18 | Learned against naive, held-out banks | **Pass** <!-- source: data/results/holdout.json (setting1); docs/notes_results.md (V18) --> |
| V19 | Does the simulator add readout error | **No measurable amount** (≤ 3.7 × 10⁻⁴) <!-- source: DECISIONS.md (E13) --> |

## Accessibility

- **Keyboard:** every control (level buttons, sliders, platform choices, qubit buttons, the live-run button) can be reached and used with the keyboard, the tab order follows the visual order, and focus is always visible (a 3 px outline). Choosing a level moves focus to its heading. <!-- source: DECISIONS.md (CC-B10); src/ui/main.js -->
- **Charts and pictures:** every chart and histogram has a values table, and the qubit grids and charts have text descriptions for screen readers. <!-- source: DECISIONS.md (CC-B10) -->
- **Colour:** a colour-blind-safe palette, and nothing relies on colour alone: series also differ by marker shape, histograms by solid and hatched bars, and in Level 1 "your pick" and "decoder's pick" are written on the qubit. <!-- source: DECISIONS.md (CC-B10); src/ui/level3.js --> The lowest text contrast pair is 4.83:1 <!-- source: DECISIONS.md (CC-B10) -->, above the plan target of 4.5:1. <!-- source: plan §18 -->
- **Small screens:** the layout was checked at 360 px width; wide tables scroll inside their own box and charts are redrawn larger below 600 px. <!-- source: DECISIONS.md (CC-B10) -->
- **Motion:** nothing animates. <!-- source: DECISIONS.md (CC-B10) -->

## Limitations

- **Not a hardware benchmark or a platform ranking.** Both readout models are classical, with literature parameters, on the same simulated IonQ gate noise; so the superconducting arm carries trapped-ion gate noise. <!-- source: plan §20; data/results/stage4_comparison.json (framing) -->
- **The ion card is a published lab setup** (Crain et al. 2019), not measured Forte values; its T1 is the low end of the range given for IonQ Aria. <!-- source: DECISIONS.md (A15); params/ion.json -->
- **The crosstalk value is a lower bound,** measured on ions 110 µm apart with a technique that suppresses crosstalk more than tenfold. That one chain's ions are read mid-circuit without shielding or shuttling is our assumption. <!-- source: DECISIONS.md (E6) -->
- **The superconducting card is representative, not one device;** n̄ = 5 and the C6 variant T2 = 25 µs are illustrative. <!-- source: params/sc.json; DECISIONS.md (E14 (c)) -->
- **The superconducting readout model's own estimate ignores ring-up:** it puts τ*_phys at 0.577 µs against the simulated 0.910 µs, and its confidence values are too high at short τ. We quote the simulated value; a variant with ring-up in the model was not run. <!-- source: data/results/stage4_comparison.json (platforms.superconducting.tauPhys: belief 0.577124, empirical 0.909707); docs/notes_results.md (Ring-up mismatch) -->
- **Learned rates are in sample except where held-out banks exist** (the ion bit-flip memory at d = 3 and 5, and V18); the learned model has one rate per edge class, not per edge. <!-- source: data/results/stage4_comparison.json (conclusions.C5.deviations); DECISIONS.md (E11); CLAUDE.md (Module API, dem.js) -->
- **The d = 7 optima are unresolved** (ion in both modes, superconducting in soft mode). <!-- source: data/results/stage4_comparison.json (platforms.*.tauLog: unresolved true for ion d = 7 hard and soft, superconducting d = 7 soft) -->
- **Matching ties are broken toward one logical value,** which inflates the naive decoder's error at ε = 0. <!-- source: DECISIONS.md (Person B, V2); docs/notes_results.md (Verdicts v2, artefact 2) -->
- **Sensitivity covers three parameters** (ion dark→bright pumping, superconducting η and T1, each halved and doubled); halving T1 would break T2 ≤ 2T1 and was not run. <!-- source: data/results/stage4_comparison.json (sensitivity, sensitivityNote); DECISIONS.md (CC-A22, Sensitivity) -->
- **Small codes:** d up to 7, r = 3; no threshold is extrapolated. Each memory protects against one kind of error. Idle errors use the Pauli-twirling approximation; the ion model allows at most one state change per window. <!-- source: plan §20; CLAUDE.md (Conventions) -->
- **Untested:** the time to finish a fixed number of logical operations, where a slow cycle would cost the ion. <!-- source: docs/notes_results.md (Verdicts, C3) -->

## How to extend the project

- **Add a readout model:** implement the readout contract, `measure(trueBit, rng) -> { hard, llr }`, `idleFlipProbability()` and `averageAssignmentError()`, in `src/core/readout/`, and add a parameter card with a source for every value in `params/`. <!-- source: CLAUDE.md (Conventions, Module API) -->
- **Generate new banks:** run `qollab/bank_generator.py` on Qollab, one configuration per run, with the native recipe and a distinct `sampler_seed` per bank; check that the detector rate is above 0. <!-- source: DECISIONS.md (D1, D2, bank generator rules) -->
- **Open problems we found:**
  - Per-edge-class gate rates estimated from detector-pair correlations (in `graph.js` and `calibrate.js`), to test whether the ion soft-decoding loss disappears. <!-- source: docs/notes_results.md (Stage 2, Diagnosis) -->
  - Ring-up in the superconducting belief model (`src/core/readout/sc.js`), which would change every Stage 3 number. <!-- source: docs/notes_results.md (Ring-up mismatch) -->
  - A different tie-break in `matching.js`. <!-- source: DECISIONS.md (Person B, V2) -->
  - A photomultiplier-tube ion setup with lower collection efficiency, and the dark→bright pumping rate, which mainly sets the ion τ*_phys, as sensitivity cases. <!-- source: DECISIONS.md (A15) -->
- **Fork it on Qollab** ([fork and remix](https://qollab.xyz/learn/docs/fork-and-remix)) and change the parameter cards. <!-- source: DECISIONS.md (Sources) -->

## References

Readout parameters and cycle times:

- C. Crain et al., Commun. Phys. 2, 97 (2019): [nature.com/articles/s42005-019-0195-8](https://www.nature.com/articles/s42005-019-0195-8)
- S. Noek et al., Opt. Lett. 38, 4735 (2013): [arXiv:1304.3511](https://arxiv.org/abs/1304.3511)
- S. Olmschenk et al. (2007): [arXiv:0708.0657](https://arxiv.org/abs/0708.0657)
- Microsoft Azure Quantum, IonQ provider page: [learn.microsoft.com/azure/quantum/provider-ionq](https://learn.microsoft.com/azure/quantum/provider-ionq)
- T. Walter et al., "Rapid high-fidelity single-shot dispersive readout of superconducting qubits," Phys. Rev. Applied 7, 054020 (2017): [arXiv:1701.06933](https://arxiv.org/abs/1701.06933)
- Robertson et al., "Variational Gibbs State Preparation on Trapped-Ion Devices" (2026): [arXiv:2603.03801](https://arxiv.org/abs/2603.03801)
- Google Quantum AI and Collaborators, "Quantum error correction below the surface code threshold," Nature 638, 920 (2025): [arXiv:2408.13687](https://arxiv.org/abs/2408.13687)
- M. McEwen et al., "Removing leakage-induced correlated errors in superconducting quantum error correction," Nat. Commun. 12, 1761 (2021): [arXiv:2102.06131](https://arxiv.org/abs/2102.06131)

Error correction, decoding and soft information:

- D. Gottesman, *Stabilizer Codes and Quantum Error Correction*, PhD thesis, Caltech (1997): [arXiv:quant-ph/9705052](https://arxiv.org/abs/quant-ph/9705052)
- E. Dennis, A. Kitaev, A. Landahl and J. Preskill, "Topological quantum memory," J. Math. Phys. 43, 4452 (2002)
- J. Edmonds, "Paths, trees, and flowers," Can. J. Math. 17, 449 (1965)
- O. Higgott, "PyMatching: A Python package for decoding quantum codes with minimum-weight perfect matching," ACM Trans. Quantum Comput. 3, 16 (2022)
- O. Higgott and C. Gidney, "Sparse Blossom" (2023): [arXiv:2303.15933](https://arxiv.org/abs/2303.15933)
- C. A. Pattison, M. E. Beverland, M. P. da Silva and N. Delfosse, "Improved quantum error correction using soft information" (2021): [arXiv:2107.13589](https://arxiv.org/abs/2107.13589)
- J. Gambetta et al., "Protocols for optimal readout of qubits using a continuous quantum nondemolition measurement," Phys. Rev. A 76, 012325 (2007)
- A. Blais, A. L. Grimsmo, S. M. Girvin and A. Wallraff, "Circuit quantum electrodynamics," Rev. Mod. Phys. 93, 025005 (2021)
- A. H. Myerson et al., "High-fidelity readout of trapped-ion qubits," Phys. Rev. Lett. 100, 200502 (2008)

Statistics:

- E. B. Wilson, J. Am. Stat. Assoc. 22, 209 (1927)
- B. Efron, "Bootstrap methods: another look at the jackknife," Ann. Statist. 7, 1 (1979)

Platform:

- Qollab documentation: [runtime environment](https://qollab.xyz/learn/docs/runtime-environment), [JavaScript Qiskit projects](https://qollab.xyz/learn/docs/js-qiskit-projects), [Python Qiskit projects](https://qollab.xyz/learn/docs/python-qiskit-projects), [ideal vs noise-model simulators](https://qollab.xyz/learn/docs/ideal-vs-noise-model-simulators), [how your circuit is compiled](https://qollab.xyz/learn/docs/how-your-circuit-is-compiled)
- IonQ: [Simulation with noise models](https://docs.ionq.com/guides/simulation-with-noise-models), [Getting started with native gates](https://docs.ionq.com/features/getting-started-with-native-gates), [Native gates in Qiskit](https://docs.ionq.com/sdks/qiskit/native-gates-qiskit)
- [qiskit-ionq](https://github.com/qiskit-community/qiskit-ionq)

<!-- References without a link: the source files give no URL; the plan asks that bibliographic details be verified against the publisher before they appear here. -->

## AI assistance and planning disclosure

Placeholder: planning documents and prompts were prepared before the build window; all code was generated during the window with Claude Code under the authors' direction and reviewed by the authors. <!-- source: README.md (verbatim; README still marks it as a placeholder) -->

## Licence

MIT. See [LICENSE](../LICENSE). <!-- source: README.md -->

This effort is supported by Qollab & IonQ.
