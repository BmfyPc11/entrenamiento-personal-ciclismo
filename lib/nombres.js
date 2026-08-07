/* ============================================================
   Nombres reales de las subidas.

   Este modulo no habla con la red ni con el navegador a proposito:
   solo decide. Asi se puede probar entero con node --test, sin
   levantar Next ni depender de que Strava u Overpass respondan.
   ============================================================ */

import { distanciaGeo } from './metrics.js';

/* ============================================================
   Presentacion del nombre.
   ============================================================ */

/*
  Palabras que en catalan y castellano van en minuscula dentro de un
  toponimo: "Alt del Rat Penat", "Creu d'Olorda", "Sant Pere Martir".
  Nunca se aplica a la primera palabra del nombre.
*/
const MINUSCULAS = new Set([
  'de', 'del', 'dels', 'd', 'la', 'las', 'les', 'el', 'els', 'lo', 'los', 'l',
  'a', 'al', 'als', 'en', 'amb', 'con', 'per', 'por', 'para', 'i', 'y', 'o', 'u',
  'the', 'of', 'des', 'da', 'do',
]);

/* Capitaliza respetando apostrofos: d'olorda -> d'Olorda. */
function capitalizarPalabra(p, primera) {
  /* La lista de minusculas se mira antes que nada: si no, un "PER" de
     tres letras en un nombre todo en mayusculas pasaria por acronimo y
     saldria "Montjuic PER Miramar". */
  if (!primera && MINUSCULAS.has(p.toLowerCase())) return p.toLowerCase();

  /* Un acronimo corto en mayusculas se deja como esta: BCN, TT, KOM. */
  if (p.length <= 3 && p === p.toUpperCase() && /[A-ZÀ-Ü]/.test(p)) return p;

  const partes = p.split("'");
  if (partes.length === 2 && partes[0].length <= 2) {
    /* Prefijo tipo d' o l': el prefijo va en minuscula salvo que abra
       el nombre, y lo que sigue siempre en mayuscula. */
    const pre = primera
      ? partes[0].charAt(0).toUpperCase() + partes[0].slice(1).toLowerCase()
      : partes[0].toLowerCase();
    return `${pre}'${partes[1].charAt(0).toUpperCase()}${partes[1].slice(1).toLowerCase()}`;
  }

  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

/*
  Decide si un guion separa dos lugares o une una sola palabra.

  "Sant Boi-Montjuic" es un recorrido y pide aire alrededor del guion.
  "Vila-real" es un toponimo unico y partirlo lo destrozaria. Dos
  senales lo distinguen: que tras el guion venga mayuscula, o que el
  nombre tenga varias palabras, porque un compuesto suelto como
  "vila-real" viene siempre solo.

  Limitacion conocida y asumida: un compuesto dentro de un nombre largo
  ("Vila-real de no se que") se partiria. Es mucho mas raro que el
  recorrido en minusculas, que en Strava aparece a todas horas.
*/
function esSeparadorDeRecorrido(der, variasPalabras) {
  return /^[A-ZÀ-Ü]/.test(der) || variasPalabras;
}

/*
  Correcciones de forma, antes de tocar mayusculas. Cada una arregla una
  guarreria concreta que se ve de verdad en los nombres de segmentos.
*/
function limpiarForma(txt) {
  let t = txt;

  /* 1. Adornos al principio y al final: emojis, asteriscos, comillas
        sueltas y demas decoracion. */
  t = t.replace(/^[\s*"'“”«»_~|•·¡!¿?]+/, '')
       .replace(/[\s*"'“”«»_~|•·]+$/, '');
  t = t.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, ' ');

  /* 2. Guiones largos y repetidos, todos al guion normal. */
  t = t.replace(/[–—―]/g, '-').replace(/-{2,}/g, '-');

  /* 3. Signos repetidos: "SUBIDA!!!" -> "SUBIDA!". */
  t = t.replace(/([!?.])\1{1,}/g, '$1');

  /* 4. Espacio sobrante antes de coma o punto, y falta de espacio
        despues. */
  t = t.replace(/\s+([,.;:])/g, '$1').replace(/([,;:])(?=\S)/g, '$1 ');

  /* 5. Parentesis con aire por dentro: "( por Miramar )". */
  t = t.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');

  /* 6. El guion que separa dos lugares queda con un espacio a cada
        lado; el que une una palabra compuesta se deja intacto. La
        decision se toma mirando el nombre entero, no solo las palabras
        pegadas al guion. */
  const variasPalabras = t.replace(/\s*-\s*/g, '-').includes(' ');
  t = t.replace(/\s*-\s*/g, '-');
  t = t.replace(/([^\s-]+)-([^\s-]+)/g, (m, izq, der) =>
    esSeparadorDeRecorrido(der, variasPalabras) ? `${izq} - ${der}` : m);

  /* 7. Y por ultimo los espacios, ya con todo lo demas colocado. */
  return t.replace(/\s+/g, ' ').trim();
}

/*
  Deja presentable el nombre que llega de fuera.

  Los segmentos de Strava los escribe cualquiera, y llegan cosas como
  "MONTJUIC PER MIRAMAR", "subida a montjuic" o "Sant Boi-Montjuic".
  Pero un nombre ya bien escrito no se recasa: no hay forma de saber que
  "Miramar" es un nombre propio sin un diccionario de toponimos, y
  reformatear lo correcto solo puede empeorarlo. Las correcciones de
  forma (espacios, guiones, adornos) si se aplican siempre, porque esas
  no dependen de saber que significa cada palabra.
*/
export function normalizarNombre(nombre) {
  if (typeof nombre !== 'string') return nombre;

  const limpio = limpiarForma(nombre);
  if (!limpio) return null;

  const tieneLetras = /[a-zà-üA-ZÀ-Ü]/.test(limpio);
  const todoMayus = tieneLetras && limpio === limpio.toUpperCase();
  const todoMinus = tieneLetras && limpio === limpio.toLowerCase();

  /* Ya viene con mayusculas y minusculas mezcladas: alguien lo escribio
     con criterio. Solo se asegura que arranque en mayuscula y que la
     palabra que sigue a un separador tambien. */
  if (!todoMayus && !todoMinus) {
    return limpio
      .split(' ')
      .map((p, i, arr) => (i === 0 || arr[i - 1] === '-')
        ? p.charAt(0).toUpperCase() + p.slice(1)
        : p)
      .join(' ');
  }

  /* Tras un separador empieza otro lugar, asi que va en mayuscula
     aunque sea un articulo: "Barcelona - El Prat". */
  return limpio
    .split(' ')
    .map((p, i, arr) => capitalizarPalabra(p, i === 0 || arr[i - 1] === '-'))
    .join(' ');
}

/*
  Cuanto tienen que parecerse el segmento y la subida para dar por hecho
  que hablan de lo mismo.

  Se mide como interseccion entre union, y no como solapamiento sobre el
  tramo mas corto, porque esa segunda forma tiene un agujero grande: un
  sprint de 200 m dentro de una subida de 3,7 km solapa el 100 % de si
  mismo y colaba con nota, quedandose con el nombre de la subida entera.
  Midiendo contra la union, ese sprint da 0,05 y se descarta, mientras
  que un segmento que cubre la subida de arriba abajo da 0,9.

  Con 0,6 sigue valiendo un segmento que cubra dos tercios de la subida
  o que se pase de largo hasta un 50 %: casos donde el nombre sigue
  siendo el correcto aunque el trazado no coincida al metro.
*/
const MIN_SIMILITUD = 0.6;

/*
  Empareja una subida detectada con el segmento de Strava que la nombra.

  Se compara por indices y no por geometria porque detectarPuertos y los
  segment_efforts de Strava se refieren a los mismos streams: inicio y
  fin son posiciones dentro del mismo array.
*/
export function emparejarSegmento(puerto, efforts) {
  if (!puerto || !Array.isArray(efforts) || !efforts.length) return null;

  const largo = puerto.fin - puerto.inicio;
  if (!(largo > 0)) return null;

  const validos = [];
  for (const e of efforts) {
    if (!e || !e.nombre) continue;
    const largoE = e.fin - e.inicio;
    if (!(largoE > 0)) continue;

    const interseccion = Math.min(puerto.fin, e.fin) - Math.max(puerto.inicio, e.inicio);
    if (interseccion <= 0) continue;

    const union = Math.max(puerto.fin, e.fin) - Math.min(puerto.inicio, e.inicio);
    const similitud = interseccion / union;
    if (similitud < MIN_SIMILITUD) continue;

    validos.push({ nombre: e.nombre, categoria: e.categoria || 0, similitud });
  }

  if (!validos.length) return null;

  /*
    Gana el que Strava cataloga como puerto. Un segmento catalogado es
    una subida reconocida; uno sin catalogar puede ser cualquier tramo
    que alguien creo, y su nombre suele ser peor titulo.
  */
  validos.sort((a, b) =>
    (b.categoria > 0) - (a.categoria > 0) || b.similitud - a.similitud);

  /* Se normaliza aqui, en el origen, para que lo que se pinte y lo que
     se guarde en cache sean la misma cadena. */
  return normalizarNombre(validos[0].nombre);
}

/* ============================================================
   Cimas de OpenStreetMap.
   ============================================================ */

/* Un nodo cuya altitud difiera menos de esto de la cima real se
   considera que habla de la misma cumbre. */
const TOL_ALTITUD = 60;

/* Sin coincidencia de altitud solo se acepta un nodo muy pegado. */
const RADIO_CERCANIA = 300;

/*
  Elige que nodo de OpenStreetMap nombra esta cima.

  El criterio no es la distancia sola. Midiendo cerca de Sant Pere
  Martir, el pico mas proximo estaba a 360 m y el nombre correcto a
  709 m: quedarse con el mas cercano habria bautizado la subida con el
  nombre del turo de al lado. Como la altitud de la cima se conoce por
  el GPX, se usa para desempatar.
*/
export function elegirCima(candidatos, altCima) {
  if (!Array.isArray(candidatos) || !candidatos.length) return null;

  const conNombre = candidatos.filter((c) => c && c.nombre);
  if (!conNombre.length) return null;

  const porDistancia = (a, b) => a.distancia - b.distancia;

  /* 1. Los que cuadran en altitud, el mas cercano de ellos. */
  if (altCima != null) {
    const cuadran = conNombre.filter(
      (c) => c.altitud != null && Math.abs(c.altitud - altCima) <= TOL_ALTITUD
    );
    if (cuadran.length) return [...cuadran].sort(porDistancia)[0];
  }

  /* 2. Si ninguno cuadra, solo vale uno muy pegado. */
  const cerca = conNombre.filter((c) => c.distancia <= RADIO_CERCANIA);
  if (cerca.length) return [...cerca].sort(porDistancia)[0];

  /* 3. Antes que inventar un nombre, ninguno. */
  return null;
}

/* ============================================================
   Cache de nombres.
   ============================================================ */

/*
  Radio para dar dos cimas por la misma subida. Es el mismo que usa
  agruparAscensiones, y no por comodidad: si el panel ya considera que
  dos ascensos a menos de 250 m son el mismo puerto, el nombre tiene
  que viajar con ese mismo criterio o veriamos la misma subida agrupada
  bajo un nombre y sin el en otra pestana.

  Se busca por proximidad y no por una clave de texto porque las
  subidas detectadas se mueven cuando se cambian los minimos de
  deteccion: una clave por indice o por coordenada redondeada se
  romperia con ese cambio y perderiamos todos los nombres.
*/
const RADIO_NOMBRE = 250;

const CLAVE_CACHE = 'nombresSubidas';

/* Prioridad al recuperar: lo que has escrito tu manda sobre lo que
   adivino cualquier servicio. */
const PESO = { manual: 3, strava: 2, osm: 1 };

export function buscarNombre(entradas, cima) {
  if (!Array.isArray(entradas) || !entradas.length || !cima) return null;

  const cerca = entradas
    .map((e) => ({ e, d: distanciaGeo([e.lat, e.lon], cima) }))
    .filter((x) => x.d < RADIO_NOMBRE);

  if (!cerca.length) return null;

  cerca.sort((a, b) =>
    (PESO[b.e.fuente] || 0) - (PESO[a.e.fuente] || 0) || a.d - b.d);

  const { nombre, fuente } = cerca[0].e;
  return { nombre, fuente };
}

export function guardarNombre(entradas, cima, nombre, fuente) {
  const base = Array.isArray(entradas) ? entradas : [];
  if (!cima) return [...base];

  /* Se reemplaza la entrada de la misma fuente en el mismo sitio, para
     que reintentar una consulta no acumule duplicados. Las de otras
     fuentes se conservan: asi un nombre manual sobrevive a que el
     automatico se vuelva a resolver. */
  const resto = base.filter(
    (e) => !(e.fuente === fuente && distanciaGeo([e.lat, e.lon], cima) < RADIO_NOMBRE)
  );

  return [...resto, { lat: cima[0], lon: cima[1], nombre: nombre || null, fuente }];
}

/* ---------- persistencia ---------- */

export function leerCache() {
  if (typeof window === 'undefined') return [];
  try {
    const c = JSON.parse(window.localStorage.getItem(CLAVE_CACHE));
    return Array.isArray(c?.entradas) ? c.entradas : [];
  } catch {
    return [];
  }
}

export function escribirCache(entradas) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CLAVE_CACHE,
      JSON.stringify({ version: 1, entradas }));
  } catch {
    /* Sin sitio en localStorage los nombres siguen valiendo en memoria
       durante la sesion. No es motivo para romper la pestana. */
  }
}
