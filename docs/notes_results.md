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

## v2 hypotheses (pre-registered Sat 10 Oct, before any rerun)

| ID | Statement | Tested by | Refuted if |
|---|---|---|---|
| C1 (revised) | Superconducting: τ*_log < τ*_phys (empirical), with the learned decoder, in both bases. Trapped ion with crosstalk off: no idle-driven optimum. Trapped ion with crosstalk at the card value: an interior τ*_log < τ*_phys appears | Stages 2–3 rerun; crosstalk scan | SC τ*_log interval contains or exceeds τ*_phys at d = 3 and 5; or the ion shows the crosstalk-driven optimum with crosstalk off, or no interior optimum at any scanned crosstalk rate |
| C2 (unchanged statement) | Soft decoding is at or below hard at every τ, with most gain where readouts are short | Stages 2–3, learned decoder | Soft above hard beyond the intervals at any point |
| C3 (replaced) | Neither readout model dominates: along the τ grids the ion arm has lower error per round and the superconducting arm more rounds per second | Trade-off curves, Stage 4 | One arm is better on both axes at its τ*_log |
| C4 (unchanged) | Break-even ε̄ (d = 5 beats d = 3) similar on both arms, on the empirical ε̄ axis | Stage 4 | Values differ beyond their uncertainties |
| C5 (new) | The learned detector error model lowers the logical error against the naive one at every (d, arm, mode) at τ*_log, out of sample | Stage dem, Stage 4 | Learned above naive beyond the intervals at any point |
| C6 (new) | In the phase-flip memory the superconducting τ*_log is shorter than in the bit-flip memory when T2 < T1 | Stage 3 in both bases | τ*_log(X) ≥ τ*_log(Z) beyond the intervals |
| O4 (measurement, no hypothesis) | Ratio of bulk detector rates, X-basis to Z-basis banks, per (d, r): how biased forte-1 noise looks to the decoder | Stage dem | — |

## v2 results: Stage dem and Stages 1–2 with both decoders (A44/A45, Sat 10 Oct)

Sources: `data/results/dem_forte1.json`, `stage1_flat.json`, `stage2_ion.json` and the console output of `node tools/sweep.mjs --stage dem`, `--stage 1`, `--stage 2` (CC-A12, Sat 10 Oct 2026). Z basis only: the X-basis banks arrive at A48. Naive = one calibrated pGate per bank on space and time edges (as in v1). Learned = per-class rates (space, spaceBoundary, time, diag) from `ratesFromBanks` of the L0 and L1 banks of the same (d, r), on a graph with diagonal edges. Both decoders see the same readout draws (same seeds). The naive numbers are identical to the v1 files above, so every v1 statement about the naive decoder still stands. Results for C1–C6 are interim until Stages 3 and 4 are rerun (A48, A50).

### Learned rates (`dem_forte1.json` → `banks`)

Space / spaceBoundary / time / diag (antiDiag), L0 + L1 pooled, against the naive pGate of the same detectors: d3 r3 0.0082 / 0.0066 / 0.0100 / 0.0099 (0.0003), pGate 0.0124; d5 r3 0.0073 / 0.0083 / 0.0096 / 0.0091 (0.0001), pGate 0.0131; d5 r5 0.0081 / 0.0073 / 0.0096 / 0.0096 (0.0003), pGate 0.0130; d7 r3 0.0073 / 0.0072 / 0.0091 / 0.0097 (0.0002), pGate 0.0135; d3 r1 0.0045 / 0.0038 / 0.0074 / 0.0084 (0.0000), pGate 0.0067. Every class rate is below the naive pGate: the naive model has no diagonal edges, so it explains the diagonal correlations with extra space and time weight.

### V12b: out of sample (`outOfSample`, `outOfSamplePooled`)

Train on one logical state's bank, decode the other's; flat ε = 0.02, hard, pooled over both directions (n = 8000). Naive → learned: d3 r3 0.00700 [0.00539, 0.00908] → 0.00625 [0.00474, 0.00823]; d5 r3 0.00162 [0.00095, 0.00278] → 0.00088 [0.00042, 0.00181]; d5 r5 0.00250 [0.00162, 0.00386] → 0.00112 [0.00059, 0.00214]; d7 r3 0.00025 → 0.00013; d3 r1 0.00250 → 0.00250. **Learned ≤ naive at every (d, r); not beyond the intervals at d = 5** (k = 13 → 7 and 20 → 9 are too few errors). V12b requires both, and the first clause alone is not a pass (team checklist Section 1.3, clarified Sat 10 Oct), so **V12b fails and the SP5 cut rule applies**: levels 1–4 and the hero show the naive decoder on both arms until a decision recorded in DECISIONS lifts the cut (DECISIONS E4). The learned results below are reported as results, not as the page's default decoder.

### Decoder comparison (`decoderComparison`, in sample, R = 2, n = 16 000 per point)

48 points (flat ε 1e-9 and 0.02; ion τ 3, 20, 100 µs; superconducting τ 0.5, 0.7, 1.0 µs; d = 3, 5, 7; hard and soft). Learned is never above naive beyond the intervals, and below it beyond the intervals at 16 of 48 points. The largest gains are on the superconducting arm (d = 3, τ = 0.7 µs, hard: 0.0231 [0.0209, 0.0256] → 0.0063 [0.0051, 0.0076]) and for ion soft decoding at τ ≥ 20 µs (d = 3, τ = 20 µs: 0.0069 → 0.0036). The learned point estimate is above naive at 4 points, all within the intervals (ion τ = 20 and 100 µs d = 3 hard; ion τ = 3 µs d = 5 and 7 soft). This is in-sample evidence for C5; the pre-registered test is at τ*_log, out of sample, in Stage 4.

### Stage 1 rerun (`stage1_flat.json`)

pL against ε = 0, 0.005, 0.01, 0.02, 0.03, 0.05, 0.08, 0.12 (hard, r = 3, n = 8000):

| d | decoder | pL |
|---|---|---|
| 3 | naive | 0.0289, 0.0045, 0.0049, 0.0069, 0.0116, 0.0190, 0.0376, 0.0618 |
| 3 | learned | 0.0033, 0.0039, 0.0045, 0.0056, 0.0090, 0.0166, 0.0353, 0.0598 |
| 5 | naive | 0.0035, 0.0013, 0.0015, 0.0021, 0.0020, 0.0059, 0.0124, 0.0270 |
| 5 | learned | 0.0004, 0.0003, 0.0004, 0.0013, 0.0018, 0.0043, 0.0110, 0.0253 |
| 7 | naive | 0.0005, 0.0001, 0.0004, 0.0001, 0.0004, 0.0011, 0.0040, 0.0108 |
| 7 | learned | 0.0000, 0.0003, 0.0003, 0.0001, 0.0004, 0.0009, 0.0038, 0.0110 |

- **V11 PASS** at d = 3, 5, 7: the learned decoder gives the same k at ε = 0 and 1e-9 (26, 3, 0 of 8000); naive gives 231 against 28 at d = 3.
- **The ε = 0 spike is gone** with the learned decoder: the learned d = 3 curve rises monotonically from ε = 0. The naive spike was a tie-break artefact of equal edge weights; the learned weights are not all equal.
- V1 PASS and V6 (L0 against L1) as before; the one V6 "DIFFER" is learned d = 5 at ε = 0.03 (L0 13, L1 1 of 4000 errors), one of 48 comparisons (24 per decoder), with no pattern across ε.

