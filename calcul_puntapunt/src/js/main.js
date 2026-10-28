// Punt d'entrada: construeix la interfície i connecta l'estat compartit amb les vistes.

import { h, $, s, clear } from './ui/dom.js';
import { getState, getResult, getUi, setUi, subscribe, update, replaceState, refresh } from './state.js';
import { DEFAULT_STATE, cloneState, evaluate, alignedOrientation, linkDirections, gainToward } from './engine/model.js';
import { dirFromAngles, absAzimuth } from './engine/geometry.js';
import { describeChanges } from './engine/messages.js';
import { fmt } from './engine/format.js';
import { paramControl, P, cableControls, gainControl, antennaSelect, familyGainControl, orientationControls, section } from './ui/controls.js';
import { initTooltips, helpIcon } from './ui/glossary.js';
import { initLinkDiagram, renderLinkDiagram, animateLinkDiagram, hideCallout } from './ui/linkDiagram.js';
import { createResults } from './ui/results.js';
import { renderWaterfall, renderSweep } from './ui/charts.js';
import { renderMath } from './ui/math.js';
import { createCompare } from './ui/compare.js';
import { initPlanView, renderPlanView } from './ui/planView.js';
import { initSideView, renderSideView } from './ui/sideView.js';
import { renderPolar } from './ui/polar.js';
import { createOrientResults } from './ui/orientResults.js';
import { toast } from './ui/toasts.js';
import { SCENARIOS, PATH_EXAMPLES } from './scenarios.js';
import { initMapView, renderMap, setPickMode, getPickMode, setBaseLayer, invalidateMap, flyTo, fitSites, showHover } from './ui/mapView.js';
import { initProfileView, renderProfileView } from './ui/profileView.js';
import { createFresnelResults } from './ui/fresnelResults.js';
import { fetchElevations, searchPlace } from './ui/elevation.js';
import { haversineKm, samplePath, profileSampleCount } from './engine/geo.js';
import { K_OPTIONS, syntheticGround } from './engine/fresnel.js';
import { parseNum, fmtDist } from './engine/format.js';
import { LIMITS, pathValid } from './engine/model.js';

const syncers = [];
const add = (c) => { syncers.push(c.sync); return c.el; };

// ---------- Panell lateral del simulador 1 ----------
function buildSide1(root) {
  const advToggle = h('input', { type: 'checkbox', id: 'adv-cables', class: 'switch-input' });
  advToggle.addEventListener('change', () => update((st) => {
    st.advancedCables = advToggle.checked;
    for (const side of ['tx', 'rx']) {
      const c = st.cable[side];
      if (advToggle.checked) {
        // Inicialitza la descripció detallada conservant la pèrdua actual.
        c.connDb = Math.min(0.5, c.lossDb);
        c.attDb100 = c.attDb100 || 20;
        c.lengthM = Math.min(100, Math.round(((c.lossDb - c.connDb) / c.attDb100) * 1000) / 10);
      } else {
        c.lossDb = Math.min(10, Math.round(((c.lengthM * c.attDb100) / 100 + c.connDb) * 100) / 100);
      }
    }
  }, 'user'));
  syncers.push((st) => { advToggle.checked = st.advancedCables; });
  const cTx = cableControls('tx');
  const cRx = cableControls('rx');
  syncers.push(cTx.sync, cRx.sync);
  root.append(
    h('div', { class: 'switch-row' },
      h('label', { class: 'switch', for: 'adv-cables' }, advToggle, h('span', { class: 'switch-track' }), h('span', { text: 'Paràmetres avançats dels cables' }))),
    section('Transmissor', add(paramControl(P.ptx)), cTx.el, add(gainControl('tx'))),
    section('Propagació', add(paramControl(P.fGHz)), add(paramControl(P.dKm))),
    section('Receptor', add(gainControl('rx')), cRx.el, add(paramControl(P.sens))),
    section('Criteri de qualitat', add(paramControl(P.minMargin))),
  );
}

// ---------- Panell lateral del simulador 2 ----------
function antennaBlock(side) {
  const sel = antennaSelect(side);
  syncers.push(sel.sync);
  const o = orientationControls(side);
  return section(side === 'tx' ? 'Antena transmissora (TX)' : 'Antena receptora (RX)',
    sel.el, add(familyGainControl(side)), add(o.az), add(o.el), add(o.ht));
}

