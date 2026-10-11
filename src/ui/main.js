// Entry point: builds the level selector from FEATURES, mounts the enabled levels,
// fills in the version and the diagnostics; with FEATURES.hero, the hero panel above the tabs;
// with FEATURES.phaseFlip, the header switch "Bit-flip memory / Phase-flip memory" (U7.9), which
// sets the basis of the hero and Levels 3-5 (level3.js setBasis); with FEATURES.tour, the
// "3-minute tour" button in the header (U7.10, tour.js); with FEATURES.writeup, "Read the full write-up"
// as the last level (P5, writeup.js); with FEATURES.pipelineNav, the pipeline map above the level
// selector (P5, pipeline.js). Bundled by tools/build.mjs into one IIFE.

import pkg from '../../package.json' with { type: 'json' };
import { FEATURES } from './features.js';
import { mountLevel1 } from './level1.js';
import { mountLevel2 } from './level2.js';
import { mountLevel3 } from './level3.js';
import { mountLevel4 } from './level4.js';
import { mountLevel5 } from './level5.js';
import { mountLearnNoise } from './learnnoise.js';
import { mountDiagnostics } from './diag.js';
import { mountHero } from './hero.js';
import { mountHero3 } from './hero3.js';
import { mountFindings } from './findings.js';
import { createTour, TOUR_STOPS, TOUR_LABEL } from './tour.js';
import { mountWriteup, WRITEUP_LABEL } from './writeup.js';
import { mountPipeline } from './pipeline.js';
import { setPlatform, setBasis, currentBasis, onBasisChange, BASES } from './level3.js';

const LEVELS = [
  { id: 'level1', flag: 'level1', label: 'Level 1: Be the decoder', mount: mountLevel1 },
  { id: 'level2', flag: 'level2', label: 'Level 2: Time is a dimension', mount: mountLevel2 },
  // Readout-platform levels, shown when the trapped ion or the superconducting platform is
  // on; their shared platform toggle lists only the enabled platforms. Level 4 also holds
  // the live-run panel (FEATURES.liveRun).
  { id: 'level3', flags: ['ion', 'superconducting'], label: 'Level 3: Listen longer?', mount: mountLevel3 },
  { id: 'level4', flags: ['ion', 'superconducting'], label: 'Level 4: Trust but verify', mount: mountLevel4 },
  // Learn the noise (U7.6): fault injection, the naive decoder's limit and the learned edge rates.
  { id: 'learnnoise', flag: 'learnNoise', label: 'Learn the noise', mount: mountLearnNoise },
  // Platform comparison: both platforms side by side, from the stage 2-4 results; with
  // FEATURES.level5v2 the U7.7 version, whose title the tab label matches.
  {
    id: 'level5', flag: 'level5',
    label: FEATURES.level5v2 === true ? 'Level 5: Two readout models, same gates' : 'Level 5: Two platforms',
    mount: mountLevel5,
  },
  // P5: the project page (docs/project_page.md); in no pipeline stage.
  { id: 'writeup', flag: 'writeup', label: WRITEUP_LABEL, mount: mountWriteup },
];

// "Learn the noise" opens on step 1; the tour's stop is step 3 (U7.10). learnnoise.js keeps its
// step private, so the section's own Next button is pressed until the third pane shows.
export function openLearnNoiseStep3(section) {
  const panes = [...section.querySelectorAll('.learn-step')];
  if (panes.length < 3) return null;
  for (let guard = 0; panes[2].hidden && guard < 3; guard++) {
    const next = [...section.querySelectorAll('button')].find((b) => b.textContent === 'Next');
    if (!next) break;
    next.click();
  }
  return panes[2].hidden ? null : panes[2];
}

const isEnabled = (l) => (l.flags || [l.flag]).some((f) => FEATURES[f] === true);

// The hero panel's mount function: the guess, reveal, twist hero (UX1) with FEATURES.heroV3.
export const heroMount = () => (FEATURES.heroV3 === true ? mountHero3 : mountHero);

