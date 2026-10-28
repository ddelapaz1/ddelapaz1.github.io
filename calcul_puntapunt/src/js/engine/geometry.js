// Geometria de l'enllaç. Sistema de referència: x cap al receptor (horitzontal),
// y cap a l'esquerra en la vista en planta, z amunt. Angles en graus.

const DEG = Math.PI / 180;

export function wrap180(a) {
  let r = ((a + 180) % 360 + 360) % 360 - 180;
  if (r === -180) r = 180;
  return r;
}

// Angle d'elevació de la línia TX→RX (la Terra es considera plana a aquesta escala).
export function linkElevationDeg(dKm, hTx, hRx) {
  return Math.atan2(hRx - hTx, dKm * 1000) / DEG;
}

export function dirFromAngles(azDeg, elDeg) {
  const a = azDeg * DEG;
  const e = elDeg * DEG;
  return [Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e)];
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Coordenades locals d'una direcció mundial per a una antena orientada (az, el).
export function toLocal(azDeg, elDeg, w) {
  const a = azDeg * DEG;
  const e = elDeg * DEG;
  const fwd = [Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e)];
  const left = [-Math.sin(a), Math.cos(a), 0];
  const up = [-Math.sin(e) * Math.cos(a), -Math.sin(e) * Math.sin(a), Math.cos(e)];
  return [dot(w, fwd), dot(w, left), dot(w, up)];
}

export function angleBetweenDeg(u, v) {
  return Math.acos(Math.max(-1, Math.min(1, dot(u, v)))) / DEG;
}

// Azimut absolut d'apuntament de cada antena. La desviació azimutal es mesura
// respecte de la direcció cap a l'altre extrem (positiu = gir antihorari en planta).
export function absAzimuth(side, azOffsetDeg) {
  return side === 'tx' ? azOffsetDeg : 180 + azOffsetDeg;
}
