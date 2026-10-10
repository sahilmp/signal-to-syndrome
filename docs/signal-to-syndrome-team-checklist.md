# Signal to Syndrome — Team Execution Checklist v2 (upgrade build, two people)

Every step needed to take Signal to Syndrome from its current state (tag `sp4`) to the upgraded submission: a learned detector error model, phase-flip memory, measurement crosstalk on trapped ions, per-platform idle physics, a reframed comparison with a trade-off plot, a "Learn the noise" level and a redesigned interface. The work is split so that each person works independently as much as possible; every dependency is named, timed and given a fallback, and every joint step is marked.

| | |
|---|---|
| Version | 2.0, Sat 10 Oct 2026, written inside the build window |
| Build window | Sat 10 Oct 04:30 IST → Mon 12 Oct 04:30 IST (Fri 9 Oct 19:00 ET → Sun 11 Oct 19:00 ET) |
| Starting point | The repository at tag `sp4` (commit `0730c92`, plus `7f27a36` "Remove BOM from features.js"). Tests 176/176, release check 75/75 after a clean rebuild, V9 `53933f98` |
| Relation to v1 | v1 (`signal-to-syndrome-team-checklist-v1.md`) describes how the base was built and stays in `docs/` unchanged as a disclosed record. This v2 governs all work from tag `window-start` onward. Its step IDs continue v1's: joint steps K0–K9, Person A steps A40–A60, Person B steps B40–B56, prompts CC-A10–CC-A16 and CC-B11–CC-B19, handoffs N1–N10, validation checks V11–V16 |
| Companion | `signal-to-syndrome-execution-checklist.md` (v2): the same steps in one time-ordered list with every gate, verification command and cut rule. The Claude Code prompts live only in this file |
| Repository | `E:\My Project\signal-to-syndrome` (or your path) |
| Commands | Windows cmd syntax |

---

## Contents

0. Read this first: eligibility
1. What v2 adds
2. How the work is split
3. Independent, dependent and joint work
4. Timeline and milestones
5. Ground rules
6. Joint steps (K0–K9)
7. Person A checklist (physics and data)
8. Person B checklist (decoder, interface and platform)

Appendices: U1 `CLAUDE.md` v2 amendments · U2 `DECISIONS.md` v2 section · U3 bridge and feature switches v2 · U4 results formats v2 · U5 parameter-card additions · U6 review and fix prompts · U7 interface specification · U8 disclosure and email templates · U9 demo-video script · U10 hallway-test protocol · U11 optional statistics work

---

## 0. Read this first: eligibility

The base version was built and tagged `sp1`–`sp4` on 7–9 Oct, before the window opened, while your own plan (§14.1, §14.5) states that no project code exists before Sat 10 Oct 04:30 IST and that the first commit's timestamp proves it. The README currently says "All code in this repository was generated during the build window", which the git history contradicts.

This checklist assumes the organizers allow a disclosed, pre-built base with the hackathon judged on what you add inside the window. Step K0 asks them. Until they answer:

1. **Do not rewrite or squash history**, and do not change commit dates. The history stays exactly as it is.
2. **Fix the README sentence now** (K0), whatever the answer will be.
3. **Keep both Qollab projects private.** Ship points are built, tagged and tested privately; nothing is made public before the answer, or before Sun 18:00 IST if no answer arrives (K0 decision table).
4. **If the organizers say the base may not be used, stop following this checklist.** The honest options are to withdraw, or to ask whether a fresh in-window rebuild would be accepted; that rebuild is not planned here.

---

## 1. What v2 adds

### 1.1 Scope

| ID | Work package | Deliverables | Owner | Ship point |
|---|---|---|---|---|
| W1 | Detector error model | Diagonal edges in `graph.js`; per-class edge rates learned from detector correlations (`dem.js`); decoder switchable between "naive" and "learned"; Stages 1–4 rerun with both | B (graph), A (rates, sweeps) | SP5 |
| W2 | New error types | (a) Phase-flip repetition memory: X-basis circuits, banks, Stages 1–3 in the X basis. (b) Measurement-induced crosstalk on neighbouring ions during ancilla detection, with a rate scan | A | SP6 |
| W3 | Comparison | (a) Framed everywhere as "two readout physics models at fixed gate noise". (b) Each arm gets its own idle physics: T1 and T2 for both, plus crosstalk for the ion. (c) A trade-off plot (error per round against rounds per second) next to the per-µs comparison | A (data), B (interface) | SP6 |
| W4 | "Learn the noise" level | Fault injection on a circuit timeline, the naive decoder's failure on a diagonal pair, the p_ij heatmap of the forte-1 banks, and a naive/learned toggle with the logical-error drop | B (interface), A (data) | SP6 |
| W5 | Interface upgrade | Hero panel; Level 3 error-budget bar, d selector, challenge; text cut to two sentences per level; Level 1 decoding game; Level 5 visuals (trade-off, budget bars, scoreboard, tornado); demo video; Level 2 sandbox; global bit-flip/phase-flip toggle; one visual language; guided tour; polish (animations, curated Level 4 examples, live-run presence) | B (interface), both (video) | SP5–SP7 |

Out of scope unless time remains: the statistics items in Appendix U11 (cluster bootstrap for every interval; ring-up in the superconducting belief model; a dense τ grid near the superconducting optimum). They are not in your list, but they decide how credible the C1 verdict is; do them if the buffer allows.

### 1.2 Hypotheses for v2 (pre-registered at K1, before any rerun)

Write these into `docs/notes_results.md` at K1 and commit them before CC-A12 runs, so the commit time proves they came first. Refutation remains a valid, reportable result.

| ID | Statement | Tested by | Refuted if |
|---|---|---|---|
| C1 (revised) | Superconducting: τ*_log < τ*_phys (empirical), with the learned decoder, in both bases. Trapped ion with crosstalk off: no idle-driven optimum. Trapped ion with crosstalk at the card value: an interior τ*_log < τ*_phys appears | Stages 2–3 rerun; crosstalk scan | SC τ*_log interval contains or exceeds τ*_phys at d = 3 and 5; or the ion shows the crosstalk-driven optimum with crosstalk off, or no interior optimum at any scanned crosstalk rate |
| C2 (unchanged statement) | Soft decoding is at or below hard at every τ, with most gain where readouts are short | Stages 2–3, learned decoder | Soft above hard beyond the intervals at any point |
| C3 (replaced) | Neither readout model dominates: along the τ grids the ion arm has lower error per round and the superconducting arm more rounds per second | Trade-off curves, Stage 4 | One arm is better on both axes at its τ*_log |
| C4 (unchanged) | Break-even ε̄ (d = 5 beats d = 3) similar on both arms, on the empirical ε̄ axis | Stage 4 | Values differ beyond their uncertainties |
| C5 (new) | The learned detector error model lowers the logical error against the naive one at every (d, arm, mode) at τ*_log, out of sample | Stage dem, Stage 4 | Learned above naive beyond the intervals at any point |
| C6 (new) | In the phase-flip memory the superconducting τ*_log is shorter than in the bit-flip memory when T2 < T1 | Stage 3 in both bases | τ*_log(X) ≥ τ*_log(Z) beyond the intervals |
| O4 (measurement, no hypothesis) | Ratio of bulk detector rates, X-basis to Z-basis banks, per (d, r): how biased forte-1 noise looks to the decoder | Stage dem | — |

### 1.3 New validation checks

| ID | Check | Pass criterion | Owner |
|---|---|---|---|
| V2b | V2 rerun with diagonal edges: our decoder against PyMatching | Zero cost mismatches; ties counted | B |
| V9 (kept) | Naive decoder, flat ε = 0.02, rep_d3_r3_L0 | Still `53933f98` | A |
| V9L | Learned decoder, same setting | Hash recorded in DECISIONS; equal in Node and on the page | A, B |
| V11 | ε fragility: learned decoder at ε = 0 and ε = 1e-9 | Wilson intervals overlap at every d (the naive decoder gives 108 against 13 errors of 4,000 at d = 3, L0) | A |
| V12 | (a) Rate recovery on synthetic detectors with known per-class rates including diagonals; (b) out of sample: rates learned on L0 decode L1 and vice versa | (a) every class within 4 SE; (b) learned ≤ naive pooled, beyond intervals at d = 5 | A |
| V13 | Phase-flip circuits: ideal simulator, every check 0; one injected Z gives exactly the predicted bits (same pattern as X in the bit-flip memory); three sites also on IonQ's ideal simulator | All equal | A |
| V14 | Idle physics per basis: formulas; T2 ≤ 2T1 enforced (boundary test); crosstalk 0 reproduces the old ion idle; default basis Z reproduces V9 | All pass | A |
| V15 | Trade-off values: hand check of one point per arm (rounds per second = 10⁶ / T_cyc in µs; error per round as in Stage 4) | Agrees with the file to 3 significant figures | A |
| V16 | Fault-to-detector function used by "Learn the noise" agrees with `computeDetectors` on explicitly flipped bits, for every fault slot at d = 3 and 5 | All equal | B |

### 1.4 Claims policy additions

- The comparison is "two readout physics models at fixed gate noise": the same IonQ forte-1 banks, the same learned decoder, different readout models, idle physics and cycle times. Never "trapped ion against superconducting hardware".
- The superconducting arm carries trapped-ion gate noise by construction; say so wherever the arms are compared.
- The crosstalk rate and any unsourced T2 are labelled "UNSOURCED (illustrative)" on the page, and the crosstalk result is presented as a scan, not as one number.
- Learned edge rates come from the same banks they decode; V12(b) is the out-of-sample check and its result is quoted next to every naive/learned comparison.

---

## 2. How the work is split

Ownership is unchanged from v1 (`CLAUDE.md`, team rules), with these additions (Appendix U1 has the exact table):

