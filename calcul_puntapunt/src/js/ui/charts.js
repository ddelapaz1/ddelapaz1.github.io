// Gràfiques del simulador 1: cascada del balanç i potència rebuda en funció de d o f.

import { s, clear, pathFromPoints } from './dom.js';
import { badge, niceStep } from './svgkit.js';
import { fmt, fmtU, fmtDist, fmtFreq } from '../engine/format.js';
import { fsplDb } from '../engine/linkBudget.js';

const W = 640, H = 330;
const M = { l: 58, r: 16, t: 26, b: 52 };

export function renderWaterfall(svg, state, res) {
  clear(svg);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const b = res.budget;
  const steps = b.steps.filter((x) => (x.kind !== 'mis' && x.kind !== 'obs') || Math.abs(x.delta) > 0.005);
  const levels = steps.map((x) => x.level).concat([state.sens, state.ptx]);
  let lo = Math.min(...levels), hi = Math.max(...levels);
  const step = niceStep(hi - lo + 20, 6);
  const vMin = Math.floor((lo - 6) / step) * step;
  const vMax = Math.ceil((hi + 8) / step) * step;
  const Y = (v) => M.t + ((vMax - v) / (vMax - vMin)) * (H - M.t - M.b);
  const n = steps.length;
  const bw = (W - M.l - M.r) / n;
  for (let v = vMin; v <= vMax + 1e-9; v += step) {
    svg.appendChild(s('line', { class: 'grid', x1: M.l, y1: Y(v), x2: W - M.r, y2: Y(v) }));
    svg.appendChild(s('text', { class: 'axis-label', x: M.l - 6, y: Y(v) + 4, 'text-anchor': 'end', text: fmt(v, 0) }));
  }
  svg.appendChild(s('text', { class: 'axis-title', x: 12, y: M.t - 10, text: 'dBm' }));
  svg.appendChild(s('line', { class: 'sens-line', x1: M.l, y1: Y(state.sens), x2: W - M.r, y2: Y(state.sens) }));
  let prev = null;
  steps.forEach((st, i) => {
    const x = M.l + i * bw + bw * 0.16;
    const w = bw * 0.68;
    let y0, y1, cls;
    if (st.kind === 'level') {
      y0 = Y(vMin); y1 = Y(st.level);
      cls = st.id === 'rx' ? `bar-level ${b.status}` : 'bar-level';
    } else {
      y0 = Y(st.level - st.delta); y1 = Y(st.level);
      cls = `bar-${st.kind}`;
    }
    const top = Math.min(y0, y1), hgt = Math.max(1.5, Math.abs(y1 - y0));
    svg.appendChild(s('rect', { class: cls, x, y: top, width: w, height: hgt, rx: 3 }));
    if (prev !== null) svg.appendChild(s('line', { class: 'connector', x1: x - bw * 0.32, y1: Y(prev), x2: x, y2: Y(prev) }));
    prev = st.level;
    const label = st.kind === 'level' ? fmt(st.level, 1) : fmt(st.delta, 1, { sign: true });
    const ly = st.kind === 'level' || st.delta >= 0 ? top - 6 : top + hgt + 14;
    svg.appendChild(s('text', { class: `bar-value v-${st.kind}`, x: x + w / 2, y: ly, 'text-anchor': 'middle', text: label }));
    const name = { tx: 'TX', cableTx: 'Cable TX', antTx: 'Ant. TX', misTx: 'Desal. TX', fspl: 'FSPL', obst: 'Obstacles', antRx: 'Ant. RX', misRx: 'Desal. RX', cableRx: 'Cable RX', rx: 'RX' }[st.id];
    const unit = st.kind === 'level' ? 'dBm' : st.kind === 'gain' ? 'dBi' : 'dB';
    svg.appendChild(s('text', { class: 'cat-label', x: x + w / 2, y: H - M.b + 18, 'text-anchor': 'middle', text: name }));
    svg.appendChild(s('text', { class: 'cat-unit', x: x + w / 2, y: H - M.b + 33, 'text-anchor': 'middle', text: unit }));
  });
}

