import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { validateBank, bitsFromKey, split } from '../src/core/bank.js';
import { applyX } from '../src/core/idle.js';

// V4: banks from the ideal simulator with one physical X gate injected on data qubit i after
// round k ("inject": [[i, k]]). Every shot must give the same outcome, and that outcome must
// equal the error-free bits (ancillas 0, data equal to the logical value) after applyX.

const BANK_DIR = 'data/banks';
const files = readdirSync(BANK_DIR).filter((f) => /^v4_.*\.json$/.test(f)).sort();
const plain = ({ m, x }) => ({ m: m.map((row) => Array.from(row)), x: Array.from(x) });

if (files.length === 0) {
  test('V4: idle-injection banks', { skip: `no data/banks/v4_*.json banks found; run the V4 batch first` }, () => {});
}

for (const file of files) {
  // Catches: fails if the classical idle-injection rule disagrees with a physical X gate in
  // the circuit (wrong checks flipped, wrong rounds flipped, or the final data bit not flipped),
  // or if a V4 bank has more than one outcome (noise on a run that should be noiseless).
  test(`V4: ${file} matches applyX`, () => {
    const bank = JSON.parse(readFileSync(join(BANK_DIR, file), 'utf8'));
    validateBank(bank);
    const { d, r, logical } = bank;

    const keys = Object.keys(bank.counts);
    assert.equal(keys.length, 1, `${file}: expected exactly one outcome, got ${keys.length}`);

    assert.ok(Array.isArray(bank.inject) && bank.inject.length > 0, `${file}: missing "inject" field`);
    let expected = {
      m: Array.from({ length: r }, () => new Uint8Array(d - 1)),
      x: new Uint8Array(d).fill(logical),
    };
    for (const [i, k] of bank.inject) expected = applyX(expected.m, expected.x, d, r, i, k);

    const measured = split(bitsFromKey(keys[0], bank.n_clbits), bank.layout, d, r);
    assert.deepEqual(plain(measured), plain(expected), `${file}: outcome ${keys[0]} disagrees with applyX for inject ${JSON.stringify(bank.inject)}`);
  });
}
