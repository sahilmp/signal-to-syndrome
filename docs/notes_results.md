# Notes on results

Working notes by Person A: every number here comes from `data/results/*.json` or from the console output of `tools/sweep.mjs`, and states its source. The project page (`docs/project_page.md`) quotes only from this file, `DECISIONS.md` and `data/results/*.json`. Intervals are Wilson 95% unless stated otherwise.

## Stage 1: flat readout (F0)

Source: `data/results/stage1_flat.json` and the console output of `node tools/sweep.mjs --stage 1` (rerun Thu 8 Oct 2026 after the B14 review fixes; two runs, identical output). The rerun changed the numbers below slightly, within their intervals: idle errors are now drawn before readout (DECISIONS, Person A, M1), which reorders the random draws even though the flat model has no idle errors. Banks: `rep_d{3,5,7}_r3_L{0,1}.json` (IonQ simulator, forte-1 noise, native gates, 4000 shots each). Readout: flat model, the same flip probability ε for every ancilla and data measurement, no idle errors. Decoding: hard mode, exact matching (no non-exact matchings), pGate calibrated per bank. Each point pools L0 and L1, so n = 8000.

### Logical error rate pL against ε (d = 3, 5, 7; r = 3)

| ε | d = 3 | d = 5 | d = 7 |
|---|---|---|---|
| 0 | 0.0289 [0.0254, 0.0328] | 0.0035 [0.0024, 0.0051] | 0.0005 [0.0002, 0.0013] |
| 0.005 | 0.0045 [0.0033, 0.0062] | 0.0013 [0.0007, 0.0023] | 0.0001 [0.0000, 0.0007] |
| 0.01 | 0.0049 [0.0036, 0.0067] | 0.0015 [0.0009, 0.0026] | 0.0004 [0.0001, 0.0011] |
| 0.02 | 0.0069 [0.0053, 0.0089] | 0.0021 [0.0013, 0.0034] | 0.0001 [0.0000, 0.0007] |
| 0.03 | 0.0116 [0.0095, 0.0142] | 0.0020 [0.0012, 0.0032] | 0.0004 [0.0001, 0.0011] |
| 0.05 | 0.0190 [0.0162, 0.0222] | 0.0059 [0.0044, 0.0078] | 0.0011 [0.0006, 0.0021] |
| 0.08 | 0.0376 [0.0337, 0.0420] | 0.0124 [0.0102, 0.0150] | 0.0040 [0.0028, 0.0056] |
| 0.12 | 0.0617 [0.0567, 0.0672] | 0.0270 [0.0237, 0.0308] | 0.0107 [0.0087, 0.0133] |

What the figure shows:

- **Distance helps at every ε.** At every grid point pL is ordered d = 3 > d = 5 > d = 7. The curves do not cross up to ε = 0.12, so the flat-readout threshold lies above ε = 0.12 at this gate-noise level.
- **Gate-noise floor.** For d = 5 and 7, pL stays roughly flat from ε = 0.005 to 0.03 (d = 5: 0.0013 to 0.0021; d = 7: 0.0001 to 0.0004), within overlapping intervals. Below about ε = 0.03 the simulator's gate noise (pGate ≈ 0.013) dominates over readout. Above ε ≈ 0.05 pL rises steeply at every distance.
- **The ε = 0 point is high**, most visibly at d = 3 (0.0289 against 0.0045 at ε = 0.005). At ε = 0 every edge weight is equal, so the decoder sees many tied matchings, and our tie-break toward observable parity 0 (DECISIONS.md, Person B, V2 note) seems to pick the wrong one more often. d = 5 (0.0035 against 0.0013) shows the same rise, smaller. Treat ε = 0 as a decoder tie artefact, not as physics. It is handed to Person B (DECISIONS.md, Person A notes). Stages 2 and 3 never have exactly zero readout error.

### Validation checks (C19)

| Check | Result | Outcome |
|---|---|---|
| V1, flat flip rate at ε = 0.05 | 0.04936 [0.04842, 0.05032] from 200 000 draws (seed 101); within 4 binomial standard errors of 0.05 | **Pass** |
| V5, gate-noise floor across banks | Bulk detector firing rate (readout off): d3 r3 0.0481 / 0.0476 (L0 / L1), d5 r3 0.0506 / 0.0502, d5 r5 0.0490 / 0.0507, d7 r3 0.0501 / 0.0533; d3 r1 0.0195 / 0.0200 (layer 0 only, so not comparable). pGate 0.0124 to 0.0139 for r ≥ 3, 0.0066 to 0.0068 for r = 1 (inverted with 3 edges per layer-0 detector since Thu 8 Oct; the 4-edge inversion gave 0.0049 to 0.0051, see DECISIONS, Person A, m1). All well below 0.1 | **Pass.** L0 and L1 intervals overlap for every (d, r) except d7 r3 (0.0501 [0.0482, 0.0521] against 0.0533 [0.0514, 0.0554]; the intervals just miss, a difference of ~6% in rate) |
| V6, L0 against L1 logical error | Hard mode, r = 3, every ε and d: the L0 and L1 intervals overlap at all 24 points. Largest relative gaps: d = 5 at ε = 0.005 (L0 0.00175 [0.00085, 0.00361] against L1 0.00075 [0.00026, 0.00220]) and d = 7 at ε = 0.05 (0.00075 against 0.00150) | **Pass**, no significant asymmetry |
| F0 shape (C19 check 4) | At ε = 0, pL falls with d: 0.0289 → 0.0035 → 0.0005. At large ε the curves rise together without crossing | **Pass** (the ε = 0 level itself is the tie artefact above) |
| Soft equals hard for the flat model | rep_d3_r3_L0 at ε = 0.05: k = 80 of 4000 in both modes. Expected: every flat measurement has the same \|llr\|, so soft and hard weights agree | **Pass** |
| V9 fingerprint | `diagnostic(rep_d3_r3_L0)` = **`53933f98`** (`node tools/sweep.mjs --diag`, Thu 8 Oct). It was `e80b58c8` until the M1 idle-order change (DECISIONS, Person A, M1) | Recorded; the local-preview (C21) and Qollab (C22) comparisons must be redone against the new hash |

