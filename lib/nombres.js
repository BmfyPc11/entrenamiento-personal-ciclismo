/* ============================================================
   Nombres reales de las subidas.

   Este modulo no habla con la red ni con el navegador a proposito:
   solo decide. Asi se puede probar entero con node --test, sin
   levantar Next ni depender de que Strava u Overpass respondan.
   ============================================================ */

/* Un segmento tiene que cubrir al menos esta fraccion del tramo mas
   corto para dar por hecho que habla de la misma subida. Por debajo
   suele ser un segmento vecino que solo roza el final. */
const MIN_SOLAPE = 0.5;

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

    const solape = Math.min(puerto.fin, e.fin) - Math.max(puerto.inicio, e.inicio);
    if (solape <= 0) continue;
    if (solape < MIN_SOLAPE * Math.min(largo, largoE)) continue;

    validos.push({ nombre: e.nombre, categoria: e.categoria || 0, solape });
  }

  if (!validos.length) return null;

  /*
    Gana el que Strava cataloga como puerto. Un segmento catalogado es
    una subida reconocida; uno sin catalogar puede ser cualquier tramo
    que alguien creo, y su nombre suele ser peor titulo.
  */
  validos.sort((a, b) =>
    (b.categoria > 0) - (a.categoria > 0) || b.solape - a.solape);

  return validos[0].nombre;
}