### Stage 2 rerun (`stage2_ion.json`)

- **C2 on the ion arm, learned decoder: no point with soft above hard beyond the intervals** (0 of 39; soft at or below hard at 29 of 39 points). Naive: 11 of 39, as in v1. At d = 3, τ = 20 µs: learned soft 0.00356 [0.00297, 0.00428], hard 0.00350 [0.00291, 0.00421]; naive soft 0.00716, hard 0.00347. The v1 C2 loss ("Diagnosis: intrinsic asymmetry plus a gate-model mismatch") came from the gate-model mismatch: with the learned model it disappears. Soft still gains most at short τ (d = 3, τ = 1 µs: hard 0.352, soft 0.147).
- τ*_log, learned (bootstrap B = 200): d = 3 hard 21.8 µs [20.0, 60.1], soft 31.6 µs [11.9, 500]; d = 5 hard 248 µs [11.0, 500], soft 269 µs [9.9, 500]. Above about 10 µs the learned curves are flat within their intervals, so these minima are not resolved. d = 7 learned has 0 to 2 errors out of 32 000 at every τ from 15 to 200 µs (the minimum is a 100% tie): not resolved.
- Non-exact matchings: 0 in every run.

## v2 verdicts at A49 (Sat 10 Oct, 22:10 IST)

Sources: `data/results/stage2_ion.json`, `stage2_ion_x.json`, `stage3_sc.json`, `stage3_sc_x.json` (A48 rerun, commit 58fe92c: both decoders, both bases, ion crosstalk at the card rate 1.67e-5 /µs, R = 4, n = 32 000 per point) and `dem_forte1.json` (the `--stage dem` rerun at A48). Every number below names its file and field. The A48 rerun replaced the Stage 2 file used in the A44/A45 section above, so the Stage 2 numbers quoted there (learned τ*_log, the C2 example at τ = 20 µs, naive 11 of 39) are superseded by the ones here; the difference comes from switching ion crosstalk on at the card rate.

**Stage 4.** No number from `stage4_comparison.json` is quoted: it was built on 8 Oct from Stage 2 and 3 files that have since been replaced. It is regenerated at A50 (provisional) and A53c (final).

**Tie rule.** A τ*_log whose `fractionTied` ≥ 0.5 (half or more of the bootstrap replicates have a tied grid minimum) is **UNRESOLVED**: it is marked, kept in the tables, and excluded from every verdict. This applies to all τ*_log tables in this file. The v1 tables in Stages 2 and 3 have no such row (largest: 36%, ion d = 7 hard).

### A49 check table

| Check | Source | Result | Outcome |
|---|---|---|---|
| V7 (ion, both gammas 0), Z and X | `stage2_ion.json`, `stage2_ion_x.json` → `validation.V7` | Identical to v1 in both bases (readout only, no decoder): τ = 5 µs 0.0472 analytic, 0.0472 empirical; τ = 10 µs 4.48e-3 against 4.53e-3; τ = 20 µs 8.2e-5 against 6.5e-5; all 13 rows pass | **Pass** |
| V8 (superconducting, T1 = 1e12 µs, ring-up off), Z and X | `stage3_sc.json`, `stage3_sc_x.json` → `validation.V8` | Identical to v1: τ = 0.05 µs SNR 1.94, 0.166 against 0.165; τ = 0.3 µs 8.70e-3 against 8.70e-3; all 12 rows pass | **Pass** |
| V10 (llr calibration), both arms, Z and X | `validation.V10` | Identical to v1. Ion [1, 2): 0.1965 against 0.1957 (m = 124 883); superconducting [1, 2): 0.1856 against 0.1853 (m = 103 788); all bins pass | **Pass** |
| V13 (phase-flip injection) | `npm test` (`tests/v4.test.js`) | The three `v13_*` banks each have one outcome, equal to the basis-Z `applyX` prediction; 252 of 253 tests pass, the one failure is Person B's `tests/hero.test.js` (HANDOFF N6) | **Pass** |
| Budget magnitudes | `budget` arrays | See "Budget magnitudes" below: readout 5e-3 to 2e-2 near the superconducting optimum and 6e-4 to 5e-3 near the ion optimum (ion slightly below the 1e-3 guide, because pumping makes the ion readout very good at 20 µs); idle ≤ 2.9e-2 (superconducting Z at 3 µs); gate 0.0087–0.0090, classes 0.0066–0.0113 | **Pass** |

### C1, ion part (`crosstalkScan`, learned decoder, R = 2, n = 16 000 per point, B = 200)

τ*_phys = 23.5 µs (`crosstalkScan.tauPhys`). "Point" is `interiorBelowTauPhys` (the pre-registered rule, point estimate below τ*_phys); "Resolved" is `interiorBelowTauPhysResolved` (the whole interval below τ*_phys). Rows with Tied ≥ 50% are UNRESOLVED.

