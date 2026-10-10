import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { curateFromRepo, serialize, OUT_PATH, CURATE } from '../tools/curate.mjs';
import { decodeCurated, curatedShot, curatedSentence, CURATED_KINDS } from '../src/ui/level4.js';
import { curatedShots, stage2v2, paramsIon, bankD3R3 } from '../src/ui/bridge_data.js';
import { createIonReadout } from '../src/core/readout/ion.js';
import { expandShots } from '../src/core/bank.js';

const file = JSON.parse(readFileSync(OUT_PATH, 'utf8'));
const L0 = 'rep_d3_r3_L0';
const L1 = 'rep_d3_r3_L1';
const bankL1 = JSON.parse(readFileSync(new URL('../data/banks/rep_d3_r3_L1.json', import.meta.url), 'utf8'));

// Catches: fails if curate.mjs depends on anything that changes between runs (a date, Math.random,
// object key order) or if the committed file is stale against the current tool, banks, params or
// rates: two fresh runs and the file on disk must be the same bytes.
test('curate.mjs output is reproducible and matches the committed file', () => {
  const a = serialize(curateFromRepo());
  const b = serialize(curateFromRepo());
  assert.equal(a, b);
  // Line endings normalised: a Windows checkout with core.autocrlf turns the file's LF into CRLF.
  assert.equal(a, readFileSync(OUT_PATH, 'utf8').replace(/\r\n/g, '\n'));
  // The page embeds the same object.
  assert.deepEqual(curatedShots, file);
});

// Catches: fails if the scan settings drift from U7.11 (tau, seed, shot count, R) or if the
// per-bank counts change: with these settings the stored-0 bank has 0 soft saves and 72 soft
// fails in its first 4000 shots, and the stored-1 bank 575 soft saves and 0 soft fails (B50).
test('per-bank counts: L0 0 saves / 72 fails, L1 575 saves / 0 fails', () => {
  assert.equal(file.settings.tau_us, 3);
  assert.equal(file.settings.seed, 20261011);
  assert.equal(file.settings.maxShots, 4000);
  assert.equal(file.settings.readoutDrawsPerShot, 1);
  assert.equal(file.settings.decoder, 'learned');
  assert.deepEqual(file.settings.banks, CURATE.banks);
  assert.equal(file.banks[L0].shotsScanned, 4000);
  assert.equal(file.banks[L1].shotsScanned, 4000);
  assert.equal(file.banks[L0].logical, 0);
  assert.equal(file.banks[L1].logical, 1);
  assert.equal(file.banks[L0].counts.softSaves, 0);
  assert.equal(file.banks[L0].counts.softFails, 72);
  assert.equal(file.banks[L1].counts.softSaves, 575);
  assert.equal(file.banks[L1].counts.softFails, 0);
  assert.equal(file.banks[L0].counts.nonExact + file.banks[L1].counts.nonExact, 0);
});

// Catches: fails if saves and fails come from the wrong bank, if more than 10 are kept, or if a
// record's hex key is not the shot at its index (so replaying from the file would show another
// shot than the one the scan found).
test('saves come from L1 and fails from L0, up to 10 each, keys match the banks', () => {
  assert.equal(file.softSaves.length, 10);
  assert.equal(file.softFails.length, 10);
  const banks = { [L0]: expandShots(bankD3R3), [L1]: expandShots(bankL1) };
  for (const [kind, label] of [['softSaves', L1], ['softFails', L0]]) {
    for (const rec of file[kind]) {
      assert.equal(rec.bank, label);
      const { shotBits } = curatedShot(file, rec);
      assert.deepEqual([...shotBits], [...banks[label][rec.index]]);
    }
  }
});

// Catches: fails if a curated "soft saves" shot does not really have hard error 1 and soft error
// 0 under the stated settings when replayed from the file alone (wrong rates, readout, seed rule
// or decoder in Level 4's replay), and the reverse for "soft fails".
test('every curated shot replays to its kind from the file alone', () => {
  const readout = createIonReadout(paramsIon, file.settings.tau_us);
  for (const rec of file.softSaves) {
    const { hard, soft } = decodeCurated(file, rec, readout);
    assert.equal(hard.logicalError, 1, `save ${rec.index}`);
    assert.equal(soft.logicalError, 0, `save ${rec.index}`);
  }
  for (const rec of file.softFails) {
    const { hard, soft } = decodeCurated(file, rec, readout);
    assert.equal(hard.logicalError, 0, `fail ${rec.index}`);
    assert.equal(soft.logicalError, 1, `fail ${rec.index}`);
  }
});

// Catches: fails if the page sentence drops either bank's counts or the averages over both stored
// values (stage 2, learned, d = 3: soft 0.0256, hard 0.0885 at tau = 3 us), so one curated shot
// could be read as the average.
test('the curated sentence gives both counts and the 2.6% against 8.9% averages', () => {
  const t = curatedSentence(file, stage2v2);
  assert.match(t, /stored value was 1, soft decoding saved the bit 575 times and lost it 0 times/);
  assert.match(t, /stored value was 0, soft decoding saved the bit 0 times and lost it 72 times/);
  assert.match(t, /4,000 stored shots/);
  assert.match(t, /2\.6% of the time against 8\.9%/);
  assert.equal(CURATED_KINDS.map((k) => k.kind).join(), 'softSaves,softFails');
});
