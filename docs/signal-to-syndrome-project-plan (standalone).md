# Signal to Syndrome — Project Plan

**How the physics of qubit readout sets the performance of an error-corrected memory, for trapped-ion and superconducting readout**

*Standalone edition*

| | |
|---|---|
| Version | 1.1, 4 October 2026 |
| Event | QOLLAB × IonQ Global Quantum Hackathon. Build window: Fri 9 Oct 19:00 ET → Sun 11 Oct 19:00 ET, which is Sat 10 Oct 04:30 IST → Mon 12 Oct 04:30 IST |
| Theme | Quantum Unlocked (error correction), with Quantum Playground elements |
| Self-containment | This document needs no other file. Part I explains every concept the plan uses, in order, before it is used; Part II is the plan; a full reference list and a glossary close the document |

---

## How to read this document

**Who it is for.** A reader who knows the basics of quantum information: a qubit state $a|0\rangle+b|1\rangle$ with $|a|^2+|b|^2=1$, the Pauli operators $X$, $Y$, $Z$, the Hadamard and CNOT gates, tensor products, and the Born rule (measuring $a|0\rangle+b|1\rangle$ gives 0 with probability $|a|^2$). Nothing about error correction, qubit hardware or the software tools is assumed.

**How it is organized.** Part I (Sections 1–9) builds the background. Part II (Sections 10–20) is the project plan: objective, deliverables, platform compatibility, architecture, methodology, milestones, risks and limitations. If you already know error correction and readout physics, start at Section 10 and use the glossary when needed.

**Notation.** $\oplus$ is addition modulo 2 (XOR): $0\oplus0=0$, $0\oplus1=1$, $1\oplus1=0$. $\ln$ is the natural logarithm. $\mathcal N(x;\mu,\sigma)$ is the normal (Gaussian) probability density with mean $\mu$ and standard deviation $\sigma$. $\text{Pois}(n;\lambda)=e^{-\lambda}\lambda^n/n!$ is the Poisson probability of $n$ counts with mean $\lambda$. Angular frequency $\omega=2\pi f$; "$\chi/2\pi = 1$ MHz" means $\chi = 2\pi\times1$ MHz. Time is in microseconds (µs) unless stated.

**Diagrams.** All diagrams are drawn with plain-text box characters inside code blocks, so they display the same in any Markdown viewer, editor or terminal, with no plug-ins. View them in a monospaced font (the default for code blocks).

---

## Contents

**Part I — Background**
1. Qubits, measurement and parity
2. Errors and noise
3. The repetition code
4. Checks, ancillas and rounds
5. Detectors and the space-time picture
6. Decoding
7. Hard and soft information
8. How qubits are read out
9. Simulation, statistics and software terms

**Part II — The plan**
10. Summary
11. Core objective, outputs and success tiers
12. Hypotheses
13. Deliverables
14. Platform compatibility
15. System architecture
16. Methodology
17. Milestones and timeline
18. The interactive experience
19. Risks and fallbacks
20. Limitations and claims policy

References · Glossary

---

# PART I — BACKGROUND

## 1. Qubits, measurement and parity

**Measuring in the computational basis.** Measuring a qubit "in the $Z$ basis" asks whether it is $|0\rangle$ or $|1\rangle$. These are the eigenstates of $Z$ with eigenvalues $+1$ and $-1$; we record $+1$ as the bit 0 and $-1$ as the bit 1. Afterwards the qubit is left in the state matching the outcome. This is a **projective measurement**: the state is projected onto one eigenstate, and any superposition between $|0\rangle$ and $|1\rangle$ is destroyed.

**Measuring a parity instead of the bits.** The operator $Z_1Z_2$ (that is, $Z\otimes Z$ on two qubits) has eigenvalue $+1$ on $|00\rangle$ and $|11\rangle$ and $-1$ on $|01\rangle$ and $|10\rangle$. For a basis state $|x_1x_2\rangle$,
$$Z_1Z_2|x_1x_2\rangle=(-1)^{x_1\oplus x_2}|x_1x_2\rangle .$$
Measuring $Z_1Z_2$ therefore reports whether the two bits **agree** (parity 0) or **disagree** (parity 1) without reporting either bit. A superposition such as $a|00\rangle+b|11\rangle$ has definite parity 0, so measuring $Z_1Z_2$ leaves it completely undisturbed. This is the key to error correction.

## 2. Errors and noise

**Noise and errors.** Any unintended change to a qubit is **noise**; a specific unintended change is an **error**.

**Pauli errors.** A **bit flip** is an accidental $X$ (it swaps $|0\rangle\leftrightarrow|1\rangle$). A **phase flip** is an accidental $Z$ (it sends $a|0\rangle+b|1\rangle$ to $a|0\rangle-b|1\rangle$, which a $Z$-basis measurement cannot see). $Y=iXZ$ is both at once. A random choice among $I$, $X$, $Y$, $Z$ is a **Pauli error**.

**Relaxation and $T_1$.** In most qubits $|1\rangle$ has higher energy than $|0\rangle$, and a qubit in $|1\rangle$ can spontaneously fall to $|0\rangle$. The probability it is still in $|1\rangle$ after time $t$ is $e^{-t/T_1}$; $T_1$ is the **relaxation time**. The process is called **amplitude damping**, with decay probability $\gamma=1-e^{-t/T_1}$.

**Dephasing and $T_2$.** Random fluctuations of the qubit frequency scramble the relative phase between $|0\rangle$ and $|1\rangle$ over a time $T_2$ (with $T_2\le2T_1$). Dephasing causes phase flips only.

**Pauli twirling.** Simulations are far simpler when every error is a Pauli error. **Pauli twirling** replaces a channel (a general description of what noise does to a state) by the Pauli-error channel with the same average effect. For amplitude damping it gives $X$ and $Y$ errors each with probability $\gamma/4$. A code that only watches bit flips therefore sees a flip with probability
$$p_X+p_Y=\frac{\gamma}{2}=\frac12\left(1-e^{-t/T_1}\right).$$
This is an approximation, standard in error-correction studies.

**Readout error.** The measurement itself can report the wrong bit. The probability of that is the **assignment error** (or readout error). Section 8 explains where it comes from.

## 3. The repetition code

**The classical idea.** To protect one bit against random flips, store it three times (0 → 000, 1 → 111) and take a **majority vote**. If each copy flips independently with probability $p$, the vote fails only when two or three copies flip: probability $3p^2(1-p)+p^3\approx3p^2$. For $p=0.01$ that is about $3\times10^{-4}$, thirty times better.

**Logical and physical.** The protected bit is the **logical** bit; the copies are **physical** bits; the failure probability of the protected bit is the **logical error rate** $p_L$.

**Why qubits need more care.** Unknown quantum states cannot be copied (the **no-cloning theorem**), and reading the copies would destroy superpositions. Instead we **encode** by entangling: CNOTs from qubit 1 to qubits 2 and 3 turn $(a|0\rangle+b|1\rangle)|00\rangle$ into
$$a|000\rangle+b|111\rangle,$$
which is one entangled **logical state**, with **logical** basis states $|0_L\rangle=|000\rangle$ and $|1_L\rangle=|111\rangle$. To find errors we measure parities $Z_1Z_2$ and $Z_2Z_3$, never individual qubits, so $a$ and $b$ are never revealed (Section 1).

**Measurement turns small errors into whole ones.** A small accidental rotation $e^{-i\epsilon X_1}=\cos\epsilon\,I-i\sin\epsilon\,X_1$ makes the state a superposition of "no error" and "a full $X_1$". Measuring the parities forces one branch: with probability $\cos^2\epsilon$ nothing happened, with probability $\sin^2\epsilon$ a full $X_1$ happened, which is then undone. This is why codes only need to handle Pauli errors.

**Distance $d$.** With $d$ data qubits in a line, $|0_L\rangle=|0\cdots0\rangle$ and $|1_L\rangle=|1\cdots1\rangle$. The **code distance** is the smallest number of physical errors that changes one logical state into the other without any parity check noticing; here it takes $d$ bit flips (all of them). A distance-$d$ code corrects any $\lfloor(d-1)/2\rfloor$ errors (the floor $\lfloor\cdot\rfloor$ rounds down): with $t$ flips the decoder's two candidate explanations have $t$ and $d-t$ flips, and it picks the smaller, which is correct only when $t<d/2$.

**An honest limitation.** The repetition code protects only against bit flips. A single $Z$ on any qubit changes $a|0_L\rangle+b|1_L\rangle$ into $a|0_L\rangle-b|1_L\rangle$ undetected. It is a memory for one type of error, and it is the standard first experimental testbed for error-correction physics because it contains every other ingredient: entangling parity checks, helper qubits, repeated rounds, measurement errors and decoding.

**Surface code (context only).** The **surface code** places data qubits on a two-dimensional grid with $Z$-type checks (for bit flips) and $X$-type checks (for phase flips), so it protects a full qubit. The repetition code is one row of it.

## 4. Checks, ancillas and rounds

**Checks and syndromes.** An operator $S$ **stabilizes** a state if $S|\psi\rangle=|\psi\rangle$. The parity operators $Z_jZ_{j+1}$ stabilize every logical state, and are called the code's **checks** (or stabilizer generators). Measuring all checks gives a list of outcomes called the **syndrome**. With no errors every check reports 0.

