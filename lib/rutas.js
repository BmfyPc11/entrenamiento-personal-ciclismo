import { num, km as kmSalida, metrosPorKm } from './metrics';

/* ============================================================
   Catalogo de rutas de la zona.
   ============================================================ */

/*
  Estas diez rutas son las que planificaste y analizamos una a una a
  partir de sus perfiles: los kilometros y el desnivel salen de tus
  propios trazados, no de una estimacion. Por eso son fiables.

  Estan ordenadas de menos a mas exigente segun el criterio con el que
  las clasificamos: primero el desnivel total, con el desnivel por
  kilometro y la pendiente maxima como desempate, porque una ruta corta
  y empinada castiga mas que una larga y tendida.
*/
export const CATALOGO = [
  {
    id: 'prat',
    nombre: 'Sant Boi – El Prat',
    zona: 'Delta del Llobregat',
    km: 61, desnivel: 119, tipo: 'mixto',
    puerto: null,
    nota: 'El terreno más llano al que tienes acceso directo. Es la ruta para trabajar ritmo sostenido y posición sin que la pendiente te interrumpa; el condicionante aquí es el viento del delta, no el desnivel.',
  },
  {
    id: 'santramon',
    nombre: 'Ermita de Sant Ramon',
    zona: 'Baix Llobregat',
    km: 54.5, desnivel: 489, tipo: 'carretera',
    puerto: null,
    nota: 'Distancia larga con desnivel moderado y repartido. Buen primer paso hacia las salidas de más de dos horas sin que la subida sea el problema.',
  },
  {
    id: 'spm',
    nombre: 'Sant Pere Màrtir – Montjuïc',
    zona: 'Collserola',
    km: 31, desnivel: 594, tipo: 'carretera',
    puerto: { nombre: 'Sant Pere Màrtir', km: 5.8, pct: 5.4 },
    nota: 'La que ya hiciste el 31 de julio. Sirve de referencia: es tu ascenso continuo más largo hasta ahora y la escala contra la que se miden las demás.',
  },
  {
    id: 'begues',
    nombre: 'Alt de Begues',
    zona: 'Garraf',
    km: 55.9, desnivel: 604, tipo: 'carretera',
    puerto: { nombre: 'Alt de Begues (por Gavà)', km: 6.4, pct: 5.5 },
    nota: 'Puerto regular de 6,4 km sin rampas traicioneras, precedido de mucho llano. La combinación ideal para intentar por primera vez un puerto de más de 5 km.',
  },
  {
    id: 'valldaura',
    nombre: 'Valldaura – Montjuïc',
    zona: 'Collserola',
    km: 52, desnivel: 823, tipo: 'mixto',
    puerto: null,
    nota: 'Sube el desnivel por encima de los 800 m manteniendo la distancia. El salto respecto a Sant Pere Màrtir está en el acumulado, no en ninguna subida concreta.',
  },
  {
    id: 'collserola',
    nombre: 'Collserola – Montjuïc',
    zona: 'Collserola',
    km: 52, desnivel: 902, tipo: 'mixto',
    puerto: null,
    nota: 'Encadenado de subidas por toda la sierra. El problema no es ninguna en particular sino llegar a Montjuïc al final con las piernas ya gastadas.',
  },
  {
    id: 'olorda',
    nombre: "Santa Creu d'Olorda",
    zona: 'Collserola',
    km: 39.8, desnivel: 822, tipo: 'gravel',
    puerto: { nombre: "Santa Creu d'Olorda", km: 4.5, pct: 7 },
    nota: 'La mayor relación desnivel/kilómetro de la lista: 20,7 m/km. Corta pero constantemente cuesta arriba, con poca zona de recuperación.',
  },
  {
    id: 'argall',
    nombre: "Creu d'Aragall",
    zona: 'Baix Llobregat',
    km: 68.2, desnivel: 1022, tipo: 'carretera',
    puerto: { nombre: "Creu d'Aragall (por Gelida)", km: 6.5, pct: 6 },
    nota: 'Primera ruta que junta más de 65 km con más de 1.000 m. La exigencia es doble: el puerto y llegar hasta él con 30 km ya en las piernas.',
  },
  {
    id: 'tibidabo',
    nombre: 'Montjuïc + Tibidabo',
    zona: 'Collserola',
    km: 51.1, desnivel: 1034, tipo: 'carretera',
    puerto: { nombre: 'Tibidabo', km: 7, pct: 4.4 },
    nota: 'El mayor desnivel acumulado de la lista en apenas 51 km. Tibidabo es largo pero tendido; lo que pesa es sumarle Montjuïc.',
  },
  {
    id: 'ratpenat',
    nombre: 'Alt del Rat Penat',
    zona: 'Garraf',
    km: 72.4, desnivel: 701, tipo: 'carretera',
    puerto: { nombre: 'Rat Penat (por Molins de Rei)', km: 5.5, pct: 9.7, max: 20 },
    nota: 'La más dura de la zona y la última de la progresión. El desnivel total engaña: está concentrado en un puerto de 1ª categoría con rampas del 20 %. No es una ruta de resistencia, es una ruta de fuerza.',
  },
];

