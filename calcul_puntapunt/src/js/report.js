// Informe en PDF de l'enllaç: formulari de l'alumne, comprovacions de viabilitat i document A4.

import { h, s, clear } from './ui/dom.js';
import { getState, getResult, refresh } from './state.js';
import { fmt, fmtU, fmtDist, fmtFreq } from './engine/format.js';
import { STATUS_INFO } from './engine/linkBudget.js';
import { LOS_INFO, K_OPTIONS, requiredHeight } from './engine/fresnel.js';
import { FAMILIES, presetFor } from './engine/antennas.js';
import { bearingDeg, compassPoint } from './engine/geo.js';
import { profileInput, pathValid, groundEnds } from './engine/model.js';
import { renderLinkDiagram } from './ui/linkDiagram.js';
import { renderWaterfall } from './ui/charts.js';
import { renderPolar } from './ui/polar.js';
import { polarOptions } from './ui/polarConfig.js';
import { renderProfileView } from './ui/profileView.js';
import { renderPlanView } from './ui/planView.js';
import { svgToPng } from './ui/svgExport.js';
import { staticMap } from './ui/mapImage.js';
import { configUrl, encodeConfig } from './share.js';
import { toast } from './ui/toasts.js';

// Paràmetres de l'activitat «Enllaç Wi-Fi 5 GHz»
export const ACTIVITY = {
  titol: 'Enllaç Wi-Fi 5 GHz',
  fGHz: 5.5,
  minDistKm: 5,
  // Límit de PIRE de referència a la banda 5470–5725 MHz (ETSI EN 301 893, amb TPC i DFS).
  eirpLimitDbm: 30,
  band: [5.47, 5.725],
  enunciat: 'https://ddelapaz1.github.io/calcul_puntapunt/activitat/enunciat-enllac-wifi-5ghz.pdf',
};

const STORE_KEY = 'enllac-informe-v1';
const FIELDS = ['nom', 'cognoms', 'grup', 'titol', 'antTxModel', 'antTxGain', 'antTxUrl', 'sameAnt', 'antRxModel', 'antRxGain', 'antRxUrl',
  'radioModel', 'radioPtx', 'radioSens', 'radioMod', 'radioUrl', 'conclusions'];

const num = (v) => {
  const x = Number(String(v ?? '').trim().replace(/[−–]/g, '-').replace(',', '.'));
  return String(v ?? '').trim() === '' || !Number.isFinite(x) ? null : x;
};

// ---------- Comprovacions ----------
// Cada comprovació: { id, grup, text, valor, estat: 'ok' | 'warn' | 'fail' | 'pending' }
export function computeChecks(state, res, eq = {}) {
  const b = res.budget;
  const f = res.fresnel;
  const real = pathValid(state) && state.path.a;
  const checks = [];
  const add = (grup, text, valor, estat) => checks.push({ grup, text, valor, estat });
  add('Activitat', `Freqüència central de ${fmt(ACTIVITY.fGHz, 1)} GHz`, fmtFreq(state.fGHz), Math.abs(state.fGHz - ACTIVITY.fGHz) < 0.005 ? 'ok' : 'fail');
  add('Activitat', 'Perfil real obtingut del mapa', !pathValid(state) ? 'Sense perfil' : real ? 'Sí' : 'Terreny d\'exemple', real ? 'ok' : 'fail');
  add('Activitat', `Distància igual o superior a ${ACTIVITY.minDistKm} km`, fmtDist(state.dKm), state.dKm >= ACTIVITY.minDistKm ? 'ok' : 'fail');
  if (f) {
    add('Viabilitat', 'Visió directa entre antenes', LOS_INFO[f.status].curt, f.status === 'blocked' ? 'fail' : 'ok');
    add('Viabilitat', `${fmt(state.req * 100, 0)} % de la 1a zona de Fresnel lliure`, `${fmt(f.minRatio * 100, 0)} % (marge ${fmtU(f.minClearance, 'm', 1)})`,
      f.status === 'clear' ? 'ok' : f.status === 'partial' ? 'warn' : 'fail');
  } else {
    add('Viabilitat', 'Visió directa i zona de Fresnel', 'No avaluat', 'pending');
  }
  add('Viabilitat', `Marge de recepció ≥ ${fmt(state.minMargin, 1)} dB`, fmtU(b.margin, 'dB', 1), b.margin >= state.minMargin ? 'ok' : b.margin >= 0 ? 'warn' : 'fail');
  const inBand = state.fGHz >= ACTIVITY.band[0] && state.fGHz <= ACTIVITY.band[1];
  add('Viabilitat', inBand ? `PIRE ≤ ${ACTIVITY.eirpLimitDbm} dBm (1 W, banda 5470–5725 MHz)` : 'PIRE dins del límit legal de la banda', fmtU(b.eirp, 'dBm', 1),
    inBand ? (b.eirp <= ACTIVITY.eirpLimitDbm + 1e-9 ? 'ok' : 'fail') : 'pending');
  add('Viabilitat', 'Antenes alineades (pèrdua < 0,5 dB a cada extrem)', `TX ${fmtU(res.tx.mis, 'dB', 1)} · RX ${fmtU(res.rx.mis, 'dB', 1)}`, res.tx.mis < 0.5 && res.rx.mis < 0.5 ? 'ok' : 'warn');
  // Equips seleccionats
  const gainCheck = (lbl, model, g, cfg) => {
    if (!model || g === null) { add('Equips', `Antena ${lbl}: model i guany del full de característiques`, 'Pendent', 'pending'); return; }
    const d = g - cfg;
    add('Equips', `Antena ${lbl} (${model}): guany real coherent amb l'informe`, `${fmtU(g, 'dBi', 1)} (informe ${fmtU(cfg, 'dBi', 1)})`, Math.abs(d) <= 1 ? 'ok' : d > 1 ? 'warn' : 'fail');
  };
  gainCheck('TX', eq.antTxModel, num(eq.antTxGain), state.ant.tx.gain);
  if (eq.sameAnt) gainCheck('RX', eq.antTxModel, num(eq.antTxGain), state.ant.rx.gain);
  else gainCheck('RX', eq.antRxModel, num(eq.antRxGain), state.ant.rx.gain);
  const ptx = num(eq.radioPtx), sens = num(eq.radioSens);
  if (!eq.radioModel || ptx === null) add('Equips', 'Equip de ràdio: potència de transmissió', 'Pendent', 'pending');
  else add('Equips', `Equip ${eq.radioModel}: pot donar la potència TX de l'informe`, `màx. ${fmtU(ptx, 'dBm', 1)} (informe ${fmtU(state.ptx, 'dBm', 1)})`, ptx >= state.ptx - 1e-9 ? 'ok' : 'fail');
  if (!eq.radioModel || sens === null) add('Equips', 'Equip de ràdio: sensibilitat', 'Pendent', 'pending');
  else add('Equips', 'Sensibilitat real igual o millor que la de l\'informe', `${fmtU(sens, 'dBm', 1)} (informe ${fmtU(state.sens, 'dBm', 1)})`, sens <= state.sens + 1e-9 ? 'ok' : 'fail');
  return checks;
}

