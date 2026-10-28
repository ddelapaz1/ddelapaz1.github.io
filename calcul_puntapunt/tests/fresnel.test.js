import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fresnelRadiusM, earthBulgeM, knifeEdgeLossDb, analyzeProfile, requiredHeight, syntheticGround } from '../src/js/engine/fresnel.js';
import { haversineKm, bearingDeg, intermediatePoint } from '../src/js/engine/geo.js';
import { DEFAULT_STATE, cloneState, evaluate } from '../src/js/engine/model.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} esperat ${b}, obtingut ${a}`);
const flat = (n, z = 100) => Array.from({ length: n }, () => z);

test('radi de la 1a zona de Fresnel', () => {
  // 2 km a 5,8 GHz, punt mig: √(λ·d1·d2/d) ≈ 5,08 m
  near(fresnelRadiusM(1, 1, 5.8), 5.083, 0.002);
  // Coincideix amb la fórmula pràctica 17,32·√(d1·d2/(f·d))
  near(fresnelRadiusM(3, 7, 2.4), 17.32 * Math.sqrt((3 * 7) / (2.4 * 10)), 0.01);
  // Màxim al punt mig i nul als extrems
  assert.ok(fresnelRadiusM(5, 5, 5) > fresnelRadiusM(2, 8, 5));
  assert.equal(fresnelRadiusM(0, 10, 5), 0);
  // Quadruplicar la freqüència redueix el radi a la meitat
  near(fresnelRadiusM(5, 5, 20) / fresnelRadiusM(5, 5, 5), 0.5, 1e-9);
});

test('protuberància de la Terra', () => {
  near(earthBulgeM(25, 25, 4 / 3), 625 / (12.742 * 4 / 3), 0.01);
  near(earthBulgeM(25, 25, 4 / 3), 36.79, 0.02);
  assert.equal(earthBulgeM(10, 10, Infinity), 0);
  assert.ok(earthBulgeM(10, 10, 2 / 3) > earthBulgeM(10, 10, 4 / 3));
});

test('difracció en aresta de ganivet (ITU-R P.526)', () => {
  near(knifeEdgeLossDb(0), 6.03, 0.01, 'rasant: ≈ 6 dB');
  assert.equal(knifeEdgeLossDb(-1), 0);
  assert.ok(knifeEdgeLossDb(1) > knifeEdgeLossDb(0));
  near(knifeEdgeLossDb(2.4), 20.4, 0.2);
});

test('terreny pla i antenes altes: Fresnel lliure', () => {
  const r = analyzeProfile({ distKm: 2, ground: flat(101), hTx: 30, hRx: 30, fGHz: 5.8, k: 4 / 3 });
  assert.equal(r.status, 'clear');
  assert.equal(r.diffLossDb, 0);
  near(r.r1Mid, 5.083, 0.002);
});

test('un turó que talla la línia: sense visió directa i pèrdua per difracció', () => {
  const g = flat(101);
  g[50] = 200; // turó de 100 m al mig
  const r = analyzeProfile({ distKm: 10, ground: g, hTx: 30, hRx: 30, fGHz: 5.8, k: Infinity });
  assert.equal(r.status, 'blocked');
  near(r.worst.d, 5, 1e-9);
  near(r.minClearance, 130 - 200, 1e-9);
  assert.ok(r.diffLossDb > 20);
});

test('obstacle parcial dins la 1a zona de Fresnel', () => {
  const base = { distKm: 2, ground: flat(101), hTx: 20, hRx: 20, fGHz: 5.8, k: Infinity };
  // Obstacle que deixa 2 m de marge sobre un radi de 5,08 m (39 %)
  const r = analyzeProfile({ ...base, obstacles: [{ dKm: 1, h: 18 }] });
  assert.equal(r.status, 'partial');
  near(r.minRatio, 2 / 5.083, 0.002);
  assert.ok(r.diffLossDb >= 0 && r.diffLossDb < 6);
});

test('la curvatura de la Terra pot obstruir un enllaç llarg sobre terreny pla', () => {
  const base = { distKm: 40, ground: flat(201, 0), hTx: 30, hRx: 30, fGHz: 5.8 };
  assert.equal(analyzeProfile({ ...base, k: Infinity }).status, 'clear');
  assert.notEqual(analyzeProfile({ ...base, k: 4 / 3 }).status, 'clear');
});

test('altura necessària per obtenir el 60 % de la 1a zona lliure', () => {
  const p = { distKm: 10, ground: syntheticGround(10), hTx: 20, hRx: 10, fGHz: 5.8, k: 4 / 3, req: 0.6 };
  const h = requiredHeight(p, 'rx');
  assert.ok(h > 10);
  near(analyzeProfile({ ...p, hRx: h }).minRatio, 0.6, 0.01);
  const hb = requiredHeight(p, 'both');
  near(analyzeProfile({ ...p, hTx: hb, hRx: hb }).minRatio, 0.6, 0.01);
});

test('geodèsia', () => {
  const bcn = { lat: 41.3870, lon: 2.1700 };
  const mad = { lat: 40.4168, lon: -3.7038 };
  near(haversineKm(bcn, mad), 505, 3);
  near(bearingDeg(bcn, mad), 257, 3);
  near(bearingDeg({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }), 0, 1e-9);
  const m = intermediatePoint(bcn, mad, 0.5);
  near(haversineKm(bcn, m), haversineKm(bcn, mad) / 2, 0.01);
});

test('el perfil s\'integra al balanç com una pèrdua explícita sense alterar la FSPL', () => {
  const s = cloneState(DEFAULT_STATE);
  const e0 = evaluate(s);
  const g = flat(101);
  g[50] = 160;
  s.path = { a: null, b: null, distKm: 2, ground: g, source: 'test' };
  const e1 = evaluate(s);
  assert.equal(e1.budget.fspl, e0.budget.fspl);
  assert.ok(e1.budget.obsLoss > 0);
  near(e1.budget.prx, e0.budget.prx - e1.budget.obsLoss, 1e-9);
  assert.equal(e1.budget.steps.at(-1).level, e1.budget.prx);
  s.applyDiffraction = false;
  near(evaluate(s).budget.prx, e0.budget.prx, 1e-9);
  // Si es canvia la distància, el perfil deixa de ser vàlid i no s'aplica
  s.applyDiffraction = true;
  s.dKm = 3;
  assert.equal(evaluate(s).fresnel, null);
  assert.equal(evaluate(s).budget.obsLoss, 0);
});

test('les cotes del terreny afecten l\'elevació necessària de les antenes', () => {
  const s = cloneState(DEFAULT_STATE);
  const g = flat(101, 100);
  g[100] = 300; // RX 200 m més amunt
  s.path = { a: null, b: null, distKm: 2, ground: g, source: 'test' };
  const e = evaluate(s);
  near(e.e0, Math.atan2(200, 2000) * 180 / Math.PI, 1e-9);
  assert.ok(e.tx.mis > 0, 'amb les antenes horitzontals hi ha desalineació vertical');
});
