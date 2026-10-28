// Simulador 2: taula de guanys nominals i efectius i indicadors d'alineació.

import { h, clear } from './dom.js';
import { fmt, fmtU } from '../engine/format.js';
import { alignmentLevel } from '../engine/model.js';
import { STATUS_INFO } from '../engine/linkBudget.js';
import { helpIcon } from './glossary.js';

const ALIGN_TXT = { ok: 'Ben alineada', low: 'Lleugerament desalineada', fail: 'Desalineada' };
const ALIGN_LINK = { ok: 'Enllaç ben alineat', low: 'Alineació millorable', fail: 'Enllaç desalineat' };

function meter(label, mis) {
  const lvl = alignmentLevel(mis);
  const pct = Math.max(0, Math.min(100, 100 - (mis / 30) * 100));
  return h('div', { class: `align-meter ${lvl}` },
    h('div', { class: 'align-head' }, h('span', { text: label }), h('strong', { text: ALIGN_TXT[lvl] })),
    h('div', { class: 'align-track' }, h('div', { class: 'align-fill', style: { width: `${pct}%` } })),
    h('div', { class: 'align-foot' }, h('span', { text: `Pèrdua per desalineació: ${fmtU(mis, 'dB', 2)}` })));
}

export function createOrientResults(root) {
  const body = h('div');
  root.append(h('div', { class: 'card-head' }, h('h2', { text: 'Guanys efectius i balanç' })), body);
  return function render(state, res) {
    const b = res.budget;
    const row = (name, val, unit, help, cls = '') => h('tr', { class: cls }, h('th', {}, name, help ? helpIcon(help) : null), h('td', { text: fmtU(val, unit, 2) }));
    const tbl = h('table', { class: 'res-table' }, h('tbody', {},
      row('Guany nominal TX', res.tx.gNom, 'dBi', 'dBi'),
      row('Guany efectiu TX', res.tx.gEf, 'dBi', 'guanyEf', 'em'),
      row('Pèrdua per desalineació TX', res.tx.mis, 'dB', null, res.tx.mis > 0.005 ? 'warn' : ''),
      row('Guany nominal RX', res.rx.gNom, 'dBi'),
      row('Guany efectiu RX', res.rx.gEf, 'dBi', null, 'em'),
      row('Pèrdua per desalineació RX', res.rx.mis, 'dB', null, res.rx.mis > 0.005 ? 'warn' : ''),
      row('FSPL (no depèn de l\'orientació)', b.fspl, 'dB', 'FSPL'),
      row('Potència rebuda', b.prx, 'dBm', 'dBm', `big ${b.status}`),
      row('Marge de recepció', b.margin, 'dB', 'marge', `big ${b.status}`)));
    const tot = res.tx.mis + res.rx.mis;
    const glob = alignmentLevel(tot);
    clear(body).append(
      tbl,
      h('div', { class: 'align-grid' }, meter('Antena TX', res.tx.mis), meter('Antena RX', res.rx.mis)),
      h('div', { class: `align-global ${glob}` },
        h('span', { class: 'status-dot' }),
        h('div', {}, h('strong', { text: `${ALIGN_LINK[glob]} · pèrdua total ${fmtU(tot, 'dB', 2)}` }),
          h('p', { text: `${STATUS_INFO[b.status].titol}. Marge ${fmt(b.margin, 1, { sign: true })} dB (mínim desitjat ${fmt(state.minMargin, 1)} dB).` }))));
  };
}
