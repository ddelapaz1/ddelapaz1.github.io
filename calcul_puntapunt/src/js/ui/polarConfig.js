// Opcions dels diagrames polars (pla horitzontal o vertical), compartides per la vista i l'informe.

import { linkDirections, gainToward } from '../engine/model.js';
import { dirFromAngles, absAzimuth } from '../engine/geometry.js';

const DEG = Math.PI / 180;

export function polarOptions(state, res, side, plane) {
  const a = state.ant[side];
  const r = res[side];
  const m = r.model;
  const dirs = linkDirections(state);
  const otherLabel = side === 'tx' ? 'cap a RX' : 'cap a TX';
  if (plane === 'H') {
    const eCut = dirs.reqEl[side];
    return {
      side, gMax: m.gain, gEf: r.gEf, bore: absAzimuth(side, a.az), bw: m.omni ? null : m.bwH,
      other: side === 'tx' ? 0 : 180, otherLabel,
      gainAt: (b) => gainToward(a, side, m, dirFromAngles(b, eCut)),
    };
  }
  return {
    side, gMax: m.gain, gEf: r.gEf, bore: side === 'tx' ? a.el : 180 - a.el, bw: m.bwV,
    other: side === 'tx' ? dirs.e0 : 180 + dirs.e0, otherLabel,
    gainAt: (g) => gainToward(a, side, m, [Math.cos(g * DEG), 0, Math.sin(g * DEG)]),
  };
}