### Method change during Stage 1

The checklist rule gave time-like edges the readout probability only. That made them almost unusable at small ε, and pL at ε ≤ 0.01 came out near 0.03 for every distance. Time-like edges now use p = xorP(pGate, pRead), consistent with `calibrate.js`. See DECISIONS.md (Person A notes, Wed 7 Oct) for the reason and the before/after numbers.

### Provenance caveat

`stage1_flat.json` records commit `df32781`, which was HEAD at both runs of Thu 8 Oct, but the code that produced it (the B14 review fixes) was not yet committed. Order to fix it: commit the code, rerun `node tools/sweep.mjs --stage 1`, then commit the results. The second run reproduced every number and the V9 hash exactly (all seeds are fixed), so the rerun changes only the commit and date in the provenance.

## Stage 2: trapped-ion readout

Source: `data/results/stage2_ion.json` and the console output of `node tools/sweep.mjs --stage 2` (rerun Thu 8 Oct 2026 after the B14 review fixes; two runs, identical output, ~26 s each). Since that rerun, idle errors act on the true bits before readout (DECISIONS, Person A, M1), and tied grid minima give the midpoint in ln τ instead of the first tied point (m3). The F1 and V7/V10 numbers do not go through the decoder and did not change; the F2, C2 and τ*_log numbers changed slightly. Readout: `createIonReadout(params/ion.json, τ)` (Crain et al. 2019 lab values, not Forte values; see DECISIONS A15). Banks: `rep_d{3,5,7}_r3_L{0,1}.json`, L0 and L1 pooled. pGate calibrated per bank with readout off (0.0124 to 0.0139). R = 4 readout draws per quantum shot, so n = 32 000 per point; hard and soft see the same readout draws. No non-exact matchings. τ*_log: bootstrap over quantum shots, B = 200, 95% percentile interval; the minimum is located by a parabola in ln τ through the lowest grid point and its two neighbours (`src/core/optimum.js`).

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
| Empirical (Wilson 95%) | 0.311 | 0.122 | 0.0480 | 4.9e-3 [4.6, 5.2]e-3 | 9.8e-4 [8.5e-4, 1.1e-3] | 5.7e-4 [4.7e-4, 6.8e-4] | 7.0e-4 [5.9e-4, 8.2e-4] | 9.4e-4 [8.1e-4, 1.1e-3] | 1.3e-3 [1.2e-3, 1.5e-3] | 2.3e-3 [2.1e-3, 2.6e-3] | 5.0e-3 [4.7e-3, 5.3e-3] |
| Belief, no pumping | 0.312 | 0.121 | 0.0472 | 4.5e-3 | 4.5e-4 | 8.2e-5 | 5.4e-6 | 8.5e-9 | 4e-16 | 9e-31 | 2e-74 |

- **With pumping the assignment error has an interior minimum: τ*_phys = 23.5 µs** (fitted error 5.4e-4; grid minimum at 20 µs). It then rises about 8× by 500 µs, driven by dark→bright pumping (DECISIONS A15).
- **Without pumping it falls monotonically**: no interior minimum (lowest at the grid end, 500 µs). This matches the A15/CC-A4 expectation.

### F2-ion: logical error against τ (r = 3, Wilson 95%)

| τ (µs) | d3 hard | d3 soft | d5 hard | d5 soft | d7 hard | d7 soft |
|---|---|---|---|---|---|---|
| 1 | 0.3525 [0.3473, 0.3577] | 0.1478 [0.1440, 0.1517] | 0.3767 [0.3714, 0.3820] | 0.0787 [0.0758, 0.0817] | 0.3945 [0.3891, 0.3998] | 0.0499 [0.0475, 0.0523] |
| 2 | 0.1837 [0.1795, 0.1880] | 0.0549 [0.0524, 0.0574] | 0.1703 [0.1662, 0.1745] | 0.0280 [0.0262, 0.0298] | 0.1618 [0.1578, 0.1658] | 0.0131 [0.0119, 0.0144] |
| 3 | 0.0896 [0.0865, 0.0928] | 0.0281 [0.0263, 0.0299] | 0.0625 [0.0599, 0.0652] | 0.0113 [0.0102, 0.0125] | 0.0480 [0.0457, 0.0504] | 0.0036 [0.0030, 0.0043] |
| 5 | 0.0217 [0.0201, 0.0233] | 0.0230 [0.0214, 0.0247] | 0.0076 [0.0067, 0.0086] | 0.0037 [0.0031, 0.0044] | 0.0031 [0.0025, 0.0037] | 0.0010 [0.0007, 0.0014] |
| 7 | 0.0082 [0.0072, 0.0092] | 0.0109 [0.0099, 0.0121] | 0.0017 [0.0013, 0.0022] | 0.0021 [0.0016, 0.0027] | 0.0004 [0.0002, 0.0007] | 0.0004 [0.0002, 0.0007] |
| 10 | 0.0040 [0.0034, 0.0048] | 0.0076 [0.0067, 0.0086] | 0.0010 [0.0007, 0.0014] | 0.0019 [0.0015, 0.0024] | 0.0001 [0.0000, 0.0003] | 0.0004 [0.0002, 0.0007] |
| 20 | 0.0035 [0.0029, 0.0042] | 0.0072 [0.0063, 0.0081] | 0.0008 [0.0006, 0.0012] | 0.0015 [0.0011, 0.0020] | 0.0002 [0.0001, 0.0004] | 0.0004 [0.0002, 0.0007] |
| 50 | 0.0035 [0.0029, 0.0042] | 0.0065 [0.0057, 0.0075] | 0.0009 [0.0006, 0.0013] | 0.0014 [0.0011, 0.0019] | 0.0004 [0.0002, 0.0007] | 0.0003 [0.0002, 0.0006] |
| 100 | 0.0035 [0.0029, 0.0042] | 0.0057 [0.0050, 0.0066] | 0.0009 [0.0006, 0.0013] | 0.0014 [0.0011, 0.0019] | 0.0003 [0.0001, 0.0005] | 0.0003 [0.0001, 0.0005] |
| 200 | 0.0039 [0.0033, 0.0047] | 0.0061 [0.0053, 0.0070] | 0.0009 [0.0006, 0.0013] | 0.0013 [0.0009, 0.0017] | 0.0003 [0.0001, 0.0005] | 0.0003 [0.0001, 0.0005] |
| 500 | 0.0039 [0.0033, 0.0047] | 0.0055 [0.0047, 0.0064] | 0.0011 [0.0008, 0.0015] | 0.0012 [0.0008, 0.0016] | 0.0003 [0.0002, 0.0006] | 0.0003 [0.0002, 0.0006] |

