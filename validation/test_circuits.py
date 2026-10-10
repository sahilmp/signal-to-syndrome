# V3: local checks of the Qollab bank generator's circuits on Qiskit's noiseless
# BasicSimulator (circuits of at most 24 qubits). Run with:
#   %USERPROFILE%\venvs\s2s\Scripts\python.exe -m pytest validation -q
import os
import sys

import pytest
from qiskit import transpile
from qiskit.providers.basic_provider import BasicSimulator

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "qollab"))
import bank_generator as bg  # noqa: E402

SIM = BasicSimulator()


def run_counts(qc, shots=64):
    assert qc.num_qubits <= 24
    return SIM.run(transpile(qc, SIM), shots=shots).result().get_counts()


def bits_of(key, n_clbits):
    key = key.replace(" ", "")
    assert len(key) == n_clbits
    return [int(c) for c in reversed(key)]


def split(bits, layout):
    return [[bits[b] for b in row] for row in layout["ancilla"]], [bits[b] for b in layout["data"]]


# Catches: a wrong CNOT pair, a missing logical-1 preparation, or ancillas/data written to
# the wrong classical bits; any of these gives a non-zero ancilla bit or a wrong data bit.
@pytest.mark.parametrize("d,r", [(3, 1), (3, 3), (5, 3)])
@pytest.mark.parametrize("logical", [0, 1])
def test_noiseless_memory_single_outcome(d, r, logical):
    qc, layout = bg.build_memory_circuit(d, r, logical)
    n_clbits = (d - 1) * r + d
    assert qc.num_qubits == d + (d - 1) * r
    assert qc.num_clbits == n_clbits
    counts = run_counts(qc)
    assert len(counts) == 1
    m, x = split(bits_of(next(iter(counts)), n_clbits), layout)
    assert all(b == 0 for row in m for b in row)
    assert x == [logical] * d


# Catches: an injected X placed in the wrong round (before instead of after round k), on the
# wrong qubit, or a check that reads the wrong neighbours; the ancilla pattern then differs
# from the CLAUDE.md idle-error rule (checks i-1 and i flip in every round > k, x[i] flips).
@pytest.mark.parametrize("i", range(3))
@pytest.mark.parametrize("k", range(3))
def test_injection_matches_prediction(i, k):
    d, r = 3, 3
    n_clbits = (d - 1) * r + d
    qc, layout = bg.build_memory_circuit(d, r, 0, inject=[(i, k)])
    counts = run_counts(qc)
    assert len(counts) == 1
    m, x = split(bits_of(next(iter(counts)), n_clbits), layout)
    exp_m = [[0] * (d - 1) for _ in range(r)]
    for kk in range(k + 1, r):
        for j in (i - 1, i):
            if 0 <= j < d - 1:
                exp_m[kk][j] = 1
    exp_x = [1 if q == i else 0 for q in range(d)]
    assert m == exp_m
    assert x == exp_x


# Catches: a layout that departs from the fixed formula (check j of round k -> k*(d-1)+j,
# data i -> (d-1)*r+i), for example rounds stored in reverse or data placed first.
def test_layout_formula_d5_r3():
    d, r = 5, 3
    qc, layout = bg.build_memory_circuit(d, r, 0)
    assert layout["ancilla"] == [[k * (d - 1) + j for j in range(d - 1)] for k in range(r)]
    assert layout["data"] == [(d - 1) * r + i for i in range(d)]
    # The circuit itself must measure each qubit into the bit the layout names.
    measured = {}
    for inst in qc.data:
        if inst.operation.name == "measure":
            measured[qc.find_bit(inst.qubits[0]).index] = qc.find_bit(inst.clbits[0]).index
    for k in range(r):
        for j in range(d - 1):
            assert measured[d + k * (d - 1) + j] == layout["ancilla"][k][j]
    for i in range(d):
        assert measured[i] == layout["data"][i]


