// Diagnostics section: the fingerprints diagnostic(bankD3R3) (V9) and its learned-decoder
// variant (V9L), and where the data came from.

import { diagnostic } from './bridge_core.js';
import { bankD3R3 } from './bridge_data.js';

export function mountDiagnostics(container, version) {
  const dl = document.createElement('dl');
  const add = (term, value) => {
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = value;
    dl.append(dt, dd);
  };
  const hash = (opts) => {
    try {
      return diagnostic(bankD3R3, opts);
    } catch (err) {
      return `error: ${err.message}`;
    }
  };
  // V9 (naive decoder) and V9L (learned decoder); both must equal Person A's DECISIONS values.
  const fingerprint = hash();
  const fingerprintLearned = hash({ decoder: 'learned' });
  add('Version', version);
  add('Fingerprint, diagnostic(bankD3R3)', fingerprint);
  add('Fingerprint, learned decoder, diagnostic(bankD3R3, { decoder: "learned" })', fingerprintLearned);
  add('Bank d = 3, r = 3', `${bankD3R3.shots} shots, backend ${bankD3R3.backend ?? 'unknown'}, noise model ${bankD3R3.noise_model ?? 'unknown'}, seed ${bankD3R3.sampler_seed ?? 'unknown'}`);
  add('Data source', bankD3R3.fixture === true ? 'fixture (placeholder data, not a simulator run)' : 'IonQ simulator bank');
  container.replaceChildren(dl);
  return fingerprint;
}
