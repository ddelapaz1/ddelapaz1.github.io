// Simulador 1: esquema animat de l'enllaç i diagrama de nivells alineat.

import { s, h, clear, clamp, pathFromPoints } from './dom.js';
import { badge, vArrow, niceStep } from './svgkit.js';
import { fmt, fmtU, fmtDist, fmtFreq } from '../engine/format.js';
import { EXPLAIN } from './glossary.js';
import { getUi } from '../state.js';

const W = 1400;
const H = 600;
const X = {
  txBox: [30, 150], txOut: 150, cableTxEnd: 330, antTx: 392, misTx: 412, spaceA: 440, spaceB: 960, obs: 984,
  antRx: 1008, misRx: 1030, cableRxA: 1052, cableRxB: 1250, rx: 1310, rxBox: [1250, 1370],
};
const DISH_Y = 112;
const GROUND_Y = 286;
const LV = { top: 366, bottom: 580, axisX: 112 };

let svg, wavesG, dynG, levelG, txDish, rxDish, rxLed, rxBars, txSpread = 20, rxSpread = 20;
let txTilt = 0, rxTilt = 0, intensity = 1, statusCls = 'ok';
let callout, card;

function tower(cx) {
  const g = s('g', { class: 'tower' });
  const top = DISH_Y + 18;
  const lx0 = cx - 22, lx1 = cx - 7, rx0 = cx + 22, rx1 = cx + 7;
  g.appendChild(s('line', { x1: lx0, y1: GROUND_Y, x2: lx1, y2: top }));
  g.appendChild(s('line', { x1: rx0, y1: GROUND_Y, x2: rx1, y2: top }));
  const n = 6;
  let d = '';
  for (let i = 0; i < n; i++) {
    const ya = GROUND_Y - ((GROUND_Y - top) * i) / n;
    const yb = GROUND_Y - ((GROUND_Y - top) * (i + 1)) / n;
    const wa = 22 - (15 * i) / n;
    const wb = 22 - (15 * (i + 1)) / n;
    d += `M${cx - wa},${ya}L${cx + wb},${yb}M${cx + wa},${ya}L${cx - wb},${yb}`;
  }
  g.appendChild(s('path', { d, class: 'brace' }));
  g.appendChild(s('rect', { x: cx - 30, y: GROUND_Y - 6, width: 60, height: 8, rx: 2, class: 'tower-base' }));
  return g;
}

// Representació física de l'antena segons el tipus, orientada cap a la dreta (dir = 1)
// o cap a l'esquerra (dir = −1). Es redibuixa quan canvia la família.
function antennaShape(inner, family, cx, dir) {
  clear(inner);
  const rim = cx + dir * 16;
  if (family === 'parabolica') {
    const back = cx - dir * 20;
    const focus = rim + dir * 42;
    inner.appendChild(s('path', { class: 'dish-body', d: `M${rim},${DISH_Y - 50} Q${back - dir * 6},${DISH_Y} ${rim},${DISH_Y + 50} Z` }));
    inner.appendChild(s('line', { class: 'dish-rim', x1: rim, y1: DISH_Y - 50, x2: rim, y2: DISH_Y + 50 }));
    inner.appendChild(s('line', { class: 'dish-arm', x1: rim, y1: DISH_Y - 46, x2: focus, y2: DISH_Y }));
    inner.appendChild(s('line', { class: 'dish-arm', x1: rim, y1: DISH_Y + 46, x2: focus, y2: DISH_Y }));
    inner.appendChild(s('rect', { class: 'dish-feed', x: focus - (dir > 0 ? 0 : 10), y: DISH_Y - 6, width: 10, height: 12, rx: 2 }));
  } else if (family === 'panell') {
    inner.appendChild(s('rect', { class: 'dish-body', x: dir > 0 ? cx + 2 : cx - 20, y: DISH_Y - 46, width: 18, height: 92, rx: 4 }));
    inner.appendChild(s('line', { class: 'dish-feed-line', x1: rim + dir * 4, y1: DISH_Y - 40, x2: rim + dir * 4, y2: DISH_Y + 40 }));
  } else if (family === 'yagi') {
    const end = cx + dir * 96;
    inner.appendChild(s('line', { class: 'dish-rim', x1: cx, y1: DISH_Y, x2: end, y2: DISH_Y }));
    const els = [[4, 34], [18, 30], [34, 25], [50, 23], [66, 21], [82, 19], [96, 17]];
    els.forEach(([off, half], i) => inner.appendChild(s('line', { class: i === 1 ? 'yagi-driven' : 'dish-arm yagi-el', x1: cx + dir * off, y1: DISH_Y - half, x2: cx + dir * off, y2: DISH_Y + half })));
  } else {
    inner.appendChild(s('rect', { class: 'dish-body', x: cx + dir * 12 - 6, y: DISH_Y - 78, width: 12, height: 100, rx: 6 }));
    for (let i = 0; i < 4; i++) inner.appendChild(s('line', { class: 'dish-arm', x1: cx + dir * 12 - 6, y1: DISH_Y - 58 + i * 22, x2: cx + dir * 12 + 6, y2: DISH_Y - 58 + i * 22 }));
  }
}

