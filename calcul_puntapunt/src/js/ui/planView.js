// Simulador 2: vista en planta interactiva (girar les antenes arrossegant).

import { s, clear, svgPoint, pathFromPoints, clamp } from './dom.js';
import { badge, antennaIcon } from './svgkit.js';
import { fmt, fmtU } from '../engine/format.js';
import { update, getState } from '../state.js';
import { wrap180, dirFromAngles } from '../engine/geometry.js';
import { gainToward, linkDirections } from '../engine/model.js';

const W = 800, H = 430;
const POS = { tx: [130, 215], rx: [670, 215] };
const L = POS.rx[0] - POS.tx[0];
const R_LOBE = L * 0.92;
const R_HANDLE = 104;
// Escala lineal de camp: r ∝ 10^(G_rel/20). El punt a −3 dB queda a 0,707·R.
const ampR = (rel) => R_LOBE * 10 ** (rel / 20);
const DEG = Math.PI / 180;

let svg, layer, drag = null;

const ptAt = (side, angDeg, r) => [POS[side][0] + r * Math.cos(angDeg * DEG), POS[side][1] - r * Math.sin(angDeg * DEG)];
const absAz = (side, az) => (side === 'tx' ? az : 180 + az);

export function initPlanView(container) {
  svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'plan-svg', role: 'application', 'aria-label': 'Vista en planta de l\'enllaç. Arrossega els indicadors per girar les antenes.' });
  const bg = s('g', { class: 'map' });
  bg.appendChild(s('rect', { class: 'map-bg', x: 0, y: 0, width: W, height: H }));
  for (let x = 0; x <= W; x += 40) bg.appendChild(s('line', { class: 'map-grid', x1: x, y1: 0, x2: x, y2: H }));
  for (let y = 0; y <= H; y += 40) bg.appendChild(s('line', { class: 'map-grid', x1: 0, y1: y, x2: W, y2: y }));
  svg.appendChild(bg);
  layer = s('g');
  svg.appendChild(layer);
  container.appendChild(svg);

  svg.addEventListener('pointerdown', (e) => {
    const t = e.target.closest('[data-rotate]');
    if (!t) return;
    drag = t.dataset.rotate;
    svg.setPointerCapture(e.pointerId);
    svg.classList.add('dragging');
    e.preventDefault();
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = svgPoint(svg, e);
    const [cx, cy] = POS[drag];
    if (Math.hypot(p.x - cx, p.y - cy) < 8) return;
    const ang = Math.atan2(-(p.y - cy), p.x - cx) / DEG;
    const az = Math.round(wrap180(drag === 'tx' ? ang : ang - 180) * 10) / 10;
    const side = drag;
    update((st) => { st.ant[side].az = az; }, 'user');
  });
  const end = () => { drag = null; svg.classList.remove('dragging'); };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('keydown', (e) => {
    const t = e.target.closest('[data-rotate]');
    if (!t) return;
    const side = t.dataset.rotate;
    const d = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const stp = e.shiftKey ? 5 : 0.5;
    update((st) => { st.ant[side].az = clamp(wrap180(getState().ant[side].az + d * stp), -180, 180); }, 'user');
  });
}

function lobePath(side, state, res) {
  const a = state.ant[side];
  const m = res[side].model;
  const eCut = linkDirections(state).reqEl[side];
  const pts = [];
  for (let i = 0; i <= 720; i++) {
    const beta = i / 2;
    const g = gainToward(a, side, m, dirFromAngles(beta, eCut));
    const rel = g - m.gain;
    pts.push(ptAt(side, beta, ampR(rel)));
  }
  return pathFromPoints(pts, true);
}

