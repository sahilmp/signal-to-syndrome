# Signal to Syndrome: shot-bank generator for the repetition-code memory (runs on Qollab).
#
# How to use: pick IonQ Forte 1 in the Select QPU dialog, set CONFIG below to one
# configuration name, run, then copy everything from BEGIN_BANK to END_BANK out of the
# console (DECISIONS D7) and assemble it locally with tools/assemble_bank.mjs.
# Qollab allows one job per code run, so each configuration is its own run.

# ---- Settings: CONFIG is the only line to edit between runs -----------------------------
CONFIG = "rep_d3_r1_L0"
SHOTS = 4000  # DECISIONS D8
V4_SHOTS = 100  # V4 injection batch, run on the "ideal" noise model
# One fixed sampler seed per configuration (DECISIONS D2), distinct, in 1..2^31.
SEEDS = {
    "rep_d3_r1_L0": 1012386106,
    "rep_d3_r1_L1": 756216899,
    "rep_d3_r3_L0": 1938670837,
    "rep_d3_r3_L1": 706416029,
    "rep_d5_r3_L0": 1086232993,
    "rep_d5_r3_L1": 1127187622,
    "rep_d5_r5_L0": 490727874,
    "rep_d5_r5_L1": 914806892,
    "rep_d7_r3_L0": 347037156,
    "rep_d7_r3_L1": 178290805,
    "v4_d3_r3_i0_k0": 2110077385,
    "v4_d3_r3_i0_k1": 356644854,
    "v4_d3_r3_i0_k2": 2139660026,
    "v4_d3_r3_i1_k0": 1079968443,
    "v4_d3_r3_i1_k1": 610129654,
    "v4_d3_r3_i1_k2": 1328329168,
    "v4_d3_r3_i2_k0": 1216489182,
    "v4_d3_r3_i2_k1": 651302763,
    "v4_d3_r3_i2_k2": 1731069982,
    "v4_d5_r3_i0_k0": 46082957,
    "v4_d5_r3_i0_k1": 722203451,
    "v4_d5_r3_i0_k2": 1756932967,
    "v4_d5_r3_i1_k0": 309265062,
    "v4_d5_r3_i1_k1": 1285942726,
    "v4_d5_r3_i1_k2": 1520817678,
    "v4_d5_r3_i2_k0": 2146497581,
    "v4_d5_r3_i2_k1": 633361251,
    "v4_d5_r3_i2_k2": 1019328693,
    "v4_d5_r3_i3_k0": 1984527685,
    "v4_d5_r3_i3_k1": 1366329564,
    "v4_d5_r3_i3_k2": 2106019850,
    "v4_d5_r3_i4_k0": 1546938092,
    "v4_d5_r3_i4_k1": 719605923,
    "v4_d5_r3_i4_k2": 943539033,
}
# -------------------------------------------------------------------------------------------

import hashlib
import json
import time
from datetime import datetime, timezone

from qiskit import ClassicalRegister, QuantumCircuit, QuantumRegister, transpile
from qiskit.providers.jobstatus import JobStatus

CHUNK = 4000
POLL_SECONDS = 5
# CLAUDE.md: n_clbits <= 29, so the JavaScript side's parseInt(hex, 16) is exact.
MAX_CLBITS = 29


def _check_clbits(d, r):
    n_clbits = (d - 1) * r + d
    if n_clbits > MAX_CLBITS:
        raise ValueError(f"d = {d}, r = {r} needs n_clbits = {n_clbits}; at most {MAX_CLBITS} is supported")
    return n_clbits


