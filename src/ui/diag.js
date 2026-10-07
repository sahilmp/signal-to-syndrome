// Diagnostics section: the fingerprint diagnostic(bankD3R3) and where the data came from.

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
  let fingerprint;
  try {
    fingerprint = diagnostic(bankD3R3);
  } catch (err) {
    fingerprint = `error: ${err.message}`;
  }
  add('Version', version);
  add('Fingerprint, diagnostic(bankD3R3)', fingerprint);
  add('Bank d = 3, r = 3', `${bankD3R3.shots} shots, backend ${bankD3R3.backend ?? 'unknown'}, noise model ${bankD3R3.noise_model ?? 'unknown'}, seed ${bankD3R3.sampler_seed ?? 'unknown'}`);
  add('Data source', bankD3R3.fixture === true ? 'fixture (placeholder data, not a simulator run)' : 'IonQ simulator bank');
  container.replaceChildren(dl);
  return fingerprint;
}
