# Signal to Syndrome — Team Execution Checklist (two people)

Every step needed to build, verify, publish and submit the project as a team of two, split so that each person works independently as much as possible. Each dependency between the two of you is named, timed and given a fallback, and every joint step is marked.

| | |
|---|---|
| Version | 1.1, 6 October 2026 (updated with the probe results in `DECISIONS.md`: native-gate bank generator, one job per run, Qollab file names `index.html`/`main.css`/`main.js`, probe P10 for the live run) |
| Build window | Sat 10 Oct 04:30 IST → Mon 12 Oct 04:30 IST (Fri 9 Oct 19:00 ET → Sun 11 Oct 19:00 ET) |
| Project plan | `signal-to-syndrome-project-plan.md` explains what is built and why. This checklist replaces its single-person timeline (Section 17.1) with the team timeline below; the gates, cut rules and validation checks are unchanged |
| Repository | A private GitHub repository shared by both of you, cloned to `E:\My Project\signal-to-syndrome` (or any path you prefer) |
| Commands | Windows cmd syntax; Appendix T7 gives the macOS and Linux equivalents |

---

## Contents

1. How the work is split
2. Independent, dependent and joint work
3. Timeline
4. Ground rules for working in parallel
5. Joint steps (J0–J9)
6. Person A checklist (physics and data)
7. Person B checklist (decoder, interface and platform)

Appendices: T1 team `CLAUDE.md` · T2 team `DECISIONS.md` · T3 bridge and feature switches · T4 platform probes · T5 review and fix prompts · T6 parameter-card templates · T7 Git for two people and other operating systems

---

## 1. How the work is split

The project is split along its module boundaries, not along its stages. Each file in the repository has exactly one owner, so you never edit the same file and Git merges cleanly.

| Role | Owns | Typical skills |
|---|---|---|
| **Person A: physics and data** | The Qiskit bank generator and everything that runs on Qollab's Python side; the shot banks; all readout physics (flat, trapped-ion, superconducting); idle errors, calibration and statistics; the sweep engine and every results file; the parameter cards; the results and physics sections of the project page | Quantum physics, readout hardware, statistics |
| **Person B: decoder, interface and platform** | The repository scaffold; randomness, bank parsing, detectors, the decoding graph and the matching decoder; the PyMatching cross-check; the whole interface (levels 1–5), the build and the release check; everything that runs in Qollab's JavaScript project; publishing; accessibility; the demo and the README | JavaScript, interfaces, algorithms |

Assign the roles by fit. The physics-heavy work suits Person A to someone with a readout background; Person B needs comfort with JavaScript and the browser. Nothing in the checklist depends on which of you takes which role.

**What makes independence possible.**

1. **A fixed contract.** The team version of `CLAUDE.md` (Appendix T1) fixes, before any code exists, the exact function signatures each person's modules must provide (the Module API) and the exact shape of every results file. Each of you writes to that contract, so neither has to read the other's code to use it.
2. **Stubs and fixtures.** Person B builds the interface against stand-in versions of Person A's modules (stubs, with placeholder physics) and synthetic data files (fixtures, each marked `"fixture": true`). The interface never waits for physics.
3. **Bridges and feature switches.** The interface reaches Person A's work only through two small files, `src/ui/bridge_core.js` and `src/ui/bridge_data.js`. When a real module or results file arrives, Person B changes one line in a bridge (Appendix T3) and turns the matching feature on in `src/ui/features.js`. The release check refuses to pass if any enabled feature still uses a stub or fixture, so nothing fake can be published.
4. **Synthetic test data.** Person A's physics tests and calibration tests generate their own data and do not need the decoder.

---

## 2. Independent, dependent and joint work

### 2.1 Independent work (no input from the other person)

"Independent" means the work can be built and tested on its own. The final versions still meet at the integration steps.

| Person A | Person B |
|---|---|
| Pre-window: paper derivations; sourcing all three parameter cards (ion, superconducting, cycle times) | Pre-window: studying Qollab's JavaScript lesson and copying its example; interface sketches; reading accessibility guidelines |
| Python-side platform probes (packages, noise model, 25-qubit timing, copying long output) | JavaScript-side platform probes (job submission from JavaScript, pane size, HTML pane format) |
| Bank generator, local circuit tests (V3), bank assembler | Repository scaffold |
| Running all banks on Qollab and assembling them | Randomness, bank parsing, detectors |
| Trapped-ion readout model and its validation (V7, V10) | Decoding graph, matching decoder, logical decision |
| Superconducting readout model and its validation (V8, V10) | PyMatching cross-check (V2) |
| The V4 batch on IonQ's ideal simulator | Stubs, fixtures, bridges, feature flags |
| Stage 4 metrics module and its tests | All interface levels, built and tested on stubs and fixtures |
| Interpreting results against hypotheses C1–C4 | Build tool, release check, live-run button |
| Physics and results sections of the project page | Accessibility pass; demo video; README; assembling the Qollab page |

### 2.2 Dependencies (one person's work waits on the other's)

Each handoff has an ID (H1–H14), a target time, the step that consumes it, and a fallback, so that a late handoff delays as little as possible. Times are IST. "Push" means committing and pushing to the shared repository and sending the handoff message (Section 4).

| ID | From → to | What exactly is handed over | Ready by | Needed by (step) | What waits | Fallback if late |
|---|---|---|---|---|---|---|
| H1 | B → A | `src/core/rng.js` | Sat 07:45 | Sat 08:00 (A9, CC-A2) | A's flat-model, idle and calibration tests (they draw random numbers) | A collects banks (A11) and sources parameters first; starts CC-A2 when rng.js lands |
| H2 | B → A | `src/core/bank.js`, `src/core/detectors.js` | Sat 07:45 | Sat 10:30 (A12, CC-A3) | A's sweep engine | A writes the sweep engine against the Module API; runs its tests when the files land |
| H3 | B → A | `src/core/graph.js`, `src/core/matching.js`, `src/core/logical.js` | Sat 09:30 | Sat 10:30 (A12, CC-A3) | A's sweep engine and every logical-error result | As H2 |
| H4 | A → B | Banks `rep_d3_r1_L0.json` and `rep_d3_r3_L0.json` | Sat 08:00 (first) and 10:30 | Sat 12:30 (B10, switch) | Real data in levels 1 and 2 | B keeps the fixture banks; SP1 cannot publish until real banks arrive |
| H5 | A → B | `src/core/sweep.js` (decodeShot, runPoint, diagnostic) and `src/core/readout/flat.js` | Sat 11:30 | Sat 12:30 (B10) | Real decoding in levels 1 and 2; the V9 fingerprint | B keeps the sweep and flat stubs; SP1 waits |
| H6 | A → B | `data/results/stage1_flat.json` and the V9 fingerprint (`node tools/sweep.mjs --diag`) | Sat 12:00 | Sat 12:30 (B10) | The level 2 chart; the V9 check | Fixture chart; SP1 waits |
| H7 | A → B | `src/core/readout/ion.js` and `params/ion.json` | Sat 15:00 | Sat 15:30 (B13) | Real physics in ion levels 3 and 4 | Ion stub; SP2 waits |
| H8 | A → B | `data/results/stage2_ion.json` | Sat 16:30 | Sat 19:30 (B16) | Ion charts in levels 3 and 4 | Fixture charts; SP2 waits |
| H9 | A → B | `src/core/readout/sc.js` and `params/sc.json` | Sat 19:15 | Sun 07:00 (B21) | Real physics on the superconducting platform | Superconducting stub; SP3 waits |
| H10 | A → B | `data/results/stage3_sc.json` | Sun 06:00 | Sun 07:00 (B21) | Superconducting charts | Fixture charts; SP3 waits |
| H11 | A → B | `data/results/stage4_comparison.json` and `params/cycle.json` | Sun 08:00 | Sun 08:30 (B22) | Level 5 | Fixture; SP4 waits |
| H12 | B → A | Probe answers D4, D5, D9 (JavaScript job submission, pane size limit, HTML pane format) | Sat 06:00 | Sat 06:00 (J2) | The shots-per-configuration decision D8 | Use 4,000 shots and revisit if the pane limit is low |
| H13 | A → B | Probe answers D1, D2, D3, D6, D7 (noise-model syntax, seed option, 25-qubit timing, packages, output copying) | Sat 06:00 | Sat 13:30 (B12, live-run) | The live-run button's noise setting | Live-run off until known |
| H14 | A → B | Link to the published bank generator project | Sat 13:30 | Sat 13:30 (B12) | The live-run fallback note | Note without a link, added later |

The interface never blocks on a handoff, because it is built on stubs and fixtures first. What a late handoff delays is the ship point that needs it: no ship point is published with stand-in physics or data.

### 2.3 Joint work (both of you together)

| ID | When (IST) | What | Who does what |
|---|---|---|---|
| J0 | Before Tue 6 Oct | Register as a team, read the rules, prepare the shared repository and tools | Both; B creates the repository |
| J1 | Sat 04:30 | Kickoff call (10 minutes) | Both |
| J2 | Sat 06:00 | Merge probe answers; decide shots; set up the repository with the contract | Both decide; B commits |
| J3 | Sat 13:00 | SP1 integration and publish | A hands over and checks numbers; B builds, uploads, publishes |
| J4 | Sat 20:00 | SP2 integration and publish | As J3 |
| J5 | Sun 09:00 | SP3 integration and publish | As J3 |
| J6 | Sun 13:00 | SP4 integration and publish | As J3 |
| J7 | Sun 17:30 | Joint page review | Both read the whole page |
| J8 | Sun 21:00 | Release-candidate cross-review | Each reviews the other's latest work |
| J9 | Sun 22:30 → Mon 01:30 | Freeze, verify, submit | B builds and uploads; A checks numbers and the generator; both test in clean browsers |

Also joint at any time: any change to `CLAUDE.md` or to the Module API (Section 4, interface changes), and the cross-reviews listed in each person's checklist.

---

## 3. Timeline

### 3.1 Two-lane timeline

```text
                              Sat 04:30               Sun 04:30       Mon 04:30
                                          Sat 16:30               Sun 16:30
                              ├───────────┼───────────┼───────────┼───────────┤
A  Python probes              ██
A  generator, first banks       ██
A  flat, idle, stats             ██
A  collect banks                   █
A  sweep engine, stage 1            ██
A  ion model, stage 2                 ████
A  superconducting model                  ███
A  V4, stage 3                                ██      ██
A  stage 4 metrics                                     ███
A  page: physics, results                                  ████████
B  JavaScript probes          ██
B  setup, scaffold             █
B  rng, banks, detectors        ██
B  graph, matching               ██
B  PyMatching check                █
B  stubs, fixtures                 ██
B  levels 1-2, build                ███
B  levels 3-4 (ion)                    ███
B  superconducting UI                     ███
B  level 5                                    ██
B  accessibility, switches                            █████
B  README, page, demo                                       ███████
Cross-reviews                        ▒   ▒▒ ▒▒           ▒▒▒▒
Joint: integration, buffer            ▓      ▓            ▓   ▓    ▓▓▓▓▓
Joint: freeze and submit                                                ▓▓▓
Sleep / slack                                   ░░░░░░                     ░░░
Ship points published                  ◆      ◆            ◆   ◆
                                      SP1    SP2          SP3 SP4

█ individual work  ▒ cross-review  ▓ joint  ░ rest  ◆ ship point   one column = one hour (IST); a block marks every hour it touches
```

### 3.2 Milestones (team version)

The ship points come earlier than in the single-person plan because the two lanes run in parallel. Each cut deadline is 30 minutes before the integration step; the cut rules are those of the project plan (Section 17.2).

| Milestone | Integration (IST) | Ship point published by | Cut deadline | Gate |
|---|---|---|---|---|
| M0 Probes done | — | — | Sat 06:30 | All probe answers recorded |
| M1 = SP1 | J3, Sat 13:00 | Sat 13:30 | Sat 12:30 | V1, V2, V3 pass; F0 produced; levels 1–2 on real data |
| M2 = SP2 | J4, Sat 20:00 | Sat 20:30 | Sat 19:30 | V7, V10 (ion) pass; ion levels 3–4 on real data |
| M3 = SP3 | J5, Sun 09:00 | Sun 09:30 | Sun 08:30 | V4, V8, V10 (superconducting) pass; platform toggle on real data |
| M4 = SP4 | J6, Sun 13:00 | Sun 13:30 | Sun 12:30 | Parameter cards sourced; level 5 on real data |
| M5 Page | J7, Sun 17:30 | Sun 18:00 | Sun 17:00 | Page complete; demo recorded |
| M6 Submitted | J9 | Mon 01:30 | Mon 03:00 | Final version verified; submission confirmed |

---

## 4. Ground rules for working in parallel

1. **Own your files.** Edit only files you own (ownership table in Appendix T1). Every Claude Code prompt names its owner and Claude Code is told to refuse edits outside it. If you need a change in the other person's file, ask for it in a message.
2. **Pull before you start, push when you finish.** Before every Claude Code prompt and before every push: `git pull --rebase`. After every green test run: commit your own files and push (Appendix T7).
3. **Announce every handoff.** When you push something on the dependency list, send a message in this form: `HANDOFF H5: pushed src/core/sweep.js and src/core/readout/flat.js, commit 1a2b3c4, tests green`. The receiver replies `ACK H5` after pulling.
4. **Interface changes are joint.** If either of you needs to change a Module API signature or the results format: stop, message the other, agree on the change, have one person edit `CLAUDE.md`, commit and push it, and both pull before continuing.
5. **No stand-ins in public.** A feature is switched on in `src/ui/features.js` only after its bridges point to real modules and data; `npm run check` enforces this. Only Person B uploads to the main Qollab project and tags ship points.
6. **Cross-review.** Each of you reviews the other's work at the times in your checklist, using a fresh Claude chat with the review prompt (Appendix T5) and your own reading. A reviewer reports findings; the owner fixes them.
7. **Keep a call open at handoffs and integrations.** Between them, work silently and message only for handoffs and blockers.
8. **Same sleep block.** Both of you sleep Sat 22:30 → Sun 04:30, so handoffs and integrations happen while both are awake.

---

## 5. Joint steps (J0–J9)

### J0 · JOINT · before Tue 6 Oct — Team, rules, repository, tools

**Why:** everything the two of you share must exist before the window opens, and none of it is project code.
**Do:**
1. **Both:** register on Qollab for the hackathon as one team (teams of one to four are allowed), at the same node, before registration closes on 6 October.
2. **Both:** read the rules and submission instructions and note the answers to: are AI coding assistants allowed and must they be disclosed; what is submitted and by whom; is there a team-project feature on Qollab (can two accounts edit one project)?
3. **Both:** attend the organizers' question session (week of 5 October) with the questions in the project plan (Section 14.4), plus: "How do team members share a Qollab project?"
4. **Both:** agree who is Person A and who is Person B, a messaging channel and a voice-call link.
5. **Person B:** create an empty **private** GitHub repository named `signal-to-syndrome` (no README, no licence) and invite Person A as a collaborator. **Person A:** accept the invitation.
6. **Both:** install and check the tools (Git, Node.js 20 or later, Python 3.12, VS Code, Claude Code) and create the validation environment:

