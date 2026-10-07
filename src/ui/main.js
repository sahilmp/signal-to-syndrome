// Entry point: builds the level selector from FEATURES, mounts the enabled levels,
// fills in the version and the diagnostics. Bundled by tools/build.mjs into one IIFE.

import pkg from '../../package.json' with { type: 'json' };
import { FEATURES } from './features.js';
import { mountLevel1 } from './level1.js';
import { mountLevel2 } from './level2.js';
import { mountLevel3 } from './level3.js';
import { mountLevel4 } from './level4.js';
import { mountDiagnostics } from './diag.js';

const LEVELS = [
  { id: 'level1', flag: 'level1', label: 'Level 1: Be the decoder', mount: mountLevel1 },
  { id: 'level2', flag: 'level2', label: 'Level 2: Time is a dimension', mount: mountLevel2 },
  // Trapped-ion levels; level 4 also holds the live-run panel (FEATURES.liveRun).
  { id: 'level3', flag: 'ion', label: 'Level 3: Listen longer?', mount: mountLevel3 },
  { id: 'level4', flag: 'ion', label: 'Level 4: Trust but verify', mount: mountLevel4 },
];

function start() {
  const root = document.getElementById('s2s-app');
  if (!root) return;
  const version = pkg.version;
  for (const v of root.querySelectorAll('[data-s2s="version"]')) v.textContent = version;

  const enabled = LEVELS.filter((l) => FEATURES[l.flag] === true);
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

  const diag = root.querySelector('[data-s2s="diagnostics"]');
  if (diag) mountDiagnostics(diag, version);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
