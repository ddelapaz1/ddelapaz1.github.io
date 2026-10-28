// Controls de paràmetres: lliscant + entrada numèrica, amb validació i escala logarítmica opcional.

import { h, clamp } from './dom.js';
import { fmt, parseNum } from '../engine/format.js';
import { helpIcon } from './glossary.js';
import { update, getState } from '../state.js';
import { LIMITS } from '../engine/model.js';
import { FAMILIES, PRESETS, presetFor, familyForGain, dishDiameterM, antennaModel } from '../engine/antennas.js';
import { toast } from './toasts.js';

const SLIDER_RES = 1000;

function roundTo(v, step) {
  const r = Math.round(v / step) * step;
  return Number(r.toFixed(6));
}

// def: { id, label, unit, min, max, step, dec, log, help, get, set, buttons, round, note }
export function paramControl(def) {
  const input = h('input', {
    class: 'num', type: 'text', inputmode: 'decimal', id: `in-${def.id}`,
    'aria-label': `${def.label} (${def.unit})`, autocomplete: 'off', spellcheck: 'false',
  });
  const slider = h('input', {
    type: 'range', class: 'slider', id: `sl-${def.id}`, 'aria-label': def.label,
    min: def.log ? 0 : def.min, max: def.log ? SLIDER_RES : def.max, step: def.log ? 1 : def.step,
  });
  const toSlider = (v) => (def.log ? Math.round((SLIDER_RES * Math.log(v / def.min)) / Math.log(def.max / def.min)) : v);
  const fromSlider = (t) => {
    if (!def.log) return Number(t);
    const v = def.min * (def.max / def.min) ** (t / SLIDER_RES);
    return clamp(def.round ? def.round(v) : roundTo(v, def.step), def.min, def.max);
  };
  const commit = (v) => update((s) => def.set(s, v), 'user');

  slider.addEventListener('input', () => commit(fromSlider(Number(slider.value))));

  const applyInput = () => {
    const raw = parseNum(input.value);
    if (!Number.isFinite(raw)) {
      input.classList.add('invalid');
      toast({ level: 'warn', title: 'Valor no vàlid', lines: [`Introdueix un número per a «${def.label}» (per exemple ${fmt(def.get(getState()), def.dec)}).`] });
      setTimeout(() => input.classList.remove('invalid'), 1200);
      input.value = fmt(def.get(getState()), def.dec);
      return;
    }
    let v = raw;
    if (v < def.min || v > def.max) {
      v = clamp(v, def.min, def.max);
      toast({ level: 'warn', title: 'Valor fora de rang', lines: [`«${def.label}» ha d'estar entre ${fmt(def.min, def.dec)} i ${fmt(def.max, def.dec)} ${def.unit}. S'ha ajustat a ${fmt(v, def.dec)} ${def.unit}.`] });
    }
    commit(v);
    input.value = fmt(v, def.dec);
  };
  input.addEventListener('change', applyInput);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { applyInput(); input.blur(); }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const cur = def.get(getState());
      const st = (e.shiftKey ? 10 : 1) * (def.keyStep || def.step);
      commit(clamp(roundTo(cur + (e.key === 'ArrowUp' ? st : -st), def.step), def.min, def.max));
    }
  });

  const extra = (def.buttons || []).map((b) =>
    h('button', {
      class: 'mini', type: 'button', title: b.title, text: b.label,
      onclick: () => commit(clamp(b.fn(def.get(getState())), def.min, def.max)),
    }));

  const noteEl = h('div', { class: 'param-note' });
  const el = h('div', { class: 'param', id: `param-${def.id}` },
    h('div', { class: 'param-head' },
      h('label', { for: `in-${def.id}`, class: 'param-label' }, def.label, def.help ? helpIcon(def.help) : null),
      h('div', { class: 'param-value' }, input, h('span', { class: 'unit', text: def.unit }))),
    h('div', { class: 'param-slider' }, slider, ...extra),
    noteEl);

  function sync(state, result) {
    const v = def.get(state);
    if (document.activeElement !== input) input.value = fmt(v, def.dec);
    if (document.activeElement !== slider) slider.value = toSlider(v);
    const pct = ((toSlider(v) - Number(slider.min)) / (Number(slider.max) - Number(slider.min))) * 100;
    slider.style.setProperty('--fill', `${clamp(pct, 0, 100)}%`);
    const disabled = def.disabled ? def.disabled(state) : false;
    input.disabled = disabled;
    slider.disabled = disabled;
    el.classList.toggle('is-disabled', disabled);
    const note = def.note ? def.note(state, result) : '';
    noteEl.textContent = note || '';
    noteEl.hidden = !note;
  }
  return { el, sync };
}

const x2 = { label: '×2', title: 'Duplica el valor', fn: (v) => v * 2 };
const d2 = { label: '÷2', title: 'Redueix el valor a la meitat', fn: (v) => v / 2 };

const roundFreq = (v) => (v < 1 ? roundTo(v, 0.005) : v < 10 ? roundTo(v, 0.05) : roundTo(v, 0.1));
const roundDist = (v) => (v < 1 ? roundTo(v, 0.01) : v < 10 ? roundTo(v, 0.05) : roundTo(v, 0.1));