let alignAnim = null;
function autoAlign() {
  if (alignAnim) cancelAnimationFrame(alignAnim);
  const st = getState();
  const target = alignedOrientation(st);
  const start = { tx: { az: st.ant.tx.az, el: st.ant.tx.el }, rx: { az: st.ant.rx.az, el: st.ant.rx.el } };
  const maxErr = Math.max(...['tx', 'rx'].flatMap((k) => [Math.abs(start[k].az - target[k].az), Math.abs(start[k].el - target[k].el)]));
  if (maxErr < 0.01) {
    toast({ level: 'ok', title: 'Les antenes ja estan alineades', lines: ['Els dos eixos principals apunten a l\'altre extrem: el guany efectiu és el màxim.'] });
    return;
  }
  const dur = Math.min(2600, 900 + maxErr * 60);
  const t0 = performance.now();
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  document.body.classList.add('aligning');
  const step = (now) => {
    const t = Math.min(1, (now - t0) / dur);
    const k = ease(t);
    const done = t >= 1;
    update((s2) => {
      for (const side of ['tx', 'rx']) {
        s2.ant[side].az = done ? target[side].az : start[side].az + (target[side].az - start[side].az) * k;
        s2.ant[side].el = done ? target[side].el : start[side].el + (target[side].el - start[side].el) * k;
      }
    }, done ? 'user' : 'anim');
    if (!done) alignAnim = requestAnimationFrame(step);
    else { alignAnim = null; document.body.classList.remove('aligning'); }
  };
  alignAnim = requestAnimationFrame(step);
}

function buildSide2(root) {
  const linkSec = section('Enllaç', add(paramControl({ ...P.fGHz, id: 'f2' })), add(paramControl({ ...P.dKm, id: 'd2' })), add(paramControl({ ...P.ptx, id: 'ptx2' })));
  const btn = h('button', { class: 'btn primary block', type: 'button', id: 'btn-align', onclick: autoAlign },
    svgIcon('M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'), 'Alinear antenes');
  root.append(h('div', { class: 'side-cta' }, btn), antennaBlock('tx'), antennaBlock('rx'), linkSec);
}

function svgIcon(d) {
  const sv = s('svg', { viewBox: '0 0 24 24', class: 'icon', 'aria-hidden': 'true' });
  sv.appendChild(s('path', { d }));
  return sv;
}

// ---------- Diagrames polars ----------
function polarCard(root, side) {
  let plane = 'H';
  const svg = s('svg', { class: 'polar-svg', role: 'img', 'aria-label': `Diagrama de radiació de l'antena ${side.toUpperCase()}` });
  const bH = h('button', { class: 'seg on', type: 'button', text: 'Pla horitzontal' });
  const bV = h('button', { class: 'seg', type: 'button', text: 'Pla vertical' });
  const set = (p) => { plane = p; bH.classList.toggle('on', p === 'H'); bV.classList.toggle('on', p === 'V'); render(getState(), getResult()); };
  bH.addEventListener('click', () => set('H'));
  bV.addEventListener('click', () => set('V'));
  const sub = h('p', { class: 'polar-sub' });
  root.append(
    h('div', { class: 'card-head' }, h('h2', { text: `Diagrama de radiació ${side.toUpperCase()}` }), h('div', { class: 'segmented' }, bH, bV)),
    sub, h('div', { class: 'polar-wrap' }, svg));
  function render(state, res) {
    const a = state.ant[side];
    const r = res[side];
    const m = r.model;
    const dirs = linkDirections(state);
    if (plane === 'H') {
      const eCut = dirs.reqEl[side];
      renderPolar(svg, {
        side, gMax: m.gain, gEf: r.gEf, bore: absAzimuth(side, a.az), bw: m.omni ? null : m.bwH,
        other: side === 'tx' ? 0 : 180, otherLabel: side === 'tx' ? 'cap a RX' : 'cap a TX',
        gainAt: (b) => gainToward(a, side, m, dirFromAngles(b, eCut)),
      });
      sub.textContent = `Vista superior, com la vista en planta. Ample de feix H: ${m.omni ? '360°' : `${fmt(m.bwH, 1)}°`}. Línia discontínua: direcció ${side === 'tx' ? 'cap a RX' : 'cap a TX'}; punt taronja: guany efectiu.`;
    } else {
      const DEG = Math.PI / 180;
      renderPolar(svg, {
        side, gMax: m.gain, gEf: r.gEf, bore: side === 'tx' ? a.el : 180 - a.el, bw: m.bwV,
        other: side === 'tx' ? dirs.e0 : 180 + dirs.e0, otherLabel: side === 'tx' ? 'cap a RX' : 'cap a TX',
        gainAt: (g) => gainToward(a, side, m, [Math.cos(g * DEG), 0, Math.sin(g * DEG)]),
      });
      sub.textContent = `Tall vertical que conté l'enllaç (0° = horitzontal cap a RX). Ample de feix V: ${fmt(m.bwV, 1)}°. Línia discontínua: direcció ${side === 'tx' ? 'cap a RX' : 'cap a TX'}.`;
    }
  }
  return render;
}