def build_memory_circuit(d, r, logical, inject=None):
    """Fresh-ancilla repetition-code memory: data qubits 0..d-1, then one ancilla per
    check per round. Returns (circuit, layout) with the CLAUDE.md classical-bit layout:
    check j of round k -> bit k*(d-1) + j, data qubit i -> bit (d-1)*r + i."""
    n_checks = d - 1
    n_qubits = d + n_checks * r
    n_clbits = _check_clbits(d, r)
    qr = QuantumRegister(n_qubits, "q")
    cr = ClassicalRegister(n_clbits, "c")
    qc = QuantumCircuit(qr, cr)

    inject_after = {}
    for i, k in inject or []:
        if not (0 <= i < d and 0 <= k < r):
            raise ValueError(f"injection site ({i}, {k}) outside data 0..{d - 1}, rounds 0..{r - 1}")
        inject_after.setdefault(k, []).append(i)

    if logical == 1:
        for i in range(d):
            qc.x(i)

    ancilla = []
    for k in range(r):
        row = []
        for j in range(n_checks):
            a = d + k * n_checks + j
            qc.cx(j, a)
            qc.cx(j + 1, a)
            row.append(a)
        ancilla.append(row)
        for i in inject_after.get(k, []):
            qc.x(i)

    layout = {
        "ancilla": [[k * n_checks + j for j in range(n_checks)] for k in range(r)],
        "data": [n_checks * r + i for i in range(d)],
    }
    for k in range(r):
        for j in range(n_checks):
            qc.measure(ancilla[k][j], layout["ancilla"][k][j])
    for i in range(d):
        qc.measure(i, layout["data"][i])
    return qc, layout


def _parse_name(name):
    parts = name.split("_")
    d, r = int(parts[1][1:]), int(parts[2][1:])
    if name.startswith("rep_"):
        return {"d": d, "r": r, "logical": int(parts[3][1:]), "inject": None,
                "shots": SHOTS, "noise_model": "forte-1"}
    return {"d": d, "r": r, "logical": 0, "inject": [[int(parts[3][1:]), int(parts[4][1:])]],
            "shots": V4_SHOTS, "noise_model": "ideal"}


CONFIGS = {}
for _d, _r in [(3, 1), (3, 3), (5, 3), (5, 5), (7, 3)]:
    for _L in (0, 1):
        _n = f"rep_d{_d}_r{_r}_L{_L}"
        CONFIGS[_n] = _parse_name(_n)

V4_BATCH = {}
for _d, _r in [(3, 3), (5, 3)]:
    for _i in range(_d):
        for _k in range(_r):
            _n = f"v4_d{_d}_r{_r}_i{_i}_k{_k}"
            V4_BATCH[_n] = _parse_name(_n)


def run_native(qc, shots, noise_model, seed):
    """The native-gate recipe of DECISIONS D1. Uses Qollab's pre-existing `backend`."""
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
        raise RuntimeError(f"Job {job.job_id()} ended with status {status.name}; no bank was produced.")
    return job.result().get_counts(), job.job_id(), native_ops


def _shot_bits(key, n_clbits):
    """Classical bit b of a Qiskit binary key (bit 0 is the rightmost character)."""
    key = key.replace(" ", "")
    if len(key) != n_clbits:
        raise ValueError(f"key '{key}' has {len(key)} bits, expected n_clbits = {n_clbits}")
    return [int(c) for c in reversed(key)]


def detector_rate(counts, d, r, layout):
    """Fraction of detector bits equal to 1 over all detectors and shots. Layer k < r:
    m[k][j] XOR m[k-1][j] (m[-1] = 0); final layer: x[j] XOR x[j+1] XOR m[r-1][j]."""
    n_clbits = (d - 1) * r + d
    ones = 0
    shots = 0
    for key, c in counts.items():
        bits = _shot_bits(key, n_clbits)
        m = [[bits[b] for b in row] for row in layout["ancilla"]]
        x = [bits[b] for b in layout["data"]]
        fired = 0
        for k in range(r):
            for j in range(d - 1):
                fired += m[k][j] ^ (m[k - 1][j] if k > 0 else 0)
        for j in range(d - 1):
            fired += x[j] ^ x[j + 1] ^ m[r - 1][j]
        ones += fired * c
        shots += c
    n_det = (d - 1) * (r + 1)
    return ones / (n_det * shots) if shots else 0.0


