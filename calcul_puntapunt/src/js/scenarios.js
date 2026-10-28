// Escenaris educatius predefinits. Cada escenari defineix un estat complet i,
// opcionalment, una configuració de referència per a la comparació.

import { DEFAULT_STATE, cloneState } from './engine/model.js';

function make(patch) {
  const st = cloneState(DEFAULT_STATE);
  const { tx, rx, cableTx, cableRx, ...rest } = patch;
  Object.assign(st, rest);
  if (tx) Object.assign(st.ant.tx, tx);
  if (rx) Object.assign(st.ant.rx, rx);
  if (cableTx) Object.assign(st.cable.tx, cableTx);
  if (cableRx) Object.assign(st.cable.rx, cableRx);
  return st;
}

const dish29 = { family: 'parabolica', gain: 29 };

export const SCENARIOS = [
  {
    id: 'ideal',
    titol: 'Escenari 1. Enllaç ideal',
    text: 'Dues parabòliques de 29 dBi perfectament alineades a 10 km i 5,8 GHz. L\'enllaç té un marge de recepció ampli.',
    observa: 'Fixa\'t en el diagrama de nivells: la FSPL és, amb diferència, la pèrdua més gran, i els guanys de les antenes la compensen.',
    tab: 'balanc',
    state: make({ ptx: 20, fGHz: 5.8, dKm: 10, sens: -80, cableTx: { lossDb: 1 }, cableRx: { lossDb: 1 }, tx: dish29, rx: dish29 }),
  },
  {
    id: 'distancia',
    titol: 'Escenari 2. Distància excessiva',
    text: 'Enllaç a 8 km amb parabòliques petites de 23 dBi i un receptor de −78 dBm de sensibilitat.',
    observa: 'Prem el botó «×2» de la distància diverses vegades: cada duplicació augmenta la FSPL uns 6 dB i el marge es redueix fins que l\'enllaç queda per sota del llindar. Consulta també la gràfica «PRX vs distància».',
    tab: 'balanc',
    chart: 'd',
    state: make({ ptx: 18, fGHz: 5.8, dKm: 8, sens: -78, cableTx: { lossDb: 1.5 }, cableRx: { lossDb: 1.5 }, tx: { family: 'parabolica', gain: 23 }, rx: { family: 'parabolica', gain: 23 } }),
  },
  {
    id: 'frequencia',
    titol: 'Escenari 3. Increment de freqüència',
    text: 'El mateix enllaç de 5 km s\'ha desat com a referència a 2,4 GHz i ara funciona a 5,8 GHz. Els guanys es mantenen intencionadament constants (20 dBi).',
    observa: 'Compara la FSPL a la taula de comparació: passar de 2,4 a 5,8 GHz suma 20·log(5,8/2,4) ≈ 7,7 dB. Atenció: mantenir el guany en dBi a una freqüència més alta no equival a fer servir la mateixa antena física (una parabòlica del mateix diàmetre tindria més guany).',
    tab: 'balanc',
    chart: 'f',
    reference: make({ fGHz: 2.4, dKm: 5 }),
    refLabel: 'Mateix enllaç a 2,4 GHz',
    state: make({ fGHz: 5.8, dKm: 5 }),
  },
  {
    id: 'desalineada',
    titol: 'Escenari 4. Antena desalineada',
    text: 'Dues parabòliques de 32 dBi (feix de ≈ 4,4°) a 15 km. L\'antena TX està girada 5° en azimut i la RX està inclinada 3° cap amunt. Ben alineat, aquest enllaç tindria més de 20 dB de marge.',
    observa: 'Observa els diagrames polars: l\'altre extrem queda fora del lòbul principal. Gira les antenes arrossegant les manetes o prem «Alinear antenes» per veure com es recupera la potència rebuda.',
    tab: 'antenes',
    state: make({ ptx: 18, fGHz: 5.8, dKm: 15, sens: -75, cableTx: { lossDb: 1.5 }, cableRx: { lossDb: 1.5 }, tx: { family: 'parabolica', gain: 32, az: 5 }, rx: { family: 'parabolica', gain: 32, el: 3 } }),
  },
  {
    id: 'directivitat',
    titol: 'Escenari 5. Antenes de diferent directivitat',
    text: 'Referència: parabòliques de 35 dBi (feix de ≈ 3°) amb un error d\'orientació de 3,5° a cada extrem. Actual: panells de 18 dBi (feix de ≈ 22°) amb el mateix error.',
    observa: 'Tot i tenir 17 dB menys de guany nominal, els panells donen més potència rebuda perquè el seu feix ample tolera l\'error d\'orientació. Prem «Alinear antenes» i comprova que, ben alineades, les parabòliques sí que guanyen.',
    tab: 'antenes',
    reference: make({ dKm: 2, tx: { family: 'parabolica', gain: 35, az: 3.5 }, rx: { family: 'parabolica', gain: 35, az: 3.5 } }),
    refLabel: 'Parabòliques de 35 dBi desalineades 3,5°',
    state: make({ dKm: 2, tx: { family: 'panell', gain: 18, az: 3.5 }, rx: { family: 'panell', gain: 18, az: 3.5 } }),
  },
  {
    id: 'cables',
    titol: 'Escenari 6. Problemes de cablejat',
    text: 'Els equips són a la base de les torres i baixen 20 m (TX) i 18 m (RX) de cable coaxial que a 5,8 GHz atenua 39 dB/100 m, més 0,8 dB de connectors.',
    observa: 'Les pèrdues dels cables redueixen el marge fins a deixar-lo per sota del mínim desitjat. Prova de reduir la longitud a 2 m (equip de ràdio al costat de l\'antena) o de fer servir un cable de menys atenuació.',
    tab: 'balanc',
    state: make({ ptx: 20, fGHz: 5.8, dKm: 3, sens: -75, advancedCables: true,
      cableTx: { lengthM: 20, attDb100: 39, connDb: 0.8, lossDb: 8.6 }, cableRx: { lengthM: 18, attDb100: 39, connDb: 0.8, lossDb: 7.82 },
      tx: { family: 'parabolica', gain: 24 }, rx: { family: 'parabolica', gain: 24 } }),
  },
];

