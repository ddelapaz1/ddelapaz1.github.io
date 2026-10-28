// Textos d'ajuda (tooltips) i explicacions del mode d'explicació.

import { h } from './dom.js';

export const GLOSSARY = {
  dBm: 'dBm: potència absoluta en decibels respecte d\'1 mW. 0 dBm = 1 mW, 20 dBm = 100 mW, 30 dBm = 1 W, −90 dBm = 1 pW. Cada +3 dB duplica la potència.',
  dB: 'dB: relació entre dues potències (guany o pèrdua). No és una potència: s\'aplica sumant o restant als nivells en dBm.',
  dBi: 'dBi: guany d\'una antena respecte d\'una antena isòtropa ideal, que radiaria igual en totes les direccions.',
  FSPL: 'FSPL (Free Space Path Loss): pèrdua de propagació en l\'espai lliure. Només depèn de la distància i de la freqüència. FSPL = 32,45 + 20·log(d km) + 20·log(f MHz).',
  directivitat: 'Directivitat: capacitat d\'una antena de concentrar la radiació en una direcció. Més directivitat implica més guany màxim i un feix més estret.',
  ampleFeix: 'Ample de feix a −3 dB: angle entre les dues direccions on el guany cau 3 dB (la meitat de potència) respecte del màxim.',
  sensibilitat: 'Sensibilitat del receptor: potència mínima, en dBm, que necessita el receptor per funcionar correctament. Com més negativa, millor receptor.',
  marge: 'Marge de recepció: diferència entre la potència rebuda i la sensibilitat (M = PRX − S). És la reserva disponible davant de pèrdues no previstes.',
  PIRE: 'PIRE (potència isòtropa radiada equivalent, en anglès EIRP): PIRE = PTX − LTX + GTX. És la potència que hauria de rebre una antena isòtropa per radiar la mateixa densitat de potència en la direcció del màxim.',
  cable: 'Pèrdua del cable: atenuació del cable coaxial i dels connectors. Augmenta amb la longitud del cable i amb la freqüència.',
  minMargin: 'Marge mínim desitjat: reserva que vols garantir per considerar que l\'enllaç té un marge suficient. Sol estar entre 10 i 20 dB segons la fiabilitat requerida.',
  azimut: 'Desviació azimutal: angle horitzontal entre l\'eix de l\'antena i la direcció cap a l\'altre extrem. 0° = apuntant exactament. Positiu = gir antihorari en la vista en planta.',
  elevacio: 'Elevació: inclinació vertical de l\'eix de l\'antena respecte de l\'horitzontal. Si les antenes estan a altures diferents, cal inclinar-les per encarar-les.',
  guanyEf: 'Guany efectiu: guany de l\'antena en la direcció real de l\'altre extrem. Coincideix amb el guany nominal només si l\'antena està ben orientada.',
  altura: 'Altura de l\'antena sobre el terreny. Una diferència d\'altures entre extrems obliga a inclinar les antenes.',
  fresnel: '1a zona de Fresnel: el·lipsoide al voltant de la línia de visió on viatja la major part de l\'energia. El radi és màxim al punt mig: r₁ = 17,32·√(d₁·d₂ / (f·d)) m, amb d en km i f en GHz. Com més freqüència, més estreta.',
  curvatura: 'Protuberància de la Terra respecte de la línia recta entre extrems: h = d₁·d₂ / (12,74·k) m. El factor k modela la refracció atmosfèrica (k = 4/3 en atmosfera estàndard).',
  marginF: 'Marge sobre la línia de visió en el punt més desfavorable, en metres i en percentatge del radi de la 1a zona de Fresnel. Es recomana un mínim del 60 % lliure.',
  difraccio: 'Pèrdua addicional quan un obstacle s\'acosta o talla la línia de visió. S\'estima amb el paràmetre v d\'una aresta de ganivet: 0 dB si v < −0,78; uns 6 dB si l\'obstacle és rasant (v = 0).',
  kfactor: 'Factor k (radi terrestre equivalent): la refracció de l\'atmosfera corba les ones. Amb k = 4/3 la Terra sembla més plana; amb k < 1 (condicions desfavorables) la protuberància és més gran.',
};