Full series (all 13 grid points, all intervals) are in `stage2_ion.json`.

### C2 (soft at or below hard at every τ): **fails**

Soft is at or below hard (point estimates) at only 13 of 39 points, and above hard beyond the intervals at 11 of them.

- **Short τ (photon-starved): soft wins strongly**, by 2–14×, at τ ≤ 3 µs at every d and also at τ = 5 µs at d = 5 and 7. Example: d = 7 at τ = 1 gives 0.050 against 0.394. Here a count of 0 is ambiguous and the llr tells the decoder so.
- **τ ≥ 7 µs (τ ≥ 5 µs at d = 3): soft loses.**
  - d = 3: soft is above hard beyond the intervals at every τ from 7 to 500 µs (9 points), by up to 2× (τ = 20: 0.0072 [0.0063, 0.0081] against 0.0035 [0.0029, 0.0042]).
  - d = 5: soft is above hard (point estimates) at every τ from 7 to 500 µs, beyond the intervals at τ = 10 and 15.
  - d = 7: the intervals overlap at every τ ≥ 7 µs.

#### Where the loss sits: L0 against L1

The pooled numbers hide a strong asymmetry between the logical states. Errors per 16 000 (4000 quantum shots × 4 readout draws) at d = 3, from `validation.perLogical`:

| τ (µs) | 1 | 2 | 3 | 5 | 7 | 10 | 15 | 20 | 30 | 50 | 100 | 200 | 500 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| L0 hard | 11 | 26 | 45 | 67 | 67 | 54 | 58 | 55 | 56 | 54 | 56 | 63 | 63 |
| L0 soft | 435 | 514 | 501 | 209 | 192 | 178 | 170 | 170 | 155 | 141 | 113 | 104 | 64 |
| L1 hard | 11 268 | 5854 | 2822 | 627 | 194 | 75 | 59 | 56 | 59 | 57 | 57 | 63 | 63 |
| L1 soft | 4295 | 1242 | 397 | 527 | 158 | 66 | 56 | 59 | 58 | 68 | 71 | 90 | 112 |

- **On L0, soft is worse than hard at every τ up to 100 µs at every d** (up to 200 µs at d = 3 and 5; level at 500 µs for d = 3). Hard is lopsided the other way at short τ: it reads a count of 0 as dark, which is right for L0 (bright_is_bit = 1, so L0 data are dark), so L0 is almost free for hard and L1 carries all of its short-τ errors.
- **On L1, soft wins at short τ, ties around 15–30 µs and loses from 50 µs on** (τ = 500: 112 against 63). So "the soft loss is on L0" holds only near τ = 20 µs; at long τ it moves to L1.
- **Why the side changes with τ.** Soft weights each readout edge by the llr of the count that was read. At τ = 20 µs a dark reading (n = 0, llr −7.1) gives p ≈ 8e-4, while a typical bright reading (n ≈ 9, llr ≈ 9) gives p ≈ 1e-4, so the matching prefers to explain defects through readout edges on dark-read qubits, the L0 data. At τ ≥ 50 µs the llr of intermediate counts sits on a plateau near ln(γ_b→d / γ_d→b) = 3.03 (a bright ion pumped dark during the window), p ≈ 0.05, so bright-read qubits (the L1 data) get the cheap edges instead.

#### Diagnosis: intrinsic asymmetry plus a gate-model mismatch

- **The per-logical asymmetry is intrinsic, not a bug.** Minimum-weight matching with correct priors minimises the error averaged over L, not the error for each L. On synthetic data drawn from the decoder's own edge model (every edge of the d = 3, r = 3 graph flips with pGate = 0.0125; ion card at τ = 5 µs; hard and soft on identical readout draws) soft is also worse on L0 and better on L1: L0 220 against 323 and L1 1742 against 1456 errors (hard, soft) of 40 000 each (Person A rerun of Person B's B14 check; Person B's own run: 182 / 336 and 1632 / 1260).
- **The evidence for a gate-model mismatch is the pooled rate.** On that model-matched data soft beats hard pooled (1962 against 1779 of 80 000, 9.0 paired SE; locked by a test in `tests/sweep.test.js`, 2 × 20 000 shots, about 7.8 paired SE). On the real banks soft loses pooled from τ ≈ 7 µs on. So the simulator's gate noise is not the decoder's model: one uniform pGate for every edge, and no correlated or diagonal circuit faults in the graph.
- **The soft code is correct.** `decode` is exact on soft weights: a brute force over all 2^18 edge subsets of the d = 3, r = 3 graph found 0 cost mismatches in 3000 shots (Person B, reproduced by Person A). A weight-table test pins every edge's p in hard and soft mode to known llrs. On one failing synthetic shot (Person B's s = 645) the exact generative posterior and the edge-model class posterior both give P(L = 0) = 0.4825; they agree by construction, so this checks the coding, not the model.
- **Single-shot probe (before the M1 change; at τ = 20 µs the idle flip probability is below 2e-6, so it does not matter): rep_d3_r3_L0, soft 41 errors against hard 13 of 4000.** Once τ ≳ 5 µs, readout errors (≈ 6e-4) are tiny next to gate errors (pGate ≈ 0.0125). Every candidate matching then costs almost the same, about ln(1/pGate) ≈ 4.37 per edge, with differences of about 0.01, and soft breaks these near-ties with small llr differences (the dark/bright bias above). Hard gives all readout edges the same slightly higher p, and that choice happens to fit the simulator's noise better.
- **Not changed.** A fix (for example per-edge-class gate rates from detector-pair correlations) touches `graph.js` and `calibrate.js`, so it is a joint decision, probably after the hackathon, and would change the Stage 1 numbers too.