export const P = {
  ptx: { id: 'ptx', label: 'Potència TX', unit: 'dBm', min: LIMITS.ptx[0], max: LIMITS.ptx[1], step: 0.5, dec: 1, help: 'dBm',
    get: (s) => s.ptx, set: (s, v) => { s.ptx = v; },
    note: (s) => `${fmt(10 ** (s.ptx / 10), s.ptx < 10 ? 2 : 0)} mW` },
  fGHz: { id: 'f', label: 'Freqüència', unit: 'GHz', min: LIMITS.fGHz[0], max: LIMITS.fGHz[1], step: 0.01, dec: 2, log: true, round: roundFreq, keyStep: 0.1,
    get: (s) => s.fGHz, set: (s, v) => { s.fGHz = v; }, buttons: [d2, x2],
    note: (s) => `λ = ${fmt(29.9792458 / s.fGHz, s.fGHz > 3 ? 2 : 1)} cm` },
  dKm: { id: 'd', label: 'Distància', unit: 'km', min: LIMITS.dKm[0], max: LIMITS.dKm[1], step: 0.01, dec: 2, log: true, round: roundDist, keyStep: 0.1,
    get: (s) => s.dKm, set: (s, v) => { s.dKm = v; }, buttons: [d2, x2] },
  sens: { id: 'sens', label: 'Sensibilitat RX', unit: 'dBm', min: LIMITS.sens[0], max: LIMITS.sens[1], step: 0.5, dec: 1, help: 'sensibilitat',
    get: (s) => s.sens, set: (s, v) => { s.sens = v; } },
  minMargin: { id: 'mm', label: 'Marge mínim desitjat', unit: 'dB', min: LIMITS.minMargin[0], max: LIMITS.minMargin[1], step: 0.5, dec: 1, help: 'minMargin',
    get: (s) => s.minMargin, set: (s, v) => { s.minMargin = v; } },
};

const SIDE_NAME = { tx: 'TX', rx: 'RX' };

export function cableControls(side) {
  const simple = paramControl({
    id: `loss-${side}`, label: `Pèrdua cable ${SIDE_NAME[side]}`, unit: 'dB', min: LIMITS.cableLoss[0], max: LIMITS.cableLoss[1], step: 0.1, dec: 1, help: 'cable',
    get: (s) => s.cable[side].lossDb, set: (s, v) => { s.cable[side].lossDb = v; },
  });
  const len = paramControl({
    id: `len-${side}`, label: 'Longitud del cable', unit: 'm', min: LIMITS.lengthM[0], max: LIMITS.lengthM[1], step: 0.5, dec: 1,
    get: (s) => s.cable[side].lengthM, set: (s, v) => { s.cable[side].lengthM = v; },
  });
  const att = paramControl({
    id: `att-${side}`, label: 'Atenuació específica', unit: 'dB/100 m', min: LIMITS.attDb100[0], max: LIMITS.attDb100[1], step: 0.5, dec: 1,
    get: (s) => s.cable[side].attDb100, set: (s, v) => { s.cable[side].attDb100 = v; },
  });
  const conn = paramControl({
    id: `conn-${side}`, label: 'Pèrdues de connectors', unit: 'dB', min: LIMITS.connDb[0], max: LIMITS.connDb[1], step: 0.1, dec: 1,
    get: (s) => s.cable[side].connDb, set: (s, v) => { s.cable[side].connDb = v; },
  });
  const total = h('div', { class: 'derived' });
  const adv = h('div', { class: 'advanced' }, len.el, att.el, conn.el, total);
  const el = h('div', { class: 'cable-group' }, simple.el, adv);
  return {
    el,
    sync(state, result) {
      const on = state.advancedCables;
      simple.el.hidden = on;
      adv.hidden = !on;
      if (on) {
        len.sync(state, result); att.sync(state, result); conn.sync(state, result);
        const c = state.cable[side];
        const L = side === 'tx' ? result.ltx : result.lrx;
        total.innerHTML = `Pèrdua total: <b>${fmt(L, 2)} dB</b> <span class="muted">= ${fmt(c.lengthM, 1)} m × ${fmt(c.attDb100, 1)}/100 + ${fmt(c.connDb, 1)}</span>`;
      } else simple.sync(state, result);
    },
  };
}

// Guany de l'antena (0–40 dBi). Si surt del rang de la família, se'n tria una d'adequada.
export function gainControl(side, compact = false) {
  return paramControl({
    id: `g-${side}${compact ? '-2' : ''}`, label: `Guany antena ${SIDE_NAME[side]}`, unit: 'dBi', min: LIMITS.gain[0], max: LIMITS.gain[1], step: 0.5, dec: 1, help: 'dBi',
    get: (s) => s.ant[side].gain,
    set: (s, v) => {
      const a = s.ant[side];
      const fam = familyForGain(a.family, v);
      if (fam !== a.family) {
        toast({ level: 'info', title: 'Tipus d\'antena actualitzat', lines: [`Un guany de ${fmt(v, 1)} dBi queda fora del rang didàctic de «${FAMILIES[a.family].nom}». L'antena ${SIDE_NAME[side]} passa a ser «${FAMILIES[fam].nom}».`] });
        a.family = fam;
      }
      a.gain = v;
    },
    note: (s) => {
      const a = s.ant[side];
      const m = antennaModel(a.family, a.gain);
      return `${FAMILIES[a.family].nom} · feix ${m.omni ? 'H 360°' : `H ${fmt(m.bwH, 1)}°`} / V ${fmt(m.bwV, 1)}°`;
    },
  });
}

