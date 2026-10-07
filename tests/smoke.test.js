import { test } from 'node:test';
import assert from 'node:assert/strict';

// Catches: fails (or finds no tests at all) if the test runner is misconfigured,
// for example if `npm test` does not run `node --test` or tests/*.test.js is not
// picked up as an ES module.
test('test runner executes ES-module tests', () => {
  assert.equal(1 + 1, 2);
});