### τ*_log per distance (C1, ion part)

Tied grid minima (several grid points with the same lowest error count) now give the midpoint in ln τ of the first and last tied points, not the first one (B14 review, m3); "Tied" is the fraction of bootstrap replicates with such a tie.

| d | Mode | τ*_log (µs) | 95% bootstrap interval | Replicates at an edge | Tied |
|---|---|---|---|---|---|
| 3 | hard | **31.6** (tie of 20 and 50) | [20.0, 81.2] | 0% | 21% |
| 3 | soft | none (lowest at 500) | [98, 500] | 67% | 5% |
| 5 | hard | **22.9** | [14.1, 189] | 0% | 34% |
| 5 | soft | none (lowest at 500) | [22, 500] | 68% | 7% |
| 7 | hard | 11.8 | [11.2, 44.7] (not resolved, see below) | 0% | 36% |
| 7 | soft | 181 | [45, 500] | 7% | 24% |

- **The hard minima are shallow.** From τ = 10 to 500 µs the hard pL stays inside overlapping intervals at every distance (d = 3: 0.0035 to 0.0040). So the logical error is flat over 10–500 µs at this sample size; τ*_log is located only loosely. At d = 3 the full-data minimum is an exact tie: 111 errors of 32 000 at both 20 and 50 µs, so τ*_log is their ln-midpoint, √(20 · 50) = 31.6 µs.
- **Hard mode: τ*_log ≈ τ*_phys.** τ*_phys = 23.5 µs lies inside the d = 3 interval [20.0, 81.2] and the d = 5 interval [14.1, 189] (d = 5 point estimate 22.9 µs). The logical optimum follows the readout (pumping) optimum, within wide intervals.
- **The d = 7 hard optimum is not resolved.** It rests on 3, 4 and 5 errors (of 32 000) at τ = 10, 15 and 20 µs. Hard-mode failures at τ ≥ 10 µs come from gate faults that fail the same quantum shots at every τ, so resampling shots barely moves the lowest point, and 36% of the replicates are ties. The interval reflects that, not a located optimum; the project page must not present it as one.
- **Soft mode has no resolved optimum.** At d = 3 and 5 the lowest point is the grid end (500 µs; 67–68% of replicates at the edge), and the d = 7 interval spans 45–500 µs. That follows from soft losing at τ ≥ 7 µs (C2 above).

**C1, ion part: holds.** There is no idle-driven optimum. The idle flip probability is 0.5 (1 − e^(−τ/T1)) ≤ 2.5e-5 at every grid point, 20× below the readout error at τ*_phys. The hard-mode τ*_log intervals at d = 3 and 5 contain τ*_phys, which is set by dark→bright pumping. Beyond about 10 µs the logical error is limited by the gate-noise floor, not by τ.

### Compared with the A15 / CC-A4 expectation

- τ*_phys near 20 µs: as computed in CC-A4 (grid minimum 20 µs, fitted 23.5 µs).
- No idle-driven minimum: as expected.
- The surprise is C2. Soft decoding helps only when readout is photon-starved (τ ≤ 3–5 µs), and hurts once readout is far better than the gates, because the decoder's uniform gate-noise model makes nearly every matching cost the same (see "Diagnosis" under C2).

### Provenance caveat

`stage2_ion.json` records commit `df32781`, which was HEAD at both runs of Thu 8 Oct, but the code that produced it (the B14 review fixes) was not yet committed. Same fix as Stage 1: commit the code, rerun `node tools/sweep.mjs --stage 2` (all seeds are fixed; the output was reproduced exactly), then commit the results.

## Stage 3: superconducting readout

Source: `data/results/stage3_sc.json` and the console output of `node tools/sweep.mjs --stage 3` (Thu 8 Oct 2026, 534 s; identical to the 17:35 trial run with the same values in a scratch copy, DECISIONS Person A, CC-A7 addendum). Readout: `createScReadout(params/sc.json, τ)` with the plan §7.4 values, χ/2π = 1 MHz, κ/2π = 2 MHz (κ = 2χ), n̄ = 5, η = 0.3, T1 = 50 µs, heterodyne, **ring-up on**. These are representative values, not one device; n̄ is UNSOURCED (illustrative), and Walter et al., PRApplied 7, 054020 (2017) is cited for comparison (χ/2π 7.9 MHz, κ/2π 37.5 MHz, η 0.66, T1 7.6 µs). Banks, pooling, pGate, R = 4 (n = 32 000 per point) and the bootstrap as in Stage 2. 26 non-exact matchings in the whole run.

### Validation (V4, V8, V10)

