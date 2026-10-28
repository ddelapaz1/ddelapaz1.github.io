// Simulador 3: resultats de visibilitat directa, Fresnel i difracció.

import { h, clear } from './dom.js';
import { fmt, fmtU, fmtDist } from '../engine/format.js';
import { LOS_INFO, requiredHeight } from '../engine/fresnel.js';
import { STATUS_INFO } from '../engine/linkBudget.js';
import { bearingDeg, compassPoint } from '../engine/geo.js';
import { profileInput } from '../engine/model.js';
import { helpIcon } from './glossary.js';

const LEVEL = { clear: 'ok', partial: 'low', blocked: 'fail' };

function tile(label, value, help, cls = '') {
  return h('div', { class: `tile ${cls}` }, h('div', { class: 'tile-label' }, label, help ? helpIcon(help) : null), h('div', { class: 'tile-value', html: value }));
}

export function createFresnelResults(root) {
  const body = h('div', { class: 'fr-body' });
  root.append(h('div', { class: 'card-head' }, h('h2', { text: 'Visibilitat directa i Fresnel' })), body);
  return function render(state, res) {
    clear(body);
    const f = res.fresnel;
    if (!f) {
      body.append(h('div', { class: 'fr-empty' },
        h('p', { text: 'Encara no hi ha cap perfil del terreny.' }),
        h('ol', {},
          h('li', { text: 'Fes clic al mapa per situar l\'extrem TX i després l\'extrem RX (o escriu-ne les coordenades).' }),
          h('li', { text: 'El perfil d\'elevació s\'obtindrà automàticament d\'un model digital del terreny.' }),
          h('li', { text: 'Ajusta l\'altura de les antenes i observa la 1a zona de Fresnel.' })),
        h('p', { class: 'muted', text: 'Sense connexió a Internet pots fer servir el terreny d\'exemple del panell lateral.' })));
      return;
    }
    const b = res.budget;
    const st = f.status;
    const s = state.sites;
    const brg = s.tx && s.rx ? bearingDeg(s.tx, s.rx) : null;
    const p = profileInput(state);
    const hRx = requiredHeight(p, 'rx');
    const hBoth = requiredHeight(p, 'both');
    const reqPct = fmt(state.req * 100, 0);
    const hTxt = (v) => (v === null ? '> 2.000<small> m</small>' : `${fmt(Math.max(v, 0), 1)}<small> m</small>`);
    body.append(
      h('div', { class: `status status-${LEVEL[st]}` }, h('span', { class: 'status-dot' }),
        h('div', {}, h('strong', { text: LOS_INFO[st].titol }),
          h('p', { text: st === 'clear'
            ? `Tot el trajecte té com a mínim el ${reqPct} % del radi de la 1a zona de Fresnel lliure.`
            : st === 'partial'
              ? `Hi ha visió directa, però en algun punt queda menys del ${reqPct} % de la 1a zona de Fresnel lliure. Apareixen pèrdues addicionals per difracció.`
              : 'El terreny o un obstacle talla la línia recta entre antenes. El senyal només arriba per difracció, amb pèrdues importants.' }))),
      h('div', { class: 'tiles-fr' },
        tile('Distància', `${fmtDist(state.path.distKm).replace(/ (\S+)$/, '<small> $1</small>')}`),
        tile('Rumb TX → RX', brg === null ? '—' : `${fmt(brg, 1)}°<small> ${compassPoint(brg)}</small>`),
        tile('Radi F1 al punt mig', `${fmt(f.r1Mid, 1)}<small> m</small>`, 'fresnel'),
        tile('Curvatura al punt mig', `${fmt(f.bulgeMid, 1)}<small> m</small>`, 'curvatura'),
        tile('Marge mínim', `${fmt(f.minClearance, 1)}<small> m</small><span class="tile-sub">${fmt(f.minRatio * 100, 0)} % del radi F1</span>`, 'marginF', `em ${LEVEL[st]}`),
        tile('A la distància', f.worst ? `${fmt(f.worst.d, 2)}<small> km de TX</small>` : '—'),
        tile('Pèrdua per difracció', `${fmt(f.diffLossDb, 1)}<small> dB</small><span class="tile-sub">v = ${fmt(f.v, 2)}</span>`, 'difraccio', f.diffLossDb > 0.05 ? 'em low' : ''),
        tile('Elevació TX → RX', `${fmt(f.elevDeg, 2)}<small>°</small>`)),
      h('div', { class: 'fr-need' },
        h('h3', { text: `Altura necessària per tenir el ${reqPct} % de F1 lliure` }),
        h('div', { class: 'need-row' },
          h('span', { text: `Antena RX (TX a ${fmt(state.ant.tx.h, 0)} m)` }), h('strong', { html: hTxt(hRx) })),
        h('div', { class: 'need-row' }, h('span', { text: 'Les dues antenes a la mateixa altura' }), h('strong', { html: hTxt(hBoth) }))),
      h('div', { class: `fr-budget status-${b.status}` },
        h('strong', { text: `Balanç: PRX ${fmtU(b.prx, 'dBm', 1)} · marge ${fmtU(b.margin, 'dB', 1, { sign: true })}` }),
        h('p', { text: state.applyDiffraction
          ? `${STATUS_INFO[b.status].titol}. La pèrdua per difracció (${fmtU(b.obsLoss, 'dB', 1)}) s'inclou al balanç dels simuladors 1 i 2.`
          : `${STATUS_INFO[b.status].titol}. La pèrdua per difracció no s'està incloent al balanç.` }),
        st !== 'clear' && b.margin - (state.applyDiffraction ? 0 : f.diffLossDb) >= 0 && f.diffLossDb > 0
          ? h('p', { class: 'fr-warn', text: 'Fixa-t\'hi: el balanç de potències pot semblar favorable, però el trajecte no té la 1a zona de Fresnel lliure. Un enllaç real es dissenyaria amb antenes més altes o per un altre camí.' })
          : null),
      h('p', { class: 'fine', text: `Dades d'elevació: ${state.path.source}. El model digital del terreny no inclou edificis ni vegetació: afegeix-los com a obstacles. La difracció s'estima amb una sola aresta de ganivet (ITU-R P.526).` }));
  };
}