export function antennaSelect(side) {
  const sel = h('select', { class: 'select', id: `ant-${side}`, 'aria-label': `Tipus d'antena ${SIDE_NAME[side]}` });
  for (const fam of ['parabolica', 'panell', 'yagi', 'omni']) {
    const og = h('optgroup', { label: FAMILIES[fam].nom });
    for (const p of PRESETS.filter((x) => x.family === fam)) og.appendChild(h('option', { value: p.id, text: p.nom }));
    og.appendChild(h('option', { value: `custom-${fam}`, text: `${FAMILIES[fam].nom} (guany personalitzat)` }));
    sel.appendChild(og);
  }
  sel.addEventListener('change', () => {
    const v = sel.value;
    update((s) => {
      const a = s.ant[side];
      if (v.startsWith('custom-')) {
        const fam = v.slice(7);
        const [lo, hi] = FAMILIES[fam].range;
        a.family = fam;
        a.gain = clamp(a.gain, lo, hi);
      } else {
        const p = PRESETS.find((x) => x.id === v);
        a.family = p.family;
        a.gain = p.gain;
      }
    }, 'user');
  });
  const desc = h('p', { class: 'ant-desc' });
  const el = h('div', { class: 'ant-select' }, sel, desc);
  return {
    el,
    sync(state) {
      const a = state.ant[side];
      const p = presetFor(a);
      sel.value = p ? p.id : `custom-${a.family}`;
      let txt = FAMILIES[a.family].descripcio;
      if (a.family === 'parabolica') txt += ` Diàmetre equivalent a ${fmt(state.fGHz, 2)} GHz: ≈ ${fmt(dishDiameterM(a.gain, state.fGHz), 2)} m (η = 55 %).`;
      desc.textContent = txt;
    },
  };
}

export function familyGainControl(side) {
  return paramControl({
    id: `fg-${side}`, label: 'Guany màxim', unit: 'dBi', min: 0, max: 40, step: 0.5, dec: 1, help: 'dBi',
    get: (s) => s.ant[side].gain,
    set: (s, v) => {
      const a = s.ant[side];
      const [lo, hi] = FAMILIES[a.family].range;
      a.gain = clamp(v, lo, hi);
    },
    note: (s) => {
      const a = s.ant[side];
      const m = antennaModel(a.family, a.gain);
      const [lo, hi] = FAMILIES[a.family].range;
      return `Rang del model: ${lo}–${hi} dBi · −3 dB: ${m.omni ? 'H 360°' : `H ${fmt(m.bwH, 1)}°`}, V ${fmt(m.bwV, 1)}°${m.omni ? '' : ` · D/D ${fmt(m.fb, 0)} dB`}`;
    },
  });
}

export function orientationControls(side) {
  const az = paramControl({
    id: `az-${side}`, label: 'Desviació azimutal', unit: '°', min: LIMITS.az[0], max: LIMITS.az[1], step: 0.1, dec: 1, help: 'azimut',
    get: (s) => s.ant[side].az, set: (s, v) => { s.ant[side].az = v; },
    buttons: [
      { label: '−1°', title: 'Gira 1° en sentit horari', fn: (v) => v - 1 },
      { label: '+1°', title: 'Gira 1° en sentit antihorari', fn: (v) => v + 1 },
    ],
  });
  const el = paramControl({
    id: `el-${side}`, label: 'Elevació', unit: '°', min: LIMITS.el[0], max: LIMITS.el[1], step: 0.1, dec: 1, help: 'elevacio',
    get: (s) => s.ant[side].el, set: (s, v) => { s.ant[side].el = v; },
    buttons: [
      { label: '−½°', title: 'Baixa 0,5°', fn: (v) => v - 0.5 },
      { label: '+½°', title: 'Puja 0,5°', fn: (v) => v + 0.5 },
    ],
    note: (s, r) => `Elevació necessària per encarar l'altre extrem: ${fmt(r[side].reqEl, 2)}°`,
  });
  const ht = paramControl({
    id: `h-${side}`, label: 'Altura de l\'antena', unit: 'm', min: LIMITS.h[0], max: LIMITS.h[1], step: 1, dec: 0, help: 'altura',
    get: (s) => s.ant[side].h, set: (s, v) => { s.ant[side].h = v; },
  });
  return { az, el, ht };
}

export function section(title, ...children) {
  return h('section', { class: 'panel-section' }, h('h3', { class: 'panel-title' }, title), ...children);
}
