// Explicació matemàtica pas a pas amb la substitució dels valors actuals.

import { fmt } from '../engine/format.js';
import { FSPL_CONST } from '../engine/linkBudget.js';

const n = (x, d = 2) => {
  const t = fmt(x, d);
  return x < 0 ? `(${t})` : t;
};

export function renderMath(el, state, res) {
  const b = res.budget;
  const fMHz = state.fGHz * 1000;
  const mis = res.tx.mis > 0.005 || res.rx.mis > 0.005;
  const obs = b.obsLoss > 0.005;
  const cab = (side) => {
    const c = state.cable[side];
    const L = side === 'tx' ? res.ltx : res.lrx;
    return `<div class="eq"><span class="eq-l">L<sub>${side.toUpperCase()}</sub></span> = ${fmt(c.lengthM, 1)} m × ${fmt(c.attDb100, 1)} dB/100 m + ${fmt(c.connDb, 1)} dB = <b>${fmt(L, 2)} dB</b></div>`;
  };
  el.innerHTML = `
  <ol class="steps">
    ${state.advancedCables ? `<li><h4>Pèrdues dels cables</h4>${cab('tx')}${cab('rx')}</li>` : ''}
    <li>
      <h4>Pèrdues en l'espai lliure</h4>
      <div class="eq formula"><span class="eq-l">FSPL</span> = 32,45 + 20·log<sub>10</sub>(d<sub>km</sub>) + 20·log<sub>10</sub>(f<sub>MHz</sub>)</div>
      <div class="eq"><span class="eq-l">FSPL</span> = ${fmt(FSPL_CONST, 2)} + 20·log<sub>10</sub>(${fmt(state.dKm, 3)}) + 20·log<sub>10</sub>(${fmt(fMHz, 1)})</div>
      <div class="eq"><span class="eq-l">FSPL</span> = ${fmt(FSPL_CONST, 2)} + ${n(20 * Math.log10(state.dKm))} + ${n(20 * Math.log10(fMHz))} = <b>${fmt(b.fspl, 2)} dB</b></div>
    </li>
    <li>
      <h4>PIRE (potència isòtropa radiada equivalent)</h4>
      <div class="eq formula"><span class="eq-l">PIRE</span> = P<sub>TX</sub> − L<sub>TX</sub> + G<sub>TX</sub></div>
      <div class="eq"><span class="eq-l">PIRE</span> = ${n(state.ptx)} − ${n(res.ltx)} + ${n(res.tx.gNom)} = <b>${fmt(b.eirp, 2)} dBm</b></div>
    </li>
    ${mis ? `<li>
      <h4>Guanys efectius (antenes desalineades)</h4>
      <div class="eq"><span class="eq-l">G<sub>TX,ef</sub></span> = ${n(res.tx.gNom)} − ${n(res.tx.mis)} = <b>${fmt(res.tx.gEf, 2)} dBi</b> <span class="muted">(desviació ${fmt(res.tx.offAxis, 1)}°)</span></div>
      <div class="eq"><span class="eq-l">G<sub>RX,ef</sub></span> = ${n(res.rx.gNom)} − ${n(res.rx.mis)} = <b>${fmt(res.rx.gEf, 2)} dBi</b> <span class="muted">(desviació ${fmt(res.rx.offAxis, 1)}°)</span></div>
    </li>` : ''}
    ${obs ? `<li>
      <h4>Pèrdua per obstacles (difracció)</h4>
      <div class="eq formula"><span class="eq-l">L<sub>obs</sub></span> = J(v) = 6,9 + 20·log<sub>10</sub>(√((v − 0,1)² + 1) + v − 0,1)</div>
      <div class="eq"><span class="eq-l">v</span> = ${fmt(res.fresnel.v, 2)} → <span class="eq-l">L<sub>obs</sub></span> = <b>${fmt(b.obsLoss, 2)} dB</b></div>
      <p class="muted">Estimació amb una sola aresta de ganivet (ITU-R P.526) a partir del perfil del simulador 3.</p>
    </li>` : ''}
    <li>
      <h4>Potència rebuda</h4>
      <div class="eq formula"><span class="eq-l">P<sub>RX</sub></span> = P<sub>TX</sub> − L<sub>TX</sub> + G<sub>TX${mis ? ',ef' : ''}</sub> − FSPL${obs ? ' − L<sub>obs</sub>' : ''} + G<sub>RX${mis ? ',ef' : ''}</sub> − L<sub>RX</sub></div>
      <div class="eq"><span class="eq-l">P<sub>RX</sub></span> = ${n(state.ptx)} − ${n(res.ltx)} + ${n(res.tx.gEf)} − ${n(b.fspl)}${obs ? ` − ${n(b.obsLoss)}` : ''} + ${n(res.rx.gEf)} − ${n(res.lrx)} = <b>${fmt(b.prx, 2)} dBm</b></div>
    </li>
    <li>
      <h4>Marge de recepció</h4>
      <div class="eq formula"><span class="eq-l">M</span> = P<sub>RX</sub> − S<sub>RX</sub></div>
      <div class="eq"><span class="eq-l">M</span> = ${n(b.prx)} − ${n(state.sens)} = <b>${fmt(b.margin, 2)} dB</b></div>
      <p class="muted">Marge mínim desitjat: ${fmt(state.minMargin, 1)} dB → ${b.margin >= state.minMargin ? 'el marge és suficient.' : b.margin >= 0 ? 'el marge és reduït.' : 'la potència rebuda és inferior a la sensibilitat.'}</p>
    </li>
  </ol>
  <p class="fine">Les potències absolutes s'expressen en dBm; els guanys i les pèrdues, en dB (o dBi per a les antenes). Per això el balanç es fa amb sumes i restes.</p>`;
}