function antennaGroup(cx, dir) {
  const g = s('g', { class: 'dish' });
  const back = cx - dir * 20;
  g.appendChild(s('rect', { class: 'dish-mount', x: Math.min(cx, back) - 6, y: DISH_Y - 6, width: Math.abs(cx - back) + 12, height: 12, rx: 3 }));
  const inner = s('g');
  g.appendChild(inner);
  return { g, inner, pivot: [cx + dir * 16, DISH_Y], cx, dir, family: null };
}

function equipment(x0, x1, label, sub, isRx) {
  const g = s('g', { class: 'equip' });
  const w = x1 - x0;
  g.appendChild(s('rect', { class: 'equip-body', x: x0, y: 196, width: w, height: 90, rx: 10 }));
  g.appendChild(s('rect', { class: 'equip-screen', x: x0 + 12, y: 208, width: w - 24, height: 34, rx: 5 }));
  g.appendChild(s('text', { class: 'equip-label', x: x0 + 22, y: 231, text: label }));
  g.appendChild(s('text', { class: 'equip-sub', x: x0 + 12, y: 262, text: sub }));
  for (let i = 0; i < 3; i++) g.appendChild(s('rect', { class: 'equip-slot', x: x0 + 12 + i * 20, y: 270, width: 14, height: 4, rx: 2 }));
  let led = null, bars = null;
  if (isRx) {
    bars = s('g', { class: 'rx-bars' });
    for (let i = 0; i < 4; i++) bars.appendChild(s('rect', { x: x1 - 52 + i * 9, y: 234 - (i + 1) * 5, width: 6, height: (i + 1) * 5, rx: 1 }));
    g.appendChild(bars);
    led = s('circle', { class: 'led', cx: x1 - 18, cy: 264, r: 6 });
  } else {
    led = s('circle', { class: 'led led-tx', cx: x1 - 18, cy: 264, r: 6 });
  }
  g.appendChild(led);
  return { g, led, bars };
}

function group(key, ...children) {
  const g = s('g', { class: 'el', 'data-explain': key, tabindex: 0, role: 'button', 'aria-label': EXPLAIN[key]?.titol || key });
  children.forEach((c) => g.appendChild(c));
  return g;
}

