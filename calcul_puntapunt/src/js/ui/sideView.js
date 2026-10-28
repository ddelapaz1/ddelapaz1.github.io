// Simulador 2: vista lateral (elevació). L'escala vertical està exagerada, però les
// desviacions angulars respecte de la línia de l'enllaç es dibuixen amb el valor real.

import { s, clear, svgPoint, pathFromPoints, clamp } from './dom.js';
import { badge, antennaIcon } from './svgkit.js';
import { fmt, fmtU } from '../engine/format.js';
import { update, getState } from '../state.js';
import { wrap180 } from '../engine/geometry.js';
import { gainToward } from '../engine/model.js';
import { LIMITS } from '../engine/model.js';

const W = 600, H = 330, GROUND = 284;
const XS = { tx: 95, rx: 505 };
const DEG = Math.PI / 180;


let svg, layer, drag = null, geo = null;

const towerPx = (h) => 30 + (h / LIMITS.h[1]) * 170;

function computeGeo(state, res) {
  const pos = { tx: [XS.tx, GROUND - towerPx(state.ant.tx.h)], rx: [XS.rx, GROUND - towerPx(state.ant.rx.h)] };
  const phiL = Math.atan2(-(pos.rx[1] - pos.tx[1]), pos.rx[0] - pos.tx[0]) / DEG;
  return { pos, off: phiL - res.e0, phiL };
}

const pt = (p, ang, r) => [p[0] + r * Math.cos(ang * DEG), p[1] - r * Math.sin(ang * DEG)];

export function initSideView(container) {
  svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'side-svg', role: 'application', 'aria-label': 'Vista lateral. Arrossega els indicadors per canviar l\'elevació de les antenes.' });
  svg.appendChild(s('rect', { class: 'sky', x: 0, y: 0, width: W, height: GROUND }));
  svg.appendChild(s('rect', { class: 'ground', x: 0, y: GROUND, width: W, height: H - GROUND }));
  svg.appendChild(s('line', { class: 'ground-line', x1: 0, y1: GROUND, x2: W, y2: GROUND }));
  layer = s('g');
  svg.appendChild(layer);
  container.appendChild(svg);

  svg.addEventListener('pointerdown', (e) => {
    const t = e.target.closest('[data-tilt]');
    if (!t) return;
    drag = t.dataset.tilt;
    svg.setPointerCapture(e.pointerId);
    svg.classList.add('dragging');
    e.preventDefault();
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag || !geo) return;
    const p = svgPoint(svg, e);
    const [cx, cy] = geo.pos[drag];
    if (Math.hypot(p.x - cx, p.y - cy) < 8) return;
    const vis = Math.atan2(-(p.y - cy), p.x - cx) / DEG;
    const gamma = vis - geo.off;
    let el = drag === 'tx' ? wrap180(gamma) : wrap180(180 - gamma);
    el = clamp(Math.round(el * 10) / 10, LIMITS.el[0], LIMITS.el[1]);
    const side = drag;
    update((st) => { st.ant[side].el = el; }, 'user');
  });
  const end = () => { drag = null; svg.classList.remove('dragging'); };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('keydown', (e) => {
    const t = e.target.closest('[data-tilt]');
    if (!t) return;
    const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const side = t.dataset.tilt;
    update((st) => { st.ant[side].el = clamp(getState().ant[side].el + d * (e.shiftKey ? 2 : 0.1), LIMITS.el[0], LIMITS.el[1]); }, 'user');
  });
}

