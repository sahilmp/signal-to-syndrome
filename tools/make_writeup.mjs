// Writes data/writeup/project_page.json, the copy of docs/project_page.md shown by the
// "Read the full write-up" level (FEATURES.writeup, src/ui/writeup.js). Usage:
//   node tools/make_writeup.mjs
// The markdown is stored without HTML comments (the source notes), with \n line endings.
// Links whose target the release check's URL row would reject keep their text and lose the
// target, because the JSON is embedded in dist/qollab/main.js and that row scans the bundle;
// any other rejected URL stops the script. The sha256 is of the .md file's bytes as stored,
// and the release check compares it with the current file ("writeup copy matches ...").

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'docs/project_page.md';
const OUT = join(root, 'data', 'writeup', 'project_page.json');

// The URL row's allowlist, read from tools/release_check.mjs so the two cannot drift.
const check = readFileSync(join(root, 'tools', 'release_check.mjs'), 'utf8');
const hostsLiteral = /const ALLOWED_HOSTS = (\[[^\]]*\]);/.exec(check);
if (!hostsLiteral) throw new Error('ALLOWED_HOSTS not found in tools/release_check.mjs');
const ALLOWED_HOSTS = new Function(`return ${hostsLiteral[1]};`)();
// As the URL row: an http(s) URL is accepted when its host is on the allowlist.
const accepted = (u) => {
  try {
    return ALLOWED_HOSTS.includes(new URL(u).hostname.toLowerCase());
  } catch {
    return false;
  }
};

const bytes = readFileSync(join(root, SOURCE));
const sha256 = createHash('sha256').update(bytes).digest('hex');
let markdown = bytes.toString('utf8')
  .replace(/^﻿/, '')
  .replace(/\r\n?/g, '\n')
  .replace(/<!--[\s\S]*?-->/g, '');
// [text](rejected URL) -> text; images keep their link form (the page shows only their alt text).
markdown = markdown.replace(/(!?)\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi, (all, bang, text, url) => (
  bang || accepted(url) ? all : text));
// The same extraction as the URL row (tools/release_check.mjs, step 3).
const rejected = [...new Set(markdown.match(/https?:\/\/[^\s"'`<>()\\]+/gi) || [])].filter((u) => !accepted(u));
if (rejected.length) {
  console.error(`URLs the release check would reject, outside a link: ${rejected.join(' ')}`);
  process.exit(1);
}

mkdirSync(dirname(OUT), { recursive: true });
const json = { source: SOURCE, sha256, generated: new Date().toISOString(), markdown };
writeFileSync(OUT, `${JSON.stringify(json, null, 2)}\n`);
console.log(sha256);