export function initLinkDiagram(container, cardEl) {
  card = cardEl;
  svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'link-svg', role: 'img', 'aria-label': 'Esquema de l\'enllaç de microones i diagrama de nivells' });
  const defs = s('defs');
  const clip = s('clipPath', { id: 'clip-space' });
  clip.appendChild(s('rect', { x: 420, y: 0, width: 600, height: GROUND_Y - 2 }));
  defs.appendChild(clip);
  svg.appendChild(defs);

  svg.appendChild(s('rect', { class: 'sky', x: 0, y: 0, width: W, height: GROUND_Y }));
  svg.appendChild(s('rect', { class: 'ground', x: 0, y: GROUND_Y, width: W, height: 40 }));
  svg.appendChild(s('line', { class: 'ground-line', x1: 0, y1: GROUND_Y, x2: W, y2: GROUND_Y }));

  // Espai lliure (ones)
  wavesG = s('g', { 'clip-path': 'url(#clip-space)', class: 'waves' });
  const spaceHit = s('rect', { class: 'hit', x: X.spaceA, y: 0, width: X.spaceB - X.spaceA, height: GROUND_Y - 30 });
  svg.appendChild(group('space', spaceHit, wavesG));

  // Cables
  const cableTxD = `M${X.txOut},250 L${X.cableTxEnd - 20},250 Q${X.antTx - 20},250 ${X.antTx - 16},228 L${X.antTx - 9},${DISH_Y + 24} L${X.antTx - 14},${DISH_Y + 6}`;
  const cableRxD = `M${X.antRx + 14},${DISH_Y + 6} L${X.antRx + 9},${DISH_Y + 24} L${X.antRx + 16},228 Q${X.antRx + 20},250 ${X.antRx + 60},250 L${X.cableRxB},250`;
  svg.appendChild(group('cableTx', s('path', { class: 'cable', d: cableTxD }), s('path', { class: 'cable-flow', d: cableTxD })));
  svg.appendChild(group('cableRx', s('path', { class: 'cable', d: cableRxD }), s('path', { class: 'cable-flow rx', d: cableRxD })));

  // Torres i antenes
  const dTx = antennaGroup(X.antTx, 1);
  const dRx = antennaGroup(X.antRx, -1);
  txDish = dTx; rxDish = dRx;
  svg.appendChild(group('antTx', tower(X.antTx), dTx.g));
  svg.appendChild(group('antRx', tower(X.antRx), dRx.g));

  // Equips
  const tx = equipment(X.txBox[0], X.txBox[1], 'TX', 'Transmissor', false);
  const rx = equipment(X.rxBox[0], X.rxBox[1], 'RX', 'Receptor', true);
  rxLed = rx.led; rxBars = rx.bars;
  svg.appendChild(group('tx', tx.g));
  svg.appendChild(group('rx', rx.g));

  // Rètols al terra
  const caps = [[90, 'Transmissor'], [240, 'Cable coaxial'], [X.antTx, 'Antena TX'], [700, 'Propagació en espai lliure'], [X.antRx, 'Antena RX'], [1150, 'Cable coaxial'], [1310, 'Receptor']];
  for (const [x, t] of caps) svg.appendChild(s('text', { class: 'caption', x, y: GROUND_Y + 26, 'text-anchor': 'middle', text: t }));

  dynG = s('g', { class: 'dyn' });
  svg.appendChild(dynG);
  levelG = s('g', { class: 'level' });
  svg.appendChild(group('level', s('rect', { class: 'hit', x: 0, y: LV.top - 30, width: W, height: H - LV.top + 30 }), levelG));

  container.appendChild(svg);

  callout = h('div', { class: 'callout', hidden: true, role: 'note' });
  container.appendChild(callout);
  svg.addEventListener('click', (e) => {
    const el = e.target.closest('[data-explain]');
    if (!getUi().explain || !el) return;
    showCallout(el);
  });
  svg.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && getUi().explain) {
      const el = e.target.closest('[data-explain]');
      if (el) { e.preventDefault(); showCallout(el); }
    }
  });
  callout.addEventListener('click', () => { callout.hidden = true; });
}