export function verdict(state, res) {
  const f = res.fresnel;
  const b = res.budget;
  if (!f) return { nivell: 'pending', titol: 'NO AVALUABLE', text: 'No hi ha cap perfil del terreny: cal situar els dos extrems al mapa.' };
  const inBand = state.fGHz >= ACTIVITY.band[0] && state.fGHz <= ACTIVITY.band[1];
  const eirpOk = !inBand || b.eirp <= ACTIVITY.eirpLimitDbm + 1e-9;
  const why = [];
  if (f.status === 'blocked') why.push('no hi ha visió directa');
  else if (f.status === 'partial') why.push('la 1a zona de Fresnel està parcialment obstruïda');
  if (b.margin < 0) why.push('la potència rebuda és inferior a la sensibilitat');
  else if (b.margin < state.minMargin) why.push('el marge de recepció és inferior al mínim desitjat');
  if (!eirpOk) why.push(`la PIRE supera el límit de ${ACTIVITY.eirpLimitDbm} dBm`);
  if (f.status === 'clear' && b.margin >= state.minMargin && eirpOk) {
    return { nivell: 'ok', titol: 'VIABLE', text: 'Hi ha visió directa amb la 1a zona de Fresnel lliure, el marge de recepció és suficient i la PIRE respecta el límit de referència.' };
  }
  if (f.status !== 'blocked' && b.margin >= 0 && eirpOk) {
    return { nivell: 'warn', titol: 'VIABLE AMB RESERVES', text: `L'enllaç pot funcionar, però ${why.join(' i ')}.` };
  }
  return { nivell: 'fail', titol: 'NO VIABLE', text: `Amb aquesta configuració, ${why.join(', ')}.` };
}

// ---------- Formulari ----------
let dialog = null;
function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { return {}; }
}
function save(v) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch { /* sense emmagatzematge */ }
}

function field(id, label, opts = {}) {
  const input = opts.textarea
    ? h('textarea', { id: `rp-${id}`, name: id, rows: opts.rows || 5, placeholder: opts.placeholder || '' })
    : h('input', { id: `rp-${id}`, name: id, type: opts.type || 'text', inputmode: opts.inputmode, placeholder: opts.placeholder || '', required: opts.required, autocomplete: opts.autocomplete || 'off' });
  return h('label', { class: `rp-field${opts.wide ? ' wide' : ''}`, for: `rp-${id}` }, h('span', {}, label, opts.required ? h('b', { class: 'req', text: ' *' }) : null), input);
}