```bat
git --version
node --version
python --version
claude --version
python -m venv %USERPROFILE%\venvs\s2s
%USERPROFILE%\venvs\s2s\Scripts\activate.bat
pip install numpy qiskit pymatching pytest
python -c "import numpy, qiskit, pymatching, pytest; print('ok')"
```

7. **Both:** read the project plan and this whole checklist, including the other person's lane.

**Pass:** team registered; rules answers noted; both can open the private repository on GitHub; every command above prints a version or `ok`.
- [ ] Done (A)  - [ ] Done (B)

### J1 · JOINT · Sat 04:30 — Kickoff call

**Do:** 10-minute call. Confirm roles, that A takes the Python probes and B the JavaScript probes (Appendix T4), the J2 time, and the handoff message format.
**Pass:** both start probing by 04:40.
- [ ] Done

### J2 · JOINT · Sat 06:00 — Merge probe answers, decide shots, set up the repository

**Why:** the contract and the platform facts must be in the repository before either of you runs a prompt.
**Do:**
1. **Both (call):** read each other's probe answers (H12, H13). Decide D8, the shots per configuration: 4,000 unless D3 (job time) or D5 (pane size) argue for fewer.
2. **Person B**, in TERMINAL:

```bat
cd /d "E:\My Project"
git clone https://github.com/YOUR_GITHUB_USER/signal-to-syndrome.git
cd signal-to-syndrome
code .
```

3. **Person B**, in EDITOR: create `CLAUDE.md` with the full text of Appendix T1; `DECISIONS.md` from Appendix T2 with both people's probe answers filled in; `docs/qollab_js_api_example.txt` (Qollab's JavaScript example from J0, first line `Source: <lesson title and URL>, copied <date>`); and copy the three planning documents (project plan, this checklist, and the single-person checklist if you kept it) into `docs/`.
4. **Person B**, in TERMINAL:

```bat
git add -A
git commit -m "Contract, decisions, planning documents"
git branch -M main
git push -u origin main
```

5. **Person B** continues straight to B4 (scaffold). **Person A**, in TERMINAL, after B's push:

```bat
cd /d "E:\My Project"
git clone https://github.com/YOUR_GITHUB_USER/signal-to-syndrome.git
cd signal-to-syndrome
code .
```

**Pass:** both have the repository with `CLAUDE.md` and `DECISIONS.md`; every D-row has an answer (D3 may say "pending").
- [ ] Done

### J3 · JOINT · Sat 13:00 — SP1 integration and publish

This procedure is reused by J4, J5 and J6; only the switches and checks change.

**Do:**
1. **Person A:** confirm that all handoffs for this ship point are pushed (SP1: H4, H5, H6), and run `node tools/sweep.mjs --diag`; read out the fingerprint.
2. **Person B:** `git pull --rebase`; make the bridge and feature switches for this ship point (Appendix T3; SP1: rows 1–4); then:

```bat
npm test
npm run build
npm run check
start "" "dist\local\preview.html"
```

3. **Both:** play every enabled level in the local preview (Person B shares the screen, or Person A pulls and builds).
4. **Person B:** replace the main Qollab project's three files with `dist/qollab/index.html`, `main.css` and `main.js`; open Diagnostics. **Both:** the fingerprint equals Person A's (V9).
5. **Person B:** publish (public, MIT, attribution in the description). **Person A:** publish the bank generator project the same way (SP1 only) and send its link (H14).
6. **Both:** open the published links in a signed-out private window and play.
7. **Person B:**

```bat
git add -A
git commit -m "SP1: integration"
git tag sp1
git push
git push --tags
```

**Pass:** release check passes; V9 fingerprints equal; both links work signed out; tag pushed. If the gate is not met at the cut deadline, apply the stage's cut rule from the project plan.
- [ ] Done

### J4 · JOINT · Sat 20:00 — SP2 integration and publish

As J3, with handoffs H7 and H8, switches rows 5–7 of Appendix T3, and tag `sp2`. Turn on `liveRun` only if D11 (probe P10) passed and the live run worked on Qollab; in that case Person B also uploads Person A's `qollab/live.py` into the main project (as `qollab/live.py`, or `live.py` at the top level if D11 says folders do not work) in step 4. Build with `liveRun: true`, upload, press "Run a fresh experiment" once with **IonQ Forte 1** picked, and check that level 4 shows lit detectors; if it fails, set `liveRun: false`, rebuild and re-upload before publishing.
- [ ] Done

### J5 · JOINT · Sun 09:00 — SP3 integration and publish

As J3, with handoffs H9 and H10, switches rows 8–10, and tag `sp3`. Test both platforms.
- [ ] Done

### J6 · JOINT · Sun 13:00 — SP4 integration and publish

As J3, with handoff H11, switches rows 11–12, and tag `sp4`. Test all five levels.
- [ ] Done

### J7 · JOINT · Sun 17:30 — Page review

**Do:** both read `docs/project_page.md` and the published page end to end. Person A checks every number against `data/results` and `docs/notes_results.md`; Person B checks the instructions by following them literally in a signed-out window.
**Pass:** both agree the page is final apart from bug fixes.
- [ ] Done

### J8 · JOINT · Sun 21:00 — Release-candidate cross-review

**Do:** each of you creates a diff of the other's files since `sp4` (Appendix T7) and reviews it in a fresh Claude chat with the review prompt (Appendix T5), adding: "Also read docs/project_page.md and flag any claim not supported by data/results or docs/notes_results.md." Owners fix blocking findings with the fix prompt; Person B tags `rc1` and pushes.
**Pass:** no blocking finding open.
- [ ] Done

### J9 · JOINT · Sun 22:30 → Mon 01:30 — Freeze, verify, submit

No new features from here on.
**Do:**
1. **Person B:** `git pull --rebase`, `npm test`, `npm run build`, `npm run check`; final upload of the three files `dist/qollab/index.html`, `main.css` and `main.js` (plus `qollab/live.py` if `liveRun` is on); confirm public and MIT on the main project.
2. **Person A:** `node tools/sweep.mjs --diag`; confirm the fingerprint on the published page matches; confirm the bank generator project is public, MIT, and runs its smallest configuration.
3. **Both:** test in signed-out private windows (Person A in Chrome, Person B in Edge): every level, the platform toggle, the live run, Diagnostics.
4. **The registered team lead:** submit through the global process with the main project link, the generator link and the video; save a screenshot of the confirmation and share it.
5. **Person B:** `git tag v1.0`, `git push --tags`.

**Pass:** submission confirmed by Mon 01:30. Until 04:30, act only if a platform problem stops the submitted project from running.
- [ ] Done

---

## 6. Person A checklist — physics and data

### A1 · SELF · before Thu 8 Oct — Derivations and parameter cards

**Why:** you check every physics prompt's output against your own derivations, and the parameter cards must be sourced before the build.
**Do:** derive on paper: detector definitions and pair shapes; $w=\ln[(1-p)/p]$ and soft weight $=|\ell|$; the Poisson LLR $n\ln(R_b/R_d)-(R_b-R_d)\tau$ and the pumping mixture likelihood; the superconducting steady states, $|\Delta\alpha|^2$, SNR, $\tfrac12\operatorname{erfc}(\text{SNR}/2\sqrt2)$ and the decay mixture; $p_{\text{idle}}=\tfrac12(1-e^{-\tau/T_1})$ and the injection rule; $\epsilon_L=\tfrac12[1-(1-2p_L)^{1/r}]$. Then fill all three parameter cards (Appendix T6) with values and sources; label anything unsourced `UNSOURCED (illustrative)`.
**Pass:** every derivation is your own; every parameter has a value and a source or the label.
- [ ] Done

### A2 · QOLLAB · PLATFORM · Sat 04:35 — Python probes

**Why:** the bank generator and the live run depend on these facts.
**Do:** run probes P2, P3, P4 and P7 from Appendix T4 in a private Python/Qiskit project on Qollab. Start P4 (the 25-qubit job) early and do P7 while it runs.
**Pass:** answers for D1, D2, D3 (or "pending"), D6 and D7 noted for J2 (handoff H13).
- [ ] Done

### A3 · JOINT · Sat 06:00 — J2

Take part in J2. After Person B's push, clone the repository (J2 step 5).
- [ ] Done

### A4 · TERMINAL · Sat 06:25 — Start your session

**Do:** wait for Person B's scaffold push (`HANDOFF scaffold`, about 06:30), then:

```bat
cd /d "E:\My Project\signal-to-syndrome"
git pull --rebase
npm install
%USERPROFILE%\venvs\s2s\Scripts\activate.bat
claude
```

**Pass:** `npm test` passes in a second terminal; Claude Code is running in the repository folder.
- [ ] Done

### A5 · CLAUDE CODE · Sat 06:30 — CC-A1: bank generator, circuit tests, bank assembler

**Why:** the shot banks are the project's only quantum data.
**Depends on:** nothing from Person B except the scaffold.
**Do:** in Claude Code, `/clear`, then paste:

```text
Read CLAUDE.md and DECISIONS.md first.
Owner: Person A. Create or modify only files owned by Person A (see CLAUDE.md).

Task CC-A1: the Qollab bank generator, its local tests, and the bank assembler.
Create exactly: qollab/bank_generator.py, validation/test_circuits.py, tools/assemble_bank.mjs, tests/assemble_bank.test.js, and qollab/live.py only if D11 in DECISIONS.md says the live run works (part E).

A. qollab/bank_generator.py (standard library + qiskit only). Platform facts from DECISIONS.md: Qollab allows ONE job per code run; IonQ optimises abstract-gate circuits away, so every circuit is submitted in native gates (D1); the seed is set only with set_options (D2).
1. Settings at the top, the only line a person edits between runs: CONFIG = the name of the one configuration to run (for example "rep_d3_r1_L0"). Also at the top: SHOTS = D8; a SEEDS table giving every configuration name (banks and V4) its own fixed sampler seed, distinct integers between 1 and 2^31.
2. build_memory_circuit(d, r, logical, inject=None) -> (QuantumCircuit, layout). One quantum register: data qubits 0..d-1, then one fresh ancilla per check per round. If logical == 1, apply X to every data qubit first. Round k, check j: cx(data j -> ancilla), then cx(data j+1 -> ancilla). One classical register with n_clbits = (d-1)*r + d and the fixed layout in CLAUDE.md. All measurements at the end. inject is a list of (data_qubit, after_round): apply X to that data qubit after all CNOTs of round after_round and before round after_round + 1 (after_round = r-1 means just before the final readout). layout = {"ancilla": [[clbit of check j for j] for k], "data": [clbit of qubit i for i]}.
3. CONFIGS: rep_d3_r1, rep_d3_r3, rep_d5_r3, rep_d5_r5, rep_d7_r3, each for logical 0 and 1, named like rep_d5_r3_L0.
4. V4_BATCH: for (d, r) in [(3, 3), (5, 3)], logical 0, every single injection site (i, k) with i in 0..d-1 and k in 0..r-1, named like v4_d3_r3_i1_k0. These run with noise model "ideal" (not forte-1) and 100 shots, one configuration per run like the banks.
5. run_native(qc, shots, noise_model, seed), the native recipe of D1, exactly:
   - first assert backend.options.get("noise_model") == "forte-1"; otherwise raise an error telling the user to pick IonQ Forte 1 in the Select QPU dialog;
   - nb = backend.with_name(backend.name, gateset="native", noise_model=noise_model); nb.set_options(noise_model=noise_model, sampler_seed=seed). Never pass the seed as a run() argument (it has no effect, D2). Never construct a provider or read an API key;
   - qn = transpile(qc, backend=nb); native_ops = dict(qn.count_ops());
   - job = nb.run(qn, shots=shots); poll job.status() every 5 s until DONE, ERROR or CANCELLED (from qiskit.providers.jobstatus import JobStatus); raise a clear error unless DONE;
   - return (job.result().get_counts(), job.job_id(), native_ops).
6. detector_rate(counts, d, r, layout): the fraction of detector bits equal to 1 over all detectors and all shots, with detectors as defined in CLAUDE.md (layer k < r: m[k][j] XOR m[k-1][j], with m[-1] = 0; final layer: x[j] XOR x[j+1] XOR m[r-1][j]).
7. to_bank(...) builds the s2s-bank/1 object (fields: schema, code, d, r, logical, mode "fresh-ancilla", backend (= backend.name), noise_model, sampler_seed, job_id, native_ops, date (UTC, ISO 8601), detector_rate, shots, n_qubits, n_clbits, layout, bit_order "qiskit-little-endian", key_encoding "hex", counts, checksum). Keys: strip spaces, check length == n_clbits, convert binary to lowercase hex without prefix. checksum = {total_shots, n_keys, sha256 of json.dumps(counts, sort_keys=True, separators=(",", ":"))}. For V4 entries also store "inject": [[i, k]].
8. emit(bank, name): S = json.dumps(bank, sort_keys=True, separators=(",", ":")); print the line "BEGIN_BANK <name> chunks=<N> sha256=<sha256 of S>", then for each 4000-character chunk the line "--- chunk <i>/<N> ---" followed by the chunk on its own line, then the line "END_BANK <name>" (D7: the person copies everything from BEGIN_BANK to END_BANK out of the console).
9. main(): look up CONFIG in CONFIGS and V4_BATCH (an unknown name raises an error listing the valid names); print one progress line with the name, qubit count, shots, seed and the expected duration (about 6-8 min per 4000 shots at d = 3, r = 3, longer for larger d and r; D3); submit exactly one job with run_native (noise model "forte-1" for rep_* names, "ideal" for v4_* names); compute and print detector_rate; for a rep_* configuration whose detector_rate is 0, raise an error saying the circuit was optimised away and the bank must not be used, and emit nothing; otherwise emit. The last line of the file is: if "backend" in globals(): main()
   so that importing the module locally never runs a job.

B. validation/test_circuits.py (pytest, qiskit.providers.basic_provider.BasicSimulator, circuits of at most 24 qubits only)
1. rep_d3_r1, rep_d3_r3, rep_d5_r3, logical 0 and 1, no injection: exactly one outcome; every ancilla bit 0; every data bit equals the logical value.
2. d = 3, r = 3, logical 0, every injection site (i, k): exactly one outcome, equal to the prediction: the ancilla bits of checks i-1 and i (those that exist) flipped in every round > k, and data bit i flipped.
3. Layout: classical-bit indices match the CLAUDE.md formula for d = 5, r = 3.
4. detector_rate is 0 for counts containing only the error-free outcome and positive when one ancilla bit is flipped in some shots (a non-vacuous pair).
5. SEEDS has one entry per configuration name in CONFIGS and V4_BATCH, all distinct, all in 1..2^31.
Each test has a comment stating, in words, the break it catches.

C. tools/assemble_bank.mjs <file or folder>... [--out <dir>, default data/banks]
A folder argument means every .txt file in it. Parse every BEGIN_BANK ... END_BANK block (tolerate Windows line endings and blank lines), check chunk count and order, join chunks, verify the sha256 from the BEGIN_BANK line, parse the JSON, re-verify checksum.total_shots == sum of counts == shots, n_keys, and the counts sha256 using the same canonical form as Python (keys sorted, separators without spaces). Reject a bank whose name starts with rep_ and whose detector_rate is missing or 0 (the circuit was optimised away). Write <out>/<name>.json pretty-printed with 2 spaces; print one summary line per bank (name, shots, distinct keys, detector_rate, sampler_seed); exit 1 with a clear message on any mismatch.

D. tests/assemble_bank.test.js: a round trip on a synthetic block built in the test; a block with one corrupted character must fail; a block with a missing chunk must fail; a rep_ bank with detector_rate 0 must fail while the same bank with detector_rate 0.03 passes.

E. qollab/live.py (only if D11 says the live run works; otherwise skip it and say so in the report). A standalone file (it is uploaded alone into Person B's JavaScript project, so it must not import bank_generator) with run_live(backend, shots=200, seed=7): build the d = 3, r = 3, logical 0 circuit with the same qubit order and classical-bit layout as build_memory_circuit, run it with the native recipe of part A step 5 (noise model "forte-1", sampler_seed = int(seed), shots = int(shots)) and return the counts as a plain dict of binary-string keys to int, as the P10 helper in the team checklist (Appendix T4) does. Add to validation/test_circuits.py a test that the circuit run_live builds (expose it as live_circuit()) gives the same single noiseless outcome as build_memory_circuit(3, 3, 0).

Run `npm test`, then `python -m pytest validation -q`. End with the report format.
```

