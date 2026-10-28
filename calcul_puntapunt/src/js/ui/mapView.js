// Simulador 3: mapa interactiu (Leaflet) per situar els extrems de l'enllaç.

import { intermediatePoint } from '../engine/geo.js';

let map = null, markers = {}, line = null, worstMarker = null, hoverMarker = null, layers = {};
let pickMode = 'tx';
let onPickCb = null;

const icon = (side) => window.L.divIcon({ className: '', html: `<div class="site-pin ${side}"><span>${side.toUpperCase()}</span></div>`, iconSize: [40, 40], iconAnchor: [20, 38] });

export function mapAvailable() { return !!window.L; }

export function setPickMode(m) { pickMode = m; }
export function getPickMode() { return pickMode; }

export function initMapView(el, onPick) {
  onPickCb = onPick;
  if (!window.L) {
    el.innerHTML = '<div class="map-fallback">No s\'ha pogut carregar el mapa. Pots introduir les coordenades manualment o fer servir el terreny d\'exemple.</div>';
    return;
  }
  const L = window.L;
  map = L.map(el, { zoomControl: true, worldCopyJump: true }).setView([41.7, 1.85], 8);
  layers = {
    topo: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, subdomains: 'abc', attribution: 'Mapa © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA) · dades © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }),
    mapa: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }),
    orto: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imatges © Esri' }),
  };
  layers.topo.addTo(map);
  map.on('click', (e) => onPickCb(pickMode, { lat: e.latlng.lat, lon: e.latlng.lng }));
}

export function setBaseLayer(key) {
  if (!map) return;
  for (const [k, l] of Object.entries(layers)) {
    if (k === key) l.addTo(map); else map.removeLayer(l);
  }
}

export function invalidateMap() { if (map) map.invalidateSize(); }

export function flyTo(lat, lon, zoom = 13) { if (map) map.flyTo([lat, lon], zoom, { duration: 0.8 }); }

export function fitSites(sites) {
  if (!map || !sites.tx || !sites.rx) return;
  map.fitBounds([[sites.tx.lat, sites.tx.lon], [sites.rx.lat, sites.rx.lon]], { padding: [50, 50], maxZoom: 14 });
}

export function renderMap(state, res) {
  if (!map) return;
  const L = window.L;
  const sites = state.sites || {};
  for (const side of ['tx', 'rx']) {
    const p = sites[side];
    if (!p) { if (markers[side]) { map.removeLayer(markers[side]); delete markers[side]; } continue; }
    if (!markers[side]) {
      markers[side] = L.marker([p.lat, p.lon], { draggable: true, icon: icon(side), keyboard: true, title: side === 'tx' ? 'Extrem TX' : 'Extrem RX' }).addTo(map);
      markers[side].on('dragend', (e) => { const ll = e.target.getLatLng(); onPickCb(side, { lat: ll.lat, lon: ll.lng }); });
    } else markers[side].setLatLng([p.lat, p.lon]);
  }
  if (sites.tx && sites.rx) {
    const pts = [];
    for (let i = 0; i <= 32; i++) { const q = intermediatePoint(sites.tx, sites.rx, i / 32); pts.push([q.lat, q.lon]); }
    const cls = res.fresnel ? `link-path ${res.fresnel.status}` : 'link-path';
    if (!line) line = L.polyline(pts, { className: cls, weight: 4, dashArray: '10 8' }).addTo(map);
    else { line.setLatLngs(pts); line.getElement()?.setAttribute('class', `leaflet-interactive ${cls}`); }
  } else if (line) { map.removeLayer(line); line = null; }
  // Punt més desfavorable
  const w = res.fresnel?.worst;
  if (w && sites.tx && sites.rx && res.fresnel.status !== 'clear') {
    const q = intermediatePoint(sites.tx, sites.rx, w.d / state.path.distKm);
    if (!worstMarker) worstMarker = L.circleMarker([q.lat, q.lon], { radius: 8, className: 'worst-pt' }).addTo(map);
    else worstMarker.setLatLng([q.lat, q.lon]);
    worstMarker.bindTooltip(res.fresnel.status === 'blocked' ? 'Obstrucció principal' : 'Punt amb menys marge de Fresnel');
  } else if (worstMarker) { map.removeLayer(worstMarker); worstMarker = null; }
}

// Marcador sincronitzat amb el cursor sobre el perfil.
export function showHover(state, dKm) {
  if (!map) return;
  const L = window.L;
  const s = state.sites || {};
  if (dKm === null || !s.tx || !s.rx || !state.path) {
    if (hoverMarker) { map.removeLayer(hoverMarker); hoverMarker = null; }
    return;
  }
  const q = intermediatePoint(s.tx, s.rx, dKm / state.path.distKm);
  if (!hoverMarker) hoverMarker = L.circleMarker([q.lat, q.lon], { radius: 6, className: 'hover-pt', interactive: false }).addTo(map);
  else hoverMarker.setLatLng([q.lat, q.lon]);
}
