// Entry point: builds the level selector from FEATURES, mounts the enabled levels,
// fills in the version and the diagnostics; with FEATURES.hero, the hero panel above the tabs. Bundled by tools/build.mjs into one IIFE.

import pkg from '../../package.json' with { type: 'json' };
import { FEATURES } from './features.js';
import { mountLevel1 } from './level1.js';
import { mountLevel2 } from './level2.js';
import { mountLevel3 } from './level3.js';
import { mountLevel4 } from './level4.js';
import { mountLevel5 } from './level5.js';
import { mountDiagnostics } from './diag.js';
import { mountHero } from './hero.js';
import { setPlatform } from './level3.js';

const LEVELS = [
  { id: 'level1', flag: 'level1', label: 'Level 1: Be the decoder', mount: mountLevel1 },
  { id: 'level2', flag: 'level2', label: 'Level 2: Time is a dimension', mount: mountLevel2 },
  // Readout-platform levels, shown when the trapped ion or the superconducting platform is
  // on; their shared platform toggle lists only the enabled platforms. Level 4 also holds
  // the live-run panel (FEATURES.liveRun).
  { id: 'level3', flags: ['ion', 'superconducting'], label: 'Level 3: Listen longer?', mount: mountLevel3 },
  { id: 'level4', flags: ['ion', 'superconducting'], label: 'Level 4: Trust but verify', mount: mountLevel4 },
  // Platform comparison: both platforms side by side, from the stage 2-4 results.
  { id: 'level5', flag: 'level5', label: 'Level 5: Two platforms', mount: mountLevel5 },
];

const isEnabled = (l) => (l.flags || [l.flag]).some((f) => FEATURES[f] === true);

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
      } else if (section) {
        section.hidden = !active;
      }
      const btn = selector.querySelector(`[data-level="${l.id}"]`);
      if (btn) btn.setAttribute('aria-pressed', String(active));
    }
    if (focusHeading) {
      const h = mounted.get(id)?.querySelector('h2');
      if (h) {
        h.tabIndex = -1;
        h.focus();
      }
    }
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

  // Hero panel above the level tabs (U7.2). "Go deeper" opens Level 3 on the hero's platform.
  const hero = root.querySelector('[data-s2s="hero"]');
  if (hero && FEATURES.hero === true) {
    hero.hidden = false;
    const level3 = enabled.find((l) => l.id === 'level3');
    const goDeeper = level3 ? (platformId) => {
      setPlatform(platformId);
      show('level3', true);
      mounted.get('level3')?.scrollIntoView({ block: 'start' });
    } : null;
    try {
      mountHero(hero, { goDeeper });
    } catch (err) {
      hero.textContent = `The hero panel could not start: ${err.message}`;
    }
  }

  const diag = root.querySelector('[data-s2s="diagnostics"]');
  if (diag) mountDiagnostics(diag, version);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
