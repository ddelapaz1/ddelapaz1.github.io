// Missatges de variació generats a partir dels càlculs (no d'una llista fixa de frases).

import { fmt, fmtU, fmtFreq, fmtDist } from './format.js';
import { STATUS_INFO } from './linkBudget.js';
import { LOS_INFO } from './fresnel.js';

const EPS = 0.005;

function ratioPhrase(nom, prev, next, fmtFn, femeni = true) {
  const r = next / prev;
  const art = femeni ? 'La' : 'El';
  if (Math.abs(r - 2) < 0.02) return `${art} ${nom} s'ha duplicat (${fmtFn(prev)} → ${fmtFn(next)}).`;
  if (Math.abs(r - 0.5) < 0.01) return `${art} ${nom} s'ha reduït a la meitat (${fmtFn(prev)} → ${fmtFn(next)}).`;
  const verb = r > 1 ? 'augmentat' : 'disminuït';
  return `${art} ${nom} ha ${verb} de ${fmtFn(prev)} a ${fmtFn(next)} (×${fmt(r, r < 0.1 ? 3 : 2)}).`;
}

function deltaPhrase(subjecte, delta, unit = 'dB') {
  if (Math.abs(delta) < EPS) return `${subjecte} no ha canviat.`;
  return `${subjecte} ha ${delta > 0 ? 'augmentat' : 'disminuït'} ${fmtU(Math.abs(delta), unit, 1)}.`;
}

const NOM_COSTAT = { tx: 'transmissora', rx: 'receptora' };

export function describeChanges(ps, ns, pe, ne) {
  const causes = [];
  if (ps.dKm !== ns.dKm) causes.push(ratioPhrase('distància', ps.dKm, ns.dKm, fmtDist));
  if (ps.fGHz !== ns.fGHz) causes.push(ratioPhrase('freqüència', ps.fGHz, ns.fGHz, fmtFreq));
  if (ps.ptx !== ns.ptx) causes.push(deltaPhrase('La potència del transmissor', ns.ptx - ps.ptx));
  for (const side of ['tx', 'rx']) {
    const pa = ps.ant[side];
    const na = ns.ant[side];
    const nomAnt = `l'antena ${NOM_COSTAT[side]}`;
    if (pa.family !== na.family) causes.push(`S'ha canviat el tipus de ${nomAnt}.`);
    if (pa.gain !== na.gain) causes.push(deltaPhrase(`El guany nominal de ${nomAnt}`, na.gain - pa.gain));
    if ((pa.az !== na.az || pa.el !== na.el) && Math.abs(ne[side].offAxis - pe[side].offAxis) >= 0.05) {
      causes.push(`L'orientació de ${nomAnt} ha canviat: ara està desviada ${fmtU(ne[side].offAxis, '°', 1)} respecte de l'altre extrem (abans ${fmtU(pe[side].offAxis, '°', 1)}).`);
    }
    if (pa.h !== na.h) causes.push(`L'altura de ${nomAnt} ha passat de ${fmtU(pa.h, 'm', 0)} a ${fmtU(na.h, 'm', 0)}.`);
    const dl = side === 'tx' ? ne.ltx - pe.ltx : ne.lrx - pe.lrx;
    if (Math.abs(dl) >= EPS) causes.push(deltaPhrase(`La pèrdua del cable ${side.toUpperCase()}`, dl));
  }
  const pathKey = (s) => (s.path ? `${s.path.distKm}|${s.path.source}|${s.path.ground.length}|${s.path.ground[0]}` : '');
  if (pathKey(ps) !== pathKey(ns) && ns.path) causes.push('S\'ha obtingut un perfil del terreny nou.');
  if (ps.kKey !== ns.kKey) causes.push(`El factor de curvatura terrestre ha passat de k = ${ps.kKey} a k = ${ns.kKey}.`);
  if (ps.req !== ns.req) causes.push(`Ara es demana tenir lliure el ${fmt(ns.req * 100, 0)} % de la 1a zona de Fresnel.`);
  if (JSON.stringify(ps.obstacles) !== JSON.stringify(ns.obstacles)) causes.push('S\'han modificat els obstacles del trajecte.');
  if (ps.applyDiffraction !== ns.applyDiffraction) causes.push(ns.applyDiffraction ? 'La pèrdua per difracció s\'inclou al balanç.' : 'La pèrdua per difracció ja no s\'inclou al balanç.');
  if (ps.sens !== ns.sens) causes.push(`La sensibilitat del receptor ha passat de ${fmtU(ps.sens, 'dBm', 1)} a ${fmtU(ns.sens, 'dBm', 1)}.`);
  if (ps.minMargin !== ns.minMargin) causes.push(`El marge mínim desitjat ara és ${fmtU(ns.minMargin, 'dB', 1)}.`);
  if (!causes.length) return null;

  const pb = pe.budget;
  const nb = ne.budget;
  const effects = [];
  const dF = nb.fspl - pb.fspl;
  if (Math.abs(dF) >= EPS) effects.push(deltaPhrase('La FSPL', dF));
  else if (ps.dKm === ns.dKm && ps.fGHz === ns.fGHz) effects.push('La FSPL no canvia: només depèn de la distància i la freqüència.');
  for (const side of ['tx', 'rx']) {
    const d = ne[side].mis - pe[side].mis;
    if (Math.abs(d) >= EPS) effects.push(`Pèrdua per desalineació ${side.toUpperCase()}: ${fmtU(pe[side].mis, 'dB', 1)} → ${fmtU(ne[side].mis, 'dB', 1)}.`);
  }
  if (Math.abs(nb.obsLoss - pb.obsLoss) >= EPS) effects.push(`Pèrdua per obstacles (difracció): ${fmtU(pb.obsLoss, 'dB', 1)} → ${fmtU(nb.obsLoss, 'dB', 1)}.`);
  const dP = nb.prx - pb.prx;
  if (Math.abs(dP) >= EPS || ps.sens === ns.sens) effects.push(deltaPhrase('La potència rebuda', dP));
  if (ps.sens !== ns.sens || ps.minMargin !== ns.minMargin || Math.abs(dP) >= EPS) {
    effects.push(`Marge de recepció: ${fmtU(pb.margin, 'dB', 1)} → ${fmtU(nb.margin, 'dB', 1)}.`);
  }
  const pf = pe.fresnel, nf = ne.fresnel;
  if (pf && nf && Math.abs(nf.minRatio - pf.minRatio) > 0.005) {
    effects.push(`Marge mínim sobre la 1a zona de Fresnel: ${fmt(pf.minRatio * 100, 0)} % → ${fmt(nf.minRatio * 100, 0)} %.`);
  }
  let status = null;
  if (nf && (!pf || pf.status !== nf.status)) status = `Visibilitat: ${LOS_INFO[nf.status].curt.toLowerCase()}.`;
  if (pb.status !== nb.status) status = `${status ? `${status} ` : ''}Estat: ${STATUS_INFO[nb.status].titol.toLowerCase()}.`;
  return { causes, effects, status, level: nb.status };
}
