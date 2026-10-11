import stage1 from '../../data/results/stage1_flat.json' with { type: 'json' };
import stage2 from '../../data/results/stage2_ion.json' with { type: 'json' };
import stage3 from '../../data/results/stage3_sc.json' with { type: 'json' };
import stage4 from '../../data/results/stage4_comparison.json' with { type: 'json' };
import bankD3R1 from '../../data/banks/rep_d3_r1_L0.json' with { type: 'json' };
import bankD3R3 from '../../data/banks/rep_d3_r3_L0.json' with { type: 'json' };
import paramsIon from '../../params/ion.json' with { type: 'json' };
import paramsSc from '../../params/sc.json' with { type: 'json' };
import paramsCycle from '../../params/cycle.json' with { type: 'json' };
export { stage1, stage2, stage3, stage4, bankD3R1, bankD3R3, paramsIon, paramsSc, paramsCycle };

// v2 (team checklist Appendix U3): fixtures until the switch rows 13, 17, 18 and 22.
// Row 13 (SP5): demForte1 and stage1v2-stage3v2 are real results.
// Rows 17, 18, 22 (SP6): v2 params, X-basis results and Stage 4 v2.
// Row 29 (revision 2.1, N12): stage2v2 and stage2x are the v2b files (the same pL values plus
// cluster intervals, paired and shiftDelta). Deviation agreed with Person A (Sun 11 Oct, after
// CC-A22): stage3v2 and stage3x are the dense-grid files, which the final Stage 4 and the C1
// verdict use, instead of the standard-grid ones, so every superconducting value on the page
// is the one Stage 4 quotes. Row 32 (N7b): stage4v2 keeps its path; the file is final.
import demForte1 from '../../data/results/dem_forte1.json' with { type: 'json' };
import stage1v2 from '../../data/results/stage1_flat.json' with { type: 'json' };
import stage2v2 from '../../data/results/stage2_ion_v2b.json' with { type: 'json' };
import stage3v2 from '../../data/results/stage3_sc_dense.json' with { type: 'json' };
import stage4v2 from '../../data/results/stage4_comparison.json' with { type: 'json' };
import stage1x from '../../data/results/stage1_flat_x.json' with { type: 'json' };
import stage2x from '../../data/results/stage2_ion_x_v2b.json' with { type: 'json' };
import stage3x from '../../data/results/stage3_sc_x_dense.json' with { type: 'json' };
// B49 (U7.9): Level 5 v2 in the phase-flip memory.
import stage4x from '../../data/results/stage4_comparison_x.json' with { type: 'json' };
import paramsIonV2 from '../../params/ion.json' with { type: 'json' };
import paramsScV2 from '../../params/sc.json' with { type: 'json' };
import paramsCycleV2 from '../../params/cycle.json' with { type: 'json' };
export {
  demForte1, stage1v2, stage2v2, stage3v2, stage4v2, stage1x, stage2x, stage3x, stage4x,
  paramsIonV2, paramsScV2, paramsCycleV2,
};
// A53 review: the stored phase-flip d = 3, r = 3 shots for Level 3's batch in the X basis
// (item 14), and the held-out test (V18) for "Learn the noise", step 3 (item 6).
import bankXD3R3 from '../../data/banks/repx_d3_r3_L0.json' with { type: 'json' };
import holdout from '../../data/results/holdout.json' with { type: 'json' };
export { bankXD3R3, holdout };
// B50 (U7.11): curated Level 4 examples, written by tools/curate.mjs (Person B's data).
import curatedShots from '../../data/curated/curated_shots.json' with { type: 'json' };
export { curatedShots };
// P5 (writeup): docs/project_page.md without its source comments, written by tools/make_writeup.mjs.
import writeupData from '../../data/writeup/project_page.json' with { type: 'json' };
export { writeupData };
