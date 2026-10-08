# Notes on results

Working notes by Person A: every number here comes from `data/results/*.json` or from the console output of `tools/sweep.mjs`, and states its source. The project page (`docs/project_page.md`) quotes only from this file, `DECISIONS.md` and `data/results/*.json`. Intervals are Wilson 95% unless stated otherwise.

## Stage 1: flat readout (F0)

Source: `data/results/stage1_flat.json` and the console output of `node tools/sweep.mjs --stage 1` (Wed 7 Oct 2026). Banks: `rep_d{3,5,7}_r3_L{0,1}.json` (IonQ simulator, forte-1 noise, native gates, 4000 shots each). Readout: flat model, the same flip probability ε for every ancilla and data measurement, no idle errors. Decoding: hard mode, exact matching (no non-exact matchings), pGate calibrated per bank. Each point pools L0 and L1, so n = 8000.

### Logical error rate pL against ε (d = 3, 5, 7; r = 3)

| ε | d = 3 | d = 5 | d = 7 |
|---|---|---|---|
| 0 | 0.0289 [0.0254, 0.0328] | 0.0035 [0.0024, 0.0051] | 0.0005 [0.0002, 0.0013] |
| 0.005 | 0.0044 [0.0031, 0.0061] | 0.0013 [0.0007, 0.0023] | 0.0001 [0.0000, 0.0007] |
| 0.01 | 0.0051 [0.0038, 0.0069] | 0.0015 [0.0009, 0.0026] | 0.0004 [0.0001, 0.0011] |
| 0.02 | 0.0091 [0.0073, 0.0115] | 0.0019 [0.0011, 0.0031] | 0.0005 [0.0002, 0.0013] |
| 0.03 | 0.0104 [0.0084, 0.0128] | 0.0015 [0.0009, 0.0026] | 0.0009 [0.0004, 0.0018] |
| 0.05 | 0.0188 [0.0160, 0.0220] | 0.0044 [0.0031, 0.0061] | 0.0010 [0.0005, 0.0020] |
| 0.08 | 0.0336 [0.0299, 0.0378] | 0.0116 [0.0095, 0.0142] | 0.0041 [0.0029, 0.0058] |
| 0.12 | 0.0596 [0.0546, 0.0650] | 0.0255 [0.0223, 0.0292] | 0.0096 [0.0077, 0.0120] |

What the figure shows:

- **Distance helps at every ε.** At every grid point pL is ordered d = 3 > d = 5 > d = 7. The curves do not cross up to ε = 0.12, so the flat-readout threshold lies above ε = 0.12 at this gate-noise level.
- **Gate-noise floor.** For d = 5 and 7, pL stays roughly flat from ε = 0.005 to 0.03 (d = 5: 0.0013 to 0.0019; d = 7: 0.0001 to 0.0009), within overlapping intervals. Below about ε = 0.03 the simulator's gate noise (pGate ≈ 0.013) dominates over readout. Above ε ≈ 0.05 pL rises steeply at every distance.
- **The ε = 0 point is high**, most visibly at d = 3 (0.0289 against 0.0044 at ε = 0.005). At ε = 0 every edge weight is equal, so the decoder sees many tied matchings, and our tie-break toward observable parity 0 (DECISIONS.md, Person B, V2 note) seems to pick the wrong one more often. d = 5 (0.0035 against 0.0013) shows the same rise, smaller. Treat ε = 0 as a decoder tie artefact, not as physics. It is handed to Person B (DECISIONS.md, Person A notes). Stages 2 and 3 never have exactly zero readout error.

### Validation checks (C19)