| Check | Result | Outcome |
|---|---|---|
| V4, idle-injection rule against an explicit X gate | `tests/v4.test.js`: all 24 `v4_*.json` banks (9 at d = 3, 15 at d = 5) equal `applyX` on the error-free bits, bit for bit; `npm test` 151/151 | **Pass** |
| V8, T1 = 1e12 µs, ring-up off: empirical assignment error (200 000 truth samples per τ) against ½ erfc(SNR / 2√2) | Within 4 SE at all 12 τ. E.g. τ = 0.05: SNR 1.94, 0.166 against 0.165; τ = 0.3: 8.70e-3 against 8.70e-3; τ = 1: 7.1e-6 against 1.0e-5 | **Pass** |
| V10, llr calibration, card values with ring-up off (belief equals truth only then) | \|llr\| in [0, 1): 0.3802 observed against 0.3792 predicted; **[1, 2): 0.1856 against 0.1853 (m = 103 788)**; [2, 4): 0.0513 against 0.0518; [4, 8): 0.00397 against 0.00398 | **Pass** |
| llr calibration with ring-up on, as in the card (information, not a check) | [0, 1): 0.476 against 0.381; [1, 2): 0.414 against 0.188; [2, 4): 0.263 against 0.054; [4, 8): 0.056 against 0.006 | **Fails in every bin**, see the ring-up mismatch below |

### Ring-up mismatch (belief model against truth)

The belief model in `sc.js` ignores ring-up (CC-A6 design: steady-state means), but the sampler, following the card, rings the resonator up over about 2/κ ≈ 0.16 µs. At short τ the real signal is therefore much smaller than the belief model assumes. The F1 belief and empirical curves disagree beyond 4 SE for τ ≤ 0.7 µs and agree from τ = 1 µs. Consequences:

- **τ*_phys has two values.** From the belief curve it is 0.587 µs (the value stored in `optima.tauPhys`); from the empirical curve it is **0.906 µs**. The empirical value is the physical one, the error a real readout of this card would show. Both are reported below.
- **Soft weights at short τ are miscalibrated** (overconfident). Soft still beats hard everywhere (C2 below), so the miscalibration costs gain but does not reverse it.
- Not changed here: putting ring-up into the belief model is a separate task in `src/core/readout/sc.js` and would change every Stage 3 number.

### F1-sc: assignment error against τ (ring-up on)

| τ (µs) | 0.05 | 0.1 | 0.2 | 0.3 | 0.4 | 0.5 | 0.7 | **1** | 1.4 | 2 | 3 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Belief (no ring-up) | 0.166 | 0.085 | 0.027 | 0.010 | 5.0e-3 | 3.6e-3 | 3.6e-3 | 5.0e-3 | 7.0e-3 | 9.9e-3 | 0.015 |
| Empirical (Wilson 95%) | 0.491 | 0.448 | 0.299 | 0.146 | 0.058 | 0.0229 [0.0223, 0.0236] | 5.68e-3 [5.36, 6.02]e-3 | **5.02e-3 [4.72, 5.34]e-3** | 7.13e-3 [6.78, 7.51]e-3 | 9.78e-3 [9.35e-3, 0.0102] | 0.0143 [0.0138, 0.0148] |
| Idle flip ½(1 − e^(−τ/T1)) | 5.0e-4 | 1.0e-3 | 2.0e-3 | 3.0e-3 | 4.0e-3 | 5.0e-3 | 7.0e-3 | 9.9e-3 | 0.0138 | 0.0196 | 0.0291 |

- **U-curve: yes.** The empirical error falls from 0.49 (photon-starved and still ringing up) to a minimum near 1 µs, then rises because T1 decay during the window grows (3.0e-3 → 0.014 from 0.7 to 3 µs). **τ*_phys = 0.906 µs (empirical) / 0.587 µs (belief).**
- Unlike the ion arm, the idle flip probability is of the same order as the readout error from τ ≈ 0.7 µs on, and larger beyond 1 µs.

### F2-sc: logical error against τ (r = 3, Wilson 95%)

| τ (µs) | d3 hard | d3 soft | d5 hard | d5 soft | d7 hard | d7 soft |
|---|---|---|---|---|---|---|
| 0.05 | 0.486 | 0.486 | 0.482 | 0.480 | 0.478 | 0.472 |
| 0.2 | 0.264 [0.259, 0.269] | 0.229 [0.224, 0.233] | 0.230 [0.226, 0.235] | 0.171 [0.167, 0.175] | 0.202 [0.197, 0.206] | 0.134 [0.130, 0.137] |
| 0.3 | 0.0892 [0.0861, 0.0924] | 0.0673 [0.0646, 0.0700] | 0.0494 [0.0471, 0.0518] | 0.0262 [0.0245, 0.0280] | 0.0298 [0.0280, 0.0317] | 0.0122 [0.0110, 0.0134] |
| 0.4 | 0.0246 [0.0230, 0.0264] | 0.0196 [0.0181, 0.0211] | 0.0077 [0.0068, 0.0087] | 0.0047 [0.0040, 0.0055] | 0.0026 [0.0021, 0.0032] | 0.0012 [0.0009, 0.0016] |
| 0.5 | 0.0277 [0.0259, 0.0295] | 0.0132 [0.0120, 0.0145] | 0.0043 [0.0036, 0.0051] | 0.0022 [0.0018, 0.0028] | 0.0010 [0.0007, 0.0014] | 0.0005 [0.0003, 0.0009] |
| 0.7 | 0.0226 [0.0211, 0.0243] | 0.0131 [0.0119, 0.0144] | 0.0032 [0.0027, 0.0039] | 0.0022 [0.0018, 0.0028] | 0.0008 [0.0005, 0.0011] | 0.0006 [0.0004, 0.0009] |
| 1 | 0.0236 [0.0220, 0.0253] | 0.0158 [0.0145, 0.0173] | 0.0037 [0.0031, 0.0044] | 0.0025 [0.0020, 0.0031] | 0.0008 [0.0006, 0.0012] | 0.0006 [0.0004, 0.0009] |
| 2 | 0.0282 [0.0264, 0.0301] | 0.0275 [0.0257, 0.0293] | 0.0062 [0.0054, 0.0071] | 0.0058 [0.0050, 0.0067] | 0.0018 [0.0014, 0.0023] | 0.0013 [0.0010, 0.0018] |
| 3 | 0.0358 [0.0338, 0.0379] | 0.0352 [0.0332, 0.0372] | 0.0093 [0.0083, 0.0104] | 0.0079 [0.0070, 0.0090] | 0.0026 [0.0021, 0.0032] | 0.0020 [0.0016, 0.0026] |

