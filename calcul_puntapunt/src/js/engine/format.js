// Format numèric en català: coma decimal i signe menys tipogràfic.

export const NBSP = ' ';

export function fmt(x, dec = 1, opts = {}) {
  if (!Number.isFinite(x)) return '—';
  let v = Number(x.toFixed(dec));
  if (v === 0) v = 0; // elimina −0
  let s = Math.abs(v).toFixed(dec);
  let [ent, frac] = s.split('.');
  if (ent.length > 4) ent = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  s = frac ? `${ent},${frac}` : ent;
  const sign = v < 0 ? '−' : (opts.sign && v > 0 ? '+' : '');
  return sign + s;
}

export function fmtU(x, unit, dec = 1, opts = {}) {
  return `${fmt(x, dec, opts)}${NBSP}${unit}`;
}

export function parseNum(str) {
  if (typeof str === 'number') return str;
  const s = String(str).trim().replace(/[−–]/g, '-').replace(/\s/g, '').replace(',', '.');
  if (s === '' || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return NaN;
  return Number(s);
}

export function fmtFreq(fGHz) {
  if (fGHz < 1) return fmtU(fGHz * 1000, 'MHz', 0);
  return fmtU(fGHz, 'GHz', fGHz < 10 ? 2 : 1);
}

export function fmtDist(dKm) {
  if (dKm < 1) return fmtU(dKm * 1000, 'm', 0);
  return fmtU(dKm, 'km', dKm < 10 ? 2 : 1);
}
