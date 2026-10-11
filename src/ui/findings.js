// Findings strip (FEATURES.findingsStrip): "What we found", three cards between the hero and the
// level selector. Each card is one button; pressing it opens the part of the page behind the
// finding (main.js passes open(target)). Every number comes from the results files through
// bridge_data.js: F1 from stage4_comparison.json findings F1 numbers.outOfSample, F2 from
// stage3_sc_dense.json optima.tauLog (learned, d = 3, hard), F3 from stage4_comparison.json
// platforms["trapped-ion"].budgetAtOptimum. A card whose values are missing shows its title only.

import { stage3v2, stage4v2 } from './bridge_data.js';
import { formatTau } from './level3.js';
import { isNarrow, onNarrowChange, formatNumber } from './charts.js';

export const FINDINGS_HEADING = 'What we found';
export const POST_HOC_NOTE = 'Found after seeing the data';
export const DEFAULT_SOURCES = { stage3: stage3v2, stage4: stage4v2 };

// A finding found after seeing the data: stored with inSample false or a statement opening "Post hoc".
export const isPostHoc = (f) => f?.inSample === false || /^Post hoc/.test(f?.statement ?? '');

const fin = (...xs) => xs.every((x) => Number.isFinite(x));

// F1's sentence from its out-of-sample block (also Level 5's short line with FEATURES.compactText);
// null when a count is missing. It names the held-out circuits: F1 is labelled out of sample
// (team checklist 1.4; E17 audit).
export function f1Line(f) {
  const oos = f?.numbers?.outOfSample;
  const c = oos?.softWorseCount;
  const n = oos?.pointsPerDecoder;
  if (!fin(c?.naive, c?.learned, n)) return null;
  return `On held-out circuits, confidence hurt at ${c.naive} of ${n} settings; learned decoder: ${c.learned} of ${n}`;
}

// The three cards, F1 to F3: { id, title, line, note, target }; line and note are null when the
// data do not give them.
export function findingCards(sources = DEFAULT_SOURCES) {
  const s4 = sources?.stage4;
  const f1 = (Array.isArray(s4?.findings) ? s4.findings : []).find((f) => f?.id === 'F1');
  const line1 = f1Line(f1);
  const opt = (sources?.stage3?.optima?.tauLog || []).find((t) => t?.d === 3 && t?.mode === 'hard' && t?.decoder === 'learned');
  const b = s4?.platforms?.['trapped-ion']?.budgetAtOptimum;
  return [
    {
      // F1 is shown for the trapped ion only (project page F1; E17 audit), so the title says so.
      id: 'F1', title: 'Trapped ion: learning the noise rescues soft readout', line: line1,
      note: line1 && isPostHoc(f1) ? POST_HOC_NOTE : null, target: 'learnnoise-3',
    },
    {
      id: 'F2', title: 'Superconducting: a wide, flat valley',
      line: fin(opt?.xMin, opt?.lo, opt?.hi)
        ? `Code’s best ${formatTau(opt.xMin)}, but logical error barely changes from ${formatTau(opt.lo)} to ${formatTau(opt.hi)}`
        : null,
      note: null, target: 'level3:superconducting',
    },
    {
      id: 'F3', title: 'Trapped ion: optical pumping sets the clock',
      line: fin(b?.readout, b?.idle) && b.idle > 0
        // Rounded as formatNumber rounds, as the hero's whySentence does (E17 audit: 523, not 520).
        ? `Idling is ${formatNumber(b.readout / b.idle)}× smaller than readout error at the best readout time`
        : null,
      note: null, target: 'level3:trapped-ion',
    },
  ];
}

function el(tag, attrs = {}, text = null) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== null) e.textContent = text;
  return e;
}

const CARD_STYLE = 'display:block;width:100%;height:100%;margin:0;padding:12px;text-align:left;'
  + 'background:var(--bg);color:var(--text);border:2px solid var(--border);border-radius:8px;cursor:pointer';
const columns = () => (isNarrow() ? '1fr' : 'repeat(3, minmax(0, 1fr))');

// The strip: a heading, then the cards in a grid of three columns (one below 600 px, the
// narrow query of charts.js). Enter is handled on keydown (and the native click it would start
// is prevented), so a card opens once whether it is clicked, or pressed with Enter or Space.
export function mountFindings(container, { open, sources = DEFAULT_SOURCES } = {}) {
  const box = el('section', { class: 'findings-strip', 'aria-labelledby': 's2s-findings-heading' });
  box.appendChild(el('h2', { id: 's2s-findings-heading', style: 'margin:12px 0 8px' }, FINDINGS_HEADING));
  const list = el('ul', { class: 'findings-cards', style: `list-style:none;padding:0;margin:0 0 12px;display:grid;gap:12px;grid-template-columns:${columns()}` });
  onNarrowChange(() => { list.style.gridTemplateColumns = columns(); });
  for (const c of findingCards(sources)) {
    const li = el('li', { style: 'margin:0' });
    const btn = el('button', { type: 'button', class: 'finding-card', style: CARD_STYLE });
    btn.dataset.target = c.target;
    btn.appendChild(el('strong', { class: 'finding-title', style: 'display:block' }, c.title));
    if (c.line) btn.appendChild(el('span', { class: 'finding-line', style: 'display:block;margin-top:4px' }, c.line));
    if (c.note) btn.appendChild(el('span', { class: 'finding-note hint', style: 'display:block;margin-top:4px;font-style:italic;color:var(--muted)' }, c.note));
    const go = () => { if (typeof open === 'function') open(c.target); };
    btn.addEventListener('click', go);
    btn.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      go();
    });
    li.appendChild(btn);
    list.appendChild(li);
  }
  box.appendChild(list);
  container.appendChild(box);
  return box;
}
