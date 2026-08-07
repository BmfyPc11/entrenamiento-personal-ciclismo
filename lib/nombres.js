/* ============================================================
   Nombres reales de las subidas.

   Este modulo no habla con la red ni con el navegador a proposito:
   solo decide. Asi se puede probar entero con node --test, sin
   levantar Next ni depender de que Strava u Overpass respondan.
   ============================================================ */

import { distanciaGeo } from './metrics.js';

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

  return validos[0].nombre;
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
