// Models didàctics de radiació de les antenes.
// No són dades certificades de cap antena comercial: són aproximacions analítiques
// coherents amb el guany, l'ample de feix a −3 dB i la relació davant-darrere.

import { besselJ2 } from './bessel.js';

const DEG = Math.PI / 180;
export const KRAUS_K = 30000; // G ≈ K / (θH · θV), amb θ en graus (aproximació de Kraus)
export const DISH_EFFICIENCY = 0.55;

export const FAMILIES = {
  parabolica: {
    nom: 'Parabòlica',
    descripcio: 'Guany elevat i feix molt estret. Molt sensible als errors d\'orientació.',
    range: [15, 40],
    aspect: 1, // θH / θV
    aperture: 'circular',
  },
  panell: {
    nom: 'Panell direccional',
    descripcio: 'Feix de radiació més ample. Tolera millor petits errors d\'orientació.',
    range: [8, 25],
    aspect: 1.1,
    aperture: 'rect-cos',
  },
  yagi: {
    nom: 'Yagi-Uda',
    descripcio: 'Diagrama directiu amb lòbuls secundaris i lòbul posterior apreciables.',
    range: [5, 18],
    aspect: 0.85,
    aperture: 'uniforme',
  },
  omni: {
    nom: 'Omnidireccional',
    descripcio: 'Cobertura azimutal pràcticament circular, amb un feix vertical estret i guany màxim baix.',
    range: [0, 12],
    aspect: null,
    aperture: 'colineal',
  },
};

export const FAMILY_ORDER = ['omni', 'yagi', 'panell', 'parabolica'];

export const PRESETS = [
  { id: 'par-35', family: 'parabolica', gain: 35, nom: 'Parabòlica d\'alt guany (35 dBi)' },
  { id: 'par-29', family: 'parabolica', gain: 29, nom: 'Parabòlica mitjana (29 dBi)' },
  { id: 'par-23', family: 'parabolica', gain: 23, nom: 'Parabòlica petita (23 dBi)' },
  { id: 'pan-18', family: 'panell', gain: 18, nom: 'Panell direccional (18 dBi)' },
  { id: 'pan-14', family: 'panell', gain: 14, nom: 'Panell de feix ample (14 dBi)' },
  { id: 'yag-14', family: 'yagi', gain: 14, nom: 'Yagi-Uda (14 dBi)' },
  { id: 'yag-10', family: 'yagi', gain: 10, nom: 'Yagi-Uda curta (10 dBi)' },
  { id: 'omn-8', family: 'omni', gain: 8, nom: 'Omnidireccional (8 dBi)' },
  { id: 'omn-3', family: 'omni', gain: 3, nom: 'Omnidireccional curta (3 dBi)' },
];

export function presetFor(ant) {
  return PRESETS.find((p) => p.family === ant.family && Math.abs(p.gain - ant.gain) < 1e-9) || null;
}

// Família adequada quan el guany surt del rang de la família actual.
export function familyForGain(currentFamily, gain) {
  const [lo, hi] = FAMILIES[currentFamily].range;
  if (gain >= lo && gain <= hi) return currentFamily;
  let idx = FAMILY_ORDER.indexOf(currentFamily);
  while (true) {
    const f = FAMILIES[FAMILY_ORDER[idx]];
    if (gain < f.range[0] && idx > 0) idx--;
    else if (gain > f.range[1] && idx < FAMILY_ORDER.length - 1) idx++;
    else return FAMILY_ORDER[idx];
  }
}

// Paràmetres derivats del model a partir de la família i el guany màxim.
export function antennaModel(family, gainDbi) {
  const fam = FAMILIES[family];
  const g = 10 ** (gainDbi / 10);
  if (family === 'omni') {
    const bwV = Math.min(80, 115 / g);
    return { family, gain: gainDbi, bwH: 360, bwV, fb: 0, omni: true, aperture: fam.aperture };
  }
  const bwV = Math.sqrt(KRAUS_K / (g * fam.aspect));
  const bwH = fam.aspect * bwV;
  let fb;
  if (family === 'parabolica') fb = Math.min(50, 25 + 0.8 * (gainDbi - 15));
  else if (family === 'panell') fb = Math.min(30, 18 + 0.6 * gainDbi);
  else fb = Math.min(20, 8 + 0.8 * gainDbi);
  return { family, gain: gainDbi, bwH, bwV, fb, omni: false, aperture: fam.aperture };
}