# Catches: a detector_rate that ignores some detectors or always returns 0 (which would let an
# optimised-away bank through). Non-vacuous pair: error-free counts give exactly 0; flipping
# one ancilla bit in 10 of 100 shots gives 2 fired detectors per such shot, i.e.
# 10*2 / (100 * (d-1)*(r+1)) = 20/800 = 0.025 for d = 3, r = 3.
def test_detector_rate_zero_and_positive():
    d, r = 3, 3
    n_clbits = (d - 1) * r + d
    _, layout = bg.build_memory_circuit(d, r, 0)
    clean = "0" * n_clbits
    assert bg.detector_rate({clean: 100}, d, r, layout) == 0
    bits = [0] * n_clbits
    bits[layout["ancilla"][1][0]] = 1  # check 0 of round 1 flipped: detectors (1,0) and (2,0)
    flipped = "".join(str(b) for b in reversed(bits))
    rate = bg.detector_rate({clean: 90, flipped: 10}, d, r, layout)
    assert rate == pytest.approx(20 / 800)
    assert rate > 0


# Catches: a configuration without its own seed, two banks sharing a seed (correlated noise),
# or a seed outside the range IonQ accepts (DECISIONS D2: integer 1 to 2^31). Covers the
# basis-X lists (CONFIGS_X, V13_BATCH) and the held-out banks (HELDOUT, V18) as well as the
# basis-Z ones.
def test_seeds_table():
    tables = (bg.CONFIGS, bg.V4_BATCH, bg.CONFIGS_X, bg.V13_BATCH, bg.HELDOUT)
    names = set().union(*tables)
    assert len(names) == sum(len(t) for t in tables)
    assert set(bg.SEEDS) == names
    values = list(bg.SEEDS.values())
    assert len(set(values)) == len(values)
    assert all(isinstance(s, int) and 1 <= s <= 2 ** 31 for s in values)


# Catches: a wrong configuration list (missing banks, a V4 batch run on forte-1 instead of the
# ideal model, or V4 sites outside 0..d-1 x 0..r-1).
def test_config_lists():
    assert sorted(bg.CONFIGS) == sorted(
        f"rep_d{d}_r{r}_L{L}" for d, r in [(3, 1), (3, 3), (5, 3), (5, 5), (7, 3)] for L in (0, 1))
    assert len(bg.V4_BATCH) == 3 * 3 + 5 * 3
    for name, cfg in bg.V4_BATCH.items():
        assert cfg["noise_model"] == "ideal" and cfg["shots"] == 100 and cfg["logical"] == 0
        (i, k), = cfg["inject"]
        assert 0 <= i < cfg["d"] and 0 <= k < cfg["r"]
    assert all(c["noise_model"] == "forte-1" and c["shots"] == bg.SHOTS for c in bg.CONFIGS.values())


# Boundary test (non-vacuous pair). Catches: a configuration whose classical register is wider
# than 29 bits (CLAUDE.md; the JavaScript side reads keys with parseInt) being built or
# packaged. d = 3, r = 13 needs exactly 29 bits and is accepted; r = 14 needs 31 and is
# rejected by both build_memory_circuit and to_bank, before any job would be submitted.
def test_n_clbits_limit_29():
    qc, _ = bg.build_memory_circuit(3, 13, 0)
    assert qc.num_clbits == 29
    with pytest.raises(ValueError, match="n_clbits = 31"):
        bg.build_memory_circuit(3, 14, 0)
    with pytest.raises(ValueError, match="n_clbits = 31"):
        bg.to_bank(3, 14, 0, {"ancilla": [], "data": []}, {}, backend_name="t", noise_model="x",
                   sampler_seed=1, job_id="j", native_ops={}, det_rate=0.0)