| Check | Result | Outcome |
|---|---|---|
| V1, flat flip rate at ε = 0.05 | 0.04936 [0.04842, 0.05032] from 200 000 draws (seed 101); within 4 binomial standard errors of 0.05 | **Pass** |
| V5, gate-noise floor across banks | Bulk detector firing rate (readout off): d3 r3 0.0481 / 0.0476 (L0 / L1), d5 r3 0.0506 / 0.0502, d5 r5 0.0490 / 0.0507, d7 r3 0.0501 / 0.0533; d3 r1 0.0195 / 0.0200 (layer 0 only, so not comparable). pGate 0.0124 to 0.0139 for r ≥ 3, 0.0049 to 0.0051 for r = 1. All well below 0.1 | **Pass.** L0 and L1 intervals overlap for every (d, r) except d7 r3 (0.0501 [0.0482, 0.0521] against 0.0533 [0.0514, 0.0554]; the intervals just miss, a difference of ~6% in rate) |
| V6, L0 against L1 logical error | Hard mode, r = 3, every ε and d: the L0 and L1 intervals overlap at all 24 points. Largest gaps: d = 5 at ε = 0.01 (L0 0.00225 [0.00118, 0.00427] against L1 0.00075 [0.00026, 0.00220]) and d = 7 at ε = 0.03 (0.00150 against 0.00025) | **Pass**, no significant asymmetry |
| F0 shape (C19 check 4) | At ε = 0, pL falls with d: 0.0289 → 0.0035 → 0.0005. At large ε the curves rise together without crossing | **Pass** (the ε = 0 level itself is the tie artefact above) |
| Soft equals hard for the flat model | rep_d3_r3_L0 at ε = 0.05: k = 80 of 4000 in both modes. Expected: every flat measurement has the same \|llr\|, so soft and hard weights agree | **Pass** |
| V9 fingerprint | `diagnostic(rep_d3_r3_L0)` = **`e80b58c8`** (`node tools/sweep.mjs --diag`) | Recorded; to be compared on the local preview (C21) and on Qollab (C22) |

### Method change during Stage 1

The checklist rule gave time-like edges the readout probability only. That made them almost unusable at small ε, and pL at ε ≤ 0.01 came out near 0.03 for every distance. Time-like edges now use p = xorP(pGate, pRead), consistent with `calibrate.js`. See DECISIONS.md (Person A notes, Wed 7 Oct) for the reason and the before/after numbers.

### Provenance caveat

`stage1_flat.json` records commit `d4688ca` ("All banks"), which was HEAD at both runs (11:14 and 11:18 UTC, Wed 7 Oct). That commit does not yet contain `src/core/sweep.js` or `tools/sweep.mjs`. Order to fix it: commit the code, rerun `node tools/sweep.mjs --stage 1`, then commit the results. The second run reproduced every number and the V9 hash exactly (all seeds are fixed), so the rerun changes only the commit and date in the provenance.

## Stage 2: trapped-ion readout

Source: `data/results/stage2_ion.json` and the console output of `node tools/sweep.mjs --stage 2` (Thu 8 Oct 2026; two runs, identical output, ~45–65 s each). Readout: `createIonReadout(params/ion.json, τ)` (Crain et al. 2019 lab values, not Forte values; see DECISIONS A15). Banks: `rep_d{3,5,7}_r3_L{0,1}.json`, L0 and L1 pooled. pGate calibrated per bank with readout off (0.0124 to 0.0139). R = 4 readout draws per quantum shot, so n = 32 000 per point; hard and soft see the same readout draws. No non-exact matchings. τ*_log: bootstrap over quantum shots, B = 200, 95% percentile interval; the minimum is located by a parabola in ln τ through the lowest grid point and its two neighbours (`src/core/optimum.js`).

### Validation (V7, V10)

| Check | Result | Outcome |
|---|---|---|
| V7, both gammas 0: empirical assignment error (200 000 truth samples per τ) against the analytic Poisson tails at nTh | Agreement within 4 binomial SE at all 13 grid points. E.g. τ = 5: 0.0472 analytic, 0.0472 empirical; τ = 10: 4.48e-3 against 4.53e-3; τ = 20: 8.2e-5 against 6.5e-5. From τ = 50 the analytic error is below 1e-8 and no errors were drawn | **Pass** |
| V10, llr calibration (card values with pumping; belief equals truth because the belief model integrates the same at-most-one-switch process the sampler draws), samples pooled over the τ grid | \|llr\| in [0, 1): 0.3359 observed against 0.3363 predicted (m = 301 406); **[1, 2): 0.1965 against 0.1957 (m = 124 883)**; [2, 4): 0.0610 against 0.0604; [4, 8): 0.00183 against 0.00179. All within 4 SE | **Pass** |
| F1 belief against truth (card with pumping) | Belief error inside or within 4 SE of the empirical Wilson interval at every τ | **Pass** |

Deviation: the checklist states V10 with both gammas 0. With the card's rates and no pumping the llr is so large that the [1, 2) bin is nearly empty, so V10 was run with pumping on, where belief still equals truth.

### F1-ion: assignment error against τ

