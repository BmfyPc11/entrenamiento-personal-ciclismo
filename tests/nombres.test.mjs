import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emparejarSegmento, elegirCima, buscarNombre, guardarNombre, normalizarNombre,
} from '../lib/nombres.js';

const ef = (nombre, inicio, fin, categoria = 0) => ({ nombre, inicio, fin, categoria });

test('sin efforts no hay nombre', () => {
  assert.equal(emparejarSegmento({ inicio: 100, fin: 200 }, []), null);
  assert.equal(emparejarSegmento({ inicio: 100, fin: 200 }, null), null);
});

test('coincidencia exacta devuelve el nombre', () => {
  const r = emparejarSegmento({ inicio: 100, fin: 200 }, [ef('Montjuïc', 100, 200)]);
  assert.equal(r, 'Montjuïc');
});

test('un segmento que cubre casi toda la subida vale', () => {
  // subida 100-200, segmento 100-190: 90 de interseccion sobre 100 de union -> 0,9
  const r = emparejarSegmento({ inicio: 100, fin: 200 }, [ef('Rat Penat', 100, 190)]);
  assert.equal(r, 'Rat Penat');
});

/*
  El caso que motivo cambiar el criterio. Con el anterior, que medía el
  solape contra el tramo mas corto, este sprint cubria el 100 % de si
  mismo y se quedaba con el nombre de una subida veinte veces mas larga.
*/
test('un sprint corto dentro de una subida larga no la nombra', () => {
  const r = emparejarSegmento({ inicio: 0, fin: 3700 }, [
    ef('Sprint Paral·lel', 1000, 1200),
  ]);
  assert.equal(r, null);
});

test('un segmento mucho mas largo que la subida no la nombra', () => {
  // la subida entera cabe dentro, pero el segmento habla de otra cosa
  const r = emparejarSegmento({ inicio: 100, fin: 200 }, [ef('Vuelta entera', 0, 1000)]);
  assert.equal(r, null);
});

test('un segmento que solo roza el final se descarta', () => {
  // interseccion 50 sobre union 160 -> 0,31
  const r = emparejarSegmento({ inicio: 100, fin: 200 }, [ef('Otro', 150, 260)]);
  assert.equal(r, null);
});

test('sin solapamiento se descarta', () => {
  const r = emparejarSegmento({ inicio: 100, fin: 200 }, [ef('Lejos', 300, 400)]);
  assert.equal(r, null);
});

test('gana el catalogado como puerto aunque se parezca menos', () => {
  const r = emparejarSegmento({ inicio: 100, fin: 200 }, [
    ef('Rampa suelta', 100, 200, 0),
    ef('Sant Pere Màrtir', 120, 200, 3),
  ]);
  assert.equal(r, 'Sant Pere Màrtir');
});