| Rate (/µs) | Basis | d | Mode | τ*_log (µs) [95%] | Tied | Point | Resolved |
|---|---|---|---|---|---|---|---|
| 0 | Z | 3 | hard | 15.2 [13.9, 27.4] | 34% | true | false |
| 0 | Z | 3 | soft | 14.1 [11.8, 500] | 28% | true | false |
| 0 | Z | 5 | hard | 54.8 [11.6, 500] | 62% UNRESOLVED | false | false |
| 0 | Z | 5 | soft | 500 [10.5, 500] | 45% | false | false |
| 0 | X | 3 | hard | 38.7 [21.2, 57.1] | 26% | false | false |
| 0 | X | 3 | soft | 38.7 [15.4, 70.7] | 34% | false | false |
| 0 | X | 5 | hard | 54.8 [44.7, 54.8] | 100% UNRESOLVED | false | false |
| 0 | X | 5 | soft | 54.8 [44.7, 86.6] | 100% UNRESOLVED | false | false |
| 1e-6 | Z | 3 | hard | 15.2 [13.9, 27.4] | 34% | true | false |
| 1e-6 | Z | 3 | soft | 14.1 [11.8, 206] | 40% | true | false |
| 1e-6 | Z | 5 | hard | 54.8 [11.6, 500] | 60% UNRESOLVED | false | false |
| 1e-6 | Z | 5 | soft | 70.7 [9.86, 500] | 47% | false | false |
| 1e-6 | X | 3 | hard | 35.2 [21.2, 87.8] | 29% | false | false |
| 1e-6 | X | 3 | soft | 38.7 [15.5, 86.2] | 32% | false | false |
| 1e-6 | X | 5 | hard | 54.8 [44.7, 54.8] | 100% UNRESOLVED | false | false |
| 1e-6 | X | 5 | soft | 54.8 [44.7, 86.6] | 100% UNRESOLVED | false | false |
| 1e-5 | Z | 3 | hard | 31.6 [14.8, 85.1] | 26% | false | false |
| 1e-5 | Z | 3 | soft | 15.3 [12.0, 87.1] | 26% | true | false |
| 1e-5 | Z | 5 | hard | 105 [38.7, 224] | 45% | false | false |
| 1e-5 | Z | 5 | soft | 500 [10.8, 500] | 39% | false | false |
| 1e-5 | X | 3 | hard | 27.4 [14.8, 78.2] | 32% | false | false |
| 1e-5 | X | 3 | soft | 27.4 [13.8, 81.2] | 37% | false | false |
| 1e-5 | X | 5 | hard | 54.8 [44.7, 54.8] | 100% UNRESOLVED | false | false |
| 1e-5 | X | 5 | soft | 54.8 [44.7, 54.8] | 100% UNRESOLVED | false | false |
| **1.67e-5 (card)** | Z | 3 | hard | 30.2 [21.2, 36.8] | 28% | false | false |
| **1.67e-5 (card)** | Z | 3 | soft | 30.6 [12.0, 38.8] | 37% | false | false |
| **1.67e-5 (card)** | Z | 5 | hard | 100 [11.8, 224] | 40% | false | false |
| **1.67e-5 (card)** | Z | 5 | soft | 100 [10.5, 500] | 33% | false | false |
| **1.67e-5 (card)** | X | 3 | hard | 19.3 [16.2, 47.5] | 29% | true | false |
| **1.67e-5 (card)** | X | 3 | soft | 17.3 [14.8, 47.5] | 42% | true | false |
| **1.67e-5 (card)** | X | 5 | hard | 17.3 [17.2, 54.8] | 100% UNRESOLVED | true | false |
| **1.67e-5 (card)** | X | 5 | soft | 17.3 [14.1, 54.8] | 100% UNRESOLVED | true | false |
| 1e-4 | Z | 3 | hard | 16.1 [14.3, 46.5] | 18% | true | false |
| 1e-4 | Z | 3 | soft | 28.6 [11.6, 51.8] | 14% | false | false |
| 1e-4 | Z | 5 | hard | 17.3 [17.3, 94.8] | 94% UNRESOLVED | true | false |
| 1e-4 | Z | 5 | soft | 22.4 [14.1, 97.7] | 56% UNRESOLVED | true | false |
| 1e-4 | X | 3 | hard | 21.2 [14.8, 29.5] | 13% | true | false |
| 1e-4 | X | 3 | soft | 19.3 [12.2, 28.6] | 16% | true | false |
| 1e-4 | X | 5 | hard | 27.4 [22.4, 27.4] | 100% UNRESOLVED | false | false |
| 1e-4 | X | 5 | soft | 22.4 [22.4, 87.1] | 88% UNRESOLVED | true | false |
| 1e-3 | Z | 3 | hard | 14.1 [11.4, 17.5] | 4% | true | **true** |
| 1e-3 | Z | 3 | soft | 12.9 [11.1, 18.7] | 7% | true | **true** |
| 1e-3 | Z | 5 | hard | 17.3 [10.9, 20.3] | 15% | true | **true** |
| 1e-3 | Z | 5 | soft | 11.2 [9.80, 19.6] | 10% | true | **true** |
| 1e-3 | X | 3 | hard | 12.8 [11.4, 14.1] | 0.5% | true | **true** |
| 1e-3 | X | 3 | soft | 13.0 [11.1, 14.6] | 2.5% | true | **true** |
| 1e-3 | X | 5 | hard | 17.3 [11.5, 25.4] | 14% | true | false |
| 1e-3 | X | 5 | soft | 15.5 [7.55, 24.5] | 21% | true | false |

No non-exact matchings (`crosstalkScan.nonExact` 0 in both files).

**C1 (ion), three sub-verdicts.** The pre-registered rule uses the point flag; the resolved flag was added after seeing the data (DECISIONS E12). Both are given.

- **(a) Crosstalk off, no idle-driven optimum: holds.** The point flag is true at rate 0 only in Z at d = 3 (hard 15.2 µs, soft 14.1 µs), and both intervals contain τ*_phys = 23.5 µs (hard [13.9, 27.4]). With crosstalk off the idle probability is 5e-8 to 2.5e-5 per round (`stage2_ion.json` → `budget.idle`; about 1e-6 near τ*_phys): this is noise in the location of a flat minimum, not physics. X at rate 0 has the point flag false everywhere.
- **(b) Crosstalk at the card value 1.67e-5 /µs, an interior τ*_log < τ*_phys appears: REFUTED under the resolved flag.** Every interval contains τ*_phys in both bases. Under the pre-registered point flag the result is **split between the bases**: Z says none at every (d, mode) (d = 3 hard 30.2 [21.2, 36.8]); X says one exists at every (d, mode) (d = 3 hard 19.3 [16.2, 47.5]), but the X d = 5 rows are 100% tied and therefore UNRESOLVED. The split is a sign that the point flag reads noise at this rate, which is why the resolved flag is reported beside it.
- **(c) "No interior optimum at any scanned rate" is not met, but it was a weak clause.** At 1e-4 /µs most point estimates sit below τ*_phys but every interval overlaps it. An optimum below τ*_phys is resolved only at 1e-3 /µs, 60× the card value: in Z at d = 3 and 5 (both modes) and in X at d = 3 (both modes); X at d = 5 is not resolved (upper bounds 25.4 and 24.5 µs). At that rate crosstalk per detection is ½(1 − e^(−0.014)) ≈ 0.7% near 14 µs, as large as the learned gate classes (0.0066–0.0113, `budget.gateClasses`). The clause can only be met where crosstalk is as large as gate noise, so meeting it says little.

### C1, superconducting part (learned, `optima.tauLog`, against `optima.tauPhysEmpirical` = 0.906 µs)

"Below" only if the upper bound is below 0.906 µs. No row has Tied ≥ 50%.

| Basis | d | Mode | τ*_log (µs) [95%] | Tied | Below 0.906? |
|---|---|---|---|---|---|
| Z | 3 | hard | 0.764 [0.732, 0.802] | 0% | **yes** |
| Z | 3 | soft | 0.716 [0.659, 0.785] | 0.5% | **yes** |
| Z | 5 | hard | 0.781 [0.680, 0.896] | 5.5% | **yes** |
| Z | 5 | soft | 0.850 [0.586, 0.957] | 7% | no |
| Z | 7 | hard | 0.810 [0.744, 0.920] | 19% | no |
| Z | 7 | soft | 0.777 [0.698, 0.990] | 15% | no |
| X | 3 | hard | 0.820 [0.772, 0.896] | 1.5% | **yes** |
| X | 3 | soft | 0.812 [0.730, 0.904] | 1% | **yes** (by 0.002 µs) |
| X | 5 | hard | 0.837 [0.658, 0.944] | 7% | no |
| X | 5 | soft | 0.801 [0.729, 1.05] | 14% | no |
| X | 7 | hard | 0.721 [0.636, 0.990] | 35.5% | no |
| X | 7 | soft | 1.30 [0.837, 1.41] | 44.5% | no |

**C1 (superconducting): holds at d = 3 in both bases and both modes; not met at d = 5** (only Z hard resolves below 0.906 µs; Z soft, X hard and X soft intervals contain it). The pre-registered refutation is "the interval contains or exceeds τ*_phys at d = 3 and 5", so the revised C1 is **refuted at d = 5 and holds at d = 3**. Changed from v1: the v1 naive decoder resolved the shift at d = 3 and 5 in Z (upper bounds 0.854, 0.668, 0.875, 0.857 µs; the naive rows in `stage3_sc.json` are unchanged). The learned optima sit later (Z d = 3 soft 0.716 µs against naive 0.601 µs), so the size of the v1 shift was partly a property of the naive decoder.

### C6 (`stage3_sc.json`, `stage3_sc_x.json`, learned, `optima.tauLog`)