| Owner | New files |
|---|---|
| A | `src/core/dem.js`, `tests/dem.test.js`, `data/results/dem_forte1.json`, `data/results/*_x.json`, `data/banks/repx_*.json`, `data/banks/v13_*.json`, `data/raw/repx_*`, `data/raw/v13/*` |
| B | `src/ui/hero.js`, `src/ui/learnnoise.js`, `src/ui/sandbox.js`, `src/ui/tour.js`, `src/ui/budget.js`, `src/ui/tokens.css` (all under `src/ui/*`, already B's), `tools/curate.mjs`, `data/curated/*`, `tests/learnnoise.test.js`, `tests/hero.test.js`, `tests/curate.test.js` |

Shared: `CLAUDE.md`, `DECISIONS.md` (own section), `docs/project_page.md` (sections as assigned), `docs/notes_results.md` (A writes; B adds only the interface notes section).

**What keeps the two lanes independent.** The contract v2 (K1, Appendix U1) fixes every new signature and results field before anyone writes code. Person B builds every new view against v2 fixtures (`data/fixtures/*_v2.json`, each with `"fixture": true`) through new bridge exports (Appendix U3), so the interface never waits for physics. The release check refuses any enabled feature whose bridge still points at a fixture.

---

## 3. Independent, dependent and joint work

### 3.1 Independent work

| Person A | Person B |
|---|---|
| `dem.js`: pairwise edge-rate estimation, boundary rates, synthetic tests (V12a) | Diagonal edges in `graph.js`; matching tests; V2b with PyMatching |
| X-basis circuits, circuit tests (V13), X-basis and V13 banks on Qollab | `bank.js` basis field; v2 fixtures, bridges and feature flags |
| Idle physics per basis and ion crosstalk in the readout models; parameter cards (V14) | Design tokens, hero panel, text cut |
| Stage reruns (Z and X, naive and learned), crosstalk scan, error budget, Stage dem | Level 1 game; Level 3 budget bar, d selector, challenge |
| Stage 4 v2: trade-off, numeric sensitivity, C1–C6 verdicts | "Learn the noise" level (V16) |
| Results notes; plain-language verdicts; physics and results sections of the page | Level 5 v2; Level 2 sandbox; basis toggle; tour; curated examples; live-run panel; accessibility; README |

### 3.2 Handoffs

Times are IST. "Push" means commit, push and send the handoff message (Section 5).

| ID | From → to | What | Ready by | Needed by (step) | What waits | Fallback if late |
|---|---|---|---|---|---|---|
| N1 | B → A | `src/core/graph.js` with diagonal edges (`buildGraph(d, r, { diagonal })`), tests, V2b result | Sat 10:45 | Sat 11:45 (A44, CC-A12) | Learned decoding in `sweep.js` | A writes CC-A12 against the U1 signature and runs it when N1 lands; A44 slips at most 30 min, then K2 cut rule |
| N2 | B → A | `src/core/bank.js` accepting `basis` | Sat 11:30 | Sat 11:45 (A44) and 16:00 (A48) | Loading X-basis banks | A44 runs Z only; X banks wait for A48 |
| N3 | A → B | `src/core/dem.js`, `src/core/sweep.js` with `noise` and `basis` | Sat 13:00 | Sat 13:30 (B44) | Learned decoding in levels 1–4 | Levels keep the naive decoder; SP5 ships hero and text cut only |
| N4 | A → B | `data/results/dem_forte1.json`; Stage 1 and 2 (Z) results with naive and learned series | Sat 13:00 | Sat 13:30 (B44), 16:30 (B46) | Learned curves; "Learn the noise" data | Fixture data; "Learn the noise" cannot ship until N4 |
| N5 | A → B | `ion.js`, `sc.js` with `idleFlipProbability(basis)` and `idleBreakdown(basis)`; updated `params/ion.json`, `params/sc.json` | Sat 15:45 | Sat 19:00 (B47) | Budget bars from live models; idle text | Budget from results arrays only (N6) |
| N6 | A → B | X-basis banks; Stage 1–3 results for Z and X, both decoders, with `budget` and (ion) `crosstalkScan` | Sat 18:00 | Sat 20:00 (B48 switches) | Basis toggle; budget bar; crosstalk view | Ship SP6 with Z only and the crosstalk view off |
| N7 | A → B | `data/results/stage4_comparison.json` v2 and `params/cycle.json` v2 | Sat 19:45 | Sat 20:00 (B48) | Level 5 v2 | Level 5 v2 ships at SP7 instead |
| N8 | B → A | A local build of SP6 with every flag on (`dist/local/preview.html`) | Sun 05:30 | Sun 05:30 (A53) | A's review of the new interface | A reviews the published private project instead |
| N9 | A → B | Plain-language one-liners for C1–C6 and O4, and the framing sentence, in `stage4_comparison.json` (`conclusions[*].plain`) and `notes_results.md` | Sun 09:30 | Sun 11:30 (B52) | Scoreboard text; page | B uses A's verdict column from `notes_results.md` |
| N10 | B → A | Interface sections of the page and the README v2 | Sun 11:30 | Sun 18:00 (K7) | Page review | K7 reviews what exists |

### 3.3 Joint work

| ID | When (IST) | What | Who does what |
|---|---|---|---|
| K0 | Sat 08:00 | Eligibility, disclosure fix, cleanup, `window-start` tag | Both; B commits |
| K1 | Sat 09:00 | Contract v2, hypotheses v2, DECISIONS v2 | Both decide; B commits |
| K2 | Sat 14:00 | SP5: learned decoder, hero, text cut | A checks numbers; B builds, uploads (private), tags |
| K3 | Sat 20:30 | SP6: new error types, comparison data, Level 1 game, Level 3 budget, "Learn the noise", Level 5 v2 | As K2 |
| K4 | Sun 13:00 | SP7: interface complete | As K2 |
| K5 | Sun 14:00 | Hallway test with three outsiders | Both observe; B runs it |
| K6 | Sun 16:30 | Demo video | B records; A narrates the physics |
| K7 | Sun 18:00 | Page review | Both |
| K8 | Sun 20:00 | Release-candidate cross-review | Each reviews the other |
| K9 | Sun 22:30 → Mon 01:30 | Freeze, verify, submit | B uploads; A checks numbers; both test |

---

## 4. Timeline and milestones

### 4.1 Two-lane timeline

```text
                              Sat 08:00          Sat 20:00     Sun 06:00          Sun 18:00   Mon 02:00
                              ├─────────────────────┼───────────┼─────────────────────┼───────────┤
K0, K1 eligibility, contract  ▓▓
A  dem.js                       ██
A  X-basis generator, banks       ███████ (banks run in the background)
A  sweep noise models, reruns       ███
A  idle physics, crosstalk                ██
A  stage reruns Z/X, budget                 ███
A  stage 4 v2                                  ██
A  notes, verdicts                                ██
A  review B, page                                          █████████
B  diagonal edges, V2b          ██
B  basis field, fixtures v2       █
B  tokens, hero, text cut          ██
B  level 1 game, level 3              ██
B  learn the noise                      ███
B  level 5 v2                              ██
B  sandbox, basis toggle                                  ███
B  tour, curated, live run                                   ██
B  a11y, polish, README                                        ███
Integration                         ▓       ▓        ▓                  ▓
Hallway test, fixes, video                                               ▓▓▓▓▓
Page review, RC review                                                         ▓▓   ▓▓
Freeze, submit                                                                   ▓▓▓
Sleep                                                   ░░░░░░
Ship points                         ◆SP5    ◆SP6                       ◆SP7
```

### 4.2 Milestones

| Milestone | Integration (IST) | Tag | Cut deadline | Gate | Cut rule |
|---|---|---|---|---|---|
| M10 Eligibility | K0, Sat 08:00 | `window-start` | — | Email sent; README fixed; tag pushed | — |
| SP5 | K2, Sat 14:00 | `sp5` | Sat 13:30 | V2b, V9, V9L, V11, V12 pass; hero and text cut on real data; levels 1–4 use the learned decoder | If V12(b) fails: keep the naive decoder as default and report it; if V2b fails: revert the graph change and ship hero and text cut only |
| SP6 | K3, Sat 20:30 | `sp6` | Sat 20:00 | V13, V14, V16 pass; X-basis and crosstalk data real; Level 1 game, Level 3 budget, "Learn the noise" on real data | Crosstalk scan cut to 3 rates; X-basis cut to d = 3, 5; Level 5 v2 moves to SP7 |
| SP7 | K4, Sun 13:00 | `sp7` | Sun 12:30 | V15 passes; Level 5 v2, basis toggle, accessibility pass | Drop the sandbox, then the tour, then the polish items, in that order |
| M11 Video | K6, Sun 16:30 | — | Sun 17:30 | Two-minute video recorded | Annotated GIF of the hero and "Learn the noise" |
| M12 Submitted | K9 | `v2.0` | Mon 03:00 | Final build verified signed out; submission confirmed | Submit the last tagged ship point |

---

## 5. Ground rules

1. **Own your files** (Appendix U1 table). Ask for changes in the other person's files by message.
2. **Pull before you start, push when you finish.** `git pull --rebase` before every prompt and every push.
3. **Announce handoffs** as `HANDOFF N3: pushed src/core/sweep.js, src/core/dem.js, commit 1a2b3c4, tests green`; the receiver replies `ACK N3`.
4. **Interface changes are joint.** Any change to the U1 Module API or the U4 results formats: stop, agree, one person edits `CLAUDE.md`, both pull.
5. **No stand-ins in public, and nothing public before K0 clears.** `npm run check` enforces the first; the second is on you.
6. **Never rewrite git history.** No `rebase -i` on pushed commits, no `--amend` on pushed commits, no force push, no date changes.
7. **The naive decoder stays.** Every change keeps the naive path bit-for-bit (V9 `53933f98`); the learned path is added beside it.
8. **Same sleep block.** Both sleep Sat 23:30 → Sun 05:30.
9. **From Sun 22:30, no new features.**

---

## 6. Joint steps (K0–K9)

### K0 · JOINT · Sat 08:00 — Eligibility, disclosure fix, cleanup, `window-start`

**Why:** the submission must be eligible and every public statement true before anything else.
**Do:**
1. **Both:** re-read Qollab's hackathon terms and FAQ (https://qollab.xyz/programs, https://qollab.xyz/programs/hackathon) for any rule on prior work, pre-existing code or code written before the window. Copy the exact wording into DECISIONS row E1.
2. **The registered team lead:** send the email in Appendix U8 to the organizers' contact address (and post it in the official Discord or help channel if that is the documented route). Record the time in E1.
3. **Person B**, in TERMINAL:

```bat
cd /d "E:\My Project\signal-to-syndrome"
git pull --rebase
git status --short
del review_b1.diff
rmdir /s /q .pytest_cache
rmdir /s /q node_modules
npm install
npm test
npm run build
npm run check
```

4. **Person B**, in EDITOR: in `README.md`, replace the whole "AI assistance and planning disclosure" section with Variant B of Appendix U8 (pending reply). Remove the two HTML comments (`<!-- Drafted by Person B ... -->`, `<!-- TODO before submission ... -->`). Then `git mv docs\signal-to-syndrome-team-checklist.md docs\signal-to-syndrome-team-checklist-v1.md` and the same for the execution checklist; add this v2 checklist and the v2 execution checklist to `docs/`.
5. **Person B**, in TERMINAL:

```bat
git add -A
git commit -m "K0: disclosure corrected (pending organizers), cleanup, v2 checklists"
git tag window-start
git push
git push --tags
git rev-parse window-start
```

6. **Both:** record the `window-start` commit hash in DECISIONS row E2. Confirm both Qollab projects are private.

**Decision table (revisit when the reply arrives, and at Sun 18:00 if none has):**

| Organizers' answer | Action |
|---|---|
| Disclosed base allowed | Replace the README section with Variant A (Appendix U8); continue; publish from the next ship point |
| Base not allowed | Stop this checklist; decide between withdrawing and asking whether an in-window rebuild is accepted |
| No answer by Sun 18:00 | Submit with Variant B and the email attached or quoted in the submission notes; let the organizers decide |

**Pass:** email sent; README no longer contains the false sentence; `window-start` pushed; build and release check pass; projects private.
- [ ] Done (A)  - [ ] Done (B)

### K1 · JOINT · Sat 09:00 — Contract v2, hypotheses v2, DECISIONS v2

**Why:** both lanes code against the same signatures and results fields from the first prompt.
**Do:**
1. **Both (call, 20 min):** read Appendix U1, U4 and Section 1.2 together; change anything you disagree with now.
2. **Person B**, in EDITOR: apply Appendix U1 to `CLAUDE.md` (replace the named sections, append the new ones); add the "v2" section of Appendix U2 to `DECISIONS.md`.
3. **Person A**, in EDITOR: append Section 1.2 (the hypothesis table, verbatim) under a new heading "## v2 hypotheses (pre-registered Sat 10 Oct, before any rerun)" at the end of `docs/notes_results.md`.
4. **Both:** commit and push (B first, A after pulling):

```bat
git pull --rebase
git add CLAUDE.md DECISIONS.md docs\notes_results.md
git commit -m "K1: contract v2, v2 hypotheses pre-registered"
git push
```

**Pass:** both have `CLAUDE.md` v2 and the pre-registered hypotheses in a commit timestamped before CC-A12 runs.
- [ ] Done

### K2 · JOINT · Sat 14:00 — SP5 integration

The procedure is reused by K3 and K4; only the switches and checks change.
**Do:**
1. **Person A:** confirm N3 and N4 are pushed; run and read out:

```bat
node tools/sweep.mjs --diag
node tools/sweep.mjs --diag --decoder learned
```

   The first must print `53933f98` (V9); the second is V9L (record it in E9).
2. **Person B:** `git pull --rebase`; apply the SP5 switches (Appendix U3 rows 13–16); then:

```bat
npm test
npm run build
npm run check
start "" "dist\local\preview.html"
```

3. **Both:** play the hero panel and levels 1–4 in the preview; Diagnostics shows both hashes, equal to Person A's.
4. **Person B:** replace the three files in the main Qollab project (still private) with `dist/qollab/index.html`, `main.css`, `main.js`; open Diagnostics on Qollab; both hashes equal.
5. **Person B:**

```bat
git add -A
git commit -m "SP5: integration (learned decoder, hero, text cut)"
git tag sp5
git push
git push --tags
```

**Pass:** release check passes; V9 and V9L equal locally and on Qollab; tag pushed. At the cut deadline apply the SP5 cut rule (Section 4.2).
- [ ] Done

### K3 · JOINT · Sat 20:30 — SP6 integration

As K2, with handoffs N5–N7, switches rows 17–24 (row 24 only if Level 5 v2 is ready), and tag `sp6`. Also: play "Learn the noise" end to end; switch to phase-flip in the header and check Levels 3–5; check the ion crosstalk view.
- [ ] Done

### K4 · JOINT · Sun 13:00 — SP7 integration

As K2, with switches rows 25–28 and tag `sp7`. Test every level, the basis toggle, the tour and the live run (IonQ Forte 1 picked). If K0 has cleared, publish both projects (public, MIT, attribution) and test signed out.
- [ ] Done

### K5 · JOINT · Sun 14:00 — Hallway test

**Do:** run Appendix U10 with three people who are not on the team. Person B runs the sessions; Person A takes notes. Write the findings into DECISIONS row E10 as a ranked list.
**Pass:** at least two of three can state the main finding in one sentence; otherwise the top three findings become FIX prompts at 15:00 (text cuts before features).
- [ ] Done

### K6 · JOINT · Sun 16:30 — Demo video

**Do:** record Appendix U9 on the SP7 build (or the fixed build after K5). Person B drives the screen; Person A narrates the physics lines. Keep it at 2:00 or less. Export MP4; upload where the submission form requires.
**Pass:** video under 2:00, captions or a transcript attached.
- [ ] Done

### K7 · JOINT · Sun 18:00 — Page review

**Do:** both read `docs/project_page.md`, the README and the published (or private) page end to end. Person A checks every number against `data/results` and `notes_results.md`; Person B follows every instruction literally in a signed-out window. Revisit the K0 decision table.
**Pass:** both agree the page is final apart from bug fixes; the README disclosure matches the K0 outcome.
- [ ] Done

### K8 · JOINT · Sun 20:00 — Release-candidate cross-review

**Do:** each creates `git diff sp7..HEAD` plus `git diff window-start..sp7` of the other's files (Appendix U6) and reviews it in a fresh Claude chat with the review prompt. Owners fix blocking findings with the fix prompt. Person B tags `rc2` and pushes.
**Pass:** no blocking finding open.
- [ ] Done

### K9 · JOINT · Sun 22:30 → Mon 01:30 — Freeze, verify, submit

**Do:**
1. **Person B:** `git pull --rebase`, `npm test`, `npm run build`, `npm run check`; final upload of the three files plus `live.py` (top level, D11); confirm visibility and MIT.
2. **Person A:** `node tools/sweep.mjs --diag` and `--diag --decoder learned`; both hashes match the page; the bank generator runs `rep_d3_r1_L0` and `repx_d3_r1_L0`.
3. **Both:** signed-out private windows (A in Chrome, B in Edge): hero, every level, basis toggle, tour, live run, Diagnostics.
4. **Team lead:** submit (main project link, generator link, video, and the disclosure per K0); screenshot the confirmation.
5. **Person B:** `git tag v2.0` and `git push --tags`.

**Pass:** submission confirmed by Mon 01:30.
- [ ] Done

---

## 7. Person A checklist — physics and data

### A40 · CLAUDE CODE · Sat 09:30 — CC-A10: learned edge rates (`dem.js`)

**Why:** the forte-1 banks contain diagonal correlations as strong as the time-like ones (p ≈ 0.0096 against 0.0091–0.0096 at d = 5, r = 5 and d = 7, r = 3), which the decoder must know about.
**Depends on:** nothing from Person B.
**Do:** in Claude Code, `/clear`, then paste:

```text
Read CLAUDE.md and DECISIONS.md first.
Owner: Person A. Create or modify only files owned by Person A (see CLAUDE.md).

Task CC-A10: learned per-class edge rates from detector correlations.
Create exactly: src/core/dem.js, tests/dem.test.js. Do not import graph.js (it may not have diagonal edges yet); enumerate incident edges yourself as specified below.

Edge classes (CLAUDE.md v2, "Decoding graph"): for detector (k, j), index k*(d-1)+j, layers k = 0..r, checks j = 0..d-2:
- space: (k, j)-(k, j+1), a flip of data qubit j+1 in layer k (all layers 0..r);
- spaceBoundary: data qubit 0 in layer k joins (k, 0) to the boundary; data qubit d-1 joins (k, d-2) to the boundary;
- time: (k, j)-(k+1, j) for k = 0..r-1;
- diag: (k, j+1)-(k+1, j) for k = 0..r-1, j = 0..d-3 (a fault on data qubit j+1 between its CNOT into check j and its CNOT into check j+1 in round k).

1. pairRate(xi, xj, xij): p = 1/2 - 1/2 * sqrt(1 - 4 (xij - xi xj) / (1 - 2 xi - 2 xj + 4 xij)); clamp the radicand at 0 and the result to [0, 0.5). xi, xj are firing rates, xij the joint rate.
2. estimateEdgeRates(detectorArrays, d, r) -> { classes: { space, spaceBoundary, time, diag }, counts: { space, spaceBoundary, time, diag }, pij: Float64Array(nDet*nDet), firing: Float64Array(nDet), antiDiag, nShots }
   - nDet = (d-1)*(r+1). pij is symmetric, row-major, with pij[i*nDet+i] = firing rate of i. Compute pij for every pair (used by the heatmap).
   - classes.space, classes.time, classes.diag: the mean of pairRate over all pairs of that class.
   - antiDiag: the mean over (k, j)-(k+1, j+1) pairs (not an edge; a control that must be near 0).
   - classes.spaceBoundary: for every boundary detector (j = 0 or j = d-2) in every layer, solve 1 - 2 f = (1 - 2 pb) * product over its other incident edges of (1 - 2 p_class), where f is its firing rate, the other incident edges are the space, time and diag edges touching it (enumerate: space edges of data qubits j and j+1 in layer k that are not boundary edges; time edges to layers k-1 and k+1 that exist; diag edges (k, j)-(k+1, j-1) if k <= r-1 and j >= 1, and (k-1, j+1)-(k, j) if k >= 1 and j+1 <= d-2), using the class means; pb = (1 - (1 - 2f) / product) / 2, clamped to [1e-5, 0.5). For d = 3 both ends of a layer touch the same detector pair; treat each end separately. Return the mean over all boundary detectors.
   - Every class value is clamped to [1e-5, 0.5).
3. ratesFromBanks(banks) -> estimateEdgeRates on the pooled detectors of the given banks (same d, r, basis; throw otherwise). Use expandShots, split and computeDetectors through the Module API.

Tests (break comments required; fixed seeds; tolerances of at least 4 SE with the formula in the comment, SE of a pair rate taken as sqrt(p / N) for N shots):
- Synthetic recovery (V12a): d = 5, r = 5, N = 60000 shots, every edge of the four classes flipped independently with space 0.008, spaceBoundary 0.006, time 0.010, diag 0.009; detectors = XOR of incident flipped edges (build the incidence in the test); each recovered class within 4 SE (spaceBoundary within 6 SE, because it is solved from single-detector rates); antiDiag within 4 SE of 0.
- Non-vacuous control: the same generator with diag = 0 gives classes.diag within 4 SE of 0, and with diag = 0.02 gives a value above 0.015.
- pairRate: independent detectors (xij = xi xj) give 0; the radicand clamp returns 0.5 - epsilon, never NaN.
- pij symmetric; firing on the diagonal.

Run `npm test`. End with the report format.
```

**Pass:** all tests pass, including V12(a).
- [ ] Done

### A41 · TERMINAL · GIT · Sat 10:30 — Check and push

**Do:** run the estimator on the real banks as a sanity check:

```bat
node -e "import('./src/core/dem.js').then(async m=>{const fs=await import('fs');const b=['rep_d5_r5_L0','rep_d5_r5_L1'].map(n=>JSON.parse(fs.readFileSync('data/banks/'+n+'.json')));console.log(m.ratesFromBanks(b).classes)})"
npm test
git pull --rebase
git status --short
git add src\core\dem.js tests\dem.test.js
git commit -m "CC-A10: learned edge rates from detector correlations"
git push
```

**Pass:** d = 5, r = 5 gives roughly space 0.008, time 0.0096, diag 0.0096 (the review's numbers); antiDiag near 0.
- [ ] Done

### A42 · CLAUDE CODE · Sat 10:45 — CC-A11: phase-flip memory circuits

**Why:** the bit-flip memory cannot see Z errors; the phase-flip memory makes dephasing and forte-1's Z-type noise visible with the same decoder.
**Do:** `/clear`, then paste:

```text
Read CLAUDE.md and DECISIONS.md first.
Owner: Person A. Create or modify only files owned by Person A (see CLAUDE.md).

Task CC-A11: the phase-flip (X-basis) repetition memory in the bank generator, its local tests and the assembler.
Modify exactly: qollab/bank_generator.py, validation/test_circuits.py, tools/assemble_bank.mjs, tests/assemble_bank.test.js. Do not change qollab/live.py.

1. build_memory_circuit(d, r, logical, inject=None, basis="Z", inject_pauli="X"):
   - basis "Z": unchanged, bit for bit (existing tests must still pass).
   - basis "X": if logical == 1 apply X to every data qubit, then H to every data qubit (|+...+> or |-...->). Round k, check j, in the same order as basis Z (checks j = 0..d-2, inside a check data j before data j+1): h(anc); cx(anc -> data j); cx(anc -> data j+1); h(anc). After the last round, h on every data qubit, then measure everything with the same classical-bit layout as basis Z.
   - inject applies inject_pauli ("X" or "Z") at the same position as today. Basis X with inject_pauli "Z" must give the same bit pattern as basis Z with "X".
2. CONFIGS_X: repx_d3_r1, repx_d3_r3, repx_d5_r3, repx_d5_r5, repx_d7_r3, each with L0 (|+>) and L1 (|->), named like repx_d5_r3_L0; noise_model forte-1; SHOTS. V13_BATCH: v13_d3_r3_i{i}_k{k} for the three sites (0, 0), (1, 1), (2, 2), basis X, inject_pauli Z, noise_model ideal, V4_SHOTS. Add a distinct fixed seed for every new name to SEEDS (integers in 1..2^31, distinct from all existing seeds).
3. Banks of basis X carry "basis": "X"; Z banks keep their fields (no basis field is needed; readers default to "Z"). Everything else (native recipe, one job per run, BEGIN_BANK printing, detector_rate check) is unchanged.
4. validation/test_circuits.py (BasicSimulator, at most 24 qubits): basis X, logical 0 and 1, d = 3 r = 1, d = 3 r = 3, d = 5 r = 3: exactly one outcome, every ancilla bit 0, every data bit equal to the logical value (V13). Basis X, d = 3, r = 3, every Z-injection site: the single outcome equals the basis-Z X-injection outcome for the same site. SEEDS covers every name, all distinct. Basis Z tests unchanged.
5. tools/assemble_bank.mjs: accept names repx_d{d}_r{r}_L{L} and v13_d{d}_r{r}_i{i}_k{k}; check the name against the bank's d, r, logical, inject and basis; treat repx_ like rep_ for the detector_rate > 0 rule. tests/assemble_bank.test.js: a repx_ round trip; a repx_ block whose bank says basis "Z" fails.

Run `python -m pytest validation -q` and `npm test`. End with the report format.
```

**Pass:** V13 (local) passes; all old circuit tests unchanged and passing.
- [ ] Done

### A43 · QOLLAB · TERMINAL · Sat 11:30 — Push, then run the X-basis and V13 banks

**Do:**

```bat
python -m pytest validation -q
npm test
git pull --rebase
git status --short
git add qollab\bank_generator.py validation\test_circuits.py tools\assemble_bank.mjs tests\assemble_bank.test.js
git commit -m "CC-A11: phase-flip memory circuits, V13 tests"
git push
```

Paste the new `qollab/bank_generator.py` into your bank-generator project (private). Run, one configuration per run, IonQ Forte 1 picked: `repx_d3_r1_L0`, `repx_d3_r1_L1`, `repx_d3_r3_L0`, `repx_d3_r3_L1`, `repx_d5_r3_L0`, `repx_d5_r3_L1`, `repx_d5_r5_L0`, `repx_d5_r5_L1`, `repx_d7_r3_L0`, `repx_d7_r3_L1`; then `v13_d3_r3_i0_k0`, `v13_d3_r3_i1_k1`, `v13_d3_r3_i2_k2`. Save each block to `data/raw/repx_<...>.txt` or `data/raw/v13/<name>.txt`. Budget 6–8 min per configuration (more for d = 7): roughly 1.5–2 hours, in the background while you do A44–A47.
**Pass:** every bank has a detector rate above 0 (repx) or exactly one outcome (v13).
- [ ] Done

### A44 · CLAUDE CODE · Sat 11:45 — CC-A12: naive and learned decoding, Stage dem, Stages 1–2 rerun (Z)

**Depends on:** N1 (`graph.js` with diagonal edges) and N2 (`bank.js` basis). `git pull --rebase` first; if N1 is missing, write the code and run only the tests that do not need it, then rerun at N1.
**Do:** `/clear`, then paste:

```text
Read CLAUDE.md and DECISIONS.md first.
Owner: Person A. Create or modify only files owned by Person A (see CLAUDE.md).

Task CC-A12: naive and learned noise models in the sweep engine, the Stage dem results, and the Stage 1 and 2 reruns.
Modify exactly: src/core/sweep.js, tools/sweep.mjs, tests/sweep.test.js. Use buildGraph(d, r, { diagonal }) from graph.js and ratesFromBanks / estimateEdgeRates from dem.js through the Module API.

1. sweep.js (CLAUDE.md v2 Module API):
   - decodeShot({ ..., noise, basis }) where noise is { model: "naive", pGate } or { model: "learned", rates } (rates = classes from dem.js). If noise is absent and pGate is given, treat it as { model: "naive", pGate } so that every existing caller and the V9 hash are unchanged. basis defaults to bank.basis ?? "Z" and is passed to readout.idleFlipProbability(basis) (models that ignore the argument stay valid).
   - naive: buildGraph(d, r, { diagonal: false }) and today's edgeWeights, unchanged.
   - learned: buildGraph(d, r, { diagonal: true }); space edges p = rates.space (rates.spaceBoundary for data qubits 0 and d-1) in layer 0; xorP(that, pIdle) in layers 1..r-1; xorP(that, pRead_i) in layer r; time edges xorP(rates.time, pRead); diag edges rates.diag (no idle or readout term). pRead as today (hard: averageAssignmentError, soft: pFromLlr).
   - runPoint accepts noise the same way. diagnostic(bank, { decoder = "naive" } = {}): naive is the existing V9 computation, unchanged; learned uses rates from ratesFromBanks([bank]) and otherwise the same settings.
2. tools/sweep.mjs:
   - --decoder naive | learned | both (default both) for --stage 1, 2, 3, 4: every series gets "decoder": "naive" | "learned" (U4). Learned rates come from ratesFromBanks of the L0 and L1 banks of the same (d, r, basis), pooled.
   - --basis Z | X (default Z): selects rep_* or repx_* banks; X results go to *_x.json (U4). If no repx_* banks exist, exit with a clear message.
   - --stage dem: writes data/results/dem_forte1.json (U4): for every available (d, r, basis): pij, firing, classes, antiDiag, naive pGate, firing-rate ratio X/Z per (d, r) where both exist (O4); out of sample (V12b): rates from L0 decode L1 and rates from L1 decode L0, flat epsilon 0.02, hard, with naive for comparison; decoderComparison: naive against learned, hard and soft, at flat epsilon in [1e-9, 0.02], ion at tau in [3, 20, 100] us and superconducting at tau in [0.5, 0.7, 1.0] us with the current cards, d = 3, 5, 7, r = 3, R = 2, Wilson intervals.
   - --diag --decoder learned prints V9L; --diag alone prints V9 unchanged.
   - V11: in --stage 1, also run the learned decoder at epsilon = 0 and 1e-9 for every d and print PASS when the Wilson intervals overlap.
3. Tests (break comments): naive decodeShot reproduces the pre-change result on a fixed synthetic shot; diagnostic(bank) still returns the V9 hash recorded in DECISIONS for rep_d3_r3_L0; a learned weight table pins one edge of each class (including diag) to its expected p; a synthetic shot with one fired diagonal edge decodes to flip 0 with the learned graph and with cost equal to the diag weight.

Run `npm test`, then `node tools/sweep.mjs --stage dem`, `--stage 1`, `--stage 2`, `--diag`, `--diag --decoder learned`. End with the report format.
```

**Pass:** tests pass; V9 unchanged; the four commands finish.
- [ ] Done

### A45 · TERMINAL · VERIFY · GIT · Sat 13:00 — Check SP5 numbers and hand over

**Do:** check and record in your DECISIONS section and `notes_results.md`: V9 = `53933f98`; V9L (E9); V11 PASS at d = 3, 5, 7; V12(b) learned ≤ naive pooled; O4 not yet (X banks arrive later); the learned Stage 1 curve no longer has the ε = 0 spike; the learned Stage 2 soft against hard at τ = 20 µs (expected: the C2 loss shrinks or disappears). Then:

```bat
git pull --rebase
git status --short
git add src\core\sweep.js tools\sweep.mjs tests\sweep.test.js data\results docs\notes_results.md DECISIONS.md
git commit -m "CC-A12: learned decoder, Stage dem, Stages 1-2 rerun"
git push
```

Send `HANDOFF N3 and N4: sweep.js, dem.js, dem_forte1.json, stage1/2 with naive and learned, V9L <hash>`.
**Pass:** all checks recorded; if V12(b) fails, say so in the handoff (SP5 cut rule).
- [ ] Done

### A46 · CLAUDE CODE · Sat 14:30 — CC-A13: idle physics per arm and ion crosstalk

**Do:** first add the card fields of Appendix U5 to `params/ion.json` and `params/sc.json` with values and sources (or the UNSOURCED label). Then `/clear` and paste:

```text
Read CLAUDE.md and DECISIONS.md first.
Owner: Person A. Create or modify only files owned by Person A (see CLAUDE.md).

Task CC-A13: idle physics per basis for both readout models, and measurement-induced crosstalk on data ions.
Modify exactly: src/core/readout/ion.js, src/core/readout/sc.js, tests/ion.test.js, tests/sc.test.js. Do not change measure(), the likelihoods or averageAssignmentError().

Definitions (CLAUDE.md v2, "Idle errors"): for a wait of tau us,
- Z-basis (bit-flip) memory sees X and Y: pT1 = 1/2 (1 - exp(-tau / T1));
- X-basis (phase-flip) memory sees Z and Y: pT2 = 1/2 (1 - exp(-tau / T2));
- ion crosstalk (resonant light scattered by the ancilla's detection, absorbed by a data ion, fully depolarising it): pXt = 1/2 (1 - exp(-Gamma_xt * tau)) in either basis;
- total = xorP(idle part, pXt) (ion), idle part only (superconducting).

1. ion.js: read T2_idle_us and crosstalk_rate_per_us from the card (cardValue rules as today; crosstalk default 0 when absent, T2 default 2*T1 when absent). idleFlipProbability(basis = "Z") returns the total; idleBreakdown(basis = "Z") returns { idle, crosstalk, total }. createIonReadout(params, tau, { crosstalkRate } = {}) overrides the card's rate (used by the scan).
2. sc.js: read T2_us (default 2*T1 when absent); idleFlipProbability(basis = "Z") and idleBreakdown(basis) with crosstalk 0.
3. Both: throw if T2 > 2*T1, naming the values.
4. Tests (V14; break comments): the formulas at three tau values; basis "Z" with crosstalk 0 equals the old ion and superconducting values exactly (so V9 and every Z-basis naive number are unchanged); boundary T2 = 2*T1 accepted and T2 = 2*T1*(1 + 1e-9) rejected; crosstalk 0 against 1e-3 /us changes total; idleBreakdown parts recombine with xorP into total.

Run `npm test` and `node tools/sweep.mjs --diag`. End with the report format.
```

**Pass:** tests pass; V9 unchanged.
- [ ] Done

### A47 · TERMINAL · GIT · Sat 15:45 — Push and hand over

```bat
npm test
git pull --rebase
git status --short
git add src\core\readout params tests\ion.test.js tests\sc.test.js
git commit -m "CC-A13: idle physics per basis, ion crosstalk, card fields"
git push
```

Record the sources (or UNSOURCED labels) for T2 and Γ_xt in E6 and E7. Send `HANDOFF N5`.
- [ ] Done

### A48 · CLAUDE CODE · Sat 16:00 — CC-A14: Stage 1–3 reruns in both bases, budget, crosstalk scan

**Do:** first assemble every finished A43 bank (`node tools/assemble_bank.mjs data\raw` and `node tools/assemble_bank.mjs data\raw\v13`) and commit them. Then `/clear` and paste:

```text
Read CLAUDE.md and DECISIONS.md first.
Owner: Person A. Create or modify only files owned by Person A (see CLAUDE.md).

Task CC-A14: Stage 1-3 results in both bases with both decoders, the error budget and the ion crosstalk scan.
Modify exactly: tools/sweep.mjs, tests/v4.test.js (V13 part only), tests/sweep.test.js.

1. Every stage passes basis to decodeShot (CC-A12) and uses readout.idleFlipProbability(basis).
2. budget (U4), Stages 2 and 3, per basis, at every tau of the grid: readout = empirical assignment error (assignment.empirical); idle and crosstalk = idleBreakdown(basis) parts; gate = mean of the learned class rates for the d = 3, r = 3 banks of that basis. Label: "error sources per round, per qubit (approximate)".
3. crosstalkScan (U4), Stage 2 only, per basis: rates [0, 1e-6, 1e-5, 1e-4, 1e-3] per us (plus the card value if different), the full tau grid, d = 3 and 5, hard and soft, learned decoder, R = 2; for each rate and (d, mode) store pL, lo, hi and the tauLog optimum with atEdge (findMinimum, log x). Print, per rate, whether an interior tauLog < tauPhys exists (C1 ion part).
4. V13 test: the three v13_* banks have exactly one outcome, equal to the basis-Z injection prediction (applyX on the error-free bits) for the same site.
5. Run: --stage 1, 2, 3 with --basis Z and with --basis X (decoder both). Print V7, V8, V10 as before for both bases, and O4.

Run `npm test` and the six stage runs (expect about an hour in total; Stage 3 is the slow one). End with the report format.
```

**Pass:** tests pass (V13); six results files written.
- [ ] Done

### A49 · TERMINAL · VERIFY · GIT · Sat 18:00 — Check the reruns and hand over

**Do:** check and record: V7, V8, V10 unchanged in the Z basis; learned soft against hard (C2) in both arms; C1 superconducting with the learned decoder; the crosstalk scan verdict (C1 ion part) per rate; C6 (τ*_log X against Z, superconducting); O4 ratio per (d, r); the budget arrays add up to sensible magnitudes (readout ~10⁻³–10⁻², idle ≤ 3×10⁻², gate ~10⁻²). Write them into `notes_results.md`. Then commit `data\banks data\raw data\results tools\sweep.mjs tests docs\notes_results.md DECISIONS.md`, push, and send `HANDOFF N6`.
**Pass:** every check recorded with its source file.
- [ ] Done

### A50 · CLAUDE CODE · Sat 18:30 — CC-A15: Stage 4 v2 (framing, trade-off, sensitivity effects, C1–C6)

**Do:** first decide whether the ion's two-qubit gates in one round run in parallel (two layers per round) or one after another (2(d−1) layers per round). Use a source if you find one; otherwise choose sequential as the conservative case. Record it in E8 and set `gate_layers_per_round` in `params/cycle.json` (Appendix U5). Then `/clear` and paste:

```text
Read CLAUDE.md and DECISIONS.md first.
Owner: Person A. Create or modify only files owned by Person A (see CLAUDE.md).

Task CC-A15: Stage 4 v2.
Modify exactly: src/core/metrics.js, tests/metrics.test.js, tools/sweep.mjs.

1. metrics.js: cycleTime(card, tau, d) uses card.gate_layers_per_round: a number, or { "value": "2*(d-1)" } meaning 2*(d-1) (no other expressions are accepted; throw otherwise). roundsPerSecond(Tcyc_us) = 1e6 / Tcyc_us. tradeoffCurve(taus, pLs, r, card, d) -> { tau, roundsPerSecond, perRound } arrays.
2. --stage 4 (Z basis; learned decoder for every headline value; naive kept only in decoderComparison):
   - title and framing in the file: "framing": "Two readout physics models at fixed gate noise: the same IonQ forte-1 banks and learned decoder; different readout models, idle physics and cycle times."
   - platforms[p].tradeoff per d and mode (U4); platforms[p].budgetAtOptimum (budget at tauLog, d = 3 hard);
   - keep perRound, perMicrosecond, breakEven (byMode, empiricalAxis) as today;
   - sensitivity rows: keep the verdict fields and add effect = { perRound_d3_hard: { "trapped-ion", "superconducting" }, tauLog_d3_hard: { ... } } with values at the reduced statistics already used, plus the same two numbers in sensitivityBaseline; parameters now include T2 and the crosstalk rate;
   - conclusions C1 (revised), C2, C3 (replaced), C4, C5, C6 with fields { statement, verdict ("held" | "refuted" | "undetermined"), automated, note, plain } exactly as U4; plain is "" (Person A fills it at A55); C3 uses the U4 dominance rule; C5 compares learned against naive at tauLog per (d, arm, mode); C6 compares superconducting tauLog X against Z (needs stage3_sc_x.json).
3. --stage 4 --basis X writes stage4_comparison_x.json with tradeoff, perRound and budgetAtOptimum only.
4. Tests (V15; break comments): cycleTime with 2 and with "2*(d-1)" at d = 5; an unknown expression throws; tradeoffCurve on hand-computed numbers; the C3 dominance rule on two synthetic curves, one dominating and one not.

Run `npm test`, `node tools/sweep.mjs --stage 4`, `node tools/sweep.mjs --stage 4 --basis X`. End with the report format.
```

**Pass:** tests pass; both files written.
- [ ] Done

### A51 · TERMINAL · VERIFY · GIT · Sat 19:45 — Check Stage 4 and hand over

**Do:** hand-check V15 for one point per arm; read every conclusion; make sure no automated verdict contradicts your reading without a note. Commit `src\core\metrics.js tests\metrics.test.js tools\sweep.mjs params\cycle.json data\results DECISIONS.md`, push, send `HANDOFF N7`.
- [ ] Done

### A52 · SELF · Sat 21:15 — Results notes v2

**Do:** rewrite the "Verdicts" part of `docs/notes_results.md` for C1–C6 and O4, each with the full-statistics verdict, the numbers and their sources, and a "what changed from v1" line (the learned decoder, the new idle physics). Note plainly which v1 conclusions were decoder artefacts. Commit and push.
- [ ] Done

### A53 · REVIEW · Sun 05:30 — Review Person B's SP6 interface

**Do:** pull; open N8's preview with every flag on. Check every number shown against the results files, the physics wording of "Learn the noise" (fault position, why the naive decoder needs two edges), the budget bar's labels and the framing caption. Send findings as a numbered list (blocking, major, minor) in B's DECISIONS-style format.
- [ ] Done

### A54 · CLAUDE CODE · Sun 06:30 — CC-A16: page physics and results sections v2

**Do:** `/clear`, then paste:

```text
Read CLAUDE.md and DECISIONS.md first.
Owner: Person A (shared file docs/project_page.md, Person A's sections only: "The physics in plain language", "Results", "Validation", "Limitations").

Task CC-A16: rewrite Person A's sections of docs/project_page.md for v2 from docs/notes_results.md, DECISIONS.md and data/results/*.json only; every number carries an HTML comment naming its source file and field.
- Frame every comparison as "two readout physics models at fixed gate noise"; state that the superconducting arm carries trapped-ion gate noise by construction.
- Physics: add the phase-flip memory (what it sees, T2), measurement crosstalk on ions, and the detector error model (diagonal edges, learned rates, out-of-sample check), each in at most 120 words of plain language.
- Results: one short paragraph per hypothesis C1-C6 and O4 with the verdict, the key numbers and the "changed from v1" line; the trade-off result in one paragraph.
- Validation: add V2b, V9L, V11-V16.
- Limitations: keep v1's, add the in-sample learned rates (with the V12b result), the crosstalk rate's status (sourced or illustrative), and fixed gate noise for both arms.
Do not touch Person B's sections. End with the report format.
```

**Pass:** every number has a source comment; nothing contradicts `notes_results.md`.
- [ ] Done

### A55 · EDITOR · Sun 08:00 — Edit the page; plain-language verdicts

**Do:** edit your sections by hand until they read well aloud. Write one plain sentence (at most 20 words) for each of C1–C6 and O4, and the framing sentence, into `conclusions[*].plain` of `stage4_comparison.json` (edit the JSON directly; record it in E-notes) and into `notes_results.md`. Commit, push, send `HANDOFF N9`.
- [ ] Done

### A56 · SELF · Sun 10:00 — Buffer, or optional statistics work

**Do:** fix review findings in your files with the fix prompt (U6). If nothing is open, take an item from Appendix U11 in the stated order; rerun only what it touches; update notes and page numbers.
- [ ] Done

### A57 · REVIEW · Sun 11:30 — Review Person B's Sunday work

**Do:** as A53, on the sandbox, basis toggle, tour, curated examples and Level 5 v2. Also check the README's methods and disclosure sections.
- [ ] Done

### A58 · JOINT · Sun 13:00 → 22:30 — K4–K8

Take part in K4 (numbers), K5 (notes), fixes at 15:00 (FIX prompts in your files), K6 (narration), K7, K8.
- [ ] Done

### A59 · JOINT · Sun 22:30 — K9

- [ ] Done

---

## 8. Person B checklist — decoder, interface and platform

### B40 · CLAUDE CODE · Sat 09:30 — CC-B11: diagonal edges and V2b

**Why:** the decoding graph lacks a whole error class; adding it is the single change that moves the most results.
**Do:** `/clear`, then paste:

```text
Read CLAUDE.md and DECISIONS.md first.
Owner: Person B. Create or modify only files owned by Person B (see CLAUDE.md).

Task CC-B11: diagonal edges in the decoding graph, and the PyMatching cross-check with them (V2b).
Modify exactly: src/core/graph.js, tests/graph.test.js, tests/matching.test.js, tools/export_vectors.mjs, validation/pymatching_check.py, data/vectors/*.

1. graph.js: buildGraph(d, r, { diagonal = false } = {}). The space and time edges and their ids are generated exactly as today, first. If diagonal, append, for k = 0..r-1 and j = 0..d-3, an edge { u: node(k, j+1), v: node(k+1, j), kind: "diag", layer: null, dataQubit: j+1, check: null, round: k, observable: false } (a fault on data qubit j+1 between its CNOT into check j and its CNOT into check j+1 in round k). buildGraph(d, r) and buildGraph(d, r, { diagonal: false }) must equal today's graph exactly. The default stays false because src/core/sweep.js (Person A) calls buildGraph(d, r) today and its results must not change before CC-A12; CLAUDE.md v2 says callers pass { diagonal } explicitly.
2. matching.js needs no change; prove it with tests: on buildGraph(3, 3, { diagonal: true }) a shot whose only fired edge is one diag edge decodes with nDefects 2, flip 0, and cost equal to that edge's weight; on the naive graph the same detectors cost the sum of one space and one time edge. A diag edge never sets the observable.
3. graph tests: the diagonal graph has exactly r(d-2) more edges than the naive one; every diag edge joins (k, j+1) and (k+1, j); { diagonal: false } is identical, edge by edge, to the previous graph (snapshot of ids, u, v, kind).
4. export_vectors.mjs: an option --diagonal (default on) so vectors are drawn on the diagonal graph (every edge flips with p = 0.03 as today). pymatching_check.py: build the PyMatching graph from the exported edge list (no change if it already does) and report as before: flips, ties, and cost mismatches (tolerance 1e-9). Regenerate data/vectors with --n 20000 --seed 1.

Run `npm test`, then `node tools/export_vectors.mjs --n 20000 --seed 1` and `%USERPROFILE%\venvs\s2s\Scripts\python.exe validation\pymatching_check.py`. End with the report format.
```

**Pass:** tests pass; V2b: zero cost mismatches; ties counted.
- [ ] Done

### B41 · TERMINAL · GIT · Sat 10:45 — Push and hand over

```bat
npm test
git pull --rebase
git status --short
git add src\core\graph.js tests\graph.test.js tests\matching.test.js tools\export_vectors.mjs validation\pymatching_check.py data\vectors
git commit -m "CC-B11: diagonal edges (opt-in), V2b"
git push
```

Record the V2b tie counts in your DECISIONS section. Send `HANDOFF N1: graph.js with { diagonal }, V2b 0 cost mismatches`.
- [ ] Done

### B42 · CLAUDE CODE · Sat 10:45 — CC-B12: basis field, v2 fixtures, bridges and flags

**Do:** `/clear`, then paste:

```text
Read CLAUDE.md and DECISIONS.md first.
Owner: Person B. Create or modify only files owned by Person B (see CLAUDE.md).

Task CC-B12: the bank basis field, v2 fixtures, bridge exports and feature flags.
Modify exactly: src/core/bank.js, tests/bank.test.js, tools/make_fixtures.mjs, data/fixtures/* (new *_v2.json files only), src/ui/bridge_core.js, src/ui/bridge_data.js, src/ui/features.js, tools/release_check.mjs, tests/stubs.test.js.

1. bank.js: validateBank accepts an optional "basis" equal to "Z" or "X" and rejects any other value; absent means "Z". Tests: "X" accepted, "Y" rejected, absent accepted.
2. make_fixtures.mjs writes synthetic v2 fixtures following CLAUDE.md v2 results formats exactly, each with "fixture": true: dem_forte1_v2.json; stage1_flat_v2.json, stage2_ion_v2.json, stage3_sc_v2.json (series with "decoder", budget, crosstalkScan in stage 2); stage1_flat_x_v2.json, stage2_ion_x_v2.json, stage3_sc_x_v2.json; stage4_comparison_v2.json (tradeoff, budgetAtOptimum, sensitivity effect, conclusions C1-C6 with plain text "fixture"); params_ion_v2.json, params_sc_v2.json, params_cycle_v2.json with the U5 fields.
3. bridge_data.js: keep every current export; add demForte1, stage1v2, stage2v2, stage3v2, stage4v2, stage1x, stage2x, stage3x, paramsIonV2, paramsScV2, paramsCycleV2, all pointing at the v2 fixtures. bridge_core.js: keep every export; add estimateEdgeRates (stub that throws "not available in the browser"; the UI never calls it), buildGraph and decode are imported by the UI directly from src/core (Person B's own modules).
4. features.js: add hero, uxV2, learnNoise, phaseFlip, crosstalk, level5v2, sandbox, tour, curated, all false.
5. release_check.mjs: each new flag lists the bridge exports it needs (CLAUDE.md v2, U3 of the team checklist) and fails if any points at data/fixtures or src/ui/stubs while the flag is on. Also add a visible-text check: the built index.html and every string literal in src/ui that is rendered as text must not contain any of: "belief model", "bank shot", "layer r", "CC-", "Person A", "Person B", "stub", "fixture" (case-insensitive), except inside the Diagnostics panel; report the file and string.

Run `npm test`, `npm run build`, `npm run check`. End with the report format.
```

**Pass:** tests pass; build and check pass with every new flag off.
- [ ] Done

### B43 · CLAUDE CODE · Sat 11:30 — CC-B13: design tokens, hero panel, text cut

**Do:** first push B42 (`git add` your files, commit "CC-B12 ...", push, send `HANDOFF N2: bank.js accepts basis`). Then `/clear` and paste:

```text
Read CLAUDE.md and DECISIONS.md first.
Owner: Person B. Create or modify only files owned by Person B (see CLAUDE.md).

Task CC-B13: one visual language, the hero panel, and the text cut. Follow the team checklist Appendix U7 sections U7.1-U7.3 exactly (attached below).
Create: src/ui/tokens.css, src/ui/hero.js, tests/hero.test.js. Modify: src/ui/style.css, src/ui/main.js, src/ui/charts.js, src/ui/level1.js, src/ui/level2.js, src/ui/level3.js, src/ui/level4.js, src/ui/level5.js, src/ui/index.template.html, tools/build.mjs (only to include tokens.css).

<paste Appendix U7.1, U7.2 and U7.3 here>

Data: the hero reads stage2v2 (trapped ion) and stage3v2 (superconducting) through bridge_data, fixtures for now: assignment.empirical, the d = 3 hard series with decoder "learned" (fall back to the series without a decoder field, which is naive, if no learned series exists), optima.tauPhysEmpirical (fall back to locating the minimum of assignment.empirical with findMinimum, log x), and the matching tauLog. Until SP6, stage3v2 may point at the v1 file data/results/stage3_sc.json, which has no learned series; the fallbacks make that work. Behind FEATURES.hero (hero) and FEATURES.uxV2 (text cut and tokens); with both flags off the page must look exactly as before.
Tests: hero.test.js checks the live sentence for a tau below, between and above the two optima (three different sentences), the shaded interval endpoints, and that the slider snaps to grid points.

Run `npm test`, `npm run build`, `npm run check`. Open dist/local/preview.html with hero and uxV2 forced on in a scratch copy of features.js (do not commit it on) and describe what you see. End with the report format.
```

**Pass:** tests pass; with flags off nothing changes; with flags on, the hero works on fixtures.
- [ ] Done

### B44 · EDITOR · VERIFY · Sat 13:30 — Switch to SP5 data

**Do:** after `ACK N3` and `ACK N4`, apply Appendix U3 rows 13–16; levels 1–4 now pass `noise: { model: "learned", rates }` (rates from `demForte1` for the bank's (d, r, basis)) into `decodeShot` and `runPoint`; Diagnostics shows V9 and V9L (from `diagnostic(bank)` and `diagnostic(bank, { decoder: "learned" })`). Build, check, preview; join K2.
**Pass:** release check passes with hero and uxV2 on.
- [ ] Done

### B45 · CLAUDE CODE · Sat 14:30 — CC-B14: Level 1 game; Level 3 budget bar, d selector, challenge

**Do:** `/clear`, then paste:

```text
Read CLAUDE.md and DECISIONS.md first.
Owner: Person B. Create or modify only files owned by Person B (see CLAUDE.md).

Task CC-B14: the Level 1 decoding game and the Level 3 error budget, distance selector and challenge. Follow Appendix U7.4 and U7.5 exactly (attached below).
Create: src/ui/budget.js, tests/level1.test.js. Modify: src/ui/level1.js, src/ui/level3.js, src/ui/charts.js, tests/level3.test.js.

<paste Appendix U7.4 and U7.5 here>

Behind FEATURES.uxV2. The budget bar reads stage2v2/stage3v2 budget arrays (fixtures until switched) and, when FEATURES.crosstalk is on, shows the crosstalk segment for the ion.
Tests: level1: data readouts are not in the DOM before an answer; the epsilon schedule; score and streak updates; the reason text names the flipped qubit and lit checks. level3: only the chosen d's tauLog marker is drawn; the challenge score bands; budget segments sum to the stored total within 1e-12.

Run `npm test`, `npm run build`, `npm run check`. End with the report format.
```

**Pass:** tests pass; build and check pass.
- [ ] Done

### B46 · CLAUDE CODE · Sat 16:30 — CC-B15: "Learn the noise"

**Depends on:** N4 (`dem_forte1.json`). Until it lands, build on `dem_forte1_v2.json`.
**Do:** `/clear`, then paste:

```text
Read CLAUDE.md and DECISIONS.md first.
Owner: Person B. Create or modify only files owned by Person B (see CLAUDE.md).

Task CC-B15: the "Learn the noise" level. Follow Appendix U7.6 exactly (attached below).
Create: src/ui/learnnoise.js, tests/learnnoise.test.js. Modify: src/ui/main.js (mount it as the level after Level 4, behind FEATURES.learnNoise), src/ui/charts.js (heatmap helper only).

<paste Appendix U7.6 here>

faultDetectors(d, r, fault) is a pure exported function. V16: for d = 3 and d = 5, r = 3, every fault slot ("before", "mid" for data qubits 1..d-2, "after"), build m and x explicitly by flipping the affected bits of an error-free shot (the rule in U7.6), run computeDetectors, and compare with faultDetectors; all equal.
The naive and learned graphs come from buildGraph(d, r, { diagonal }) and decode() directly (Person B's modules); learned weights from demForte1 classes.

Run `npm test`, `npm run build`, `npm run check`. End with the report format.
```

**Pass:** tests pass including V16.
- [ ] Done

### B47 · CLAUDE CODE · Sat 19:00 — CC-B16: Level 5 v2

**Do:** `/clear`, then paste:

```text
Read CLAUDE.md and DECISIONS.md first.
Owner: Person B. Create or modify only files owned by Person B (see CLAUDE.md).

Task CC-B16: Level 5 v2, "Two readout models, same gates". Follow Appendix U7.7 exactly (attached below).
Modify: src/ui/level5.js, src/ui/charts.js, tests/level5.test.js.

<paste Appendix U7.7 here>

Behind FEATURES.level5v2; with it off, Level 5 is unchanged. Data from stage4v2 and paramsCycleV2 (fixtures until switched).
Tests: the trade-off chart has one series per (arm, d) with points in tau order; the scoreboard shows one row per conclusion with the correct badge; the tornado chart orders parameters by the largest absolute effect; every chart has its values table; the old tables are inside the "Data" expander.

Run `npm test`, `npm run build`, `npm run check`. End with the report format.
```

**Pass:** tests pass.
- [ ] Done

### B48 · EDITOR · VERIFY · Sat 20:00 — Switch to SP6 data

**Do:** after `ACK N5`, `N6`, `N7`: apply Appendix U3 rows 17–24 (24 only if B47 passed); build, check, preview with every switched flag on; produce `dist/local/preview.html` with every flag on in a scratch copy for N8 (send the file, do not commit the scratch flags). Join K3.
- [ ] Done

### B49 · CLAUDE CODE · Sun 05:30 — CC-B17: Level 2 sandbox and the global basis toggle

**Do:** `/clear`, then paste:

```text
Read CLAUDE.md and DECISIONS.md first.
Owner: Person B. Create or modify only files owned by Person B (see CLAUDE.md).

Task CC-B17: the Level 2 sandbox and the global bit-flip / phase-flip toggle. Follow Appendix U7.8 and U7.9 exactly (attached below).
Create: src/ui/sandbox.js, tests/sandbox.test.js. Modify: src/ui/level2.js, src/ui/main.js, src/ui/hero.js, src/ui/level3.js, src/ui/level4.js, src/ui/level5.js.

<paste Appendix U7.8 and U7.9 here>

Sandbox behind FEATURES.sandbox; toggle behind FEATURES.phaseFlip.
Tests: injecting a data flip lights the predicted horizontal pair; a misreport lights the vertical pair; the player's matching cost equals the sum of the chosen path weights; the toggle swaps every results source to its *_x counterpart and every visible "bit flip" label to "phase flip".

Run `npm test`, `npm run build`, `npm run check`. End with the report format.
```

- [ ] Done

### B50 · CLAUDE CODE · Sun 08:00 — CC-B18: guided tour, curated Level 4 examples, live-run panel

**Do:** `/clear`, then paste:

```text
Read CLAUDE.md and DECISIONS.md first.
Owner: Person B. Create or modify only files owned by Person B (see CLAUDE.md).

Task CC-B18: the guided tour, curated Level 4 examples and the live-run panel. Follow Appendix U7.10, U7.11 and U7.12 exactly (attached below).
Create: src/ui/tour.js, tools/curate.mjs, data/curated/curated_shots.json, tests/curate.test.js, tests/tour.test.js. Modify: src/ui/main.js, src/ui/level4.js, src/ui/liverun.js, src/ui/bridge_data.js (one new export, curatedShots).

<paste Appendix U7.10, U7.11 and U7.12 here>

Tour behind FEATURES.tour; curated examples behind FEATURES.curated.
Tests: curate.mjs output is reproducible (same file twice); every curated "soft saves" shot really has hard error 1 and soft error 0 under the stated settings, and the reverse for "soft fails"; the tour moves focus to each target and Escape ends it.

Run `node tools/curate.mjs`, `npm test`, `npm run build`, `npm run check`. End with the report format.
```

- [ ] Done

### B51 · CLAUDE CODE · VERIFY · Sun 10:00 — CC-B19: accessibility, consistency, motion

**Do:** `/clear`, then paste:

```text
Read CLAUDE.md and DECISIONS.md first.
Owner: Person B. Create or modify only files owned by Person B (see CLAUDE.md).

Task CC-B19: accessibility and consistency pass over every v2 view, plus the motion polish. Follow Appendix U7.1 (tokens) and U7.13 (motion) exactly (attached below).
Modify: src/ui/* only.

<paste Appendix U7.1 and U7.13 here>

Audit in a scratch build with every flag on, at 360 px and 1280 px: keyboard reach and order; visible focus; accessible names; a values table for every chart and the heatmap; contrast >= 4.5:1 for text and >= 3:1 for chart marks; colour never the only cue; no horizontal page scroll; prefers-reduced-motion disables every animation; numbers at 2-3 significant figures; d, mode, arm and basis always in their token colour and shape. Fix what fails; list what passed and what failed before the fix.

Run `npm test`, `npm run build`, `npm run check`. End with the report format.
```

- [ ] Done

### B52 · EDITOR · Sun 11:30 — README v2, interface page sections, cleanup

**Do:** README: authors, about (the framing sentence), run instructions, methods (add learned edge rates, diagonal edges, phase-flip memory, crosstalk, trade-off metric, with references), libraries, the disclosure section as decided at K0 (Appendix U8), licence. Page: "How to run it", "The levels" (hero, Levels 1–5, "Learn the noise", sandbox, toggle, tour), "Accessibility". No internal codes anywhere. Fresh screenshots of every view into `docs/screenshots/`. Commit, push, send `HANDOFF N10`.
- [ ] Done

### B53 · REVIEW · Sun 12:00 — Review Person A's v2 code

**Do:** `git diff window-start..HEAD -- src/core/dem.js src/core/sweep.js src/core/readout src/core/metrics.js tools/sweep.mjs qollab tests > review_a2.diff`; review it with the U6 prompt in a fresh chat; read `dem.js` yourself (the boundary solve and the diagonal class definition). Send findings; delete the diff file.
- [ ] Done

### B54 · EDITOR · VERIFY · Sun 12:30 — Switch to SP7

**Do:** apply Appendix U3 rows 25–28 for what passed; join K4.
- [ ] Done

### B55 · JOINT · Sun 13:00 → 22:30 — K4–K8

Run K5, fix at 15:00 (FIX prompts in your files; text cuts first), drive K6, take part in K7 and K8.
- [ ] Done

### B56 · JOINT · Sun 22:30 — K9

- [ ] Done

---

## Appendix U1 — `CLAUDE.md` v2 amendments

Apply at K1. Replace the named sections entirely; keep every other section as it is.

**Replace "What the project is" with:**

```text
## What the project is
An open-source lab, published and runnable on Qollab, showing how qubit-readout physics sets the logical error rate of repetition-code memories (bit-flip and phase-flip), as a comparison of two readout physics models at fixed gate noise. Circuits: Qiskit on IonQ's simulator (forte-1 noise), submitted in native gates. Readout models and idle physics: classical, in JavaScript. Decoder: our own exact minimum-weight matching on a naive graph (space and time edges, one calibrated rate) or a learned graph (space, time and diagonal edges, per-class rates learned from detector correlations).
```

**In "Conventions", replace the "Check j", "Logical observable" and "Idle errors" bullets with:**

```text
- Indexing in code is 0-based. Data qubits i = 0..d-1. Check j = 0..d-2 measures Z_j Z_{j+1} in the Z basis (bit-flip memory) and X_j X_{j+1} in the X basis (phase-flip memory). Rounds k = 0..r-1. Detector layers k = 0..r, where layer r is the final layer computed from the data readout. Detector index = k*(d-1) + j. Boundary node index = (d-1)*(r+1). Banks carry "basis": "Z" | "X"; absent means "Z".
- Logical observable: the value of data qubit 0 in the memory's basis (Z or X). Observable edges are the edges representing a flip of data qubit 0.
- Decoding graph: space edges (data qubit flips within a layer; data qubits 0 and d-1 join the boundary), time edges (wrong reports of m[k][j]), and, in the learned graph only, diagonal edges (k, j+1)-(k+1, j) for k = 0..r-1, j = 0..d-3: a fault on data qubit j+1 between its CNOT into check j and its CNOT into check j+1 in round k. Diagonal edges are never observable. Callers pass { diagonal } explicitly.
- Idle errors: an error on data qubit i after round k (k = 0..r-2) flips m[k'][i-1] and m[k'][i] (checks that exist) for all k' > k, and flips x[i]; in the X basis the error is a Z, with the same bit pattern. No idle error after the last round. Idle errors act on the true bits before readout. Probabilities for a wait tau: Z basis 1/2 (1 - exp(-tau/T1)); X basis 1/2 (1 - exp(-tau/T2)) with T2 <= 2*T1; ion crosstalk 1/2 (1 - exp(-Gamma_xt tau)) in either basis, combined with xorP.
- Readout-model contract: measure(trueBit, rng) -> { hard, llr }; idleFlipProbability(basis = "Z"); idleBreakdown(basis = "Z") -> { idle, crosstalk, total }; averageAssignmentError(). llr = ln[p(s|1)/p(s|0)]; +/-Infinity is allowed for perfect readout.
```

**Replace the ownership table with:**

```text
| Owner | Files |
|---|---|
| A | qollab/*; validation/test_circuits.py; tools/assemble_bank.mjs; tools/sweep.mjs; src/core/readout/*; src/core/idle.js; src/core/calibrate.js; src/core/dem.js; src/core/stats.js; src/core/sweep.js; src/core/quadrature.js; src/core/special.js; src/core/optimum.js; src/core/metrics.js; params/*; data/banks/*; data/raw/*; data/results/*; docs/notes_results.md; the tests for these files |
| B | package.json; package-lock.json; .gitignore; LICENSE; README.md; src/core/rng.js; src/core/bank.js; src/core/detectors.js; src/core/graph.js; src/core/matching.js; src/core/logical.js; src/ui/* (including stubs, bridges, features.js, tokens.css); tools/build.mjs; tools/release_check.mjs; tools/export_vectors.mjs; tools/make_fixtures.mjs; tools/curate.mjs; validation/pymatching_check.py; data/vectors/*; data/fixtures/*; data/curated/*; docs/qollab_js_api_example.txt; docs/screenshots/*; the tests for these files |
| Both | CLAUDE.md; DECISIONS.md (own section only); docs/project_page.md (sections as assigned); docs/notes_results.md (B: "Interface notes" section only) |
```

**In "Module API", replace the graph.js, readout, calibrate.js, sweep.js and metrics.js lines and add dem.js:**

```text
- graph.js (B): buildGraph(d, r, { diagonal = false } = {}) -> { d, r, nDetectors, boundary, edges: [{ id, u, v, kind: "space" | "time" | "diag", layer, dataQubit, check, round, observable }] }; space and time edges come first with the same ids as the naive graph; weightFromP(p); weightFromLlr(llr); pFromLlr(llr); xorP(a, b).
- Readout models (A): createFlatReadout({ epsilon }), createIonReadout(params, tau, { crosstalkRate } = {}), createScReadout(params, tau). Each returns measure(trueBit, rng) -> { hard, llr, ... }, idleFlipProbability(basis = "Z"), idleBreakdown(basis = "Z") -> { idle, crosstalk, total }, averageAssignmentError(). Ion: countHistogram(bit, nSamples, rng). Superconducting: snr(), iqSamples(bit, n, rng).
- calibrate.js (A): estimatePGate(detectorArrays, d, r) -> { p, rate, nDetectors, nShots } (naive model, unchanged).
- dem.js (A): pairRate(xi, xj, xij); estimateEdgeRates(detectorArrays, d, r) -> { classes: { space, spaceBoundary, time, diag }, counts, pij, firing, antiDiag, nShots }; ratesFromBanks(banks) -> the same, pooled over banks of equal d, r, basis.
- sweep.js (A): decodeShot({ shotBits, layout, d, r, readout, mode, noise, basis, rng, logical = 0 }) with noise = { model: "naive", pGate } | { model: "learned", rates }; pGate alone is accepted as the naive model; returns { logicalError, corrected, flip, nDefects, exact, detectors, paths, hardAnc, hardData, llrAnc, llrData }; runPoint({ bank, readout, mode, noise, seed, maxShots }) -> { k, n, wilson, nonExact }; diagnostic(bank, { decoder = "naive" } = {}) -> 8-character hexadecimal string (naive: V9, learned: V9L).
- metrics.js (A): perRound, perRoundToTotal, cycleTime(card, tau, d), perMicrosecond, roundsPerSecond, tradeoffCurve, breakEven.
```

**Replace "Results format" with a pointer:** "Results formats are s2s-results/1 (v1 fields) plus the v2 fields in docs/signal-to-syndrome-team-checklist.md, Appendix U4. New fields are additive; v1 readers ignore them."

**Append a section:**

```text
## Integrity rules (v2)
- Never rewrite pushed history, amend pushed commits, force push or change dates.
- Every number on the page or in the README comes from data/results, params or DECISIONS, with a source comment.
- The comparison is always described as two readout physics models at fixed gate noise.
```

---

## Appendix U2 — `DECISIONS.md` v2 section

Append at K1:

```text
## v2 (from tag window-start)

| ID | Question | Answer | Evidence | Time | Who |
|---|---|---|---|---|---|
| E1 | What do the terms say about prior work; what did the organizers answer | | quote + email | | Both |
| E2 | window-start commit | | git rev-parse | | B |
| E3 | Edge classes and the boundary-rate method | as CC-A10 | tests/dem.test.js | | A |
| E4 | V12b out of sample: learned against naive | | dem_forte1.json | | A |
| E5 | O4: X/Z bulk detector-rate ratio per (d, r) | | dem_forte1.json | | A |
| E6 | Ion crosstalk rate: value and source, or UNSOURCED | | params/ion.json | | A |
| E7 | T2 values (ion idle, superconducting): value and source | | params/*.json | | A |
| E8 | Ion two-qubit gates per round: parallel or sequential | | params/cycle.json | | A |
| E9 | V9L hash (learned decoder) | | sweep.mjs --diag --decoder learned | | A |
| E10 | Hallway-test findings, ranked | | K5 notes | | Both |
```

---

## Appendix U3 — Bridge and feature switches v2

After any switch: `npm run build`, then `npm run check`.

| # | Ship point | Handoff | File | Change |
|---|---|---|---|---|
| 13 | SP5 | N4 | `bridge_data.js` | `demForte1`, `stage1v2`, `stage2v2` → `data/results/dem_forte1.json`, `stage1_flat.json`, `stage2_ion.json`; `stage3v2` → `data/results/stage3_sc.json` (the v1 file; replaced by the rerun at row 18) |
| 14 | SP5 | N3 | levels 1–4 | pass the learned `noise` (B44) |
| 15 | SP5 | — | `features.js` | `hero: true`, `uxV2: true` (the superconducting hero curve uses the naive series until row 18, through the U7.2 fallbacks) |
| 16 | SP5 | — | `features.js` | nothing else; check that Level 1 game and budget stay off |
| 17 | SP6 | N5 | `bridge_data.js` | `paramsIonV2`, `paramsScV2` → `params/ion.json`, `params/sc.json` |
| 18 | SP6 | N6 | `bridge_data.js` | `stage3v2` stays on `stage3_sc.json`, now the rerun with both decoders; `stage1x`, `stage2x`, `stage3x` → `data/results/*_x.json` |
| 19 | SP6 | — | `features.js` | `crosstalk: true` |
| 20 | SP6 | — | `features.js` | `learnNoise: true` (needs row 13) |
| 21 | SP6 | — | `features.js` | `phaseFlip: true` only if B49 is done; otherwise at SP7 |
| 22 | SP6 | N7 | `bridge_data.js` | `stage4v2` → `stage4_comparison.json`; `paramsCycleV2` → `params/cycle.json` |
| 23 | SP6 | — | Level 1 and Level 3 | uxV2 parts from B45 are already under `uxV2`; confirm they show real budget data |
| 24 | SP6 | — | `features.js` | `level5v2: true` if B47 passed |
| 25 | SP7 | — | `features.js` | `sandbox: true` |
| 26 | SP7 | — | `features.js` | `phaseFlip: true` (if not at row 21) |
| 27 | SP7 | — | `features.js` | `tour: true` |
| 28 | SP7 | — | `features.js`, `bridge_data.js` | `curated: true`; `curatedShots` → `data/curated/curated_shots.json` |

---

## Appendix U4 — Results formats v2 (additive)

**Series (Stages 1–3).** Each series gains `"decoder": "naive" | "learned"`. Files written with `--decoder both` contain both.

**Basis.** Top-level `"basis": "Z" | "X"`. X-basis files: `stage1_flat_x.json`, `stage2_ion_x.json`, `stage3_sc_x.json`, `stage4_comparison_x.json`.

**Optima (Stages 2–3).** `optima.tauPhysEmpirical: { xMin, atEdge }` added beside `tauPhys`; `optima.tauLog` entries gain `"decoder"`.

**Budget (Stages 2–3).** `"budget": { "label": "error sources per round, per qubit (approximate)", "tau_us": [...], "readout": [...], "idle": [...], "crosstalk": [...] (zeros for superconducting), "gate": number }`.

**Crosstalk scan (Stage 2).** `"crosstalkScan": { "rates_per_us": [...], "entries": [{ "rate", "d", "mode", "pL": [...], "lo": [...], "hi": [...], "tauLog": { "xMin", "lo", "hi", "atEdge" }, "interiorBelowTauPhys": bool }] }`.

**Stage dem (`dem_forte1.json`).**

```json
{
  "schema": "s2s-results/1", "stage": "dem",
  "banks": [{ "d": 5, "r": 5, "basis": "Z", "files": ["rep_d5_r5_L0.json", "rep_d5_r5_L1.json"],
              "nShots": 8000, "firing": [], "pij": [[]], "classes": { "space": 0, "spaceBoundary": 0, "time": 0, "diag": 0 },
              "antiDiag": 0, "pGateNaive": 0 }],
  "ratioXoverZ": [{ "d": 3, "r": 3, "ratio": 0, "lo": 0, "hi": 0 }],
  "outOfSample": [{ "d": 3, "r": 3, "basis": "Z", "trainedOn": "L0", "testedOn": "L1", "naive": { "k": 0, "n": 0, "lo": 0, "hi": 0 }, "learned": { "k": 0, "n": 0, "lo": 0, "hi": 0 } }],
  "decoderComparison": [{ "arm": "flat|trapped-ion|superconducting", "x": 0.02, "d": 3, "r": 3, "basis": "Z", "mode": "hard",
                          "naive": { "pL": 0, "lo": 0, "hi": 0 }, "learned": { "pL": 0, "lo": 0, "hi": 0 } }],
  "params": {}, "provenance": {}
}
```

**Stage 4 v2.** Adds to each platform `P`: `"tradeoff": { "<d>": { "hard": { "tau": [], "roundsPerSecond": [], "perRound": [], "lo": [], "hi": [] }, "soft": {...} } }` and `"budgetAtOptimum": { "readout", "idle", "crosstalk", "gate", "tau_us" }`. Adds `"framing"` (string). Sensitivity rows add `"effect": { "perRound_d3_hard": { "trapped-ion": n, "superconducting": n }, "tauLog_d3_hard": { ... } }`; `sensitivityBaseline` gets the same. `conclusions` holds `C1`–`C6` and `O4`, each `{ "statement", "verdict": "held" | "refuted" | "undetermined", "automated", "note", "plain" }`.

**C3 dominance rule.** At each arm's τ*_log (d = 3, hard, learned): arm A dominates if its error per round is lower beyond the intervals and its rounds per second higher. C3 is "held" if neither dominates, "refuted" if one does.

---

## Appendix U5 — Parameter-card additions

`params/ion.json`:

```json
"T2_idle_us": { "value": null, "source": "<source, or UNSOURCED (illustrative)>" },
"crosstalk_rate_per_us": { "value": null, "source": "<measured crosstalk error per detection on a neighbouring ion, converted to a rate over the detection time; or UNSOURCED (illustrative)>" },
"crosstalk_scan_per_us": { "value": [0, 1e-6, 1e-5, 1e-4, 1e-3], "source": "scan grid spanning shielded to unshielded same-species chains; illustrative" }
```

`params/sc.json`:

```json
"T2_us": { "value": null, "source": "<source, or UNSOURCED (illustrative)>" }
```

`params/cycle.json`, trapped ion:

```json
"gate_layers_per_round": { "value": "2*(d-1)", "source": "<source for sequential two-qubit gates on one chain, or: conservative choice, see DECISIONS E8>" }
```

Also fix the superconducting `reset_us` source still marked "check against the paper" (A28 item 7).

Search the literature for each value before using the UNSOURCED label; record the search in E6/E7 either way. A value labelled UNSOURCED is shown with the badge on the page.

---

## Appendix U6 — Review and fix prompts

Use v1's review prompt (Appendix T5 of `signal-to-syndrome-team-checklist-v1.md`) with these additions at the end:

```text
5. v2 specifics: the naive path is unchanged bit for bit (V9 hash); the diagonal edge geometry (k, j+1)-(k+1, j) and its never-observable flag; the boundary-rate solve in dem.js; the X-basis circuit (ancilla H, CX ancilla -> data, H, measure; data H before the final measurement); the idle formulas per basis and T2 <= 2*T1; no number shown on the page without a results source; no internal codes in visible text; the framing "two readout physics models at fixed gate noise".
```

The fix prompt is v1's, unchanged.

---

## Appendix U7 — Interface specification

### U7.1 Visual language (tokens)

- `tokens.css` defines: colours for d = 3 / 5 / 7 (`--d3`, `--d5`, `--d7`), hard / soft (`--hard`, `--soft`, also solid against dashed lines), trapped ion / superconducting (`--ion`, `--sc`, also circle against square markers), bit-flip / phase-flip (`--zbasis`, `--xbasis`), budget segments (`--b-readout`, `--b-idle`, `--b-xt`, `--b-gate`); spacing scale 4/8/16/24/32 px; type scale 14/16/20/28/40 px; chart heights 320 px desktop, 260 px narrow.
- Every chart uses the tokens; the same quantity has the same colour and shape everywhere.
- Numbers: 2–3 significant figures; powers of ten as superscripts in text and tables.
- Fewer gridlines: major ticks only.

### U7.2 Hero panel

- Above the level tabs. Large question: "How long should you listen to a qubit?"
- Controls: one τ slider (snaps to the platform's grid points), a trapped ion / superconducting toggle.
- One chart, shared log τ axis: readout error (empirical assignment error) and logical error (d = 3, hard; learned decoder when the results contain it, otherwise naive), each with a dot at the current τ.
- Shaded band between τ*_log and τ*_phys(empirical), labelled "listening longer costs more than it gains here" when τ*_log < τ*_phys; when the two coincide within intervals, no band and the label "here the best readout is also the best for the code".
- Live sentence, three templates: below both optima ("Too short: the readout itself is still unreliable."), between them ("At {τ} you read better, but your data qubits lose more than you gain."), above both ("Too long: the waiting costs more than the clearer signal is worth.").
- A "Go deeper" link scrolls to Level 3.
- Keyboard: slider and toggle reachable; the live sentence in an `aria-live="polite"` region; a values table under the chart.

### U7.3 Text cut

- Each level: a one-line goal at the top and a one-line takeaway card shown when the player finishes (or scrolls past the main interaction).
- At most two sentences visible per level besides the goal; everything else in "Explain more" (`<details>`).
- Plain labels: "logical error (chance the stored bit is lost)", "readout error (chance one measurement is wrong)", "readout time".
- Forbidden in visible text (checked by the release check): "belief model", "bank shot", "layer r", "CC-", "Person A", "Person B", "stub", "fixture". Use "the readout model's own estimate" for the belief model.

### U7.4 Level 1 game

- Data readouts hidden until the player answers; checks shown as lit or not.
- Ten shots per game; ε rises every three shots: 0.01, 0.02, 0.05, 0.08 (the tenth shot at 0.12).
- Score: player against decoder; streak counter.
- After each answer: highlight the flipped data qubit (or "no flip") and the checks it lit, for 1.5 s (no animation under reduced motion), with one sentence of reason.
- Wording for a one-round level: "check 2 misfired" instead of round language.

### U7.5 Level 3 additions

- Error-budget bar beside the curves: stacked readout / idle / crosstalk (ion, when on) / gate, at the current τ, labelled "error sources per round, per qubit (approximate)", with a values table.
- Distance selector (d = 3 / 5 / 7): only that d's τ*_log marker, plus τ*_phys and the current τ; labels never overlap (stagger vertically, or put them in a legend row).
- Challenge: "Set τ to minimise logical error" with a "Lock in" button; score bands by pL(chosen)/pL(min): ≤ 1.1 "spot on", ≤ 1.5 "close", else "try again"; the true optimum is revealed after locking in.

### U7.6 "Learn the noise"

Three steps, each one screen, with Back/Next:

1. **Inject a fault.** A circuit timeline for d = 3, one round shown in detail: data qubits as rows, the four CNOTs in circuit order (check 0: data 0 then data 1; check 1: data 1 then data 2). Clickable fault slots on each data qubit: "before the round", "between its two CNOTs" (data 1 only at d = 3), "after the round". Choosing "between" on data 1 lights detectors (k, 1) and (k+1, 0) on the space-time grid beside it: a diagonal pair. Rule for faultDetectors: a fault on data qubit i in round k at "mid" flips m[k][i] (the later check in that round) and m[k'][i-1], m[k'][i] for every k' > k, and x[i]; at "before" it flips both checks of qubit i from round k on, and x[i]; at "after" (k = r-1 only) it flips x[i] only.
2. **Hit the limit.** "Ask the naive decoder": decode the pair on the naive graph; draw its two-edge path and show the cost of two errors against one; caption "The naive decoder has no single error that explains this pattern, so it invents two."
3. **Reveal and pay off.** The p_ij heatmap of the selected bank (selector: d = 5, r = 5 and d = 7, r = 3; Z or X basis when phaseFlip is on), detector order by layer then check, the diagonal band labelled; beside it the space-time lattice with edge thickness proportional to p. A single toggle "naive graph / learned graph"; a large number shows the logical error for the selected arm and readout time from `decoderComparison` (naive → learned, with the factor) and, in small print, the out-of-sample check from `outOfSample`.

Accessibility: the heatmap has a table alternative (top 10 pairs by p plus the class means); the lattice has a text summary.

### U7.7 Level 5 v2

- Title "Two readout models, same gates"; caption: the `framing` string.
- Trade-off plot: x = rounds per second (log), y = error per round (log); one curve per (arm, d), points along τ, τ*_log points enlarged; hard/soft toggle. A tab "Per µs" keeps today's chart.
- Budget bars: one stacked bar per arm at its τ*_log (`budgetAtOptimum`).
- Hypothesis scoreboard: rows C1–C6 and O4, each with `plain`, a badge (held / refuted / undetermined, with icon and text, not colour alone) and an expander with `statement` and `note`.
- Tornado chart: for each parameter, the change in per-round error at d = 3 hard for each arm when scaled by 0.5 and 2, sorted by largest absolute effect.
- Every old table inside a "Data" expander.

### U7.8 Level 2 sandbox

- d = 3, r = 3 grid. Click a data qubit between rounds to inject a flip (lights the horizontal pair, or a single detector at the ends); click a check report to make it misreport (vertical pair). A clear button.
- "Draw a matching": click two lit detectors, or a detector and the boundary, to pair them; the path is the shortest one; show the player's total cost and logical outcome against the decoder's (learned weights).

### U7.9 Global basis toggle

- Header switch "Bit-flip memory / Phase-flip memory". It swaps every results source in the hero and Levels 3–5 to its `*_x` counterpart, every label "bit flip" to "phase flip", and the idle text from T1 to T2. Levels 1–2 stay in the bit-flip memory and say so when the toggle is on.

### U7.10 Guided tour

- A "3-minute tour" button in the header; stops: hero, Level 3 budget bar, "Learn the noise" step 3, Level 5 scoreboard; one caption each (≤ 25 words); Next, Back, Escape; focus moves to each target; no auto-advance.

### U7.11 Curated Level 4 examples

- `tools/curate.mjs`: bank `rep_d3_r3_L0`, ion readout at τ = 3 µs, learned decoder, seed 20261011, first 4,000 shots, R = 1; record up to 10 shot indices (with their readout seeds) where hard fails and soft succeeds, and 10 where soft fails and hard succeeds; write `data/curated/curated_shots.json`.
- Level 4 buttons: "Show me a shot where soft decoding saves the bit" and "…where it fails".

### U7.12 Live-run panel

- States: idle, submitting, running (elapsed timer), done, error; the button stays focusable (`aria-disabled`).
- When done: detector rate and logical error of the fresh shots against the stored bank, with intervals, and one sentence on whether they agree.

### U7.13 Motion

- Level 3: IQ points or photon counts accumulate over 600 ms when τ changes. Level 2: detectors light in time order over 400 ms when a shot loads. Hero: the dots glide between grid points.
- Every animation is skipped under `prefers-reduced-motion: reduce`.

---

## Appendix U8 — Disclosure and email templates

**Email to the organizers (K0).**

```text
Subject: Signal to Syndrome (team <name>): question about work done before the build window

Hello,

We are <names>, registered as team <name> at node <node>. We want to be open about our project's history before the window and ask how you want us to handle it.

Our repository shows that we built a first version of our project, Signal to Syndrome (a Qollab lab on how qubit readout physics sets the logical error of a repetition-code memory, on IonQ's simulator with the forte-1 noise model), between 7 and 9 October, before the window opened at 19:00 ET on 9 October. The git history is unedited and we will share it on request. During the window we plan to add, as clearly separated work starting at a tagged commit: a learned detector error model, a phase-flip memory, measurement crosstalk on trapped ions, a reworked platform comparison and a redesigned interface.

Is it acceptable to submit the project with this history fully disclosed, judged on the work done inside the window? If not, please tell us what you would accept.

Thank you,
<names>
```

**README, Variant B (pending the reply; use from K0).**

```text
## Build history and disclosure

- The first version of this project (git tags sp1-sp4) was built between 7 and 9 October 2026, before the hackathon's build window opened on 9 October 2026 at 19:00 ET. We have disclosed this to the organizers and are awaiting their answer. The git history is unedited.
- Work done inside the window starts at tag window-start (commit <hash>) and consists of: <list from Section 1.1>.
- Planning documents in docs/ (the v1 plan and checklists, written before the window, and the v2 checklists, written inside it) are disclosed as such.
- AI assistance: the code was generated with Claude Code (Anthropic), an AI coding assistant, from prompts in the checklists, under the authors' direction; every change was reviewed by the authors and checked by tests and the validation checks V1-V16.
- The physics, the parameter choices and sources, and the conclusions are the authors' responsibility.
```

**README, Variant A (after the organizers accept).** As Variant B, with the first bullet replaced by: "The first version of this project (git tags sp1-sp4) was built between 7 and 9 October 2026, before the build window. We disclosed this to the organizers on <date>; their answer: <one-line summary>. The git history is unedited."

---

## Appendix U9 — Demo-video script (2:00)

| Time | Screen | Narration (spoken) |
|---|---|---|
| 0:00–0:20 | Hero question | "To read a qubit you listen to it. Listen longer and the readout gets cleaner, but the rest of the code keeps ageing. How long should you listen?" |
| 0:20–0:50 | Hero slider, superconducting, then trapped ion | Move τ through the band. "The best readout time for one qubit is not the best for the code. Here it's earlier, because the waiting data qubits lose more than the readout gains." |
| 0:50–1:20 | Level 3 budget bar | "Readout error shrinks, idle error grows, and the gate floor stays put. The optimum is where they balance." |
| 1:20–1:50 | "Learn the noise": fault, naive failure, heatmap, toggle | "IonQ's noise model creates errors our first decoder couldn't see. Learned from the data itself, the decoder makes several times fewer mistakes." |
| 1:50–2:00 | Level 5 scoreboard | "Two readout models, same gates. Open source on Qollab. Supported by Qollab and IonQ." |

---

## Appendix U10 — Hallway-test protocol

1. Three people not on the team, ideally one without a physics background. Fresh signed-out browser, desktop.
2. Say only: "This is a hackathon project. You have three minutes. Think aloud." Then stay silent; do not explain or help.
3. Note where they stall (over 10 s without acting), what they skip, what they read aloud, and any wrong conclusion.
4. At three minutes ask: "In one sentence, what did this project find?" Write the answer verbatim.
5. Pass: two of three give roughly "listening longer helps readout but can hurt the code, and the decoder has to learn IonQ's real noise". Fix the top three findings, text cuts before features.

---

## Appendix U11 — Optional statistics work (only if the buffer allows)

In this order, each as a FIX-style prompt for Person A:

1. **Cluster bootstrap for every interval.** Replace Wilson intervals on pooled readout redraws (n = 4 × 8,000) with a bootstrap over quantum shots (B = 200), the same as τ*. Rerun Stages 2–4; update notes and page.
2. **Ring-up in the superconducting belief model.** Use the tabulated ring-up mean for μ₀, μ₁ in the likelihoods; V10 with ring-up on must pass; τ*_phys then has a single value.
3. **Dense τ grid near the superconducting optimum.** Add 0.55, 0.6, 0.65, 0.75, 0.8, 0.85, 0.9, 1.1, 1.2 µs; bootstrap τ*_phys as well; report the gap τ*_phys − τ*_log with an interval.

*This effort is supported by Qollab & IonQ.*
