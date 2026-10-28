// Obtenció de cotes del terreny a partir de serveis públics gratuïts.
// 1r: Open-Meteo (Copernicus DEM GLO-90). Alternativa: OpenTopoData (SRTM 90 m).

const CHUNK = 100;
const cache = new Map();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const coord = (x) => x.toFixed(5);

async function openMeteo(points, signal) {
  const z = [];
  for (let i = 0; i < points.length; i += CHUNK) {
    const c = points.slice(i, i + CHUNK);
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${c.map((p) => coord(p.lat)).join(',')}&longitude=${c.map((p) => coord(p.lon)).join(',')}`;
    const r = await fetch(url, { signal });
    if (!r.ok) throw new Error(`Open-Meteo HTTP ${r.status}`);
    const j = await r.json();
    if (!Array.isArray(j.elevation) || j.elevation.length !== c.length) throw new Error('Resposta d\'Open-Meteo inesperada');
    z.push(...j.elevation);
  }
  return { z, source: 'Open-Meteo · Copernicus DEM GLO-90 (≈ 90 m)' };
}

async function openTopoData(points, signal) {
  const z = [];
  for (let i = 0; i < points.length; i += CHUNK) {
    if (i > 0) await sleep(1100); // límit d'1 petició per segon
    const c = points.slice(i, i + CHUNK);
    const url = `https://api.opentopodata.org/v1/srtm90m?locations=${c.map((p) => `${coord(p.lat)},${coord(p.lon)}`).join('|')}`;
    const r = await fetch(url, { signal });
    if (!r.ok) throw new Error(`OpenTopoData HTTP ${r.status}`);
    const j = await r.json();
    if (!Array.isArray(j.results) || j.results.length !== c.length) throw new Error('Resposta d\'OpenTopoData inesperada');
    z.push(...j.results.map((x) => x.elevation));
  }
  return { z, source: 'OpenTopoData · SRTM (≈ 90 m)' };
}

export async function fetchElevations(points, signal) {
  const key = points.map((p) => `${coord(p.lat)},${coord(p.lon)}`).join(';');
  if (cache.has(key)) return cache.get(key);
  let res;
  try {
    res = await openMeteo(points, signal);
  } catch (e) {
    if (signal?.aborted) throw e;
    res = await openTopoData(points, signal);
  }
  // Mar o sense dades: cota 0
  res = { ...res, z: res.z.map((v) => (Number.isFinite(v) ? Math.max(v, 0) : 0)) };
  cache.set(key, res);
  return res;
}

export async function searchPlace(q, signal) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=ca&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`Nominatim HTTP ${r.status}`);
  return (await r.json()).map((x) => ({ nom: x.display_name, lat: Number(x.lat), lon: Number(x.lon) }));
}