function showCallout(el) {
  const key = el.dataset.explain;
  const ex = EXPLAIN[key];
  if (!ex) return;
  svg.querySelectorAll('.el.selected').forEach((n) => n.classList.remove('selected'));
  el.classList.add('selected');
  callout.innerHTML = '';
  callout.append(h('strong', { text: ex.titol }), h('p', { text: ex.text }), h('span', { class: 'callout-close', text: 'Fes clic per tancar' }));
  callout.hidden = false;
  const box = callout.parentElement.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const cw = Math.min(360, box.width - 24);
  callout.style.width = `${cw}px`;
  let x = r.left - box.left + r.width / 2 - cw / 2;
  x = clamp(x, 12, box.width - cw - 12);
  let y = key === 'level' ? LV.top / H * box.height - 10 : r.top - box.top + Math.min(r.height, 180) + 6;
  if (key === 'space') y = (GROUND_Y - 120) / H * box.height;
  callout.style.left = `${x}px`;
  callout.style.top = `${Math.max(8, y)}px`;
}

export function hideCallout() {
  if (callout) callout.hidden = true;
  svg?.querySelectorAll('.el.selected').forEach((n) => n.classList.remove('selected'));
}

export function renderLinkDiagram(state, res) {
  const b = res.budget;
  statusCls = b.status;
  svg.classList.toggle('explain-on', getUi().explain);
  // Intensitat conceptual de les ones (mai desapareixen).
  intensity = clamp(0.55 + (b.margin + 10) / 60, 0.45, 1);
  const spreadOf = (m) => (m.omni ? 55 : clamp(m.bwV * 1.2, 6, 45));
  txSpread = spreadOf(res.tx.model);
  rxSpread = spreadOf(res.rx.model);
  txTilt = -clamp(res.tx.offAxis, 0, 40);
  rxTilt = clamp(res.rx.offAxis, 0, 40);
  for (const [d, side] of [[txDish, 'tx'], [rxDish, 'rx']]) {
    if (d.family !== state.ant[side].family) {
      d.family = state.ant[side].family;
      antennaShape(d.inner, d.family, d.cx, d.dir);
    }
  }
  txDish.inner.setAttribute('transform', `rotate(${txTilt} ${txDish.pivot[0]} ${txDish.pivot[1]})`);
  rxDish.inner.setAttribute('transform', `rotate(${rxTilt} ${rxDish.pivot[0]} ${rxDish.pivot[1]})`);
  rxLed.setAttribute('class', `led led-${b.status}`);
  const nbars = b.margin < 0 ? 0 : b.margin < state.minMargin ? (b.margin < state.minMargin / 2 ? 1 : 2) : b.margin < state.minMargin + 10 ? 3 : 4;
  [...rxBars.children].forEach((r, i) => r.setAttribute('class', i < nbars ? `on ${b.status}` : 'off'));

  clear(dynG);
  const mis = (v) => v > 0.05;
  dynG.appendChild(badge(90, 170, fmtU(state.ptx, 'dBm', 1), 'level', { size: 17 }));
  dynG.appendChild(badge(240, 222, fmtU(-res.ltx, 'dB', 1), 'loss', { size: 16 }));
  dynG.appendChild(badge(X.antTx, 34, fmtU(res.tx.gNom, 'dBi', 1, { sign: true }), 'gain', { size: 17 }));
  dynG.appendChild(badge(735, 34, `FSPL ${fmtU(-b.fspl, 'dB', 1)}`, 'loss', { size: 19 }));
  dynG.appendChild(badge(X.antRx, 34, fmtU(res.rx.gNom, 'dBi', 1, { sign: true }), 'gain', { size: 17 }));
  dynG.appendChild(badge(1150, 222, fmtU(-res.lrx, 'dB', 1), 'loss', { size: 16 }));
  dynG.appendChild(badge(1310, 170, fmtU(b.prx, 'dBm', 1), b.status, { size: 18 }));
  dynG.appendChild(badge(540, 34, `PIRE ${fmtU(b.eirpEf, 'dBm', 1)}`, 'level', { size: 15 }));
  if (mis(res.tx.mis)) dynG.appendChild(badge(X.antTx + 34, 178, `desalineació ${fmtU(-res.tx.mis, 'dB', 1)}`, 'mis', { size: 14, anchor: 'start' }));
  if (mis(res.rx.mis)) dynG.appendChild(badge(X.antRx - 34, 178, `desalineació ${fmtU(-res.rx.mis, 'dB', 1)}`, 'mis', { size: 14, anchor: 'end' }));
  if (b.obsLoss > 0.05) dynG.appendChild(badge(735, 72, `obstacles (difracció) ${fmtU(-b.obsLoss, 'dB', 1)}`, 'obs', { size: 14 }));
  // Cota de distància
  const yD = 264;
  dynG.appendChild(s('line', { class: 'dim', x1: X.spaceA + 30, y1: yD, x2: X.spaceB - 30, y2: yD }));
  dynG.appendChild(s('polygon', { class: 'dim-head', points: `${X.spaceA + 30},${yD} ${X.spaceA + 40},${yD - 5} ${X.spaceA + 40},${yD + 5}` }));
  dynG.appendChild(s('polygon', { class: 'dim-head', points: `${X.spaceB - 30},${yD} ${X.spaceB - 40},${yD - 5} ${X.spaceB - 40},${yD + 5}` }));
  dynG.appendChild(badge(700, yD, `d = ${fmtDist(state.dKm)}  ·  f = ${fmtFreq(state.fGHz)}`, 'neutral', { size: 15 }));

  renderLevels(state, res);
}