export const EXPLAIN = {
  tx: {
    titol: 'Equip transmissor (TX)',
    text: 'Genera el senyal de radiofreqüència. La seva potència de sortida s\'expressa en dBm, és a dir, en decibels respecte d\'1 mW (20 dBm = 100 mW).',
  },
  cableTx: {
    titol: 'Cable coaxial de transmissió',
    text: 'El cable i els connectors atenuen el senyal abans d\'arribar a l\'antena. La pèrdua s\'expressa en dB i es resta del nivell en dBm. Com més llarg és el cable i més alta la freqüència, més pèrdues.',
  },
  antTx: {
    titol: 'Antena transmissora',
    text: 'L\'antena no amplifica: concentra la potència en una direcció. El guany en dBi compara aquesta concentració amb una antena isòtropa ideal. Després de l\'antena tenim la PIRE.',
  },
  space: {
    titol: 'Propagació en l\'espai lliure',
    text: 'La potència es distribueix sobre una superfície cada vegada més gran a mesura que augmenta la distància. En el model d\'espai lliure, la densitat de potència disminueix proporcionalment al quadrat de la distància. Duplicar la distància (o la freqüència) augmenta la FSPL uns 6 dB.',
  },
  antRx: {
    titol: 'Antena receptora',
    text: 'Capta una part de la potència que li arriba. El seu guany s\'aplica igual que en transmissió: una antena té el mateix diagrama de radiació quan transmet i quan rep (reciprocitat).',
  },
  cableRx: {
    titol: 'Cable coaxial de recepció',
    text: 'Torna a atenuar el senyal, ara ja molt feble, abans d\'arribar al receptor. Per això en molts enllaços l\'equip de ràdio es col·loca al costat de l\'antena.',
  },
  rx: {
    titol: 'Equip receptor (RX)',
    text: 'Necessita un nivell mínim de senyal (sensibilitat) per funcionar. El marge de recepció és la diferència entre la potència rebuda i aquesta sensibilitat.',
  },
  profile: {
    titol: 'Perfil del terreny',
    text: 'L\'àrea marró és el terreny (sumant-hi la protuberància de la Terra); la franja blava és la 1a zona de Fresnel i la línia discontínua, el límit del percentatge lliure requerit. Els trams vermells o taronja indiquen on el terreny l\'envaeix.',
  },
  level: {
    titol: 'Diagrama de nivells',
    text: 'La línia mostra el nivell absolut del senyal (dBm) a cada punt de la cadena. Les etiquetes amb vora mostren els guanys i pèrdues relatius (dB). La corba de la FSPL cau molt de pressa al principi: en dB, cada duplicació de la distància resta uns 6 dB.',
  },
};

export function helpIcon(term) {
  return h('button', { class: 'help', type: 'button', 'data-help': term, 'aria-label': `Ajuda: ${term}`, text: '?' });
}

export function initTooltips() {
  const tip = document.getElementById('tooltip');
  let current = null;
  const show = (el) => {
    const key = el.dataset.help;
    const text = GLOSSARY[key] || key;
    tip.textContent = text;
    tip.classList.add('visible');
    const r = el.getBoundingClientRect();
    const tw = Math.min(320, window.innerWidth - 24);
    tip.style.maxWidth = `${tw}px`;
    const tr = tip.getBoundingClientRect();
    let x = r.left + r.width / 2 - tr.width / 2;
    x = Math.max(12, Math.min(window.innerWidth - tr.width - 12, x));
    let y = r.bottom + 8;
    if (y + tr.height > window.innerHeight - 8) y = r.top - tr.height - 8;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
    current = el;
  };
  const hide = () => { tip.classList.remove('visible'); current = null; };
  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest?.('[data-help]');
    if (el) show(el); else if (current) hide();
  });
  document.addEventListener('focusin', (e) => {
    const el = e.target.closest?.('[data-help]');
    if (el) show(el);
  });
  document.addEventListener('focusout', hide);
  document.addEventListener('click', (e) => {
    const el = e.target.closest?.('[data-help]');
    if (el) { e.preventDefault(); show(el); }
  });
  window.addEventListener('scroll', hide, true);
}