function buildDialog() {
  const checksBox = h('div', { class: 'rp-checks' });
  const status = h('p', { class: 'rp-status', hidden: true });
  const btnGen = h('button', { class: 'btn primary', type: 'submit', text: 'Generar l\'informe PDF' });
  const form = h('form', { class: 'rp-form', method: 'dialog' },
    h('p', { class: 'rp-intro' }, 'L\'informe recull la configuració actual dels tres simuladors: ubicació i mapa, perfil d\'elevació, balanç de potències, antenes i comprovacions de viabilitat. Revisa-la abans de generar-lo. ',
      h('a', { href: ACTIVITY.enunciat, target: '_blank', rel: 'noopener', text: 'Enunciat de l\'activitat (PDF)' })),
    h('fieldset', {}, h('legend', { text: 'Alumne/a' }),
      h('div', { class: 'rp-grid' },
        field('nom', 'Nom', { required: true, autocomplete: 'given-name' }),
        field('cognoms', 'Cognoms', { required: true, autocomplete: 'family-name' }),
        field('grup', 'Grup', { placeholder: 'p. ex. 2n STI' }),
        field('titol', 'Nom de l\'enllaç', { placeholder: 'p. ex. Casa → Turó de la Rovira' }))),
    h('fieldset', {}, h('legend', { text: 'Equips seleccionats (fulls de característiques)' }),
      h('div', { class: 'rp-grid' },
        field('antTxModel', 'Antena TX: fabricant i model', { wide: true }),
        field('antTxGain', 'Guany antena TX (dBi)', { inputmode: 'decimal' }),
        field('antTxUrl', 'Enllaç al full de característiques', { type: 'url', placeholder: 'https://…' }),
        h('label', { class: 'rp-check wide' }, h('input', { type: 'checkbox', id: 'rp-sameAnt', name: 'sameAnt' }), ' Faig servir la mateixa antena a l\'extrem RX'),
        field('antRxModel', 'Antena RX: fabricant i model', { wide: true }),
        field('antRxGain', 'Guany antena RX (dBi)', { inputmode: 'decimal' }),
        field('antRxUrl', 'Enllaç al full de característiques', { type: 'url', placeholder: 'https://…' }),
        field('radioModel', 'Equip de ràdio: fabricant i model', { wide: true }),
        field('radioPtx', 'Potència TX màxima (dBm)', { inputmode: 'decimal' }),
        field('radioSens', 'Sensibilitat (dBm)', { inputmode: 'decimal' }),
        field('radioMod', 'Modulació / velocitat d\'aquesta sensibilitat', { placeholder: 'p. ex. 802.11ac MCS7, 20 MHz' }),
        field('radioUrl', 'Enllaç al full de característiques', { type: 'url', placeholder: 'https://…' }))),
    h('fieldset', {}, h('legend', { text: 'Conclusions' }),
      field('conclusions', 'Justifica si l\'enllaç és viable i quines decisions has pres (altures, antenes, potència, obstacles…)', { textarea: true, wide: true, rows: 6 })),
    h('fieldset', {}, h('legend', { text: 'Comprovacions de la configuració actual' }), checksBox),
    status,
    h('div', { class: 'rp-actions' }, h('button', { class: 'btn ghost', type: 'button', text: 'Cancel·lar', onclick: () => dialog.close() }), btnGen));

  dialog = h('dialog', { class: 'about report-dialog', id: 'report-dialog' },
    h('div', { class: 'about-head' }, h('h2', { text: 'Informe PDF de l\'enllaç' }),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Tanca', text: '×', onclick: () => dialog.close() })),
    h('div', { class: 'about-body' }, form));
  document.body.appendChild(dialog);

  const values = () => {
    const v = {};
    for (const k of FIELDS) {
      const el = form.elements[k];
      if (!el) continue;
      v[k] = el.type === 'checkbox' ? el.checked : el.value.trim();
    }
    return v;
  };
  const syncSame = () => {
    const same = form.elements.sameAnt.checked;
    for (const k of ['antRxModel', 'antRxGain', 'antRxUrl']) form.elements[k].closest('label').hidden = same;
  };
  const renderChecks = () => {
    const st = getState(), res = getResult();
    const v = values();
    clear(checksBox);
    const ul = h('ul', {});
    for (const c of computeChecks(st, res, v)) {
      ul.appendChild(h('li', { class: `ck ck-${c.estat}` }, h('span', { class: 'ck-dot' }), h('span', { class: 'ck-text', text: c.text }), h('span', { class: 'ck-val', text: c.valor })));
    }
    const vd = verdict(st, res);
    checksBox.append(h('div', { class: `rp-verdict v-${vd.nivell}` }, h('strong', { text: `Valoració: ${vd.titol}` }), h('span', { text: vd.text })), ul);
  };
  form.addEventListener('input', () => { save(values()); syncSame(); renderChecks(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = values();
    if (!v.nom || !v.cognoms) {
      status.hidden = false;
      status.className = 'rp-status error';
      status.textContent = 'Cal indicar el nom i els cognoms: s\'inclouen a l\'informe que lliuraràs.';
      (v.nom ? form.elements.cognoms : form.elements.nom).focus();
      return;
    }
    save(v);
    btnGen.disabled = true;
    status.hidden = false;
    status.className = 'rp-status loading';
    status.textContent = 'Generant l\'informe (mapa, perfil i gràfiques)…';
    try {
      const name = await generatePdf(v);
      status.className = 'rp-status ok';
      status.textContent = `S'ha descarregat «${name}». Lliura aquest fitxer a Moodle.`;
    } catch (err) {
      console.error(err);
      status.className = 'rp-status error';
      status.textContent = `No s'ha pogut generar l'informe: ${err.message}`;
    } finally {
      btnGen.disabled = false;
    }
  });
  dialog._open = () => {
    const saved = loadSaved();
    for (const k of FIELDS) {
      const el = form.elements[k];
      if (!el || saved[k] === undefined) continue;
      if (el.type === 'checkbox') el.checked = !!saved[k]; else el.value = saved[k];
    }
    status.hidden = true;
    syncSame();
    renderChecks();
    dialog.showModal();
  };
}

export function openReportDialog() {
  if (!window.jspdf) {
    toast({ level: 'warn', title: 'No es pot generar el PDF', lines: ['La biblioteca de PDF no s\'ha carregat.'] });
    return;
  }
  if (!dialog) buildDialog();
  dialog._open();
}

// ---------- Captura de les gràfiques ----------
async function captureImages(state, res) {
  const root = document.documentElement;
  const prevTheme = root.dataset.theme;
  root.dataset.theme = 'light';
  const host = h('div', { 'aria-hidden': 'true', style: { position: 'fixed', left: '-20000px', top: '0', width: '1400px' } });
  document.body.appendChild(host);
  const imgs = {};
  try {
    renderLinkDiagram(state, res);
    imgs.link = await svgToPng(document.querySelector('#link-svg-wrap svg'), 1800);
    const wf = s('svg', { class: 'chart-svg' });
    host.appendChild(wf);
    renderWaterfall(wf, state, res);
    imgs.waterfall = await svgToPng(wf, 1400);
    for (const side of ['tx', 'rx']) {
      for (const plane of ['H', 'V']) {
        const ps = s('svg', { class: 'polar-svg' });
        host.appendChild(ps);
        renderPolar(ps, polarOptions(state, res, side, plane));
        imgs[`polar-${side}-${plane}`] = await svgToPng(ps, 700);
      }
    }
    renderPlanView(state, res);
    imgs.plan = await svgToPng(document.querySelector('#plan-wrap svg'), 1400);
    if (res.fresnel) {
      renderProfileView(state, res);
      imgs.profile = await svgToPng(document.querySelector('#profile-wrap svg'), 1800);
    }
  } finally {
    host.remove();
    root.dataset.theme = prevTheme;
    refresh();
  }
  const f = res.fresnel;
  imgs.map = await staticMap(state.sites, f ? f.status : null, f && f.worst && f.status !== 'clear' ? f.worst.d / state.path.distKm : null);
  return imgs;
}

// ---------- PDF ----------
const PDF_CHARS = { '−': '-', '–': '-', '—': '-', '→': '->', '←': '<-', '≈': '~', '≥': '>=', '≤': '<=', '₁': '1', '₂': '2', '√': 'arrel ', 'λ': 'lambda', '…': '...', '’': '\'', '‘': '\'', '“': '"', '”': '"', ' ': ' ', ' ': ' ', 'ψ': 'psi', '∞': 'infinit' };
const T = (str) => String(str ?? '').replace(/[−–—→←≈≥≤₁₂√λ…’‘“”  ψ∞]/g, (c) => PDF_CHARS[c]).replace(/[^\x00-\xff]/g, '?');

const COL = {
  text: [28, 39, 64], muted: [93, 107, 136], rf: [8, 145, 178], line: [216, 224, 236], soft: [245, 247, 251],
  ok: [22, 163, 74], warn: [217, 119, 6], fail: [220, 38, 38], pending: [120, 130, 150],
};
const ESTAT_TXT = { ok: 'COMPLEIX', warn: 'REVISAR', fail: 'NO COMPLEIX', pending: 'PENDENT' };

function hash8(str) {
  let x = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 0x01000193) >>> 0; }
  return x.toString(16).toUpperCase().padStart(8, '0');
}