function renderLevels(state, res) {
  clear(levelG);
  const b = res.budget;
  const st = b.steps;
  const lvl = Object.fromEntries(st.map((x) => [x.id, x.level]));
  const values = [state.ptx, lvl.cableTx, lvl.antTx, lvl.misTx, lvl.fspl, lvl.obst, lvl.antRx, b.prx, state.sens, state.sens + state.minMargin];
  const step = niceStep(Math.max(...values) - Math.min(...values) + 20, 7);
  const yMax = Math.ceil((Math.max(...values) + 8) / step) * step;
  const yMin = Math.floor((Math.min(...values) - 14) / step) * step;
  const Y = (v) => LV.bottom - ((v - yMin) / (yMax - yMin)) * (LV.bottom - LV.top);
  const x0 = LV.axisX, x1 = 1380;

  levelG.appendChild(s('text', { class: 'chart-title', x: 20, y: LV.top - 16, text: 'Nivell del senyal al llarg de l\'enllaç (dBm)' }));
  // Zones de sensibilitat i marge
  const ySens = Y(state.sens);
  const yMarg = Y(state.sens + state.minMargin);
  levelG.appendChild(s('rect', { class: 'zone-fail', x: x0, y: ySens, width: x1 - x0, height: Math.max(0, LV.bottom - ySens) }));
  levelG.appendChild(s('rect', { class: 'zone-low', x: x0, y: yMarg, width: x1 - x0, height: Math.max(0, ySens - yMarg) }));
  for (let v = yMin; v <= yMax + 1e-9; v += step) {
    const y = Y(v);
    levelG.appendChild(s('line', { class: 'grid', x1: x0, y1: y, x2: x1, y2: y }));
    levelG.appendChild(s('text', { class: 'axis-label', x: x0 - 8, y: y + 4, 'text-anchor': 'end', text: fmt(v, 0) }));
  }
  levelG.appendChild(s('line', { class: 'sens-line', x1: x0, y1: ySens, x2: x1, y2: ySens }));
  levelG.appendChild(s('text', { class: 'sens-label', x: x0 + 8, y: ySens + 17, text: `Sensibilitat ${fmtU(state.sens, 'dBm', 1)}` }));
  if (state.minMargin > 0) levelG.appendChild(s('text', { class: 'margin-label', x: x0 + 8, y: yMarg - 7, text: `Sensibilitat + marge mínim (${fmtU(state.minMargin, 'dB', 0)})` }));

  // Línia de nivell
  const pts = [];
  pts.push([X.txOut, state.ptx], [X.cableTxEnd, lvl.cableTx], [X.antTx, lvl.cableTx], [X.antTx, lvl.antTx]);
  pts.push([X.misTx, lvl.antTx], [X.misTx, lvl.misTx], [X.spaceA, lvl.misTx]);
  const N = 90;
  for (let i = 1; i <= N; i++) {
    const t = (i / N) ** 3;
    const lv = Math.min(lvl.misTx, lvl.fspl - 20 * Math.log10(Math.max(t, 1e-6)));
    pts.push([X.spaceA + t * (X.spaceB - X.spaceA), lv]);
  }
  pts.push([X.obs, lvl.fspl], [X.obs, lvl.obst], [X.antRx, lvl.obst], [X.antRx, lvl.antRx], [X.misRx, lvl.antRx], [X.misRx, lvl.misRx], [X.cableRxA, lvl.misRx], [X.cableRxB, lvl.cableRx], [X.rx, b.prx]);
  const P = pts.map(([x, v]) => [x, Y(v)]);
  levelG.appendChild(s('path', { class: 'level-line', d: pathFromPoints(P) }));

  // Variacions (dB)
  const yMid = (a, c) => (Y(a) + Y(c)) / 2;
  const addDelta = (x, y, txt, kind, anchor) => levelG.appendChild(badge(x, y, txt, kind, { size: 14, anchor, cls: 'delta' }));
  levelG.appendChild(vArrow(X.cableTxEnd + 14, Y(state.ptx), Y(lvl.cableTx), 'arr-loss'));
  addDelta(240, Y(state.ptx) + 24, fmtU(-res.ltx, 'dB', 1), 'loss');
  levelG.appendChild(vArrow(X.antTx, Y(lvl.cableTx), Y(lvl.antTx), 'arr-gain'));
  addDelta(X.antTx - 10, yMid(lvl.cableTx, lvl.antTx), fmtU(res.tx.gNom, 'dBi', 1, { sign: true }), 'gain', 'end');
  if (res.tx.mis > 0.05) {
    levelG.appendChild(vArrow(X.misTx, Y(lvl.antTx), Y(lvl.misTx), 'arr-mis'));
    addDelta(X.misTx + 10, yMid(lvl.antTx, lvl.misTx) + 14, fmtU(-res.tx.mis, 'dB', 1), 'mis', 'start');
  }
  levelG.appendChild(vArrow(X.spaceB - 14, Y(lvl.misTx), Y(lvl.fspl), 'arr-loss dashed'));
  addDelta(X.spaceB - 26, yMid(lvl.misTx, lvl.fspl), `FSPL ${fmtU(-b.fspl, 'dB', 1)}`, 'loss', 'end');
  if (b.obsLoss > 0.05) {
    levelG.appendChild(vArrow(X.obs, Y(lvl.fspl), Y(lvl.obst), 'arr-obs'));
    addDelta(X.obs - 10, yMid(lvl.fspl, lvl.obst), `obstacles ${fmtU(-b.obsLoss, 'dB', 1)}`, 'obs', 'end');
  }
  levelG.appendChild(vArrow(X.antRx, Y(lvl.obst), Y(lvl.antRx), 'arr-gain'));
  if (b.obsLoss > 0.05 && res.rx.mis <= 0.05) addDelta(X.antRx + 10, yMid(lvl.obst, lvl.antRx) - 4, fmtU(res.rx.gNom, 'dBi', 1, { sign: true }), 'gain', 'start');
  else addDelta(X.antRx - 10, yMid(lvl.obst, lvl.antRx) - 4, fmtU(res.rx.gNom, 'dBi', 1, { sign: true }), 'gain', 'end');
  if (res.rx.mis > 0.05) {
    levelG.appendChild(vArrow(X.misRx, Y(lvl.antRx), Y(lvl.misRx), 'arr-mis'));
    addDelta(X.misRx + 10, yMid(lvl.antRx, lvl.misRx) - 14, fmtU(-res.rx.mis, 'dB', 1), 'mis', 'start');
  }
  levelG.appendChild(vArrow(X.cableRxB + 14, Y(lvl.misRx), Y(b.prx), 'arr-loss'));
  addDelta(1150, Y(lvl.misRx) + 24, fmtU(-res.lrx, 'dB', 1), 'loss');

  // Nivells absoluts (dBm)
  const dot = (x, v, cls = '') => levelG.appendChild(s('circle', { class: `lv-dot ${cls}`, cx: x, cy: Y(v), r: 5 }));
  dot(X.txOut, state.ptx); dot(X.spaceA, lvl.misTx); dot(X.antRx, lvl.obst); dot(X.rx, b.prx, b.status);
  levelG.appendChild(badge(X.txOut + 4, Y(state.ptx) - 20, fmtU(state.ptx, 'dBm', 1), 'level', { size: 15, anchor: 'start' }));
  levelG.appendChild(badge(X.spaceA + 30, Y(lvl.misTx) - 20, `PIRE ${fmtU(lvl.misTx, 'dBm', 1)}`, 'level', { size: 15, anchor: 'start' }));
  levelG.appendChild(badge(X.antRx - 46, Y(lvl.obst) + 24, fmtU(lvl.obst, 'dBm', 1), 'level', { size: 15, anchor: 'end' }));
  levelG.appendChild(badge(X.rx + 20, Y(b.prx) - 22, fmtU(b.prx, 'dBm', 1), b.status, { size: 16, anchor: 'end' }));
}

