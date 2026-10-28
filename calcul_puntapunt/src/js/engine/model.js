// Model complet: combina cables, antenes, geometria i balanç de potències
// a partir d'un únic estat compartit pels dos simuladors.

import { cableLossDb, computeBudget } from './linkBudget.js';
import { antennaModel, relativeGainDb } from './antennas.js';
import { linkElevationDeg, dirFromAngles, toLocal, angleBetweenDeg, absAzimuth } from './geometry.js';
import { analyzeProfile, kValue } from './fresnel.js';

export const DEFAULT_STATE = {
  ptx: 20,
  fGHz: 5.8,
  dKm: 2,
  sens: -80,
  minMargin: 10,
  advancedCables: false,
  cable: {
    tx: { lossDb: 2, lengthM: 7.5, attDb100: 20, connDb: 0.5 },
    rx: { lossDb: 2, lengthM: 7.5, attDb100: 20, connDb: 0.5 },
  },
  ant: {
    tx: { family: 'parabolica', gain: 20, az: 0, el: 0, h: 30 },
    rx: { family: 'parabolica', gain: 20, az: 0, el: 0, h: 30 },
  },
  // Simulador 3: perfil del terreny (null fins que se n'obté un) i paràmetres de Fresnel.
  sites: { tx: null, rx: null },
  path: null,
  kKey: '4/3',
  req: 0.6,
  obstacles: [],
  applyDiffraction: true,
};

export const LIMITS = {
  ptx: [-10, 40],
  fGHz: [0.1, 40],
  dKm: [0.1, 50],
  cableLoss: [0, 10],
  gain: [0, 40],
  sens: [-110, -50],
  minMargin: [0, 40],
  lengthM: [0, 100],
  attDb100: [0, 150],
  connDb: [0, 5],
  az: [-180, 180],
  el: [-30, 30],
  h: [2, 300],
};

export function cloneState(s) {
  return JSON.parse(JSON.stringify(s));
}

// El perfil només és vàlid si correspon a la distància actual de l'enllaç.
export function pathValid(s) {
  return !!(s.path && s.path.ground && s.path.ground.length > 1 && Math.abs(s.path.distKm - s.dKm) / s.dKm < 0.005);
}

// Cota del terreny a cada extrem (0 si no hi ha perfil).
export function groundEnds(s) {
  if (!pathValid(s)) return [0, 0];
  const g = s.path.ground;
  return [g[0], g[g.length - 1]];
}

export function profileInput(s) {
  return {
    distKm: s.path.distKm, ground: s.path.ground, hTx: s.ant.tx.h, hRx: s.ant.rx.h,
    fGHz: s.fGHz, k: kValue(s.kKey), obstacles: s.obstacles, req: s.req,
  };
}

// Direcció (mundial) des de cada extrem cap a l'altre.
export function linkDirections(s) {
  const [zA, zB] = groundEnds(s);
  const e0 = linkElevationDeg(s.dKm, zA + s.ant.tx.h, zB + s.ant.rx.h);
  return { e0, tx: dirFromAngles(0, e0), rx: dirFromAngles(180, -e0), reqEl: { tx: e0, rx: -e0 } };
}

// Guany (dBi) d'una antena configurada en una direcció mundial qualsevol.
export function gainToward(antState, side, model, w) {
  const local = toLocal(absAzimuth(side, antState.az), antState.el, w);
  return model.gain + relativeGainDb(model, local);
}

function evalSide(s, side, dirs) {
  const a = s.ant[side];
  const model = antennaModel(a.family, a.gain);
  const w = dirs[side];
  const gEf = gainToward(a, side, model, w);
  const bore = dirFromAngles(absAzimuth(side, a.az), a.el);
  return {
    model,
    gNom: a.gain,
    gEf,
    mis: a.gain - gEf,
    offAxis: angleBetweenDeg(bore, w),
    azErr: a.az,
    elErr: a.el - dirs.reqEl[side],
    reqEl: dirs.reqEl[side],
  };
}

export function evaluate(s) {
  const ltx = cableLossDb(s.cable.tx, s.advancedCables);
  const lrx = cableLossDb(s.cable.rx, s.advancedCables);
  const dirs = linkDirections(s);
  const tx = evalSide(s, 'tx', dirs);
  const rx = evalSide(s, 'rx', dirs);
  const fresnel = pathValid(s) ? analyzeProfile(profileInput(s)) : null;
  const obsLoss = fresnel && s.applyDiffraction ? fresnel.diffLossDb : 0;
  const budget = computeBudget({
    ptx: s.ptx, fGHz: s.fGHz, dKm: s.dKm, ltx, lrx,
    gtx: tx.gNom, grx: rx.gNom, misTx: tx.mis, misRx: rx.mis, obsLoss,
    sens: s.sens, minMargin: s.minMargin,
  });
  return { ltx, lrx, e0: dirs.e0, tx, rx, budget, fresnel };
}

// Orientació que encara perfectament les dues antenes.
export function alignedOrientation(s) {
  const { reqEl } = linkDirections(s);
  return { tx: { az: 0, el: reqEl.tx }, rx: { az: 0, el: reqEl.rx } };
}

export function alignmentLevel(misDb) {
  if (misDb < 0.5) return 'ok';
  if (misDb < 3) return 'low';
  return 'fail';
}
