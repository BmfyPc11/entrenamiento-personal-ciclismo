import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  encontrarSegmentoManual, encontrarTodosLosSegmentosManuales, recogerSegmentosManuales,
  descartarSolapados, agruparAscensiones,
} from '../lib/metrics.js';

/*
  Una recta de norte a sur, un punto de latitud por indice (~111 m entre
  indices consecutivos), para tener distancias predecibles sin depender de
  una ruta real. distanciaGeo compara en metros, asi que este paso es
  bastante mayor que RADIO_SEGMENTO_MANUAL (50 m): cada indice cae claramente
  dentro o fuera del radio de su vecino.
*/
function rectaNorteSur(n) {
  const latlng = [];
  for (let i = 0; i < n; i++) latlng.push([i * 0.001, 2]);
  return latlng;
}

function streamsDe(latlng) {
  const n = latlng.length;
  const distancia = latlng.map((_, i) => i * 100);
  const altitud = latlng.map((_, i) => i * 5);
  const tiempo = latlng.map((_, i) => i * 20);
  return { latlng, distancia, altitud, tiempo };
}

/*
  Llano - subida aislada - llano: a diferencia de streamsDe (que sube sin
  parar todo el recorrido), aqui detectarPuertos encuentra un tramo con
  principio y final propios -hace falta para probar que un segmento
  manual no se cuenta tambien como ascension automatica, sin que la
  propia forma del perfil de pruebas ya obligue a que los limites de uno
  y otro sean distintos.
*/
function perfilAislado(n, inicioSubida, finSubida) {
  const latlng = rectaNorteSur(n);
  const distancia = latlng.map((_, i) => i * 100);
  const tiempo = latlng.map((_, i) => i * 20);
  const altitud = [];
  let alt = 0;
  for (let i = 0; i < n; i++) {
    altitud.push(alt);
    if (i >= inicioSubida && i < finSubida) alt += 5;
  }
  return { latlng, distancia, altitud, tiempo };
}

test('encuentra el segmento cuando la salida pasa por sus coordenadas', () => {
  const streams = streamsDe(rectaNorteSur(50));
  const def = { latInicio: streams.latlng[10][0], lonInicio: 2, latFin: streams.latlng[30][0], lonFin: 2 };
  const r = encontrarSegmentoManual(streams, def);
  assert.deepEqual(r, { inicio: 10, fin: 30 });
});

test('con longitud guardada, una coincidencia de la longitud esperada vale', () => {
  const streams = streamsDe(rectaNorteSur(50));
  const def = {
    latInicio: streams.latlng[10][0], lonInicio: 2,
    latFin: streams.latlng[30][0], lonFin: 2,
    metros: 2000, // (30-10)*100, la misma que da streamsDe
  };
  const r = encontrarSegmentoManual(streams, def);
  assert.deepEqual(r, { inicio: 10, fin: 30 });
});

/*
  El bug real que motivo este campo: un pie y una cima pueden coincidir
  por coordenadas -un cruce de caminos, un desvio que vuelve a juntarse
  mas adelante- perteneciendo a un camino de otra longitud. Sin comprobar
  la longitud, esto se colaba como si fuera el mismo segmento.
*/
test('con longitud guardada, una coincidencia de otra longitud se descarta', () => {
  const streams = streamsDe(rectaNorteSur(50));
  const def = {
    latInicio: streams.latlng[10][0], lonInicio: 2,
    latFin: streams.latlng[30][0], lonFin: 2,
    metros: 6000, // muy lejos del 2000 real: mas de TOL_LONGITUD_SEGMENTO
  };
  assert.equal(encontrarSegmentoManual(streams, def), null);
});

test('sin metros guardado (catalogo antiguo) no se comprueba la longitud', () => {
  const streams = streamsDe(rectaNorteSur(50));
  const def = { latInicio: streams.latlng[10][0], lonInicio: 2, latFin: streams.latlng[30][0], lonFin: 2 };
  const r = encontrarSegmentoManual(streams, def);
  assert.deepEqual(r, { inicio: 10, fin: 30 });
});

test('sin streams o sin latlng no hay coincidencia', () => {
  assert.equal(encontrarSegmentoManual(null, {}), null);
  assert.equal(encontrarSegmentoManual({ latlng: [] }, {}), null);
});

test('una salida que no pasa cerca no coincide', () => {
  const streams = streamsDe(rectaNorteSur(50));
  const def = { latInicio: 5, lonInicio: 5, latFin: 5.1, lonFin: 5 }; // lejos de la recta
  assert.equal(encontrarSegmentoManual(streams, def), null);
});

