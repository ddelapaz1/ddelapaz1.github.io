// Geodèsia bàsica sobre una Terra esfèrica (suficient per a enllaços de fins a ~100 km).

export const EARTH_R_KM = 6371;
const DEG = Math.PI / 180;

export function haversineKm(a, b) {
  const dLat = (b.lat - a.lat) * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Rumb inicial (0° = nord, sentit horari).
export function bearingDeg(a, b) {
  const p1 = a.lat * DEG, p2 = b.lat * DEG, dl = (b.lon - a.lon) * DEG;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) / DEG) + 360) % 360;
}

// Punt intermedi sobre el cercle màxim (t entre 0 i 1).
export function intermediatePoint(a, b, t) {
  const d = haversineKm(a, b) / EARTH_R_KM;
  if (d < 1e-12) return { lat: a.lat, lon: a.lon };
  const p1 = a.lat * DEG, l1 = a.lon * DEG, p2 = b.lat * DEG, l2 = b.lon * DEG;
  const A = Math.sin((1 - t) * d) / Math.sin(d);
  const B = Math.sin(t * d) / Math.sin(d);
  const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
  const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
  const z = A * Math.sin(p1) + B * Math.sin(p2);
  return { lat: Math.atan2(z, Math.hypot(x, y)) / DEG, lon: Math.atan2(y, x) / DEG };
}

export function samplePath(a, b, n) {
  const pts = [];
  for (let i = 0; i < n; i++) pts.push(intermediatePoint(a, b, i / (n - 1)));
  return pts;
}

// Nombre de mostres del perfil: resolució ~90 m (MDE de 90 m), entre 60 i 200 punts.
export function profileSampleCount(distKm) {
  return Math.max(60, Math.min(200, Math.round((distKm * 1000) / 90) + 1));
}

export const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
export function compassPoint(deg) {
  return COMPASS[Math.round(deg / 22.5) % 16];
}