Full series (all 12 grid points) are in `stage3_sc.json`. Distance helps at every τ ≥ 0.3 µs; below that the readout is near a coin toss and every d sits near 0.5.

### C2 (soft at or below hard at every τ): **holds**

Soft is at or below hard (point estimates) at **36 of 36** points and above hard beyond the intervals at none. It is strictly below beyond the intervals at many points, most strongly in the ring-up/photon-limited range 0.2–0.5 µs (d = 7 at 0.3 µs: 0.0122 [0.0110, 0.0134] against 0.0298 [0.0280, 0.0317]; d = 3 at 0.5 µs: 0.0132 against 0.0277). From 2 µs on, where T1 decay dominates, soft and hard converge (intervals overlap at d = 3). Contrast with the ion arm, where soft loses at long τ: here readout and idle errors stay comparable to the gate noise (pGate ≈ 0.013) over the whole grid, so the near-tie regime that hurt soft on the ion arm does not arise.

### τ*_log per distance (C1, superconducting part)

| d | Mode | τ*_log (µs) | 95% bootstrap interval | Replicates at an edge | Tied |
|---|---|---|---|---|---|
| 3 | hard | 0.793 | [0.436, 0.854] | 0% | 1% |
| 3 | soft | 0.601 | [0.574, 0.668] | 0% | 2.5% |
| 5 | hard | 0.756 | [0.688, 0.875] | 0% | 0% |
| 5 | soft | 0.592 | [0.569, 0.857] | 0% | 7.5% |
| 7 | hard | 0.783 | [0.579, 0.990] | 0% | 7% |
| 7 | soft | 0.582 | [0.553, 1.311] | 0% | 12.5% |

- **Every case has an interior τ*_log** (no replicate at a grid edge).
- **Against the empirical τ*_phys = 0.906 µs:** τ*_log lies below it beyond the interval at d = 3 and d = 5 in both modes (upper bounds 0.854, 0.668, 0.875, 0.857 µs). At d = 7 both intervals contain 0.906 µs (upper bounds 0.990 and 1.311), so the shift is not resolved there.
- **Against the belief τ*_phys = 0.587 µs:** every interval contains or lies above it, so with the belief value there is no shift. The belief value is wrong at short τ (ring-up mismatch above), so the empirical value is the one to compare with.
- Soft optima (≈ 0.59 µs) sit earlier than hard optima (≈ 0.78 µs) at every d: the soft decoder tolerates a shorter, less certain readout because it knows which readings are uncertain.

**C1, superconducting part: holds at d = 3 and 5, not resolved at d = 7,** when τ*_phys is taken from the empirical assignment curve. The logical optimum is shorter than the readout optimum because every extra µs of readout also costs idle flips on the data qubits (½(1 − e^(−τ/T1)) ≈ 1% per round at 1 µs), which the single-qubit readout error does not count. This conclusion rests on the empirical τ*_phys; with the ring-up-free belief curve it would not hold.

### Provenance caveat

`stage3_sc.json` records commit `89b23b3`, which was HEAD at the run, but `params/sc.json` was created afterwards and was not yet committed. The card is copied into the results file (`params`), so the run is reproducible from it; commit `params/sc.json` together with the results.

## Hypotheses C1–C4

Stage 1 bears on none of them directly; it fixes the gate-noise floor (pGate ≈ 0.013) against which the readout effects of Stages 2 and 3 are measured. The verdicts for all four, with Stage 4, are under "Verdicts" at the end of this section; the ion-arm paragraph below was written before Stage 4.

### Ion arm: C1 and C2

Source: `data/results/stage2_ion.json` (Wilson 95% for pL and assignment error, n = 32 000 per point; 95% bootstrap with B = 200 for τ*_log). **On the ion arm C1 holds and C2 fails as stated.** For C1, the idle flip probability 0.5 (1 − e^(−τ/T1)) stays at or below 2.5e-5 over the whole 1–500 µs grid, about 20× below the readout error at its optimum, so idling cannot create an optimum; the optimum that does appear comes from dark→bright pumping during detection. The empirical assignment error falls to 5.7e-4 [4.7e-4, 6.8e-4] at τ = 20 µs and rises to 5.0e-3 [4.7e-3, 5.3e-3] at 500 µs (fitted τ*_phys = 23.5 µs), and the hard-mode logical optima are consistent with it: τ*_log = 31.6 µs [20.0, 81.2] at d = 3 (an exact tie between 20 and 50 µs) and 22.9 µs [14.1, 189] at d = 5, both intervals containing τ*_phys. The minimum is shallow, though: from 10 to 500 µs the d = 3 hard pL stays between 0.0035 [0.0029, 0.0042] and 0.0040 [0.0034, 0.0048], so beyond about 10 µs the gate-noise floor, not τ, sets the logical error; the d = 7 hard optimum (11.8 µs [11.2, 44.7]) rests on 3, 4 and 5 errors at τ = 10, 15 and 20 µs and is not resolved. For C2, soft is at or below hard at only 13 of the 39 (d, τ) points. It wins clearly where readout is photon-starved (τ ≤ 3 µs at every d, and also τ = 5 µs at d = 5 and 7): at τ = 1 µs, d = 7 soft gives 0.0499 [0.0475, 0.0523] against hard 0.394 [0.389, 0.400], and d = 3 gives 0.148 [0.144, 0.152] against 0.352 [0.347, 0.358], so the falsifier "no significant gain anywhere" is not met and the second half of C2 ("helps most where readouts are short and ambiguous") holds. From τ = 7 µs on, soft is worse: above hard beyond the intervals at 11 points, 9 of them at d = 3 (every τ from 7 to 500 µs; τ = 20 µs gives 0.0072 [0.0063, 0.0081] against 0.0035 [0.0029, 0.0042]) and 2 at d = 5, and with overlapping intervals at d = 7. The soft-mode τ*_log is therefore unresolved (at d = 3 and 5 the lowest point is the grid end, with 67–68% of bootstrap replicates there). Split by logical state, the soft loss is on L0 at short and intermediate τ and moves to L1 from about 50 µs, following which readings the llr makes cheap; that asymmetry is intrinsic to matching with correct priors and also appears on model-matched synthetic data, where soft nevertheless wins pooled. The pooled loss on the real banks therefore points to the decoder's uniform-pGate edge model (no correlated or diagonal circuit faults), not to the readout model, whose llr passes V10, nor to the soft decoder, which is exact on soft weights.