**Pass:** `npm test` passes; `python -m pytest validation -q` passes (V3).
- [ ] Done

### A6 · TERMINAL · VERIFY · GIT · Sat 07:30 — Check V3 and push

**Do:** check one injection prediction in `validation/test_circuits.py` against your derivation by hand. Then:

```bat
python -m pytest validation -q
npm test
git pull --rebase
git status --short
git add -A
git commit -m "CC-A1: bank generator, circuit tests, assembler"
git push
```

Before `git add -A`, check that `git status --short` lists only files you own.
**Pass:** pushed.
- [ ] Done

### A7 · QOLLAB · Sat 07:40 — First bank end to end

**Do:** on Qollab create a Python/Qiskit project `Signal to Syndrome — bank generator` (you own it, D10); paste `qollab/bank_generator.py`; set `CONFIG = "rep_d3_r1_L0"`; press Run and pick **IonQ Forte 1** in the Select QPU dialog (D1). One configuration per run: Qollab refuses a second job in the same run. When it finishes, use the console toolbar's copy (or download) button and save everything from the `BEGIN_BANK` line to the `END_BANK` line into `data/raw/rep_d3_r1_L0.txt`. The console shows only the latest run, so copy before you run again (D7). Then:

```bat
node tools/assemble_bank.mjs data\raw\rep_d3_r1_L0.txt
git add data
git commit -m "First bank"
git pull --rebase
git push
```

Send `HANDOFF H4 (first bank): rep_d3_r1_L0`.
**Pass:** the assembler reports no error; the printed detector rate is above 0 (for reference, P9 gave 0.0325 at $d=3$, $r=3$; a rate of 0 means the circuit was optimised away and the generator refuses to print the bank); the bank shows several distinct outcomes; its provenance has `backend`, `noise_model` `forte-1`, `sampler_seed`, `job_id`, `native_ops` and `date`.
- [ ] Done

### A8 · QOLLAB · Sat 07:55 — Run the other banks, one run each

**Do:** run the other nine configurations one at a time, smallest first: `rep_d3_r1_L1`, `rep_d3_r3_L0`, `rep_d3_r3_L1`, `rep_d5_r3_L0`, `rep_d5_r3_L1`, `rep_d5_r5_L0`, `rep_d5_r5_L1`, `rep_d7_r3_L0`, `rep_d7_r3_L1`. For each: set `CONFIG`, Run with **IonQ Forte 1**, wait, copy the `BEGIN_BANK` … `END_BANK` block into `data/raw/<name>.txt`, then start the next one. Budget about 6–8 min per configuration at $d=3$ and more for larger $d$ and $r$ (D3), so the nine runs take roughly 1.5–2 hours: work on A9 and A10 between runs, keeping the Qollab tab open. If a run shows `detector rate 0`, stop and tell Person B (the native path has failed); do not use that bank.
**Pass:** each finished configuration has its own raw file with one complete `BEGIN_BANK` … `END_BANK` block.
- [ ] Done

### A9 · CLAUDE CODE · Sat 08:00 — CC-A2: flat readout, idle errors, calibration, statistics

**Depends on:** H1 (`src/core/rng.js`), due 07:45. Run `git pull --rebase` first; if `src/core/rng.js` is not there yet, do A11 first and come back.
**Do:** in Claude Code, `/clear`, then paste:

```text
Read CLAUDE.md and DECISIONS.md first.
Owner: Person A. Create or modify only files owned by Person A (see CLAUDE.md).

Task CC-A2: the flat readout model, the idle-error hook, calibration and statistics.
Create exactly: src/core/readout/flat.js, src/core/idle.js, src/core/calibrate.js, src/core/stats.js, tests/flat.test.js, tests/idle.test.js, tests/calibrate.test.js, tests/stats.test.js. Follow the Module API in CLAUDE.md exactly. Use createRng from src/core/rng.js (Person B's module) for all randomness; if it is missing, stop and report.

1. readout/flat.js: createFlatReadout({ epsilon }) implementing the readout-model contract; require 0 <= epsilon < 0.5. measure flips trueBit with probability epsilon; llr = +ln((1-eps)/eps) if hard is 1, else its negative (+/-Infinity when epsilon = 0). idleFlipProbability() = 0. averageAssignmentError() = epsilon.
2. idle.js: applyX(m, x, d, r, i, k) returns new arrays with the CLAUDE.md idle rule applied for one X on data qubit i after round k (valid for k = 0..r-1; k = r-1 flips only x[i]). injectIdle(m, x, d, r, p, rng) returns new arrays, applying applyX independently with probability p for every data qubit i and every round k = 0..r-2 (no idle error after the last round). Inputs are never mutated.
3. calibrate.js: estimatePGate(detectorArrays, d, r): bulk detectors are layers 1..r-1 (layer 0 if r = 1; never the final layer). Model: each bulk detector touches 4 independent edges with the same probability p, so P(fire) = (1 - (1 - 2p)^4) / 2. Solve for p by bisection on [0, 0.5) from the observed mean firing rate. Return { p, rate, nDetectors, nShots }. Comment that time-like edges are counted as gate-noise edges because readout noise is off during calibration.
4. stats.js: wilson(k, n, z = 1.96) -> { p, lo, hi }; bootstrap(nItems, statFn, B, rng) -> { mean, lo, hi } using the 2.5th and 97.5th percentiles; statFn receives an array of resampled indices.

Tests (each with the required break comment):
- flat: the empirical flip rate equals epsilon within 4 binomial standard errors at epsilon = 0.05 with 200000 draws (validation V1); epsilon = 0 never flips and gives infinite |llr|; epsilon = 0.5 is rejected.
- idle: applyX and injectIdle against hand-computed patterns for d = 3, r = 3, including an end qubit and k = r-1; p = 0 leaves values unchanged and inputs untouched.
- stats: wilson known values (k = 0, n = 10 gives lo = 0; k = 5, n = 10 is symmetric about 0.5).
- calibrate: estimatePGate recovers p within 4 standard errors from synthetic detector arrays generated inside the test with the same 4-edge model at p = 0.01 (do not depend on the decoder).

Run `npm test`. End with the report format.
```

**Pass:** all tests pass, including V1.
- [ ] Done

### A10 · TERMINAL · GIT · Sat 09:15 — Test and push

```bat
npm test
git pull --rebase
git status --short
git add -A
git commit -m "CC-A2: flat readout, idle, calibration, statistics"
git push
```

- [ ] Done

### A11 · QOLLAB · TERMINAL · Sat 09:30 — Collect and assemble the banks

**Do:** check that every finished A8 configuration has its raw file in `data\raw`, then:

```bat
node tools/assemble_bank.mjs data\raw
dir data\banks
git add data
git commit -m "All banks"
git pull --rebase
git push
```

Send `HANDOFF H4: rep_d3_r3_L0 and the remaining banks`. If some large banks are still running, push what you have and repeat later.
**Pass:** the assembler reports no error for each bank.
- [ ] Done

### A12 · CLAUDE CODE · Sat 10:30 — CC-A3: sweep engine and Stage 1 sweep