class Doc {
  constructor() {
    this.pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
    this.W = 210; this.H = 297; this.M = 16; this.y = 16;
    this.cw = this.W - 2 * this.M;
  }
  ensure(hh) { if (this.y + hh > this.H - 18) this.newPage(); }
  newPage() { this.pdf.addPage(); this.y = 18; }
  color(c, kind = 'text') { if (kind === 'text') this.pdf.setTextColor(...c); else if (kind === 'fill') this.pdf.setFillColor(...c); else this.pdf.setDrawColor(...c); }
  font(size, style = 'normal') { this.pdf.setFont('helvetica', style); this.pdf.setFontSize(size); }
  section(num, title) {
    this.ensure(18);
    this.y += 4;
    this.color(COL.rf, 'fill');
    this.pdf.rect(this.M, this.y - 4.6, 1.6, 6.4, 'F');
    this.font(13.5, 'bold'); this.color(COL.text);
    this.pdf.text(T(`${num}. ${title}`), this.M + 4, this.y);
    this.y += 6;
  }
  para(text, { size = 10, style = 'normal', color = COL.text, gap = 1.5, indent = 0 } = {}) {
    this.font(size, style); this.color(color);
    const lines = this.pdf.splitTextToSize(T(text), this.cw - indent);
    const lh = size * 0.42;
    for (const ln of lines) { this.ensure(lh); this.pdf.text(ln, this.M + indent, this.y); this.y += lh; }
    this.y += gap;
  }
  // Taula clau–valor: etiqueta a l'esquerra i valor alineat a la dreta (estat opcional per acolorir-lo).
  kv(rows, { labelW = 0.48 } = {}) {
    const rh = 6.2;
    for (const [i, [k, val, st]] of rows.entries()) {
      this.ensure(rh);
      if (i % 2 === 0) { this.color(COL.soft, 'fill'); this.pdf.rect(this.M, this.y - 4.3, this.cw, rh, 'F'); }
      this.font(9.2); this.color(COL.muted);
      this.pdf.text(T(k), this.M + 2, this.y);
      this.font(9.6, 'bold'); this.color(st ? COL[st] : COL.text);
      const vtxt = this.pdf.splitTextToSize(T(val), (this.cw - 4) * (1 - labelW))[0];
      this.pdf.text(vtxt, this.M + this.cw - 2, this.y, { align: 'right' });
      this.y += rh;
    }
    this.y += 2;
  }
  image(img, { w = this.cw, x = null, caption = null, maxH = 150 } = {}) {
    if (!img) return;
    let ww = w, hh = (img.h / img.w) * w;
    if (hh > maxH) { hh = maxH; ww = (img.w / img.h) * hh; }
    this.ensure(hh + (caption ? 6 : 2));
    const xx = x ?? this.M + (this.cw - ww) / 2;
    this.pdf.addImage(img.data, img.data.startsWith('data:image/png') ? 'PNG' : 'JPEG', xx, this.y, ww, hh, undefined, 'FAST');
    this.color(COL.line, 'draw'); this.pdf.setLineWidth(0.2); this.pdf.rect(xx, this.y, ww, hh);
    this.y += hh + 1.5;
    if (caption) { this.font(8.5, 'italic'); this.color(COL.muted); this.pdf.text(T(caption), this.M + this.cw / 2, this.y + 2.5, { align: 'center' }); this.y += 4; }
    this.y += 6;
  }
  checks(list) {
    let grup = null;
    for (const c of list) {
      if (c.grup !== grup) {
        grup = c.grup;
        this.ensure(8);
        this.font(9.5, 'bold'); this.color(COL.rf);
        this.pdf.text(T(grup.toUpperCase()), this.M, this.y + 1);
        this.y += 5;
      }
      this.font(9.2);
      const lines = this.pdf.splitTextToSize(T(c.text), this.cw * 0.5);
      this.font(9.2, 'bold');
      const vlines = this.pdf.splitTextToSize(T(c.valor), this.cw * 0.3);
      const rh = Math.max(lines.length, vlines.length) * 4 + 2;
      this.ensure(rh);
      this.color(COL.line, 'draw'); this.pdf.setLineWidth(0.2);
      this.pdf.line(this.M, this.y + rh - 4.2, this.M + this.cw, this.y + rh - 4.2);
      this.font(9.2); this.color(COL.text); this.pdf.text(lines, this.M, this.y);
      this.font(9.2, 'bold'); this.pdf.text(vlines, this.M + this.cw * 0.53, this.y);
      // Etiqueta d'estat
      const lbl = ESTAT_TXT[c.estat];
      this.font(7.6, 'bold');
      const tw = this.pdf.getTextWidth(lbl) + 4;
      this.color(COL[c.estat], 'fill');
      this.pdf.roundedRect(this.M + this.cw - tw, this.y - 3.4, tw, 4.6, 1.2, 1.2, 'F');
      this.color([255, 255, 255]);
      this.pdf.text(lbl, this.M + this.cw - tw / 2, this.y - 0.2, { align: 'center' });
      this.y += rh;
    }
    this.y += 2;
  }
}

