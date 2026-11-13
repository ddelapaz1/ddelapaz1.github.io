// Enllaç per tornar a obrir una configuració (sense el perfil, que es torna a descarregar).

import { DEFAULT_STATE, cloneState } from './engine/model.js';

const KEYS = ['ptx', 'fGHz', 'dKm', 'sens', 'minMargin', 'advancedCables', 'cable', 'ant', 'sites', 'kKey', 'req', 'obstacles', 'applyDiffraction'];

const b64urlEncode = (str) => btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlDecode = (str) => decodeURIComponent(escape(atob(str.replace(/-/g, '+').replace(/_/g, '/'))));

export function encodeConfig(state) {
  const o = {};
  for (const k of KEYS) o[k] = state[k];
  return b64urlEncode(JSON.stringify(o));
}

export function configUrl(state) {
  const base = location.protocol.startsWith('http') ? `${location.origin}${location.pathname}` : 'https://ddelapaz1.github.io/calcul_puntapunt/';
  return `${base}#cfg=${encodeConfig(state)}`;
}

// Retorna un estat complet a partir del fragment #cfg=…, o null si no n'hi ha o no és vàlid.
export function decodeConfigFromHash(hash) {
  const m = /[#&]cfg=([A-Za-z0-9_-]+)/.exec(hash || '');
  if (!m) return null;
  try {
    const o = JSON.parse(b64urlDecode(m[1]));
    const st = cloneState(DEFAULT_STATE);
    for (const k of KEYS) if (o[k] !== undefined) st[k] = o[k];
    st.ant.tx = { ...DEFAULT_STATE.ant.tx, ...st.ant.tx };
    st.ant.rx = { ...DEFAULT_STATE.ant.rx, ...st.ant.rx };
    st.path = null;
    if (!(st.dKm > 0)) return null;
    return st;
  } catch {
    return null;
  }
}
