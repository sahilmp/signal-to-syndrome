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

Not measured yet (CC-09). To record: V7, V10; F1-ion (τ*_phys, with and without pumping); F2-ion (hard against soft, τ*_log per distance or "no interior minimum").

## Stage 3: superconducting readout

Not measured yet (CC-12). To record: V4, V8, V10; F1-sc and F2-sc; τ*_phys and τ*_log.

## Hypotheses C1–C4

Not evaluated yet. Stage 1 bears on none of them directly; it fixes the gate-noise floor (pGate ≈ 0.013) against which the readout effects of Stages 2 and 3 are measured.