function fileName(v) {
  const clean = (x) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `Informe_enllac_${clean(v.cognoms)}_${clean(v.nom)}.pdf`;
}

async function generatePdf(v) {
  const state = getState();
  const res = getResult();
  const imgs = await captureImages(state, res);
  const b = res.budget;
  const f = res.fresnel;
  const checks = computeChecks(state, res, v);
  const vd = verdict(state, res);
  const now = new Date();
  const dateStr = now.toLocaleString('ca-ES', { dateStyle: 'long', timeStyle: 'short' });
  const alumne = `${v.nom} ${v.cognoms}`;
  const cfg = encodeConfig(state);
  const code = hash8(`${cfg}|${alumne}|${now.toISOString()}`);
  const d = new Doc();
  const pdf = d.pdf;
  pdf.setProperties({ title: T(`Informe d'enllaç punt a punt - ${alumne}`), subject: T(ACTIVITY.titol), author: T(alumne), creator: 'Enllaç punt a punt (mòdul 0365)' });

  // ---- Capçalera ----
  d.color(COL.rf, 'fill'); pdf.rect(0, 0, d.W, 30, 'F');
  d.font(19, 'bold'); d.color([255, 255, 255]);
  pdf.text(T('Informe d\'enllaç punt a punt'), d.M, 14);
  d.font(10.5); pdf.text(T(`Mòdul 0365 – Radiocomunicacions · Activitat: ${ACTIVITY.titol} (${fmt(ACTIVITY.fGHz, 1)} GHz)`), d.M, 22);
  d.y = 40;
  d.kv([
    ['Alumne/a', alumne],
    ['Grup', v.grup || '—'],
    ['Enllaç', v.titol || '—'],
    ['Data de generació', dateStr],
    ['Codi de l\'informe', code],
  ]);
  // Valoració
  d.ensure(22);
  const vcol = COL[vd.nivell];
  d.color(vcol, 'draw'); pdf.setLineWidth(0.8);
  d.color([255, 255, 255], 'fill');
  const vtLines = (() => { d.font(9.5); return pdf.splitTextToSize(T(vd.text), d.cw - 8); })();
  const vh = 11 + vtLines.length * 4;
  pdf.roundedRect(d.M, d.y, d.cw, vh, 2, 2, 'FD');
  d.font(12.5, 'bold'); d.color(vcol);
  pdf.text(T(`Valoració del simulador: ${vd.titol}`), d.M + 4, d.y + 6.5);
  d.font(9.5); d.color(COL.text);
  pdf.text(vtLines, d.M + 4, d.y + 11.5);
  d.y += vh + 8;
  d.font(12, 'bold'); d.color(COL.text); pdf.text(T('Comprovacions'), d.M, d.y); d.y += 6;
  d.checks(checks);

  // ---- 1. Ubicació ----
  d.newPage();
  d.section(1, 'Ubicació dels extrems');
  const st = state.sites || {};
  const [zA, zB] = groundEnds(state);
  const coord = (p) => (p ? `${fmt(p.lat, 5)}, ${fmt(p.lon, 5)}` : '—');
  const brg = st.tx && st.rx ? bearingDeg(st.tx, st.rx) : null;
  d.kv([
    ['Extrem TX (lat, lon)', coord(st.tx)],
    ['Extrem RX (lat, lon)', coord(st.rx)],
    ['Distància', fmtDist(state.dKm)],
    ['Rumb TX -> RX', brg === null ? '—' : `${fmt(brg, 1)}° (${compassPoint(brg)})`],
    ['Cota del terreny TX / RX', pathValid(state) ? `${fmtU(zA, 'm', 0)} / ${fmtU(zB, 'm', 0)}` : '—'],
    ['Altura antena TX / RX', `${fmtU(state.ant.tx.h, 'm', 0)} / ${fmtU(state.ant.rx.h, 'm', 0)}`],
  ]);
  if (imgs.map) d.image(imgs.map, { caption: imgs.map.withTiles ? 'Mapa de l\'enllaç (color del traçat segons la visibilitat; cercle: punt amb menys marge)' : 'Esquema de l\'enllaç (no s\'ha pogut descarregar el mapa de fons)', maxH: 112 });
  else d.para('No s\'han situat els extrems al mapa.', { color: COL.fail });

  // ---- 2. Perfil ----
  d.ensure(150);
  d.section(2, 'Perfil d\'elevació, visibilitat i zona de Fresnel');
  if (f) {
    d.image(imgs.profile, { caption: 'Perfil del terreny amb la curvatura terrestre, la línia de visió i la 1a zona de Fresnel', maxH: 80 });
    const p = profileInput(state);
    const hRx = requiredHeight(p, 'rx');
    const hBoth = requiredHeight(p, 'both');
    const fsl = f.status === 'clear' ? 'ok' : f.status === 'partial' ? 'warn' : 'fail';
    d.kv([
      ['Estat', LOS_INFO[f.status].titol, fsl],
      ['Marge mínim sobre la línia de visió', `${fmtU(f.minClearance, 'm', 1)} a ${fmtU(f.worst ? f.worst.d : 0, 'km', 2)} de TX`, fsl],
      ['Fracció de F1 lliure al punt crític', `${fmt(f.minRatio * 100, 0)} % (requerit ${fmt(state.req * 100, 0)} %)`, fsl],
      ['Radi de la 1a zona de Fresnel al punt mig', fmtU(f.r1Mid, 'm', 1)],
      ['Curvatura terrestre al punt mig', `${fmtU(f.bulgeMid, 'm', 1)} (${(K_OPTIONS.find((o) => o.key === state.kKey) || K_OPTIONS[0]).nom})`],
      ['Pèrdua per difracció estimada', `${fmtU(f.diffLossDb, 'dB', 1)} (v = ${fmt(f.v, 2)})${state.applyDiffraction ? ', inclosa al balanç' : ', no inclosa'}`],
      ['Altura RX necessària (TX fix)', hRx === null ? '> 2000 m' : fmtU(Math.max(0, hRx), 'm', 1)],
      ['Altura necessària (totes dues iguals)', hBoth === null ? '> 2000 m' : fmtU(Math.max(0, hBoth), 'm', 1)],
    ]);
    if (state.obstacles.length) {
      d.para(`Obstacles afegits: ${state.obstacles.map((o) => `${o.nom} de ${fmtU(o.h, 'm', 0)} a ${fmtU(o.dKm, 'km', 2)}`).join('; ')}.`, { size: 9.5 });
    }
    d.para(`Dades d'elevació: ${state.path.source}.`, { size: 8.5, color: COL.muted });
  } else {
    d.para('No hi ha perfil del terreny: no s\'ha pogut avaluar la visibilitat directa.', { color: COL.fail });
  }

  // ---- 3. Balanç ----
  d.newPage();
  d.section(3, 'Configuració de l\'enllaç i balanç de potències');
  const antTxt = (side) => {
    const a = state.ant[side];
    const pr = presetFor(a);
    const m = res[side].model;
    return `${pr ? pr.nom : `${FAMILIES[a.family].nom}, ${fmtU(a.gain, 'dBi', 1)}`} · feix ${m.omni ? 'H 360°' : `H ${fmt(m.bwH, 1)}°`} / V ${fmt(m.bwV, 1)}°`;
  };
  d.kv([
    ['Freqüència', fmtFreq(state.fGHz)],
    ['Longitud d\'ona', fmtU(29.9792458 / state.fGHz, 'cm', 2)],
    ['Potència TX', `${fmtU(state.ptx, 'dBm', 1)} (${fmt(10 ** (state.ptx / 10), state.ptx < 10 ? 2 : 0)} mW)`],
    ['Pèrdua cable TX / RX', `${fmtU(res.ltx, 'dB', 2)} / ${fmtU(res.lrx, 'dB', 2)}`],
    ['Antena TX', antTxt('tx')],
    ['Antena RX', antTxt('rx')],
    ['Sensibilitat del receptor', fmtU(state.sens, 'dBm', 1)],
    ['Marge mínim desitjat', fmtU(state.minMargin, 'dB', 1)],
  ]);
  d.font(11, 'bold'); d.color(COL.text); d.ensure(8); pdf.text(T('Resultats'), d.M, d.y + 1); d.y += 6;
  d.kv([
    ['FSPL (espai lliure)', fmtU(b.fspl, 'dB', 2)],
    ['PIRE', `${fmtU(b.eirp, 'dBm', 2)} (límit de referència ${ACTIVITY.eirpLimitDbm} dBm)`, b.eirp <= ACTIVITY.eirpLimitDbm ? null : 'fail'],
    ['Pèrdues per desalineació TX / RX', `${fmtU(res.tx.mis, 'dB', 2)} / ${fmtU(res.rx.mis, 'dB', 2)}`],
    ['Pèrdua per obstacles (difracció)', fmtU(b.obsLoss, 'dB', 2)],
    ['Potència rebuda', fmtU(b.prx, 'dBm', 2), b.status],
    ['Marge de recepció', `${fmtU(b.margin, 'dB', 2)} · ${STATUS_INFO[b.status].titol}`, b.status],
  ]);
  d.para(`PRX = PTX − LTX + GTX,ef − FSPL − Lobs + GRX,ef − LRX = ${fmt(state.ptx, 2)} − ${fmt(res.ltx, 2)} + ${fmt(res.tx.gEf, 2)} − ${fmt(b.fspl, 2)} − ${fmt(b.obsLoss, 2)} + ${fmt(res.rx.gEf, 2)} − ${fmt(res.lrx, 2)} = ${fmt(b.prx, 2)} dBm`, { size: 9, color: COL.muted });
  d.image(imgs.link, { caption: 'Esquema de l\'enllaç i nivell del senyal al llarg de la cadena', maxH: 100 });
  d.image(imgs.waterfall, { caption: 'Cascada del balanç de potències (línia discontínua vermella: sensibilitat del receptor)', maxH: 84, w: d.cw * 0.85 });

  // ---- 4. Antenes ----
  d.section(4, 'Antenes, orientació i diagrames de radiació');
  d.kv([
    ['Guany nominal / efectiu TX', `${fmtU(res.tx.gNom, 'dBi', 2)} / ${fmtU(res.tx.gEf, 'dBi', 2)}`],
    ['Guany nominal / efectiu RX', `${fmtU(res.rx.gNom, 'dBi', 2)} / ${fmtU(res.rx.gEf, 'dBi', 2)}`],
    ['Desviació TX (azimut / elevació)', `${fmt(state.ant.tx.az, 1)}° / ${fmt(state.ant.tx.el, 2)}° (necessària ${fmt(res.tx.reqEl, 2)}°)`],
    ['Desviació RX (azimut / elevació)', `${fmt(state.ant.rx.az, 1)}° / ${fmt(state.ant.rx.el, 2)}° (necessària ${fmt(res.rx.reqEl, 2)}°)`],
  ]);
  const pw = (d.cw - 6) / 2;
  const iw = pw * 0.78;
  const pair = (a, bImg, cap) => {
    const hh = (a.h / a.w) * iw;
    d.ensure(hh + 8);
    const y0 = d.y;
    pdf.addImage(a.data, 'PNG', d.M + (pw - iw) / 2, y0, iw, hh, undefined, 'FAST');
    pdf.addImage(bImg.data, 'PNG', d.M + pw + 6 + (pw - iw) / 2, y0, iw, hh, undefined, 'FAST');
    d.y = y0 + hh + 2;
    d.font(8.5, 'italic'); d.color(COL.muted);
    pdf.text(T(cap[0]), d.M + pw / 2, d.y + 1.5, { align: 'center' });
    pdf.text(T(cap[1]), d.M + pw + 6 + pw / 2, d.y + 1.5, { align: 'center' });
    d.y += 6;
  };
  pair(imgs['polar-tx-H'], imgs['polar-rx-H'], ['Antena TX · pla horitzontal', 'Antena RX · pla horitzontal']);
  pair(imgs['polar-tx-V'], imgs['polar-rx-V'], ['Antena TX · pla vertical', 'Antena RX · pla vertical']);
  d.para('Diagrames de radiació obtinguts amb models didàctics a partir del guany i l\'ample de feix; no són dades mesurades de cap antena comercial.', { size: 8.5, color: COL.muted });

  // ---- 5. Equips ----
  d.section(5, 'Equips seleccionats');
  const link = (url) => (url ? url : '—');
  const rows = [
    ['Antena TX', v.antTxModel || 'Pendent'],
    ['Guany antena TX (full / informe)', `${num(v.antTxGain) === null ? '—' : fmtU(num(v.antTxGain), 'dBi', 1)} / ${fmtU(state.ant.tx.gain, 'dBi', 1)}`],
    ['Full de característiques', link(v.antTxUrl)],
    ['Antena RX', v.sameAnt ? (v.antTxModel || 'Pendent') : (v.antRxModel || 'Pendent')],
    ['Guany antena RX (full / informe)', `${num(v.sameAnt ? v.antTxGain : v.antRxGain) === null ? '—' : fmtU(num(v.sameAnt ? v.antTxGain : v.antRxGain), 'dBi', 1)} / ${fmtU(state.ant.rx.gain, 'dBi', 1)}`],
    ['Full de característiques', link(v.sameAnt ? v.antTxUrl : v.antRxUrl)],
    ['Equip de ràdio', v.radioModel || 'Pendent'],
    ['Potència TX màxima (full / informe)', `${num(v.radioPtx) === null ? '—' : fmtU(num(v.radioPtx), 'dBm', 1)} / ${fmtU(state.ptx, 'dBm', 1)}`],
    ['Sensibilitat (full / informe)', `${num(v.radioSens) === null ? '—' : fmtU(num(v.radioSens), 'dBm', 1)} / ${fmtU(state.sens, 'dBm', 1)}`],
    ['Modulació / velocitat', v.radioMod || '—'],
    ['Full de característiques', link(v.radioUrl)],
  ];
  d.kv(rows, { labelW: 0.35 });
  // Enllaços clicables
  for (const u of [v.antTxUrl, v.sameAnt ? '' : v.antRxUrl, v.radioUrl].filter((x) => /^https?:\/\//i.test(x || ''))) {
    d.ensure(5); d.font(8.5); d.color(COL.rf);
    pdf.textWithLink(T(u.length > 110 ? `${u.slice(0, 107)}...` : u), d.M, d.y, { url: u });
    d.y += 4.2;
  }
  d.y += 2;

  // ---- 6. Conclusions ----
  d.section(6, 'Conclusions de l\'alumne/a');
  d.para(v.conclusions || '(Sense conclusions)', { size: 10, color: v.conclusions ? COL.text : COL.fail });

  // ---- 7. Dades ----
  d.section(7, 'Reproducció i limitacions');
  d.para('Aquest enllaç torna a obrir l\'aplicació amb la mateixa configuració (el perfil del terreny es torna a descarregar):', { size: 9 });
  const url = configUrl(state);
  d.ensure(6); d.font(8); d.color(COL.rf);
  const urlShown = url.length > 120 ? `${url.slice(0, 117)}...` : url;
  pdf.textWithLink(T(urlShown), d.M, d.y, { url });
  d.y += 6;
  d.para('Càlculs: FSPL = 32,45 + 20·log(d km) + 20·log(f MHz); r1 = arrel(lambda·d1·d2/d); protuberància terrestre h = d1·d2/(2·k·R); difracció amb una sola aresta de ganivet (ITU-R P.526). El simulador fa servir un model simplificat: no té en compte la pluja, el multitrajecte, les reflexions ni les difraccions múltiples, i el model del terreny (≈ 90 m) no inclou edificis ni vegetació si no s\'han afegit com a obstacles. El límit de PIRE és un valor de referència per a la banda 5470–5725 MHz; consulteu la normativa vigent (CNAF).', { size: 8.5, color: COL.muted });

  // Peu de pàgina
  const n = pdf.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    pdf.setPage(i);
    d.color(COL.line, 'draw'); pdf.setLineWidth(0.3); pdf.line(d.M, d.H - 12, d.W - d.M, d.H - 12);
    d.font(8); d.color(COL.muted);
    pdf.text(T(`Enllaç punt a punt · ${alumne} · codi ${code}`), d.M, d.H - 7.5);
    pdf.text(T(`Pàgina ${i} de ${n}`), d.W - d.M, d.H - 7.5, { align: 'right' });
  }
  const name = fileName(v);
  pdf.save(name);
  return name;
}