**NOT APPLICABLE with the card.** C6 is conditional on T2 < T1; `params/sc.json` has T2 = 77 µs > T1 = 50 µs. With this card the phase-flip idle probability is the smaller one (`budget.idle` at 1 µs: X 0.0065, Z 0.0099), so physics predicts an X optimum at or beyond the Z one. The data are consistent with that but do not resolve it: the X point estimate is later at d = 3 (hard 0.820 [0.772, 0.896] against 0.764 [0.732, 0.802]; soft 0.812 against 0.716), d = 5 hard (0.837 against 0.781) and d = 7 soft (1.30 against 0.777), and earlier at d = 5 soft (0.801 against 0.850) and d = 7 hard (0.721 against 0.810); the intervals overlap at every (d, mode). C6 is tested with a variant card (T2 = 25 µs) at CC-A19 (DECISIONS E12).

### C2 (learned, Wilson intervals)

Points with soft above hard beyond the Wilson intervals (`validation.C2` → `softAboveBeyondIntervals`):

| Arm | Basis | Learned | Naive (for comparison) |
|---|---|---|---|
| Trapped ion | Z | **0 of 39** (soft ≤ hard at 32) | 13 of 39 |
| Trapped ion | X | **0 of 39** (soft ≤ hard at 37) | 9 of 39 |
| Superconducting | Z | **0 of 36** (soft ≤ hard at 33) | 0 of 36 |
| Superconducting | X | **0 of 36** (soft ≤ hard at 35) | 0 of 36 |

**C2 (learned): holds on both arms in both bases at this level of evidence.** Wilson intervals treat the R readout draws of one quantum shot as independent, so they are too narrow where gate faults dominate; CC-A19 adds cluster and paired intervals and these counts are redone at A53a.

### O4 (`dem_forte1.json` → `ratioXoverZ`, bulk detector rate, X-basis over Z-basis banks)

| d | r | Ratio [95%] | Z rate | X rate |
|---|---|---|---|---|
| 3 | 1 | 1.041 [0.894, 1.213] | 0.0198 | 0.0206 |
| 3 | 3 | 1.027 [0.959, 1.100] | 0.0478 | 0.0491 |
| 5 | 3 | 1.000 [0.953, 1.048] | 0.0504 | 0.0504 |
| 5 | 5 | 1.029 [0.995, 1.064] | 0.0498 | 0.0513 |
| 7 | 3 | 1.021 [0.983, 1.061] | 0.0517 | 0.0528 |

All intervals contain or nearly contain 1: forte-1 gate noise looks unbiased to the decoder, so X-against-Z differences in our results come from the classical idle model, not from the simulator. (Here every interval contains 1; the lowest lower bound is 0.995, at d5 r5.)

### Finding F1 (post hoc, not pre-registered): the v1 soft-decoding loss was a decoder-model artefact

From `stage2_ion.json` (Z, d = 3, τ = 20 µs, `series`): naive soft 0.00738 [0.00649, 0.00837] against hard 0.00347 [0.00288, 0.00418]; soft is worse beyond the intervals at 13 of 39 points with the naive decoder. Learned soft 0.00356 [0.00297, 0.00428] against hard 0.00331 [0.00274, 0.00400]; 0 of 39. The X basis shows the same (naive 9 of 39, learned 0 of 39). Mechanism: the diagonal edge class is as strong as the time-like class (`dem_forte1.json` → `banks`, d3 r3 Z: diag 0.0099, time 0.0100) and is missing from the naive graph. Caveats: this is in sample (the rates are learned from the banks being decoded), and V12(b) is underpowered at d = 5 (13 → 7 and 20 → 9 errors, DECISIONS E4). The held-out test is V18 (CC-A18, CC-A21).

### Budget magnitudes (`budget`, per round, per qubit)

| Arm | Basis | τ range (µs) | Readout | Idle | Crosstalk | Gate (pGate; classes) |
|---|---|---|---|---|---|---|
| Trapped ion | Z | 1–500 | 5.7e-4 (20 µs) – 0.31 (1 µs) | 5e-8 – 2.5e-5 | 8.3e-6 – 4.2e-3 (card rate) | 0.0087; 0.0066–0.0100 |
| Trapped ion | X | 1–500 | same as Z | 5e-7 – 2.5e-4 | same as Z | 0.0090; 0.0070–0.0113 |
| Superconducting | Z | 0.05–3 | 5.0e-3 (1 µs) – 0.49 (0.05 µs) | 5.0e-4 – 2.9e-2 | 0 | 0.0087; 0.0066–0.0100 |
| Superconducting | X | 0.05–3 | same as Z | 3.2e-4 – 1.9e-2 | 0 | 0.0090; 0.0070–0.0113 |

Near the optima: ion readout 4.8e-3, 5.7e-4, 9.3e-4 at 10, 20, 50 µs (idle ≤ 2.5e-5); superconducting readout 2.3e-2, 5.7e-3, 5.0e-3 at 0.5, 0.7, 1 µs with idle 5.0e-3, 7.0e-3, 9.9e-3 (Z) and 3.2e-3, 4.5e-3, 6.5e-3 (X). On the superconducting arm readout, idle and gate are all of order 1e-2 near the optimum; on the ion arm gate noise dominates from about 10 µs on.

### Tie rule applied to earlier tables

- A44/A45 Stage 2 rerun: ion d = 7 learned (100% tie): **UNRESOLVED**, as already stated there. The A48 file confirms it (`stage2_ion.json` learned d = 7 hard 54.8 [44.7, 70.7], soft 27.4 [22.4, 86.6], both 100% tied).
- A48 Stage 2, X basis (`stage2_ion_x.json` → `optima.tauLog`): learned d = 5 hard 31.6 [27.4, 44.7] and soft 22.4 [22.4, 31.6], learned d = 7 hard 38.7 and soft 44.7, naive d = 5 hard 17.3 and naive d = 7 hard 54.8 are all ≥ 98% tied: **UNRESOLVED**.
- v1 Stage 2 and Stage 3 tables: no row reaches 50% (unchanged).

## V18 and F1 out of sample (A53b, CC-A21, Sun 11 Oct 00:43 IST)

Source: `data/results/holdout.json` (`node tools/sweep.mjs --stage holdout`). Design: DECISIONS E11, written and committed (b231184) before any held-out bank existed. All 12 planned held-out banks were used (`params.banksUsed`: d5 r3 5 of 5 per logical state, d3 r3 1 of 1). Naive pGate and learned rates come only from the original `rep_d3_r3_L0/L1` and `rep_d5_r3_L0/L1` banks; a test (`tests/sweep.test.js`, "nothing is learned from a held-out bank") fails if a held-out bank reaches `ratesFromBanks` or `estimatePGate`.

### V18: pass (`setting1`; flat ε = 0.02, hard, R = 1, both decoders on the same seed)

| d, r (pooled L0 + L1) | n | naive pL [Wilson] (cluster) | learned pL [Wilson] (cluster) | k naive → learned | paired learned − naive |
|---|---|---|---|---|---|
| 3, 3 | 8000 | 0.00988 [0.00793, 0.01229] ([0.00743, 0.01200]) | 0.00813 [0.00638, 0.01034] ([0.00613, 0.01013]) | 79 → 65 | −0.00175 [−0.00319, −0.00038] |
| 5, 3 | 40 000 | 0.00175 [0.00139, 0.00221] ([0.00135, 0.00211]) | 0.00093 [0.00067, 0.00127] ([0.00063, 0.00122]) | 70 → 37 | −0.00083 [−0.00123, −0.00050] |