**Measuring a check with an ancilla.** To measure $Z_1Z_2$ we use an extra helper qubit, an **ancilla**, prepared in $|0\rangle$. A CNOT from qubit 1 to the ancilla, then a CNOT from qubit 2 to the ancilla, leave the ancilla holding $x_1\oplus x_2$ for each basis component. For $a|000\rangle+b|111\rangle$ both components give 0, so the ancilla ends in $|0\rangle$ without becoming entangled with the logical information; measuring it reveals the parity and nothing else. The qubits that carry the logical information are **data qubits**. One pass of measuring all checks is a **QEC round** (QEC: quantum error correction).

**Why repeat.** Errors keep happening, and an ancilla can itself misreport its bit. Acting on a single wrong syndrome bit would "correct" an error that never happened. Repeating the checks over $r$ rounds lets the decoder tell a persistent change (a real error) from a one-off (a measurement error).

**Fresh ancillas and deferred measurement.** Hardware usually measures an ancilla, **resets** it to $|0\rangle$ and reuses it; measuring while the rest of the circuit continues is a **mid-circuit measurement**. Instead, every round can use **fresh ancillas** and all measurements can happen at the end. Because nothing acts on an ancilla after its two CNOTs, measuring it then or at the end gives identical statistics (the **principle of deferred measurement**). The cost is more qubits: $n=d+(d-1)r$. What deferral leaves out is timing: in real hardware the data qubits sit idle while the ancillas are read. This project adds that idle error back explicitly (Section 9, Pauli frame).

## 5. Detectors and the space-time picture

**Detectors.** Let $m_{j,k}$ be the reported outcome of check $j$ in round $k$ and $x_j$ the final readout of data qubit $j$. A **detector** is a combination of outcomes that is always 0 when nothing goes wrong. We use the change of each check between rounds:
$$D_{j,k}=m_{j,k}\oplus m_{j,k-1}\ (k=1..r,\ m_{j,0}=0),\qquad D_{j,r+1}=x_j\oplus x_{j+1}\oplus m_{j,r}.$$
The last line uses the final data readout to compute each check once more and compares it with the last report; it forms the **final layer**. A detector with value 1 is a **detection event** (a "lit" detector).

**Why changes, not raw values.** A real data flip changes a check permanently, so its raw value stays 1 forever; its detector fires once, at the moment of change. A misreport is a one-off, so its detector fires twice, when the wrong value appears and when it disappears.

**The grid.** Arrange detectors with check number horizontally ("space") and layer vertically ("time"). Every single error lights two dots, or one dot and the **boundary** (the edge of the chain):

| Error | Detectors that fire | Shape |
|---|---|---|
| Interior data qubit flips | both checks touching it, in one layer | horizontal pair ("space-like") |
| End data qubit flips | its one check, plus the boundary | one dot |
| Ancilla misreports $m_{j,k}$ | check $j$ in layers $k$ and $k+1$ | vertical pair ("time-like") |

Example for $d=3$, $r=3$: data qubit 2 flips before round 2, and check 1 misreports in round 3.

```text
              boundary     check 1     check 2    boundary
                       q1          q2          q3
layer 1 (round 1) ■───────────○───────────○───────────■
                              │           │
layer 2 (round 2) ■───────────●───────────●───────────■  data qubit 2 flipped: horizontal pair
                              │           │
layer 3 (round 3) ■───────────●───────────○───────────■  check 1 misread in round 3:
                              │           │
layer 4 (final)   ■───────────●───────────○───────────■  vertical pair, layers 3 and 4

● lit detector   ○ silent detector   ■ boundary (one node, drawn twice)
q1, q2, q3 above a horizontal edge: that edge is a flip of that data qubit
```

**Chains.** When several errors connect, each interior detector is touched twice and its two flips cancel, so only the **endpoints** of a chain of errors are visible. The decoder sees endpoints, never the errors themselves.

## 6. Decoding

**The decoder.** A **decoder** is the classical algorithm that takes the lit detectors and decides which errors most plausibly caused them, or equivalently whether the logical value was flipped.

**The decoding graph.** Make one **node** per detector, plus one **boundary node**, and one **edge** per possible single error, joining the detectors that error would light. A set of errors is a set of edges; the lit detectors are exactly the nodes touched by an odd number of chosen edges.

**Edge weights.** If edge $e$ fails independently with probability $p_e$, the probability of an error set $E$ is proportional to $\prod_{e\in E}p_e/(1-p_e)$. The most likely set therefore minimizes the sum of the **weights**
$$w_e=\ln\frac{1-p_e}{p_e},$$
so rare errors are expensive and common ones cheap. When all weights are equal this reduces to "fewest errors".

**Minimum-weight perfect matching.** Because every error lights at most two detectors, decoding becomes pairing: pair up the lit detectors (a detector may instead pair with the boundary) so that the total cost is smallest, where the cost of a pair is the cheapest path between them. This is **minimum-weight perfect matching (MWPM)**. Path costs come from **Dijkstra's algorithm** (the standard shortest-path method). Edmonds' **blossom algorithm** solves matching for any size. For a small number $n$ of lit detectors, **dynamic programming over subsets** is exact and simple: always resolve the lowest-numbered unmatched detector, either to the boundary or to another unmatched detector, and remember the best total for each subset; it costs about $2^n n$ steps, practical up to $n\approx20$.

**From matching to a logical decision.** Choose a **logical observable**: here the $Z$ value of data qubit 1. Mark the edges that represent a flip of data qubit 1 (its boundary edges). The **parity** $\pi$ (0 or 1) of marked edges along the chosen paths says whether the decoder believes qubit 1 flipped, so the corrected logical value is $\hat L=x_1\oplus\pi$. If $\hat L$ differs from the prepared value, a **logical error** occurred; the fraction of repetitions with a logical error is the logical error rate.

**Noise models.** **Code-capacity** noise: only data qubits fail. **Phenomenological** noise: data flips plus independent wrong syndrome bits. **Circuit-level** noise: every gate, idle period and measurement can fail, including a faulty CNOT that creates correlated errors. Real hardware, and the noisy simulator used here, give circuit-level noise.

**Threshold.** Below a critical physical error rate, the **threshold**, increasing $d$ lowers $p_L$ roughly as $(p/p_{\text{th}})^{(d+1)/2}$; above it, larger codes are worse. Plotting $p_L$ against $p$ for several $d$ shows the curves crossing at the threshold. For the repetition code with phenomenological noise and matching it is roughly 10%.

## 7. Hard and soft information

**Likelihood and log-likelihood ratio.** A readout produces a raw signal $s$ (a voltage value or a photon count, Section 8). The **likelihood** of a hypothesis is the probability of the observed $s$ if the hypothesis were true: $p(s\mid0)$ and $p(s\mid1)$. The **log-likelihood ratio (LLR)** is
$$\ell(s)=\ln\frac{p(s\mid1)}{p(s\mid0)} .$$
Its sign says which bit is more plausible; its size says how sure we are. With equal prior odds, the probability that the more plausible bit is nonetheless wrong is $p_{\text{wrong}}=1/(1+e^{|\ell|})$.

**Hard and soft decoding.** **Hard** decoding keeps only the decided bit and gives every measurement-error edge the same weight, from the average assignment error. **Soft** decoding keeps each measurement's own confidence. Substituting $p_{\text{wrong}}$ into the weight formula gives
$$w=\ln\frac{1-p_{\text{wrong}}}{p_{\text{wrong}}}=|\ell| ,$$
so a confident measurement becomes an expensive edge ("do not blame me") and an ambiguous one a cheap edge.

**Truth model and belief model.** In this project the signals are generated by a detailed "truth" model, while the decoder computes LLRs from a simpler "belief" model, as a real decoder working from an imperfect calibration would.

## 8. How qubits are read out

### 8.1 Trapped-ion fluorescence readout

A laser is tuned to a **cycling transition**: an ion in the **bright** qubit state absorbs and re-emits photons over and over, while an ion in the **dark** state scatters almost none. A lens collects a small fraction of the photons onto a detector, and we count them for a **detection time** $\tau$. The count is **Poisson distributed** (the distribution of independent random events at a constant average rate): mean $R_b\tau$ for bright and $R_d\tau$ for dark, where $R_d$ is a small background rate. We decide "bright" when the count exceeds a **threshold**. Longer detection separates the two distributions, but rarely the laser **pumps** the ion into the other state during detection (**off-resonant pumping**), which spoils the count. Without pumping the LLR has a closed form,
$$\ell(n)=n\ln\frac{R_b}{R_d}-(R_b-R_d)\tau .$$
Ion qubits barely decay while idle (memory times of seconds or longer), so waiting costs almost nothing, but detection takes hundreds of microseconds.

### 8.2 Superconducting dispersive readout

**Resonator.** A **microwave resonator** is an on-chip circuit (for example an inductor and capacitor, or a short **coplanar-waveguide** section) that stores energy oscillating at a frequency $\omega_r$, typically 4–8 GHz. Quantum mechanically it is a harmonic oscillator whose energy quanta are microwave **photons**. Readout resonators deliberately leak to an output line at an energy decay rate $\kappa$, the **linewidth**.

**Transmon qubit.** Replacing a resonator's inductor with a **Josephson junction** (a nonlinear superconducting element) makes the energy levels unequally spaced; the two lowest levels form a qubit. The most common design is the **transmon**.

