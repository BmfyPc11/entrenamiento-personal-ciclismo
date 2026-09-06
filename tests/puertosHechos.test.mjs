import { test } from 'node:test';
import assert from 'node:assert/strict';
import { medirSegmentosManualesEnSalida } from '../lib/metrics.js';

/* Recta de norte a sur, un punto cada ~111 m (mayor que RADIO_SEGMENTO_MANUAL,
   100 m, asi cada indice cae claramente dentro o fuera del radio de su
   vecino). altitud sube 5 m por indice, tiempo 20 s por indice: cifras
   predecibles para construirPuerto. */
function streamsRecta(n) {
  const latlng = [], distancia = [], altitud = [], tiempo = [];
  for (let i = 0; i < n; i++) {
    latlng.push([i * 0.001, 2]);
    distancia.push(i * 100);
    altitud.push(i * 5);
    tiempo.push(i * 20);
  }
  return { latlng, distancia, altitud, tiempo };
}

const defEntre = (st, i, j, id = `${i}-${j}`) => ({
  id,
  nombre: id,
  latInicio: st.latlng[i][0], lonInicio: 2,
  latFin: st.latlng[j][0], lonFin: 2,
});

test('mide el segmento que la salida recorre', () => {
  const st = streamsRecta(50);
  const r = medirSegmentosManualesEnSalida(st, [defEntre(st, 10, 30, 'coll')]);
  assert.equal(r.length, 1);
  assert.equal(r[0].segmentoId, 'coll');
  assert.equal(r[0].inicio, 10);
  assert.equal(r[0].segundos, 400);       // tiempo[30] - tiempo[10]
  assert.equal(r[0].metros, 2000);        // distancia[30] - distancia[10]
  assert.equal(r[0].desnivel, 100);       // altitud[30] - altitud[10]
  assert.equal(Math.round(r[0].vam), 900);
});

test('una salida que no pasa cerca no produce nada', () => {
  const st = streamsRecta(50);
  const lejos = { id: 'x', nombre: 'x', latInicio: 40, lonInicio: 40, latFin: 41, lonFin: 41 };
  assert.deepEqual(medirSegmentosManualesEnSalida(st, [lejos]), []);
});

test('cada definicion se mide por separado', () => {
  const st = streamsRecta(60);
  const r = medirSegmentosManualesEnSalida(st, [defEntre(st, 5, 20, 'a'), defEntre(st, 25, 45, 'b')]);
  assert.deepEqual(r.map((x) => x.segmentoId).sort(), ['a', 'b']);
});

test('una salida que sube dos veces el mismo segmento cuenta dos intentos', () => {
  /* Dos pasadas ascendentes por la misma recta (intervalos en la misma
     cuesta): indices 0..25 y 26..51 recorren la misma progresion de
     coordenadas, con el tiempo corriendo sin parar. */
  const v = streamsRecta(26);
  const st = {
    latlng: [...v.latlng, ...v.latlng],
    distancia: [...v.distancia, ...v.distancia.map((d) => 2600 + d)],
    altitud: [...v.altitud, ...v.altitud],
    tiempo: [...v.tiempo, ...v.tiempo.map((t) => 520 + t)],
  };
  const r = medirSegmentosManualesEnSalida(st, [defEntre(v, 5, 20, 'repe')]);
  assert.equal(r.length, 2);
  assert.deepEqual(r.map((x) => x.inicio), [5, 31]);
});