/* ============================================================
   Recomendacion.
   ============================================================ */

/*
  Anade a cada ruta su relacion con lo que ya has hecho y un veredicto.
  Mismo criterio que el analizador de GPX: manda la exigencia peor
  parada, no el promedio.
*/
export function evaluarRuta(ruta, ref) {
  if (!ref.nSalidas) return { rel: null, estado: 'sin datos', orden: 2 };

  const rel = [];
  if (ref.maxKm) rel.push(ruta.km / ref.maxKm);
  if (ref.maxDesnivel) rel.push(ruta.desnivel / ref.maxDesnivel);
  if (ruta.puerto && ref.ascensoMasLargo) {
    rel.push((ruta.puerto.km * 1000) / ref.ascensoMasLargo.metros);
  }
  const peor = Math.max(...rel);

  let estado, orden;
  if (peor <= 1) { estado = 'a tu alcance'; orden = 0; }
  else if (peor <= 1.25) { estado = 'siguiente paso'; orden = 1; }
  else if (peor <= 1.6) { estado = 'exigente'; orden = 2; }
  else { estado = 'todavía no'; orden = 3; }

  return { rel: peor, estado, orden };
}

/*
  Convierte tus propias salidas en rutas repetibles. Una ruta que ya has
  hecho y disfrutado es la recomendacion mas segura que existe, y el
  panel ya tiene los datos: no hace falta ir a buscarlos fuera.
*/
export function rutasPropias(salidas, excluidas) {
  const val = (salidas || []).filter((s) => !excluidas?.has(s.id));
  const vistas = new Map();

  for (const s of val) {
    /* Se agrupan por nombre para no repetir la misma ruta diez veces;
       de cada una se guarda la version mas larga que hayas hecho. */
    const clave = s.nombre.replace(/^\s*Entreno\s+Bici\s*\d+\s*:\s*/i, '').trim();
    const k = kmSalida(s);
    const prev = vistas.get(clave);
    if (!prev || k > prev.km) {
      vistas.set(clave, {
        id: `propia-${s.id}`,
        nombre: clave,
        zona: 'Ya la has hecho',
        km: k,
        desnivel: s.desnivel,
        tipo: metrosPorKm(s) > 12 ? 'carretera' : 'mixto',
        puerto: null,
        propia: true,
        fecha: s.fecha,
        nota: `La hiciste el ${new Date(s.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}. Repetir una ruta conocida es la mejor forma de medir progreso: mismo terreno, mismos puntos de referencia.`,
      });
    }
  }
  return [...vistas.values()].sort((a, b) => b.desnivel - a.desnivel);
}