export function renderSideView(state, res) {
  geo = computeGeo(state, res);
  const { pos, off } = geo;
  clear(layer);
  const L = Math.hypot(pos.rx[0] - pos.tx[0], pos.rx[1] - pos.tx[1]);
  const R = L * 0.9;
  const ampR = (rel) => R * 10 ** (rel / 20);
  for (const side of ['tx', 'rx']) {
    const [x, y] = pos[side];
    const g = s('g', { class: 'tower' });
    g.appendChild(s('line', { x1: x - 16, y1: GROUND, x2: x - 4, y2: y + 10 }));
    g.appendChild(s('line', { x1: x + 16, y1: GROUND, x2: x + 4, y2: y + 10 }));
    const n = Math.max(2, Math.round((GROUND - y) / 28));
    let d = '';
    for (let i = 0; i < n; i++) {
      const ya = GROUND - ((GROUND - y - 10) * i) / n, yb = GROUND - ((GROUND - y - 10) * (i + 1)) / n;
      const wa = 16 - (12 * i) / n, wb = 16 - (12 * (i + 1)) / n;
      d += `M${x - wa},${ya}L${x + wb},${yb}M${x + wa},${ya}L${x - wb},${yb}`;
    }
    g.appendChild(s('path', { d, class: 'brace' }));
    layer.appendChild(g);
    // Cota d'altura
    const hx = side === 'tx' ? x - 40 : x + 40;
    layer.appendChild(s('line', { class: 'dim', x1: hx, y1: GROUND, x2: hx, y2: y }));
    layer.appendChild(s('text', { class: 'dim-label', x: side === 'tx' ? hx - 6 : hx + 6, y: (GROUND + y) / 2 + 4, 'text-anchor': side === 'tx' ? 'end' : 'start', text: fmtU(state.ant[side].h, 'm', 0) }));
  }
  layer.appendChild(s('line', { class: 'link-line', x1: pos.tx[0], y1: pos.tx[1], x2: pos.rx[0], y2: pos.rx[1] }));
  layer.appendChild(s('line', { class: `link-flow ${res.budget.status}`, x1: pos.tx[0], y1: pos.tx[1], x2: pos.rx[0], y2: pos.rx[1] }));

  for (const side of ['rx', 'tx']) {
    const a = state.ant[side];
    const m = res[side].model;
    const p = pos[side];
    const g = s('g', { class: `ant-layer ${side}` });
    // Tall vertical del diagrama (pla vertical que conté l'enllaç)
    const pts = [];
    for (let i = 0; i <= 720; i++) {
      const gamma = i / 2;
      const w = [Math.cos(gamma * DEG), 0, Math.sin(gamma * DEG)];
      const rel = gainToward(a, side, m, w) - m.gain;
      pts.push(pt(p, gamma + off, ampR(rel)));
    }
    const boreGamma = side === 'tx' ? a.el : 180 - a.el;
    const vis = boreGamma + off;
    const half = m.bwV / 2;
    const r3 = ampR(-3);
    const p0 = pt(p, vis - half, r3), p1 = pt(p, vis + half, r3);
    g.appendChild(s('path', { class: 'sector', d: `M${p[0]},${p[1]} L${p0[0]},${p0[1]} A${r3},${r3} 0 0 0 ${p1[0]},${p1[1]} Z` }));
    g.appendChild(s('line', { class: 'edge-3db', x1: p[0], y1: p[1], x2: p0[0], y2: p0[1] }));
    g.appendChild(s('line', { class: 'edge-3db', x1: p[0], y1: p[1], x2: p1[0], y2: p1[1] }));
    g.appendChild(s('path', { class: 'lobe', d: pathFromPoints(pts, true) }));
    const tip = pt(p, vis, 74);
    g.appendChild(s('line', { class: 'bore', x1: p[0], y1: p[1], x2: tip[0], y2: tip[1] }));
    const dev = res[side].elErr;
    if (Math.abs(dev) > 0.05) {
      const base = side === 'tx' ? geo.phiL : 180 + geo.phiL;
      const r = 50;
      const pA = pt(p, base, r), pB = pt(p, vis, r);
      const ccw = vis > base;
      g.appendChild(s('path', { class: 'dev-arc', d: `M${pA[0]},${pA[1]} A${r},${r} 0 0 ${ccw ? 0 : 1} ${pB[0]},${pB[1]}` }));
      const pm = pt(p, (base + vis) / 2, Math.abs(dev) < 30 ? 118 : r + 24);
      if (Math.abs(dev) < 30) pm[1] += pm[1] < p[1] ? -12 : 12;
      g.appendChild(badge(pm[0], pm[1], `${fmt(dev, 1, { sign: true })}°`, 'mis', { size: 14 }));
    }
    const handle = s('g', { class: 'handle', 'data-tilt': side, tabindex: 0, role: 'slider', 'aria-label': `Elevació antena ${side.toUpperCase()}`, 'aria-valuenow': a.el.toFixed(1) });
    handle.appendChild(s('circle', { class: 'handle-hit', cx: tip[0], cy: tip[1], r: 20 }));
    handle.appendChild(s('circle', { class: 'handle-dot', cx: tip[0], cy: tip[1], r: 9 }));
    g.appendChild(handle);
    const ant = s('g', { class: 'ant-icon', 'data-tilt': side, transform: `translate(${p[0]},${p[1]}) rotate(${-vis})` });
    ant.appendChild(antennaIcon(m.family, 'side'));
    g.appendChild(ant);
    layer.appendChild(g);
  }
  for (const side of ['tx', 'rx']) {
    const r = res[side];
    const x = side === 'tx' ? 12 : W - 12;
    const anchor = side === 'tx' ? 'start' : 'end';
    layer.appendChild(s('text', { class: `plan-name ${side}`, x, y: 24, 'text-anchor': anchor, text: `${side.toUpperCase()}: elevació ${fmtU(state.ant[side].el, '°', 1)}` }));
    layer.appendChild(s('text', { class: 'plan-sub', x, y: 44, 'text-anchor': anchor, text: `Necessària ${fmtU(r.reqEl, '°', 2)} · error ${fmtU(r.elErr, '°', 1, { sign: true })}` }));
  }
  layer.appendChild(s('text', { class: 'plan-note', x: W / 2, y: H - 12, 'text-anchor': 'middle', text: `Escala vertical exagerada; desviacions reals. Elevació TX→RX: ${fmtU(res.e0, '°', 2)}` }));
}