// Levels that stay in the bit-flip memory whatever the toggle says (U7.9).
const BIT_FLIP_ONLY = new Set(['level1', 'level2']);
export const BIT_FLIP_NOTE = 'This level stays in the bit-flip memory.';

// The header switch: a radio pair, so the two memories are named and reachable with the arrow keys.
export function mountBasisSwitch(container) {
  const fs = document.createElement('fieldset');
  fs.className = 'platform-toggle basis-switch';
  const legend = document.createElement('legend');
  legend.textContent = 'Memory';
  fs.appendChild(legend);
  for (const b of ['Z', 'X']) {
    const id = `s2s-basis-${b}`;
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 's2s-basis';
    input.id = id;
    input.value = b;
    input.checked = currentBasis() === b;
    input.addEventListener('change', () => { if (input.checked) setBasis(b); });
    const label = document.createElement('label');
    label.setAttribute('for', id);
    label.textContent = BASES[b].Memory;
    const wrap = document.createElement('span');
    wrap.className = 'platform-option';
    wrap.append(input, label);
    fs.appendChild(wrap);
  }
  container.appendChild(fs);
  return fs;
}

function start() {
  const root = document.getElementById('s2s-app');
  if (!root) return;
  const version = pkg.version;
  for (const v of root.querySelectorAll('[data-s2s="version"]')) v.textContent = version;
  // Text cut and design tokens (U7.1, U7.3): style.css applies the tokens under this class.
  if (FEATURES.uxV2 === true) root.classList.add('ux-v2');

  const enabled = LEVELS.filter(isEnabled);
  const selector = root.querySelector('[data-s2s="levels"]');
  const main = root.querySelector('[data-s2s="main"]');
  const mounted = new Map();
  // P5: each is called with the open level's id after every show(), whatever opened it.
  const levelListeners = [];
  let openLevel = null;

  function show(id, focusHeading) {
    for (const l of enabled) {
      const section = mounted.get(l.id);
      const active = l.id === id;
      if (active && !section) {
        const s = document.createElement('section');
        s.id = `s2s-${l.id}`;
        s.className = 'level';
        s.setAttribute('aria-label', l.label);
        main.appendChild(s);
        mounted.set(l.id, s);
        try {
          l.mount(s);
        } catch (err) {
          s.textContent = `This level could not start: ${err.message}`;
        }
        if (FEATURES.phaseFlip === true && BIT_FLIP_ONLY.has(l.id)) addBitFlipNote(s);
      } else if (section) {
        section.hidden = !active;
      }
      const btn = selector.querySelector(`[data-level="${l.id}"]`);
      if (btn) btn.setAttribute('aria-pressed', String(active));
    }
    openLevel = id;
    for (const fn of levelListeners) fn(id);
    if (focusHeading) {
      const h = mounted.get(id)?.querySelector('h2');
      if (h) {
        h.tabIndex = -1;
        h.focus();
      }
    }
  }

  // Under the level's heading; shown only while the phase-flip memory is chosen.
  const notes = [];
  function addBitFlipNote(section) {
    const note = document.createElement('p');
    note.className = 'hint basis-note';
    note.textContent = BIT_FLIP_NOTE;
    note.hidden = currentBasis() !== 'X';
    const h = section.querySelector('h2');
    if (h) h.after(note);
    else section.prepend(note);
    notes.push(note);
  }
  if (FEATURES.phaseFlip === true) {
    // Under the title, above the hero, since it sets the hero's memory too.
    const holder = document.createElement('div');
    holder.className = 'control-row basis-row';
    mountBasisSwitch(holder);
    const title = root.querySelector('h1');
    if (title) title.after(holder);
    else selector.parentNode.before(holder);
    onBasisChange((b) => { for (const n of notes) n.hidden = b !== 'X'; });
  }

  if (enabled.length === 0) {
    main.textContent = 'No level is switched on in this build.';
  } else {
    for (const l of enabled) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'level-button';
      b.dataset.level = l.id;
      b.textContent = l.label;
      b.addEventListener('click', () => show(l.id, true));
      selector.appendChild(b);
    }
    show(enabled[0].id, false);
  }

  // Opening a level from the hero or the findings strip. "Go deeper" opens Level 3 on a platform.
  const level3 = enabled.find((l) => l.id === 'level3');
  const goDeeper = level3 ? (platformId) => {
    setPlatform(platformId);
    show('level3', true);
    mounted.get('level3')?.scrollIntoView({ block: 'start' });
  } : null;
  // "See it step by step" (hero v3) opens "Learn the noise" as the level selector does, at step 3.
  const openLearnNoise = enabled.some((l) => l.id === 'learnnoise') ? () => {
    show('learnnoise', true);
    const s = mounted.get('learnnoise');
    if (s) openLearnNoiseStep3(s);
  } : null;

  // Hero panel above the level tabs (U7.2).
  const hero = root.querySelector('[data-s2s="hero"]');
  if (hero && FEATURES.hero === true) {
    hero.hidden = false;
    try {
      if (heroMount() === mountHero3) mountHero3(hero, { goDeeper, openLearnNoise });
      else mountHero(hero, { goDeeper });
    } catch (err) {
      hero.textContent = `The hero panel could not start: ${err.message}`;
    }
  }

  // Findings strip (UX2), between the hero and the level selector: "learnnoise-3" opens "Learn the
  // noise" at step 3, "level3:<platform>" opens Level 3 on that platform.
  if (FEATURES.findingsStrip === true && enabled.length > 0) {
    const holder = document.createElement('div');
    holder.className = 'findings-holder';
    const open = (target) => {
      if (target === 'learnnoise-3') openLearnNoise?.();
      else if (target.startsWith('level3:')) goDeeper?.(target.slice('level3:'.length));
    };
    try {
      mountFindings(holder, { open });
    } catch (err) {
      holder.textContent = `The findings could not start: ${err.message}`;
    }
    selector.parentNode.before(holder);
  }

  // Pipeline map (P5): below the findings strip, directly above the level selector.
  if (FEATURES.pipelineNav === true && enabled.length > 0) {
    const holder = document.createElement('div');
    holder.className = 'pipeline-holder';
    const onLevelChange = (fn) => { levelListeners.push(fn); fn(openLevel); };
    try {
      mountPipeline(holder, { open: (id) => show(id, true), onLevelChange, levels: enabled.map((l) => l.id) });
    } catch (err) {
      holder.textContent = `The pipeline map could not start: ${err.message}`;
    }
    selector.parentNode.before(holder);
  }

  // Guided tour (U7.10): each stop opens its level and returns its target; a stop whose part of
  // the page is switched off is left out.
  if (FEATURES.tour === true && enabled.length > 0) {
    const has = (id) => enabled.some((l) => l.id === id);
    const section = (id) => {
      show(id, false);
      return mounted.get(id) || null;
    };
    const prepare = {
      hero: () => (hero && !hero.hidden ? hero : null),
      budget: () => section('level3')?.querySelector('.budget') || null,
      learnnoise: () => {
        const s = section('learnnoise');
        return s ? openLearnNoiseStep3(s) || s : null;
      },
      scoreboard: () => {
        const s = section('level5');
        const t = s?.querySelector('.l5-scoreboard');
        for (let p = t?.parentNode; p && p !== s; p = p.parentNode) if (p.localName === 'details') p.open = true;
        return t || s;
      },
    };
    const available = {
      hero: FEATURES.hero === true,
      budget: has('level3') && FEATURES.uxV2 === true,
      learnnoise: has('learnnoise'),
      scoreboard: has('level5') && FEATURES.level5v2 === true,
    };
    const stops = TOUR_STOPS.filter((st) => available[st.id]).map((st) => ({ ...st, prepare: prepare[st.id] }));
    if (stops.length > 0) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'secondary tour-button';
      btn.textContent = TOUR_LABEL;
      const title = root.querySelector('h1');
      if (title) title.after(btn);
      else selector.before(btn);
      createTour({ stops, startButton: btn, doc: document });
    }
  }

  const diag = root.querySelector('[data-s2s="diagnostics"]');
  if (diag) mountDiagnostics(diag, version);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
