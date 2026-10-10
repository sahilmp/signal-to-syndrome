import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as bridge from '../src/ui/bridge_hero3.js';
import * as text from '../src/ui/hero3_text.js';

// P1-J join: the v3 hero reads its text from Person A's hero3_text.js, not from the stub.

// Catches: fails if the bridge drops or adds a name, or re-exports a different value for one
// (for example a stub string or function left behind) instead of hero3_text.js's own.
test('the bridge exports exactly the names of hero3_text.js, with the same values', () => {
  assert.deepEqual(Object.keys(bridge).sort(), Object.keys(text).sort());
  for (const k of Object.keys(text)) assert.ok(bridge[k] === text[k], `${k} is not hero3_text.js's own`);
});

// Catches: fails if bridge_hero3.js still names a module under stubs/ (or fixtures/) anywhere,
// which the release check's heroV3 row would also refuse.
test('the bridge does not export from stubs/', () => {
  const src = readFileSync(new URL('../src/ui/bridge_hero3.js', import.meta.url), 'utf8');
  const paths = [...src.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  assert.deepEqual(paths, ['./hero3_text.js']);
  assert.ok(!/stubs\/|fixtures\//.test(src));
});
