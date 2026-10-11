// "Read the full write-up" (FEATURES.writeup): the project page, docs/project_page.md, as one
// level. tools/make_writeup.mjs stores it without its source comments in
// data/writeup/project_page.json (bridge_data.js writeupData). renderMarkdown is a minimal
// renderer for what that file uses: headings, paragraphs, bold, italics, inline code, fenced
// code, bulleted and numbered lists (nested by indentation), tables, links, images (alt text
// only: nothing is loaded), footnote markers and line breaks. Every HTML character of the
// source is escaped before any markup is added.

import { writeupData } from './bridge_data.js';

export const WRITEUP_LABEL = 'Read the full write-up';

// A copy of the release check's URL allowlist (tools/release_check.mjs ALLOWED_HOSTS; the
// writeup test fails if the two differ). A link becomes an anchor only when that row would
// accept its URL: http(s) with a host on the list. Relative links (../README.md) do not
// resolve on Qollab and stay text.
export const ALLOWED_HOSTS = ['qollab.xyz', 'ionq.com', 'docs.ionq.com', 'arxiv.org', 'doi.org', 'github.com'];
export function urlAccepted(url) {
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    return ALLOWED_HOSTS.includes(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
const unescapeHtml = (s) => s.replace(/&(amp|lt|gt|quot|#39);/g, (m) => Object.keys(ESC).find((k) => ESC[k] === m));

// Emphasis needs a word boundary on the outside, so "τ*_phys" and "τ_log" stay as written.
const OUT = '(^|[^\\p{L}\\p{N}_*])';
const END = '(?=$|[^\\p{L}\\p{N}_*])';
const BOLD = new RegExp(`${OUT}\\*\\*(?=\\S)(.+?)(?<=\\S)\\*\\*${END}`, 'gu');
const EM_STAR = new RegExp(`${OUT}\\*(?=[^\\s*])(.+?)(?<=[^\\s*])\\*${END}`, 'gu');
const EM_UNDER = new RegExp(`${OUT}_(?=[^\\s_])(.+?)(?<=[^\\s_])_${END}`, 'gu');

// One line of escaped text to HTML. Code spans and links are set aside first, so their
// contents and URLs never meet the emphasis rules.
function inline(escaped) {
  const held = [];
  const hold = (html) => `\u0000${held.push(html) - 1}\u0000`;
  let s = escaped.replace(/`([^`]+)`/g, (m, code) => hold(`<code>${code}</code>`));
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt) => hold(`<span class="writeup-image">[${alt}]</span>`));
  s = s.replace(/\[\^([^\]\s]+)\]/g, (m, n) => hold(`<sup>${n}</sup>`));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, url) => {
    const label = inline(text);
    if (!urlAccepted(unescapeHtml(url))) return hold(label);
    return hold(`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`);
  });
  // Spaces left where a source comment was removed ("later <!-- ... -->, run").
  s = s.replace(/ {2,}/g, ' ').replace(/ +(?=[,;])/g, '');
  s = s.replace(BOLD, (m, pre, t) => `${pre}<strong>${t}</strong>`);
  s = s.replace(EM_STAR, (m, pre, t) => `${pre}<em>${t}</em>`);
  s = s.replace(EM_UNDER, (m, pre, t) => `${pre}<em>${t}</em>`);
  return s.replace(/\u0000(\d+)\u0000/g, (m, i) => held[Number(i)]);
}

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE = /^(\s*)(`{3,})(.*)$/;
const ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const RULE_ROW = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const blank = (l) => l.trim() === '';
const indentOf = (l) => /^\s*/.exec(l)[0].length;

function tableCells(line) {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1);
  return t.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

// Lines (already escaped) to block HTML. headingShift maps "#" to <h(1 + shift)>.
function blocks(lines, opts) {
  const out = [];
  let i = 0;
  let para = [];
  const flush = () => {
    if (!para.length) return;
    const html = para.map((l, k) => {
      const brk = k < para.length - 1 && (/ {2,}$/.test(l) || /\\$/.test(l));
      return inline(l.replace(/\\$/, '').trim()) + (brk ? '<br>' : '');
    }).join('\n');
    const note = /^[¹²³⁴⁵⁶⁷⁸⁹⁰]/.test(para[0].trim());
    out.push(note ? `<p class="writeup-footnote">${html}</p>` : `<p>${html}</p>`);
    para = [];
  };
  while (i < lines.length) {
    const line = lines[i];
    if (blank(line)) { flush(); i++; continue; }
    const fence = FENCE.exec(line);
    if (fence) {
      flush();
      const body = [];
      i++;
      while (i < lines.length && !new RegExp(`^\\s*${fence[2]}\\s*$`).test(lines[i])) {
        body.push(lines[i].slice(Math.min(fence[1].length, indentOf(lines[i]))));
        i++;
      }
      i++;
      out.push(`<pre><code>${body.join('\n')}</code></pre>`);
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      flush();
      const level = Math.min(6, Math.max(opts.minHeading, h[1].length + opts.headingShift));
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }
    if (line.trim().startsWith('|') && i + 1 < lines.length && RULE_ROW.test(lines[i + 1])) {
      flush();
      const head = tableCells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(tableCells(lines[i++]));
      const th = head.map((c) => `<th scope="col">${inline(c)}</th>`).join('');
      const tr = rows.map((r) => `<tr>${head.map((_, k) => `<td>${inline(r[k] ?? '')}</td>`).join('')}</tr>`).join('\n');
      out.push(`<div class="table-scroll"><table class="l5-table writeup-table"><thead><tr>${th}</tr></thead>\n<tbody>\n${tr}\n</tbody></table></div>`);
      continue;
    }
    const item = ITEM.exec(line);
    // A list may interrupt a paragraph (a numbered one only from 1), as in CommonMark.
    if (item && (para.length === 0 || !/\d/.test(item[2]) || parseInt(item[2], 10) === 1)) {
      flush();
      const base = item[1].length;
      const ordered = /\d/.test(item[2]);
      const items = [];
      while (i < lines.length) {
        const m = ITEM.exec(lines[i]);
        if (!m || m[1].length !== base || /\d/.test(m[2]) !== ordered) break;
        const content = m[1].length + m[2].length + 1;
        const body = [m[3]];
        i++;
        // The item continues over lines indented past its marker, and over blank lines followed by one.
        while (i < lines.length) {
          if (blank(lines[i])) {
            let j = i;
            while (j < lines.length && blank(lines[j])) j++;
            if (j < lines.length && indentOf(lines[j]) > base) { while (i < j) { body.push(''); i++; } continue; }
            break;
          }
          if (indentOf(lines[i]) <= base) break;
          body.push(lines[i].slice(Math.min(content, indentOf(lines[i]))));
          i++;
        }
        items.push(body);
      }
      const lis = items.map((body) => {
        const inner = blocks(body, opts);
        // A tight item of one paragraph is shown without its <p>.
        const tight = /^<p>([\s\S]*?)<\/p>/.exec(inner);
        return `<li>${tight && !body.some(blank) ? inner.replace(tight[0], tight[1]) : inner}</li>`;
      }).join('\n');
      const start = ordered && parseInt(item[2], 10) !== 1 ? ` start="${parseInt(item[2], 10)}"` : '';
      out.push(ordered ? `<ol${start}>\n${lis}\n</ol>` : `<ul>\n${lis}\n</ul>`);
      continue;
    }
    para.push(line);
    i++;
  }
  flush();
  return out.join('\n');
}

const prepare = (md) => escapeHtml(String(md).replace(/\r\n?/g, '\n')).split('\n');

// Markdown to an HTML string. Headings keep their level ("#" is <h1>).
export function renderMarkdown(md) {
  return blocks(prepare(md), { headingShift: 0, minHeading: 1 });
}

// The write-up as the level shows it: the first "#" title as the level's <h2>, the text before
// the first "##" under it, then one <details> per "##" section, with the heading text as its
// summary; only the first is open. Inside, "###" is <h3>; any further "#" title is <h3> too.
export function writeupSections(md) {
  const lines = prepare(md);
  let title = null;
  const intro = [];
  const sections = [];
  for (const line of lines) {
    const h = HEADING.exec(line);
    if (h && h[1].length === 2) { sections.push({ heading: h[2], lines: [] }); continue; }
    if (h && h[1].length === 1 && title === null && sections.length === 0) { title = h[2]; continue; }
    (sections.length ? sections[sections.length - 1].lines : intro).push(line);
  }
  const opts = { headingShift: 0, minHeading: 3 };
  return {
    title: title === null ? null : inline(title),
    intro: blocks(intro, opts),
    sections: sections.map((s, k) => ({ summary: inline(s.heading), html: blocks(s.lines, opts), open: k === 0 })),
  };
}

export function renderWriteup(md) {
  const w = writeupSections(md);
  const parts = [];
  if (w.title !== null) parts.push(`<h2>${w.title}</h2>`);
  if (w.intro) parts.push(`<div class="writeup-intro">${w.intro}</div>`);
  for (const s of w.sections) {
    parts.push(`<details class="explain writeup-section"${s.open ? ' open' : ''}><summary>${s.summary}</summary>\n${s.html}\n</details>`);
  }
  return parts.join('\n');
}

export function mountWriteup(container, markdown = writeupData.markdown) {
  const body = document.createElement('div');
  body.className = 'writeup';
  // Long link texts and paths ("learn.microsoft.com/azure/...") wrap at 360 px instead of widening the page.
  body.style.overflowWrap = 'anywhere';
  body.innerHTML = renderWriteup(markdown);
  container.appendChild(body);
  return body;
}
