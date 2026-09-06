/* ============================================================
   Comparacion de resultados entre ciclistas (pestana "Amigos").

   Solo agregacion pura: recibe las salidas y los splits ya leidos de
   Postgres y devuelve las cifras que pinta la tabla. Sin red ni
   navegador, para poder probarlo con node --test.
   ============================================================ */

import { DISTANCIAS_SPLIT_KM, referenciaTerreno, tipoRuta } from './metrics.js';

/*
  Mejor split real de un atleta: el tiempo mas rapido en cubrir cada
  distancia de DISTANCIAS_SPLIT_KM, mirando SOLO sus salidas llanas
  -mismo criterio que la tarjeta de Logros (mejorSplitReal en
  Logros.jsx)-: un split rapido cuesta abajo o a rebufo de un puerto no
  es una marca de llano. La referencia de terreno se calcula con el
  historico entero de ESE atleta, no con el de quien mira.

  Devuelve { [km]: { segundos, salidaId, fecha } | null }.
*/
export function mejoresSplits(salidas, splits) {
  const ref = referenciaTerreno(salidas || []);
  const out = {};
  for (const dist of DISTANCIAS_SPLIT_KM) {
    let mejor = null;
    for (const s of salidas || []) {
      if (tipoRuta(s, ref) !== 'llano') continue;
      const seg = splits?.[s.id]?.[dist];
      if (!seg) continue;
      if (!mejor || seg < mejor.segundos) mejor = { segundos: seg, salidaId: s.id, fecha: s.fecha };
    }
    out[dist] = mejor;
  }
  return out;
}

/*
  Totales de volumen de un atleta en tres ventanas: ultimos 30 dias,
  ultimos 12 meses e historico completo. "ahora" es inyectable para las
  pruebas.
*/
export function volumen(salidas, ahora = Date.now()) {
  const dia = 86400000;
  const ventana = (desdeMs) => {
    const sel = (salidas || []).filter(
      (s) => desdeMs == null || new Date(s.fecha).getTime() >= desdeMs
    );
    return {
      salidas: sel.length,
      km: sel.reduce((a, s) => a + (s.distancia || 0) / 1000, 0),
      desnivel: sel.reduce((a, s) => a + (s.desnivel || 0), 0),
      horas: sel.reduce((a, s) => a + (s.tiempoMovimiento || 0) / 3600, 0),
    };
  };
  return {
    dias30: ventana(ahora - 30 * dia),
    meses12: ventana(ahora - 365 * dia),
    historico: ventana(null),
  };
}