### Verdicts (A28, Fri 9 Oct)

Source: `data/results/stage4_comparison.json` (`conclusions`, `sensitivity`, `sensitivityBaseline`; `tools/sweep.mjs --stage 4`, 373 s, 38 non-exact matchings), with Stages 2 and 3 above. Per-round and per-µs values are at τ*_log (plan §16.5); intervals are Wilson 95% carried through, τ*_log intervals 95% bootstrap. Both arms decode the **same** IonQ-simulator banks with the same calibrated pGate (0.0124 to 0.0139), so every difference between the platforms comes from the readout model, the idle flips and the cycle time.

**How to read the sensitivity sweep.** Each of the 28 rows reruns both arms at reduced statistics (R = 1, at most 1000 shots per bank, so n ≤ 2000 per point, no bootstrap). The reduced-statistics baseline at card values (`sensitivityBaseline`) is part of the comparison. Where a row agrees with that baseline but the baseline disagrees with the full-statistics result, the sweep lacks power for that conclusion. It does not confirm or refute the conclusion. This happens for C1 (superconducting part) and C2.

| | Plan statement (short) | Verdict | Automated verdict (full statistics) | Sensitivity, 28 rows |
|---|---|---|---|---|
| C1 | SC: interior τ*_log < τ*_phys, idle-driven; ion: no idle-driven optimum | **Held** at d = 3 and 5; undetermined at d = 7 | flips (artefact, see below) | flips 28/28, same as baseline; not informative |
| C2 | Soft at or below hard at every τ, most gain at short τ | **Refuted** as stated (fails on the ion arm, holds on SC) | flips | holds 28/28, same as baseline; too little power to see the ion loss |
| C3 | Ion better per round, order reverses per µs | **Refuted** | flips | flips 27/28, undetermined 1/28 (κ × 2); never holds |
| C4 | Break-even ε̄ (d = 5 beats d = 3) similar on both platforms | **Refuted** on the empirical ε̄ axis; undetermined on the belief axis | undetermined | undetermined 28/28 overall |

#### C1: held at d = 3 and 5 (superconducting), held on the ion arm; d = 7 undetermined

- **Superconducting.** Every case has an interior τ*_log (no bootstrap replicate at a grid edge). Against the empirical τ*_phys = 0.906 µs, τ*_log lies below it beyond the interval at d = 3 (hard 0.793 [0.436, 0.854], soft 0.601 [0.574, 0.668] µs) and d = 5 (hard 0.756 [0.688, 0.875], soft 0.592 [0.569, 0.857] µs). At d = 7 the intervals contain 0.906 µs (hard 0.783 [0.579, 0.990], soft 0.582 [0.553, 1.311] µs). Against the belief τ*_phys = 0.587 µs there is no shift. The verdict depends on the empirical value (ring-up mismatch, Stage 3).
- **Ion.** The hard-mode optima at d = 3 and 5 (31.6 [20.0, 81.2] and 22.9 [14.1, 189] µs) contain τ*_phys = 23.5 µs, which is set by dark→bright pumping. The idle flip probability is at most 2.5e-5 on the grid, about 20× below the readout error at τ*_phys (5.7e-4) and about 500× below pGate. So none of the interior minima can be idle-driven.
- **Why the automated verdict says "flips".** The CC-A8 rule calls the ion part "holds" only if the idle probability is below 1e-6 at **every** τ. 0.5 (1 − e^(−τ/T1)) passes 1e-6 between τ = 20 and 30 µs (2.5e-5 at 500 µs), so the rule fails on the long-τ grid points, where pL is flat and set by gate noise. The rule is stricter than the plan's falsifier ("the ion curve shows an idle-driven minimum"), and the plan's falsifier is not met. The same rule makes every sensitivity row "flips", including T1 × 2 (maximum idle probability 1.25e-5). The superconducting part is "undetermined" in every row and in the baseline, because the reduced runs have no bootstrap intervals. So the sweep does not test C1.
- **Why it holds.** On the superconducting arm each extra µs of readout also costs about 1% idle flips per round on the data qubits, which the single-qubit assignment error does not count, so the logical optimum comes earlier. On the ion arm the idle flips are negligible and the optimum follows the readout itself.

#### C2: refuted as stated (fails on the ion arm, holds on the superconducting arm)

- **Superconducting:** soft at or below hard at 36 of 36 points, below beyond the intervals at 20, above at none (largest gain d = 7, 0.3 µs: 0.0122 [0.0110, 0.0134] against 0.0298 [0.0280, 0.0317]).
- **Ion:** soft above hard beyond the intervals at 11 points (9 at d = 3, every τ from 7 to 500 µs; e.g. 20 µs: 0.0072 [0.0063, 0.0081] against 0.0035 [0.0029, 0.0042]) and below beyond the intervals at 11 (τ ≤ 3–5 µs; d = 7 at 1 µs: 0.0499 against 0.394). The second half of C2 holds on both arms: the gain is largest where readouts are short and ambiguous.
- **Sensitivity:** "holds" in all 28 rows and in the baseline (ion: 0 points with soft above hard). At n ≤ 2000 per point the ion loss at d = 3 (about 7 against 14 expected errors at τ = 20 µs) is inside the intervals, so these rows cannot see it. The full-statistics refutation stands.
- **Why:** once ion readout errors (≈ 6e-4) are far below pGate (≈ 0.013), almost every matching costs the same under the decoder's single uniform gate-noise model, and the small llr differences break those near-ties in a way that fits the simulator's real gate noise worse than hard weights do (Stage 2 "Diagnosis").