**Dispersive shift.** A qubit coupled to a resonator with strength $g$ but detuned from it ($\Delta=\omega_q-\omega_r$ large compared with $g$) cannot exchange energy with it, yet shifts its frequency: the resonator sits at $\omega_r-\chi$ when the qubit is in $|0\rangle$ and $\omega_r+\chi$ when in $|1\rangle$. $\chi$ is the **dispersive shift** (for a simple two-level qubit $\chi=g^2/\Delta$). Reading the qubit means finding out which frequency the resonator rings at. The measurement leaves $|0\rangle$ as $|0\rangle$ and $|1\rangle$ as $|1\rangle$ (**quantum non-demolition**), as long as the photon number stays below a **critical photon number** $n_{\text{crit}}=(\Delta/2g)^2$.

**The driven field.** Driving the resonator midway between the two frequencies fills it with a **coherent state**, a quasi-classical field described by one complex amplitude $\alpha$. For qubit state $b$ (with $s_0=-1$, $s_1=+1$) and drive amplitude $\varepsilon_d$:
$$\frac{d\alpha_b}{dt}=-\Big(\frac\kappa2+is_b\chi\Big)\alpha_b+\varepsilon_d,\qquad \alpha_b(t)=\alpha_b^{\text{ss}}\Big(1-e^{-(\kappa/2+is_b\chi)t}\Big),\qquad \alpha_b^{\text{ss}}=\frac{\varepsilon_d}{\kappa/2+is_b\chi}.$$
The field **rings up** over about $2/\kappa$. Both steady states hold the same mean photon number $\bar n=|\alpha^{\text{ss}}|^2$ but differ in phase, separated by $|\Delta\alpha|^2=\bar n\,4\chi^2/(\kappa^2/4+\chi^2)$. At fixed $\bar n$ the useful signal $\kappa|\Delta\alpha|^2$ is largest when $\kappa=2\chi$.

**IQ plane and detection.** The output field is recorded as two slowly varying numbers, the **quadratures** $I$ and $Q$; each measurement is a point in the **IQ plane**, and the two qubit states form two clouds ("blobs"). **Homodyne** detection records one chosen quadrature; **heterodyne** detection records both, at the cost of a factor $\sqrt2$ in signal-to-noise. The **measurement efficiency** $\eta\in(0,1]$ summarizes losses and amplifier noise.

**Signal-to-noise ratio and assignment error.** Projecting each point onto the line joining the cloud centres gives one number $s$. Integrating for a time $\tau$ averages away white noise, so the separation of the clouds divided by their width, the **signal-to-noise ratio**, grows as $\sqrt\tau$:
$$\text{SNR}=c\,|\Delta\alpha|\sqrt{\eta\kappa\tau},\qquad c=2\ \text{(homodyne)},\ c=\sqrt2\ \text{(heterodyne)} .$$
With a threshold midway between the clouds and no decay, the assignment error is $\tfrac12\operatorname{erfc}(\text{SNR}/2\sqrt2)$, where $\operatorname{erfc}$ is the complementary error function.

**Decay during readout and the U-curve.** A qubit in $|1\rangle$ can relax during the integration window; the field then swings to the $|0\rangle$ trajectory and the integrated value lands between the clouds. Longer $\tau$ improves the SNR but raises the chance of decay ($\approx\tau/T_1$). Assignment error against $\tau$ is therefore **U-shaped**, with a best physical readout time at the bottom. Meanwhile, every other qubit idles and accumulates the idle error of Section 2.

## 9. Simulation, statistics and software terms

**Quantum software and simulation.**
- **Qiskit**: the open-source Python library for building and running quantum circuits; a circuit is a `QuantumCircuit`.
- **IonQ simulator**: IonQ's cloud simulator of its trapped-ion computers. An **ideal** simulation computes exact noiseless probabilities; a **noisy** simulation adds errors according to a **noise model**, a statistical description of a particular device. IonQ provides named models only, such as `forte-1` (its Forte system) and `forte-enterprise-1`; the retired Aria models remain selectable. An optional **seed** makes a noisy run reproducible. Forte-class noisy simulation supports up to 29 qubits.
- **Shots and counts**: a circuit is run many times; each run is a **shot** giving one bitstring. **Counts** are how many times each bitstring occurred. Shots are independent and identically distributed, so expanding counts back into a list of shots is statistically equivalent to keeping per-shot records.
- **Bit order**: Qiskit writes bitstrings with classical bit 0 as the rightmost character ("little-endian").
- **Clifford circuits**: circuits built from $H$, the phase gate $S$ and CNOT, plus $Z$-basis preparation and measurement. All circuits in this project are Clifford circuits.
- **Pauli frame**: in a Clifford circuit, a Pauli error inserted anywhere can be pushed through the remaining gates by fixed rules (for CNOT: an $X$ on the control spreads to the target). Its effect on the measured bits can therefore be computed exactly by bookkeeping, without re-running the quantum simulation. Tracking errors this way is keeping a **Pauli frame**.

**Randomness and numerical methods.**
- **Seeded random number generator**: a deterministic generator started from a number (the seed) so results repeat exactly. **mulberry32** is a small, fast 32-bit generator of this kind (not for cryptography).
- **Box–Muller**: turns two uniform random numbers into normally distributed ones: $z=\sqrt{-2\ln u_1}\cos(2\pi u_2)$.
- **Poisson sampling**: **Knuth's method** multiplies uniform numbers until the product falls below $e^{-\lambda}$ (fast for small means); **PTRS** (Hörmann's transformed rejection method) is efficient for large means.
- **Gauss–Legendre quadrature**: a numerical integration rule with $n$ points that is exact for polynomials up to degree $2n-1$. **Log-sum-exp** evaluates logarithms of sums of very small numbers without underflow.
- **Lanczos approximation**: an accurate formula for the logarithm of the gamma function, needed for $\ln n!$ in Poisson likelihoods.
- **FNV-1a hash**: a simple 32-bit hash function, used here to compare long result lists between two environments by one short fingerprint.

**Statistics.**
- **Wilson score interval**: a confidence interval for a proportion $k/n$; with $z=1.96$ for 95%, centre $(k+z^2/2)/(n+z^2)$ and half-width $z\sqrt{k(n-k)/n+z^2/4}\,/(n+z^2)$. It behaves well even when $k=0$.
- **Bootstrap**: estimating uncertainty by resampling the data with replacement many times and recomputing the statistic each time; the spread of the results is the uncertainty.
- **Standard error**: the standard deviation of an estimate; for a proportion, $\sqrt{p(1-p)/n}$.

**Platform and tools.**
- **Qollab**: the platform hosting the hackathon, where projects are published and run in the browser. A **Python/Qiskit project** runs Python code; a **JavaScript/Qiskit project** has HTML, CSS and JavaScript **panes** (editable areas) with a live preview. In both, an object named `backend` already exists when the code runs; it is the target chosen in Qollab's **Run dialog**.
- **WebAssembly**: a format that lets compiled software, including a Python interpreter, run inside a web browser.
- **JavaScript, Node.js, ES modules**: the language of web pages; Node.js runs JavaScript outside the browser (used here for tests and computations); ES modules are JavaScript's standard way of splitting code into files.
- **esbuild** and **IIFE bundle**: esbuild is a tool that combines many JavaScript files into one; an IIFE ("immediately invoked function expression") bundle is a single self-contained script that runs as soon as it loads, suitable for pasting into one pane.
- **JSON**: a plain-text format for structured data.
- **SHA-256**: a cryptographic hash used as a checksum; if any character of a file changes, its SHA-256 changes.
- **Git**: version control; a **commit** records a snapshot, a **tag** names one.
- **PyMatching**: a widely used open-source matching decoder, used here only to cross-check our own decoder.
- **Claude Code**: an AI coding assistant that writes code from instructions; used here under human direction and review, and disclosed.

---

# PART II — THE PLAN

## 10. Summary

Error correction protects quantum information by measuring parity checks again and again and letting a classical decoder infer which errors occurred (Sections 3–6). Most treatments assume those measurements are perfect bits. Real measurements are analog signals collected over a finite time: listening longer makes the signal cleaner, but the measured qubit may change state while you listen, and the other qubits idle and accumulate errors until the measurement finishes (Section 8).

This project builds a laboratory that runs entirely inside a Qollab project page. Repetition-code memory circuits are built in Qiskit and executed on IonQ's noisy simulator. The measured bits then pass through a physical readout model, first a deliberately simple one, then a trapped-ion fluorescence model, then a superconducting dispersive model, and finally into a decoder that we implement ourselves. The user can tune the readout, decode syndromes by hand against the decoder, and watch the logical error rate respond. The project is built in four stages; each stage ends in a published, working version, so the submission is always the last stage that passed its gate.

## 11. Core objective, outputs and success tiers

### 11.1 Core objective

> Publish an open-source lab, natively runnable on Qollab, that shows how the physics of qubit readout sets the logical error rate of an error-corrected memory, for trapped-ion and for superconducting readout, using Qiskit circuits executed on IonQ's simulator with its `forte-1` noise model. The readout models are classical, first-principles layers applied to the simulated measurement outcomes.

### 11.2 Measurable outputs

