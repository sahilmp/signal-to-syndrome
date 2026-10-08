// Build script for dist/qollab/ (CLAUDE.md rule 3; DECISIONS D5, D9).
// dist/qollab/main.js   : src/ui/main.js bundled by esbuild (IIFE, minified, JSON embedded)
// dist/qollab/main.css  : src/ui/style.css
// dist/qollab/index.html: body fragment from src/ui/index.template.html, no script or link tags
// dist/local/preview.html: one self-contained page with the CSS and JavaScript inlined

import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, relative } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const p = (...parts) => join(root, ...parts);
const qollabDir = p('dist', 'qollab');
const localDir = p('dist', 'local');
mkdirSync(qollabDir, { recursive: true });
mkdirSync(localDir, { recursive: true });

const pkg = JSON.parse(readFileSync(p('package.json'), 'utf8'));
const { FEATURES } = await import(pathToFileURL(p('src', 'ui', 'features.js')).href);

// 1. JavaScript bundle.
const result = await build({
  entryPoints: [p('src', 'ui', 'main.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  platform: 'browser',
  target: ['es2020'],
  loader: { '.json': 'json' },
  charset: 'utf8',
  legalComments: 'none',
  write: false,
  logLevel: 'warning',
});
let js = result.outputFiles[0].text;
// CLAUDE.md rule 3: with liveRun on, main.js begins with the single import line for the
// Python helper. Module name 'live': Qollab's upload takes files only, no folders, so
// live.py sits at the top level of the main project (DECISIONS D11).
const LIVE_MODULE = 'live';
if (FEATURES.liveRun === true) {
  js = `import * as s2sLive from '${LIVE_MODULE}'; globalThis.s2sLive = s2sLive;\n${js}`;
}
writeFileSync(join(qollabDir, 'main.js'), js);

// 2. Stylesheet.
const css = readFileSync(p('src', 'ui', 'style.css'), 'utf8');
writeFileSync(join(qollabDir, 'main.css'), css);

// 3. Body fragment (D9: Qollab strips <html>, <head>, <body> and does not run <script>).
const template = readFileSync(p('src', 'ui', 'index.template.html'), 'utf8');
const fragment = template.replaceAll('{{VERSION}}', pkg.version);
if (/<\/?(html|head|body|script|link|style)\b/i.test(fragment)) {
  throw new Error('index.template.html must be a body fragment without html, head, body, script, link or style tags');
}
writeFileSync(join(qollabDir, 'index.html'), fragment);

// 4. Local preview: one self-contained file. "</" inside inlined code is escaped so that
// it cannot close the <script> or <style> element early.
if (FEATURES.liveRun === true) {
  console.log('note: liveRun is on; the preview omits the live-run import line (no Qollab runtime locally).');
}
const previewJs = result.outputFiles[0].text.replace(/<\/(script)/gi, '<\\/$1');
const previewCss = css.replace(/<\/(style)/gi, '<\\/$1');
const preview = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Signal to Syndrome (local preview)</title>
<style>
body { margin: 0; background: #ffffff; }
${previewCss}
</style>
</head>
<body>
${fragment}
<script>
${previewJs}
</script>
</body>
</html>
`;
writeFileSync(join(localDir, 'preview.html'), preview);

// 5. Sizes.
const outputs = ['index.html', 'main.css', 'main.js'].map((f) => join(qollabDir, f)).concat(join(localDir, 'preview.html'));
console.log(`Signal to Syndrome ${pkg.version}: build outputs`);
for (const f of outputs) {
  console.log(`  ${relative(root, f).replaceAll('\\', '/').padEnd(26)} ${String(statSync(f).size).padStart(9)} bytes`);
}
const d5 = statSync(join(qollabDir, 'main.js')).size + statSync(join(qollabDir, 'index.html')).size;
console.log(`  main.js + index.html: ${d5} bytes (limit 1900000, DECISIONS D5)`);