// Corba PRX(x) on x és la distància o la freqüència (escala logarítmica).
export function renderSweep(svg, state, res, mode) {
  clear(svg);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const b = res.budget;
  const isD = mode === 'd';
  const [xMinV, xMaxV] = isD ? [0.1, 50] : [0.1, 40];
  const cur = isD ? state.dKm : state.fGHz;
  const prxAt = (v) => b.prx - ((isD ? fsplDb(v, state.fGHz * 1000) : fsplDb(state.dKm, v * 1000)) - b.fspl);
  const X = (v) => M.l + (Math.log10(v / xMinV) / Math.log10(xMaxV / xMinV)) * (W - M.l - M.r);
  const vals = [prxAt(xMinV), prxAt(xMaxV), state.sens];
  const step = niceStep(Math.max(...vals) - Math.min(...vals), 6);
  const vMin = Math.floor((Math.min(...vals) - 5) / step) * step;
  const vMax = Math.ceil((Math.max(...vals) + 5) / step) * step;
  const Y = (v) => M.t + ((vMax - v) / (vMax - vMin)) * (H - M.t - M.b);
  const ySens = Y(state.sens), yM = Y(state.sens + state.minMargin);
  svg.appendChild(s('rect', { class: 'zone-fail', x: M.l, y: ySens, width: W - M.l - M.r, height: Math.max(0, H - M.b - ySens) }));
  svg.appendChild(s('rect', { class: 'zone-low', x: M.l, y: Math.max(M.t, yM), width: W - M.l - M.r, height: Math.max(0, ySens - Math.max(M.t, yM)) }));
  for (let v = vMin; v <= vMax + 1e-9; v += step) {
    svg.appendChild(s('line', { class: 'grid', x1: M.l, y1: Y(v), x2: W - M.r, y2: Y(v) }));
    svg.appendChild(s('text', { class: 'axis-label', x: M.l - 6, y: Y(v) + 4, 'text-anchor': 'end', text: fmt(v, 0) }));
  }
  const ticks = isD ? [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50] : [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 40];
  for (const t of ticks) {
    svg.appendChild(s('line', { class: 'grid v', x1: X(t), y1: M.t, x2: X(t), y2: H - M.b }));
    svg.appendChild(s('text', { class: 'axis-label', x: X(t), y: H - M.b + 16, 'text-anchor': 'middle', text: fmt(t, t < 1 ? 1 : 0) }));
  }
  svg.appendChild(s('text', { class: 'axis-title', x: (W + M.l) / 2, y: H - 10, 'text-anchor': 'middle', text: isD ? 'Distància (km, escala logarítmica)' : 'Freqüència (GHz, escala logarítmica)' }));
  svg.appendChild(s('text', { class: 'axis-title', x: 12, y: M.t - 10, text: 'PRX (dBm)' }));
  const pts = [];
  for (let i = 0; i <= 120; i++) {
    const v = xMinV * (xMaxV / xMinV) ** (i / 120);
    pts.push([X(v), Y(prxAt(v))]);
  }
  svg.appendChild(s('path', { class: 'sweep-line', d: pathFromPoints(pts) }));
  svg.appendChild(s('line', { class: 'sens-line', x1: M.l, y1: ySens, x2: W - M.r, y2: ySens }));
  svg.appendChild(s('text', { class: 'sens-label', x: W - M.r - 2, y: ySens + 15, 'text-anchor': 'end', text: `Sensibilitat ${fmtU(state.sens, 'dBm', 1)}` }));
  // Abast màxim teòric (PRX = S): d_max = d · 10^(M/20); f_max anàleg.
  const lim = cur * 10 ** (b.margin / 20);
  const inRange = lim >= xMinV && lim <= xMaxV;
  if (inRange) {
    svg.appendChild(s('line', { class: 'limit-line', x1: X(lim), y1: M.t, x2: X(lim), y2: H - M.b }));
  }
  const cx = X(cur), cy = Y(b.prx);
  svg.appendChild(s('line', { class: 'cursor-line', x1: cx, y1: M.t, x2: cx, y2: H - M.b }));
  svg.appendChild(s('circle', { class: `cursor-dot ${b.status}`, cx, cy, r: 6 }));
  const txt = `${isD ? fmtDist(cur) : fmtFreq(cur)} → ${fmtU(b.prx, 'dBm', 1)}`;
  const right = cx < W * 0.6;
  svg.appendChild(badge(right ? cx + 12 : cx - 12, cy - 18, txt, b.status, { size: 12, anchor: right ? 'start' : 'end' }));
  const limTxt = isD
    ? `Distància màxima teòrica (PRX = S): ${fmtDist(lim)}`
    : `Freqüència màxima teòrica (PRX = S, guanys constants): ${lim > 1000 ? '> 1000 GHz' : fmtFreq(lim)}`;
  svg.appendChild(s('text', { class: 'limit-label', x: M.l + 6, y: M.t + 12, text: limTxt }));
}