- **Verdict (the V12(b) two-clause rule, unchanged):** clause 1, learned ≤ naive at every (d, r): holds. Clause 2, learned below naive beyond the Wilson intervals at d = 5: holds (0.00127 < 0.00139; the margin is narrow, and the cluster intervals agree: 0.00122 < 0.00135). **V18 passes.**
- **Paired (an addition, does not change the verdict):** learned − naive is below 0 beyond the paired interval at both distances, and in each of the four (d, L) rows at d = 5 and at d3 L0 (d3 L1: −0.0015 [−0.0038, +0.0008]).
- **Consequences:** V18 replaces V12(b) next to every naive/learned comparison (team checklist 2.1); the SP5 cut is lifted (DECISIONS, Person A section, Sun 11 Oct 00:45); HANDOFF N11 to Person B.
- **Changed from v2 (A45):** the in-sample V12(b) failed clause 2 because it had too few errors at d = 5 (13 → 7 and 20 → 9 in 8000 shots, E4); with 40 000 held-out shots the halving is resolved.

### F1 out of sample (`setting2`; ion card, Z basis, Stage 2 τ grid, d = 3 and 5, hard and soft, R = 4)

- Soft worse than hard beyond the paired cluster interval: **naive 13 of 26 points, learned 0 of 26** (`setting2.softWorseCount`). The naive points are d = 3 at τ = 5–500 µs and d = 5 at τ = 100, 200, 500 µs (`softWorsePoints`).
- d = 3, τ = 20 µs (`series`, cluster intervals): naive soft 0.01019 [0.00794, 0.01233] against hard 0.00491 [0.00345, 0.00642], paired soft − hard +0.0053 [+0.0037, +0.0071]; learned soft 0.00381 [0.00256, 0.00513] against hard 0.00372 [0.00242, 0.00505], paired +0.0001 [−0.0003, +0.0005].
- **F1 is now out of sample:** the in-sample pattern (naive soft loses, learned soft does not; "Finding F1" above) holds on banks from new simulator seeds, decoded with rates learned elsewhere. It is still post hoc (not pre-registered), and it is shown for the ion card only.

## Verdicts v2 (A53a, CC-A20, Sun 11 Oct 02:15 IST)

**Sources.** Ion: `stage2_ion_v2b.json` and `stage2_ion_x_v2b.json` (23982f7; the A48 pL values, with `loCluster`/`hiCluster`, `paired` and `shiftDelta` added; R = 4, n = 32 000 per point). Superconducting: `stage3_sc_dense.json` and `stage3_sc_x_dense.json` (42d68a3; dense grid, 27 points from 0.05 to 3 µs, R = 4, n = 32 000), and the C6 variant `stage3_sc_x_T2_25.json` (42d68a3; `provenance.overrides` T2_us = 25, UNSOURCED, illustrative, E14 (c)). Also `stage1_flat.json`, `stage1_flat_x.json`, `dem_forte1.json` and `holdout.json`, and DECISIONS rows E4 and E11–E14. `stage4_comparison.json` is not used. C3 and C4 are decided at A53c.

**Conventions.**
- Intervals are Wilson 95% in square brackets and cluster 95% (`loCluster`/`hiCluster`, a bootstrap over quantum shots) in round brackets.
- "Paired" is `paired` → `pairedClusterDiff`: the same resampled shots for both arms, and the arms share readout draws.
- τ*_log is from `optima.tauLog`. Its interval is the bootstrap over shots (B = 200); it carries no Wilson or cluster interval.
- Tie rule: any τ*_log with `fractionTied` ≥ 0.5 is **UNRESOLVED** and excluded from verdicts.
- `shiftDelta` is reported beside the pre-registered rule, never in place of it (E12, E14 (b)). It is post hoc.

### Summary

| ID | Pre-registered verdict | Changed from A49 | Changed from v1 |
|---|---|---|---|
| C1, superconducting | **Refuted** at d = 3 and 5 (dense grid) | Yes: A49, on the standard grid, had it holding at d = 3 | Yes: v1 (naive) held at d = 3 and 5 |
| C1, ion (a) crosstalk off | **Holds** | No | v1 had no crosstalk |
| C1, ion (b) card crosstalk | **Refuted** under the resolved flag and `shiftDelta`; the pre-registered point flag splits between the bases | No (`shiftDelta` added) | New clause |
| C1, ion (c) any scanned rate | Clause **not met**: an optimum below τ*_phys is resolved at 1e-3 /µs, 60× the card value | No (`shiftDelta` narrows it to X, d = 3) | New clause |
| C2 | **Holds** with the learned decoder on both arms and in both bases: Wilson, cluster and paired all count 0 points | No | **Yes:** v1 "refuted on the ion arm" was a naive-decoder artefact (F1) |
| C3 | Decided at A53c; the outcome is fixed by construction (team checklist Section 1.2 note) | — | — |
| C4 | Decided at A53c | — | — |
| C5 | **Holds in sample** (no point with learned above naive at τ*_log); out of sample, see V18 | No | New |
| C6 | Not applicable with the card. With the T2 = 25 µs variant: **undetermined** (X below Z in the point estimate at all four (d, mode) pairs, with every interval overlapping) | New (variant run) | New |
| O4 | X/Z ratio ≈ 1 at every (d, r) (measurement, no hypothesis) | No | New |
| F1 | Naive soft decoding is worse than hard; learned soft is not. Holds in sample and out of sample (post hoc) | Paired counts added | New |

### Decoder artefacts in v1, named plainly

1. **The v1 C2 loss on the ion arm was a naive-decoder artefact.** v1 reported soft decoding worse than hard on the ion arm and called C2 refuted (A28). With the learned decoder on the same banks, soft is never worse than hard beyond any interval: 0 of 39 points in Z and in X, by Wilson, cluster and paired counts (table under C2). This also holds out of sample: in `holdout.json` → `setting2.softWorseCount`, naive 13 of 26, learned 0 of 26. The mechanism is the diagonal edge class missing from the naive graph (F1 at A49).
2. **The ε = 0 spike in Stage 1 was a naive-decoder artefact.** `stage1_flat.json`, d = 3 hard: naive pL 0.0289 [0.0254, 0.0328] at ε = 0 against 0.00450 [0.00325, 0.00622] at ε = 0.005. Learned 0.00325 [0.00222, 0.00476] against 0.00387 [0.00273, 0.00549], so the spike is gone. X basis (`stage1_flat_x.json`): naive 0.0307 against 0.00363; learned 0.00263 against 0.00337. A noiseless readout is never the worst point with the learned decoder.
3. **The size of the v1 superconducting C1 shift partly came from the naive decoder.** On the dense grid only naive soft still resolves below τ*_phys (Z d = 3 soft 0.545 [0.515, 0.703] µs; `shiftDelta` resolved). No learned row does (C1 below).

### C1, superconducting (dense files, against `optima.tauPhysEmpirical` = 0.910 µs)

Pre-registered rule: refuted if the τ*_log interval contains or exceeds τ*_phys at d = 3 and 5. `shiftDelta` uses τ_ref = 0.9 µs and τ_short = 0.75 µs; it is "resolved" when pL(0.9) − pL(0.75) > 0 beyond the paired interval.