# Catches: a bank whose hex keys, checksum or layout disagree with the s2s-bank/1 contract
# (for example keys converted from the wrong end, or a checksum over a non-canonical form).
def test_to_bank_and_emit_round_trip(capsys):
    import hashlib
    import json
    d, r = 3, 3
    n_clbits = (d - 1) * r + d
    _, layout = bg.build_memory_circuit(d, r, 0)
    raw = {"0" * n_clbits: 7, "0" * (n_clbits - 1) + "1": 3, "1" + "0" * (n_clbits - 1): 2}
    bank = bg.to_bank(d, r, 0, layout, raw, backend_name="test", noise_model="forte-1",
                      sampler_seed=5, job_id="job", native_ops={"ms": 12},
                      det_rate=bg.detector_rate(raw, d, r, layout))
    assert bank["counts"] == {"0": 7, "1": 3, format(1 << (n_clbits - 1), "x"): 2}
    assert bank["shots"] == 12 and bank["checksum"]["total_shots"] == 12
    assert bank["checksum"]["n_keys"] == 3
    canon = json.dumps(bank["counts"], sort_keys=True, separators=(",", ":"))
    assert bank["checksum"]["sha256"] == hashlib.sha256(canon.encode()).hexdigest()
    with pytest.raises(ValueError):
        bg.to_bank(d, r, 0, layout, {"0" * (n_clbits + 1): 1}, backend_name="t", noise_model="x",
                   sampler_seed=1, job_id="j", native_ops={}, det_rate=0.0)
    bg.emit(bank, "rep_d3_r3_L0")
    lines = capsys.readouterr().out.splitlines()
    assert lines[0].startswith("BEGIN_BANK rep_d3_r3_L0 chunks=1 sha256=")
    assert lines[1] == "--- chunk 1/1 ---"
    assert json.loads(lines[2]) == bank
    assert lines[-1] == "END_BANK rep_d3_r3_L0"


# Catches: the standalone live-run helper (qollab/live.py, CC-A1 part E) drifting from the
# bank generator, for example a different qubit order, a CNOT on the wrong ancilla, or an
# ancilla/data bit written to a different classical bit; the CNOT list, the qubit-to-bit
# measurement map or the noiseless outcome would then differ from build_memory_circuit(3, 3, 0).
# The CNOT list is compared directly because with logical 0 every data qubit is |0>, so a
# miswired CNOT leaves the noiseless outcome unchanged.
def test_live_circuit_matches_bank_generator():
    import live
    qc_live = live.live_circuit()
    qc_bank, _ = bg.build_memory_circuit(3, 3, 0)
    assert qc_live.num_qubits == qc_bank.num_qubits
    assert qc_live.num_clbits == qc_bank.num_clbits

    def measure_map(qc):
        return {qc.find_bit(inst.qubits[0]).index: qc.find_bit(inst.clbits[0]).index
                for inst in qc.data if inst.operation.name == "measure"}

    def cx_list(qc):
        return [tuple(qc.find_bit(q).index for q in inst.qubits)
                for inst in qc.data if inst.operation.name == "cx"]

    assert cx_list(qc_live) == cx_list(qc_bank)
    assert measure_map(qc_live) == measure_map(qc_bank)
    counts_live = run_counts(qc_live)
    assert len(counts_live) == 1
    assert counts_live == run_counts(qc_bank)


# V13. Catches: a phase-flip memory with a wrong preparation (no H, or X and H in the wrong
# order, so |-> is not prepared), a check that is not conjugated by H on the ancilla, a CNOT
# with control and target swapped, or a missing final H on the data; any of these gives a
# random (several outcomes) or wrong outcome on the noiseless simulator.
@pytest.mark.parametrize("d,r", [(3, 1), (3, 3), (5, 3)])
@pytest.mark.parametrize("logical", [0, 1])
def test_x_basis_noiseless_memory_single_outcome(d, r, logical):
    qc, layout = bg.build_memory_circuit(d, r, logical, basis="X")
    n_clbits = (d - 1) * r + d
    assert qc.num_qubits == d + (d - 1) * r
    assert qc.num_clbits == n_clbits
    counts = run_counts(qc)
    assert len(counts) == 1
    m, x = split(bits_of(next(iter(counts)), n_clbits), layout)
    assert all(b == 0 for row in m for b in row)
    assert x == [logical] * d


