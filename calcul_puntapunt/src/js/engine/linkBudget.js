// Motor de càlcul del balanç de potències (model d'espai lliure).
// Totes les potències absolutes en dBm; guanys i pèrdues en dB / dBi.

export const FSPL_CONST = 32.45; // per a d en km i f en MHz

export function fsplDb(dKm, fMHz) {
  if (!(dKm > 0) || !(fMHz > 0)) throw new RangeError('La distància i la freqüència han de ser positives');
  return FSPL_CONST + 20 * Math.log10(dKm) + 20 * Math.log10(fMHz);
}

// Pèrdua d'un cable: directa o a partir de longitud, atenuació específica i connectors.
export function cableLossDb(cable, detailed) {
  if (!detailed) return cable.lossDb;
  return (cable.lengthM * cable.attDb100) / 100 + cable.connDb;
}

export function eirpDbm(ptxDbm, ltxDb, gtxDbi) {
  return ptxDbm - ltxDb + gtxDbi;
}

export function receivedPowerDbm({ ptx, ltx, gtx, fspl, grx, lrx }) {
  return ptx - ltx + gtx - fspl + grx - lrx;
}

export function marginDb(prxDbm, sensDbm) {
  return prxDbm - sensDbm;
}

export function linkStatus(margin, minMargin) {
  if (margin >= minMargin) return 'ok';
  if (margin >= 0) return 'low';
  return 'fail';
}

export const STATUS_INFO = {
  ok: {
    titol: 'Enllaç amb marge suficient',
    curt: 'Marge suficient',
    text: 'La potència rebuda supera la sensibilitat amb una reserva igual o superior al marge mínim desitjat.',
  },
  low: {
    titol: 'Enllaç amb marge reduït',
    curt: 'Marge reduït',
    text: 'La potència rebuda supera la sensibilitat, però amb poca reserva davant d\'esvaïments, pluja o envelliment dels equips.',
  },
  fail: {
    titol: 'Enllaç per sota del llindar',
    curt: 'Per sota del llindar',
    text: 'La potència rebuda no arriba a la sensibilitat requerida pel receptor.',
  },
};

// p: { ptx, fGHz, dKm, ltx, lrx, gtx, grx, misTx, misRx, obsLoss, sens, minMargin }
// obsLoss: pèrdua addicional per obstacles (difracció), separada explícitament de la FSPL.
export function computeBudget(p) {
  const misTx = p.misTx || 0;
  const misRx = p.misRx || 0;
  const obsLoss = p.obsLoss || 0;
  const fspl = fsplDb(p.dKm, p.fGHz * 1000);
  const gtxEf = p.gtx - misTx;
  const grxEf = p.grx - misRx;
  const eirp = eirpDbm(p.ptx, p.ltx, p.gtx);
  const eirpEf = eirp - misTx;
  const prx = receivedPowerDbm({ ptx: p.ptx, ltx: p.ltx, gtx: gtxEf, fspl, grx: grxEf, lrx: p.lrx }) - obsLoss;
  const margin = marginDb(prx, p.sens);
  const status = linkStatus(margin, p.minMargin);

  const steps = [];
  let level = p.ptx;
  steps.push({ id: 'tx', kind: 'level', label: 'Potència TX', delta: 0, level });
  const add = (id, kind, label, delta) => {
    level += delta;
    steps.push({ id, kind, label, delta, level });
  };
  add('cableTx', 'loss', 'Cable TX', -p.ltx);
  add('antTx', 'gain', 'Antena TX', p.gtx);
  add('misTx', 'mis', 'Desalineació TX', -misTx);
  add('fspl', 'loss', 'FSPL', -fspl);
  add('obst', 'obs', 'Obstacles', -obsLoss);
  add('antRx', 'gain', 'Antena RX', p.grx);
  add('misRx', 'mis', 'Desalineació RX', -misRx);
  add('cableRx', 'loss', 'Cable RX', -p.lrx);
  steps.push({ id: 'rx', kind: 'level', label: 'Potència RX', delta: 0, level });

  return {
    fspl, eirp, eirpEf, gtxEf, grxEf, misTx, misRx, obsLoss, prx, margin, status, steps,
    isoRx: eirpEf - fspl - obsLoss, // nivell disponible a l'antena RX (isòtropa)
  };
}