| Basis | d | Mode | Learned τ*_log (µs) [95%] | Tied | Upper bound below 0.910? | `shiftDelta` diff [paired 95%] | Resolved |
|---|---|---|---|---|---|---|---|
| Z | 3 | hard | 0.710 [0.662, 0.990] | 4.5% | no | +4.4e-4 [−3.6e-4, +1.3e-3] | no |
| Z | 3 | soft | 0.694 [0.563, 0.912] | 5.0% | no (by 0.002 µs) | +3e-5 [−9.1e-4, +1.0e-3] | no |
| Z | 5 | hard | 0.942 [0.643, 0.977] | 10.5% | no | 0 [−3.4e-4, +4.1e-4] | no |
| Z | 5 | soft | 0.844 [0.518, 0.983] | 16.0% | no | 0 [−3.4e-4, +3.4e-4] | no |
| Z | 7 | hard | 0.882 [0.557, 1.31] | 43.5% | no | −2.2e-4 [−4.1e-4, −6e-5] | no |
| Z | 7 | soft | 0.704 [0.543, 1.20] | 56% **UNRESOLVED** | — | −1.6e-4 [−3.0e-4, −3e-5] | no |
| X | 3 | hard | 0.696 [0.685, 0.946] | 4.5% | no | −2.5e-4 [−1.2e-3, +6.4e-4] | no |
| X | 3 | soft | 0.677 [0.599, 0.906] | 5.5% | **yes** (by 0.004 µs) | −5.3e-4 [−1.3e-3, +2.7e-4] | no |
| X | 5 | hard | 0.653 [0.629, 1.01] | 10.0% | no | 0 [−2.8e-4, +2.8e-4] | no |
| X | 5 | soft | 0.900 [0.642, 1.01] | 20.5% | no | −1.6e-4 [−4.1e-4, +3e-5] | no |
| X | 7 | hard | 0.775 [0.775, 0.866] | 100% **UNRESOLVED** | — | +3e-5 [0, +9e-5] | no |
| X | 7 | soft | 0.671 [0.670, 0.837] | 100% **UNRESOLVED** | — | −6e-5 [−1.6e-4, 0] | no |

**Verdict: refuted at d = 3 and d = 5.** Only X d = 3 soft has its upper bound below 0.910 µs, and only by 0.004 µs. No learned row resolves `shiftDelta`.

The reason is visible in the curve. The dense grid shows a flat valley: `stage3_sc_dense.json`, learned Z d = 3 hard, pL is 0.0065–0.0073 at every point from 0.65 to 1.0 µs. The standard grid, with points at 0.5, 0.7 and 1.0 µs only, could not show this. Its bootstrap intervals were narrower, which is why A49 had C1 holding at d = 3 (Z d = 3 hard 0.764 [0.732, 0.802] in `stage3_sc.json`). The point estimates sit below τ*_phys in 8 of the 9 resolved rows; the exception is Z d = 5 hard, at 0.942 µs. So the readout time that is best for the code most likely lies somewhat below 0.91 µs, but within a flat valley that these statistics cannot separate from τ*_phys.

For comparison, the naive dense rows: Z d = 3 soft 0.545 [0.515, 0.703] µs and Z d = 5 soft 0.547 [0.533, 0.756] µs have upper bounds below 0.910 µs; only the d = 3 soft row resolves `shiftDelta` (+2.1e-3 [+8.6e-4, +3.6e-3]).

- **Changed from A49:** d = 3 moves from "holds" to "refuted", because the dense grid replaces the standard grid (E14 (d)). Cluster intervals play no part.
- **Changed from v1:** v1 (naive, standard grid) held at d = 3 and 5.

### C1, ion (`crosstalkScan` in the v2b files, learned, R = 2, n = 16 000 per point, B = 200)

τ*_phys = 23.5 µs (`crosstalkScan.tauPhys`, the belief value; the empirical value is 23.0 µs). The point and resolved flags are as at A49, with identical τ*_log values. New is `shiftDelta`, with τ_ref = 20 µs and τ_short = 15 µs.

- **(a) Crosstalk off, no idle-driven optimum: holds.** The point flag is true only for Z d = 3 at rate 0, and both of those intervals contain 23.5 µs (hard 15.2 [13.9, 27.4] µs; soft 14.1 [11.8, 500] µs). The resolved flag is false everywhere. `shiftDelta` is not resolved anywhere at rate 0 (Z d = 3 hard +1.9e-4 [0, +4.4e-4]: the lower bound is 0, not above it). Z d = 5 hard at rate 0 is 61.5% tied and UNRESOLVED.
- **(b) Crosstalk at the card value (1.67e-5 /µs): REFUTED under the resolved flag and under `shiftDelta`. The pre-registered point flag splits between the bases.**
  - Every interval contains 23.5 µs: Z d = 3 hard 30.2 [21.2, 36.8] µs; X d = 3 hard 19.3 [16.2, 47.5] µs.
  - `shiftDelta` resolves in neither basis: Z d = 3 hard −1.3e-4 [−5.6e-4, +1.9e-4]; X d = 3 hard −6e-5 [−2.8e-4, +1.3e-4].
  - Under the point flag, Z shows no optimum below τ*_phys at any (d, mode) and X shows one at every (d, mode). The X d = 5 rows are 100% tied and so UNRESOLVED.
  - The verdict by the pre-registered point flag is therefore split (E12 (a)).
- **(c) "No interior optimum at any scanned rate": not met.**
  - Resolved flag: an optimum below τ*_phys is resolved only at 1e-3 /µs (60× the card value), in Z at d = 3 and 5 and in X at d = 3, each in both modes.
  - `shiftDelta` resolves it in only two of those rows, X d = 3 at 1e-3 /µs: hard +1.75e-3 [+4.4e-4, +3.0e-3], soft +1.37e-3 [+6e-5, +2.5e-3]. The Z rows at 1e-3 /µs are not resolved by `shiftDelta` (d = 3 hard +7.5e-4 [−5.6e-4, +2.0e-3]).
  - Either way the clause is met only where crosstalk is as large as gate noise (A49), so meeting it says little.
- **Changed from A49:** none in the verdicts; `shiftDelta` is added. **Changed from v1:** v1 had no crosstalk term, and its "held on the ion arm" referred to the v1 statement.

### C2 (learned): soft decoding at or below hard at every τ, most gain at short τ

These are the A49 counts redone. "Wilson" is `validation.C2` → `softAboveBeyondIntervals`. "Cluster" is soft `loCluster` > hard `hiCluster` (unpaired). "Paired" is `paired` → `softMinusHard` with lo > 0. Points shown are per arm and basis (ion: 13 τ × d = 3, 5, 7; superconducting dense: 27 τ × 3 d).

| Arm (file) | Basis | Decoder | Points | Soft above hard: Wilson | Cluster | Paired | Soft below hard, paired |
|---|---|---|---|---|---|---|---|
| Ion (`stage2_ion_v2b.json`) | Z | **learned** | 39 | **0** | **0** | **0** | 13 |
| Ion (`stage2_ion_x_v2b.json`) | X | **learned** | 39 | **0** | **0** | **0** | 15 |
| Superconducting (`stage3_sc_dense.json`) | Z | **learned** | 81 | **0** | **0** | **0** | 31 |
| Superconducting (`stage3_sc_x_dense.json`) | X | **learned** | 81 | **0** | **0** | **0** | 35 |
| Ion | Z | naive | 39 | 13 | 8 | 18 | 11 |
| Ion | X | naive | 39 | 9 | 9 | 10 | 11 |
| Superconducting | Z | naive | 81 | 0 | 0 | 0 | 64 |
| Superconducting | X | naive | 81 | 1 | 0 | 1 (d = 3, 0.5 µs) | 58 |