| ID | Output | How it is measured |
|---|---|---|
| O1 | For each platform, the readout time $\tau^*_{\log}$ that minimizes the logical error rate, compared with the time $\tau^*_{\text{phys}}$ that minimizes single-qubit assignment error | Sweep $\tau$; locate minima with bootstrap uncertainty |
| O2 | How much of the readout-induced loss soft decoding recovers relative to hard decoding (Section 7) | Logical error rate, hard against soft, at every $\tau$ |
| O3 | How the two platforms compare per QEC round and per unit of wall-clock time, at identical circuit noise | Logical error per round, and per microsecond using sourced cycle times |

### 11.3 Success tiers

| Tier | Definition | Ship point |
|---|---|---|
| Must | Core pipeline plus trapped-ion readout lab, validated, published and runnable | SP2 |
| Should | Superconducting readout added, platform toggle working | SP3 |
| Could | Full comparison with sourced parameter cards, wall-clock metric and sensitivity sweep | SP4 |

A **ship point** (SP) is a published, working version at the end of a stage (Section 17).

## 12. Hypotheses

Each hypothesis has a stated refutation condition. Refutation is a valid, reportable result.

| ID | Hypothesis | Tested by | Refuted if |
|---|---|---|---|
| C1 | Superconducting readout shows an interior optimum $\tau^*_{\log}<\tau^*_{\text{phys}}$, driven by idle errors on data qubits. Trapped-ion readout shows no idle-driven optimum; its limit is set by pumping during detection and by wall-clock time. | Logical error against $\tau$ for each platform | The superconducting minimum sits at or above $\tau^*_{\text{phys}}$ within error bars, or the ion curve shows an idle-driven minimum |
| C2 | Soft decoding lowers the logical error rate at every $\tau$, and helps most where readouts are short and ambiguous | Hard and soft curves | No statistically significant gain anywhere |
| C3 | Per round, the ion arm can match or beat the superconducting arm at long $\tau$; per unit time the comparison reverses, because the ion cycle is far longer | The comparison metrics of Section 16.5 | The ordering is the same in both metrics across the sensitivity sweep |
| C4 | Expressed as average assignment error $\bar\varepsilon$ (a platform-neutral axis), the break-even readout quality at which $d=5$ beats $d=3$ is similar for both platforms; what differs is the readout time needed to reach it | Break-even per platform | Break-even $\bar\varepsilon$ values differ by more than their uncertainties |

## 13. Deliverables

### 13.1 Artifacts

| Artifact | Where it lives | Contents |
|---|---|---|
| Main Qollab project ("Signal to Syndrome") | Qollab, JavaScript/Qiskit project | The interactive lab: levels, figures, platform toggle, live-run button, embedded shot banks and sweep results |
| Bank generator project | Qollab, Python/Qiskit project | The Qiskit circuit builder and job runner that produces the shot banks (the stored counts of each circuit configuration); anyone can re-run it |
| Repository | Local Git repository, optionally mirrored to GitHub | Source code, tests, validation scripts, data, build tool, decisions log |
| Project page | Qollab project description | Objective, how to run, physics explanation, results, validation, limitations, references, attribution |
| Demo | Short screen recording or animated GIF | Two-minute tour |

### 13.2 Deliverables by ship point

| Ship point | Deliverable | What a visitor can do |
|---|---|---|
| SP1 | Core pipeline with a flat readout error (each bit flipped with a fixed probability $\varepsilon$) | Decode syndromes by hand; move an error-rate slider and watch logical error change for $d=3,5,7$ |
| SP2 | Trapped-ion readout | Tune detection time; see photon-count histograms; compare hard and soft decoding |
| SP3 | Superconducting readout | Switch platforms; see IQ clouds, decay during readout and idle errors |
| SP4 | Comparison | Per-round against per-time comparison, break-even readout quality, sensitivity sweep |

## 14. Platform compatibility

### 14.1 Requirements and how each is met and verified

| Requirement | How the project meets it | How it is verified |
|---|---|---|
| Projects are built with Qiskit on IonQ's quantum simulator | Every circuit is a Qiskit `QuantumCircuit`; shot banks and live runs execute on the IonQ simulator through Qollab's pre-created `backend` | At kickoff: select `forte-1` and confirm that a test circuit shows noisy outcomes; time a 25-qubit noisy job. During Stage 1: run the smallest bank end to end, then all banks |
| Published and runnable on Qollab | Main project on the JavaScript/Qiskit track and bank generator on the Python/Qiskit track; no external servers, no network requests, all data embedded | At kickoff: confirm the JavaScript pane holds about 0.5 MB. Before submission: an automated release check (no network calls, size limit, attribution, licence) and a test of both projects in signed-out private windows of two browsers |
| Built inside the 48-hour window | No project code before Sat 10 Oct 04:30 IST; the repository history starts then; work before the window is limited to reading, paper derivations, sourcing parameters and installing tools | The first commit's timestamp |
| MIT licence | `LICENSE` file; licence set on both Qollab projects | Checked by the release check and at final upload |
| Attribution | "This effort is supported by Qollab & IonQ" on the project page and in the README | Checked by the release check |
| Disclosure | The README lists every library, every published method implemented, and the use of AI assistance and of planning documents prepared before the window | Read at the final README review |
| Accessibility | Colour-blind-safe palette; shape and opacity encode confidence as well as colour; full keyboard control; contrast of at least 4.5:1 | An accessibility pass with a check table, then a keyboard-only run of the levels |

### 14.2 What is known about the Qollab runtime, and what must be verified

| Topic | Known (from Qollab's lessons and IonQ's documentation) | Verified at kickoff |
|---|---|---|
| Python projects | A `backend` object exists when the code runs; it is the target chosen in the Run dialog. Code calls `backend.run(qc, shots=…)`, polls the job status, and reads `get_counts()` | Which noise-model and seed options the Qollab wrapper accepts |
| Python runtime | Runs in the browser through WebAssembly (Chrome, Edge or Opera) | Which packages import (NumPy and others) |
| JavaScript/Qiskit projects | HTML, CSS and JavaScript panes with a live preview; `backend` is pre-created; results arrive as proxy objects unpacked with `.toJs()` | Whether JavaScript can submit a job; whether the HTML pane expects a full document or only body content; how large the pasted bundle may be |
| IonQ noise models | Named models only (`forte-1`, `forte-enterprise-1`, and the retired `aria-1`, `aria-2`), with an optional seed; no custom noise models are documented | That `forte-1` is selectable from Qollab |
| Qubit limits | Forte-class noisy simulation up to 29 qubits | That a 25-qubit noisy job completes in usable time |
| Long text output | Python can print text | That long printed output can be copied out completely (used to transfer shot banks) |

### 14.3 Native-run design rules