// Animació de fronts d'ona: cridada a cada fotograma.
const WAVE_N = 9;
let waveEls = [];
export function animateLinkDiagram(t, reduced) {
  if (!wavesG) return;
  if (waveEls.length === 0) {
    for (let i = 0; i < WAVE_N; i++) {
      const p = s('path', { class: 'wave' });
      wavesG.appendChild(p);
      waveEls.push(p);
    }
    wavesG.appendChild(s('path', { class: 'beam-axis' }));
  }
  const cx = X.antTx + 22, cy = DISH_Y;
  const span = X.antRx - X.antTx - 40;
  const speed = reduced ? 0 : 0.09; // px/ms
  for (let i = 0; i < WAVE_N; i++) {
    const r = 18 + (((t * speed) + (i * span) / WAVE_N) % span);
    // Amplada angular: comença amb l'obertura de l'antena TX i s'obre lleugerament.
    const half = (txSpread / 2) * (Math.PI / 180) * (1 + r / span * 0.15);
    const dir = txTilt * (Math.PI / 180);
    const a0 = dir - half, a1 = dir + half;
    const p1 = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)];
    const p2 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
    const d = `M${p1[0].toFixed(1)},${p1[1].toFixed(1)} A${r.toFixed(1)},${r.toFixed(1)} 0 0 1 ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    waveEls[i].setAttribute('d', d);
    // Densitat de potència decreixent amb la distància (representació conceptual).
    const op = clamp((70 / r) ** 0.85, 0.14, 0.95) * intensity;
    waveEls[i].setAttribute('stroke-opacity', op.toFixed(3));
    waveEls[i].setAttribute('stroke-width', (1.5 + 3.5 * clamp(60 / r, 0, 1)).toFixed(2));
  }
  wavesG.lastChild.setAttribute('d', `M${cx},${cy} L${cx + span * Math.cos(txTilt * Math.PI / 180)},${cy + span * Math.sin(txTilt * Math.PI / 180)}`);
}
