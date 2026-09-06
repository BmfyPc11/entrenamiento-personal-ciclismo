import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mejoresSplits, volumen } from '../lib/amigos.js';

/* distancia en metros, como en la base de datos. Una salida "llana" tiene
   poco desnivel; una "dura" pasa el minimo de montana/colina. */
const llana = (id, over = {}) =>
  ({ id, fecha: '2026-06-01T08:00:00.000Z', distancia: 45000, desnivel: 80, tiempoMovimiento: 5400, ...over });
const dura = (id, over = {}) =>
  ({ id, fecha: '2026-06-02T08:00:00.000Z', distancia: 45000, desnivel: 900, tiempoMovimiento: 7200, ...over });

test('mejoresSplits se queda con el tiempo mas rapido de cada distancia', () => {
  const r = mejoresSplits([llana(1), llana(2)], { 1: { 5: 600, 10: 1300 }, 2: { 5: 540, 10: 1400 } });
  assert.equal(r[5].segundos, 540);
  assert.equal(r[5].salidaId, 2);
  assert.equal(r[10].segundos, 1300);
  assert.equal(r[20], null);
});

test('mejoresSplits ignora los splits de salidas que no son llanas', () => {
  const r = mejoresSplits([llana(1), dura(2)], { 1: { 5: 600 }, 2: { 5: 400 } });
  assert.equal(r[5].segundos, 600);
  assert.equal(r[5].salidaId, 1);
});

test('mejoresSplits sin datos devuelve null en cada distancia', () => {
  const r = mejoresSplits([], {});
  assert.equal(r[5], null);
  assert.equal(r[80], null);
});

test('volumen agrega salidas, km, desnivel y horas por ventana', () => {
  const ahora = Date.parse('2026-07-01T00:00:00.000Z');
  const salidas = [
    { id: 1, fecha: '2026-06-20T08:00:00.000Z', distancia: 40000, desnivel: 500, tiempoMovimiento: 3600 },
    { id: 2, fecha: '2026-01-10T08:00:00.000Z', distancia: 60000, desnivel: 300, tiempoMovimiento: 7200 },
    { id: 3, fecha: '2024-01-10T08:00:00.000Z', distancia: 20000, desnivel: 100, tiempoMovimiento: 1800 },
  ];
  const v = volumen(salidas, ahora);
  assert.equal(v.dias30.salidas, 1);
  assert.equal(v.dias30.km, 40);
  assert.equal(v.meses12.salidas, 2);
  assert.equal(v.meses12.km, 100);
  assert.equal(v.historico.salidas, 3);
  assert.equal(v.historico.km, 120);
  assert.equal(v.historico.desnivel, 900);
  assert.equal(v.historico.horas, (3600 + 7200 + 1800) / 3600);
});

test('volumen con lista vacia da ceros en las tres ventanas', () => {
  const v = volumen([], Date.now());
  for (const k of ['dias30', 'meses12', 'historico']) {
    assert.deepEqual(v[k], { salidas: 0, km: 0, desnivel: 0, horas: 0 });
  }
});