#### C3: refuted (the ion arm is lower in both metrics)

| d, mode | Per round, ion | Per round, SC | Per µs, ion | Per µs, SC |
|---|---|---|---|---|
| 3 hard | 1.20e-3 [1.00e-3, 1.44e-3] | 7.78e-3 [7.23e-3, 8.36e-3] | 5.92e-7 | 6.90e-3 |
| 5 hard | 2.85e-4 [1.96e-4, 4.14e-4] | 1.11e-3 [9.2e-4, 1.34e-3] | 1.42e-7 | 1.02e-3 |
| 7 hard | 3.6e-5 [1.3e-5, 9.8e-5] | 2.57e-4 [1.73e-4, 3.80e-4] | 1.8e-8 | 2.30e-4 |
| 3 soft | 1.84e-3 [1.59e-3, 2.13e-3] | 4.41e-3 [4.01e-3, 4.86e-3] | 7.39e-7 | 4.72e-3 |
| 5 soft | 3.86e-4 [2.80e-4, 5.32e-4] | 7.41e-4 [5.87e-4, 9.34e-4] | 1.55e-7 | 8.00e-4 |
| 7 soft | 8.5e-5 [4.3e-5, 1.66e-4] | 1.87e-4 [1.18e-4, 2.95e-4] | 3.9e-8 | 2.04e-4 |

Cycle times at τ*_log: ion 2002–2490 µs, SC 0.92–1.13 µs. Hand check of d = 3 hard: ion pL 0.003581 at r = 3 gives ½[1 − (1 − 0.007162)^(1/3)] = 1.196e-3 per round, and divided by 2021.6 µs gives 5.92e-7 per µs. For SC, pL 0.022965 gives 7.78e-3 per round, and divided by 1.1275 µs gives 6.90e-3 per µs. Both agree with the file.

- Per round the ion arm is lower in 5 of 6 cases beyond the intervals (by 1.9× to 7×; d = 7 soft overlaps). The first half of C3 holds: the ion can beat the superconducting arm per round. Per µs the ion arm is lower by about 10⁴ in every case, so the ordering never reverses. This meets the falsifier ("the ordering is the same in both metrics across the sensitivity sweep"), and no sensitivity row reverses it (27 flips, 1 undetermined). The result does not depend on taking τ*_log: the lowest superconducting per-µs value on the grid (d = 3 hard, 3.7e-3 at 3 µs) is still about 7000× above the ion arm's.
- **Why:** per round the ion arm wins because its readout error (≈ 6e-4) and idle flips (< 3e-5) are far below the superconducting arm's (≈ 5e-3 readout, ≈ 1% idle per round), and the gate noise is identical by construction. Dividing by a longer cycle can only lower a rate per µs, so the ion arm's slow cycle widens its lead instead of reversing it. The cost the hypothesis had in mind (a slow clock) would show up in a metric such as time to finish a fixed number of logical operations, not in errors per µs of storage.

#### C4: refuted on the empirical ε̄ axis; undetermined on the belief axis

- **Ion:** hard break-even ε̄ = 0.236 [0.210, 0.267] at τ = 1.56 µs (empirical axis 0.236 [0.210, 0.266]). In soft mode d = 5 is below d = 3 at every τ, so there is no break-even.
- **Superconducting:** there is no crossing in either mode. d = 5 is below d = 3 at every grid point. At τ = 0.1 µs (empirical ε̄ = 0.448) it is still below beyond the intervals: hard 0.4377 [0.4323, 0.4432] against 0.4533 [0.4479, 0.4588]. The two curves merge only at the coin-toss limit (τ = 0.05 µs, ε̄ = 0.491: 0.4825 against 0.4862, overlapping). So the superconducting break-even lies above ε̄ ≈ 0.45 on the empirical axis, at least 0.18 above the ion's upper bound of 0.267. That is a difference far beyond the uncertainties, so the falsifier is met. On the belief axis the grid only reaches ε̄ = 0.166 (ring-up ignored), so the superconducting break-even is just bounded below (beyond the intervals at belief ε̄ = 0.085). That is compatible with 0.236, and the automated rule reports "undetermined" for this reason.
- **Sensitivity:** "undetermined" in all 28 rows. The hard part shows "holds" at χ × 0.5 (ion 0.201, SC 0.163) and κ × 2 (0.201, 0.188). These superconducting crossings are on the belief axis, at reduced statistics, where both curves sit near 0.5, so they carry no weight.
- **Why:** ε̄ is not a platform-neutral axis, because the ion error is one-sided. At short τ only bright ions are misread, as dark (e^(−0.472 · 1.56) = 0.48 at break-even), so ε̄ = 0.24 means about 0.48 on one state, where distance stops helping. The superconducting error is nearly symmetric (0.448 and 0.450 for |0⟩ and |1⟩ at 0.1 µs; corrected in A31 from 0.459 and 0.471, which did not average to ε̄ = 0.448), and majority voting keeps helping until about 0.5. The second half of C4 does hold: the readout time needed differs by more than 15× (ion 1.56 µs against SC below 0.1 µs).

#### Consequences for the project page and for Person B

- The page must not show the automated C1 "flips" or the sensitivity rows without the caveats above. The C1 ion "flips" comes from the 1e-6 idle threshold. The sensitivity C2 "holds" reflects too little statistical power and is not robustness.
- Stage 4 `breakEven.byMode` is per mode. Level 5 should use it rather than repeat the hard value for soft (CC-B9 handoff, item 3).
- Superconducting τ*_phys: the page should quote the empirical 0.906 µs, or both values. `optima.tauPhys` holds the belief value 0.587 µs.
