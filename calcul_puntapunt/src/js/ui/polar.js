// Diagrama polar de radiació (pla horitzontal o vertical) amb la direcció de l'altre extrem.

import { s, clear, pathFromPoints } from './dom.js';
import { fmt, fmtU } from '../engine/format.js';

const SIZE = 360, C = 180, R = 128, RANGE = 40;
const DEG = Math.PI / 180;

const pt = (angDeg, r) => [C + r * Math.cos(angDeg * DEG), C - r * Math.sin(angDeg * DEG)];
const rOf = (rel) => R * Math.max(0, 1 + rel / RANGE);

// o: { gainAt(angle) → dBi, gMax, bore, bw, other, gEf, side, plane, otherLabel }
export function renderPolar(svg, o) {
  clear(svg);
  svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE + 34}`);
  const g = s('g');
  for (const rel of [0, -10, -20, -30]) {
    g.appendChild(s('circle', { class: 'p-ring', cx: C, cy: C, r: rOf(rel) }));
    const [lx, ly] = pt(105, rOf(rel));
    g.appendChild(s('text', { class: 'p-ring-label', x: lx + 3, y: ly - 3, text: `${fmt(rel, 0)} dB` }));
  }
  g.appendChild(s('circle', { class: 'p-ring-3', cx: C, cy: C, r: rOf(-3) }));
  for (let a = 0; a < 360; a += 30) {
    const [x1, y1] = pt(a, R);
    g.appendChild(s('line', { class: 'p-spoke', x1: C, y1: C, x2: x1, y2: y1 }));
    const [tx, ty] = pt(a, R + 16);
    g.appendChild(s('text', { class: 'p-angle', x: tx, y: ty + 4, 'text-anchor': 'middle', text: `${a}°` }));
  }
  svg.appendChild(g);

  // Sector −3 dB al voltant de l'eix principal
  if (o.bw && o.bw < 300) {
    const a0 = o.bore - o.bw / 2, a1 = o.bore + o.bw / 2;
    const p0 = pt(a0, R), p1 = pt(a1, R);
    svg.appendChild(s('path', { class: `p-sector ${o.side}`, d: `M${C},${C} L${p0[0]},${p0[1]} A${R},${R} 0 ${o.bw > 180 ? 1 : 0} 0 ${p1[0]},${p1[1]} Z` }));
    for (const a of [a0, a1]) {
      const [x, y] = pt(a, R);
      svg.appendChild(s('line', { class: 'p-3db', x1: C, y1: C, x2: x, y2: y }));
    }
    const [lx, ly] = pt(a1 + 4, R + 2);
    svg.appendChild(s('text', { class: 'p-3db-label', x: lx, y: ly, 'text-anchor': 'middle', text: '−3 dB' }));
  }

  // Corba del diagrama
  const pts = [];
  for (let i = 0; i <= 720; i++) {
    const a = i / 2;
    pts.push(pt(a, rOf(o.gainAt(a) - o.gMax)));
  }
  svg.appendChild(s('path', { class: `p-pattern ${o.side}`, d: pathFromPoints(pts, true) }));

  // Eix principal
  if (o.bore !== null) {
    const [bx, by] = pt(o.bore, R);
    svg.appendChild(s('line', { class: `p-bore ${o.side}`, x1: C, y1: C, x2: bx, y2: by }));
    svg.appendChild(s('circle', { class: `p-bore-dot ${o.side}`, cx: bx, cy: by, r: 4 }));
  }
  // Direcció cap a l'altre extrem i guany efectiu
  const [ox, oy] = pt(o.other, R + 4);
  svg.appendChild(s('line', { class: 'p-other', x1: C, y1: C, x2: ox, y2: oy }));
  const [mx, my] = pt(o.other, rOf(o.gEf - o.gMax));
  svg.appendChild(s('circle', { class: 'p-mark', cx: mx, cy: my, r: 6 }));

  svg.appendChild(s('circle', { class: 'p-center', cx: C, cy: C, r: 3 }));
  const loss = o.gMax - o.gEf;
  svg.appendChild(s('text', { class: 'p-foot', x: C, y: SIZE + 12, 'text-anchor': 'middle', text: `G màx ${fmtU(o.gMax, 'dBi', 1)} · G efectiu ${fmtU(o.gEf, 'dBi', 1)}` }));
  svg.appendChild(s('text', { class: `p-foot2 ${loss < 0.5 ? 'ok' : loss < 3 ? 'low' : 'fail'}`, x: C, y: SIZE + 29, 'text-anchor': 'middle', text: `Pèrdua en aquesta direcció: ${fmtU(-loss, 'dB', 2)}` }));
}
