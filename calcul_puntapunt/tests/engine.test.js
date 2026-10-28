import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fsplDb, computeBudget, cableLossDb, eirpDbm } from '../src/js/engine/linkBudget.js';
import { antennaModel, relativeGainDb, familyForGain, FAMILIES } from '../src/js/engine/antennas.js';
import { besselJ0, besselJ1, besselJ2 } from '../src/js/engine/bessel.js';
import { dirFromAngles, toLocal } from '../src/js/engine/geometry.js';
import { DEFAULT_STATE, cloneState, evaluate, alignedOrientation } from '../src/js/engine/model.js';
import { fmt, parseNum } from '../src/js/engine/format.js';
import { describeChanges } from '../src/js/engine/messages.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} esperat ${b}, obtingut ${a}`);

const REF = { ptx: 20, fGHz: 5.8, dKm: 2, ltx: 2, lrx: 2, gtx: 20, grx: 20, sens: -80, minMargin: 10 };

test('cas de referència: FSPL, potència rebuda i marge', () => {
  const b = computeBudget(REF);
  near(b.fspl, 113.74, 0.005, 'FSPL');
  near(b.prx, -57.74, 0.005, 'PRX');
  near(b.margin, 22.26, 0.005, 'Marge');
  near(b.eirp, 38, 1e-9, 'PIRE');
  assert.equal(b.status, 'ok');
});

test('el cas de referència coincideix amb el model complet i l\'estat inicial', () => {
  const e = evaluate(DEFAULT_STATE);
  near(e.budget.fspl, 113.74, 0.005);
  near(e.budget.prx, -57.74, 0.005);
  near(e.budget.margin, 22.26, 0.005);
  near(e.tx.mis, 0, 1e-9, 'sense desalineació TX');
  near(e.rx.mis, 0, 1e-9, 'sense desalineació RX');
});

test('duplicar la distància suma ≈ 6,02 dB a la FSPL', () => {
  near(fsplDb(4, 5800) - fsplDb(2, 5800), 6.0206, 1e-3);
});

test('duplicar la freqüència suma ≈ 6,02 dB a la FSPL', () => {
  near(fsplDb(2, 11600) - fsplDb(2, 5800), 6.0206, 1e-3);
});

test('la FSPL rebutja distàncies o freqüències no vàlides', () => {
  assert.throws(() => fsplDb(0, 5800));
  assert.throws(() => fsplDb(-1, 5800));
  assert.throws(() => fsplDb(1, 0));
});

test('+3 dB de potència TX → +3 dB de potència RX', () => {
  near(computeBudget({ ...REF, ptx: 23 }).prx - computeBudget(REF).prx, 3, 1e-9);
});

test('+3 dB de guany RX → +3 dB de potència RX', () => {
  near(computeBudget({ ...REF, grx: 23 }).prx - computeBudget(REF).prx, 3, 1e-9);
});

test('+2 dB de pèrdues al cable TX → −2 dB de potència RX', () => {
  near(computeBudget({ ...REF, ltx: 4 }).prx - computeBudget(REF).prx, -2, 1e-9);
});

test('la cascada del balanç acaba exactament en la potència rebuda', () => {
  const b = computeBudget({ ...REF, misTx: 3.2, misRx: 1.1 });
  assert.equal(b.steps.at(-1).level, b.prx);
  const sum = b.steps.reduce((acc, s) => acc + s.delta, REF.ptx);
  near(sum, b.prx, 1e-9);
});

test('pèrdua de cable detallada', () => {
  near(cableLossDb({ lengthM: 25, attDb100: 40, connDb: 0.6 }, true), 10.6, 1e-9);
  assert.equal(cableLossDb({ lossDb: 3 }, false), 3);
  near(eirpDbm(20, 2, 20), 38, 1e-12);
});

test('desalinear una antena no modifica la FSPL però sí la potència rebuda', () => {
  const s = cloneState(DEFAULT_STATE);
  const e0 = evaluate(s);
  s.ant.tx.az = 10;
  s.ant.rx.el = 4;
  const e1 = evaluate(s);
  assert.equal(e1.budget.fspl, e0.budget.fspl);
  assert.ok(e1.budget.prx < e0.budget.prx);
  near(e1.budget.prx, e0.budget.prx - e1.tx.mis - e1.rx.mis, 1e-9, 'les pèrdues s\'acumulen');
});

test('amb les antenes alineades s\'obté el guany efectiu màxim', () => {
  for (const family of Object.keys(FAMILIES)) {
    const s = cloneState(DEFAULT_STATE);
    s.ant.tx.family = family; s.ant.rx.family = family;
    s.ant.tx.gain = FAMILIES[family].range[1]; s.ant.rx.gain = FAMILIES[family].range[1];
    s.ant.rx.h = 120; // enllaç inclinat
    Object.assign(s.ant.tx, alignedOrientation(s).tx);
    Object.assign(s.ant.rx, alignedOrientation(s).rx);
    const e = evaluate(s);
    near(e.tx.gEf, s.ant.tx.gain, 1e-9, `${family} TX`);
    near(e.rx.gEf, s.ant.rx.gain, 1e-9, `${family} RX`);
    // Cap altra orientació propera dona més guany
    for (const d of [-0.5, 0.5]) {
      const t = cloneState(s); t.ant.tx.az += d; t.ant.rx.el += d;
      const et = evaluate(t);
      assert.ok(et.tx.gEf <= e.tx.gEf + 1e-12 && et.rx.gEf <= e.rx.gEf + 1e-12);
    }
  }
});

