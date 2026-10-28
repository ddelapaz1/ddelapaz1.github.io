// Simulador 3: perfil del terreny amb la línia de visió, la 1a zona de Fresnel,
// la curvatura terrestre i els obstacles. Les antenes i els obstacles es poden arrossegar.

import { s, clear, svgPoint, pathFromPoints, clamp } from './dom.js';
import { badge, niceStep } from './svgkit.js';
import { fmt, fmtU } from '../engine/format.js';
import { update } from '../state.js';
import { LIMITS } from '../engine/model.js';
import { earthBulgeM, kValue } from '../engine/fresnel.js';

const W = 1400, H = 470;
const M = { l: 78, r: 78, t: 34, b: 56 };

let svg, layer, hoverG, onHoverCb, view = null, drag = null;

export function initProfileView(container, onHover) {
  onHoverCb = onHover;
  svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'profile-svg', role: 'application', 'aria-label': 'Perfil del terreny entre els dos extrems amb la línia de visió i la zona de Fresnel' });
  layer = s('g');
  hoverG = s('g', { class: 'p-hover', 'pointer-events': 'none' });
  svg.append(layer, hoverG);
  container.appendChild(svg);

  svg.addEventListener('pointerdown', (e) => {
    const t = e.target.closest('[data-drag]');
    if (!t || !view) return;
    drag = { kind: t.dataset.drag, id: t.dataset.id };
    svg.setPointerCapture(e.pointerId);
    svg.classList.add('dragging');
    e.preventDefault();
  });
  svg.addEventListener('pointermove', (e) => {
    if (!view) return;
    const p = svgPoint(svg, e);
    const d = clamp(view.xInv(p.x), 0, view.dist);
    const z = view.yInv(p.y);
    if (drag) {
      if (drag.kind === 'mast') {
        const side = drag.id;
        const zg = side === 'tx' ? view.ground[0] : view.ground[view.ground.length - 1];
        const hNew = clamp(Math.round(z - zg), LIMITS.h[0], LIMITS.h[1]);
        update((st) => { st.ant[side].h = hNew; }, 'user');
      } else if (drag.kind === 'obs-move' || drag.kind === 'obs-top') {
        const id = drag.id;
        const kind = drag.kind;
        update((st) => {
          const o = st.obstacles.find((x) => x.id === id);
          if (!o) return;
          if (kind === 'obs-move') o.dKm = Math.round(clamp(d, view.dist * 0.01, view.dist * 0.99) * 1000) / 1000;
          else {
            const base = view.baseAt(o.dKm);
            o.h = clamp(Math.round(z - base), 1, 300);
          }
        }, 'user');
      }
      return;
    }
    if (p.x < M.l || p.x > W - M.r) { hideHover(); return; }
    showHoverAt(d);
  });
  const end = () => { drag = null; svg.classList.remove('dragging'); };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('pointerleave', () => { if (!drag) hideHover(); });
}

function hideHover() {
  clear(hoverG);
  onHoverCb?.(null);
}

function showHoverAt(d) {
  if (!view) return;
  const f = view.fresnel;
  // Mostra més propera
  let best = f.pts[0];
  for (const q of f.pts) if (Math.abs(q.d - d) < Math.abs(best.d - d)) best = q;
  clear(hoverG);
  const x = view.X(best.d);
  hoverG.appendChild(s('line', { class: 'hv-line', x1: x, y1: M.t, x2: x, y2: H - M.b }));
  hoverG.appendChild(s('circle', { class: 'hv-dot', cx: x, cy: view.Y(best.top), r: 5 }));
  hoverG.appendChild(s('circle', { class: 'hv-dot los', cx: x, cy: view.Y(best.los), r: 5 }));
  const lines = [
    `d = ${fmtU(best.d, 'km', 2)}`,
    `Terreny ${fmtU(best.z, 'm', 0)}${best.bulge > 0.05 ? ` + curvatura ${fmtU(best.bulge, 'm', 1)}` : ''}${best.obst ? ` + obstacle ${fmtU(best.obst, 'm', 0)}` : ''}`,
    `Línia de visió ${fmtU(best.los, 'm', 1)}`,
    `Radi F1 ${fmtU(best.r1, 'm', 1)}`,
    Number.isFinite(best.ratio) ? `Marge ${fmtU(best.clearance, 'm', 1)} (${fmt(best.ratio * 100, 0)} % F1)` : 'Extrem de l\'enllaç',
  ];
  const bw = 290, bh = 18 * lines.length + 14;
  const bx = x + 14 + bw > W - M.r ? x - 14 - bw : x + 14;
  const by = M.t + 8;
  hoverG.appendChild(s('rect', { class: 'hv-box', x: bx, y: by, width: bw, height: bh, rx: 8 }));
  lines.forEach((t, i) => hoverG.appendChild(s('text', { class: i === 0 ? 'hv-title' : 'hv-text', x: bx + 12, y: by + 22 + i * 18, text: t })));
  onHoverCb?.(best.d);
}

