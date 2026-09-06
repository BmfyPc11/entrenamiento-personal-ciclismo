import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nombrarPuertosRuta } from '../lib/gpx.js';

/*
  Ruta recta de norte a sur, un punto cada ~111 m (RADIO_SEGMENTO_MANUAL
  son 100 m, asi que cada indice cae claramente dentro o fuera del radio
  de su vecino). datos con la forma que devuelve parseGPX: streams sin
  latlng -una ruta planificada no se ha rodado- y puntos en paralelo a
  streams.distancia.
*/
function rutaRecta(n) {
  const puntos = [];
  for (let i = 0; i < n; i++) puntos.push({ lat: i * 0.001, lon: 2, ele: i * 5 });
  return {
    puntos,
    streams: {
      distancia: puntos.map((_, i) => i * 100),
      altitud: puntos.map((_, i) => i * 5),
    },
  };
}

const defEntre = (datos, i, j, nombre) => ({
  id: `${i}-${j}`,
  nombre,
  latInicio: datos.puntos[i].lat, lonInicio: 2,
  latFin: datos.puntos[j].lat, lonFin: 2,
});

test('un puerto que se solapa con un segmento del catalogo toma su nombre', () => {
  const datos = rutaRecta(60);
  const puertos = [{ inicio: 12, fin: 29 }];
  const defs = [defEntre(datos, 10, 30, 'Montjuïc')];
  assert.deepEqual(nombrarPuertosRuta(datos, puertos, defs), ['Montjuïc']);
});

test('un puerto sin segmento que lo cruce se queda en "Subida N"', () => {
  const datos = rutaRecta(100);
  const puertos = [{ inicio: 12, fin: 29 }, { inicio: 60, fin: 80 }];
  const defs = [defEntre(datos, 10, 30, 'Montjuïc')];
  assert.deepEqual(nombrarPuertosRuta(datos, puertos, defs), ['Montjuïc', 'Subida 2']);
});

test('sin catalogo, todos los puertos son "Subida N"', () => {
  const datos = rutaRecta(60);
  const puertos = [{ inicio: 5, fin: 20 }, { inicio: 30, fin: 45 }];
  assert.deepEqual(nombrarPuertosRuta(datos, puertos, []), ['Subida 1', 'Subida 2']);
});

test('un segmento reconocido pero sin nombre no pisa el generico', () => {
  const datos = rutaRecta(60);
  const puertos = [{ inicio: 12, fin: 29 }];
  const defs = [defEntre(datos, 10, 30, null)];
  assert.deepEqual(nombrarPuertosRuta(datos, puertos, defs), ['Subida 1']);
});

test('un solape menor de la mitad del tramo mas corto no cuenta como el mismo puerto', () => {
  const datos = rutaRecta(80);
  /* segmento 10..40 (30 de largo); puerto 35..70 (35 de largo). Solape
     35..40 = 5, muy por debajo de la mitad de 30. */
  const puertos = [{ inicio: 35, fin: 70 }];
  const defs = [defEntre(datos, 10, 40, 'Tibidabo')];
  assert.deepEqual(nombrarPuertosRuta(datos, puertos, defs), ['Subida 1']);
});

test('sin puertos devuelve lista vacia', () => {
  const datos = rutaRecta(20);
  assert.deepEqual(nombrarPuertosRuta(datos, [], [defEntre(datos, 2, 10, 'X')]), []);
});