test('la cima no se busca antes del pie (ida y vuelta)', () => {
  /* Recorrido de ida (0..24) y vuelta (25..49, mismas coordenadas que la
     ida en orden inverso): el pie se engancha en la ida, y la cima tiene
     que buscarse en lo que queda DESPUES, no en la propia ida donde el
     punto de la cima tambien esta cerca pero por delante del pie. */
  const ida = rectaNorteSur(25);
  const vuelta = [...ida].reverse();
  const streams = streamsDe([...ida, ...vuelta]);
  const def = { latInicio: streams.latlng[5][0], lonInicio: 2, latFin: streams.latlng[15][0], lonFin: 2 };
  const r = encontrarSegmentoManual(streams, def);
  assert.ok(r);
  assert.ok(r.fin > r.inicio);
});

test('recogerSegmentosManuales agrupa los intentos de varias salidas', () => {
  const st1 = streamsDe(rectaNorteSur(50));
  const st2 = streamsDe(rectaNorteSur(50));
  const salidas = [
    { id: 1, nombre: 'Salida 1', fecha: '2026-01-01' },
    { id: 2, nombre: 'Salida 2', fecha: '2026-01-08' },
  ];
  const cache = { 1: st1, 2: st2 };
  const def = {
    id: 'seg-1', nombre: 'Mi segmento',
    latInicio: st1.latlng[10][0], lonInicio: 2,
    latFin: st1.latlng[30][0], lonFin: 2,
  };

  const [grupo] = recogerSegmentosManuales(salidas, cache, new Set(), [def]);
  assert.equal(grupo.id, 'seg-1');
  assert.equal(grupo.veces, 2);
  assert.equal(grupo.intentos.length, 2);
  assert.ok(grupo.mejor);
});

test('recogerSegmentosManuales respeta las salidas excluidas', () => {
  const st1 = streamsDe(rectaNorteSur(50));
  const salidas = [{ id: 1, nombre: 'Salida 1', fecha: '2026-01-01' }];
  const def = {
    id: 'seg-1', nombre: 'Mi segmento',
    latInicio: st1.latlng[10][0], lonInicio: 2,
    latFin: st1.latlng[30][0], lonFin: 2,
  };
  const [grupo] = recogerSegmentosManuales(salidas, { 1: st1 }, new Set([1]), [def]);
  assert.equal(grupo.veces, 0);
  assert.equal(grupo.mejor, null);
});

/* ---------- descartarSolapados / agruparAscensiones + segmentos manuales ---------- */

test('descartarSolapados quita un candidato que cubre casi el mismo tramo', () => {
  const candidatos = [{ inicio: 10, fin: 30 }, { inicio: 100, fin: 120 }];
  const rangos = [{ inicio: 10, fin: 30 }];
  const r = descartarSolapados(candidatos, rangos);
  assert.deepEqual(r, [{ inicio: 100, fin: 120 }]);
});

test('descartarSolapados no toca nada si no hay rangos', () => {
  const candidatos = [{ inicio: 10, fin: 30 }];
  assert.deepEqual(descartarSolapados(candidatos, []), candidatos);
  assert.deepEqual(descartarSolapados(candidatos, null), candidatos);
});

/*
  El bug real: un tramo marcado a mano que tambien cumple los minimos de
  deteccion automatica (600 m, 40 m, 3 %, los que usa agruparAscensiones)
  salia duplicado -una vez en "Mis ascensiones" con su nombre automatico
  y otra en "Mis segmentos" con el nombre puesto a mano.
*/
test('un segmento manual no aparece tambien como ascension automatica', () => {
  const st = perfilAislado(50, 10, 30); // llano - 2000 m al 5% (cumple los minimos) - llano
  const salidas = [{ id: 1, nombre: 'Salida 1', fecha: '2026-01-01' }];
  const def = {
    id: 'seg-1', nombre: 'Mi segmento',
    latInicio: st.latlng[10][0], lonInicio: 2,
    latFin: st.latlng[30][0], lonFin: 2,
  };

  const sinCatalogo = agruparAscensiones(salidas, { 1: st }, new Set(), []);
  assert.equal(sinCatalogo.length, 1); // sin el catalogo, se detecta como ascension normal

  const conCatalogo = agruparAscensiones(salidas, { 1: st }, new Set(), [def]);
  assert.equal(conCatalogo.length, 0); // con el catalogo, ya no se cuenta aparte
});

