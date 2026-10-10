// Guided tour (team checklist Appendix U7.10), behind FEATURES.tour: a "3-minute tour" button
// in the header; four stops (hero, Level 3 budget bar, "Learn the noise" step 3, Level 5
// scoreboard), one caption each (at most 25 words); Next, Back, Escape; focus moves to each
// target; no auto-advance. main.js supplies each stop's prepare(), which opens the right level
// and returns the target element (or null, when the stop's part of the page is missing).
// The caption box is inserted right after the target, so Tab from the target reaches Next.

export const TOUR_LABEL = '3-minute tour';
export const MAX_CAPTION_WORDS = 25;

export const TOUR_STOPS = [
  { id: 'hero', caption: 'Start here. Slide the readout time: the best time for one measurement is not the best time for the stored bit.' },
  { id: 'budget', caption: 'This bar splits each round\'s error into its sources at the chosen readout time: readout, waiting, crosstalk on the ion, and gate noise.' },
  { id: 'learnnoise', caption: 'The decoder learns how often each pair of detectors lights together. Switch between the naive and learned graphs to see the logical error change.' },
  { id: 'scoreboard', caption: 'Each hypothesis about the two readout models, with its verdict: held, refuted or undetermined. Open a row for the statement and the note.' },
];

export const wordCount = (text) => text.trim().split(/\s+/).filter(Boolean).length;

function el(tag, attrs = {}, text = null) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  if (text !== null) e.textContent = text;
  return e;
}

// stops: [{ id, caption, prepare: () => Element | null }]. doc: the object that receives the
// Escape keydown listener (document in the page). Returns the controller.
export function createTour({ stops, startButton = null, doc = globalThis.document }) {
  let index = -1;
  let target = null;
  let saved = null;

  const box = el('div', { class: 'tour-box', role: 'group', 'aria-label': TOUR_LABEL });
  box.setAttribute('style', 'flex:1 0 100%;margin:8px 0 16px;padding:12px 16px;border:2px solid var(--focus, #b3261e);border-radius:8px;background:var(--bg, #fff)');
  const counter = el('p', { class: 'hint', style: 'margin:0 0 4px' });
  const caption = el('p', { class: 'tour-caption', 'aria-live': 'polite', style: 'margin:0 0 8px;font-weight:600' });
  const row = el('div', { class: 'control-row' });
  const back = el('button', { type: 'button', class: 'secondary' }, 'Back');
  const next = el('button', { type: 'button' }, 'Next');
  const close = el('button', { type: 'button', class: 'secondary' }, 'End tour');
  row.append(back, next, close);
  box.append(counter, caption, row);

  function release() {
    if (!target) return;
    if (saved.tabindex === null) target.removeAttribute?.('tabindex');
    else target.setAttribute('tabindex', saved.tabindex);
    target.style.outline = saved.outline;
    target.style.outlineOffset = saved.outlineOffset;
    target = null;
  }

  function go(i) {
    release();
    index = i;
    const stop = stops[i];
    const t = stop.prepare ? stop.prepare() : null;
    counter.textContent = `Stop ${i + 1} of ${stops.length}`;
    caption.textContent = stop.caption;
    back.setAttribute('aria-disabled', String(i === 0));
    next.textContent = i === stops.length - 1 ? 'Finish' : 'Next';
    if (t) {
      target = t;
      saved = { tabindex: t.getAttribute('tabindex'), outline: t.style.outline ?? '', outlineOffset: t.style.outlineOffset ?? '' };
      t.style.outline = '3px solid var(--focus, #b3261e)';
      t.style.outlineOffset = '4px';
      if (saved.tabindex === null) t.setAttribute('tabindex', '-1');
      t.after(box);
      t.scrollIntoView?.({ block: 'start' });
      t.focus();
    } else {
      if (startButton) startButton.after(box);
      next.focus();
    }
  }

  function onKey(ev) {
    if (ev.key === 'Escape' && index >= 0) {
      ev.preventDefault?.();
      end();
    }
  }

  function start() {
    if (stops.length === 0) return;
    doc?.addEventListener?.('keydown', onKey);
    go(0);
  }

  function end() {
    if (index < 0) return;
    release();
    index = -1;
    box.remove();
    doc?.removeEventListener?.('keydown', onKey);
    startButton?.focus();
  }

  back.addEventListener('click', () => { if (index > 0) go(index - 1); });
  next.addEventListener('click', () => { if (index === stops.length - 1) end(); else go(index + 1); });
  close.addEventListener('click', end);
  startButton?.addEventListener('click', () => { if (index < 0) start(); });

  return {
    start, end, next: () => next.click(), back: () => back.click(),
    get index() { return index; },
    get active() { return index >= 0; },
    get target() { return target; },
    box,
  };
}