// ---------- Simulador 3: visibilitat i Fresnel ----------
let profileAbort = null;
let profileTimer = null;
const pathStatus = { level: 'idle', text: '' };
function setPathStatus(level, text) { Object.assign(pathStatus, { level, text }); refresh(); }

function pickSite(side, ll) {
  const lat = Math.round(ll.lat * 1e6) / 1e6;
  const lon = Math.round((((ll.lon + 180) % 360 + 360) % 360 - 180) * 1e6) / 1e6;
  update((st) => { st.sites[side] = { lat, lon }; }, 'map');
  const s2 = getState();
  if (side === 'tx' && !s2.sites.rx) setPickMode('rx');
  else if (side === 'rx' && !s2.sites.tx) setPickMode('tx');
  clearTimeout(profileTimer);
  profileTimer = setTimeout(loadProfile, 350);
}

async function loadProfile() {
  const { tx, rx } = getState().sites;
  if (!tx || !rx) { setPathStatus('idle', tx || rx ? 'Situa l\'altre extrem per obtenir el perfil.' : ''); return; }
  const dist = haversineKm(tx, rx);
  if (dist < LIMITS.dKm[0] || dist > LIMITS.dKm[1]) {
    setPathStatus('error', `La distància entre extrems (${fmtDist(dist)}) ha d'estar entre 100 m i 50 km.`);
    return;
  }
  profileAbort?.abort();
  profileAbort = new AbortController();
  const n = profileSampleCount(dist);
  setPathStatus('loading', `Obtenint el perfil d'elevació (${n} punts)…`);
  try {
    const { z, source } = await fetchElevations(samplePath(tx, rx, n), profileAbort.signal);
    applyProfile({ a: tx, b: rx, distKm: dist, ground: z.map((v) => Math.round(v * 10) / 10), source });
    setPathStatus('ok', `Perfil de ${n} punts cada ${fmt((dist * 1000) / (n - 1), 0)} m.`);
  } catch (e) {
    if (profileAbort.signal.aborted && e.name === 'AbortError') return;
    setPathStatus('error', 'No s\'ha pogut obtenir el perfil d\'elevació (cal connexió a Internet). Torna-ho a provar o fes servir el terreny d\'exemple.');
  }
}

// Aplica un perfil nou: fixa la distància de l'enllaç i encara les antenes en elevació.
function applyProfile(path) {
  update((st) => {
    st.path = path;
    st.dKm = path.distKm;
    st.obstacles = st.obstacles.filter((o) => o.dKm > 0 && o.dKm < path.distKm);
    const al = alignedOrientation(st);
    st.ant.tx.el = al.tx.el;
    st.ant.rx.el = al.rx.el;
  }, 'user');
}

function useSyntheticProfile() {
  profileAbort?.abort();
  const d = getState().dKm;
  update((st) => { st.sites = { tx: null, rx: null }; }, 'map');
  applyProfile({ a: null, b: null, distKm: d, ground: syntheticGround(d), source: 'Terreny d\'exemple (sintètic, no correspon a cap lloc real)' });
  setPathStatus('ok', `Terreny d'exemple de ${fmtDist(d)} (la distància és la de l'enllaç actual).`);
}

function loadPathExample(id) {
  const ex = PATH_EXAMPLES.find((x) => x.id === id);
  if (!ex) return;
  update((st) => {
    st.sites = { tx: { ...ex.tx }, rx: { ...ex.rx } };
    st.ant.tx.h = ex.hTx; st.ant.rx.h = ex.hRx; st.fGHz = ex.fGHz;
    st.ant.tx.az = 0; st.ant.rx.az = 0;
    st.obstacles = [];
  }, 'map');
  fitSites(getState().sites);
  toast({ level: 'info', title: ex.nom, lines: [ex.text] });
  loadProfile();
}