/*
  Sube - baja - vuelve a subir por el mismo sitio (series, intervalos
  repetidos en la misma salida): las dos subidas tienen que contar como
  dos intentos propios, no quedarse solo con la primera que se encuentra.
*/
function perfilVaiven(pasos, pendientePorPaso = 5) {
  const lat = [];
  for (let i = 0; i <= pasos; i++) lat.push(i); // subida 1: pie -> cima
  for (let i = pasos - 1; i >= 0; i--) lat.push(i); // bajada: cima -> pie
  for (let i = 1; i <= pasos; i++) lat.push(i); // subida 2: pie -> cima otra vez
  const latlng = lat.map((x) => [x * 0.001, 2]);
  const altitud = lat.map((x) => x * pendientePorPaso);
  const distancia = latlng.map((_, i) => i * 100);
  const tiempo = latlng.map((_, i) => i * 20);
  return { latlng, distancia, altitud, tiempo };
}

test('encontrarTodosLosSegmentosManuales encuentra cada repeticion, no solo la primera', () => {
  const st = perfilVaiven(20);
  const def = {
    latInicio: 0, lonInicio: 2, latFin: st.latlng[20][0], lonFin: 2, metros: 2000,
  };

  const r = encontrarTodosLosSegmentosManuales(st, def);
  assert.equal(r.length, 2);
  assert.ok(r[0].fin < r[1].inicio, 'la segunda subida empieza despues de que acabe la primera');

  // encontrarSegmentoManual (compatibilidad) se queda solo con la primera.
  assert.deepEqual(encontrarSegmentoManual(st, def), r[0]);
});

/*
  El bug real reportado: en un circuito de varias vueltas, una pasada
  intermedia se saltaba entera si el ruido del GPS de ESE dia hacia que
  una vuelta POSTERIOR quedase por casualidad un poco mas cerca de las
  coordenadas guardadas que la que tocaba -el buscador comparaba todas
  las vueltas que quedaban por delante entre si, en vez de quedarse con
  la primera que entraba en el radio.

  Aqui la vuelta 2 (indice 5) queda a 80 m del pie guardado y la vuelta 3
  (indice 9) a solo 20 m -mas cerca, pero es la vuelta de DESPUES-. Antes
  del arreglo, al buscar la siguiente coincidencia tras la vuelta 1 el
  resultado saltaba directo a la vuelta 3 y la 2 desaparecia sin dejar
  rastro (ni "no reconocida": no llegaba ni a intentarse).
*/
test('un circuito de varias vueltas no se salta una vuelta intermedia por ruido del GPS', () => {
  const metrosPorGrado = 111320;
  const offset = (metros) => metros / metrosPorGrado;

  const lat = [
    0,                    // 0: pie vuelta 1 (referencia exacta del segmento)
    offset(300),          // 1: cima vuelta 1
    offset(5000),         // 2: lejos (fuera del circuito)
    offset(6000),         // 3: lejos
    offset(7000),         // 4: lejos
    offset(80),           // 5: pie vuelta 2 -> 80 m del pie de referencia
    offset(380),          // 6: cima vuelta 2
    offset(9000),         // 7: lejos
    offset(10000),        // 8: lejos
    offset(20),           // 9: pie vuelta 3 -> 20 m del pie de referencia (mas cerca que la 2, pero es posterior)
    offset(320),          // 10: cima vuelta 3
    offset(12000),        // 11: lejos
    offset(13000),        // 12: lejos
  ];
  const latlng = lat.map((v) => [v, 2]);
  const distancia = latlng.map((_, i) => i * 100);
  const streams = { latlng, distancia };

  const def = { latInicio: 0, lonInicio: 2, latFin: offset(300), lonFin: 2, metros: 100 };

  const r = encontrarTodosLosSegmentosManuales(streams, def);
  assert.equal(r.length, 3, 'las tres vueltas tienen que reconocerse, ninguna saltada');
  assert.deepEqual(r, [
    { inicio: 0, fin: 1 },
    { inicio: 5, fin: 6 },
    { inicio: 9, fin: 10 },
  ]);
});

test('recogerSegmentosManuales cuenta cada repeticion de la misma salida como un intento', () => {
  const st = perfilVaiven(20);
  const def = {
    id: 'seg-1', nombre: 'Series', latInicio: 0, lonInicio: 2,
    latFin: st.latlng[20][0], lonFin: 2, metros: 2000,
  };
  const salidas = [{ id: 1, nombre: 'Series 2x', fecha: '2026-01-01' }];

  const [grupo] = recogerSegmentosManuales(salidas, { 1: st }, new Set(), [def]);
  assert.equal(grupo.veces, 2);
  assert.equal(grupo.intentos.length, 2);
  assert.ok(grupo.intentos.every((it) => it.salidaId === 1));
});