def counts_sha256(counts):
    return hashlib.sha256(json.dumps(counts, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def to_bank(d, r, logical, layout, raw_counts, *, backend_name, noise_model, sampler_seed,
            job_id, native_ops, det_rate, inject=None):
    """Build the s2s-bank/1 object from Qiskit binary counts."""
    n_clbits = _check_clbits(d, r)
    counts = {}
    for key, c in raw_counts.items():
        bits = key.replace(" ", "")
        if len(bits) != n_clbits:
            raise ValueError(f"key '{key}' has {len(bits)} bits, expected n_clbits = {n_clbits}")
        hex_key = format(int(bits, 2), "x")
        counts[hex_key] = counts.get(hex_key, 0) + int(c)
    total = sum(counts.values())
    bank = {
        "schema": "s2s-bank/1",
        "code": "repetition",
        "d": d,
        "r": r,
        "logical": logical,
        "mode": "fresh-ancilla",
        "backend": backend_name,
        "noise_model": noise_model,
        "sampler_seed": sampler_seed,
        "job_id": job_id,
        "native_ops": native_ops,
        "date": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "detector_rate": det_rate,
        "shots": total,
        "n_qubits": d + (d - 1) * r,
        "n_clbits": n_clbits,
        "layout": layout,
        "bit_order": "qiskit-little-endian",
        "key_encoding": "hex",
        "counts": counts,
        "checksum": {"total_shots": total, "n_keys": len(counts), "sha256": counts_sha256(counts)},
    }
    if inject is not None:
        bank["inject"] = [list(site) for site in inject]
    return bank


def emit(bank, name):
    """Print the bank between BEGIN_BANK and END_BANK in 4000-character chunks (DECISIONS D7)."""
    s = json.dumps(bank, sort_keys=True, separators=(",", ":"))
    chunks = [s[i:i + CHUNK] for i in range(0, len(s), CHUNK)] or [""]
    n = len(chunks)
    print(f"BEGIN_BANK {name} chunks={n} sha256={hashlib.sha256(s.encode()).hexdigest()}")
    for i, chunk in enumerate(chunks, start=1):
        print(f"--- chunk {i}/{n} ---")
        print(chunk)
    print(f"END_BANK {name}")


def _expected_duration(cfg):
    if cfg["noise_model"] == "ideal":
        return "usually under a minute (ideal simulator, few shots)"
    # D3: about 6-8 min per 4000 shots at d=3, r=3 (12 CNOTs); scale by shots and CNOT count.
    scale = (cfg["shots"] / 4000) * (2 * (cfg["d"] - 1) * cfg["r"]) / 12
    return f"about {max(1, round(6 * scale))}-{max(2, round(8 * scale))} min (D3, rough scaling)"


def main():
    all_configs = {**CONFIGS, **V4_BATCH}
    if CONFIG not in all_configs:
        raise ValueError(f"Unknown CONFIG '{CONFIG}'. Valid names: {', '.join(all_configs)}")
    cfg = all_configs[CONFIG]
    d, r, logical = cfg["d"], cfg["r"], cfg["logical"]
    seed = SEEDS[CONFIG]
    qc, layout = build_memory_circuit(d, r, logical, cfg["inject"])
    print(f"{CONFIG}: {qc.num_qubits} qubits, {cfg['shots']} shots, noise model {cfg['noise_model']}, "
          f"seed {seed}; expected {_expected_duration(cfg)}")

    raw_counts, job_id, native_ops = run_native(qc, cfg["shots"], cfg["noise_model"], seed)
    rate = detector_rate(raw_counts, d, r, layout)
    print(f"detector_rate = {rate:.6f}")
    if CONFIG.startswith("rep_") and rate == 0:
        raise RuntimeError(f"{CONFIG}: detector_rate is 0, so the circuit was optimised away. "
                           "Do not use this bank; nothing was emitted.")
    bank = to_bank(d, r, logical, layout, raw_counts, backend_name=backend.name,  # noqa: F821
                   noise_model=cfg["noise_model"], sampler_seed=seed, job_id=job_id,
                   native_ops=native_ops, det_rate=rate, inject=cfg["inject"])
    emit(bank, CONFIG)


if "backend" in globals(): main()