| τ (µs) | 1 | 3 | 5 | 10 | 15 | **20** | 30 | 50 | 100 | 200 | 500 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Belief, with pumping | 0.312 | 0.122 | 0.0475 | 4.9e-3 | 9.2e-4 | **5.9e-4** | 6.5e-4 | 8.6e-4 | 1.4e-3 | 2.3e-3 | 4.8e-3 |
| Empirical (Wilson 95%) | 0.311 | 0.122 | 0.0480 | 4.9e-3 [4.6, 5.2]e-3 | 9.8e-4 [8.5e-4, 1.1e-3] | 5.7e-4 [4.8e-4, 6.9e-4] | 7.0e-4 [5.9e-4, 8.2e-4] | 9.4e-4 [8.1e-4, 1.1e-3] | 1.3e-3 [1.2e-3, 1.5e-3] | 2.3e-3 [2.1e-3, 2.6e-3] | 5.0e-3 [4.7e-3, 5.3e-3] |
| Belief, no pumping | 0.312 | 0.121 | 0.0472 | 4.5e-3 | 4.5e-4 | 8.2e-5 | 5.4e-6 | 8.5e-9 | 4e-16 | 9e-31 | 2e-74 |

- **With pumping the assignment error has an interior minimum: τ*_phys = 23.5 µs** (fitted error 5.4e-4; grid minimum at 20 µs). It then rises about 8× by 500 µs, driven by dark→bright pumping (DECISIONS A15).
- **Without pumping it falls monotonically**: no interior minimum (lowest at the grid end, 500 µs). This matches the A15/CC-A4 expectation.

### F2-ion: logical error against τ (r = 3, Wilson 95%)

| τ (µs) | d3 hard | d3 soft | d5 hard | d5 soft | d7 hard | d7 soft |
|---|---|---|---|---|---|---|
| 1 | 0.3523 | 0.1475 | 0.3764 | 0.0784 | 0.3944 | 0.0503 |
| 2 | 0.1832 | 0.0541 | 0.1706 | 0.0280 | 0.1618 | 0.0134 |
| 3 | 0.0895 | 0.0280 | 0.0623 | 0.0116 | 0.0480 | 0.0035 |
| 5 | 0.0217 [0.0202, 0.0233] | 0.0229 [0.0213, 0.0246] | 0.0077 | 0.0038 | 0.0031 | 0.0010 |
| 7 | 0.0081 [0.0071, 0.0091] | 0.0110 [0.0099, 0.0122] | 0.0016 [0.0012, 0.0021] | 0.0021 [0.0017, 0.0027] | 0.0004 | 0.0004 |
| 10 | 0.0039 [0.0033, 0.0047] | 0.0076 [0.0067, 0.0086] | 0.0010 [0.0007, 0.0015] | 0.0018 [0.0014, 0.0024] | 0.0001 [0.0000, 0.0003] | 0.0004 [0.0002, 0.0007] |
| 20 | 0.0034 [0.0029, 0.0041] | 0.0071 [0.0062, 0.0080] | 0.0008 [0.0006, 0.0012] | 0.0015 [0.0011, 0.0020] | 0.0002 [0.0001, 0.0004] | 0.0004 [0.0002, 0.0007] |
| 50 | 0.0034 [0.0029, 0.0041] | 0.0065 [0.0057, 0.0074] | 0.0009 [0.0006, 0.0013] | 0.0014 [0.0011, 0.0019] | 0.0004 | 0.0003 |
| 100 | 0.0035 [0.0029, 0.0042] | 0.0056 [0.0049, 0.0065] | 0.0009 | 0.0015 | 0.0003 | 0.0003 |
| 200 | 0.0038 [0.0032, 0.0045] | 0.0056 [0.0049, 0.0065] | 0.0009 | 0.0012 | 0.0003 | 0.0003 |
| 500 | 0.0039 [0.0033, 0.0047] | 0.0058 [0.0050, 0.0067] | 0.0011 [0.0008, 0.0015] | 0.0012 [0.0008, 0.0016] | 0.0003 | 0.0003 |

Full series (all 13 grid points, all intervals) are in `stage2_ion.json`.

### C2 (soft at or below hard at every τ): **fails**

Soft is at or below hard (point estimates) at only 14 of 39 points, and above hard beyond the intervals at 10 of them.