test('funcions de Bessel', () => {
  near(besselJ0(0), 1, 1e-7); near(besselJ0(2.404826), 0, 1e-5);
  near(besselJ1(3.831706), 0, 1e-5); near(besselJ2(5.135622), 0, 1e-5);
  near(besselJ2(10), 0.2546303, 1e-6);
  for (const x of [0.5, 2, 4, 7.9, 9]) near(besselJ2(x), 2 * besselJ1(x) / x - besselJ0(x), 1e-6, `J2(${x})`);
});

function beamwidthMeasured(model, plane) {
  // Busca l'angle on el guany relatiu val −3,01 dB en el pla indicat.
  let lo = 0, hi = 179;
  const at = (a) => relativeGainDb(model, plane === 'H' ? dirFromAngles(a, 0) : dirFromAngles(0, a));
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (at(m) > -3.0103) lo = m; else hi = m; }
  return 2 * lo;
}

test('el diagrama de radiació és coherent amb l\'ample de feix a −3 dB', () => {
  for (const [fam, g] of [['parabolica', 35], ['parabolica', 20], ['panell', 18], ['yagi', 14]]) {
    const m = antennaModel(fam, g);
    near(relativeGainDb(m, [1, 0, 0]), 0, 1e-9, `${fam} màxim a l'eix`);
    near(beamwidthMeasured(m, 'H'), m.bwH, 0.02, `${fam} θH`);
    near(beamwidthMeasured(m, 'V'), m.bwV, 0.02, `${fam} θV`);
    near(relativeGainDb(m, [-1, 0, 0]), -m.fb, 1e-6, `${fam} relació davant-darrere`);
  }
  const omni = antennaModel('omni', 8);
  for (const az of [0, 47, 133, 180, 270]) near(relativeGainDb(omni, dirFromAngles(az, 0)), 0, 1e-9, 'omni azimutal');
  near(beamwidthMeasured(omni, 'V'), omni.bwV, 0.05, 'omni θV');
});

test('més guany implica feix més estret (Kraus)', () => {
  const a = antennaModel('parabolica', 25), b = antennaModel('parabolica', 35);
  assert.ok(b.bwH < a.bwH);
  near(10 * Math.log10(30000 / (b.bwH * b.bwV)), 35, 1e-9);
});

test('la parabòlica presenta lòbuls laterals per sota del principal', () => {
  const m = antennaModel('parabolica', 35);
  const vals = [];
  for (let a = 0; a <= 30; a += 0.05) vals.push(relativeGainDb(m, dirFromAngles(a, 0)));
  const maxima = vals.filter((v, i) => i > 0 && i < vals.length - 1 && v > vals[i - 1] && v >= vals[i + 1]);
  assert.ok(maxima.length >= 2, 'hi ha lòbuls secundaris');
  assert.ok(Math.max(...maxima) < -20, 'el primer lòbul lateral és inferior a −20 dB');
});

test('una antena de feix ample pot superar una d\'alt guany mal orientada', () => {
  const s = cloneState(DEFAULT_STATE);
  s.ant.tx = { ...s.ant.tx, family: 'parabolica', gain: 35, az: 3.5 };
  s.ant.rx = { ...s.ant.rx, family: 'parabolica', gain: 35, az: 3.5 };
  const dish = evaluate(s);
  s.ant.tx = { ...s.ant.tx, family: 'panell', gain: 18 };
  s.ant.rx = { ...s.ant.rx, family: 'panell', gain: 18 };
  const panel = evaluate(s);
  assert.ok(panel.budget.prx > dish.budget.prx, `panell ${panel.budget.prx} vs parabòlica ${dish.budget.prx}`);
});

test('coordenades locals', () => {
  const l = toLocal(30, 0, dirFromAngles(30, 0));
  near(l[0], 1, 1e-12);
  const r = toLocal(0, 10, dirFromAngles(0, 0));
  near(r[2], -Math.sin(10 * Math.PI / 180), 1e-12);
});

test('canvi automàtic de família en sortir del rang de guany', () => {
  assert.equal(familyForGain('parabolica', 30), 'parabolica');
  assert.equal(familyForGain('parabolica', 10), 'panell');
  assert.equal(familyForGain('parabolica', 2), 'omni');
  assert.equal(familyForGain('omni', 38), 'parabolica');
});

test('format numèric en català', () => {
  assert.equal(fmt(-57.739, 2), '−57,74');
  assert.equal(fmt(3, 1, { sign: true }), '+3,0');
  assert.equal(fmt(-0.001, 1), '0,0');
  assert.equal(parseNum('5,8'), 5.8);
  assert.equal(parseNum('−80'), -80);
  assert.ok(Number.isNaN(parseNum('abc')));
  assert.ok(Number.isNaN(parseNum('')));
});

test('els missatges de variació es generen a partir dels càlculs', () => {
  const a = cloneState(DEFAULT_STATE);
  const b = cloneState(DEFAULT_STATE); b.dKm = 4;
  const m = describeChanges(a, b, evaluate(a), evaluate(b));
  assert.match(m.causes[0], /duplicat/);
  assert.match(m.effects.join(' '), /FSPL ha augmentat 6,0/);
  const c = cloneState(DEFAULT_STATE); c.ant.rx.gain = 23;
  const m2 = describeChanges(a, c, evaluate(a), evaluate(c));
  assert.match(m2.effects.join(' '), /potència rebuda ha augmentat 3,0/);
  assert.match(m2.effects.join(' '), /FSPL no canvia/);
});
