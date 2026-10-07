import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correctedLogical, isLogicalError } from '../src/core/logical.js';

// Catches: fails if the flip is ignored, applied as OR/AND instead of XOR, or the result
// is not reduced to a single bit.
test('correctedLogical is xHat0 XOR flip', () => {
  assert.equal(correctedLogical(0, 0), 0);
  assert.equal(correctedLogical(0, 1), 1);
  assert.equal(correctedLogical(1, 0), 1);
  assert.equal(correctedLogical(1, 1), 0);
});

// Catches: fails if the comparison is inverted (reporting success as error) or only works
// for logical = 0.
test('isLogicalError compares the corrected value with the prepared logical', () => {
  assert.equal(isLogicalError(0, 0), false);
  assert.equal(isLogicalError(1, 1), false);
  assert.equal(isLogicalError(1, 0), true);
  assert.equal(isLogicalError(0, 1), true);
});