test('a igual categoria gana el que mas se parece', () => {
  const r = emparejarSegmento({ inicio: 100, fin: 200 }, [
    ef('Parcial', 140, 200, 0),
    ef('Completo', 105, 200, 0),
  ]);
  assert.equal(r, 'Completo');
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
  // unos 30 m mas al norte
  const r = buscarNombre(e, [41.36417, 2.1655]);
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

/* ---------- presentacion del nombre ---------- */

test('todo en minusculas se capitaliza con criterio', () => {
  assert.equal(normalizarNombre('montjuïc per miramar'), 'Montjuïc per Miramar');
  assert.equal(normalizarNombre('alt del rat penat'), 'Alt del Rat Penat');
  assert.equal(normalizarNombre('sant pere màrtir'), 'Sant Pere Màrtir');
});

test('todo en mayusculas se recasa', () => {
  assert.equal(normalizarNombre('MONTJUIC PER MIRAMAR'), 'Montjuic per Miramar');
  assert.equal(normalizarNombre('SUBIDA A VALLVIDRERA'), 'Subida a Vallvidrera');
});

test('los apostrofos se resuelven bien', () => {
  assert.equal(normalizarNombre('creu d\'olorda'), 'Creu d\'Olorda');
  assert.equal(normalizarNombre('CREU D\'OLORDA'), 'Creu d\'Olorda');
  // si abre el nombre, el prefijo va en mayuscula
  assert.equal(normalizarNombre('d\'olorda per la creu'), 'D\'Olorda per la Creu');
});

/*
  Lo mas importante: un nombre ya bien escrito no se toca. Sin un
  diccionario de toponimos no hay forma de saber que "Miramar" es un
  nombre propio, asi que reformatear lo que ya esta bien solo puede
  empeorarlo.
*/
test('un nombre ya bien escrito se respeta', () => {
  assert.equal(normalizarNombre('Montjuïc per Miramar'), 'Montjuïc per Miramar');
  assert.equal(normalizarNombre('Alt del Rat Penat'), 'Alt del Rat Penat');
  assert.equal(normalizarNombre('Coll de la Creu d\'Ordal'), 'Coll de la Creu d\'Ordal');
});

test('a un nombre mixto solo se le sube la primera letra', () => {
  assert.equal(normalizarNombre('subida a Montjuïc'), 'Subida a Montjuïc');
});

test('los acronimos cortos en mayusculas se conservan', () => {
  assert.equal(normalizarNombre('KOM BCN'), 'KOM BCN');
});

test('se limpian los espacios sobrantes', () => {
  assert.equal(normalizarNombre('  montjuïc   per  miramar '), 'Montjuïc per Miramar');
});

test('lo que no es texto util se devuelve tal cual', () => {
  assert.equal(normalizarNombre(''), null);
  assert.equal(normalizarNombre('   '), null);
  assert.equal(normalizarNombre(null), null);
  assert.equal(normalizarNombre(undefined), undefined);
});

/* ---------- correcciones de forma ---------- */

test('el guion entre dos lugares queda con aire y en mayuscula', () => {
  assert.equal(normalizarNombre('Sant Boi-Montjuic'), 'Sant Boi - Montjuic');
  assert.equal(normalizarNombre('sant boi-montjuic'), 'Sant Boi - Montjuic');
  assert.equal(normalizarNombre('MONTJUIC-TIBIDABO'), 'Montjuic - Tibidabo');
});

test('tras el separador se capitaliza aunque sea un articulo', () => {
  assert.equal(normalizarNombre('barcelona-el prat'), 'Barcelona - El Prat');
});

/*
  El riesgo de separar por guion: "Vila-real" es un toponimo unico, no
  un recorrido. Se distingue porque tras el guion no viene mayuscula y
  ningun lado tiene espacios.
*/
test('una palabra compuesta no se parte', () => {
  assert.equal(normalizarNombre('vila-real'), 'Vila-real');
  assert.equal(normalizarNombre('Vila-real'), 'Vila-real');
});

test('el guion ya bien espaciado se respeta', () => {
  assert.equal(normalizarNombre('Sant Boi - Montjuic'), 'Sant Boi - Montjuic');
  assert.equal(normalizarNombre('Sant Boi  -  Montjuic'), 'Sant Boi - Montjuic');
});

test('los guiones largos y repetidos se normalizan', () => {
  assert.equal(normalizarNombre('Sant Boi — Montjuic'), 'Sant Boi - Montjuic');
  assert.equal(normalizarNombre('Sant Boi--Montjuic'), 'Sant Boi - Montjuic');
});

test('se quitan los adornos de los extremos', () => {
  assert.equal(normalizarNombre('*** Montjuic ***'), 'Montjuic');
  assert.equal(normalizarNombre('"Montjuic"'), 'Montjuic');
  assert.equal(normalizarNombre('🔥 montjuic 🔥'), 'Montjuic');
});

test('los signos repetidos se reducen a uno', () => {
  assert.equal(normalizarNombre('SUBIDA FINAL!!!'), 'Subida Final!');
});

test('la puntuacion recupera su espaciado', () => {
  assert.equal(normalizarNombre('Montjuic ,por Miramar'), 'Montjuic, por Miramar');
});

test('los parentesis pierden el aire interior', () => {
  assert.equal(normalizarNombre('Montjuic ( por Miramar )'), 'Montjuic (por Miramar)');
});