**Verdict (learned): holds on both arms in both bases, under all three counts.** The "most gain at short τ" part also holds. Learned d = 3, paired soft − hard:
- Ion Z: −0.21 [−0.21, −0.20] at 1 µs and −6.4e-3 [−8.7e-3, −4.3e-3] at 5 µs; no point is resolved from 7 to 200 µs; −9.4e-4 [−1.6e-3, −3.1e-4] at 500 µs.
- Superconducting Z: resolved gains at every point from 0.1 µs (−9.1e-3) to 0.65 µs (−1.0e-3), largest at 0.2 µs (−0.045 [−0.049, −0.041]), and smaller resolved gains at some longer τ.

With the naive decoder the paired count on the ion arm is higher than the Wilson one (Z: 18 against 13), because pairing removes the shared gate faults. The extra points are d = 5 at 7, 10, 30, 50 and 100 µs. **Changed from v1:** v1 (naive) refuted C2 on the ion arm; that loss was the naive decoder (artefact 1 above).

### C3 and C4

C3: decided at A53c; the outcome is fixed by construction (team checklist Section 1.2 note). C4: decided at A53c.

### C5 (in sample): learned at or below naive at τ*_log

Each (arm, basis, d, mode) is compared at the grid point nearest the learned τ*_log, using `series` and `paired` → `learnedMinusNaive`. The rates are learned from the banks being decoded, so this is **in sample**. Refutation: learned above naive beyond the intervals.

| Arm | Basis | d | Mode | τ (µs) | Learned pL [Wilson] (cluster) | Naive pL [Wilson] (cluster) | Paired learned − naive |
|---|---|---|---|---|---|---|---|
| Ion | Z | 3 | hard | 20 | 0.00331 [0.00274, 0.00400] (0.00217, 0.00456) | 0.00347 [0.00288, 0.00418] (0.00220, 0.00475) | −1.6e-4 [−1.0e-3, +7.5e-4] |
| Ion | Z | 3 | soft | 20 | 0.00356 [0.00297, 0.00428] (0.00237, 0.00488) | 0.00737 [0.00649, 0.00837] (0.00562, 0.00916) | **−3.8e-3** [−5.3e-3, −2.3e-3] |
| Ion | Z | 5 | hard | 100 | 2.2e-4 [1.1e-4, 4.5e-4] (3e-5, 5.5e-4) | 9.1e-4 [6.3e-4, 1.3e-3] (3.8e-4, 1.6e-3) | **−6.9e-4** [−1.3e-3, −5e-5] |
| Ion | Z | 5 | soft | 100 | 1.6e-4 [6.7e-5, 3.7e-4] (0, 5.0e-4) | 1.6e-3 [1.2e-3, 2.1e-3] (9.1e-4, 2.4e-3) | **−1.5e-3** [−2.3e-3, −6.7e-4] |
| Ion | Z | 7 | both | — | τ*_log UNRESOLVED (100% tied) | | |
| Ion | X | 3 | hard | 30 | 0.00291 [0.00237, 0.00356] (0.00194, 0.00405) | 0.00294 [0.00240, 0.00359] (0.00184, 0.00409) | −3e-5 [−7.2e-4, +7.2e-4] |
| Ion | X | 3 | soft | 50 | 0.00272 [0.00220, 0.00335] (0.00164, 0.00391) | 0.00713 [0.00626, 0.00811] (0.00545, 0.00874) | **−4.4e-3** [−6.0e-3, −3.0e-3] |
| Ion | X | 5, 7 | both | — | τ*_log UNRESOLVED (100% tied) | | |
| Superconducting | Z | 3 | hard | 0.7 | 0.00653 [0.00571, 0.00747] (0.00514, 0.00784) | 0.0230 [0.0214, 0.0247] (0.0201, 0.0260) | **−0.0164** [−0.0195, −0.0139] |
| Superconducting | Z | 3 | soft | 0.7 | 0.00594 [0.00515, 0.00684] (0.00451, 0.00741) | 0.0131 [0.0119, 0.0144] (0.0112, 0.0152) | **−7.2e-3** [−8.8e-3, −5.7e-3] |
| Superconducting | Z | 5 | hard | 0.95 | 5.6e-4 [3.6e-4, 8.9e-4] (2.8e-4, 9.2e-4) | 3.2e-3 [2.6e-3, 3.8e-3] (2.1e-3, 4.2e-3) | **−2.6e-3** [−3.6e-3, −1.8e-3] |
| Superconducting | Z | 5 | soft | 0.85 | 1.2e-3 [8.4e-4, 1.6e-3] (7.5e-4, 1.6e-3) | 3.1e-3 [2.6e-3, 3.8e-3] (2.3e-3, 4.0e-3) | **−2.0e-3** [−2.7e-3, −1.3e-3] |
| Superconducting | Z | 7 | hard | 0.9 | 6.3e-5 [1.7e-5, 2.3e-4] (0, 1.6e-4) | 1.0e-3 [7.1e-4, 1.4e-3] (5.6e-4, 1.5e-3) | **−9.4e-4** [−1.4e-3, −5.0e-4] |
| Superconducting | Z | 7 | soft | — | τ*_log UNRESOLVED (56% tied) | | |
| Superconducting | X | 3 | hard | 0.7 | 0.00491 [0.00420, 0.00573] (0.00372, 0.00602) | 0.0238 [0.0222, 0.0255] (0.0206, 0.0267) | **−0.0189** [−0.0221, −0.0160] |
| Superconducting | X | 3 | soft | 0.7 | 0.00462 [0.00394, 0.00543] (0.00353, 0.00595) | 0.0108 [0.00977, 0.0120] (0.00911, 0.0127) | **−6.2e-3** [−7.8e-3, −4.8e-3] |
| Superconducting | X | 5 | hard | 0.65 | 4.1e-4 [2.4e-4, 7.0e-4] (1.6e-4, 7.2e-4) | 2.2e-3 [1.7e-3, 2.8e-3] (1.3e-3, 3.1e-3) | **−1.8e-3** [−2.6e-3, −1.1e-3] |
| Superconducting | X | 5 | soft | 0.9 | 2.8e-4 [1.5e-4, 5.3e-4] (6e-5, 5.9e-4) | 1.1e-3 [7.9e-4, 1.5e-3] (6.3e-4, 1.7e-3) | **−8.1e-4** [−1.3e-3, −4.1e-4] |
| Superconducting | X | 7 | both | — | τ*_log UNRESOLVED (100% tied) | | |

**Verdict: holds in sample.**
- Of the 15 rows with a resolved τ*_log, learned is above naive beyond the intervals at 0, under Wilson and under paired intervals. It is below beyond them at 13 (the bold rows), under both Wilson and paired intervals.
- The two exceptions are ion d = 3 hard in Z and in X, where learned equals naive within about 5%. The statement "lowers … at every (d, arm, mode)" is met only in the weak sense: learned is never higher, but it is not always lower.
- Over all grid points, the paired learned − naive is above 0 at 2 of 162 superconducting Z points: d = 3 hard at 0.2 µs (+6.3e-3) and d = 5 soft at 0.05 µs (+3.3e-3). Both are short-τ points where pL is 0.1 to 0.5, far from τ*_log. It is above 0 at no superconducting X point and no ion point.
- **Out of sample:** V18 passes (`holdout.json` → `setting1`; flat ε = 0.02, hard, d = 3 and 5 r = 3; DECISIONS E4 and E11). The held-out ion-card comparison (`setting2`) is the basis for the final C5 at A53c.
- **Changed from A49/A50:** the paired intervals are added, and the verdict is unchanged. The A50 note "IN SAMPLE … V18 decides it at A53b" is now answered: V18 passed.

