// Comparació entre una configuració de referència i la configuració actual.

import { h, s, clear } from './dom.js';
import { fmt, fmtU } from '../engine/format.js';
import { getUi, setUi, getState, getResult, replaceState } from '../state.js';
import { niceStep } from './svgkit.js';
import { cloneState } from '../engine/model.js';
import { toast } from './toasts.js';

export function saveReference(label) {
  setUi({ reference: { state: cloneState(getState()), result: getResult(), label: label || 'Configuració desada' } });
}

export function createCompare(root) {
  const body = h('div', { class: 'compare-body' });
  const btnSave = h('button', { class: 'btn', type: 'button', text: 'Desar com a referència', onclick: () => {
    saveReference();
    toast({ level: 'info', title: 'Referència desada', lines: ['Modifica els paràmetres i compara els resultats amb aquesta configuració.'] });
  } });
  const btnRestore = h('button', { class: 'btn ghost', type: 'button', text: 'Recuperar', title: 'Torna a carregar la configuració de referència', onclick: () => {
    const r = getUi().reference;
    if (r) replaceState(r.state, 'scenario');
  } });
  const btnClear = h('button', { class: 'btn ghost', type: 'button', text: 'Esborrar', onclick: () => setUi({ reference: null }) });
  root.append(
    h('div', { class: 'card-head' }, h('h2', { text: 'Comparació de configuracions' }), h('div', { class: 'head-actions' }, btnSave)),
    body,
    h('div', { class: 'compare-actions' }, btnRestore, btnClear));

  return function render(state, res) {
    const ref = getUi().reference;
    btnRestore.hidden = !ref;
    btnClear.hidden = !ref;
    clear(body);
    if (!ref) {
      body.append(h('p', { class: 'empty' }, 'Desa la configuració actual com a referència i després canvia algun paràmetre (per exemple, antenes de 15 dBi per antenes de 25 dBi). Aquí veuràs les diferències.'));
      return;
    }
    const a = ref.result, bRes = res;
    const rows = [
      ['Potència rebuda', a.budget.prx, bRes.budget.prx, 'dBm', 'dB'],
      ['FSPL', a.budget.fspl, bRes.budget.fspl, 'dB', 'dB'],
      ['Marge de recepció', a.budget.margin, bRes.budget.margin, 'dB', 'dB'],
      ['Guany efectiu TX', a.tx.gEf, bRes.tx.gEf, 'dBi', 'dB'],
      ['Guany efectiu RX', a.rx.gEf, bRes.rx.gEf, 'dBi', 'dB'],
      ['PIRE cap al receptor', a.budget.eirpEf, bRes.budget.eirpEf, 'dBm', 'dB'],
    ];
    const tbl = h('table', { class: 'cmp-table' },
      h('thead', {}, h('tr', {}, h('th', { text: '' }), h('th', { text: 'Referència' }), h('th', { text: 'Actual' }), h('th', { text: 'Variació' }))),
      h('tbody', {}, rows.map(([name, va, vb, u, du]) => {
        const d = vb - va;
        // Per a la FSPL, un augment és desfavorable.
        const good = name === 'FSPL' ? d < -0.005 : d > 0.005;
        const bad = name === 'FSPL' ? d > 0.005 : d < -0.005;
        return h('tr', {},
          h('th', { text: name }),
          h('td', { text: fmtU(va, u, 2) }),
          h('td', { text: fmtU(vb, u, 2) }),
          h('td', { class: good ? 'pos' : bad ? 'neg' : '', text: Math.abs(d) < 0.005 ? '=' : fmtU(d, du, 2, { sign: true }) }));
      })));
    body.append(ref.label ? h('p', { class: 'ref-label' }, h('span', { text: 'Referència: ' }), h('strong', { text: ref.label })) : null, renderBars(state, a, bRes), tbl);
  };
}

function renderBars(state, a, b) {
  const W = 420, H = 92;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'cmp-bars', role: 'img', 'aria-label': 'Comparació de la potència rebuda' });
  const vals = [a.budget.prx, b.budget.prx, state.sens, a.budget.prx > 0 ? 0 : a.budget.prx];
  const st = niceStep(Math.max(...vals) - Math.min(...vals) + 20, 5);
  const lo = Math.floor((Math.min(...vals) - 10) / st) * st;
  const hi = Math.ceil((Math.max(...vals) + 5) / st) * st;
  const X = (v) => 90 + ((v - lo) / (hi - lo)) * (W - 110);
  [['Referència', a, 14], ['Actual', b, 44]].forEach(([lbl, r, y]) => {
    svg.appendChild(s('text', { class: 'axis-label', x: 82, y: y + 15, 'text-anchor': 'end', text: lbl }));
    svg.appendChild(s('rect', { class: `cmp-bar ${r.budget.status}`, x: X(lo), y, width: Math.max(2, X(r.budget.prx) - X(lo)), height: 22, rx: 4 }));
    svg.appendChild(s('text', { class: 'cmp-val', x: Math.max(X(r.budget.prx) - 6, X(lo) + 64), y: y + 15, 'text-anchor': 'end', text: fmtU(r.budget.prx, 'dBm', 1) }));
  });
  svg.appendChild(s('line', { class: 'sens-line', x1: X(state.sens), y1: 8, x2: X(state.sens), y2: 72 }));
  svg.appendChild(s('text', { class: 'sens-label', x: X(state.sens), y: 86, 'text-anchor': 'middle', text: `S ${fmt(state.sens, 0)} dBm` }));
  return svg;
}