export function renderPlanView(state, res) {
  clear(layer);
  const b = res.budget;
  // Línia de l'enllaç
  layer.appendChild(s('line', { class: 'link-line', x1: POS.tx[0], y1: POS.tx[1], x2: POS.rx[0], y2: POS.rx[1] }));
  layer.appendChild(s('line', { class: `link-flow ${b.status}`, x1: POS.tx[0], y1: POS.tx[1], x2: POS.rx[0], y2: POS.rx[1] }));

  for (const side of ['rx', 'tx']) {
    const a = state.ant[side];
    const m = res[side].model;
    const bore = absAz(side, a.az);
    const g = s('g', { class: `ant-layer ${side}` });
    // Feix (sector −3 dB)
    if (!m.omni) {
      const a0 = bore - m.bwH / 2, a1 = bore + m.bwH / 2;
      const r = ampR(-3);
      const p0 = ptAt(side, a0, r), p1 = ptAt(side, a1, r);
      g.appendChild(s('path', { class: 'sector', d: `M${POS[side][0]},${POS[side][1]} L${p0[0]},${p0[1]} A${r},${r} 0 0 0 ${p1[0]},${p1[1]} Z` }));
      for (const ang of [a0, a1]) {
        const pe = ptAt(side, ang, r);
        g.appendChild(s('line', { class: 'edge-3db', x1: POS[side][0], y1: POS[side][1], x2: pe[0], y2: pe[1] }));
        g.appendChild(s('circle', { class: 'pt-3db', cx: pe[0], cy: pe[1], r: 4 }));
      }
      // Rètol a l'extrem antihorari del feix, desplaçat cap a fora de l'eix.
      const pe = ptAt(side, a1, r);
      const out = (a1 + 90) * DEG;
      g.appendChild(s('text', { class: 'lbl-3db', x: pe[0] + 16 * Math.cos(out), y: pe[1] - 16 * Math.sin(out) + 4, 'text-anchor': 'middle', text: '−3 dB' }));
    }
    g.appendChild(s('path', { class: 'lobe', d: lobePath(side, state, res) }));
    // Eix i manetes
    const tip = ptAt(side, bore, R_HANDLE);
    g.appendChild(s('line', { class: 'bore', x1: POS[side][0], y1: POS[side][1], x2: tip[0], y2: tip[1] }));
    // Arc de desviació
    const dev = a.az;
    if (Math.abs(dev) > 0.05) {
      const base = side === 'tx' ? 0 : 180;
      const r = 62;
      const pA = ptAt(side, base, r), pB = ptAt(side, bore, r);
      const large = Math.abs(dev) > 180 ? 1 : 0;
      const sweep = dev > 0 ? 0 : 1;
      g.appendChild(s('path', { class: 'dev-arc', d: `M${pA[0]},${pA[1]} A${r},${r} 0 ${large} ${sweep} ${pB[0]},${pB[1]}` }));
      const pm = ptAt(side, base + dev / 2, Math.abs(dev) < 30 ? R_HANDLE + 56 : r + 26);
      if (Math.abs(dev) < 30) pm[1] += pm[1] < POS[side][1] ? -16 : 16;
      g.appendChild(badge(pm[0], pm[1], `${fmt(dev, 1, { sign: true })}°`, 'mis', { size: 15 }));
    }
    const handle = s('g', { class: 'handle', 'data-rotate': side, tabindex: 0, role: 'slider', 'aria-label': `Orientació antena ${side.toUpperCase()}`, 'aria-valuenow': a.az.toFixed(1), 'aria-valuemin': -180, 'aria-valuemax': 180 });
    handle.appendChild(s('circle', { class: 'handle-hit', cx: tip[0], cy: tip[1], r: 20 }));
    handle.appendChild(s('circle', { class: 'handle-dot', cx: tip[0], cy: tip[1], r: 10 }));
    handle.appendChild(s('path', { class: 'handle-icon', d: `M${tip[0] - 4},${tip[1] - 3} a5,5 0 1 1 0,6`, transform: `rotate(${-bore} ${tip[0]} ${tip[1]})` }));
    g.appendChild(handle);
    // Antena (vista superior)
    const ant = s('g', { class: 'ant-icon', 'data-rotate': side, transform: `translate(${POS[side][0]},${POS[side][1]}) rotate(${-bore})` });
    ant.appendChild(s('circle', { class: 'ant-base', cx: 0, cy: 0, r: 16 }));
    ant.appendChild(antennaIcon(m.family, 'plan'));
    g.appendChild(ant);
    layer.appendChild(g);
  }
  // Rètols
  for (const side of ['tx', 'rx']) {
    const r = res[side];
    const [x, y] = POS[side];
    const anchor = side === 'tx' ? 'start' : 'end';
    const lx = side === 'tx' ? x - 112 : x + 112;
    layer.appendChild(s('text', { class: `plan-name ${side}`, x: lx, y: y + 92, 'text-anchor': anchor, text: side === 'tx' ? 'Antena TX' : 'Antena RX' }));
    layer.appendChild(badge(lx, y + 120, `G ef ${fmtU(r.gEf, 'dBi', 1)}`, r.mis < 0.5 ? 'ok' : r.mis < 3 ? 'low' : 'fail', { size: 16, anchor }));
    layer.appendChild(s('text', { class: 'plan-sub', x: lx, y: y + 152, 'text-anchor': anchor, text: `Desalineació ${fmtU(r.offAxis, '°', 1)} · ${fmtU(-r.mis, 'dB', 1)}` }));
  }
  layer.appendChild(badge(W / 2, 28, `PRX ${fmtU(b.prx, 'dBm', 1)}  ·  Marge ${fmtU(b.margin, 'dB', 1, { sign: true })}`, b.status, { size: 17 }));
  layer.appendChild(s('text', { class: 'plan-note', x: 12, y: H - 12, text: 'Distància no a escala; angles reals. Lòbuls en escala lineal de camp. Arrossega les manetes per girar les antenes.' }));
}