# Catches: an X-basis memory that is really the Z-basis circuit (a Z injection would then leave
# every bit 0), a Z injected at the wrong round or qubit, or checks that read the wrong
# neighbours. Basis X with an injected Z must give exactly the bit pattern of basis Z with an
# injected X at the same site. Non-vacuous control: an X injected into the X-basis memory
# commutes with every X_j X_{j+1} check and with |+++>, so it leaves the clean outcome.
@pytest.mark.parametrize("i", range(3))
@pytest.mark.parametrize("k", range(3))
def test_x_basis_z_injection_matches_z_basis(i, k):
    d, r = 3, 3
    qc_x, _ = bg.build_memory_circuit(d, r, 0, inject=[(i, k)], basis="X", inject_pauli="Z")
    qc_z, _ = bg.build_memory_circuit(d, r, 0, inject=[(i, k)])
    counts_x = run_counts(qc_x)
    assert len(counts_x) == 1
    assert counts_x == run_counts(qc_z)
    assert next(iter(counts_x)) != "0" * ((d - 1) * r + d)
    qc_ctrl, _ = bg.build_memory_circuit(d, r, 0, inject=[(i, k)], basis="X", inject_pauli="X")
    assert run_counts(qc_ctrl) == {"0" * ((d - 1) * r + d): 64}


# Catches: an X-basis circuit whose classical-bit layout differs from the basis-Z one.
def test_x_basis_layout_matches_z_basis():
    d, r = 5, 3
    qc_x, layout_x = bg.build_memory_circuit(d, r, 0, basis="X")
    qc_z, layout_z = bg.build_memory_circuit(d, r, 0)
    assert layout_x == layout_z

    def measure_map(qc):
        return {qc.find_bit(inst.qubits[0]).index: qc.find_bit(inst.clbits[0]).index
                for inst in qc.data if inst.operation.name == "measure"}

    assert measure_map(qc_x) == measure_map(qc_z)


# Catches: a typo in basis or inject_pauli silently building the basis-Z circuit or an X
# injection instead of failing.
def test_bad_basis_or_pauli_rejected():
    with pytest.raises(ValueError, match="basis"):
        bg.build_memory_circuit(3, 1, 0, basis="Y")
    with pytest.raises(ValueError, match="inject_pauli"):
        bg.build_memory_circuit(3, 1, 0, inject=[(0, 0)], inject_pauli="Y")


# Catches: a wrong basis-X configuration list (missing banks, wrong noise model or shots, V13
# sites other than (0, 0), (1, 1), (2, 2), a V13 batch that injects X, or a repx_ entry that
# builds the basis-Z circuit).
def test_config_lists_x():
    assert sorted(bg.CONFIGS_X) == sorted(
        f"repx_d{d}_r{r}_L{L}" for d, r in [(3, 1), (3, 3), (5, 3), (5, 5), (7, 3)] for L in (0, 1))
    for name, cfg in bg.CONFIGS_X.items():
        assert cfg["basis"] == "X" and cfg["noise_model"] == "forte-1" and cfg["shots"] == bg.SHOTS
        assert cfg["inject"] is None and cfg["logical"] == int(name[-1])
    assert sorted(bg.V13_BATCH) == ["v13_d3_r3_i0_k0", "v13_d3_r3_i1_k1", "v13_d3_r3_i2_k2"]
    for cfg in bg.V13_BATCH.values():
        assert cfg["basis"] == "X" and cfg["inject_pauli"] == "Z" and cfg["noise_model"] == "ideal"
        assert cfg["shots"] == bg.V4_SHOTS and cfg["logical"] == 0 and (cfg["d"], cfg["r"]) == (3, 3)
    assert all(c["basis"] == "Z" and c["inject_pauli"] == "X" for c in {**bg.CONFIGS, **bg.V4_BATCH}.values())


# Catches: a basis-X bank packaged without "basis": "X" (readers would decode it as a
# bit-flip memory), or a basis field added to basis-Z banks.
def test_to_bank_basis_field():
    d, r = 3, 1
    n_clbits = (d - 1) * r + d
    _, layout = bg.build_memory_circuit(d, r, 0, basis="X")
    kw = dict(backend_name="t", noise_model="forte-1", sampler_seed=1, job_id="j", native_ops={}, det_rate=0.1)
    raw = {"0" * n_clbits: 1}
    assert bg.to_bank(d, r, 0, layout, raw, basis="X", **kw)["basis"] == "X"
    assert "basis" not in bg.to_bank(d, r, 0, layout, raw, **kw)
    assert "basis" not in bg.to_bank(d, r, 0, layout, raw, basis="Z", **kw)
