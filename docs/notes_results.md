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
| Empirical (Wilson 95%) | 0.311 | 0.122 | 0.0480 | 4.9e-3 [4.6, 5.2]e-3 | 9.8e-4 [8.5e-4, 1.1e-3] | 5.7e-4 [4.8e-4, 6.9e-4] | 7.0e-4 [5.9e-4, 8.2e-4] | 9.4e-4 [8.1e-4, 1.1e-3] | 1.3e-3 [1.2e-3, 1.5e-3] | 2.3e-3 [2.1e-3, 2.6e-3] | 5.0e-3 [4.7e-3, 5.3e-3] |
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

Not measured yet (CC-12). To record: V4, V8, V10; F1-sc and F2-sc; τ*_phys and τ*_log.

## Hypotheses C1–C4

Stage 1 bears on none of them directly; it fixes the gate-noise floor (pGate ≈ 0.013) against which the readout effects of Stages 2 and 3 are measured. C3 and C4 need Stage 3 and are not evaluated yet.

### Ion arm: C1 and C2

Source: `data/results/stage2_ion.json` (Wilson 95% for pL and assignment error, n = 32 000 per point; 95% bootstrap with B = 200 for τ*_log). **On the ion arm C1 holds and C2 fails as stated.** For C1, the idle flip probability 0.5 (1 − e^(−τ/T1)) stays at or below 2.5e-5 over the whole 1–500 µs grid, about 20× below the readout error at its optimum, so idling cannot create an optimum; the optimum that does appear comes from dark→bright pumping during detection. The empirical assignment error falls to 5.7e-4 [4.8e-4, 6.9e-4] at τ = 20 µs and rises to 5.0e-3 [4.7e-3, 5.3e-3] at 500 µs (fitted τ*_phys = 23.5 µs), and the hard-mode logical optima are consistent with it: τ*_log = 31.6 µs [20.0, 81.2] at d = 3 (an exact tie between 20 and 50 µs) and 22.9 µs [14.1, 189] at d = 5, both intervals containing τ*_phys. The minimum is shallow, though: from 10 to 500 µs the d = 3 hard pL stays between 0.0035 [0.0029, 0.0042] and 0.0040 [0.0034, 0.0048], so beyond about 10 µs the gate-noise floor, not τ, sets the logical error; the d = 7 hard optimum (11.8 µs [11.2, 44.7]) rests on 3, 4 and 5 errors at τ = 10, 15 and 20 µs and is not resolved. For C2, soft is at or below hard at only 13 of the 39 (d, τ) points. It wins clearly where readout is photon-starved (τ ≤ 3 µs at every d, and also τ = 5 µs at d = 5 and 7): at τ = 1 µs, d = 7 soft gives 0.0499 [0.0475, 0.0523] against hard 0.394 [0.389, 0.400], and d = 3 gives 0.148 [0.144, 0.152] against 0.352 [0.347, 0.358], so the falsifier "no significant gain anywhere" is not met and the second half of C2 ("helps most where readouts are short and ambiguous") holds. From τ = 7 µs on, soft is worse: above hard beyond the intervals at 11 points, 9 of them at d = 3 (every τ from 7 to 500 µs; τ = 20 µs gives 0.0072 [0.0063, 0.0081] against 0.0035 [0.0029, 0.0042]) and 2 at d = 5, and with overlapping intervals at d = 7. The soft-mode τ*_log is therefore unresolved (at d = 3 and 5 the lowest point is the grid end, with 67–68% of bootstrap replicates there). Split by logical state, the soft loss is on L0 at short and intermediate τ and moves to L1 from about 50 µs, following which readings the llr makes cheap; that asymmetry is intrinsic to matching with correct priors and also appears on model-matched synthetic data, where soft nevertheless wins pooled. The pooled loss on the real banks therefore points to the decoder's uniform-pGate edge model (no correlated or diagonal circuit faults), not to the readout model, whose llr passes V10, nor to the soft decoder, which is exact on soft weights.
