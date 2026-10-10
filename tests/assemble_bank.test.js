import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleTexts, countsSha256 } from '../tools/assemble_bank.mjs';

const SCRIPT = fileURLToPath(new URL('../tools/assemble_bank.mjs', import.meta.url));

// Python's json.dumps(obj, sort_keys=True, separators=(",", ":")) for plain JSON data.
function pyDumps(v) {
  if (Array.isArray(v)) return `[${v.map(pyDumps).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${pyDumps(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

// A d = 3, r = 1 bank (n_clbits = 5) with enough keys to need several chunks.
function makeBank(extra = {}) {
  const counts = {};
  for (let v = 0; v < 32; v++) counts[v.toString(16)] = v + 1;
  const total = Object.values(counts).reduce((s, c) => s + c, 0);
  return {
    schema: 's2s-bank/1', code: 'repetition', d: 3, r: 1, logical: 0, mode: 'fresh-ancilla',
    backend: 'ionq_simulator', noise_model: 'forte-1', sampler_seed: 1012386106, job_id: 'job-1',
    native_ops: { gpi2: 16, measure: 5, ms: 4 }, date: '2026-10-10T06:00:00Z', detector_rate: 0.03,
    shots: total, n_qubits: 5, n_clbits: 5, layout: { ancilla: [[0, 1]], data: [2, 3, 4] },
    bit_order: 'qiskit-little-endian', key_encoding: 'hex', counts,
    checksum: { total_shots: total, n_keys: 32, sha256: countsSha256(counts) },
    ...extra,
  };
}

// Same framing as qollab/bank_generator.py emit(), with a small chunk size and CRLF endings.
function makeBlock(name, bank, chunkSize = 150) {
  const s = pyDumps(bank);
  const chunks = [];
  for (let i = 0; i < s.length; i += chunkSize) chunks.push(s.slice(i, i + chunkSize));
  const sha = createHash('sha256').update(s).digest('hex');
  const lines = [`BEGIN_BANK ${name} chunks=${chunks.length} sha256=${sha}`];
  chunks.forEach((c, i) => lines.push(`--- chunk ${i + 1}/${chunks.length} ---`, c, ''));
  lines.push(`END_BANK ${name}`);
  return { text: `some console output\r\n\r\n${lines.join('\r\n')}\r\n`, nChunks: chunks.length };
}

// Catches: chunks joined in the wrong order or with line-ending debris, a Python/JS mismatch
// in the canonical counts form, or framing that cannot cope with CRLF and blank lines.
test('round trip of a synthetic multi-chunk block', () => {
  const bank = makeBank();
  const { text, nChunks } = makeBlock('rep_d3_r1_L0', bank);
  assert.ok(nChunks > 3);
  const out = assembleTexts([{ text, source: 'synthetic' }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'rep_d3_r1_L0');
  assert.deepEqual(out[0].bank, bank);
});

// Catches: a copy error inside the JSON that still parses (a digit changed) slipping through
// because the sha256 on the BEGIN_BANK line is not checked.
test('one corrupted character fails the sha256 check', () => {
  const { text } = makeBlock('rep_d3_r1_L0', makeBank());
  const at = text.indexOf('"shots":') + '"shots":'.length;
  const corrupted = text.slice(0, at) + (text[at] === '9' ? '8' : '9') + text.slice(at + 1);
  assert.notEqual(corrupted, text);
  assert.throws(() => assembleTexts([{ text: corrupted, source: 'synthetic' }]), /sha256 mismatch/);
});

// Catches: a block whose middle chunk was not copied being joined anyway.
test('a missing chunk fails', () => {
  const { text } = makeBlock('rep_d3_r1_L0', makeBank());
  const lines = text.split('\r\n');
  const h = lines.findIndex((l) => l.startsWith('--- chunk 2/'));
  lines.splice(h, 2); // drop chunk 2's header and content
  assert.throws(() => assembleTexts([{ text: lines.join('\r\n'), source: 'synthetic' }]), /missing or out of order/);
});

// Catches: a last chunk that was not copied (the count check, not the order check).
test('a missing final chunk fails', () => {
  const { text, nChunks } = makeBlock('rep_d3_r1_L0', makeBank());
  const lines = text.split('\r\n');
  const h = lines.findIndex((l) => l.startsWith(`--- chunk ${nChunks}/`));
  lines.splice(h, 2);
  assert.throws(() => assembleTexts([{ text: lines.join('\r\n'), source: 'synthetic' }]), /found \d+ of \d+ chunks/);
});

// Catches: an optimised-away bank (no detector events) being accepted. Non-vacuous pair:
// the same rep_ bank passes at detector_rate 0.03 and fails at exactly 0.
test('rep_ bank with detector_rate 0 fails, 0.03 passes', () => {
  const good = makeBlock('rep_d3_r1_L0', makeBank({ detector_rate: 0.03 }));
  assert.equal(assembleTexts([{ text: good.text, source: 'synthetic' }]).length, 1);
  const zero = makeBlock('rep_d3_r1_L0', makeBank({ detector_rate: 0 }));
  assert.throws(() => assembleTexts([{ text: zero.text, source: 'synthetic' }]), /optimised away/);
  const missing = makeBank();
  delete missing.detector_rate;
  const none = makeBlock('rep_d3_r1_L0', missing);
  assert.throws(() => assembleTexts([{ text: none.text, source: 'synthetic' }]), /optimised away/);
});

// Catches: a counts checksum that disagrees with the counts (shots or sha256) passing because
// only the outer sha256 is checked; the outer sha256 is recomputed so only the inner check can fail.
test('inner checksum mismatches fail', () => {
  const badShots = makeBank();
  badShots.checksum = { ...badShots.checksum, total_shots: badShots.shots + 1 };
  assert.throws(() => assembleTexts([{ text: makeBlock('rep_d3_r1_L0', badShots).text, source: 's' }]), /shots mismatch/);
  const badSha = makeBank();
  badSha.checksum = { ...badSha.checksum, sha256: '0'.repeat(64) };
  assert.throws(() => assembleTexts([{ text: makeBlock('rep_d3_r1_L0', badSha).text, source: 's' }]), /counts sha256 mismatch/);
});

// Catches: a mislabelled paste (block name for one configuration, bank of another) being
// written under the wrong file name, or a name check that rejects correctly named banks.
// Non-vacuous pairs: the same bank passes under its own name and fails under a name that
// differs only in L, only in r, or only in d; a v4 bank passes with matching inject and
// fails with another site; an unknown prefix fails.
test('block name must match the bank d, r, logical (and inject for v4)', () => {
  const run = (name, bank) => assembleTexts([{ text: makeBlock(name, bank).text, source: 's' }]);
  assert.equal(run('rep_d3_r1_L0', makeBank()).length, 1);
  assert.throws(() => run('rep_d3_r1_L1', makeBank()), /logical 0 \(name says 1\)/);
  assert.throws(() => run('rep_d3_r3_L0', makeBank()), /r 1 \(name says 3\)/);
  assert.throws(() => run('rep_d5_r1_L0', makeBank()), /d 3 \(name says 5\)/);
  assert.equal(run('rep_d3_r1_L1', makeBank({ logical: 1 })).length, 1);

  const v4 = makeBank({ noise_model: 'ideal', inject: [[2, 0]] });
  assert.equal(run('v4_d3_r1_i2_k0', v4).length, 1);
  assert.throws(() => run('v4_d3_r1_i1_k0', v4), /inject \[\[2,0\]\] \(name says \[\[1,0\]\]\)/);
  assert.throws(() => run('bank_d3_r1_L0', makeBank()), /name is neither/);
});

// Catches: the command line not writing <out>/<name>.json, not reading .txt files from a folder,
// or exiting 0 when a bank is bad.
test('command line: folder input, --out, exit codes', () => {
  const dir = mkdtempSync(join(tmpdir(), 's2s-assemble-'));
  const inDir = join(dir, 'in');
  const outDir = join(dir, 'out');
  mkdirSync(inDir);
  const bank = makeBank();
  writeFileSync(join(inDir, 'run1.txt'), makeBlock('rep_d3_r1_L0', bank).text);
  writeFileSync(join(inDir, 'ignored.md'), 'BEGIN_BANK broken');
  const ok = spawnSync(process.execPath, [SCRIPT, inDir, '--out', outDir], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /rep_d3_r1_L0: shots 528, distinct keys 32, detector_rate 0\.03, sampler_seed 1012386106/);
  assert.deepEqual(JSON.parse(readFileSync(join(outDir, 'rep_d3_r1_L0.json'), 'utf8')), bank);

  writeFileSync(join(inDir, 'run2.txt'), makeBlock('rep_d3_r1_L1', makeBank({ logical: 1, detector_rate: 0 })).text);
  const outDir2 = join(dir, 'out2');
  const bad = spawnSync(process.execPath, [SCRIPT, inDir, '--out', outDir2], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /optimised away/);
  assert.equal(existsSync(join(outDir2, 'rep_d3_r1_L0.json')), false);
});

// Catches: a phase-flip (repx_) block rejected by the name check, or the basis field lost or
// altered on the way through. Same framing and checks as the rep_ round trip.
test('round trip of a repx_ block with basis X', () => {
  const bank = makeBank({ basis: 'X', sampler_seed: 578224596 });
  const { text } = makeBlock('repx_d3_r1_L0', bank);
  const out = assembleTexts([{ text, source: 'synthetic' }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'repx_d3_r1_L0');
  assert.deepEqual(out[0].bank, bank);
});

// Catches: a basis Z bank pasted under a phase-flip name (or the reverse) being written as the
// wrong memory. Non-vacuous pairs: repx_ passes with basis "X" and fails with basis "Z" or
// with no basis field (absent means Z); rep_ passes without a basis field and fails with
// basis "X"; a v13 bank passes with basis X and its own site, and fails as basis Z or under
// another site.
test('block name must match the bank basis', () => {
  const run = (name, bank) => assembleTexts([{ text: makeBlock(name, bank).text, source: 's' }]);
  assert.equal(run('repx_d3_r1_L0', makeBank({ basis: 'X' })).length, 1);
  assert.throws(() => run('repx_d3_r1_L0', makeBank({ basis: 'Z' })), /basis Z \(name says X\)/);
  assert.throws(() => run('repx_d3_r1_L0', makeBank()), /basis Z \(name says X\)/);
  assert.equal(run('rep_d3_r1_L0', makeBank()).length, 1);
  assert.throws(() => run('rep_d3_r1_L0', makeBank({ basis: 'X' })), /basis X \(name says Z\)/);

  const v13 = makeBank({ noise_model: 'ideal', inject: [[1, 0]], basis: 'X' });
  assert.equal(run('v13_d3_r1_i1_k0', v13).length, 1);
  assert.throws(() => run('v13_d3_r1_i1_k0', { ...v13, basis: 'Z' }), /basis Z \(name says X\)/);
  assert.throws(() => run('v13_d3_r1_i0_k0', v13), /inject \[\[1,0\]\] \(name says \[\[0,0\]\]\)/);
});

// Catches: the optimised-away rule applied only to rep_ banks, letting a repx_ bank with no
// detector events through. Non-vacuous pair: 0.03 passes, exactly 0 fails.
test('repx_ bank with detector_rate 0 fails, 0.03 passes', () => {
  const run = (bank) => assembleTexts([{ text: makeBlock('repx_d3_r1_L0', bank).text, source: 's' }]);
  assert.equal(run(makeBank({ basis: 'X', detector_rate: 0.03 })).length, 1);
  assert.throws(() => run(makeBank({ basis: 'X', detector_rate: 0 })), /optimised away/);
});
