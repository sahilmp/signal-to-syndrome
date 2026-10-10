# Signal to Syndrome: prepare-and-measure check of the simulator's measurement error (V19,
# DECISIONS E13) (runs on Qollab).
#
# Does the forte-1 noise model already contain state-preparation and measurement (SPAM)
# error? Circuit A prepares 5 qubits in |0> and measures them; circuit B applies one X to each
# of 5 qubits and measures them. Qollab allows one job per code run (DECISIONS, platform
# facts), so by default A and B run side by side in one 10-qubit circuit: qubits 0..4 are
# circuit A, qubits 5..9 are circuit B. PART = "A" or "B" runs one of them alone on 5 qubits
# (a fallback; two runs per noise model).
#
# How to use: pick IonQ Forte 1 in the Select QPU dialog, set NOISE_MODEL, run, and copy
# everything from BEGIN_SPAM to END_SPAM into data/raw/spam_<model>.txt. Two runs: "ideal"
# and "forte-1".

# ---- Settings: NOISE_MODEL is the only line to edit between runs ------------------------
NOISE_MODEL = "forte-1"  # "ideal" or "forte-1"
PART = "AB"  # "AB" (one job, both circuits), or "A" / "B" alone
N_QUBITS = 5
SHOTS = 4000
# One fixed sampler seed per noise model (DECISIONS D2), distinct from every seed in
# bank_generator.py: draws 13 and 14 of random.Random(20261010).randrange(1, 2**31), after
# the 12 held-out bank seeds.
SEEDS = {
    "ideal": 765959242,
    "forte-1": 544939246,
}
# -------------------------------------------------------------------------------------------

import math
import time

from qiskit import ClassicalRegister, QuantumCircuit, QuantumRegister, transpile
from qiskit.providers.jobstatus import JobStatus

POLL_SECONDS = 5


def build_spam_circuit(part, n=N_QUBITS):
    """Returns (circuit, groups), groups = {"A": [qubits], "B": [qubits]} for the parts present.
    Qubit q is measured into classical bit q. Group A is left in |0>; group B gets one X each."""
    if part not in ("AB", "A", "B"):
        raise ValueError(f"PART must be 'AB', 'A' or 'B', got {part!r}")
    groups = {}
    q = 0
    for g in ("A", "B"):
        if g in part:
            groups[g] = list(range(q, q + n))
            q += n
    qr = QuantumRegister(q, "q")
    cr = ClassicalRegister(q, "c")
    qc = QuantumCircuit(qr, cr)
    for i in groups.get("B", []):
        qc.x(i)
    for i in range(q):
        qc.measure(i, i)
    return qc, groups


def run_native(qc, shots, noise_model, seed):
    """The native-gate recipe of DECISIONS D1, as in bank_generator.py. Uses Qollab's
    pre-existing `backend`."""
    if backend.options.get("noise_model") != "forte-1":  # noqa: F821 (supplied by Qollab)
        raise RuntimeError("The backend is not IonQ Forte 1. Pick IonQ Forte 1 in the "
                           "Select QPU dialog, then run again.")
    nb = backend.with_name(backend.name, gateset="native", noise_model=noise_model)  # noqa: F821
    # The seed only takes effect through set_options (DECISIONS D2), never as a run() argument.
    nb.set_options(noise_model=noise_model, sampler_seed=seed)
    qn = transpile(qc, backend=nb)
    native_ops = {str(k): int(v) for k, v in dict(qn.count_ops()).items()}
    job = nb.run(qn, shots=shots)
    while True:
        status = job.status()
        if status in (JobStatus.DONE, JobStatus.ERROR, JobStatus.CANCELLED):
            break
        time.sleep(POLL_SECONDS)
    if status != JobStatus.DONE:
        raise RuntimeError(f"Job {job.job_id()} ended with status {status.name}; no result.")
    return job.result().get_counts(), job.job_id(), native_ops


def wilson(k, n, z=1.96):
    """Wilson score interval, the same formula as src/core/stats.js wilson()."""
    if n == 0:
        return 0.0, 0.0, 1.0
    p = k / n
    den = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / den
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return p, max(0.0, centre - half), min(1.0, centre + half)


def flip_counts(counts, groups, n_clbits):
    """Per qubit: (number of shots whose reading differs from the prepared bit, total shots).
    Classical bit b of a Qiskit binary key is the character at position -1 - b."""
    out = {}
    total = 0
    for key, c in counts.items():
        bits = key.replace(" ", "")
        if len(bits) != n_clbits:
            raise ValueError(f"key '{key}' has {len(bits)} bits, expected {n_clbits}")
        total += c
        for g, qubits in groups.items():
            prep = 1 if g == "B" else 0
            for q in qubits:
                if int(bits[-1 - q]) != prep:
                    out[q] = out.get(q, 0) + c
    return {q: (out.get(q, 0), total) for qs in groups.values() for q in qs}


def main():
    if NOISE_MODEL not in SEEDS:
        raise ValueError(f"NOISE_MODEL must be one of {', '.join(SEEDS)}, got {NOISE_MODEL!r}")
    seed = SEEDS[NOISE_MODEL]
    qc, groups = build_spam_circuit(PART)
    print(f"spam_check: part {PART}, {qc.num_qubits} qubits, {SHOTS} shots, "
          f"noise model {NOISE_MODEL}, seed {seed}")
    counts, job_id, native_ops = run_native(qc, SHOTS, NOISE_MODEL, seed)
    flips = flip_counts(counts, groups, qc.num_clbits)

    print(f"BEGIN_SPAM noise_model={NOISE_MODEL} sampler_seed={seed} part={PART} shots={SHOTS}")
    print(f"backend {backend.name} job_id {job_id} native_ops {native_ops}")  # noqa: F821
    print("circuit A: prepare |0>, measure; circuit B: one X, measure")
    print("quantity          circuit qubit  count / shots   p         Wilson 95%")
    total_k = {"A": 0, "B": 0}
    total_n = {"A": 0, "B": 0}
    for g, qubits in groups.items():
        label = "P(read 1 | prep 0)" if g == "A" else "P(read 0 | prep 1)"
        for i, q in enumerate(qubits):
            k, n = flips[q]
            total_k[g] += k
            total_n[g] += n
            p, lo, hi = wilson(k, n)
            print(f"{label}  {g}       {i}      {k:5d} / {n:5d}   {p:.6f}  [{lo:.6f}, {hi:.6f}]")
    for g in groups:
        label = "P(read 1 | prep 0)" if g == "A" else "P(read 0 | prep 1)"
        p, lo, hi = wilson(total_k[g], total_n[g])
        print(f"{label}  {g}       all    {total_k[g]:5d} / {total_n[g]:5d}   {p:.6f}  [{lo:.6f}, {hi:.6f}]")
    print(f"END_SPAM noise_model={NOISE_MODEL}")


if "backend" in globals(): main()
