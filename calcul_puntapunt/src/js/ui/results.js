// Quadre de resultats del balanç i indicador de potència rebuda vs. sensibilitat.

import { h, s, clear, clamp } from './dom.js';
import { fmt, fmtU } from '../engine/format.js';
import { STATUS_INFO } from '../engine/linkBudget.js';
import { helpIcon } from './glossary.js';
import { niceStep } from './svgkit.js';

function tile(label, help, cls = '') {
  const val = h('div', { class: 'tile-value' });
  const el = h('div', { class: `tile ${cls}` }, h('div', { class: 'tile-label' }, label, help ? helpIcon(help) : null), val);
  return { el, val };
}

export function createResults(root) {
  const prx = tile('Potència rebuda', 'dBm', 'big');
  const marg = tile('Marge de recepció', 'marge', 'big');
  const fspl = tile('FSPL', 'FSPL');
  const sens = tile('Sensibilitat RX', 'sensibilitat');
  const eirp = tile('PIRE', 'PIRE');
  const status = h('div', { class: 'status' });
  const gaugeSvg = s('svg', { viewBox: '0 0 150 300', class: 'gauge', role: 'img', 'aria-label': 'Indicador de potència rebuda respecte de la sensibilitat' });
  const note = h('p', { class: 'fine' }, 'Model ideal d\'espai lliure: superar la sensibilitat no garanteix que l\'enllaç funcioni en condicions reals (obstacles, pluja, multitrajecte…).');
  root.append(
    h('div', { class: 'card-head' }, h('h2', { text: 'Resultats del balanç' })),
    h('div', { class: 'results-body' },
      h('div', { class: 'results-main' },
        h('div', { class: 'tiles-big' }, prx.el, marg.el),
        status,
        h('div', { class: 'tiles-small' }, fspl.el, eirp.el, sens.el)),
      h('div', { class: 'gauge-wrap' }, gaugeSvg)),
    note);

  return function render(state, res) {
    const b = res.budget;
    prx.val.innerHTML = `${fmt(b.prx, 2)}<small> dBm</small>`;
    prx.el.dataset.status = b.status;
    marg.val.innerHTML = `${fmt(b.margin, 2, { sign: true })}<small> dB</small>`;
    marg.el.dataset.status = b.status;
    fspl.val.innerHTML = `${fmt(b.fspl, 2)}<small> dB</small>`;
    sens.val.innerHTML = `${fmt(state.sens, 1)}<small> dBm</small>`;
    const mis = res.tx.mis + res.rx.mis > 0.005;
    eirp.val.innerHTML = `${fmt(b.eirp, 2)}<small> dBm</small>`;
    eirp.el.title = mis ? `PIRE en la direcció del receptor: ${fmtU(b.eirpEf, 'dBm', 2)}` : '';
    const info = STATUS_INFO[b.status];
    status.className = `status status-${b.status}`;
    clear(status).append(
      h('span', { class: 'status-dot' }),
      h('div', {}, h('strong', { text: info.titol }), h('p', { text: `${info.text} Marge mínim desitjat: ${fmtU(state.minMargin, 'dB', 1)}.` })));
    renderGauge(gaugeSvg, state, b);
  };
}

function renderGauge(svg, state, b) {
  clear(svg);
  const top = 22, bottom = 282, x = 64, w = 26;
  const lo = Math.min(state.sens - 25, b.prx - 8);
  const hi = Math.max(state.sens + state.minMargin + 25, b.prx + 8);
  const step = niceStep(hi - lo, 6);
  const vMin = Math.floor(lo / step) * step;
  const vMax = Math.ceil(hi / step) * step;
  const Y = (v) => bottom - ((v - vMin) / (vMax - vMin)) * (bottom - top);
  svg.appendChild(s('text', { class: 'gauge-title', x: 75, y: 12, 'text-anchor': 'middle', text: 'PRX (dBm)' }));
  const ySens = Y(state.sens), yM = Y(state.sens + state.minMargin);
  svg.appendChild(s('rect', { class: 'g-fail', x, y: ySens, width: w, height: bottom - ySens }));
  svg.appendChild(s('rect', { class: 'g-low', x, y: yM, width: w, height: ySens - yM }));
  svg.appendChild(s('rect', { class: 'g-ok', x, y: top, width: w, height: yM - top }));
  svg.appendChild(s('rect', { class: 'g-frame', x, y: top, width: w, height: bottom - top, rx: 3 }));
  for (let v = vMin; v <= vMax + 1e-9; v += step) {
    svg.appendChild(s('line', { class: 'g-tick', x1: x - 5, y1: Y(v), x2: x, y2: Y(v) }));
    svg.appendChild(s('text', { class: 'g-axis', x: x - 8, y: Y(v) + 4, 'text-anchor': 'end', text: fmt(v, 0) }));
  }
  svg.appendChild(s('line', { class: 'g-sens', x1: x - 4, y1: ySens, x2: x + w + 4, y2: ySens }));
  svg.appendChild(s('text', { class: 'g-sens-label', x: x + w + 6, y: ySens + 4, text: 'S' }));
  const yP = clamp(Y(b.prx), top, bottom);
  const m = s('g', { class: `g-marker ${b.status}`, style: `transform: translateY(${yP.toFixed(1)}px)` });
  m.appendChild(s('polygon', { points: `${x + w + 2},0 ${x + w + 14},-8 ${x + w + 14},8` }));
  m.appendChild(s('line', { x1: x - 2, y1: 0, x2: x + w + 2, y2: 0 }));
  svg.appendChild(m);
  if (b.margin > 0) {
    svg.appendChild(s('line', { class: 'g-margin', x1: x + w + 30, y1: ySens, x2: x + w + 30, y2: yP }));
    svg.appendChild(s('text', { class: 'g-margin-label', x: x + w + 34, y: (ySens + yP) / 2 + 4, text: 'M' }));
  }
}