let obsSeq = 1;
function addObstacle() {
  const st = getState();
  if (!pathValid(st)) { toast({ level: 'warn', title: 'Primer cal un perfil', lines: ['Situa els extrems al mapa o fes servir el terreny d\'exemple.'] }); return; }
  if (st.obstacles.length >= 8) return;
  update((s2) => { s2.obstacles.push({ id: `o${obsSeq++}`, nom: 'Edifici', dKm: Math.round(s2.path.distKm * (0.3 + 0.1 * s2.obstacles.length) * 1000) / 1000, h: 20 }); }, 'user');
}

function coordInputs(side) {
  const lat = h('input', { class: 'num coord', type: 'text', inputmode: 'decimal', 'aria-label': `Latitud ${side.toUpperCase()}`, placeholder: 'latitud' });
  const lon = h('input', { class: 'num coord', type: 'text', inputmode: 'decimal', 'aria-label': `Longitud ${side.toUpperCase()}`, placeholder: 'longitud' });
  const apply = () => {
    const a = parseNum(lat.value), o = parseNum(lon.value);
    if (!Number.isFinite(a) || !Number.isFinite(o) || Math.abs(a) > 85 || Math.abs(o) > 180) {
      toast({ level: 'warn', title: 'Coordenades no vàlides', lines: ['Escriu la latitud (−85 a 85) i la longitud (−180 a 180) en graus decimals, per exemple 41,4219 i 2,1186.'] });
      return;
    }
    pickSite(side, { lat: a, lon: o });
    flyTo(a, o, 12);
  };
  for (const i of [lat, lon]) i.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });
  for (const i of [lat, lon]) i.addEventListener('change', () => { if (lat.value && lon.value) apply(); });
  syncers.push((st) => {
    const p = st.sites[side];
    if (document.activeElement !== lat) lat.value = p ? fmt(p.lat, 5) : '';
    if (document.activeElement !== lon) lon.value = p ? fmt(p.lon, 5) : '';
  });
  return h('div', { class: `coord-row ${side}` }, h('span', { class: `site-tag ${side}`, text: side.toUpperCase() }), lat, lon);
}

