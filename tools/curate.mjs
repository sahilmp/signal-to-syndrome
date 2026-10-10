// Curated Level 4 examples (team checklist Appendix U7.11, with the deviation of B50 below).
// Usage: node tools/curate.mjs
// Trapped-ion readout at tau = 3 us (params/ion.json, no crosstalk, as in Level 4), learned
// decoder (the d = 3, r = 3, Z-basis classes of data/results/dem_forte1.json, the rates the page
// uses), first 4000 shots in key order of each bank, R = 1 readout draw per shot.
// Shot s of a bank gets its readout seed from createRng(SEED): seed_s = 1 + rng.int(2^31 - 1),
// drawn in shot order (the same seeds for both banks); hard and soft decoding each start from
// createRng(seed_s), so both see identical readings (the Level 4 rule).
// Deviation from U7.11 (B50, agreed with Person B): U7.11 names rep_d3_r3_L0 only, where hard
// never fails while soft succeeds (the ion's dark readings are reliable; soft decoding's uniform
// prior undervalues them). Both banks are scanned: "softSaves" come from rep_d3_r3_L1 and
// "softFails" from rep_d3_r3_L0, up to 10 each. The per-bank counts of both kinds are stored.
// Each record carries its bank label, hex key and seed, and each bank its layout, so Level 4
// replays a shot from this file alone.
// Output: data/curated/curated_shots.json. No date or commit in the file, so two runs give the
// same bytes.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRng } from '../src/core/rng.js';
import { expandShots } from '../src/core/bank.js';
import { decodeShot } from '../src/core/sweep.js';
import { createIonReadout } from '../src/core/readout/ion.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const p = (...parts) => join(root, ...parts);
const readJson = (...parts) => JSON.parse(readFileSync(p(...parts), 'utf8'));

export const CURATE = {
  banks: { softSaves: 'rep_d3_r3_L1', softFails: 'rep_d3_r3_L0' },
  platform: 'trapped-ion',
  params: 'params/ion.json',
  tau_us: 3,
  decoder: 'learned',
  rates: 'data/results/dem_forte1.json (d = 3, r = 3, basis Z)',
  seed: 20261011,
  maxShots: 4000,
  readoutDrawsPerShot: 1,
  perKind: 10,
};
export const OUT_PATH = p('data', 'curated', 'curated_shots.json');

// The learned rates of the d = 3, r = 3, Z-basis banks in dem_forte1.json.
export function learnedRates(dem, d = 3, r = 3) {
  const b = (dem.banks || []).find((x) => x.d === d && x.r === r && (x.basis ?? 'Z') === 'Z');
  if (!b) throw new Error(`dem_forte1.json has no d = ${d}, r = ${r} Z-basis bank`);
  return { ...b.classes };
}

// Readout seed of every shot, in shot order (U7.11: the seed is part of each record).
export function readoutSeeds(seed, n) {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => 1 + rng.int(2 ** 31 - 1));
}

// Hard and soft decoding of one shot from the same readout seed. `bank` needs layout, d, r,
// logical (and basis, default Z).
export function decodePair({ bank, shotBits, readout, rates, seed }) {
  const args = { shotBits, layout: bank.layout, d: bank.d, r: bank.r, readout, noise: { model: 'learned', rates }, basis: bank.basis ?? 'Z', logical: bank.logical };
  return {
    hard: decodeShot({ ...args, mode: 'hard', rng: createRng(seed) }),
    soft: decodeShot({ ...args, mode: 'soft', rng: createRng(seed) }),
  };
}

// The hex key of a shot (classical bit i is bit i of the integer, as in the bank keys).
const keyOf = (bits) => bits.reduce((acc, b, i) => acc + (b ? 2 ** i : 0), 0).toString(16);

// Scans one bank: counts of both kinds and the first `perKind` records of each.
export function scanBank({ label, bank, readout, rates, settings }) {
  const shots = expandShots(bank);
  const n = Math.min(settings.maxShots, shots.length);
  const seeds = readoutSeeds(settings.seed, n);
  const kinds = { softSaves: [], softFails: [] };
  const counts = { softSaves: 0, softFails: 0, hardErrors: 0, softErrors: 0, nonExact: 0 };
  for (let s = 0; s < n; s++) {
    const { hard, soft } = decodePair({ bank, shotBits: shots[s], readout, rates, seed: seeds[s] });
    counts.hardErrors += hard.logicalError;
    counts.softErrors += soft.logicalError;
    if (!hard.exact || !soft.exact) counts.nonExact++;
    const kind = hard.logicalError === 1 && soft.logicalError === 0 ? 'softSaves'
      : hard.logicalError === 0 && soft.logicalError === 1 ? 'softFails' : null;
    if (kind === null) continue;
    counts[kind]++;
    if (kinds[kind].length < settings.perKind) {
      kinds[kind].push({ bank: label, index: s, key: keyOf(shots[s]), seed: seeds[s], nDefects: hard.nDefects });
    }
  }
  return {
    info: {
      d: bank.d, r: bank.r, logical: bank.logical, basis: bank.basis ?? 'Z', n_clbits: bank.n_clbits, layout: bank.layout,
      samplerSeed: bank.sampler_seed ?? null, shots: bank.shots, shotsScanned: n, counts,
    },
    kinds,
  };
}

// The curated file as an object (pure: the inputs are passed in). banks: { label: bank }.
export function curate({ banks, paramsIon, dem, settings = CURATE }) {
  const readout = createIonReadout(paramsIon, settings.tau_us);
  const first = banks[settings.banks.softSaves];
  const rates = learnedRates(dem, first.d, first.r);
  const scans = {};
  for (const label of [...new Set(Object.values(settings.banks))].sort()) {
    if (!banks[label]) throw new Error(`curate: bank ${label} not given`);
    scans[label] = scanBank({ label, bank: banks[label], readout, rates, settings });
  }
  return {
    schema: 's2s-curated/1',
    note: 'index: position in expandShots(bank) (keys in ascending order); key: the shot as a hex key of that bank; seed: the readout seed, createRng(seed) for both hard and soft decoding.',
    settings: { ...settings, rates },
    banks: Object.fromEntries(Object.entries(scans).map(([l, s]) => [l, s.info])),
    softSaves: scans[settings.banks.softSaves].kinds.softSaves,
    softFails: scans[settings.banks.softFails].kinds.softFails,
    provenance: { tool: 'tools/curate.mjs' },
  };
}

export function curateFromRepo(settings = CURATE) {
  const banks = {};
  for (const label of new Set(Object.values(settings.banks))) banks[label] = readJson('data', 'banks', `${label}.json`);
  return curate({ banks, paramsIon: readJson('params', 'ion.json'), dem: readJson('data', 'results', 'dem_forte1.json'), settings });
}

export const serialize = (obj) => `${JSON.stringify(obj, null, 2)}\n`;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = curateFromRepo();
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, serialize(out));
  const lines = Object.entries(out.banks).map(([l, b]) => `${l}: ${b.shotsScanned} shots, soft saves ${b.counts.softSaves}, soft fails ${b.counts.softFails}, non-exact ${b.counts.nonExact}`);
  console.log(`${OUT_PATH}\n  ${lines.join('\n  ')}\n  kept: ${out.softSaves.length} saves, ${out.softFails.length} fails`);
}
