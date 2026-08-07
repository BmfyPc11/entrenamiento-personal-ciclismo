import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emparejarSegmento, elegirCima, buscarNombre, guardarNombre,
} from '../lib/nombres.js';

const ef = (nombre, inicio, fin, categoria = 0) => ({ nombre, inicio, fin, categoria });

test('sin efforts no hay nombre', () => {
  assert.equal(emparejarSegmento({ inicio: 100, fin: 200 }, []), null);
  assert.equal(emparejarSegmento({ inicio: 100, fin: 200 }, null), null);
});

test('solapamiento total devuelve el nombre', () => {
  const r = emparejarSegmento({ inicio: 100, fin: 200 }, [ef('Montjuïc', 100, 200)]);
  assert.equal(r, 'Montjuïc');
});

test('solapamiento parcial suficiente devuelve el nombre', () => {
  // subida 100-200, segmento 150-260: solapan 50 sobre un minimo de 100 -> 50 %
  const r = emparejarSegmento({ inicio: 100, fin: 200 }, [ef('Rat Penat', 150, 260)]);
  assert.equal(r, 'Rat Penat');
});

test('solapamiento insuficiente se descarta', () => {
  // solapan 20 sobre un minimo de 100 -> 20 %
  const r = emparejarSegmento({ inicio: 100, fin: 200 }, [ef('Otro', 180, 400)]);
  assert.equal(r, null);
});

test('sin solapamiento se descarta', () => {
  const r = emparejarSegmento({ inicio: 100, fin: 200 }, [ef('Lejos', 300, 400)]);
  assert.equal(r, null);
});

test('gana el catalogado como puerto aunque solape menos', () => {
  const r = emparejarSegmento({ inicio: 100, fin: 200 }, [
    ef('Rampa suelta', 100, 200, 0),
    ef('Sant Pere Màrtir', 120, 200, 3),
  ]);
  assert.equal(r, 'Sant Pere Màrtir');
});

test('a igual categoria gana el de mayor solapamiento', () => {
  const r = emparejarSegmento({ inicio: 100, fin: 200 }, [
    ef('Corto', 170, 200, 0),
    ef('Largo', 105, 200, 0),
  ]);
  assert.equal(r, 'Largo');
});

test('un effort sin nombre no cuenta', () => {
  const r = emparejarSegmento({ inicio: 100, fin: 200 }, [ef('', 100, 200)]);
  assert.equal(r, null);
});

/* ---------- elegir la cima entre los nodos de OSM ---------- */

const cand = (nombre, distancia, altitud) => ({ nombre, distancia, altitud });

test('sin candidatos no hay cima', () => {
  assert.equal(elegirCima([], 400), null);
  assert.equal(elegirCima(null, 400), null);
});

test('gana la altitud que cuadra aunque este mas lejos', () => {
  // el caso Sant Pere Martir: el pico cercano no cuadra en altura
  const r = elegirCima([
    cand('Turó del Temple', 360, 262),
    cand('Sant Pere Màrtir', 709, 389),
  ], 385);
  assert.equal(r.nombre, 'Sant Pere Màrtir');
});

test('entre dos que cuadran en altitud gana el mas cercano', () => {
  const r = elegirCima([
    cand('Lejos', 800, 400),
    cand('Cerca', 120, 395),
  ], 398);
  assert.equal(r.nombre, 'Cerca');
});

test('sin altitud que cuadre vale el mas cercano dentro de 300 m', () => {
  const r = elegirCima([cand('Vecino', 250, 120)], 400);
  assert.equal(r.nombre, 'Vecino');
});

test('sin altitud que cuadre y lejos de 300 m no hay nombre', () => {
  assert.equal(elegirCima([cand('Vecino', 450, 120)], 400), null);
});

test('los nodos sin nombre se descartan', () => {
  assert.equal(elegirCima([cand('', 50, 400)], 400), null);
  assert.equal(elegirCima([cand(null, 50, 400)], 400), null);
});

test('un nodo sin altitud solo vale por la regla de cercania', () => {
  assert.equal(elegirCima([cand('Sin ele', 200, null)], 400).nombre, 'Sin ele');
  assert.equal(elegirCima([cand('Sin ele', 500, null)], 400), null);
});

test('sin altitud de referencia se cae a la regla de cercania', () => {
  assert.equal(elegirCima([cand('Cerca', 100, 300)], null).nombre, 'Cerca');
  assert.equal(elegirCima([cand('Lejos', 900, 300)], null), null);
});

/* ---------- cache de nombres por proximidad ---------- */

const MONTJUIC = [41.3639, 2.1655];

test('sin entradas no encuentra nada', () => {
  assert.equal(buscarNombre([], MONTJUIC), null);
  assert.equal(buscarNombre(null, MONTJUIC), null);
});

test('encuentra una cima dentro del radio', () => {
  const e = guardarNombre([], MONTJUIC, 'Montjuïc', 'strava');
  // unos 90 m mas al norte
  const r = buscarNombre(e, [41.3647, 2.1655]);
  assert.equal(r.nombre, 'Montjuïc');
  assert.equal(r.fuente, 'strava');
});

test('no encuentra una cima fuera del radio', () => {
  const e = guardarNombre([], MONTJUIC, 'Montjuïc', 'strava');
  // unos 2 km al norte
  assert.equal(buscarNombre(e, [41.3820, 2.1655]), null);
});

test('el nombre manual gana al automatico en el mismo sitio', () => {
  let e = guardarNombre([], MONTJUIC, 'Sants-Montjuïc', 'osm');
  e = guardarNombre(e, [41.3641, 2.1657], 'Montjuïc per Miramar', 'manual');
  const r = buscarNombre(e, MONTJUIC);
  assert.equal(r.nombre, 'Montjuïc per Miramar');
  assert.equal(r.fuente, 'manual');
});

test('guardar dos veces el mismo sitio y fuente no duplica', () => {
  let e = guardarNombre([], MONTJUIC, 'Montjuïc', 'strava');
  e = guardarNombre(e, [41.3640, 2.1656], 'Montjuïc', 'strava');
  assert.equal(e.length, 1);
});

test('guardar no muta el array original', () => {
  const original = [];
  const e = guardarNombre(original, MONTJUIC, 'Montjuïc', 'strava');
  assert.equal(original.length, 0);
  assert.equal(e.length, 1);
});

test('se cachea tambien el negativo para no repetir la consulta', () => {
  const e = guardarNombre([], MONTJUIC, null, 'osm');
  const r = buscarNombre(e, MONTJUIC);
  assert.notEqual(r, null);
  assert.equal(r.nombre, null);
});

test('sin coordenadas no se busca ni se guarda', () => {
  assert.equal(buscarNombre([{ lat: 1, lon: 1, nombre: 'X', fuente: 'osm' }], null), null);
  assert.equal(guardarNombre([], null, 'X', 'osm').length, 0);
});