- **Short τ (1–3 µs, photon-starved): soft wins strongly**, by 2–14×. Example: d = 7 at τ = 1 gives 0.050 against 0.394. Here a count of 0 is ambiguous and the llr tells the decoder so.
- **τ ≥ 7 µs (τ ≥ 5 µs at d = 3): soft loses.**
  - d = 3: soft is above hard beyond the intervals at every τ from 7 to 500 µs (9 points), by up to 2× (τ = 20: 0.0071 [0.0062, 0.0080] against 0.0034 [0.0029, 0.0041]).
  - d = 5: soft is above hard (point estimates) at every τ from 7 to 500 µs, beyond the intervals only at τ = 15.
  - d = 7: the intervals overlap at every τ ≥ 5 µs.
- **Diagnosis (single-shot probe, rep_d3_r3_L0, τ = 20; soft 41 errors against hard 13 of 4000):**
  - Once τ ≳ 5 µs, readout errors (≈ 6e-4) are tiny next to gate errors (pGate ≈ 0.0125). Every candidate matching then costs almost the same, about ln(1/pGate) ≈ 4.37 per edge, with differences of about 0.01.
  - Soft breaks these near-ties using small differences between readout llrs. Hard gives all readout edges a slightly higher p than bulk gate edges, so it breaks them toward time-like and final-layer edges. That choice evidently fits the simulator's actual noise better.
  - The likely root cause is the uniform-pGate edge model in `src/core/sweep.js` (every edge gets the same gate probability), not the readout model; V10 shows the llr is calibrated. Not changed; any fix (e.g. per-edge-class gate calibration) is a separate decision and would change Stage 1 numbers too.

### τ*_log per distance (C1, ion part)

| d | Mode | τ*_log (µs) | 95% bootstrap interval | Replicates at an edge |
|---|---|---|---|---|
| 3 | hard | **21.8** | [20.0, 87.5] | 0% |
| 3 | soft | 141 | [102, 500] | 19% |
| 5 | hard | **22.9** | [12.0, 206] | 0% |
| 5 | soft | 316 | [22, 500] | 40% |
| 7 | hard | 11.8 | [11.2, 12.3] (too narrow, see below) | 0% |
| 7 | soft | 224 | [12, 500] | 9% |

- **Every curve has an interior minimum on the full data, but the minima are shallow.** From τ = 10 to 500 µs the hard pL stays inside overlapping intervals at every distance (d = 3: 0.0034 to 0.0039). So the logical error is flat over 10–500 µs at this sample size; τ*_log is located only loosely.
- **Hard mode: τ*_log ≈ τ*_phys.** d = 3 gives 21.8 and d = 5 gives 22.9, against τ*_phys = 23.5 µs, which lies inside both intervals. The logical optimum follows the readout (pumping) optimum.
- **The d = 7 hard interval is not trustworthy.** It rests on 3 to 13 errors per grid point, and the minimum hangs on τ = 10 µs (3 errors of 32 000). The bootstrap measures how the fitted vertex moves, not the grid coarseness.
- **Soft-mode minima sit at long τ, with 9–40% of replicates at the grid end,** so they are not resolved. That follows from soft losing at τ ≥ 7 µs (C2 above).

**C1, ion part: holds.** There is no idle-driven optimum. The idle flip probability is 0.5 (1 − e^(−τ/T1)) ≤ 2.5e-5 at every grid point, 20× below the readout error at τ*_phys. The hard-mode τ*_log coincides with τ*_phys, which is set by dark→bright pumping. Beyond about 10 µs the logical error is limited by the gate-noise floor, not by τ.

### Compared with the A15 / CC-A4 expectation

- τ*_phys near 20 µs: as computed in CC-A4 (grid minimum 20 µs, fitted 23.5 µs).
- No idle-driven minimum: as expected.
- The surprise is C2. Soft decoding helps only when readout is photon-starved (τ ≤ 3 µs), and hurts slightly once readout is far better than the gates, because the decoder's uniform gate-noise model makes nearly every matching cost the same.

### Provenance caveat

`stage2_ion.json` records commit `8c26fbe` (CC-A4), which does not yet contain `src/core/optimum.js` or the `--stage 2` code. Same fix as Stage 1: commit the code, rerun `node tools/sweep.mjs --stage 2` (all seeds are fixed; the output was reproduced exactly), then commit the results.

## Stage 3: superconducting readout

Not measured yet (CC-12). To record: V4, V8, V10; F1-sc and F2-sc; τ*_phys and τ*_log.

## Hypotheses C1–C4

Not evaluated yet. Stage 1 bears on none of them directly; it fixes the gate-noise floor (pGate ≈ 0.013) against which the readout effects of Stages 2 and 3 are measured.