function buildSide3(root) {
  // Cerca de llocs
  const q = h('input', { class: 'search-input', type: 'search', placeholder: 'Cerca un lloc (p. ex. Tibidabo)', 'aria-label': 'Cerca un lloc al mapa' });
  const results = h('ul', { class: 'search-results', hidden: true });
  let ctrl = null;
  const doSearch = async () => {
    if (!q.value.trim()) return;
    ctrl?.abort(); ctrl = new AbortController();
    clear(results); results.hidden = false;
    results.appendChild(h('li', { class: 'muted', text: 'Cercant…' }));
    try {
      const r = await searchPlace(q.value.trim(), ctrl.signal);
      clear(results);
      if (!r.length) results.appendChild(h('li', { class: 'muted', text: 'Cap resultat.' }));
      for (const it of r) {
        results.appendChild(h('li', {}, h('button', { type: 'button', text: it.nom, onclick: () => { flyTo(it.lat, it.lon, 13); results.hidden = true; } })));
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
      clear(results).appendChild(h('li', { class: 'muted', text: 'No s\'ha pogut fer la cerca (cal connexió).' }));
    }
  };
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

  const ex = h('select', { class: 'select block-select', 'aria-label': 'Trajectes d\'exemple' }, h('option', { value: '', text: 'Trajectes d\'exemple…' }), PATH_EXAMPLES.map((x) => h('option', { value: x.id, text: x.nom })));
  ex.addEventListener('change', () => { loadPathExample(ex.value); ex.value = ''; });

  const status = h('p', { class: 'path-status' });
  syncers.push(() => { status.className = `path-status ${pathStatus.level}`; status.textContent = pathStatus.text; status.hidden = !pathStatus.text; });

  const kSel = h('select', { class: 'select block-select', id: 'k-factor', 'aria-label': 'Factor k' }, K_OPTIONS.map((o) => h('option', { value: o.key, text: o.nom })));
  kSel.addEventListener('change', () => update((st) => { st.kKey = kSel.value; }, 'user'));
  syncers.push((st) => { kSel.value = st.kKey; });

  const diff = h('input', { type: 'checkbox', id: 'apply-diff', class: 'switch-input' });
  diff.addEventListener('change', () => update((st) => { st.applyDiffraction = diff.checked; }, 'user'));
  syncers.push((st) => { diff.checked = st.applyDiffraction; });

  const obsList = h('div', { class: 'obs-list' });
  syncers.push((st) => {
    if (obsList.contains(document.activeElement)) return;
    clear(obsList);
    if (!st.obstacles.length) obsList.appendChild(h('p', { class: 'muted small', text: 'El model del terreny no inclou edificis ni arbres. Afegeix-los aquí i arrossega\'ls sobre el perfil.' }));
    for (const o of st.obstacles) {
      const mk = (val, key, unit, min, max, dec) => {
        const i = h('input', { class: 'num', type: 'text', inputmode: 'decimal', value: fmt(val, dec), 'aria-label': `${o.nom}: ${key === 'dKm' ? 'distància' : 'altura'}` });
        i.addEventListener('change', () => {
          const v = parseNum(i.value);
          if (!Number.isFinite(v)) { i.value = fmt(val, dec); return; }
          update((s2) => { const ob = s2.obstacles.find((x) => x.id === o.id); if (ob) ob[key] = Math.min(max, Math.max(min, v)); }, 'user');
        });
        return h('label', { class: 'obs-field' }, i, h('span', { class: 'unit', text: unit }));
      };
      const type = h('select', { class: 'select mini-select', 'aria-label': 'Tipus d\'obstacle' }, ['Edifici', 'Arbres', 'Torre', 'Obstacle'].map((n) => h('option', { value: n, text: n })));
      type.value = o.nom;
      type.addEventListener('change', () => update((s2) => { const ob = s2.obstacles.find((x) => x.id === o.id); if (ob) ob.nom = type.value; }, 'user'));
      obsList.appendChild(h('div', { class: 'obs-row' }, type,
        mk(o.dKm, 'dKm', 'km', 0.001, st.path ? st.path.distKm - 0.001 : 50, 2), mk(o.h, 'h', 'm', 1, 300, 0),
        h('button', { class: 'mini', type: 'button', title: 'Elimina l\'obstacle', 'aria-label': 'Elimina l\'obstacle', text: '×', onclick: () => update((s2) => { s2.obstacles = s2.obstacles.filter((x) => x.id !== o.id); }, 'user') })));
    }
  });

  root.append(
    section('Extrems de l\'enllaç',
      h('p', { class: 'muted small', text: 'Fes clic al mapa per situar TX i RX, arrossega els marcadors o escriu les coordenades.' }),
      coordInputs('tx'), coordInputs('rx'), status,
      h('div', { class: 'search' }, q, h('button', { class: 'btn', type: 'button', text: 'Cerca', onclick: doSearch })), results,
      ex),
    section('Antenes',
      add(paramControl({ id: 'h3-tx', label: 'Altura antena TX', unit: 'm', min: LIMITS.h[0], max: LIMITS.h[1], step: 1, dec: 0, help: 'altura', get: (st) => st.ant.tx.h, set: (st, v) => { st.ant.tx.h = v; } })),
      add(paramControl({ id: 'h3-rx', label: 'Altura antena RX', unit: 'm', min: LIMITS.h[0], max: LIMITS.h[1], step: 1, dec: 0, help: 'altura', get: (st) => st.ant.rx.h, set: (st, v) => { st.ant.rx.h = v; } }))),
    section('Propagació',
      add(paramControl({ ...P.fGHz, id: 'f3' })),
      h('label', { class: 'field-label', for: 'k-factor' }, 'Curvatura terrestre', helpIcon('kfactor')), kSel,
      add(paramControl({ id: 'req', label: 'Fresnel lliure requerit', unit: '%', min: 20, max: 100, step: 5, dec: 0, help: 'marginF', get: (st) => st.req * 100, set: (st, v) => { st.req = v / 100; } })),
      h('div', { class: 'switch-row' }, h('label', { class: 'switch', for: 'apply-diff' }, diff, h('span', { class: 'switch-track' }), h('span', { text: 'Incloure la difracció al balanç' })))),
    section('Obstacles', obsList, h('button', { class: 'btn block', type: 'button', text: '+ Afegir obstacle', onclick: addObstacle })),
    section('Sense connexió',
      h('p', { class: 'muted small', text: 'Si no hi ha accés a Internet (mapa o dades d\'elevació), pots treballar amb un perfil inventat amb la distància actual de l\'enllaç.' }),
      h('button', { class: 'btn block', type: 'button', text: 'Fer servir un terreny d\'exemple', onclick: useSyntheticProfile })),
  );
}

// ---------- Missatges de variació ----------
let committed = null;
let msgTimer = null;
function snapshot() { return { state: cloneState(getState()), result: getResult() }; }
function emitChange() {
  if (!committed) { committed = snapshot(); return; }
  const m = describeChanges(committed.state, getState(), committed.result, getResult());
  committed = snapshot();
  if (!m) return;
  const causes = m.causes.length > 3 ? [...m.causes.slice(0, 2), `…i ${m.causes.length - 2} canvis més.`] : m.causes;
  toast({ level: m.level, title: causes.join(' '), lines: [...m.effects, ...(m.status ? [m.status] : [])] });
}

// ---------- Escenaris ----------
function loadScenario(id) {
  const sc = SCENARIOS.find((x) => x.id === id);
  if (!sc) return;
  if (alignAnim) { cancelAnimationFrame(alignAnim); alignAnim = null; }
  if (sc.reference) setUi({ reference: { state: cloneState(sc.reference), result: evaluate(sc.reference), label: sc.refLabel } });
  replaceState(sc.state, 'scenario');
  if (sc.chart) setChart(sc.chart);
  setUi({ scenario: sc, tab: sc.tab });
}

function resetAll() {
  if (alignAnim) { cancelAnimationFrame(alignAnim); alignAnim = null; }
  replaceState(DEFAULT_STATE, 'scenario');
  setUi({ scenario: null });
  $('#scenario-select').value = '';
  toast({ level: 'info', title: 'Configuració inicial restablerta', lines: ['PTX 20 dBm · 5,8 GHz · 2 km · cables 2 dB · antenes 20 dBi · sensibilitat −80 dBm.'] });
}

// ---------- Gràfiques del simulador 1 ----------
let chartMode = 'cascada';
const chartTabs = {};
function setChart(mode) {
  chartMode = mode;
  for (const [k, b] of Object.entries(chartTabs)) b.classList.toggle('on', k === mode);
  $('#wf-legend').hidden = mode !== 'cascada';
  refresh();
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  setUi({ theme });
  try { localStorage.setItem('sim-mw-theme', theme); } catch { /* sense emmagatzematge */ }
}

function init() {
  initTooltips();
  let theme = 'dark';
  try { theme = localStorage.getItem('sim-mw-theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'); } catch { /* per defecte */ }
  setTheme(theme);

  buildSide1($('#side-balanc'));
  buildSide2($('#side-antenes'));

  // Pestanyes
  for (const b of document.querySelectorAll('[data-tab]')) b.addEventListener('click', () => setUi({ tab: b.dataset.tab }));

  // Escenaris
  const sel = $('#scenario-select');
  for (const sc of SCENARIOS) sel.appendChild(h('option', { value: sc.id, text: sc.titol }));
  sel.addEventListener('change', () => loadScenario(sel.value));
  $('#btn-reset').addEventListener('click', resetAll);
  $('#banner-close').addEventListener('click', () => { setUi({ scenario: null }); sel.value = ''; });

  const ex = $('#explain-toggle');
  ex.addEventListener('change', () => { setUi({ explain: ex.checked }); if (!ex.checked) hideCallout(); });
  $('#btn-theme').addEventListener('click', () => setTheme(getUi().theme === 'dark' ? 'light' : 'dark'));
  $('#btn-about').addEventListener('click', () => $('#about').showModal());
  $('#about-close').addEventListener('click', () => $('#about').close());

  // Simulador 1
  initLinkDiagram($('#link-svg-wrap'), $('#link-card'));
  const renderResults = createResults($('#results-card'));
  const chartSvg = s('svg', { class: 'chart-svg', role: 'img', 'aria-label': 'Gràfica del balanç' });
  $('#chart-wrap').appendChild(chartSvg);
  for (const [k, label] of [['cascada', 'Cascada del balanç'], ['d', 'PRX vs distància'], ['f', 'PRX vs freqüència']]) {
    chartTabs[k] = h('button', { class: `seg${k === chartMode ? ' on' : ''}`, type: 'button', text: label, onclick: () => setChart(k) });
    $('#chart-tabs').appendChild(chartTabs[k]);
  }
  const renderCmp1 = createCompare($('#compare-1'));

  // Simulador 2
  initPlanView($('#plan-wrap'));
  initSideView($('#sideview-wrap'));
  $('#btn-align-2').addEventListener('click', autoAlign);
  const renderPolarTx = polarCard($('#polar-tx'), 'tx');
  const renderPolarRx = polarCard($('#polar-rx'), 'rx');
  const renderOrient = createOrientResults($('#orient-results'));
  const renderCmp2 = createCompare($('#compare-2'));

  // Simulador 3
  buildSide3($('#side-fresnel'));
  initMapView($('#map'), pickSite);
  initProfileView($('#profile-wrap'), (d) => showHover(getState(), d));
  const renderFresnel = createFresnelResults($('#fresnel-results'));
  for (const b of document.querySelectorAll('[data-pick]')) b.addEventListener('click', () => { setPickMode(b.dataset.pick); refresh(); });
  for (const b of document.querySelectorAll('[data-layer]')) b.addEventListener('click', () => {
    setBaseLayer(b.dataset.layer);
    document.querySelectorAll('[data-layer]').forEach((x) => x.classList.toggle('on', x === b));
  });
  $('#btn-fix-dist').addEventListener('click', () => { const p = getState().path; if (p) update((st) => { st.dKm = p.distKm; }, 'user'); });
  let lastTab = null;

  committed = snapshot();

  subscribe((state, res, ui, src) => {
    for (const f of syncers) f(state, res);
    document.body.classList.toggle('explain', ui.explain);
    for (const b of document.querySelectorAll('[data-tab]')) {
      const on = b.dataset.tab === ui.tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on);
    }
    $('#tab-balanc').hidden = ui.tab !== 'balanc';
    $('#tab-antenes').hidden = ui.tab !== 'antenes';
    $('#tab-fresnel').hidden = ui.tab !== 'fresnel';
    if (ui.tab === 'fresnel' && lastTab !== 'fresnel') requestAnimationFrame(invalidateMap);
    lastTab = ui.tab;
    $('#btn-theme').setAttribute('aria-label', ui.theme === 'dark' ? 'Canvia a tema clar' : 'Canvia a tema fosc');

    const banner = $('#scenario-banner');
    banner.hidden = !ui.scenario;
    if (ui.scenario) {
      $('#banner-title').textContent = ui.scenario.titol;
      $('#banner-text').textContent = ui.scenario.text;
      $('#banner-observe').textContent = ui.scenario.observa;
    }

    if (ui.tab === 'balanc') {
      renderLinkDiagram(state, res);
      renderResults(state, res);
      if (chartMode === 'cascada') renderWaterfall(chartSvg, state, res); else renderSweep(chartSvg, state, res, chartMode);
      renderMath($('#math-body'), state, res);
      renderCmp1(state, res);
    } else if (ui.tab === 'fresnel') {
      renderMap(state, res);
      renderProfileView(state, res);
      renderFresnel(state, res);
      for (const b of document.querySelectorAll('[data-pick]')) b.classList.toggle('on', b.dataset.pick === getPickMode());
      $('#btn-fix-dist').hidden = !(state.path && !pathValid(state));
    } else {
      renderPlanView(state, res);
      renderSideView(state, res);
      renderPolarTx(state, res);
      renderPolarRx(state, res);
      renderOrient(state, res);
      renderCmp2(state, res);
    }

    if (src === 'user') { clearTimeout(msgTimer); msgTimer = setTimeout(emitChange, 900); }
    else if (src === 'anim') clearTimeout(msgTimer);
    else if (src === 'scenario') { clearTimeout(msgTimer); committed = snapshot(); }
  });
  refresh();

  // Bucle d'animació de les ones
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const loop = (t) => {
    if (getUi().tab === 'balanc' && !document.hidden) animateLinkDiagram(t, reduced);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // Accés directe per a les proves automàtiques de la interfície
  window.__sim = { getState, getResult, update, loadScenario, autoAlign, pickSite, loadPathExample, useSyntheticProfile, setUi };
}

init();