**Depends on:** H2 and H3 (Person B's bank, detectors, graph, matching and logical modules), due 09:30. `git pull --rebase` first; if any is missing, ask Person B for its status and meanwhile start A15.
**Do:** in Claude Code, `/clear`, then paste:

```text
Read CLAUDE.md and DECISIONS.md first.
Owner: Person A. Create or modify only files owned by Person A (see CLAUDE.md).

Task CC-A3: the sweep engine and the Stage 1 sweep.
Create exactly: src/core/sweep.js, tools/sweep.mjs, tests/sweep.test.js. Use Person B's bank.js, detectors.js, graph.js, matching.js and logical.js only through the Module API; if any of them is missing, stop and report.

1. sweep.js:
   - decodeShot({ shotBits, layout, d, r, readout, mode, pGate, rng }): split the shot; apply readout.measure to every ancilla and data bit; apply injectIdle with p = readout.idleFlipProbability(); compute detectors; build weights with graph.js helpers: space-like edges in layer 0: p = pGate; in layers 1..r-1: p = xorP(pGate, pIdle); in the final layer: p = xorP(pGate, pRead_i), where pRead_i = averageAssignmentError() (mode "hard") or pFromLlr(llr of data bit i) (mode "soft"); time-like edge of m[k][j]: p = averageAssignmentError() (hard) or pFromLlr(llr of that ancilla measurement) (soft). Decode; the corrected logical uses the measured (noisy) x[0]. Return every field listed for decodeShot in the Module API.
   - runPoint({ bank, readout, mode, pGate, seed, maxShots }) -> { k, n, wilson, nonExact }.
   - diagnostic(bank) -> FNV-1a 32-bit hash (8 hexadecimal characters) of JSON.stringify of the array of logicalError flags (0/1) for the first 1000 shots of the bank with flat epsilon = 0.02, pGate from estimatePGate on that bank with readout off, hard mode, seed 7. The browser reuses this exact function (validation V9).
2. tools/sweep.mjs:
   --stage 1: load every bank file named rep_*.json in data/banks (never v4_*.json); estimate pGate per bank and print V5 (bulk firing rate with Wilson interval and p); epsilon grid [0, 0.005, 0.01, 0.02, 0.03, 0.05, 0.08, 0.12]; for d = 3, 5, 7 at r = 3 and both logical states, run hard mode (assert on one point that soft gives identical results for the flat model); write data/results/stage1_flat.json in the results format of CLAUDE.md (platform "flat", x name "epsilon"; provenance: commit from `git rev-parse HEAD` if available, else "unknown"; bank file names; seeds); print V1 (flat flip rate at epsilon 0.05) and V6 (L0 against L1 logical error with intervals, per distance), then the diagnostic hash for rep_d3_r3_L0.
   --diag: print only the diagnostic hash for data/banks/rep_d3_r3_L0.json.

Tests (break comments required): decodeShot with epsilon = 0 and pGate = 0 on an error-free synthetic shot returns nDefects = 0 and logicalError = 0 and every API field; runPoint on a synthetic error-free bank gives k = 0; diagnostic returns the same string twice for the same bank (determinism).

Run `npm test` and `node tools/sweep.mjs --stage 1`. End with the report format.
```

**Pass:** tests pass; `data/results/stage1_flat.json` is written.
- [ ] Done

### A13 · TERMINAL · VERIFY · GIT · Sat 11:30 — Check Stage 1 and hand over

**Do:**

```bat
node tools/sweep.mjs --stage 1
node tools/sweep.mjs --diag
```

Check V1 (flip rate at $\varepsilon=0.05$), V5 (similar bulk detection rates for banks of equal $(d,r)$; small $p_{\text{gate}}$), V6 (L0 and L1 agree within intervals or the difference is noted) and the F0 shape (at $\varepsilon=0$ logical error falls with $d$). Write the fingerprint and the checks into your section of `DECISIONS.md` and into `docs/notes_results.md`. Then push your files and send `HANDOFF H5 and H6: sweep.js, flat.js, stage1_flat.json, fingerprint <hash>`.
**Pass:** V1, V5, V6 hold or deviations are recorded.
- [ ] Done

### A14 · REVIEW · Sat 12:00 — Cross-review of Person B's decoder

**Do:** `git diff start..HEAD -- src/core/rng.js src/core/bank.js src/core/detectors.js src/core/graph.js src/core/matching.js src/core/logical.js tests validation/pymatching_check.py > review_b1.diff`. In a fresh Claude chat, paste the review prompt (Appendix T5) and attach `CLAUDE.md`, `DECISIONS.md` and the diff. Read the matching code yourself too. Send the findings to Person B; delete the diff file.
**Pass:** findings sent, or "no findings" stated.
- [ ] Done

### A15 · EDITOR · Sat 12:30 — Ion parameter card

**Do:** create `params/ion.json` from Appendix T6 with your A1 values; check it parses: `node -e "JSON.parse(require('fs').readFileSync('params/ion.json','utf8')); console.log('ok')"`. Commit and push.
- [ ] Done

### A16 · JOINT · Sat 13:00 — J3 (SP1)

Your part: step 1, step 5 (publish the generator and send H14), and checking the numbers.
- [ ] Done

### A17 · CLAUDE CODE · Sat 13:30 — CC-A4: trapped-ion readout model

**Do:** `git pull --rebase`; in Claude Code, `/clear`, then paste:

```text
Read CLAUDE.md and DECISIONS.md first.
Owner: Person A. Create or modify only files owned by Person A (see CLAUDE.md).

Task CC-A4: the trapped-ion fluorescence readout model.
Create exactly: src/core/quadrature.js, src/core/readout/ion.js, tests/quadrature.test.js, tests/ion.test.js.

1. quadrature.js: gaussLegendre(n) returns nodes and weights on [-1, 1] (Newton iteration on Legendre polynomials); integrate(f, a, b, n = 64); logIntegrate(logF, a, b, n = 64) computes the log of the integral of exp(logF) with log-sum-exp.
2. ion.js: createIonReadout(params, tau), where params is parsed params/ion.json (rates in counts/us and 1/us; bright_is_bit names the bit that fluoresces). Validate that every required value is a finite number; otherwise throw an error naming the field.
   - Truth sampler measure(trueBit, rng): initial rate Ri = R_bright if the bit is bright, else R_dark; final rate Rf = the other one; switch rate g = gamma_bright_to_dark (bright) or gamma_dark_to_bright (dark). Draw t ~ Exponential(g) (no switch if g = 0). If t < tau the count is n ~ Poisson(Ri t + Rf (tau - t)), else n ~ Poisson(Ri tau). At most one switch.
   - Belief log-likelihood logLik(n, bit) = log[ e^{-g tau} Pois(n; Ri tau) + integral_0^tau g e^{-g t} Pois(n; Ri t + Rf (tau - t)) dt ], evaluated in log space with logIntegrate and a Lanczos lgamma, so that counts up to 500 do not overflow.
   - llr(n) = logLik(n, 1) - logLik(n, 0).
   - Threshold nTh: the integer minimizing the belief-model average assignment error, searched over n = 0 .. ceil(R_bright tau + 10 sqrt(R_bright tau) + 10). hard = bright bit if n > nTh, else the other bit.
   - averageAssignmentError() = the belief-model average error at nTh. idleFlipProbability() = 0.5 (1 - exp(-tau / T1_idle_us)).
   - measure returns { hard, llr, n }. Also provide countHistogram(bit, nSamples, rng) as a method of the returned object, as in the Module API.

Tests (each with the required break comment):
- Closed form: with both gammas 0 and bright_is_bit = 1, llr(n) equals n ln(R_bright/R_dark) - (R_bright - R_dark) tau to 1e-9 for n = 0, 3, 10, 40.
- V7: with both gammas 0, the empirical assignment error from 200000 truth samples equals the analytic Poisson tail sums at nTh within 4 binomial standard errors.
- Threshold boundary (non-vacuous): the belief error at nTh is lower than at nTh - 1 and lower than at nTh + 1.
- V10 calibration with belief equal to truth (both gammas 0): among samples with |llr| in [1, 2), the observed error frequency equals the mean of 1/(1 + e^{|llr|}) within 4 standard errors.
- Pumping matters: with a large gamma_bright_to_dark, the mean bright count is lower than with gamma 0 (fixed seed).
- quadrature: integrates x^10 on [0, 1] and exp(-x) on [0, 5] to 1e-12; logIntegrate agrees with log(integrate) on a smooth positive function.

Run `npm test`. End with the report format.
```

Then `npm test`, commit, push, and send `HANDOFF H7: ion.js, params/ion.json`.
**Pass:** all tests pass, including V7 and V10; pushed by 15:00.
- [ ] Done

### A18 · CLAUDE CODE · VERIFY · Sat 15:00 — CC-A5: Stage 2 sweeps

**Do:** in Claude Code, `/clear`, then paste:

```text
Read CLAUDE.md and DECISIONS.md first.
Owner: Person A. Create or modify only files owned by Person A (see CLAUDE.md).

Task CC-A5: Stage 2 sweeps (hard against soft decoding) and optimum estimation.
Create exactly: src/core/optimum.js, tests/optimum.test.js. Modify tools/sweep.mjs only to add a --stage 2 option; do not change the behaviour or outputs of --stage 1 or --diag.

1. optimum.js: findMinimum(xs, ys, { logX: true }) fits a quadratic in ln x through the lowest grid point and its neighbours (up to 5 points) and returns { xMin, yMin, atEdge }; atEdge is true when the lowest point is the first or the last grid point (then there is no interior minimum and xMin is that grid point). minimumWithBootstrap(xs, perShotMatrix, B, rng) resamples quantum-shot indices, recomputes the curve and returns { xMin, lo, hi, fractionAtEdge }.
2. tools/sweep.mjs --stage 2: load params/ion.json and the rep_*.json banks. For each tau in params tau grid:
   (a) F1-ion: averageAssignmentError() and the empirical error from 200000 truth samples;
   (b) F2-ion: logical error for d = 3 and 5 at r = 3 (and d = 7 if its banks exist), logical states pooled, hard and soft modes, Wilson intervals, pGate per bank from calibration with readout off, R = 4 readout draws per quantum shot. Store, for each grid point, the per-quantum-shot mean error over the R draws.
   Then: tau*_phys = findMinimum of F1 (belief curve); tau*_log per distance and mode with minimumWithBootstrap (B = 200) on the stored per-shot values; report "no interior minimum" when atEdge.
   Write data/results/stage2_ion.json (schema s2s-results/1, with provenance and the parameter card copied in). Print V7 and V10 summaries and the runtime.

Tests (break comments required): findMinimum recovers the known minimum of a quadratic in ln x; atEdge is true for a monotone series and false for a series with an interior minimum (non-vacuous pair).

Run `npm test` and `node tools/sweep.mjs --stage 2`. End with the report format.
```

Then run `node tools/sweep.mjs --stage 2` and check: V7 and V10 pass; with pumping, assignment error has a minimum in $\tau$ (record $\tau^*_{\text{phys}}$); soft is at or below hard at every $\tau$ (C2); record $\tau^*_{\log}$ per distance or "no interior minimum" (C1, ion part). Write these in `docs/notes_results.md`. Commit, push, send `HANDOFF H8: stage2_ion.json`.
**Pass:** pushed by 16:30.
- [ ] Done

### A19 · SELF · Sat 16:30 — Ion results paragraph

Write one paragraph on what the ion arm shows for C1 and C2, with numbers and intervals, in `docs/notes_results.md`. Commit and push.
- [ ] Done

### A20 · CLAUDE CODE · Sat 17:00 — CC-A6: superconducting readout model

**Do:** create `params/sc.json` from Appendix T6 (check it parses). In Claude Code, `/clear`, then paste:

```text
Read CLAUDE.md and DECISIONS.md first.
Owner: Person A. Create or modify only files owned by Person A (see CLAUDE.md).

Task CC-A6: the superconducting dispersive readout model.
Create exactly: src/core/special.js, src/core/readout/sc.js, tests/special.test.js, tests/sc.test.js.

1. special.js: erfc(x) accurate to 1e-12 (series for small |x|, continued fraction for large |x|), normalLogPdf(x, mu, sigma), lgamma (Lanczos) if not already exported elsewhere (do not edit other files; duplicate a small private copy if needed).
2. sc.js: createScReadout(params, tau) with params from params/sc.json: chi_over_2pi_MHz, kappa_over_2pi_MHz, nbar, eta, T1_us, detection ("heterodyne" or "homodyne"), ringup (true or false). Convert chi and kappa to rad/us (2 pi f).
   - s_b = -1 for bit 0, +1 for bit 1. Drive eps_d real with |eps_d| = sqrt(nbar (kappa^2/4 + chi^2)), so |alpha_ss|^2 = nbar.
   - alpha_ss_b = eps_d / (kappa/2 + i s_b chi). With ringup: alpha_b(t) = alpha_ss_b (1 - exp(-(kappa/2 + i s_b chi) t)); after a decay at t_d the field evolves from alpha_1(t_d) under the bit-0 equation: alpha(t) = alpha_ss_0 + (alpha_1(t_d) - alpha_ss_0) exp(-(kappa/2 - i chi)(t - t_d)). Without ringup the field takes the steady-state value of the current state instantly.
   - u_hat = (alpha_ss_1 - alpha_ss_0) / |alpha_ss_1 - alpha_ss_0|; c = sqrt(2) for heterodyne, 2 for homodyne. Mean signal mu = (c sqrt(eta kappa) / tau) * integral_0^tau Re[alpha(t) conj(u_hat)] dt, computed with closed-form integrals of the exponentials (no numerical integration). Noise sigma = 1/sqrt(tau).
   - Precompute mu0, mu1 (no decay) and a table of the decay mean over 256 points of t_d in [0, tau]; interpolate linearly.
   - measure(trueBit, rng): bit 0 gives s = mu0 + sigma * normal; bit 1 draws t_d ~ Exponential(1 / T1_us) and gives s = (t_d >= tau ? mu1 : decay mean at t_d) + sigma * normal. hard = 1 if s > (mu0 + mu1) / 2. Return { hard, llr, s }.
   - Belief: logLik(s, 0) = normalLogPdf(s, mu0ss, sigma); logLik(s, 1) = log[ e^{-tau/T1} N(s; mu1ss, sigma) + integral_0^tau (e^{-t/T1} / T1) N(s; mu0ss + (mu1ss - mu0ss) t / tau, sigma) dt ] with the steady-state means (ring-up ignored), via logIntegrate from src/core/quadrature.js. llr = logLik(s, 1) - logLik(s, 0).
   - averageAssignmentError(): from the belief densities on each side of the threshold, by numerical integration. idleFlipProbability() = 0.5 (1 - exp(-tau / T1_us)).
   - Provide the methods snr() = c |alpha_ss_1 - alpha_ss_0| sqrt(eta kappa tau) and iqSamples(bit, n, rng) on the returned object, as in the Module API; iqSamples returns { i, q } points around the projected mean with independent noise of standard deviation sigma on both quadratures, for the interface.

Tests (break comments required):
- erfc against known values (erfc(0) = 1, erfc(1), erfc(3)) to 1e-12.
- V8: with T1_us = 1e12 and ringup false, the empirical assignment error from 200000 samples equals 0.5 erfc(SNR / (2 sqrt(2))) within 4 binomial standard errors.
- With ringup false, (mu1 - mu0) / sigma equals snr() to 1e-9.
- U-curve (non-vacuous pair): with T1_us = 20 and ringup false, the error at an intermediate tau is lower than at both ends of a grid from 0.05 to 20 us; with T1_us = 1e12 the error decreases monotonically on the same grid.
- At fixed nbar, kappa |delta alpha|^2 is larger at kappa = 2 chi than at 1.9 chi and at 2.1 chi.
- V10 calibration with ringup false (belief equals truth): among samples with |llr| in [1, 2), the observed error frequency matches the mean of 1/(1 + e^{|llr|}) within 4 standard errors.
- idleFlipProbability at tau = T1 equals 0.5 (1 - e^{-1}).

Run `npm test`. End with the report format.
```

Then `npm test`, commit, push, send `HANDOFF H9: sc.js, params/sc.json`.
**Pass:** all tests pass, including V8 and V10; pushed by 19:15.
- [ ] Done

### A21 · REVIEW · Sat 19:15 — Cross-review of Person B's interface (levels 1–4)

**Do:** `git diff sp1..HEAD -- src/ui tools/build.mjs tools/release_check.mjs > review_b2.diff`; review in a fresh Claude chat with the Appendix T5 prompt, focusing on whether the interface shows the physics correctly (labels, units, which curve is which). Play the ion levels in Person B's latest local build. Send findings.
- [ ] Done

### A22 · JOINT · Sat 20:00 — J4 (SP2)

- [ ] Done

### A23 · QOLLAB · TERMINAL · Sat 20:30 — V4 batch on the ideal simulator

**Do:** in the generator project run each V4 configuration as its own run (one job per run): set `CONFIG` to `v4_d3_r3_i0_k0`, Run with **IonQ Forte 1** picked in the dialog (the generator itself switches V4 names to the `ideal` noise model, D1), and copy the `BEGIN_BANK` … `END_BANK` block into `data/raw/v4/<name>.txt`; repeat for every site. These are 100-shot ideal runs, so each should take well under a minute. Then `node tools/assemble_bank.mjs data\raw\v4`. Expect 24 files `v4_*.json` (9 for $d=3$, 15 for $d=5$). If time runs short, do the 9 sites at $d=3$ only and note this in your section of `DECISIONS.md`. Commit and push.
- [ ] Done

### A24 · CLAUDE CODE · Sat 21:00 — CC-A7: V4 test and Stage 3 sweeps

**Do:** in Claude Code, `/clear`, then paste:

```text
Read CLAUDE.md and DECISIONS.md first.
Owner: Person A. Create or modify only files owned by Person A (see CLAUDE.md).

Task CC-A7: validation V4 and the Stage 3 sweeps.
Create exactly: tests/v4.test.js. Modify tools/sweep.mjs only to add a --stage 3 option; do not change the other options.

1. tests/v4.test.js: load every data/banks/v4_*.json (skip with a clear message if there are none). Each must have exactly one outcome. Take the injection (i, k) from the bank's "inject" field. Compute the expected measured bits from the error-free bits (ancilla 0, data equal to the logical value) by applying applyX(m, x, d, r, i, k) from src/core/idle.js. The simulator outcome must equal the expectation bit for bit. Break comment: fails if the classical idle-injection rule disagrees with a physical X gate in the circuit.
2. tools/sweep.mjs --stage 3: as --stage 2 but with params/sc.json and createScReadout: F1-sc (belief-model assignment error and the empirical error from 200000 truth samples, with ringup as set in the parameter file), F2-sc (logical error for d = 3 and 5 at r = 3, and d = 7 if present; hard and soft; R = 4; bootstrap B = 200 over the stored per-shot values), tau*_phys and tau*_log with intervals or "no interior minimum". Write data/results/stage3_sc.json with provenance and the parameter card. Print V8 and V10 summaries and the runtime.

Run `npm test` and `node tools/sweep.mjs --stage 3`. End with the report format.
```

Start `node tools/sweep.mjs --stage 3`. At 22:15, whatever the state: commit (message `WIP CC-A7: <state>` if unfinished), push, and write five handoff lines in your section of `DECISIONS.md` (what passed, what fails, the next step, what to check first, the time).
- [ ] Done

### A25 · SELF · Sat 22:30 — Sleep

Alarm at 04:15.
- [ ] Done

### A26 · TERMINAL · VERIFY · Sun 04:30 — Finish Stage 3 and hand over

**Do:** `git pull --rebase`, read your handoff lines, finish CC-A7 if needed, then `npm test` and `node tools/sweep.mjs --stage 3`. Check V4, V8, V10; the U-curve and $\tau^*_{\text{phys}}$; whether an interior $\tau^*_{\log}$ exists and lies below $\tau^*_{\text{phys}}$ beyond the intervals (C1); soft at or below hard (C2). Record in `docs/notes_results.md`. Commit, push, send `HANDOFF H10: stage3_sc.json`.
**Pass:** pushed by 06:00.
- [ ] Done

### A27 · CLAUDE CODE · VERIFY · Sun 06:00 — CC-A8: Stage 4 comparison

**Do:** create `params/cycle.json` from Appendix T6 (check it parses). In Claude Code, `/clear`, then paste:

```text
Read CLAUDE.md and DECISIONS.md first.
Owner: Person A. Create or modify only files owned by Person A (see CLAUDE.md).

Task CC-A8: Stage 4 comparison metrics.
Create exactly: src/core/metrics.js, tests/metrics.test.js. Modify tools/sweep.mjs only to add a --stage 4 option.

1. metrics.js:
   - perRound(pL, r) = 0.5 (1 - (1 - 2 pL)^(1/r)) for pL < 0.5; perRoundToTotal(eps, r) = 0.5 (1 - (1 - 2 eps)^r).
   - cycleTime(card, tau) = gate_layers_per_round * two_qubit_gate_us + tau + reset_us.
   - perMicrosecond(eps, Tcyc) = eps / Tcyc.
   - breakEven(xs, yD3, yD5) returns the x where yD5 - yD3 changes sign (linear interpolation), or null if it never does.
2. tools/sweep.mjs --stage 4: load stage2_ion.json, stage3_sc.json, params/cycle.json, params/ion.json, params/sc.json and the rep_*.json banks.
   - For each platform and mode: per-round logical error at tau*_log (or at the best grid point when there is no interior minimum) and per microsecond.
   - Break-even: using averageAssignmentError at each tau as the x axis, the break-even assignment error between d = 3 and d = 5, and the tau where it occurs.
   - Sensitivity: for each physical parameter of each platform, scale it by 0.5 and by 2 in turn, rerun the Stage 2 or 3 computation at reduced statistics (R = 1, at most 1000 shots per bank, no bootstrap), and record for each conclusion whether it holds, flips or is undetermined, with these definitions:
     C1 holds if, for the superconducting arm, there is an interior minimum and tau*_log < tau*_phys, and for the ion arm there is no interior minimum driven by idle errors (idle probability below 1e-6 at every tau).
     C2 holds if soft is at or below hard at every tau (within Wilson intervals) and strictly below at one or more tau.
     C3 holds if the ordering of the two platforms by per-round error differs from their ordering by per-microsecond error.
     C4 holds if the two break-even assignment errors differ by less than the sum of their half-widths (use Wilson-based intervals at the neighbouring grid points).
   - Write data/results/stage4_comparison.json with all tables, provenance and the parameter cards. Print a summary and the runtime.

Tests (break comments required): perRound inverts perRoundToTotal to 1e-12; perRound(pL, 1) equals pL; breakEven finds the crossing of two straight lines at a known x and returns null for parallel lines (non-vacuous pair); cycleTime arithmetic on a hand example.

Run `npm test` and `node tools/sweep.mjs --stage 4`. End with the report format.
```

Run `node tools/sweep.mjs --stage 4`; recompute one per-round and one per-microsecond value by hand. Commit, push, send `HANDOFF H11: stage4_comparison.json, params/cycle.json`.
**Pass:** your hand values agree to three significant figures; pushed by 08:00.
- [ ] Done

### A28 · SELF · REVIEW · Sun 08:00 — Interpret C1–C4; review the superconducting interface

**Do:** in `docs/notes_results.md`, write for each hypothesis: held, refuted or undetermined, with numbers and the sensitivity result, and one sentence on why. Then review Person B's superconducting interface and level 5 in their latest local build (labels, units, the caption).
- [ ] Done

### A29 · JOINT · Sun 09:00 — J5 (SP3)

- [ ] Done

### A30 · CLAUDE CODE · Sun 09:30 — CC-A9: draft the project page

**Do:** in Claude Code, `/clear`, then paste:

```text
Read CLAUDE.md and DECISIONS.md first.
Owner: Person A. Create or modify only files owned by Person A (see CLAUDE.md).

Task CC-A9: draft the project page.
Create exactly: docs/project_page.md (a shared file; Person B will edit the sections on running the project, the levels and accessibility afterwards).

Use only facts from README.md, DECISIONS.md, docs/notes_results.md, data/results/*.json, params/*.json and the planning documents in docs/. Every number must come from these files; put an HTML comment naming the source file next to each number. Sections: a one-sentence hook; what it is and how to run it (browser note: Chrome, Edge or Opera); the physics in plain language (one short paragraph per stage); what runs where (IonQ simulator versus classical models); results for C1-C4 with intervals, stating plainly when a hypothesis was refuted or untested; a validation summary V1-V10 with outcomes; limitations; how to extend the project; references with links; the exact line "This effort is supported by Qollab & IonQ."; and the AI-assistance and planning disclosure from README.md. Do not invent results; write "not measured" where data are missing.

End with the report format.
```

Commit, push, and tell Person B the draft is in place.
- [ ] Done

### A31 · EDITOR · Sun 11:00 — Physics and results sections of the page

**Do:** edit the hook, the physics, "what runs where", the results for C1–C4, validation and limitations in `docs/project_page.md`, checking every number against `data/results` and `docs/notes_results.md`. Leave "how to run", the interface description and accessibility to Person B. Commit and push.
- [ ] Done

### A32 · JOINT · Sun 13:00 — J6 (SP4)

- [ ] Done

### A33 · SELF · Sun 13:30 — Finish your page sections; check references

**Do:** finish your sections; check every reference against the publisher; add the "Methods implemented and sources" text for the readout models, idle rule, Wilson intervals, bootstrap and PTRS, and send it to Person B for the README. Open the generator project in a signed-out window and run the smallest configuration.
- [ ] Done

### A34 · JOINT · Sun 17:30 — J7

- [ ] Done

### A35 · CLAUDE CODE · Sun 18:00 — Buffer: fix bugs in your files

**Do:** fix only blocking and major bugs in files you own, each with the fix prompt (Appendix T5), then `npm test`, commit, push. No new features.
- [ ] Done

### A36 · JOINT · Sun 21:00 — J8

Review Person B's files since `sp4`.
- [ ] Done

### A37 · JOINT · Sun 22:30 — J9

- [ ] Done

---

## 7. Person B checklist — decoder, interface and platform

### B1 · QOLLAB · SELF · before Thu 8 Oct — Platform study and sketches

**Why:** you own everything that runs in Qollab's JavaScript project, and you build the interface.
**Do:** open Qollab's lesson on running a circuit in JavaScript; copy Qollab's example (how a circuit is built, how `backend.run` is called from JavaScript, how results are unpacked with `.toJs()`) into your notes. Note how projects are created, published and licensed, and whether two accounts can share a project. Sketch the three-panel layout and levels 1–5 on paper (project plan, Section 18). Read a short guide to web accessibility (keyboard focus, contrast, text alternatives for charts). Before Saturday, run probe P10 (Appendix T4) once and record the result as D11 in your section of `DECISIONS.md`; tell Person A the outcome, because it decides whether they write `qollab/live.py` in CC-A1.
**Pass:** you can describe the JavaScript API pattern and the publishing steps from your notes; D11 has an answer.
- [ ] Done

### B2 · QOLLAB · PLATFORM · Sat 04:35 — JavaScript probes

**Do:** run probes P5 and P6 from Appendix T4. Also check whether Person A's Qollab account can edit a project you own (if Qollab supports team projects).
**Pass:** answers for D4, D5 and D9 noted for J2 (handoff H12).
- [ ] Done

### B3 · JOINT · Sat 06:00 — J2

You do steps 2–4 of J2 (clone, create `CLAUDE.md`, `DECISIONS.md` and the docs files, push).
- [ ] Done

### B4 · CLAUDE CODE · GIT · Sat 06:10 — CC-B1: scaffold

**Do:** in TERMINAL:

```bat
%USERPROFILE%\venvs\s2s\Scripts\activate.bat
claude
```

In Claude Code, `/clear`, then paste:

```text
Read CLAUDE.md and DECISIONS.md first.
Owner: Person B. Create or modify only files owned by Person B (see CLAUDE.md).

Task CC-B1: scaffold the repository. Create exactly these files and folders:

1. package.json: name "signal-to-syndrome", version "0.1.0", private true, "type": "module", "engines": {"node": ">=20"}, scripts {"test": "node --test", "build": "node tools/build.mjs", "check": "node tools/release_check.mjs"}. Then run `npm install --save-dev esbuild` (the only dependency allowed).
2. .gitignore containing: node_modules/, dist/, __pycache__/, *.pyc, .pytest_cache/
3. LICENSE: the standard MIT licence text with "Copyright (c) 2026 PERSON_A_NAME and PERSON_B_NAME".
4. README.md with these sections, using short placeholder text where content does not exist yet: title "Signal to Syndrome"; "Authors" (PERSON_A_NAME: physics and data; PERSON_B_NAME: decoder, interface and platform); a one-paragraph description based on CLAUDE.md; "Status" (SP0, scaffold); "Run it on Qollab"; "Rebuild locally" (npm install, npm test, npm run build); "Repository layout"; "Methods implemented and sources" (empty list); "Libraries and tools" (esbuild as a build-only tool; Qiskit; the IonQ provider through Qollab; PyMatching and pytest for local validation only); "AI assistance and planning disclosure" (placeholder: planning documents and prompts were prepared before the build window; all code was generated during the window with Claude Code under the authors' direction and reviewed by the authors); "Licence" (MIT); and the exact line "This effort is supported by Qollab & IonQ."
5. Empty folders, each kept with a .gitkeep file: src/core/readout, src/ui/stubs, tools, tests, qollab, validation, data/banks, data/raw, data/results, data/vectors, data/fixtures, params, docs. Do not touch CLAUDE.md, DECISIONS.md or any existing file in docs/.
6. tests/smoke.test.js: one passing test, with the required comment stating the break it catches (it fails if the test runner is misconfigured).
7. tools/build.mjs and tools/release_check.mjs: stubs that print "not implemented yet (CC-B6)" and exit with code 0.

Create nothing else. Run `npm test`. End with the report format from CLAUDE.md and list PERSON_A_NAME and PERSON_B_NAME as open issues for the humans.
```

Then in EDITOR replace `PERSON_A_NAME` and `PERSON_B_NAME` in `LICENSE` and `README.md`, and in TERMINAL:

```bat
npm test
git add -A
git commit -m "CC-B1: scaffold"
git tag start
git push
git push --tags
```

Send `HANDOFF scaffold`.
**Pass:** pushed by 06:30; Person A acknowledges.
- [ ] Done

### B5 · CLAUDE CODE · GIT · Sat 06:30 — CC-B2: randomness, banks, detectors

**Do:** in Claude Code, `/clear`, then paste:

```text
Read CLAUDE.md and DECISIONS.md first.
Owner: Person B. Create or modify only files owned by Person B (see CLAUDE.md).

Task CC-B2: randomness, banks and detectors.
Create exactly: src/core/rng.js, src/core/bank.js, src/core/detectors.js, tests/rng.test.js, tests/bank.test.js, tests/detectors.test.js. Follow the Module API in CLAUDE.md exactly; Person A's code will depend on it.

1. rng.js: createRng(seed) returning { uniform(), normal(), exponential(rate), poisson(lambda), int(n) }. uniform: mulberry32. normal: Box-Muller with a cached second value. poisson: Knuth's multiplication method for lambda < 30, PTRS (Hormann 1993) for lambda >= 30; lambda = 0 returns 0.
2. bank.js: validateBank(obj) (schema s2s-bank/1, required fields, checksum totals; extra fields such as "inject" or "fixture" are allowed; throws with a clear message); bitsFromKey(hexKey, nClbits) -> Uint8Array where element b is classical bit b (bit 0 = least significant bit); expandShots(bank) -> array of Uint8Array, keys in ascending numeric order, each repeated by its count; split(shotBits, layout, d, r) -> { m: array of r Uint8Array(d-1), x: Uint8Array(d) }.
3. detectors.js: computeDetectors(m, x, d, r) -> Uint8Array((d-1)*(r+1)) with D[k][j] = m[k][j] XOR m[k-1][j] (m[-1] = 0) for k < r, and D[r][j] = x[j] XOR x[j+1] XOR m[r-1][j]; index k*(d-1) + j.

Tests (each with the required break comment):
- rng: the same seed gives the same first 1000 uniforms; different seeds differ; normal mean and variance; poisson mean and variance at lambda = 5 and lambda = 50 (both branches); tolerances of at least 4 standard errors with the formula in the comment.
- bank: bitsFromKey for a key where only bit 0 is set and a key where only bit n-1 is set (a non-vacuous boundary pair); expandShots length equals total shots; split on a hand-built d = 3, r = 2 shot; validateBank accepts an extra "inject" field and rejects a wrong total.
- detectors: no errors gives all zeros; a flip of interior data qubit i before round k (applied by hand to m and x) lights exactly D[k][i-1] and D[k][i]; an end-qubit flip lights exactly one detector; a single wrong m[k][j] with k < r-1 lights D[k][j] and D[k+1][j]; a wrong m[r-1][j] lights D[r-1][j] and the final-layer D[r][j].

Run `npm test`. End with the report format.
```

Then `npm test`, `git pull --rebase`, `git status --short` (only your files), `git add -A`, `git commit -m "CC-B2: rng, banks, detectors"`, `git push`. Send `HANDOFF H1 and H2: rng.js, bank.js, detectors.js`.
**Pass:** all tests pass; pushed by 07:45.
- [ ] Done

### B6 · CLAUDE CODE · GIT · Sat 07:45 — CC-B3: decoding graph, matching decoder, logical decision

**Do:** in Claude Code, `/clear`, then paste:

```text
Read CLAUDE.md and DECISIONS.md first.
Owner: Person B. Create or modify only files owned by Person B (see CLAUDE.md).

Task CC-B3: the decoding graph, the matching decoder and the logical decision.
Create exactly: src/core/graph.js, src/core/matching.js, src/core/logical.js, tests/graph.test.js, tests/matching.test.js, tests/logical.test.js.

1. graph.js:
   - buildGraph(d, r) for odd d >= 3 and r >= 1. Nodes: detectors 0..(d-1)*(r+1)-1 and the boundary node B = (d-1)*(r+1). Edges, each { id, u, v, kind, layer, dataQubit, check, round, observable }:
     space-like, for every layer k = 0..r: data qubit 0 joins (k, 0) to B with observable = true; data qubit i = 1..d-2 joins (k, i-1) to (k, i); data qubit d-1 joins (k, d-2) to B.
     time-like, for every check j and round k = 0..r-1: joins (k, j) to (k+1, j); it represents a wrong report of m[k][j].
   - Expected counts: d*(r+1) space-like edges, (d-1)*r time-like edges, r+1 observable edges.
   - weightFromP(p) = ln((1-p)/p) with p clamped to [1e-12, 0.5]; weightFromLlr(llr) = |llr| (Infinity allowed); pFromLlr(llr) = 1/(1 + exp(|llr|)); xorP(a, b) = a + b - 2ab.
2. matching.js: decode(graph, weights, detectorBits) -> { flip, nDefects, exact, cost, paths }, exactly as in the Module API: paths lists every chosen pairing as { a, b, edges }, with b = "B" for the boundary and edges the edge ids along the chosen shortest path.
   - Lit detectors are the indices with bit 1. Run Dijkstra from each lit detector over the whole graph, including the boundary node; weights are non-negative and Infinity edges are unusable. Track, for each shortest path, the parity of observable edges; break ties deterministically by lower parity, then lower predecessor index.
   - Pair cost and parity for every pair of lit detectors; boundary cost and parity for each.
   - If nDefects <= 20: exact dynamic programming over subsets (always resolve the lowest unmatched detector, either to the boundary or to another unmatched detector), Float64Array of size 2^n, stored choices, reconstruction; flip = XOR of chosen parities; exact = true.
   - If nDefects > 20: greedy (repeatedly take the cheapest remaining pair or boundary option); exact = false.
3. logical.js: correctedLogical(xHat0, flip) = xHat0 XOR flip; isLogicalError(corrected, logical).

Tests (each with the required break comment):
- graph: node and edge counts for (d, r) = (3, 1), (5, 3), (7, 3); the observable edges are exactly the data-qubit-0 edges.
- matching with uniform weights: no defects gives flip 0 and cost 0; a lone defect at (k, 0) gives flip 1; a lone defect at (k, d-2) gives flip 0; an interior horizontal pair gives flip 0; a vertical pair gives flip 0 with cost equal to one time-like weight.
- distance (non-vacuous pair): with d = 3, flips of data qubits 0 and 1 in one layer leave one defect that the decoder resolves through qubit 2, so the corrected logical is wrong; with d = 5, flips of qubits 0 and 1 are resolved correctly.
- exactness: on 300 random instances with up to 8 defects and random positive weights, the dynamic-programming cost equals brute-force enumeration over all matchings.
- more than 20 defects returns exact = false and a valid flip.
- paths: for a vertical pair, the single path contains exactly the one time-like edge between them; for a lone defect at (k, 0), the path ends at "B" and contains the observable edge.

Run `npm test`. End with the report format.
```

Then test, commit and push as in B5. Send `HANDOFF H3: graph.js, matching.js, logical.js`.
**Pass:** all tests pass, including the exactness test; pushed by 09:30.
- [ ] Done

### B7 · CLAUDE CODE · VERIFY · Sat 09:30 — CC-B4: PyMatching cross-check (V2)

**Do:** in Claude Code, `/clear`, then paste:

```text
Read CLAUDE.md and DECISIONS.md first.
Owner: Person B. Create or modify only files owned by Person B (see CLAUDE.md).

Task CC-B4: independent cross-check of the decoder against PyMatching (validation V2).
Create exactly: tools/export_vectors.mjs, validation/pymatching_check.py.

1. tools/export_vectors.mjs [--n 20000] [--seed 1]: for (d, r) in (3,3), (5,3), (5,5), (7,3): build the graph; draw each edge independently with probability 0.03 (seeded rng); lit detectors are the detector nodes (not the boundary) touched an odd number of times; the true observable flip is the parity of drawn observable edges. Decode with src/core/matching.js using uniform weights weightFromP(0.03). Write data/vectors/vectors_d<d>_r<r>.json with: d, r, number of detectors, edges [{u, v, weight, observable}] (v = -1 for boundary edges), shots [{lit, ourFlip, ourCost, ourExact, trueFlip}].
2. validation/pymatching_check.py <files...>: for each file build pymatching.Matching with add_edge(u, v, weight=w, fault_ids={0} if observable else set()) for detector pairs and add_boundary_edge(u, weight=w, fault_ids=...) for boundary edges. Decode each shot's syndrome (a 0/1 array over detectors). Compare predictions with ourFlip. For each mismatch on a shot with ourExact = true, obtain PyMatching's solution weight (decode with return_weight=True if available) and compare with ourCost: |difference| < 1e-9 is a tie, otherwise a genuine mismatch. Report mismatches on ourExact = false shots separately; they are not failures. Print a table per file; exit 1 on any genuine mismatch.

Run `node tools/export_vectors.mjs --n 20000 --seed 1`, then `python validation\pymatching_check.py data\vectors\vectors_d3_r3.json data\vectors\vectors_d5_r3.json data\vectors\vectors_d5_r5.json data\vectors\vectors_d7_r3.json`. End with the report format.
```

Re-run both commands from the prompt yourself. Record the tie counts in your section of `DECISIONS.md`. Commit and push.
**Pass:** zero genuine mismatches in all four files.
- [ ] Done

### B8 · CLAUDE CODE · Sat 10:15 — CC-B5: stubs, fixtures, feature flags, bridges

**Why:** lets you build the whole interface without waiting for Person A.
**Do:** in Claude Code, `/clear`, then paste:

```text
Read CLAUDE.md and DECISIONS.md first.
Owner: Person B. Create or modify only files owned by Person B (see CLAUDE.md).

Task CC-B5: stubs, fixtures, feature flags and bridges, so that the interface can be built before Person A's modules and data exist.
Create exactly: src/ui/stubs/sweep_stub.js, src/ui/stubs/flat_stub.js, src/ui/stubs/ion_stub.js, src/ui/stubs/sc_stub.js, src/ui/bridge_core.js, src/ui/bridge_data.js, src/ui/features.js, tools/make_fixtures.mjs, tests/stubs.test.js.

1. Stubs implement Person A's Module API signatures exactly, with simple placeholder physics:
   - flat_stub: createFlatReadout({ epsilon }) as specified for the real model.
   - ion_stub: createIonReadout(params, tau): Poisson counts with means R_bright*tau and R_dark*tau (values from the parameter card), threshold at the midpoint of the means, llr = n ln(Rb/Rd) - (Rb - Rd) tau, idleFlipProbability() = 0, averageAssignmentError() from Poisson tails, and the method countHistogram(bit, nSamples, rng).
   - sc_stub: createScReadout(params, tau): signal mu0 = 0, mu1 = 4 sqrt(tau), noise sigma = 1, Gaussian llr, idleFlipProbability() = 0.5 (1 - exp(-tau / T1_us)), averageAssignmentError() from a normal tail, and the methods snr() and iqSamples(bit, n, rng).
   - sweep_stub: decodeShot, runPoint and diagnostic with the API signatures, using Person B's own bank, detectors, graph, matching and logical modules, readout.measure on every bit, no idle errors and uniform weights; diagnostic returns "stub0000".
2. bridge_core.js contains exactly these four lines:
   export { decodeShot, runPoint, diagnostic } from './stubs/sweep_stub.js';
   export { createFlatReadout } from './stubs/flat_stub.js';
   export { createIonReadout } from './stubs/ion_stub.js';
   export { createScReadout } from './stubs/sc_stub.js';
3. bridge_data.js contains one import line per item followed by one export line, importing from ../../data/fixtures/: stage1 (stage1_flat.json), stage2 (stage2_ion.json), stage3 (stage3_sc.json), stage4 (stage4_comparison.json), bankD3R1 (rep_d3_r1_L0.json), bankD3R3 (rep_d3_r3_L0.json), paramsIon (params_ion.json), paramsSc (params_sc.json), paramsCycle (params_cycle.json).
4. features.js: export const FEATURES = { level1: true, level2: true, ion: false, superconducting: false, level5: false, liveRun: false };
5. tools/make_fixtures.mjs writes the nine files into data/fixtures/. Every file follows its format in CLAUDE.md (s2s-results/1, s2s-bank/1, or the parameter-card templates in the checklist) and contains "fixture": true at top level. Results contain plainly synthetic smooth curves. The two banks are simulated directly at bit level (data flips before a round flip the reports of the checks touching that qubit in that and later rounds and the final readout; measurement flips change one bit), each data flip and measurement flip with probability 0.02, seed 11, 2000 shots each, keys encoded as in CLAUDE.md, with valid checksums so that validateBank accepts them.

Tests (break comments required): every stub returns objects with exactly the API fields; every fixture file has its required fields and "fixture": true; validateBank accepts both fixture banks.

Run `node tools/make_fixtures.mjs` and `npm test`. End with the report format.
```

Commit and push.
**Pass:** `node tools/make_fixtures.mjs` writes nine files; tests pass.
- [ ] Done

### B9 · CLAUDE CODE · Sat 11:00 — CC-B6: levels 1–2, build tool, release check

**Do:** in Claude Code, `/clear`, then paste:

```text
Read CLAUDE.md and DECISIONS.md first (D5, the bundle-size limit, and D9, the HTML-pane format, matter here).
Owner: Person B. Create or modify only files owned by Person B (see CLAUDE.md).

Task CC-B6: the first interface (levels 1 and 2), the build tool and the release check.
Create exactly: src/ui/main.js, src/ui/level1.js, src/ui/level2.js, src/ui/charts.js, src/ui/diag.js, src/ui/index.template.html, src/ui/style.css; replace the stubs tools/build.mjs and tools/release_check.mjs.

Import everything from Person A (decodeShot, runPoint, diagnostic, createFlatReadout, banks, results, parameter cards) only from src/ui/bridge_core.js and src/ui/bridge_data.js, and do not modify the bridges or features.js. Show each level only when its flag in FEATURES is true.

Interface (one page, sentence-case labels, no external fonts or libraries):
- Header with the title "Signal to Syndrome" and a level selector. Footer with the version from package.json, the exact line "This effort is supported by Qollab & IonQ." and a collapsible "Diagnostics" section.
- Level 1 "Be the decoder": d = 3, one round, shots drawn (seeded) from bankD3R1 among shots with at least one lit detector, flat readout with adjustable epsilon (default 0.02), decoded with decodeShot. Show the three data qubits and two check lights. The player clicks the data qubit they think flipped, or "no correction". Then reveal the decoder's answer and whether the logical value survived; keep a score over 10 shots.
- Level 2 "Time is a dimension": d = 3, three rounds, bankD3R3. Draw the space-time detector grid as SVG (columns = checks, with a boundary column on each side; rows = rounds plus the final layer), lit detectors filled, the decoder's matching drawn from decodeShot's paths; previous and next shot buttons. Below it, an epsilon slider (0 to 0.12) and a chart of logical error against epsilon for d = 3, 5, 7 from stage1, with a marker at the slider value and a live estimate at that value computed with runPoint from 1000 shots of bankD3R3.
- charts.js draws inline SVG charts: axes, ticks, optional log scale, error bars, legend. Series differ by colour and by marker shape; colours remain distinguishable with colour-vision deficiency.
- Accessibility: every control works with the keyboard and shows a visible focus ring; text contrast at least 4.5:1; every chart has a text alternative listing its values.
- diag.js calls diagnostic(bankD3R3) and shows the result in the Diagnostics section.

tools/build.mjs: bundle src/ui/main.js with esbuild (format iife, minify, JSON imports embedded) into dist/qollab/main.js; write dist/qollab/main.css; write dist/qollab/index.html from the template as a body fragment (D9: Qollab strips <html>, <head> and <body> and does not run <script> tags), with no script or stylesheet tags, because Qollab loads main.js and main.css itself. Also write dist/local/preview.html, one self-contained file with the CSS and JavaScript inlined, for local testing. Print each output file's size. (The source files keep their names, src/ui/main.js and src/ui/style.css; only the files in dist/qollab/ use the Qollab names.)

tools/release_check.mjs: exit 1 unless all of these hold, printing a pass/fail table:
- the three dist/qollab files (index.html, main.css, main.js) exist; main.js plus index.html are at most 1 900 000 bytes (D5);
- neither main.js nor index.html contains "fetch(", "XMLHttpRequest", "WebSocket" or "import(";
- every http(s) URL in them has a host on the allowlist qollab.xyz, ionq.com, docs.ionq.com, arxiv.org, doi.org, github.com;
- the attribution line appears in index.html and README.md; LICENSE exists and contains neither PERSON_A_NAME nor PERSON_B_NAME;
- every file in data/banks passes validateBank;
- for every feature set to true in src/ui/features.js, each bridge export it needs is imported from a path containing neither "stubs/" nor "fixtures/". Needs: level1 and level2: decodeShot, runPoint, diagnostic, createFlatReadout, bankD3R1, bankD3R3, stage1; ion: createIonReadout, stage2, paramsIon; superconducting: createScReadout, stage3, paramsSc; level5: stage2, stage3, stage4, paramsIon, paramsSc, paramsCycle; liveRun: nothing.

Run `npm test`, `npm run build` and `npm run check`. While the bridges still point to stubs the check is expected to fail on the bridge rule only; report exactly which lines fail. End with the report format.
```

Open `dist\local\preview.html` and play levels 1 and 2 on the stubs. Commit and push.
**Pass:** tests and build pass; the release check fails only on the bridge rule (stubs still in use).
- [ ] Done

### B10 · EDITOR · TERMINAL · VERIFY · Sat 12:30 — Switch to Person A's real Stage 1 work

**Depends on:** H4, H5 and H6. `git pull --rebase` first.
**Do:** make switches 1–4 of Appendix T3. Then:

```bat
npm test
npm run build
npm run check
start "" "dist\local\preview.html"
```

Open Diagnostics and compare the fingerprint with Person A's (V9).
**Pass:** release check passes; fingerprints match; levels 1–2 show real data. Commit and push.
- [ ] Done

### B11 · JOINT · Sat 13:00 — J3 (SP1)

You lead steps 2–7.
- [ ] Done

### B12 · CLAUDE CODE · Sat 13:30 — CC-B7: ion levels 3–4 and the live-run button

**Do:** in Claude Code, `/clear`, then paste:

```text
Read CLAUDE.md and DECISIONS.md first.
Owner: Person B. Create or modify only files owned by Person B (see CLAUDE.md).

Task CC-B7: levels 3 and 4 for the trapped-ion readout, and the live-run button.
Create exactly: src/ui/level3.js, src/ui/level4.js, src/ui/liverun.js. Modify only src/ui/main.js (register the levels), src/ui/style.css, tools/build.mjs and tools/release_check.mjs (the live-run import, below).

Use only the bridges for Person A's modules and data (createIonReadout, decodeShot, runPoint, stage2, paramsIon, bankD3R3). Show the trapped-ion platform only when FEATURES.ion is true and the live-run button only when FEATURES.liveRun is true. Do not modify the bridges or features.js.

- Level 3 "Listen longer?": a detection-time slider over the tau grid of paramsIon; histograms of photon counts for bright and dark (the readout object's countHistogram method, 5000 samples each) with the threshold marked; the assignment error at the slider value; the chart of logical error against tau from stage2 (hard mode) for each distance, with optima.tauPhys and optima.tauLog marked (or "no interior minimum"); a "Batch" button that runs runPoint with 200 shots of bankD3R3 at the slider value and shows the logical error with its interval.
- Level 4 "Trust but verify": the level 2 grid, each lit detector shaded by the confidence of the measurements that produced it (from decodeShot's llrAnc and llrData; opacity plus ring thickness, never colour alone); for each shot, decodeShot in mode "hard" and in mode "soft" with the same seed, their matchings (paths) side by side, and whether each kept the logical value; a running tally over 20 shots; and the chart of hard against soft logical error against tau (stage2).
- liverun.js: the live run must use native gates, or it returns no detector events (DECISIONS platform facts, D4), so JavaScript does not build the circuit itself: it calls Person A's Python helper qollab/live.py, as tested in probe P10 (D11). If D11 says the live run works: a "Run a fresh experiment" button that calls `(await globalThis.s2sLive.run_live.callPromising(backend, 200, seed)).toJs()` (`backend` is Qollab's pre-created global; seed is a new integer per press, for example Date.now() modulo 2^31, shown on screen), converts a Map result with Object.fromEntries, turns the binary-key counts into an in-memory s2s-bank/1 bank for d = 3, r = 3, L0 (hex keys and layout as in CLAUDE.md, with a checksum that validateBank accepts), validates it with validateBank, and feeds it to level 4. Show a status line while the job runs (expect tens of seconds to minutes) and a clear message on error. If globalThis.s2sLive is undefined, or D11 says the live run does not work, show instead a short note with a link to the bank generator project (link in DECISIONS.md). Do not invent any API beyond docs/qollab_js_api_example.txt and P10.
- tools/build.mjs: esbuild cannot keep an ES import inside an IIFE (an external import becomes a require() call that fails in the browser), so when FEATURES.liveRun is true, write dist/qollab/main.js as the single line `import * as s2sLive from 'qollab.live'; globalThis.s2sLive = s2sLive;` followed by the IIFE bundle (use 'live' instead of 'qollab.live' if D11 says live.py had to sit at the top level). When liveRun is false, main.js is the IIFE alone, as before. CLAUDE.md rule 3 allows exactly this one import.
- tools/release_check.mjs: when liveRun is false, main.js must not contain "qollab.live"; when it is true, the first line of main.js must be exactly the import line above. Print a reminder that qollab/live.py must be uploaded to the main project with the three files.
- The accessibility rules from CC-B6 apply.

Run `npm test`, `npm run build` and `npm run check`. End with the report format.
```

To try the ion levels locally before Person A's model arrives, temporarily set `ion: true` in `src/ui/features.js`, build and preview; set it back to `false` before committing. Commit and push.
**Pass:** tests and build pass; the ion levels work on stubs in the preview.
- [ ] Done

### B13 · EDITOR · VERIFY · Sat 15:30 — Switch to the real ion model

**Depends on:** H7. `git pull --rebase` first.
**Do:** make switch 5 of Appendix T3 (ion model and parameter card); keep `ion: false` until the Stage 2 results arrive (B16). Build and preview with `ion: true` temporarily to check that the real model works with the interface. Commit (with `ion: false`) and push.
**Pass:** count histograms and live decoding behave sensibly with the real model.
- [ ] Done

### B14 · REVIEW · Sat 16:00 — Cross-review of Person A's Stage 1 and 2 code

**Do:** `git diff start..HEAD -- qollab validation/test_circuits.py tools/assemble_bank.mjs tools/sweep.mjs src/core/readout src/core/idle.js src/core/calibrate.js src/core/stats.js src/core/sweep.js src/core/quadrature.js src/core/optimum.js > review_a1.diff`. Review it in a fresh Claude chat with the Appendix T5 prompt, focusing on contract compliance, bit order, the use of your modules' API, and test quality. Send findings to Person A.
- [ ] Done

### B15 · CLAUDE CODE · Sat 17:00 — CC-B8: superconducting platform in the interface

**Do:** in Claude Code, `/clear`, then paste:

```text
Read CLAUDE.md and DECISIONS.md first.
Owner: Person B. Create or modify only files owned by Person B (see CLAUDE.md).

Task CC-B8: the superconducting platform in the interface.
Create exactly: src/ui/iqview.js. Modify only src/ui/level3.js, src/ui/level4.js, src/ui/main.js and src/ui/style.css.

Use only the bridges (createScReadout, decodeShot, runPoint, stage3, paramsSc, bankD3R3). Show the superconducting platform only when FEATURES.superconducting is true. Do not modify the bridges or features.js.

- A platform toggle (trapped ion / superconducting) shared by levels 3 and 4, listing only enabled platforms; each platform keeps its own slider position.
- Superconducting level 3: an integration-time slider over the tau grid of paramsSc; iqview.js draws IQ samples (the readout object's iqSamples method, 1500 per state) with the two cluster centres and the threshold line, so that decays show as points smeared between the clusters; the assignment-error U-curve from stage3 (assignment) with the current tau marked; logical error against tau (stage3 series, hard) with optima.tauPhys and optima.tauLog marked.
- Superconducting level 4: as for the ion, using createScReadout and stage3.
- The accessibility rules from CC-B6 apply.

Run `npm test`, `npm run build` and `npm run check`. End with the report format.
```

Try it locally with `superconducting: true` temporarily; commit with it set to `false`. Push.
**Pass:** tests and build pass; the platform toggle works on stubs.
- [ ] Done

### B16 · EDITOR · VERIFY · Sat 19:30 — Switch to the real Stage 2 results

**Depends on:** H8.
**Do:** make switches 6–7 of Appendix T3 (results file; `ion: true`). Build, check, preview. If D11 says the live run works and Person A has pushed `qollab/live.py`, prepare `liveRun: true` for J4. The local preview has no `backend`, so the live run can only be tested on Qollab, in J4 step 4.
**Pass:** release check passes with `ion: true`.
- [ ] Done

### B17 · JOINT · Sat 20:00 — J4 (SP2)

- [ ] Done

### B18 · CLAUDE CODE · Sat 20:30 — CC-B9: level 5

**Do:** in Claude Code, `/clear`, then paste:

```text
Read CLAUDE.md and DECISIONS.md first.
Owner: Person B. Create or modify only files owned by Person B (see CLAUDE.md).

Task CC-B9: level 5, the platform comparison.
Create exactly: src/ui/level5.js. Modify only src/ui/main.js and src/ui/style.css.

Use only the bridges (stage2, stage3, stage4, paramsIon, paramsSc, paramsCycle). Show level 5 only when FEATURES.level5 is true. Do not modify the bridges or features.js.

- Side-by-side charts of logical error against tau for both platforms (each on its own tau axis, labelled in microseconds), with a toggle between "per round" and "per microsecond" (from stage4).
- A table of tau*_phys, tau*_log, per-round and per-microsecond logical error, and break-even assignment error, for both platforms and both decoding modes.
- The sensitivity table (holds / flips / undetermined).
- Each parameter card with its sources, with UNSOURCED labels visible.
- A fixed caption: "Both readout models are classical models with literature parameters, applied to the same IonQ-simulated circuit noise. This is a controlled comparison of readout physics, not a hardware benchmark."
- The accessibility rules from CC-B6 apply.

Run `npm test`, `npm run build` and `npm run check`. End with the report format.
```

Try it locally with `level5: true` temporarily; commit with `false`; push. At 22:15, whatever the state, commit and push, and write five handoff lines in your section of `DECISIONS.md`.
- [ ] Done

### B19 · SELF · Sat 22:30 — Sleep

Alarm at 04:15.
- [ ] Done

### B20 · CLAUDE CODE · VERIFY · Sun 04:30 — CC-B10: accessibility pass

**Do:** `git pull --rebase`; read your handoff lines; finish CC-B9 if needed. Then in Claude Code, `/clear`, paste:

```text
Read CLAUDE.md and DECISIONS.md first.
Owner: Person B. Create or modify only files owned by Person B (see CLAUDE.md).

Task CC-B10: accessibility and polish pass.
Modify only files in src/ui/.

Check and fix: keyboard reachability and a sensible tab order for every control; visible focus; aria-labels on controls without visible text; a text alternative listing the values of every chart; contrast of every text and background pair at least 4.5:1 (compute and list the ratios); no information carried by colour alone; the reduced-motion preference respected; the page usable at 360 px width. Produce a table of every check with pass/fail before and after.

Run `npm test`, `npm run build` and `npm run check`. End with the report format.
```

Then complete level 1 and level 3 using only the keyboard. Commit and push.
**Pass:** the report's check table is all "pass"; your keyboard-only run succeeds.
- [ ] Done

### B21 · EDITOR · VERIFY · Sun 07:00 — Switch to the real superconducting work

**Depends on:** H9 and H10.
**Do:** make switches 8–10 of Appendix T3. Build, check, preview both platforms. Commit and push.
**Pass:** release check passes with `superconducting: true`.
- [ ] Done

### B22 · EDITOR · VERIFY · Sun 08:30 — Switch to the real Stage 4 results

**Depends on:** H11.
**Do:** make switch 11 of Appendix T3 (keep `level5: false` until J6). Preview level 5 with `level5: true` temporarily. Commit with `false`; push.
- [ ] Done

### B23 · JOINT · Sun 09:00 — J5 (SP3)

- [ ] Done

### B24 · REVIEW · Sun 09:30 — Cross-review of Person A's Stage 3 and 4 code

**Do:** `git diff sp2..HEAD -- src/core/readout/sc.js src/core/special.js src/core/metrics.js tools/sweep.mjs tests > review_a2.diff`; review in a fresh Claude chat with the Appendix T5 prompt, asking the reviewer to re-derive $|\Delta\alpha|^2$ and the SNR formula independently. Send findings.
- [ ] Done

### B25 · EDITOR · Sun 11:00 — README and the interface sections of the page

**Do:** finalize `README.md` (authors, how to run on Qollab with both links, how to rebuild, repository layout, libraries and tools, the AI-assistance and planning disclosure in the form the rules require, licence, attribution), adding Person A's "Methods implemented and sources" text. In `docs/project_page.md`, write "How to run it" (browser note: Chrome, Edge or Opera), the description of each level, and accessibility. Take screenshots of every level. Commit and push.
- [ ] Done

### B26 · JOINT · Sun 13:00 — J6 (SP4)

- [ ] Done

### B27 · SELF · QOLLAB · Sun 13:30 — Demo and the Qollab page

**Do:** record a two-minute walkthrough (Windows: Win+Alt+R with the Xbox Game Bar, or OBS): the question, level 1, the ion level 3 slider, the soft-decoding duel, the superconducting U-curve, the comparison, the honest conclusion. Paste `docs/project_page.md` into the main project's description with the screenshots, the video and the generator link; simplify any formula Qollab does not render.
**Pass:** video under two minutes; the page reads correctly in a signed-out window.
- [ ] Done

### B28 · JOINT · Sun 17:30 — J7

- [ ] Done

### B29 · CLAUDE CODE · Sun 18:00 — Buffer: fix bugs in your files

Fix only blocking and major bugs in files you own, each with the fix prompt (Appendix T5); `npm test`, `npm run build`, `npm run check`; commit; push.
- [ ] Done

### B30 · JOINT · Sun 21:00 — J8

Review Person A's files since `sp4`; then tag `rc1` once both sides' blocking findings are fixed.
- [ ] Done

### B31 · JOINT · Sun 22:30 — J9

You do steps 1, 3 and 5.
- [ ] Done

---

## Appendix T1 — Team `CLAUDE.md` (full text)

Person B creates `CLAUDE.md` in J2 with exactly this content.

~~~markdown
# CLAUDE.md — Contract for Signal to Syndrome

This file is the contract for all code in this repository. Authority order: this file > DECISIONS.md > docs/*.md plans > the current prompt. If a prompt conflicts with this file, stop and say so.

## What the project is
An open-source lab, published and runnable on Qollab, showing how qubit-readout physics sets the logical error rate of a repetition-code memory. Circuits: Qiskit on IonQ's simulator (forte-1 noise), submitted in native gates so IonQ's optimiser does not remove them. Readout models: classical, in JavaScript. Decoder: our own exact minimum-weight matching.

## Architecture rules
1. Core logic lives in `src/core/` as ES modules (package "type": "module"). No runtime dependencies. No DOM, network or file-system access in `src/core/`.
2. The user interface lives in `src/ui/` and imports from `src/core/`.
3. The shipped artefact is `dist/qollab/` (index.html, main.css, main.js; index.html is a body fragment), built by `tools/build.mjs` with esbuild into one IIFE with all data embedded. Nothing in `dist/` may load an external resource or call fetch, XMLHttpRequest, WebSocket or dynamic import(). Only exception: when the liveRun feature is on, main.js begins with the single line `import * as s2sLive from 'qollab.live'; globalThis.s2sLive = s2sLive;` before the IIFE (`'live'` instead of `'qollab.live'` if D11 says so). It loads the Python helper qollab/live.py, which is uploaded to the main project with the three files (DECISIONS D11).
4. Node scripts for builds, sweeps and checks live in `tools/` as .mjs files. They may read and write files.
5. Python appears only in `qollab/` (runs on Qollab: standard library plus qiskit, uses the pre-existing `backend` object, never constructs providers or reads API keys; it may derive a native-gate backend with backend.with_name(backend.name, gateset="native", noise_model="forte-1") (DECISIONS D1)) and `validation/` (runs locally with %USERPROFILE%\venvs\s2s\Scripts\python.exe).

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
~~~

## Appendix T2 — Team `DECISIONS.md`

~~~markdown
# DECISIONS

Recorded during the build. Times in IST. Each person edits only their own section.

## Shared decisions (agreed at J2)

| ID | Question | Answer |
|---|---|---|
| D8 | Shots per configuration | 4000 |

## Person A

| ID | Question | Answer | Evidence | Time |
|---|---|---|---|---|
| D1 | How the forte-1 noise model is selected (exact keyword or Run-dialog setting) | | Probe P3 | |
| D2 | Seed option name (or "none") | | Probe P3 | |
| D3 | Duration of a 25-qubit, 4000-shot noisy job | | Probe P4 | |
| D6 | Python packages available on Qollab | | Probe P2 | |
| D7 | Method to copy long Python output | | Probe P7 | |

Fingerprint (V9), checks, deviations and handoff notes:

## Person B

| ID | Question | Answer | Evidence | Time |
|---|---|---|---|---|
| D4 | Can JavaScript submit a job; exact call syntax | | Probe P5 | |
| D5 | Largest JavaScript pane content that saves and reloads | | Probe P6 | |
| D9 | HTML pane: full document or body fragment | | Probe P5 | |
| D10 | Can two accounts edit one Qollab project | | B2 | |
| D11 | Live run through a Python helper (P10) | | Probe P10 | |

PyMatching tie counts, published links, deviations and handoff notes:
~~~

## Appendix T3 — Bridge and feature switches

Each switch changes one line in `src/ui/bridge_core.js` or `src/ui/bridge_data.js` (replace the old path with the new one), or one flag in `src/ui/features.js`. After any switch: `npm run build`, then `npm run check`.

| # | Handoff | File | Old | New |
|---|---|---|---|---|
| 1 | H5 | `bridge_core.js` | `'./stubs/sweep_stub.js'` | `'../core/sweep.js'` |
| 2 | H5 | `bridge_core.js` | `'./stubs/flat_stub.js'` | `'../core/readout/flat.js'` |
| 3 | H4 | `bridge_data.js` | `'../../data/fixtures/rep_d3_r1_L0.json'` and `'../../data/fixtures/rep_d3_r3_L0.json'` | `'../../data/banks/rep_d3_r1_L0.json'` and `'../../data/banks/rep_d3_r3_L0.json'` |
| 4 | H6 | `bridge_data.js` | `'../../data/fixtures/stage1_flat.json'` | `'../../data/results/stage1_flat.json'` |
| 5 | H7 | `bridge_core.js`, `bridge_data.js` | `'./stubs/ion_stub.js'`; `'../../data/fixtures/params_ion.json'` | `'../core/readout/ion.js'`; `'../../params/ion.json'` |
| 6 | H8 | `bridge_data.js` | `'../../data/fixtures/stage2_ion.json'` | `'../../data/results/stage2_ion.json'` |
| 7 | — | `features.js` | `ion: false` (and `liveRun: false`) | `ion: true` (and `liveRun: true` if D11 passed and it works on Qollab) |
| 8 | H9 | `bridge_core.js`, `bridge_data.js` | `'./stubs/sc_stub.js'`; `'../../data/fixtures/params_sc.json'` | `'../core/readout/sc.js'`; `'../../params/sc.json'` |
| 9 | H10 | `bridge_data.js` | `'../../data/fixtures/stage3_sc.json'` | `'../../data/results/stage3_sc.json'` |
| 10 | — | `features.js` | `superconducting: false` | `superconducting: true` |
| 11 | H11 | `bridge_data.js` | `'../../data/fixtures/stage4_comparison.json'`; `'../../data/fixtures/params_cycle.json'` | `'../../data/results/stage4_comparison.json'`; `'../../params/cycle.json'` |
| 12 | — | `features.js` | `level5: false` | `level5: true` |

## Appendix T4 — Platform probes

These are disposable platform tests; never save them into the repository. Person A runs P2, P3, P4 and P7; Person B runs P5 and P6, and P10 once before Saturday. P2–P7 were run on Tue 6 Oct; their answers are in `DECISIONS.md`.

### P2 — Which Python packages are available

**Why:** the bank generator may only use what exists in Qollab's in-browser Python.
**Do:** Create a new Python/Qiskit project named `S2S probe` (private if possible). Paste and run:

```python
import sys
print(sys.version)
for m in ["numpy", "scipy", "networkx", "hashlib", "json", "qiskit"]:
    try:
        mod = __import__(m)
        print(m, "OK", getattr(mod, "__version__", ""))
    except Exception as e:
        print(m, "MISSING", e)
```

**Pass:** output recorded as decision D6. `hashlib`, `json` and `qiskit` must be OK; the others are informational.

### P3 — Can the `forte-1` noise model be selected

**Why:** without circuit-level noise the syndromes are trivially zero and the quantum layer is decorative.
**Do:** In the Run dialog choose the IonQ simulator. Replace the cell content with:

```python
from qiskit import QuantumCircuit
from qiskit.providers.jobstatus import JobStatus
import time

print("backend:", backend, getattr(backend, "name", None))
try:
    print("options:", backend.options)
except Exception as e:
    print("options unavailable:", e)

def run(qc, shots=1000, **kw):
    job = backend.run(qc, shots=shots, **kw)
    while job.status() not in (JobStatus.DONE, JobStatus.ERROR, JobStatus.CANCELLED):
        time.sleep(5)
    print("status:", job.status())
    return job.result().get_counts()

qc = QuantumCircuit(3, 3)
qc.h(0); qc.cx(0, 1); qc.cx(1, 2)
qc.measure(range(3), range(3))
print("default:", run(qc))
for kw in ({"noise_model": "forte-1"}, {"noise_model": "forte-enterprise-1"}):
    try:
        print(kw, run(qc, **kw))
    except Exception as e:
        print(kw, "FAILED:", e)
```

If the Run dialog itself offers a noise model, also run once with `forte-1` selected there and no keyword.
**Pass:** a run shows outcomes other than `000` and `111` (noise is on), while the ideal run shows only `000` and `111`. Record the working method as D1. In the printed `options`, look for a seed option and record its name as D2 (or "none").

### P4 — How long does a 25-qubit noisy job take

**Why:** the largest banks are 25 qubits; if they take too long, $d=7$ is cut early.
**Do:** Append and run (replace `NOISE` with the working method from P3):

```python
NOISE = {"noise_model": "forte-1"}
n = 25
qc = QuantumCircuit(n, n)
for i in range(n - 1):
    qc.cx(i, i + 1)
qc.measure(range(n), range(n))
t0 = time.time()
c = run(qc, shots=4000, **NOISE)
print(len(c), "distinct outcomes;", round((time.time() - t0) / 60, 1), "minutes")
```

Continue with probe P7 while it runs (open a second browser tab).
**Pass:** time recorded as D3. Under 15 minutes keeps the full plan; otherwise mark "$d=7$ last" in D3.

### P5 — JavaScript track: running a job and page format

**Why:** the main project is a JavaScript page; you need to know whether it can submit jobs and how its HTML pane works.
**Do:** Create a JavaScript/Qiskit project named `S2S probe JS`. Paste Qollab's own JavaScript example from your notes (J0 and B1) and run it. Then check:
1. Does a job run, and how are keyword options (noise model) passed?
2. Does the HTML pane expect a full HTML document or only body content?
3. Do CSS and JavaScript panes apply to the preview as expected?

**Pass:** answers recorded as D4 (job submission and syntax) and D9 (HTML pane format).

### P6 — How much data can the JavaScript pane hold

**Why:** shot banks and results are embedded in the bundle.
**Do:** In TERMINAL, outside any repository:

```bat
mkdir %USERPROFILE%\s2s-probe
cd /d %USERPROFILE%\s2s-probe
node -e "const s='a'.repeat(600000); require('fs').writeFileSync('big.js', 'const BIG=\"'+s+'\"; document.body.append(\"length \"+BIG.length);');"
notepad big.js
```

Copy all of `big.js` (Ctrl+A, Ctrl+C) into the JavaScript pane of `S2S probe JS`, save, reload the page and run the preview.
**Pass:** the preview shows `length 600000` after a reload. Record the outcome as D5. If it fails, repeat with 300000 and record the largest size that works.

### P7 — Can long Python output be copied out

**Why:** shot banks leave Qollab as printed text in checksummed chunks.
**Do:** In `S2S probe` (Python), run:

```python
import hashlib
blob = ("0123456789abcdef" * 250) * 50          # 200,000 characters
for i in range(0, len(blob), 4000):
    print(f"--- chunk {i // 4000 + 1} ---")
    print(blob[i:i + 4000])
print("sha256", hashlib.sha256(blob.encode()).hexdigest())
```

Select and copy the whole output into a text file `%USERPROFILE%\s2s-probe\out.txt`. In TERMINAL:

```bat
cd /d %USERPROFILE%\s2s-probe
node -e "const t=require('fs').readFileSync('out.txt','utf8'); const b=t.split(/\r?\n/).filter(l=>/^[0-9a-f]{4000}$/.test(l)).join(''); console.log(b.length, require('crypto').createHash('sha256').update(b).digest('hex'))"
```

**Pass:** length `200000` and the same hash as the Python output. Record as D7 (or record the method that worked, such as a download button).

### P10 — Live run through a Python helper (Person B, before Saturday)

**Why:** the live run (d=3, r=3, L0, 200 shots) needs native gates too, or IonQ's optimiser leaves it with no detector events (DECISIONS, platform facts). The documented way to run Python from a JavaScript project is a Python file called with `.callPromising` (`docs/qollab_js_api_example.txt`, section 2).
**Do:** create a new JavaScript project `S2S probe live`; press Run with **IonQ Forte 1** picked in the dialog. Files:

`index.html`

```html
<div id="out"></div>
```

`qollab/live.py` (create a folder `qollab` with this file; if Qollab will not make folders, put `live.py` at the top level and change the import in `main.js` to `'live'`)

```python
from qiskit import QuantumCircuit, transpile

def run_live(backend, shots=200, seed=7):
    d, r = 3, 3
    n = d + (d - 1) * r
    qc = QuantumCircuit(n, n)
    for k in range(r):
        for j in range(d - 1):
            a = d + k * (d - 1) + j
            qc.cx(j, a)
            qc.cx(j + 1, a)
    for k in range(r):
        for j in range(d - 1):
            qc.measure(d + k * (d - 1) + j, k * (d - 1) + j)
    for i in range(d):
        qc.measure(i, (d - 1) * r + i)
    nb = backend.with_name(backend.name, gateset="native", noise_model="forte-1")
    nb.set_options(noise_model="forte-1", sampler_seed=int(seed))
    job = nb.run(transpile(qc, backend=nb), shots=int(shots))
    return {k: int(v) for k, v in job.result().get_counts().items()}
```

`main.js`

```js
import * as live from 'qollab.live';

const box = document.getElementById('out') || document.body;
function R(...a) { const s = 'RESULT ' + a.join(' '); console.log(s); const p = document.createElement('div'); p.textContent = s; box.append(p); }

const t0 = performance.now();
try {
  const raw = (await live.run_live.callPromising(backend, 200, 7)).toJs();
  const c = raw instanceof Map ? Object.fromEntries(raw) : raw;
  const keys = Object.keys(c);
  const tot = keys.reduce((s, k) => s + Number(c[k]), 0);
  const allZero = Number(c['0'.repeat(9)] || 0);
  R('P10', `shots=${tot} distinct=${keys.length} allZeroFraction=${(allZero / tot).toFixed(4)} total=${((performance.now() - t0) / 1000).toFixed(1)}s`);
} catch (e) { R('P10 ERROR', e.name, String(e.message).slice(0, 300)); }
R('done');
```

**Pass:** `distinct` above 1 and `allZeroFraction` below 1 mean the live run works with noise: record D11 as "works" (with the numbers, the time, and whether the `qollab/` folder worked). Then Person A writes the real `qollab/live.py` in CC-A1 (part E), CC-B7 calls it, and the build adds the one import line allowed by `CLAUDE.md` rule 3. An `ERROR`, or `distinct=1`, means D11 "does not work": `liveRun` stays off and the page links to the bank generator.

## Appendix T5 — Review and fix prompts

### Review prompt (fresh Claude chat)

Use it to review the other person's work: attach `CLAUDE.md`, `DECISIONS.md`, the diff (Appendix T7) and any delivery reports the owner shares.

```text
You are an independent reviewer for a hackathon project called Signal to Syndrome. Attached: CLAUDE.md (the contract and the highest authority), DECISIONS.md, a git diff, and the delivery reports from the coding sessions.

Review the diff against the contract and report findings ordered by severity (blocking, major, minor), each with the file and function, the problem, and a concrete fix. Check specifically:
1. Contract compliance: indexing, bit order (classical bit 0 is the least significant bit), the classical-bit layout, the idle rule, units, seeded randomness only, no network or DOM access in src/core, and scope (no files outside those named in the prompt).
2. Physics and mathematics against the formulas stated in CLAUDE.md and in the prompts quoted in the reports. Re-derive at least one formula yourself instead of trusting comments.
3. Tests: every test has a comment stating the break in words; boundary tests are non-vacuous (one case on the boundary, one past it, with different outcomes); statistical tolerances are at least 4 standard errors and stated; no test was weakened or removed.
4. Claims in the delivery reports that the diff does not support.

Do not rewrite the code; list findings only. If everything is fine, say so explicitly and list what you checked.
```

### Fix prompt (Claude Code)

The owner of the affected files runs it.

```text
Read CLAUDE.md and DECISIONS.md first.
Owner: Person <A or B>. Create or modify only files owned by that person (see CLAUDE.md).

Task FIX-<number>: <one-line description of the bug or review finding>.
Evidence: <paste the failing output, error message or review finding>.
Allowed files: <list the files that may change>.

First write a failing test that reproduces the problem, with the required break comment. Then fix the code until the new test and all existing tests pass. Do not modify existing tests. Run `npm test`, and also `npm run build` and `npm run check` if any file in src/ui or tools changed. End with the report format.
```

## Appendix T6 — Parameter-card templates

`params/ion.json` (fill every `value` and `source` from A8; delete nothing):

```json
{
  "schema": "s2s-params/1",
  "platform": "trapped-ion",
  "bright_is_bit": 1,
  "R_bright_per_us": { "value": null, "source": "" },
  "R_dark_per_us": { "value": null, "source": "" },
  "gamma_bright_to_dark_per_us": { "value": null, "source": "" },
  "gamma_dark_to_bright_per_us": { "value": null, "source": "" },
  "T1_idle_us": { "value": null, "source": "" },
  "tau_grid_us": { "value": [], "source": "spans the published detection-time range" }
}
```

`params/sc.json` (defaults from plan §7.4; replace the sources):

```json
{
  "schema": "s2s-params/1",
  "platform": "superconducting",
  "chi_over_2pi_MHz": { "value": 1.0, "source": "" },
  "kappa_over_2pi_MHz": { "value": 2.0, "source": "" },
  "nbar": { "value": 5, "source": "" },
  "eta": { "value": 0.3, "source": "" },
  "T1_us": { "value": 50, "source": "" },
  "detection": "heterodyne",
  "ringup": true,
  "tau_grid_us": { "value": [0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.7, 1.0, 1.4, 2.0, 3.0], "source": "spans published integration times" }
}
```

`params/cycle.json`:

```json
{
  "schema": "s2s-params/1",
  "trapped-ion": {
    "two_qubit_gate_us": { "value": null, "source": "" },
    "gate_layers_per_round": { "value": 2, "source": "derived: each round is two parallel CNOT layers" },
    "reset_us": { "value": null, "source": "" }
  },
  "superconducting": {
    "two_qubit_gate_us": { "value": null, "source": "" },
    "gate_layers_per_round": { "value": 2, "source": "derived: each round is two parallel CNOT layers" },
    "reset_us": { "value": null, "source": "" }
  }
}
```

## Appendix T7 — Git for two people and other operating systems

**Your cycle, every time.**

| When | Commands |
|---|---|
| Before each Claude Code prompt | `git pull --rebase` |
| After green tests | `git status --short` (check that only your files are listed), `git add -A`, `git commit -m "<what>"`, `git pull --rebase`, `git push` |
| After the other person's handoff | `git pull --rebase`, then reply `ACK Hn` |
| First push on a new machine | Git opens a browser window to sign in to GitHub; sign in and approve |

**If `git status --short` lists a file you do not own.** Claude Code changed it by mistake. Undo that file only: `git checkout -- <path>` (or `git restore <path>`), and tell the other person if it was theirs.

**If `git pull --rebase` reports a conflict.** It can only happen in a shared file (`DECISIONS.md`, `docs/project_page.md`, `CLAUDE.md`). Open the file in VS Code; keep both sides' content, delete the lines `<<<<<<<`, `=======` and `>>>>>>>`; then `git add <file>` and `git rebase --continue`.

**Diffs for cross-review.** `git diff <from>..HEAD -- <paths> > review.diff`, where `<from>` is a tag (`start`, `sp1`, `sp2`, `sp3`, `sp4`). Delete the diff file after the review; never commit it.

**Tags.** Only Person B creates and pushes tags.

**On macOS or Linux.**

| Windows cmd | macOS / Linux |
|---|---|
| `python -m venv %USERPROFILE%\venvs\s2s` | `python3 -m venv ~/venvs/s2s` |
| `%USERPROFILE%\venvs\s2s\Scripts\activate.bat` | `source ~/venvs/s2s/bin/activate` |
| `cd /d "E:\My Project\signal-to-syndrome"` | `cd ~/signal-to-syndrome` |
| `start "" "dist\local\preview.html"` | `open dist/local/preview.html` (macOS) or `xdg-open dist/local/preview.html` (Linux) |
| `data\raw\file.txt` (backslashes) | `data/raw/file.txt` (forward slashes) |
| `dir` / `type file` | `ls` / `cat file` |
| `notepad file` | any text editor |
