// Pipeline map (FEATURES.pipelineNav): four stages in a row above the level selector, each a
// button that opens the first enabled level of its stage. The stage holding the open level
// carries aria-current="step" and a thick underline under its title (not colour alone); main.js
// reports every change of the open level, whichever control made it. Two by two below 600 px
// (charts.js narrow query). Nothing animates, so reduced motion needs no extra rule.

import { isNarrow, onNarrowChange } from './charts.js';

// Level ids as in main.js LEVELS; "writeup" belongs to no stage.
export const PIPELINE_STAGES = [
  { id: 'signal', title: 'Signal', subtitle: 'How a qubit is read', levels: ['level3', 'level4'] },
  { id: 'syndrome', title: 'Syndrome', subtitle: 'Checks in space and time', levels: ['level1', 'level2'] },
  { id: 'decoder', title: 'Decoder', subtitle: 'Finding the likely error', levels: ['learnnoise'] },
  { id: 'logical', title: 'Logical error', subtitle: 'Is the stored bit safe?', levels: ['level5'] },
];
export const PIPELINE_LABEL = 'From signal to logical error';

// The stages to show, each with its enabled levels in order; a stage with none is left out.
export function pipelineStages(enabledLevelIds) {
  const on = new Set(enabledLevelIds);
  return PIPELINE_STAGES
    .map((s) => ({ ...s, levels: s.levels.filter((id) => on.has(id)) }))
    .filter((s) => s.levels.length > 0);
}

// levels: the enabled level ids (main.js); open(id) opens a level; onLevelChange(fn) calls
// fn(id) now and whenever the open level changes.
export function mountPipeline(container, { open, onLevelChange, levels = [] } = {}) {
  const stages = pipelineStages(levels);
  const nav = document.createElement('nav');
  nav.className = 'pipeline';
  nav.setAttribute('aria-label', PIPELINE_LABEL);
  const list = document.createElement('ol');
  list.className = 'pipeline-stages';
  Object.assign(list.style, { listStyle: 'none', margin: '8px 0', padding: '0', display: 'grid', gap: '8px' });
  const layout = () => {
    list.style.gridTemplateColumns = `repeat(${isNarrow() ? Math.min(2, stages.length) : stages.length}, minmax(0, 1fr))`;
  };
  layout();
  onNarrowChange(layout);

  const buttons = stages.map((s, k) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'secondary pipeline-stage';
    b.dataset.stage = s.id;
    Object.assign(b.style, { width: '100%', height: '100%', textAlign: 'left' });
    const title = document.createElement('span');
    title.className = 'pipeline-title';
    title.textContent = s.title;
    Object.assign(title.style, { display: 'block', fontWeight: '700', textUnderlineOffset: '4px' });
    const sub = document.createElement('span');
    sub.className = 'pipeline-subtitle';
    sub.textContent = s.subtitle;
    Object.assign(sub.style, { display: 'block', fontSize: '0.85rem' });
    b.append(title, sub);
    // The arrow shows the order of the stages (screen readers get it from the list); as an
    // inline block it stays out of the current stage's underline.
    if (k < stages.length - 1) {
      const arrow = document.createElement('span');
      arrow.className = 'pipeline-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '→';
      Object.assign(arrow.style, { display: 'inline-block', marginLeft: '0.4em' });
      title.appendChild(arrow);
    }
    b.addEventListener('click', () => open?.(s.levels[0]));
    li.appendChild(b);
    list.appendChild(li);
    return { b, title, stage: s };
  });

  const mark = (levelId) => {
    for (const { b, title, stage } of buttons) {
      const here = stage.levels.includes(levelId);
      if (here) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
      title.style.textDecoration = here ? 'underline' : 'none';
      title.style.textDecorationThickness = here ? '3px' : '';
    }
  };
  mark(null);
  onLevelChange?.(mark);

  nav.appendChild(list);
  container.appendChild(nav);
  return nav;
}