export function renderProfileView(state, res) {
  clear(layer);
  clear(hoverG);
  const f = res.fresnel;
  if (!f) {
    view = null;
    layer.appendChild(s('rect', { class: 'pf-empty-bg', x: 0, y: 0, width: W, height: H, rx: 10 }));
    const msg = state.path ? 'El perfil no correspon a la distància actual de l\'enllaç. Torna a situar els extrems al mapa o restableix la distància.' : 'Situa els extrems TX i RX al mapa (o fes servir el terreny d\'exemple) per obtenir el perfil d\'elevació.';
    layer.appendChild(s('text', { class: 'pf-empty', x: W / 2, y: H / 2, 'text-anchor': 'middle', text: msg }));
    return;
  }
  const dist = state.path.distKm;
  const ground = state.path.ground;
  const k = kValue(state.kKey);
  const pts = f.pts;
  const lows = Math.min(...ground);
  const highs = Math.max(...pts.map((q) => Math.max(q.top, q.los + q.r1)), f.zTx, f.zRx);
  const pad = Math.max(10, (highs - lows) * 0.1);
  const step = niceStep(highs - lows + 2 * pad, 6);
  const yMin = Math.floor((lows - pad) / step) * step;
  const yMax = Math.ceil((highs + pad) / step) * step;
  const X = (d) => M.l + (d / dist) * (W - M.l - M.r);
  const Y = (z) => H - M.b - ((z - yMin) / (yMax - yMin)) * (H - M.t - M.b);
  const bulge = (d) => earthBulgeM(d, dist - d, k);
  view = {
    X, Y, dist, ground, fresnel: f,
    xInv: (x) => ((x - M.l) / (W - M.l - M.r)) * dist,
    yInv: (y) => yMin + ((H - M.b - y) / (H - M.t - M.b)) * (yMax - yMin),
    baseAt: (d) => {
      const n = ground.length, xx = (d / dist) * (n - 1), i = Math.min(n - 2, Math.floor(xx)), t = xx - i;
      return ground[i] * (1 - t) + ground[i + 1] * t + bulge(d);
    },
  };

  layer.appendChild(s('rect', { class: 'pf-bg', x: M.l, y: M.t, width: W - M.l - M.r, height: H - M.t - M.b }));
  for (let z = yMin; z <= yMax + 1e-9; z += step) {
    layer.appendChild(s('line', { class: 'grid', x1: M.l, y1: Y(z), x2: W - M.r, y2: Y(z) }));
    layer.appendChild(s('text', { class: 'axis-label', x: M.l - 8, y: Y(z) + 4, 'text-anchor': 'end', text: fmt(z, 0) }));
  }
  const xs = niceStep(dist, 8);
  for (let d = 0; d <= dist + 1e-9; d += xs) {
    layer.appendChild(s('line', { class: 'grid v', x1: X(d), y1: M.t, x2: X(d), y2: H - M.b }));
    layer.appendChild(s('text', { class: 'axis-label', x: X(d), y: H - M.b + 18, 'text-anchor': 'middle', text: fmt(d, xs < 1 ? 1 : 0) }));
  }
  layer.appendChild(s('text', { class: 'axis-title', x: (W + M.l - M.r) / 2, y: H - 10, 'text-anchor': 'middle', text: 'Distància des de TX (km)' }));
  layer.appendChild(s('text', { class: 'axis-title', x: 14, y: M.t - 12, text: 'Altitud (m)' }));

  // Terreny (amb la protuberància terrestre) sobre una base corbada
  const gpts = ground.map((z, i) => { const d = (i / (ground.length - 1)) * dist; return [X(d), Y(z + bulge(d))]; });
  const basePts = [];
  for (let i = 0; i <= 60; i++) { const d = (i / 60) * dist; basePts.push([X(d), Y(yMin + bulge(d))]); }
  layer.appendChild(s('path', { class: 'pf-terrain', d: `${pathFromPoints(gpts)}L${basePts.slice().reverse().map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L')}Z` }));
  if (Number.isFinite(k)) {
    layer.appendChild(s('path', { class: 'pf-earth', d: pathFromPoints(basePts) }));
    if (f.bulgeMid > 0.5) layer.appendChild(s('path', { class: 'pf-flat', d: pathFromPoints(ground.map((z, i) => [X((i / (ground.length - 1)) * dist), Y(z)])) }));
  }

  // Zona de Fresnel i línia de visió
  const up = pts.map((q) => [X(q.d), Y(q.los + q.r1)]);
  const dn = pts.map((q) => [X(q.d), Y(q.los - q.r1)]).reverse();
  layer.appendChild(s('path', { class: 'pf-fresnel', d: `${pathFromPoints(up)}L${dn.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L')}Z` }));
  layer.appendChild(s('path', { class: 'pf-req', d: pathFromPoints(pts.map((q) => [X(q.d), Y(q.los - state.req * q.r1)])) }));
  layer.appendChild(s('line', { class: `pf-los ${f.status}`, x1: X(0), y1: Y(f.zTx), x2: X(dist), y2: Y(f.zRx) }));

  // Trams del terreny que envaeixen la zona requerida
  let run = [];
  const flush = (cls) => { if (run.length > 1) layer.appendChild(s('path', { class: `pf-intrude ${cls}`, d: pathFromPoints(run) })); run = []; };
  let cur = null;
  for (const q of pts) {
    if (q.obst) continue;
    const cls = q.ratio < 0 ? 'blocked' : q.ratio < state.req ? 'partial' : null;
    if (cls !== cur) { flush(cur); cur = cls; }
    if (cls) run.push([X(q.d), Y(q.top)]);
  }
  flush(cur);

  // Obstacles
  for (const o of state.obstacles) {
    if (o.dKm <= 0 || o.dKm >= dist) continue;
    const base = view.baseAt(o.dKm);
    const q = pts.find((p) => p.isObstacle && Math.abs(p.d - o.dKm) < 1e-9);
    const cls = q && q.ratio < 0 ? 'blocked' : q && q.ratio < state.req ? 'partial' : 'clear';
    const g = s('g', { class: `pf-obstacle ${cls}` });
    g.appendChild(s('rect', { 'data-drag': 'obs-move', 'data-id': o.id, x: X(o.dKm) - 9, y: Y(base + o.h), width: 18, height: Math.max(2, Y(base) - Y(base + o.h)), rx: 3 }));
    g.appendChild(s('circle', { class: 'pf-handle', 'data-drag': 'obs-top', 'data-id': o.id, cx: X(o.dKm), cy: Y(base + o.h), r: 7 }));
    g.appendChild(s('text', { class: 'pf-obs-label', x: X(o.dKm), y: Y(base + o.h) - 12, 'text-anchor': 'middle', text: `${o.nom || 'Obstacle'} ${fmtU(o.h, 'm', 0)}` }));
    layer.appendChild(g);
  }

  // Pals d'antena als extrems
  for (const side of ['tx', 'rx']) {
    const d = side === 'tx' ? 0 : dist;
    const zg = side === 'tx' ? ground[0] : ground[ground.length - 1];
    const zt = zg + state.ant[side].h;
    const g = s('g', { class: `pf-mast ${side}` });
    g.appendChild(s('line', { x1: X(d), y1: Y(zg), x2: X(d), y2: Y(zt) }));
    g.appendChild(s('circle', { class: 'pf-handle', 'data-drag': 'mast', 'data-id': side, cx: X(d), cy: Y(zt), r: 9 }));
    layer.appendChild(g);
    const anchor = side === 'tx' ? 'start' : 'end';
    const lx = side === 'tx' ? X(d) + 14 : X(d) - 14;
    layer.appendChild(badge(lx, Y(zt) - 18, `${side.toUpperCase()} · ${fmtU(state.ant[side].h, 'm', 0)} sobre ${fmtU(zg, 'm', 0)}`, side === 'tx' ? 'level' : 'level-rx', { size: 13, anchor }));
  }

  // Punt amb menys marge
  const w = f.worst;
  if (w) {
    const x = X(w.d);
    layer.appendChild(s('line', { class: `pf-worst ${f.status}`, x1: x, y1: Y(w.top), x2: x, y2: Y(w.los) }));
    layer.appendChild(s('circle', { class: `pf-worst-dot ${f.status}`, cx: x, cy: Y(w.top), r: 6 }));
    const txt = `Marge mínim ${fmtU(w.clearance, 'm', 1)} · ${fmt(w.ratio * 100, 0)} % F1`;
    const right = x < W * 0.6;
    layer.appendChild(badge(right ? x + 12 : x - 12, Math.min(Y(w.top) + 26, H - M.b - 14), txt, f.status === 'clear' ? 'ok' : f.status === 'partial' ? 'low' : 'fail', { size: 13, anchor: right ? 'start' : 'end' }));
  }
  layer.appendChild(s('text', { class: 'plan-note', x: W - M.r, y: M.t - 12, 'text-anchor': 'end', text: `Escala vertical exagerada · ${Number.isFinite(k) ? `curvatura terrestre amb k = ${state.kKey}` : 'Terra plana (k = ∞)'}` }));
}