// Diàmetre equivalent d'una parabòlica amb aquest guany a la freqüència indicada.
export function dishDiameterM(gainDbi, fGHz, eff = DISH_EFFICIENCY) {
  const lambda = 0.299792458 / fGHz;
  return (lambda / Math.PI) * Math.sqrt(10 ** (gainDbi / 10) / eff);
}

// --- Factors d'obertura (amplitud normalitzada, 1 a u = 0) ---
const APERTURES = {
  circular: { null1: 5.1356, amp: (u) => (Math.abs(u) < 1e-6 ? 1 : (8 * besselJ2(u)) / (u * u)) },
  'rect-cos': {
    null1: 1.5 * Math.PI,
    amp: (u) => {
      const d = 1 - (2 * u / Math.PI) ** 2;
      if (Math.abs(d) < 1e-9) return Math.PI / 4;
      return Math.cos(u) / d;
    },
  },
  uniforme: { null1: Math.PI, amp: (u) => (Math.abs(u) < 1e-9 ? 1 : Math.sin(u) / u) },
  colineal: { null1: Math.PI, amp: (u) => (Math.abs(u) < 1e-9 ? 1 : Math.sin(u) / u) },
};

// Potència relativa (lineal) sense límit inferior.
function rawPower(aperture, k, psi) {
  const a = APERTURES[aperture].amp(k * Math.sin(psi));
  if (aperture === 'colineal') return a * a * Math.cos(psi) ** 2; // element dipol
  const obliq = ((1 + Math.cos(psi)) / 2) ** 2;
  return a * a * obliq;
}

// Calibració: es busca k perquè la potència valgui exactament 0,5 (−3,01 dB) a bw/2.
const kCache = new Map();
export function calibrateK(aperture, bwDeg) {
  const key = `${aperture}|${bwDeg.toFixed(3)}`;
  const hit = kCache.get(key);
  if (hit !== undefined) return hit;
  const half = (bwDeg / 2) * DEG;
  let lo = 0;
  let hi = APERTURES[aperture].null1 / Math.sin(Math.min(half, Math.PI / 2 - 1e-6));
  let k;
  if (rawPower(aperture, 0, half) <= 0.5) k = 0;
  else {
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (rawPower(aperture, mid, half) > 0.5) lo = mid; else hi = mid;
    }
    k = (lo + hi) / 2;
  }
  if (kCache.size > 5000) kCache.clear();
  kCache.set(key, k);
  return k;
}

export const PATTERN_FLOOR_DB = 60;

// Guany relatiu (dB, ≤ 0) en una direcció expressada en coordenades locals de l'antena:
// x endavant (eix principal), y esquerra, z amunt. El vector ha de ser unitari.
export function relativeGainDb(model, local) {
  const [x, y, z] = local;
  let p;
  if (model.omni) {
    const theta = Math.asin(Math.max(-1, Math.min(1, z)));
    const k = calibrateK('colineal', model.bwV);
    p = rawPower('colineal', k, theta);
    const db = 10 * Math.log10(Math.max(p, 1e-12));
    return Math.max(db, -PATTERN_FLOOR_DB);
  }
  const psi = Math.acos(Math.max(-1, Math.min(1, x)));
  // Ample de feix el·líptic segons el pla que conté la direcció.
  const rho = Math.hypot(y, z);
  let bw;
  if (rho < 1e-12) bw = model.bwH;
  else {
    const c = y / rho;
    const s = z / rho;
    bw = 1 / Math.sqrt((c * c) / model.bwH ** 2 + (s * s) / model.bwV ** 2);
  }
  const k = calibrateK(model.aperture, bw);
  p = rawPower(model.aperture, k, psi);
  const db = 10 * Math.log10(Math.max(p, 1e-12));
  return Math.max(db, -model.fb, -PATTERN_FLOOR_DB);
}
