"""Independent cross-check of src/core/matching.js against PyMatching (validation V2).

Usage: python validation/pymatching_check.py [data/vectors/vectors_d3_r3.json ...]
With no arguments, every data/vectors/vectors_*.json is checked.

For each vector file (written by tools/export_vectors.mjs) the decoding graph is
rebuilt in PyMatching from the file's edge list (space, time and, since V2b,
diagonal edges) and every shot's syndrome is decoded. On every shot where
our decoder was exact, ourCost must equal PyMatching's solution weight to 1e-9;
otherwise it is a cost mismatch (our matching is not minimum-weight, whatever the
flip). A prediction that differs from ourFlip on an exact shot is a tie when the
two weights agree, otherwise a genuine mismatch. Mismatches on shots where our
decoder was not exact (greedy) are reported but do not fail.
Exit status 1 on any genuine mismatch or cost mismatch.
"""

import glob
import json
import os
import sys

import numpy as np
import pymatching

TIE_TOL = 1e-9


def build_matching(data):
    m = pymatching.Matching()
    for e in data["edges"]:
        fault_ids = {0} if e["observable"] else set()
        if e["v"] == -1:
            m.add_boundary_edge(e["u"], weight=e["weight"], fault_ids=fault_ids)
        else:
            m.add_edge(e["u"], e["v"], weight=e["weight"], fault_ids=fault_ids)
    return m


def check_file(path):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    m = build_matching(data)
    n_det = data["nDetectors"]
    if m.num_detectors != n_det:
        raise SystemExit(f"{path}: PyMatching has {m.num_detectors} detectors, file says {n_det}")

    stats = {"shots": 0, "agree": 0, "ties": 0, "genuine": 0, "costMismatch": 0, "nonExact": 0,
             "nonExactMismatch": 0, "pmLogical": 0, "ourLogical": 0}
    genuine_examples = []
    cost_examples = []
    for idx, shot in enumerate(data["shots"]):
        syndrome = np.zeros(n_det, dtype=np.uint8)
        syndrome[shot["lit"]] = 1
        pred, weight = m.decode(syndrome, return_weight=True)
        pm_flip = int(pred[0])
        stats["shots"] += 1
        stats["pmLogical"] += pm_flip != shot["trueFlip"]
        stats["ourLogical"] += shot["ourFlip"] != shot["trueFlip"]
        if not shot["ourExact"]:
            stats["nonExact"] += 1
        elif abs(float(weight) - shot["ourCost"]) >= TIE_TOL:
            stats["costMismatch"] += 1
            if len(cost_examples) < 5:
                cost_examples.append((idx, shot["lit"], shot["ourCost"], float(weight)))
        if pm_flip == shot["ourFlip"]:
            stats["agree"] += 1
            continue
        if not shot["ourExact"]:
            stats["nonExactMismatch"] += 1
        elif abs(float(weight) - shot["ourCost"]) < TIE_TOL:
            stats["ties"] += 1
        else:
            stats["genuine"] += 1
            if len(genuine_examples) < 5:
                genuine_examples.append((idx, shot["lit"], shot["ourCost"], float(weight)))
    return data, stats, genuine_examples, cost_examples


def main(paths):
    if not paths:
        root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "vectors")
        paths = sorted(glob.glob(os.path.join(root, "vectors_*.json")))
    if not paths:
        print(__doc__)
        return 2
    print(f"pymatching {pymatching.__version__}")
    header = f"{'file':<24} {'d':>2} {'r':>2} {'diag':>4} {'edges':>5} {'shots':>6} {'agree':>6} {'ties':>5} {'genuine':>7} " \
             f"{'costMis':>7} {'nonExact':>8} {'nonExMis':>8} {'pL ours':>8} {'pL PM':>8}"
    print(header)
    print("-" * len(header))
    total_genuine = 0
    total_cost = 0
    for path in paths:
        data, s, examples, cost_examples = check_file(path)
        name = path.replace("\\", "/").split("/")[-1]
        n = s["shots"]
        diag = "yes" if data.get("diagonal") else "no"
        print(f"{name:<24} {data['d']:>2} {data['r']:>2} {diag:>4} {len(data['edges']):>5} {n:>6} {s['agree']:>6} {s['ties']:>5} "
              f"{s['genuine']:>7} {s['costMismatch']:>7} {s['nonExact']:>8} {s['nonExactMismatch']:>8} "
              f"{s['ourLogical'] / n:>8.5f} {s['pmLogical'] / n:>8.5f}")
        for idx, lit, ours, pm in examples:
            print(f"    genuine mismatch: shot {idx}, lit {lit}, ourCost {ours:.12g}, pmWeight {pm:.12g}")
        for idx, lit, ours, pm in cost_examples:
            print(f"    cost mismatch: shot {idx}, lit {lit}, ourCost {ours:.12g}, pmWeight {pm:.12g}")
        total_genuine += s["genuine"]
        total_cost += s["costMismatch"]
    print("-" * len(header))
    print("ties: predictions differ but solution weights agree within 1e-9; "
          "costMis: exact shots whose ourCost differs from PyMatching's weight by >= 1e-9 (any flip); "
          "nonExMis: mismatches on greedy (ourExact = false) shots, not failures")
    failed = total_genuine or total_cost
    print("RESULT:", "FAIL" if failed else "PASS",
          f"({total_genuine} genuine mismatches, {total_cost} cost mismatches)")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