### C6 (variant card T2 = 25 µs, X, against the dense Z file; learned, d = 3 and 5)

C6 is not applicable with the card, where T2 = 77 µs ≥ T1 = 50 µs (E12 (b)). The variant (E14 (c)) changes only T2. Its X idle probability at 1 µs is 0.0196, against Z 0.0099 and X with the card 0.0065 (`budget.idle`). Refutation: τ*_log(X) ≥ τ*_log(Z) beyond the intervals.

| d | Mode | Z (`stage3_sc_dense.json`) τ*_log [95%] | X, T2 = 25 (`stage3_sc_x_T2_25.json`) | X, card (`stage3_sc_x_dense.json`), for reference | Outcome |
|---|---|---|---|---|---|
| 3 | hard | 0.710 [0.662, 0.990] | 0.691 [0.640, 0.792] | 0.696 [0.685, 0.946] | X shorter in the point estimate; overlap |
| 3 | soft | 0.694 [0.563, 0.912] | 0.644 [0.548, 0.728] | 0.677 [0.599, 0.906] | X shorter; overlap |
| 5 | hard | 0.942 [0.643, 0.977] | 0.798 [0.596, 0.810] | 0.653 [0.629, 1.01] | X shorter; overlap |
| 5 | soft | 0.844 [0.518, 0.983] | 0.603 [0.561, 0.805] | 0.900 [0.642, 1.01] | X shorter; overlap |

No row is tied 50% or more (largest 16%).

**Verdict: undetermined.** The direction agrees with C6 at all four (d, mode) pairs, and nothing refutes it, but no difference is resolved.

**pL difference at matching τ** (X, T2 = 25, minus Z, learned). The two files decode different banks (`repx_*` against `rep_*`), so a paired difference is not possible. The interval combines the two cluster half-widths in quadrature.
- d = 3 hard: +3.1e-3 [+3.4e-4, +6.0e-3] at 0.4 µs; +3.0e-3 [+9.8e-4, +5.0e-3] at 0.7 µs; +4.7e-3 [+2.6e-3, +6.8e-3] at 1.0 µs; +0.021 [+0.018, +0.024] at 3 µs.
- d = 5 hard: unresolved from 0.6 to 0.8 µs (for example 0 [−5.6e-4, +5.5e-4] at 0.7 µs); +9.4e-4 [+2.5e-4, +1.6e-3] at 1.0 µs; +8.9e-3 [+7.4e-3, +0.010] at 3 µs.
- The soft rows look the same.

The extra dephasing raises X pL more the longer the readout, and this is resolved at d = 3. That is the mechanism C6 relies on. At d = 5, near the optimum, the curves cannot be told apart.

**Changed from A49:** not applicable at A49; the variant is new.

### O4 (`dem_forte1.json` → `ratioXoverZ`)

These are unchanged from A49. The X/Z bulk detector-rate ratio is 1.041 [0.894, 1.213] (d3 r1), 1.027 [0.959, 1.100] (d3 r3), 1.000 [0.953, 1.048] (d5 r3), 1.029 [0.995, 1.064] (d5 r5) and 1.021 [0.983, 1.061] (d7 r3). All 5 intervals contain 1. Measurement, no hypothesis (E5).

### F1 (post hoc): the naive decoder makes soft decoding lose; the learned decoder does not

- **In sample** (v2b files, soft worse than hard beyond the intervals). Z: naive 13 of 39 (Wilson) and 18 of 39 (paired); learned 0 and 0. X: naive 9 and 10; learned 0 and 0.
  - Example, Z d = 3 at 20 µs: naive soft 0.00737 [0.00649, 0.00837] (0.00562, 0.00916) against hard 0.00347 [0.00288, 0.00418] (0.00220, 0.00475), paired +3.9e-3 [+2.5e-3, +5.3e-3].
  - Learned at the same point: soft 0.00356 (0.00237, 0.00488) against hard 0.00331 (0.00217, 0.00456), paired +2.5e-4 [−3e-5, +5.6e-4].
- **Out of sample** (`holdout.json` → `setting2`, paired cluster): naive 13 of 26 points, learned 0 of 26 (A53b).
- **Changed from v1:** F1 is what replaces v1's "C2 refuted"; it is not a pre-registered result.

### Where a cluster or paired result changes a verdict reached with Wilson intervals

**None of the pre-registered verdicts changes.** Each place where the counts or the flags change:

1. **C2, naive** (comparison only, not the verdict): ion Z soft-worse count 13 (Wilson) → 8 (cluster, unpaired) → 18 (paired); ion X 9 → 9 → 10; superconducting X 1 → 0 → 1. The learned counts stay 0 under all three.
2. **C5 at τ*_log:** ion X d = 5 soft is "overlap" under Wilson and "learned below" under the paired interval. Its τ*_log is UNRESOLVED, so it is excluded either way. No row moves towards "learned above".
3. **C1 ion (c):** under the resolved flag, an optimum below τ*_phys at 1e-3 /µs is shown in 6 rows. Under `shiftDelta` it is shown in 2 (X d = 3, both modes). The clause is not met either way.
4. **C1 ion (b):** `shiftDelta` agrees with the resolved flag (refuted in both bases).
5. **C1 superconducting:** `shiftDelta` resolves no learned row, which agrees with "refuted". Note that the verdict change from A49 (d = 3 holds → refuted) comes from the dense grid, not from cluster or paired intervals.
6. **V18** (A53b): the cluster intervals agree with the Wilson verdict (learned upper bound 0.00122 against naive lower bound 0.00135 at d = 5).

## Final verdicts in plain language (A55, Sun 11 Oct 03:18 IST)

Final Stage 4 (`stage4_comparison.json`, 0fdb7c4; learned decoder). The plain texts are copied from `conclusions[*].plain`, `findings[*].plain` and `framingPlain`, edited by Person A at A55 (DECISIONS E15). This is the verdict column for the scoreboard and the page.

**Framing:** Same IonQ-simulated circuits and gate noise, two ways of reading qubits out: a controlled comparison, not a hardware benchmark.

| ID | Verdict | In plain language |
|---|---|---|
| C1 | **Refuted** | In neither qubit type does the code reliably want a shorter readout than a single qubit does. |
| C2 | **Held** | Weighing each readout by its confidence never hurt with the learned decoder, and helped most for short readouts. |
| C3 | **Held**, fixed by construction (`informative: false`) | The ion makes fewer errors per round, the superconducting qubit more rounds per second; our parameters guaranteed this. |
| C4 | **Undetermined** | Undecided: on the superconducting qubit, distance 5 beat distance 3 at every readout quality tried, leaving nothing to compare. |
| C5 | **Held** (out of sample for the ion, Z, d = 3 and 5) | Learning the noise from the data never made decoding worse, and usually made it clearly better. |
| C6 | **Not applicable** with the card; T2 = 25 µs variant undetermined | Does not apply: our superconducting qubit loses phase more slowly than energy. An invented faster-dephasing qubit leans yes, unresolved. |
| O4 | Measurement, no verdict | Measured, not tested: IonQ’s simulated gate noise looks the same to the decoder for bit flips and phase flips. |
| F1 | Finding (post hoc), out of sample | Readout confidence seemed to hurt the ion only because the first decoder ignored a common error; fresh data confirm it. |

C3's note now gives the cycle-time ratio from the files, about 3800× at d = 3 (3787×), instead of "about 2000×".
