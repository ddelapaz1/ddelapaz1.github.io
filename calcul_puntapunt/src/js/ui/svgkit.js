// Peces SVG reutilitzables: etiquetes (badges), fletxes i escales.

import { s } from './dom.js';

export function textWidth(str, size = 14) {
  let w = 0;
  for (const ch of str) w += /[\s,.·]/.test(ch) ? 0.32 : /[−+–]/.test(ch) ? 0.62 : /[A-ZÀ-Ý]/.test(ch) ? 0.66 : 0.56;
  return w * size;
}

// kind: level | gain | loss | mis | neutral | ok | low | fail
export function badge(x, y, text, kind = 'neutral', opts = {}) {
  const size = opts.size || 14;
  const padX = opts.padX ?? 9;
  const w = textWidth(text, size) + padX * 2;
  const hgt = size + 12;
  let x0 = x - w / 2;
  if (opts.anchor === 'start') x0 = x;
  if (opts.anchor === 'end') x0 = x - w;
  const g = s('g', { class: `badge b-${kind}${opts.cls ? ` ${opts.cls}` : ''}` });
  g.appendChild(s('rect', { x: x0, y: y - hgt / 2, width: w, height: hgt, rx: hgt / 2 }));
  g.appendChild(s('text', { x: x0 + w / 2, y: y + size * 0.36, 'text-anchor': 'middle', 'font-size': size, text }));
  return g;
}

export function arrowHead(x, y, dir, size = 7, cls = '') {
  // dir: 'up' | 'down' | 'left' | 'right'
  const pts = {
    up: [[x, y], [x - size * 0.7, y + size], [x + size * 0.7, y + size]],
    down: [[x, y], [x - size * 0.7, y - size], [x + size * 0.7, y - size]],
    right: [[x, y], [x - size, y - size * 0.7], [x - size, y + size * 0.7]],
    left: [[x, y], [x + size, y - size * 0.7], [x + size, y + size * 0.7]],
  }[dir];
  return s('polygon', { points: pts.map((p) => p.join(',')).join(' '), class: cls });
}

export function vArrow(x, y1, y2, cls) {
  const g = s('g', { class: cls });
  const dir = y2 < y1 ? 'up' : 'down';
  const tip = y2;
  const back = dir === 'up' ? tip + 7 : tip - 7;
  if (Math.abs(y2 - y1) > 8) g.appendChild(s('line', { x1: x, y1, x2: x, y2: back }));
  g.appendChild(arrowHead(x, tip, dir, 7));
  return g;
}

export function niceStep(range, target = 6) {
  const raw = range / target;
  const p = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}

// Icona petita de l'antena orientada cap a +x (per a la vista en planta i la lateral).
export function antennaIcon(family, view = 'plan') {
  const g = s('g');
  if (family === 'omni') {
    if (view === 'plan') g.appendChild(s('circle', { class: 'ant-body', cx: 0, cy: 0, r: 6 }));
    else g.appendChild(s('rect', { class: 'ant-body', x: -4, y: -24, width: 8, height: 34, rx: 4 }));
    return g;
  }
  if (family === 'parabolica') g.appendChild(s('path', { class: 'ant-body', d: 'M-2,-15 Q12,0 -2,15 L-6,15 Q6,0 -6,-15 Z' }));
  else if (family === 'panell') g.appendChild(s('rect', { class: 'ant-body', x: -3, y: -13, width: 8, height: 26, rx: 2 }));
  else g.appendChild(s('path', { class: 'ant-body yagi', d: 'M-12,0 L16,0 M-8,-9 L-8,9 M-1,-7 L-1,7 M6,-6 L6,6 M12,-5 L12,5' }));
  g.appendChild(s('path', { class: 'ant-arrow', d: 'M20,0 L13,-4 L13,4 Z' }));
  return g;
}
