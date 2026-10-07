// Shot banks (schema s2s-bank/1): validation, key decoding and splitting into
// ancilla and data readouts. Classical bit 0 is the least significant bit of a key.

const SCHEMA = 's2s-bank/1';
const REQUIRED = [
  'schema', 'code', 'd', 'r', 'logical', 'shots', 'n_clbits',
  'layout', 'bit_order', 'key_encoding', 'counts', 'checksum',
];
const HEX_KEY = /^[0-9a-f]+$/;

function fail(msg) {
  throw new Error(`invalid s2s-bank/1 bank: ${msg}`);
}

function isNonNegInt(v) {
  return Number.isInteger(v) && v >= 0;
}

// Throws with a clear message on the first problem; returns true otherwise.
// Extra fields (for example "inject" or "fixture") are allowed.
export function validateBank(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) fail('not an object');
  for (const f of REQUIRED) {
    if (!(f in obj)) fail(`missing required field "${f}"`);
  }
  if (obj.schema !== SCHEMA) fail(`schema is "${obj.schema}", expected "${SCHEMA}"`);
  if (obj.code !== 'repetition') fail(`code is "${obj.code}", expected "repetition"`);
  if (obj.bit_order !== 'qiskit-little-endian') fail(`bit_order is "${obj.bit_order}", expected "qiskit-little-endian"`);
  if (obj.key_encoding !== 'hex') fail(`key_encoding is "${obj.key_encoding}", expected "hex"`);

  const { d, r, n_clbits: nClbits, shots } = obj;
  if (!Number.isInteger(d) || d < 2) fail(`d must be an integer >= 2, got ${d}`);
  if (!Number.isInteger(r) || r < 1) fail(`r must be an integer >= 1, got ${r}`);
  if (obj.logical !== 0 && obj.logical !== 1) fail(`logical must be 0 or 1, got ${obj.logical}`);
  if (!isNonNegInt(shots)) fail(`shots must be a non-negative integer, got ${shots}`);
  const expectedClbits = (d - 1) * r + d;
  if (nClbits !== expectedClbits) fail(`n_clbits is ${nClbits}, expected (d-1)*r + d = ${expectedClbits}`);
  if (nClbits > 29) fail(`n_clbits is ${nClbits}, at most 29 is supported`);

  // Layout: r rows of d-1 ancilla bits and d data bits, all distinct and in range.
  const { layout } = obj;
  if (!layout || !Array.isArray(layout.ancilla) || !Array.isArray(layout.data)) {
    fail('layout must have arrays "ancilla" and "data"');
  }
  if (layout.ancilla.length !== r) fail(`layout.ancilla has ${layout.ancilla.length} rows, expected r = ${r}`);
  if (layout.data.length !== d) fail(`layout.data has ${layout.data.length} entries, expected d = ${d}`);
  const seen = new Set();
  const checkBit = (b, where) => {
    if (!Number.isInteger(b) || b < 0 || b >= nClbits) fail(`${where} = ${b} is not a classical bit in 0..${nClbits - 1}`);
    if (seen.has(b)) fail(`${where} = ${b} is used twice in the layout`);
    seen.add(b);
  };
  layout.ancilla.forEach((row, k) => {
    if (!Array.isArray(row) || row.length !== d - 1) fail(`layout.ancilla[${k}] must have d-1 = ${d - 1} entries`);
    row.forEach((b, j) => checkBit(b, `layout.ancilla[${k}][${j}]`));
  });
  layout.data.forEach((b, i) => checkBit(b, `layout.data[${i}]`));

  // Counts: lowercase hex keys that fit in n_clbits, positive integer counts.
  const { counts, checksum } = obj;
  if (!counts || typeof counts !== 'object' || Array.isArray(counts)) fail('counts must be an object');
  const limit = 2 ** nClbits;
  let total = 0;
  let nKeys = 0;
  for (const [key, c] of Object.entries(counts)) {
    if (!HEX_KEY.test(key)) fail(`count key "${key}" is not lowercase hexadecimal without prefix`);
    if (parseInt(key, 16) >= limit) fail(`count key "${key}" does not fit in n_clbits = ${nClbits}`);
    if (!Number.isInteger(c) || c <= 0) fail(`count for key "${key}" must be a positive integer, got ${c}`);
    total += c;
    nKeys++;
  }

  // Checksum totals. The sha256 guards the copy out of Qollab and is verified by
  // tools/assemble_bank.mjs; src/core has no hashing, so only its type is checked here.
  if (!checksum || typeof checksum !== 'object') fail('checksum must be an object');
  if (checksum.total_shots !== total) fail(`checksum.total_shots is ${checksum.total_shots}, but the counts sum to ${total}`);
  if (shots !== total) fail(`shots is ${shots}, but the counts sum to ${total}`);
  if (checksum.n_keys !== nKeys) fail(`checksum.n_keys is ${checksum.n_keys}, but counts has ${nKeys} keys`);
  if ('sha256' in checksum && typeof checksum.sha256 !== 'string') fail('checksum.sha256 must be a string');
  return true;
}

// Element b of the result is classical bit b (bit 0 = least significant bit).
export function bitsFromKey(hexKey, nClbits) {
  if (typeof hexKey !== 'string' || !HEX_KEY.test(hexKey)) throw new Error(`bitsFromKey: "${hexKey}" is not lowercase hexadecimal`);
  if (!Number.isInteger(nClbits) || nClbits < 1 || nClbits > 29) throw new Error(`bitsFromKey: nClbits must be in 1..29, got ${nClbits}`);
  let value = parseInt(hexKey, 16);
  if (value >= 2 ** nClbits) throw new Error(`bitsFromKey: key "${hexKey}" does not fit in ${nClbits} bits`);
  const bits = new Uint8Array(nClbits);
  for (let b = 0; b < nClbits; b++) {
    bits[b] = value & 1;
    value >>>= 1;
  }
  return bits;
}

// One Uint8Array per shot; keys in ascending numeric order, each repeated by its count.
// Every shot gets its own array, so callers may modify one without affecting others.
export function expandShots(bank) {
  const keys = Object.keys(bank.counts).sort((a, b) => parseInt(a, 16) - parseInt(b, 16));
  const shots = [];
  for (const key of keys) {
    const bits = bitsFromKey(key, bank.n_clbits);
    for (let c = 0; c < bank.counts[key]; c++) shots.push(c === 0 ? bits : bits.slice());
  }
  return shots;
}

// m[k][j] = check j of round k, x[i] = data qubit i, read through the layout.
export function split(shotBits, layout, d, r) {
  const m = [];
  for (let k = 0; k < r; k++) {
    const row = new Uint8Array(d - 1);
    for (let j = 0; j < d - 1; j++) row[j] = shotBits[layout.ancilla[k][j]];
    m.push(row);
  }
  const x = new Uint8Array(d);
  for (let i = 0; i < d; i++) x[i] = shotBits[layout.data[i]];
  return { m, x };
}
