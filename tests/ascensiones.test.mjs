import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agruparAscensiones } from '../lib/metrics.js';

/*
  Perfil llano-subida-llano (mismo patron que en segmentosManuales.test.mjs):
  detectarPuertos encuentra un tramo con principio y final propios, en vez de
  fundir todo el recorrido en una sola subida continua.

  El "carril" (lon) es lo que distingue una vertiente de otra: dos salidas
  con el mismo perfil de altitud pero un carril distinto representan dos
  caminos distintos que llegan a la misma cima -la coordenada de la cima se
  fuerza a ser la misma (o muy parecida) en las dos, como pasaria de verdad
  si rematan en el mismo sitio.
*/
function salidaConSubida(n, inicioSubida, finSubida, carril, cima) {
  const latlng = [];
  for (let i = 0; i < n; i++) latlng.push([i * 0.001, carril]);
  latlng[finSubida] = cima; // el remate coincide con el de las otras vertientes

  const distancia = latlng.map((_, i) => i * 100);
  const tiempo = latlng.map((_, i) => i * 20);
  const altitud = [];
  let alt = 0;
  for (let i = 0; i < n; i++) {
    altitud.push(alt);
    if (i >= inicioSubida && i < finSubida) alt += 5; // 5%
  }
  return { latlng, distancia, altitud, tiempo };
}

const CIMA = [0.2, 9];

test('dos vertientes de longitud distinta que comparten cima salen como ascensiones separadas', () => {
  // Vertiente A: 2000 m (indices 10-30), carril lon=2. Se sube dos veces.
  const a1 = salidaConSubida(50, 10, 30, 2, CIMA);
  const a2 = salidaConSubida(50, 10, 30, 2, CIMA);
  // Vertiente B: 3500 m (indices 10-45), carril lon=6 -muy lejos del de A,
  // aunque ambas rematen en la misma cima.
  const b1 = salidaConSubida(50, 10, 45, 6, CIMA);

  const salidas = [
    { id: 1, nombre: 'Salida A1', fecha: '2026-01-01' },
    { id: 2, nombre: 'Salida A2', fecha: '2026-01-08' },
    { id: 3, nombre: 'Salida B1', fecha: '2026-01-15' },
  ];
  const cache = { 1: a1, 2: a2, 3: b1 };

  const grupos = agruparAscensiones(salidas, cache, new Set());

  assert.equal(grupos.length, 2, 'las dos vertientes deben salir como dos ascensiones distintas');
  const porMetros = [...grupos].sort((a, b) => a.metros - b.metros);
  assert.equal(porMetros[0].veces, 2); // vertiente A, subida dos veces
  assert.equal(porMetros[1].veces, 1); // vertiente B, subida una vez
  assert.ok(porMetros[1].metros > porMetros[0].metros * 1.5);
});

test('una salida que no pasa por el pie de una vertiente no le suma un intento', () => {
  const a1 = salidaConSubida(50, 10, 30, 2, CIMA);
  const b1 = salidaConSubida(50, 10, 45, 6, CIMA);

  const salidas = [
    { id: 1, nombre: 'Salida A1', fecha: '2026-01-01' },
    { id: 2, nombre: 'Salida B1', fecha: '2026-01-08' },
  ];
  const grupos = agruparAscensiones(salidas, { 1: a1, 2: b1 }, new Set());

  assert.equal(grupos.length, 2);
  for (const g of grupos) assert.equal(g.veces, 1);
});

/*
  El caso real que motivo este cambio: en una misma salida, ademas de la
  subida completa de una vertiente, detectarPuertos encuentra un segundo
  candidato mucho mas corto que remata cerca del mismo sitio pero por un
  pie bien distinto (p. ej. una bajada real de por medio, o una parada que
  corta el tramo). Con el sistema antiguo (cima + tolerancia de longitud)
  ese candidato corto podia colarse en el grupo de la subida larga si su
  longitud quedaba, por poco, dentro del margen. Ahora, al exigir tambien
  que el PIE coincida, sale como su propia ascension en vez de contaminar
  el ranking de la larga.
*/
function perfilMultiSegmentos(segmentos, carrilBase = 6) {
  const altitud = [0];
  for (const seg of segmentos) {
    for (let i = 0; i < seg.pasos; i++) altitud.push(altitud[altitud.length - 1] + seg.pendientePorPaso);
  }
  const distancia = altitud.map((_, i) => i * 100);
  const tiempo = altitud.map((_, i) => i * 20);
  const latlng = altitud.map((_, i) => [i * 0.0001, carrilBase]);
  return { latlng, distancia, altitud, tiempo };
}

test('un candidato corto con el mismo remate pero otro pie no contamina la vertiente larga', () => {
  // llano - subida larga (3500 m, 5 %) - bajada real (rompe la subida) -
  // subida corta (700 m, 6 %) - llano. Las dos subidas son candidatos
  // separados para detectarPuertos, y sus pies quedan lejos entre si.
  const st = perfilMultiSegmentos([
    { pasos: 10, pendientePorPaso: 0 },
    { pasos: 35, pendientePorPaso: 5 },
    { pasos: 10, pendientePorPaso: -3 },
    { pasos: 8, pendientePorPaso: 6 },
    { pasos: 7, pendientePorPaso: 0 },
  ]);
  st.latlng[45] = CIMA; // remate de la subida larga
  st.latlng[55] = [0.2, 20]; // pie de la subida corta, lejos del de la larga
  st.latlng[63] = [0.2001, 9.0005]; // remate de la subida corta: casi el mismo sitio

  const salidas = [{ id: 1, nombre: 'Salida', fecha: '2026-01-01' }];
  const grupos = agruparAscensiones(salidas, { 1: st }, new Set());

  assert.equal(grupos.length, 2, 'las dos subidas deben salir separadas, no fundidas en una');
  const vertienteLarga = grupos.find((g) => g.metros > 3000);
  assert.ok(vertienteLarga);
  assert.equal(vertienteLarga.veces, 1);
  assert.equal(vertienteLarga.mejor.metros, 3500);
});
