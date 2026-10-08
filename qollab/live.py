# Signal to Syndrome: live-run helper for the main Qollab project (DECISIONS D11).
#
# Uploaded alone as live.py at the top level of the main project (Qollab's upload takes no
# folders, DECISIONS D11), next to index.html, main.css and main.js; main.js loads it
# with `import * as s2sLive from 'live'` and calls
# run_live.callPromising(backend, shots, seed). Standalone on purpose: it must not import
# bank_generator, which is not uploaded to the main project.

from qiskit import ClassicalRegister, QuantumCircuit, QuantumRegister, transpile

D = 3
R = 3


def live_circuit():
    """The d = 3, r = 3, logical 0 fresh-ancilla memory, with the same qubit order and
    classical-bit layout as bank_generator.build_memory_circuit(3, 3, 0): data qubits
    0..d-1, then one ancilla per check per round; check j of round k -> bit k*(d-1) + j,
    data qubit i -> bit (d-1)*r + i."""
    n_checks = D - 1
    qr = QuantumRegister(D + n_checks * R, "q")
    cr = ClassicalRegister(n_checks * R + D, "c")
    qc = QuantumCircuit(qr, cr)
    for k in range(R):
        for j in range(n_checks):
            a = D + k * n_checks + j
            qc.cx(j, a)
            qc.cx(j + 1, a)
    for k in range(R):
        for j in range(n_checks):
            qc.measure(D + k * n_checks + j, k * n_checks + j)
    for i in range(D):
        qc.measure(i, n_checks * R + i)
    return qc


def run_live(backend, shots=200, seed=7):
    """Run live_circuit() with the native-gate recipe of DECISIONS D1 on Qollab's `backend`
    (IonQ Forte 1, noise model "forte-1") and return the counts as a plain dict of
    binary-string keys to int."""
    if backend.options.get("noise_model") != "forte-1":
        raise RuntimeError("The backend is not IonQ Forte 1. Pick IonQ Forte 1 in the "
                           "Select QPU dialog, then run again.")
    nb = backend.with_name(backend.name, gateset="native", noise_model="forte-1")
    # The seed only takes effect through set_options (DECISIONS D2), never as a run() argument.
    nb.set_options(noise_model="forte-1", sampler_seed=int(seed))
    job = nb.run(transpile(live_circuit(), backend=nb), shots=int(shots))
    return {str(k): int(v) for k, v in job.result().get_counts().items()}
