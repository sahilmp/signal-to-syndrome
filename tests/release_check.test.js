import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// tools/release_check.mjs is a script (it runs its checks and exits), so its NEEDS and
// RESULTS_FILES literals are read from the source text, and its rows from a real run.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'tools', 'release_check.mjs'), 'utf8');
const literal = (name, open, close) => {
  const m = new RegExp(`const ${name} = (\\${open}[\\s\\S]*?\\n\\${close});`).exec(source);
  assert.ok(m, `${name} not found in release_check.mjs`);
  return new Function(`return ${m[1]};`)();
};
const NEEDS = literal('NEEDS', '{', '}');
const RESULTS_FILES = literal('RESULTS_FILES', '[', ']');

// CC-B21 item 7. Catches: fails if a flag can be switched on while a bridge export it now uses
// still points at a stub or fixture, because NEEDS does not list it: the held-out file for
// "Learn the noise", the phase-flip bank for Level 3's batch, and the learned rates (demForte1)
// for every flag whose level decodes with the learned decoder.
test('NEEDS lists the exports each flag uses after U3 rows 29-31', () => {
  for (const f of ['level1', 'level2', 'ion', 'superconducting']) assert.ok(NEEDS[f].includes('demForte1'), `${f} needs demForte1`);
  assert.ok(NEEDS.learnNoise.includes('holdout') && NEEDS.learnNoise.includes('demForte1'));
  assert.ok(NEEDS.phaseFlip.includes('bankXD3R3'));
  // Levels 3 and 4 read stage2v2 / stage3v2 now, not the v1 stage2 / stage3.
  assert.ok(NEEDS.ion.includes('stage2v2') && NEEDS.superconducting.includes('stage3v2'));
});

// CC-B21 item 7. Catches: fails if the release check does not know a results file the bridges
// now use (U3 rows 29-30 and the dense-grid deviation), or if a bridge points at a results file
// outside its list, or if its run does not pass the results-file row of each such export.
test('RESULTS_FILES knows the 2.1 files, and the run passes each bridge results file', () => {
  for (const f of ['stage2_ion_v2b.json', 'stage2_ion_x_v2b.json', 'stage3_sc_dense.json', 'stage3_sc_x_dense.json', 'holdout.json']) {
    assert.ok(RESULTS_FILES.includes(f), f);
  }
  const bridge = readFileSync(join(root, 'src', 'ui', 'bridge_data.js'), 'utf8');
  const used = [...bridge.matchAll(/^import (\w+) from '\.\.\/\.\.\/data\/results\/([^']+)'/gm)].map((m) => [m[1], m[2]]);
  assert.ok(used.length >= 14);
  for (const [, f] of used) assert.ok(RESULTS_FILES.includes(f), `bridge file ${f} not in RESULTS_FILES`);
  const run = spawnSync(process.execPath, [join(root, 'tools', 'release_check.mjs')], { cwd: root, encoding: 'utf8' });
  for (const [name] of used) {
    assert.match(run.stdout, new RegExp(`results file for ${name} known and valid\\s+PASS`), name);
  }
});
