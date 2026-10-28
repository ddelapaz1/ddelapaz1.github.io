// Visibilitat directa i zona de Fresnel sobre un perfil del terreny.
// Distàncies en km, altures en m i freqüència en GHz.

import { EARTH_R_KM } from './geo.js';

export const K_OPTIONS = [
  { key: '4/3', k: 4 / 3, nom: 'k = 4/3 (atmosfera estàndard)' },
  { key: '1', k: 1, nom: 'k = 1 (Terra real, sense refracció)' },
  { key: '2/3', k: 2 / 3, nom: 'k = 2/3 (condicions desfavorables)' },
  { key: 'inf', k: Infinity, nom: 'k = ∞ (Terra plana)' },
];

export function kValue(key) {
  return (K_OPTIONS.find((o) => o.key === key) || K_OPTIONS[0]).k;
}

// Radi de la zona de Fresnel n-èsima: rn = √(n·λ·d1·d2 / d) ≈ 17,32·√(n·d1·d2 / (f·d)).
export function fresnelRadiusM(d1Km, d2Km, fGHz, n = 1) {
  const d = d1Km + d2Km;
  if (d <= 0 || d1Km <= 0 || d2Km <= 0) return 0;
  const lambda = 0.299792458 / fGHz;
  return Math.sqrt((n * lambda * d1Km * 1000 * d2Km * 1000) / (d * 1000));
}

// Protuberància de la Terra respecte de la corda entre extrems: h = d1·d2 / (2·k·R).
export function earthBulgeM(d1Km, d2Km, k) {
  if (!Number.isFinite(k)) return 0;
  return (d1Km * d2Km * 1000) / (2 * k * EARTH_R_KM);
}

// Pèrdua per difracció en una aresta de ganivet (ITU-R P.526): J(v).
export function knifeEdgeLossDb(v) {
  if (v <= -0.78) return 0;
  return 6.9 + 20 * Math.log10(Math.sqrt((v - 0.1) ** 2 + 1) + v - 0.1);
}

export function groundAt(ground, distKm, d) {
  const n = ground.length;
  const x = (d / distKm) * (n - 1);
  const i = Math.max(0, Math.min(n - 2, Math.floor(x)));
  const t = x - i;
  return ground[i] * (1 - t) + ground[i + 1] * t;
}

export function losStatus(minRatio, req) {
  if (minRatio < 0) return 'blocked';
  if (minRatio < req) return 'partial';
  return 'clear';
}

export const LOS_INFO = {
  clear: { titol: 'Visió directa i 1a zona de Fresnel lliure', curt: 'Fresnel lliure' },
  partial: { titol: 'Visió directa, però la 1a zona de Fresnel està parcialment obstruïda', curt: 'Fresnel obstruïda' },
  blocked: { titol: 'Sense visió directa: el terreny talla la línia entre antenes', curt: 'Sense visió directa' },
};

// p: { distKm, ground: [z (m)] equiespaiats, hTx, hRx, fGHz, k, obstacles: [{ dKm, h }], req }
export function analyzeProfile(p) {
  const { distKm, ground, fGHz, k } = p;
  const req = p.req ?? 0.6;
  const zTx = ground[0] + p.hTx;
  const zRx = ground[ground.length - 1] + p.hRx;
  const pts = [];
  const n = ground.length;
  for (let i = 0; i < n; i++) pts.push({ d: (i / (n - 1)) * distKm, z: ground[i], obst: 0 });
  for (const o of p.obstacles || []) {
    if (o.dKm <= 0 || o.dKm >= distKm) continue;
    pts.push({ d: o.dKm, z: groundAt(ground, distKm, o.dKm), obst: o.h, isObstacle: true });
  }
  pts.sort((a, b) => a.d - b.d);
  const lambda = 0.299792458 / fGHz;
  let worst = null;
  let maxV = -Infinity, vPoint = null;
  for (const s of pts) {
    s.bulge = earthBulgeM(s.d, distKm - s.d, k);
    s.top = s.z + s.bulge + s.obst; // altura efectiva de l'obstacle o del terreny
    s.los = zTx + ((zRx - zTx) * s.d) / distKm;
    s.r1 = fresnelRadiusM(s.d, distKm - s.d, fGHz);
    s.clearance = s.los - s.top;
    const interior = s.d > 1e-9 && s.d < distKm - 1e-9;
    s.ratio = interior && s.r1 > 0 ? s.clearance / s.r1 : Infinity;
    if (interior) {
      if (!worst || s.ratio < worst.ratio) worst = s;
      const d1 = s.d * 1000, d2 = (distKm - s.d) * 1000;
      const v = -s.clearance * Math.sqrt((2 * (d1 + d2)) / (lambda * d1 * d2));
      if (v > maxV) { maxV = v; vPoint = s; }
    }
  }
  const minRatio = worst ? worst.ratio : Infinity;
  return {
    pts, zTx, zRx, worst, minRatio,
    minClearance: worst ? worst.clearance : Infinity,
    status: losStatus(minRatio, req),
    v: maxV, vPoint,
    diffLossDb: Number.isFinite(maxV) ? knifeEdgeLossDb(maxV) : 0,
    r1Mid: fresnelRadiusM(distKm / 2, distKm / 2, fGHz),
    bulgeMid: earthBulgeM(distKm / 2, distKm / 2, k),
    elevDeg: (Math.atan2(zRx - zTx, distKm * 1000) * 180) / Math.PI,
  };
}

// Altura mínima d'una antena (o de les dues alhora) per obtenir la fracció de Fresnel lliure requerida.
export function requiredHeight(p, mode, maxH = 2000) {
  const ok = (h) => {
    const q = { ...p };
    if (mode === 'rx' || mode === 'both') q.hRx = h;
    if (mode === 'tx' || mode === 'both') q.hTx = h;
    return analyzeProfile(q).minRatio >= (p.req ?? 0.6);
  };
  if (ok(0)) return 0;
  if (!ok(maxH)) return null;
  let lo = 0, hi = maxH;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (ok(m)) hi = m; else lo = m;
  }
  return hi;
}

// Terreny d'exemple (sense connexió): un turó desplaçat del centre i ondulacions suaus.
export function syntheticGround(distKm, n = 120, peak = 0.45) {
  const g = [];
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    const hill = Math.min(150, 12 + 6 * distKm) * Math.exp(-(((x - peak) / 0.12) ** 2));
    const amp = Math.min(15, 2 + 0.6 * distKm);
    const waves = amp * Math.sin(x * 17) + 0.6 * amp * Math.sin(x * 41 + 1.3);
    g.push(Math.round((120 + 40 * x + hill + waves) * 10) / 10);
  }
  return g;
}