1. **One implementation.** The physics, detectors and decoder are written once, in JavaScript, and run both in Node.js (tests and sweeps) and in the browser (the Qollab page). There is no second implementation to keep in sync.
2. **No runtime dependencies.** The shipped bundle contains only our code and the embedded data. Development tools (esbuild, Node's test runner, PyMatching for cross-checks) never ship.
3. **Heavy work is precomputed, light work is live.** Shot banks and full parameter sweeps are computed in advance and embedded. The page recomputes live at reduced statistics when a slider moves, and the live-run button submits a small fresh job.
4. **Determinism.** Every random draw uses an explicitly seeded generator, so the same computation gives identical numbers in Node.js and on the Qollab page. This is checked with an FNV-1a fingerprint of a fixed computation shown in the page's diagnostics panel.
5. **Provenance.** Every embedded data file carries its configuration, seed, checksum and the Git commit that produced it.

### 14.4 Questions for the organizers' question-and-answer session (week of 5 October)

1. Does a classical readout model applied to IonQ-simulator outcomes count as "runs on IonQ's simulator"?
2. May a JavaScript project embed precomputed JSON data of about 0.5 MB?
3. Which version of IonQ's Qiskit provider runs in the playground, and how is a noise model selected (Run dialog or code)?
4. Are AI coding assistants permitted during the build, and is disclosure required?
5. What exactly is submitted at the deadline (project link, form, video)?

### 14.5 Integrity rules

- No project code is written or executed before the window opens. Planning documents and instructions written in advance are disclosed as such.
- No code, data or designs from any employer or prior laboratory project. Parameters come from published literature and are cited on the project page.
- The README discloses AI assistance in the form the organizers require, or plainly if no form is specified.

## 15. System architecture

### 15.1 Data pipeline

The quantum part (the first two boxes) runs on IonQ's simulator; everything from the shot banks down is classical and runs inside the project.

```text
          ┌──────────────────────────────────────┐
          │ Qiskit circuits                      │
          │ repetition-code memory               │
          └───────────────────┬──────────────────┘
                              │
                              ▼
          ┌──────────────────────────────────────┐
          │ IonQ simulator                       │
          │ forte-1 noise model                  │
          └───────────────────┬──────────────────┘
                              │
                              ▼
          ┌──────────────────────────────────────┐
          │ Shot banks                           │
          │ counts stored as JSON                │
          └───────────────────┬──────────────────┘
                              │
                              ▼
          ┌──────────────────────────────────────┐
          │ Readout model, one per stage         │
          └───────────────────┬──────────────────┘
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
 ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
 │ Stage 1         │ │ Stage 2         │ │ Stage 3         │
 │ flat error      │ │ trapped ion     │ │ superconducting │
 └────────┬────────┘ └────────┬────────┘ └────────┬────────┘
          └───────────────────┼───────────────────┘
                              ▼
          ┌──────────────────────────────────────┐
          │ Bits, confidences, idle errors       │
          └───────────────────┬──────────────────┘
                              │
                              ▼
          ┌──────────────────────────────────────┐
          │ Detectors                            │
          │ space-time grid                      │
          └───────────────────┬──────────────────┘
                              │
                              ▼
          ┌──────────────────────────────────────┐
          │ Decoding graph and matching          │
          │ hard or soft weights                 │
          └───────────────────┬──────────────────┘
                              │
                              ▼
          ┌──────────────────────────────────────┐
          │ Logical error rate                   │
          │ with confidence interval             │
          └───────────────────┬──────────────────┘
                              │
                              ▼
          ┌──────────────────────────────────────┐
          │ Figures and game levels              │
          └──────────────────────────────────────┘
```

### 15.2 Deployment: from the repository to Qollab

(1) printed counts are copied from Qollab and assembled into checked JSON files in the repository; (2) the three built files are pasted into the main project's panes; (3) the main project's live-run button submits a fresh job to the IonQ simulator.

```text
┌────────────────────────────────┐          ┌────────────────────────────────┐
│ Local machine                  │          │ Qollab platform                │
│                                │          │                                │
│ ┌────────────────────────────┐ │          │ ┌────────────────────────────┐ │
│ │ Repository                 │ │          │ │ Bank generator             │ │
│ │ source, tests, data        │◀┼─────┐    │ │ Python/Qiskit project      │ │
│ └──────────────┬─────────────┘ │     │    │ └──────────────┬─────────────┘ │
│                │               │     │    │                │               │
│                ▼               │     │    │                ▼               │
│ ┌────────────────────────────┐ │     │    │ ┌────────────────────────────┐ │
│ │ Tests                      │ │     │(1) │ │ IonQ simulator             │ │
│ │ node --test                │ │     │    │ │ forte-1 noise model        │◀┼───┐
│ └──────────────┬─────────────┘ │     │    │ └──────────────┬─────────────┘ │   │
│                │               │     │    │                │               │   │
│                ▼               │     │    │                ▼               │   │
│ ┌────────────────────────────┐ │     │    │ ┌────────────────────────────┐ │   │
│ │ Bundle                     │ │     │    │ │ Counts printed in          │ │   │
│ │ esbuild, single file       │ │     └────┼─┤ checksummed chunks         │ │(3)│
│ └──────────────┬─────────────┘ │          │ └────────────────────────────┘ │   │
│                │               │          │                                │   │
│                ▼               │          │                                │   │
│ ┌────────────────────────────┐ │          │ ┌────────────────────────────┐ │   │
│ │ dist/qollab                │ │    (2)   │ │ Main project               │ │   │
│ │ three files for Qollab     ├─┼──────────┼▶│ JavaScript/Qiskit track    ├─┼───┘
│ └────────────────────────────┘ │          │ └────────────────────────────┘ │
└────────────────────────────────┘          └────────────────────────────────┘
```

**File mapping onto Qollab.**

| Source (repository) | Destination (Qollab) | Why |
|---|---|---|
| `dist/qollab/index.html` | Main project, HTML pane | Page structure |
| `dist/qollab/style.css` | Main project, CSS pane | Styling |
| `dist/qollab/app.js` | Main project, JavaScript pane | The whole application, with data embedded, as one self-contained script |
| `qollab/bank_generator.py` | Bank generator project | Lets anyone regenerate the shot banks on IonQ's simulator |
| `docs/project_page.md` | Main project description | The written project page |

### 15.3 Module map

| Path | Responsibility | Stage |
|---|---|---|
| `src/core/rng.js` | Seeded generator (mulberry32), normal draws (Box–Muller), Poisson draws (Knuth below mean 30, PTRS above), exponential draws | 1 |
| `src/core/bank.js` | Decode compact keys, expand counts into shots, map classical bits to check and data outcomes | 1 |
| `src/core/detectors.js` | Detector values from measured bits | 1 |
| `src/core/graph.js` | Decoding graph, edge weights, observable flags | 1 |
| `src/core/matching.js` | Dijkstra with observable parity; exact subset dynamic programming; greedy fallback above 20 lit detectors | 1 |
| `src/core/logical.js` | Corrected logical outcome and logical-error flag | 1 |
| `src/core/calibrate.js` | Gate-noise floor from detection rates with readout noise off | 1 |
| `src/core/stats.js` | Wilson intervals, bootstrap | 1 |
| `src/core/idle.js` | Pauli-frame idle-error injection | 1 (used from Stage 3) |
| `src/core/sweep.js` | Decoding of shots under a readout model; parameter sweeps; the determinism fingerprint | 1 |
| `src/core/readout/flat.js` | Flat assignment error | 1 |
| `src/core/quadrature.js`, `src/core/readout/ion.js` | Gauss–Legendre integration; photon-count sampler and belief likelihoods | 2 |
| `src/core/special.js`, `src/core/readout/sc.js` | erfc and helpers; dispersive sampler and belief likelihoods | 3 |
| `src/core/optimum.js` | Locating minima with bootstrap intervals | 2 |
| `src/core/metrics.js` | Per-round and per-time logical error, break-even, sensitivity | 4 |
| `src/ui/*` | Levels, charts (inline SVG), controls, live-run, diagnostics | 1–4 |
| `tools/*.mjs` | Build, bank assembly, sweeps, cross-check export, release check | 1–4 |
| `qollab/bank_generator.py` | Qiskit circuits and job runner for Qollab | 1 |
| `validation/*.py` | Local circuit tests with Qiskit's basic simulator; the PyMatching cross-check | 1 |
| `params/*.json` | Parameter cards with sources | 2–4 |

### 15.4 The readout-model contract

Every readout model exposes the same three functions, so each stage plugs in without changing anything downstream.

```js
// Constructed once per parameter setting, including the readout time tau (µs)
model.measure(trueBit, rng)        // -> { hard: 0 | 1, llr: number }  one measured bit
model.idleFlipProbability()        // -> number   per data qubit, per round of ancilla readout
model.averageAssignmentError()     // -> number   used for hard-decoding weights
```

`llr` is $\ln[p(s\mid1)/p(s\mid0)]$ under the model's belief likelihoods (Section 7). The flat model returns $\pm\ln[(1-\varepsilon)/\varepsilon]$.

### 15.5 Data formats

**Shot bank (`data/banks/*.json`, format `s2s-bank/1`).**

```json
{
  "schema": "s2s-bank/1",
  "code": "repetition", "d": 5, "r": 3, "logical": 0, "mode": "fresh-ancilla",
  "backend": "ionq simulator", "noise_model": "forte-1", "seed": 2026,
  "shots": 4000, "n_qubits": 17, "n_clbits": 17,
  "layout": { "ancilla": [[0,1,2,3],[4,5,6,7],[8,9,10,11]], "data": [12,13,14,15,16] },
  "bit_order": "qiskit-little-endian",
  "key_encoding": "hex",
  "counts": { "0": 3120, "1000": 4 },
  "checksum": { "total_shots": 4000, "n_keys": 213, "sha256": "…" }
}
```

`layout.ancilla[k][j]` is the classical bit holding check $j$ in round $k$ (counting from 0); `layout.data[i]` holds data qubit $i$. Classical bit 0 is the least significant bit of each key. Keys are stored in hexadecimal to shrink the bundle, and the SHA-256 checksum guards the copy from Qollab into the repository.

**Sweep result (`data/results/*.json`, format `s2s-results/1`).** The configuration, the parameter grid, one series per distance and decoding mode with logical error rate, interval bounds and shot counts, and provenance (commit, bank files, seeds).

## 16. Methodology

### 16.1 Stage 0: platform probe (first 90 minutes)

The probe answers the open questions of Section 14.2 before any project code depends on them. Each answer goes into a decisions log (`DECISIONS.md`) in the repository.

```text
┌────────────────────────────┐  No      ┌────────────────────────────────┐
│ forte-1 selectable         ├─────────▶│ Use another named IonQ         │
│ from Qollab?               │          │ noise model and record it      │
└──────────────┬─────────────┘          └────────────────┬───────────────┘
               │                                         │
               │ Yes                                     │
               │                                         │
               ├─────────────────────────────────────────┘
               │
               ▼
┌────────────────────────────┐  No      ┌────────────────────────────────┐
│ 25-qubit noisy job done    ├─────────▶│ Start with d = 3 and 5,        │
│ in under 15 minutes?       │          │ add d = 7 later                │
└──────────────┬─────────────┘          └────────────────┬───────────────┘
               │                                         │
               │ Yes                                     │
               │                                         │
               ├─────────────────────────────────────────┘
               │
               ▼
┌────────────────────────────┐  No      ┌────────────────────────────────┐
│ JavaScript pane holds      ├─────────▶│ Fewer shots or configurations, │
│ about 0.5 MB of data?      │          │ tighter key encoding           │
└──────────────┬─────────────┘          └────────────────┬───────────────┘
               │                                         │
               │ Yes                                     │
               │                                         │
               ├─────────────────────────────────────────┘
               │
               ▼
┌────────────────────────────┐  No      ┌────────────────────────────────┐
│ Can JavaScript submit      ├─────────▶│ Live runs in the generator     │
│ a job?                     │          │ project, linked from page      │
└──────────────┬─────────────┘          └────────────────────────────────┘
               │ Yes
               │
               ▼
┌────────────────────────────┐
│ Live-run button            │
│ in the main project        │
└────────────────────────────┘
```

### 16.2 Stage 1: the core pipeline

**Circuits.** Distance $d$, $r$ rounds, logical state $L\in\{0,1\}$ ($|1_L\rangle$ is prepared with $X$ on every data qubit). Each round gives each check $Z_jZ_{j+1}$ a fresh ancilla: CNOT from data qubit $j$ to the ancilla, then CNOT from data qubit $j+1$ (Section 4). All qubits are measured at the end (deferred measurement). Qubit count $n=d+(d-1)r$:

| $d$ | $r$ | Qubits | CNOTs | Purpose |
|---|---|---|---|---|
| 3 | 1 | 5 | 4 | Level 1 (single round) |
| 3 | 3 | 9 | 12 | Levels 2–4 |
| 5 | 3 | 17 | 24 | Distance comparison |
| 5 | 5 | 25 | 40 | $r=d$ at $d=5$ |
| 7 | 3 | 25 | 36 | Distance comparison |

Each configuration runs for $L=0$ and $L=1$: 10 jobs, 4,000 shots each, `forte-1`, fixed seed.

**Flat readout model.** Each measured bit is flipped independently with probability $\varepsilon$; its LLR is $\pm\ln[(1-\varepsilon)/\varepsilon]$; no idle errors.

**Detectors and graph.** As in Sections 5 and 6: detectors from changes between rounds plus the final layer; one boundary node; horizontal edges for data flips (end qubits connect to the boundary), vertical edges for wrong reports; the observable edges are those of data qubit 1.

**Weights.** With $w=\ln[(1-p)/p]$ and $a\oplus_p b=a+b-2ab$ (the probability that exactly one of two independent flips happens):

| Edge | Hard decoding | Soft decoding |
|---|---|---|
| Horizontal, first layer | $p=p_{\text{gate}}$ | same |
| Horizontal, middle layers | $p=p_{\text{gate}}\oplus_p p_{\text{idle}}(\tau)$ | same |
| Horizontal, final layer, data qubit $i$ | $p=p_{\text{gate}}\oplus_p\bar\varepsilon$ | $p=p_{\text{gate}}\oplus_p p_{\text{wrong}}(\hat x_i)$ |
| Vertical, report $\hat m_{j,k}$ | $p=\bar\varepsilon$ | $p=p_{\text{wrong}}(\hat m_{j,k})=1/(1+e^{\lvert\ell\rvert})$ |

**Gate-noise floor.** $p_{\text{gate}}$ is the circuit-level noise from IonQ's model, expressed as a per-edge probability. With readout noise switched off, each detector away from the ends of the time axis touches four edges; if each fails independently with probability $p$, the detector fires with probability $\tfrac12[1-(1-2p)^4]$. Solving this for $p$ from the observed firing rate (by bisection) gives $p_{\text{gate}}$.

**Matching and logical outcome.** Exact matching by subset dynamic programming up to 20 lit detectors, greedy above that (every such case counted and reported); corrected logical value $\hat L=\hat x_1\oplus\pi$ (Section 6).

**Stage 1 figure (F0).** Logical error rate against $\varepsilon$ for $d=3,5,7$ at $r=3$, for both logical states.

### 16.3 Stage 2: trapped-ion fluorescence readout

**Truth sampler.** Without a state change the count is $n\sim\text{Pois}(R_b\tau)$ for bright and $\text{Pois}(R_d\tau)$ for dark. Pumping changes the state at rate $\gamma_{b\to d}$ or $\gamma_{d\to b}$: draw a switch time $t$ from an exponential distribution; if $t<\tau$, the count is $\text{Pois}(R_{\text{initial}}t+R_{\text{final}}(\tau-t))$. At most one switch is modelled. Bright is assigned to bit 1 (a labelled convention).

**Belief likelihoods.**
$$p(n\mid\text{bright})=e^{-\gamma_{b\to d}\tau}\,\text{Pois}(n;R_b\tau)+\int_0^\tau\gamma_{b\to d}e^{-\gamma_{b\to d}t}\,\text{Pois}\big(n;R_bt+R_d(\tau-t)\big)\,dt,$$
and symmetrically for dark, evaluated with 64-point Gauss–Legendre quadrature in log space. Without pumping this reduces to the closed-form LLR of Section 8.1. The threshold $n_{\text{th}}$ minimizes the average assignment error under the belief model.

**Idle errors.** Negligible (ion memory times far exceed $\tau$); the hook exists and is set from the parameter card.

**Parameter card (`params/ion.json`).** $R_b$, $R_d$, $\gamma_{b\to d}$, $\gamma_{d\to b}$, idle memory time, a $\tau$ grid, each with a literature source. Unsourced values are labelled "UNSOURCED (illustrative)" and the page says so.

**Stage 2 figures.** F1-ion: assignment error against $\tau$ (sampler and belief model). F2-ion: logical error against $\tau$ for $d=3,5$ (and 7 if available), hard and soft.

### 16.4 Stage 3: superconducting dispersive readout

**Truth sampler.** For a measured 1, draw a decay time $t_d$ from an exponential distribution with mean $T_1$; if $t_d<\tau$, the field switches to the 0-trajectory at $t_d$ (continuing from its current value). Project onto the axis $\hat u$ joining the two steady states and integrate:
$$s=\frac{c\sqrt{\eta\kappa}}{\tau}\int_0^\tau\text{Re}\big[\alpha(t)\hat u^*\big]\,dt+\xi,\qquad\xi\sim\mathcal N(0,1/\tau),$$
with heterodyne detection ($c=\sqrt2$) as the default. The integrals have closed forms; the mean for a decay at $t_d$ is tabulated at 256 points and interpolated, so each measured bit costs one lookup and one normal draw.

**Belief likelihoods.** $p(s\mid0)=\mathcal N(s;\mu_0,\sigma)$ and
$$p(s\mid1)=e^{-\tau/T_1}\mathcal N(s;\mu_1,\sigma)+\int_0^\tau\frac{e^{-t/T_1}}{T_1}\,\mathcal N\!\Big(s;\mu_0+(\mu_1-\mu_0)\frac t\tau,\sigma\Big)dt,$$
with $\sigma=1/\sqrt\tau$ and steady-state means $\mu_0,\mu_1$ (the belief model ignores ring-up, as a calibrated decoder would).

**Idle errors (Pauli-frame injection).** During each round's ancilla readout, every data qubit flips with $p_{\text{idle}}=\tfrac12(1-e^{-\tau/T_1})$ (Section 2). An $X$ on data qubit $i$ after round $k$ flips the reports of the checks touching qubit $i$ in every later round and flips the final readout $\hat x_i$. No idle error is applied after the last round, because the data are read out together with the last ancillas. This rule is checked against circuits containing an explicit $X$ gate.

**Parameter card (`params/sc.json`).** Defaults $\chi/2\pi=1$ MHz, $\kappa/2\pi=2$ MHz ($\kappa=2\chi$), $\bar n=5$, $\eta=0.3$, $T_1=50$ µs, $\tau$ from 0.05 to 3 µs, each with a literature range. Frequencies are stored in MHz and converted to rad/µs.

**Stage 3 figures.** F1-sc (the U-curve) and F2-sc (logical error against $\tau$, hard and soft, showing whether an interior optimum exists).

### 16.5 Stage 4: comparison

**Per-round logical error.** If $p_L$ is measured after $r$ rounds, the per-round rate is $\epsilon_L=\tfrac12\big[1-(1-2p_L)^{1/r}\big]$ (the inverse of compounding $r$ independent rounds).

**Per-time rate.** $\lambda_L=\epsilon_L/T_{\text{cyc}}$, with cycle time $T_{\text{cyc}}=(\text{gate layers per round})\times t_{\text{2q}}+\tau+t_{\text{reset}}$, where each round is two layers of parallel CNOTs and $t_{\text{2q}}$, $t_{\text{reset}}$ come from sourced parameter cards (`params/cycle.json`).

**Break-even.** For each platform, the average assignment error $\bar\varepsilon$ at which $p_L(d=5)=p_L(d=3)$, and the readout time at which it occurs.

**Sensitivity.** Each physical parameter is scaled by 0.5 and by 2 in turn; for each hypothesis the report states whether it holds, flips or is undetermined.

**Figures.** F3 (break-even per platform), F4 (per-round against per-time comparison), F5 (sensitivity table).

### 16.6 Validation

| ID | Check | Pass criterion | Stage |
|---|---|---|---|
| V1 | Flat model: empirical flip rate | Equals $\varepsilon$ within 4 standard errors | 1 |
| V2 | Our decoder against PyMatching on 20,000 synthetic shots per configuration | Identical predictions except exact ties, which are counted | 1 |
| V3 | Circuits on Qiskit's ideal basic simulator | All checks report 0; one injected $X$ produces exactly the predicted bits | 1 |
| V4 | Pauli-frame injection against an explicit $X$ gate on IonQ's ideal simulator | Identical bits for every injection site | 3 |
| V5 | Gate-noise floor across banks | Detection rates consistent within intervals | 1 |
| V6 | $\lvert0_L\rangle$ against $\lvert1_L\rangle$ | Asymmetry quantified and reported | 1 |
| V7 | Ion sampler against Poisson tail sums (no pumping) | Agreement within statistical error | 2 |
| V8 | Superconducting sampler against $\tfrac12\operatorname{erfc}(\text{SNR}/2\sqrt2)$ (no decay, no ring-up) | Agreement within statistical error; U-curve appears with finite $T_1$ | 3 |
| V9 | Browser against Node.js | Identical fingerprint of a fixed computation | 1–4 |
| V10 | LLR calibration where belief equals truth | In bins of $\lvert\ell\rvert$, observed error frequency matches $1/(1+e^{\lvert\ell\rvert})$ | 2, 3 |

### 16.7 Statistics

Logical error rates carry Wilson score intervals. Because the readout layer can be redrawn cheaply but quantum shots cannot, uncertainty on curves and minima is estimated by bootstrapping over quantum shots (200 resamples), with four readout draws per quantum shot averaged first. Minima such as $\tau^*$ are located by fitting a quadratic in $\ln\tau$ near the lowest grid point; when the lowest point is at the edge of the grid, the result is "no interior minimum". All seeds are fixed and recorded.

## 17. Milestones and timeline

All times are IST. T0 = Sat 10 Oct 04:30 IST = Fri 9 Oct 19:00 ET.

### 17.1 Timeline

```text
                          Sat 04:30               Sun 04:30       Mon 04:30
                                      Sat 16:30               Sun 16:30
                          ├───────────┼───────────┼───────────┼───────────┤
Probe and setup           █
Stage 1: core pipeline     ████████◆ SP1
Stage 2: trapped ion               ███████◆ SP2
Stage 3: superconducting                  ██      ██████◆ SP3
Stage 4: comparison                                     █████◆ SP4
Project page and demo                                        ████
Buffer, fixes only                                               ███
Freeze, verify, submit                                              ███◆ submitted
Sleep                                       ░░░░░░
Slack before deadline                                                  ░░░

█ work   ░ rest   ◆ ship point published   one column = one hour, times in IST
```

### 17.2 Milestones, gates and cut rules

A **gate** is the set of conditions a stage must meet before its ship point is published. A **cut deadline** is the time at which, if the gate is still not met, the stage's scope is reduced by its **cut rule**.

| Milestone | Target (IST) | Gate (all must hold) | Cut deadline | Cut rule |
|---|---|---|---|---|
| M0 Probe done | Sat 06:00 | All probe questions answered and recorded (bank jobs follow at about 07:40, once the generator exists) | Sat 06:30 | Proceed with the recorded fallbacks |
| M1 = SP1 | Sat 14:00 | V1, V2, V3 pass; F0 produced; levels 1–2 work on Qollab | Sat 13:30 | Drop $d=7$ and level 2; publish level 1 with F0 for $d=3,5$ |
| M2 = SP2 | Sat 21:00 | V7 and V10 (ion) pass; F1-ion and F2-ion produced; levels 3–4 work for the ion | Sat 20:30 | Pumping off (exact Poisson LLR); keep level 3; show F2 as a static chart |
| M3 = SP3 | Sun 11:00 | V4, V8 and V10 (superconducting) pass; F1-sc and F2-sc produced; platform toggle works | Sun 10:30 | Ring-up off (steady-state signal, decay kept); keep V4 |
| M4 = SP4 | Sun 16:00 | Parameter cards sourced; F3 and F4 produced | Sun 15:30 | Drop the sensitivity sweep and say so |
| M5 Page | Sun 20:00 | Page complete; demo recorded | Sun 19:30 | Annotated GIF or screenshots instead of a video |
| M6 Submitted | Mon 01:30 | Final version verified in signed-out browsers; submission confirmed | Mon 03:00 | Submit the last published ship point as it stands |

### 17.3 Gate logic

```text
┌──────────────────────────┐
│ Start the stage          │
└─────────────┬────────────┘
              │
              │
              ▼
┌──────────────────────────┐
│ Build and test           │◀─────────────────────────────┐
└─────────────┬────────────┘                              │
              │                                           │ No
              │                                           │
              ▼                                           │
┌──────────────────────────┐  No        ┌─────────────────┴────────────────┐
│ Gate passed?             ├───────────▶│ Cut deadline reached?            │
└─────────────┬────────────┘            └─────────────────┬────────────────┘
              │ Yes                                       │ Yes
              │                                           │
              ▼                                           ▼
┌──────────────────────────┐            ┌──────────────────────────────────┐
│ Publish the ship point   │◀─────┐     │ Apply the stage's cut rule       │
└─────────────┬────────────┘      │     └─────────────────┬────────────────┘
              │                   │                       │
              │                   │                       │
              ▼                   │                       ▼
┌──────────────────────────┐      │Yes  ┌──────────────────────────────────┐
│ Next stage               │      └─────┤ Reduced gate passed?             │
└──────────────────────────┘            └─────────────────┬────────────────┘
                                                          │ No
                                                          │
                                                          ▼
                                        ┌──────────────────────────────────┐
                                        │ Keep the last published ship     │
                                        │ point; go to page and demo       │
                                        └──────────────────────────────────┘
```

### 17.4 Ship-point policy

- Publish at every ship point, starting with SP1. That proves the publishing path works while there is time to fix it; each later ship point updates the same project.
- From Sun 22:30 IST, no new features: only verification, publishing and submission.
- Submit no later than Mon 01:30 IST; the remaining three hours are slack for platform problems.

## 18. The interactive experience

| Level | Introduced at | What the player does | Concept |
|---|---|---|---|
| 1. Be the decoder | SP1 | $d=3$, one round: detectors light up; click the data qubit to flip | Syndrome → correction |
| 2. Time is a dimension | SP1 | Three rounds on the space-time grid; an error-rate slider shows logical error for $d=3,5,7$ | Measurement errors are vertical pairs; codes need low enough error |
| 3. Listen longer? | SP2 (ion), SP3 (both) | Tune the readout time; see count histograms or IQ clouds; minimize logical error over a batch | Physical optimum against logical optimum |
| 4. Trust but verify | SP2 (ion), SP3 (both) | Detectors shaded by confidence; hard against soft decoding side by side | Soft information |
| 5. Two platforms | SP4 | Side-by-side curves, per round and per microsecond, with parameter sources shown | What differs between platforms and why |

Accessibility: colour-blind-safe palette, confidence shown by shape and opacity as well as colour, full keyboard control, contrast of at least 4.5:1, a text alternative for every chart.

## 19. Risks and fallbacks

| Risk | Likelihood | Effect | Mitigation |
|---|---|---|---|
| Noise model not selectable from Qollab | Low–medium | No realistic syndromes | Probe it first; ask at the question session; fall back to another named IonQ model |
| Noisy 25-qubit jobs slow or queued | Medium | Missing $d=7$ data | Submit all jobs as soon as the generator passes its tests; small circuits first; cut $d=7$ at M1 |
| Bundle too large for the JavaScript pane | Medium | Page fails to save or load | Probe the size limit; hexadecimal keys; fewer shots; fewer configurations |
| JavaScript cannot submit jobs | Medium | No live-run button | Live runs in the generator project, linked from the page |
| Bit-order or layout bug | High if untested | Every result wrong | Circuit tests (V3) are the first tests written and run |
| Browser too slow for live recomputation | Medium | Laggy sliders | Precomputed sweeps; live recomputation at reduced shots |
| Fatigue errors in the second 18-hour block | High | Bugs at the worst time | Fixed sleep block; independent review after each stage; no new features after Sun 22:30 |
| Last-minute publishing failure | Medium | No submission | Publish from SP1 onward; submit by Mon 01:30 |
| `forte-1` already includes measurement error | Medium | Readout error counted twice | Treat the simulator's bits as the baseline for both platforms; calibrate with V5 |
| The comparison read as a hardware benchmark | Medium | Credibility | Claims policy (Section 20), sensitivity sweep, explicit captions |

## 20. Limitations and claims policy

**What the project claims.** How readout physics, under stated parameter cards, shapes the logical error of a repetition-code memory with fixed IonQ circuit noise, and how soft information changes that picture.

**What it does not claim.**

- It does not say which platform is better. Both readout models are classical models with literature parameters, applied to the same simulated circuit noise.
- It is not a hardware benchmark. The gate noise for both platforms is IonQ's `forte-1` model.
- The repetition code protects against bit flips only; phase errors are outside the study.
- Idle errors use the Pauli-twirling approximation of amplitude damping.
- The ion model allows at most one state change per detection window; the superconducting belief model ignores ring-up.
- Code distances are small (up to 7), so threshold values are not extrapolated.

---

## References

Bibliographic details should be verified against the publisher before they appear on the project page.

**Platform and rules**

1. Qollab, Programs (hackathon terms): https://qollab.xyz/programs
2. Qollab, Quantum Hackathon: https://qollab.xyz/programs/hackathon
3. Qollab, Grant Program: https://qollab.xyz/programs/credits-grant
4. ACENET, "ACENET Partners with Qollab and IonQ in Quantum Hackathon": https://www.ace-net.ca/acenet-partners-with-qollab-and-ionq-in-quantum-hackathon/
5. Qollab lesson, "Two qubits and the Bell pair" (the Python project pattern): https://qollab.xyz/learn/programming-your-first-quantum-circuits/two-qubits
6. IonQ, "Simulation with noise models": https://docs.ionq.com/guides/simulation-with-noise-models
7. IonQ, Qiskit SDK guide: https://docs.ionq.com/sdks/qiskit

**Error correction and decoding**

8. P. W. Shor, "Scheme for reducing decoherence in quantum computer memory," Phys. Rev. A 52, R2493 (1995).
9. D. Gottesman, *Stabilizer Codes and Quantum Error Correction*, PhD thesis, Caltech (1997), arXiv:quant-ph/9705052.
10. M. A. Nielsen and I. L. Chuang, *Quantum Computation and Quantum Information*, 10th anniversary ed., Cambridge University Press (2010).
11. E. Dennis, A. Kitaev, A. Landahl and J. Preskill, "Topological quantum memory," J. Math. Phys. 43, 4452 (2002).
12. J. Edmonds, "Paths, trees, and flowers," Can. J. Math. 17, 449 (1965).
13. A. G. Fowler, M. Mariantoni, J. M. Martinis and A. N. Cleland, "Surface codes: Towards practical large-scale quantum computation," Phys. Rev. A 86, 032324 (2012).
14. B. M. Terhal, "Quantum error correction for quantum memories," Rev. Mod. Phys. 87, 307 (2015).
15. O. Higgott, "PyMatching: A Python package for decoding quantum codes with minimum-weight perfect matching," ACM Trans. Quantum Comput. 3, 16 (2022).
16. O. Higgott and C. Gidney, "Sparse Blossom: correcting a million errors per core second with minimum-weight matching," arXiv:2303.15933 (2023).
17. C. A. Pattison, M. E. Beverland, M. P. da Silva and N. Delfosse, "Improved quantum error correction using soft information," arXiv:2107.13589 (2021).
18. Google Quantum AI, "Exponential suppression of bit or phase errors with cyclic error correction," Nature 595, 383 (2021).
19. Google Quantum AI, "Suppressing quantum errors by scaling a surface code logical qubit," Nature 614, 676 (2023).
20. Google Quantum AI and Collaborators, "Quantum error correction below the surface code threshold," Nature 638, 920 (2025).

**Readout physics**

21. A. Blais, R.-S. Huang, A. Wallraff, S. M. Girvin and R. J. Schoelkopf, "Cavity quantum electrodynamics for superconducting electrical circuits," Phys. Rev. A 69, 062320 (2004).
22. A. Blais, A. L. Grimsmo, S. M. Girvin and A. Wallraff, "Circuit quantum electrodynamics," Rev. Mod. Phys. 93, 025005 (2021).
23. J. Koch et al., "Charge-insensitive qubit design derived from the Cooper pair box," Phys. Rev. A 76, 042319 (2007).
24. J. Gambetta, W. A. Braff, A. Wallraff, S. M. Girvin and R. J. Schoelkopf, "Protocols for optimal readout of qubits using a continuous quantum nondemolition measurement," Phys. Rev. A 76, 012325 (2007).
25. P. Krantz et al., "A quantum engineer's guide to superconducting qubits," Appl. Phys. Rev. 6, 021318 (2019).
26. T. Walter et al., "Rapid high-fidelity single-shot dispersive readout of superconducting qubits," Phys. Rev. Applied 7, 054020 (2017).
27. D. Sank et al., "Measurement-induced state transitions in a superconducting qubit: beyond the rotating wave approximation," Phys. Rev. Lett. 117, 190503 (2016).
28. A. H. Myerson et al., "High-fidelity readout of trapped-ion qubits," Phys. Rev. Lett. 100, 200502 (2008).
29. H. M. Wiseman and G. J. Milburn, *Quantum Measurement and Control*, Cambridge University Press (2010).

**Numerical and statistical methods**

30. E. B. Wilson, "Probable inference, the law of succession, and statistical inference," J. Am. Stat. Assoc. 22, 209 (1927).
31. B. Efron, "Bootstrap methods: another look at the jackknife," Ann. Statist. 7, 1 (1979).
32. G. E. P. Box and M. E. Muller, "A note on the generation of random normal deviates," Ann. Math. Statist. 29, 610 (1958).
33. W. Hörmann, "The transformed rejection method for generating Poisson random variables," Insurance: Mathematics and Economics 12, 39 (1993).
34. D. E. Knuth, *The Art of Computer Programming, Vol. 2: Seminumerical Algorithms*, 3rd ed., Addison-Wesley (1997).
35. C. Lanczos, "A precision approximation of the gamma function," SIAM J. Numer. Anal. Ser. B 1, 86 (1964).
36. M. Abramowitz and I. A. Stegun (eds.), *Handbook of Mathematical Functions*, National Bureau of Standards (1964): Gauss–Legendre quadrature and the error function.
37. G. Fowler, L. C. Noll and K.-P. Vo, FNV hash function (Fowler–Noll–Vo), IETF Internet-Draft draft-eastlake-fnv.

---

## Glossary

Numbers in parentheses are the sections where each term is explained.

- **Amplitude damping**: energy relaxation from $|1\rangle$ to $|0\rangle$ (2).
- **Ancilla**: a helper qubit used to measure a check without measuring the data qubits (4).
- **Assignment error**: the probability that a measurement reports the wrong bit (2, 8).
- **Belief model**: the simplified model from which the decoder computes LLRs (7).
- **Bootstrap**: uncertainty estimation by resampling with replacement (9).
- **Boundary node**: the decoding-graph node representing the end of the chain (5, 6).
- **Bright and dark states**: the ion states that do and do not fluoresce (8.1).
- **Check**: a parity operator measured repeatedly to detect errors (4).
- **Circuit-level noise**: a noise model in which every operation can fail (6).
- **Clifford circuit**: a circuit of $H$, $S$, CNOT and $Z$-basis operations (9).
- **Code distance ($d$)**: the fewest errors that change the logical state undetected (3).
- **Coherent state**: the quasi-classical state of a driven resonator, described by $\alpha$ (8.2).
- **Counts**: how many times each bitstring occurred over the shots (9).
- **Critical photon number**: the photon number above which dispersive readout stops being non-demolition (8.2).
- **Cut deadline and cut rule**: when and how a stage's scope is reduced if its gate is not met (17).
- **Decoder**: the classical algorithm that infers corrections from detection events (6).
- **Decoding graph**: detectors as nodes and possible single errors as edges (6).
- **Deferred measurement**: measuring an untouched qubit at the end gives the same statistics (4).
- **Detector, detection event**: a combination of outcomes that is 0 without errors; a detector with value 1 (5).
- **Dispersive shift ($\chi$)**: the qubit-state-dependent shift of the resonator frequency (8.2).
- **Efficiency ($\eta$)**: the fraction of ideal signal-to-noise retained by the detection chain (8.2).
- **Fresh ancillas**: a new ancilla for every check in every round (4).
- **Gate (milestone)**: the conditions a stage must meet before its ship point is published (17).
- **Gate-noise floor ($p_{\text{gate}}$)**: circuit noise expressed as a per-edge probability (16.2).
- **Hard and soft decoding**: decoding with decided bits only, or with per-measurement confidence (7).
- **Heterodyne and homodyne detection**: recording both quadratures, or one (8.2).
- **Idle error**: an error accumulated by a qubit while waiting (2, 16.4).
- **IQ plane, quadratures**: the plane of the two components of the readout signal (8.2).
- **Linewidth ($\kappa$)**: a resonator's energy decay rate (8.2).
- **Log-likelihood ratio (LLR, $\ell$)**: $\ln[p(s\mid1)/p(s\mid0)]$ (7).
- **Logical error, logical error rate**: failure of the protected bit; its frequency (3, 6).
- **Logical observable**: the quantity used to read the logical value, here data qubit 1 (6).
- **Logical state**: the encoded state, for example $a|000\rangle+b|111\rangle$ (3).
- **Mid-circuit measurement**: measuring qubits while the circuit continues (4).
- **Minimum-weight perfect matching (MWPM)**: the lowest-cost pairing of lit detectors (6).
- **Noise model**: a statistical description of a device's errors used by a simulator (9).
- **Pauli error**: a random $X$, $Y$ or $Z$ (2).
- **Pauli frame**: classical bookkeeping of Pauli errors through a Clifford circuit (9).
- **Pauli twirling**: approximating a channel by Pauli errors with the same average effect (2).
- **Phenomenological noise**: data flips plus independent wrong syndrome bits (6).
- **Projective measurement**: a measurement that leaves the qubit in the measured eigenstate (1).
- **Pumping (off-resonant)**: a laser-induced change of an ion's state during detection (8.1).
- **QEC round**: one measurement of all checks (4).
- **Repetition code**: $d$ data qubits with neighbour parity checks; protects against bit flips (3).
- **Ring-up**: the build-up of the resonator field after the drive starts (8.2).
- **Shot**: one run of a circuit (9).
- **Shot bank**: the stored counts of one circuit configuration (13, 15.5).
- **Ship point (SP)**: a published, working version at the end of a stage (11, 17).
- **Signal-to-noise ratio (SNR)**: separation of the two signal clouds divided by their width (8.2).
- **Surface code**: a two-dimensional code protecting against all single-qubit errors (3).
- **Syndrome**: the list of check outcomes (4).
- **$T_1$, $T_2$**: relaxation and dephasing times (2).
- **Threshold**: the physical error rate below which larger codes help (6).
- **Transmon**: a superconducting qubit built with a Josephson junction (8.2).
- **Truth model**: the detailed model that generates the simulated signals (7).
- **U-curve**: assignment error against integration time, falling then rising (8.2).
- **Wilson score interval**: a confidence interval for a proportion (9).

*This effort is supported by Qollab & IonQ.*