// Trajectes d'exemple per al simulador 3 (coordenades aproximades).
export const PATH_EXAMPLES = [
  {
    id: 'tibidabo-montjuic',
    nom: 'Tibidabo → Montjuïc (visió directa)',
    text: 'Dos punts elevats sobre Barcelona: el terreny queda molt per sota de la línia de visió.',
    tx: { lat: 41.4219, lon: 2.1186 }, rx: { lat: 41.3638, lon: 2.1660 }, hTx: 15, hRx: 15, fGHz: 5.8,
  },
  {
    id: 'bcn-santcugat',
    nom: 'Barcelona → Sant Cugat (Collserola entremig)',
    text: 'La serra de Collserola talla la línia de visió: cal molta altura o un repetidor.',
    tx: { lat: 41.3870, lon: 2.1700 }, rx: { lat: 41.4735, lon: 2.0855 }, hTx: 30, hRx: 30, fGHz: 5.8,
  },
  {
    id: 'montserrat-tibidabo',
    nom: 'Montserrat → Tibidabo (enllaç llarg)',
    text: 'Uns 36 km entre dos cims: la curvatura terrestre ja és apreciable.',
    tx: { lat: 41.6066, lon: 1.8113 }, rx: { lat: 41.4219, lon: 2.1186 }, hTx: 10, hRx: 20, fGHz: 5.8,
  },
  {
    id: 'delta',
    nom: 'Delta de l\'Ebre (terreny pla)',
    text: 'Terreny gairebé pla: amb antenes baixes, la 1a zona de Fresnel toca el terra i la curvatura hi contribueix.',
    tx: { lat: 40.7130, lon: 0.7110 }, rx: { lat: 40.6170, lon: 0.5930 }, hTx: 8, hRx: 8, fGHz: 5.8,
  },
];
