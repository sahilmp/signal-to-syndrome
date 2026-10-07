# Signal to Syndrome

## Authors

- Soumyajit Pal: physics and data
- Sahil Prabhudesai: decoder, interface and platform

## About

Signal to Syndrome is an open-source lab, published and runnable on Qollab, that shows how qubit-readout physics sets the logical error rate of a repetition-code memory. The circuits are written in Qiskit and run on IonQ's simulator with the forte-1 noise model, submitted in native gates so that IonQ's optimiser does not remove them. Readout is modelled classically in JavaScript (flat, trapped-ion and superconducting models), and the syndromes are decoded by our own exact minimum-weight matching decoder.

## Status

SP0: repository scaffold. No physics, decoder or interface code yet.

## Run it on Qollab

Link to the published Qollab project: pending.

## Rebuild locally

Requires Node.js 20 or later.

```bash
npm install
npm test
npm run build
```

The build writes `dist/qollab/` (`index.html`, `main.css`, `main.js`), the three files uploaded to Qollab. (The build is not implemented yet.)

## Repository layout

- `src/core/`: core logic as ES modules (readout models in `src/core/readout/`), no runtime dependencies
- `src/ui/`: user interface, with stubs in `src/ui/stubs/`
- `tools/`: Node scripts for build, sweeps and checks
- `tests/`: Node test files (`*.test.js`)
- `qollab/`: Python that runs on Qollab (bank generator, live-run helper)
- `validation/`: local Python validation
- `data/`: banks, raw data, results, test vectors and fixtures
- `params/`: physical parameter files
- `docs/`: plans, notes and the project page

## Methods implemented and sources

(None yet.)

## Libraries and tools

- esbuild: build-only tool; nothing from it ships at runtime
- Qiskit: circuit construction and transpilation
- The IonQ provider, through Qollab
- PyMatching and pytest: local validation only

## AI assistance and planning disclosure

Placeholder: planning documents and prompts were prepared before the build window; all code was generated during the window with Claude Code under the authors' direction and reviewed by the authors.

## Licence

MIT. See [LICENSE](LICENSE).

This effort is supported by Qollab & IonQ.
