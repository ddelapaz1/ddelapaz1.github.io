// Mapa estàtic per a l'informe: teselles + traçat de l'enllaç dibuixats en un canvas.

import { intermediatePoint } from '../engine/geo.js';

const LAYERS = {
  topo: { url: (z, x, y) => `https://${'abc'[(x + y) % 3]}.tile.opentopomap.org/${z}/${x}/${y}.png`, maxZ: 16, attrib: 'Mapa © OpenTopoMap (CC-BY-SA) · dades © OpenStreetMap' },
  mapa: { url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`, maxZ: 17, attrib: '© OpenStreetMap' },
};

const lonX = (lon, z) => ((lon + 180) / 360) * 256 * 2 ** z;
const latY = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 256 * 2 ** z;
};

function loadTile(url, ms = 9000) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const t = setTimeout(() => resolve(null), ms);
    img.onload = () => { clearTimeout(t); resolve(img); };
    img.onerror = () => { clearTimeout(t); resolve(null); };
    img.src = url;
  });
}

const COLORS = { clear: '#16a34a', partial: '#d97706', blocked: '#dc2626' };

function drawOverlay(ctx, W, H, P, sites, status, worstT, z, attrib) {
  // Traçat
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#ffffff';
  ctx.setLineDash([]);
  const pts = [];
  for (let i = 0; i <= 40; i++) pts.push(P(intermediatePoint(sites.tx, sites.rx, i / 40)));
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = COLORS[status] || '#0891b2';
  ctx.setLineDash([14, 9]);
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  ctx.setLineDash([]);
  if (worstT !== null) {
    const [x, y] = P(intermediatePoint(sites.tx, sites.rx, worstT));
    ctx.fillStyle = COLORS[status]; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, 9, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
  }
  for (const [side, color] of [['tx', '#0891b2'], ['rx', '#7c3aed']]) {
    const [x, y] = P(sites[side]);
    ctx.fillStyle = color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(x, y, 17, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 15px Helvetica, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(side.toUpperCase(), x, y + 1);
  }
  // Escala gràfica
  const midLat = (sites.tx.lat + sites.rx.lat) / 2;
  const mPerPx = (156543.03392 * Math.cos((midLat * Math.PI) / 180)) / 2 ** z;
  const nice = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
  const target = mPerPx * 200;
  const len = nice.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
  const px = len / mPerPx;
  ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(16, H - 52, px + 24, 36);
  ctx.strokeStyle = '#111'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(28, H - 26); ctx.lineTo(28 + px, H - 26); ctx.moveTo(28, H - 32); ctx.lineTo(28, H - 20); ctx.moveTo(28 + px, H - 32); ctx.lineTo(28 + px, H - 20); ctx.stroke();
  ctx.fillStyle = '#111'; ctx.font = '14px Helvetica, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(len >= 1000 ? `${len / 1000} km` : `${len} m`, 28 + px / 2, H - 33);
  // Nord
  ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(W - 52, 14, 38, 50);
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.moveTo(W - 33, 22); ctx.lineTo(W - 42, 44); ctx.lineTo(W - 33, 39); ctx.lineTo(W - 24, 44); ctx.closePath(); ctx.fill();
  ctx.font = 'bold 13px Helvetica, Arial, sans-serif'; ctx.fillText('N', W - 33, 59);
  // Atribució
  ctx.font = '12px Helvetica, Arial, sans-serif';
  const tw = ctx.measureText(attrib).width;
  ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(W - tw - 16, H - 22, tw + 16, 22);
  ctx.fillStyle = '#333'; ctx.textAlign = 'right'; ctx.fillText(attrib, W - 8, H - 7);
}

// Retorna { data, w, h, withTiles } o null si no hi ha extrems.
export async function staticMap(sites, status, worstT, W = 1200, H = 680) {
  if (!sites?.tx || !sites?.rx) return null;
  for (const key of ['topo', 'mapa', null]) {
    const layer = key ? LAYERS[key] : null;
    let z = layer ? layer.maxZ : 16;
    for (; z > 3; z--) {
      const dx = Math.abs(lonX(sites.tx.lon, z) - lonX(sites.rx.lon, z));
      const dy = Math.abs(latY(sites.tx.lat, z) - latY(sites.rx.lat, z));
      if (dx < W - 220 && dy < H - 200) break;
    }
    const cx = (lonX(sites.tx.lon, z) + lonX(sites.rx.lon, z)) / 2;
    const cy = (latY(sites.tx.lat, z) + latY(sites.rx.lat, z)) / 2;
    const ox = cx - W / 2, oy = cy - H / 2;
    const P = (p) => [lonX(p.lon, z) - ox, latY(p.lat, z) - oy];
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#eef1ec'; ctx.fillRect(0, 0, W, H);
    if (layer) {
      const n = 2 ** z;
      const jobs = [];
      for (let tx = Math.floor(ox / 256); tx <= Math.floor((ox + W) / 256); tx++) {
        for (let ty = Math.floor(oy / 256); ty <= Math.floor((oy + H) / 256); ty++) {
          if (ty < 0 || ty >= n) continue;
          const wx = ((tx % n) + n) % n;
          jobs.push(loadTile(layer.url(z, wx, ty)).then((img) => ({ img, tx, ty })));
        }
      }
      const tiles = await Promise.all(jobs);
      const failed = tiles.filter((t) => !t.img).length;
      if (failed > tiles.length * 0.3) continue; // prova la capa següent
      for (const t of tiles) if (t.img) ctx.drawImage(t.img, t.tx * 256 - ox, t.ty * 256 - oy);
    } else {
      ctx.strokeStyle = '#d5dbd3'; ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    }
    drawOverlay(ctx, W, H, P, sites, status, worstT, z, layer ? layer.attrib : 'Mapa de fons no disponible');
    try {
      return { data: canvas.toDataURL('image/jpeg', 0.88), w: W, h: H, withTiles: !!layer };
    } catch {
      continue; // canvas contaminat: prova sense teselles
    }
  }
  return null;
}
