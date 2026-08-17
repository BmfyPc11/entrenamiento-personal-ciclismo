import pool from './db.js';

/**
 * Guarda o actualiza un array de salidas (la forma que devuelve
 * traerActividades). Si una salida con esa id ya existe, la pisa.
 */
export async function guardarSalidas(salidas) {
  for (const s of salidas) {
	  await pool.query(
  `INSERT INTO salidas (
    id, nombre, tipo, fecha, distancia, tiempo_movimiento, tiempo_total,
    desnivel, vel_media, vel_max, fc_media, fc_max, vatios, vatios_reales,
    calorias, esfuerzo, personas, fotos, kudos, comentarios, prs, logros_strava
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
  ON CONFLICT (id) DO UPDATE SET
    nombre = EXCLUDED.nombre, tipo = EXCLUDED.tipo, fecha = EXCLUDED.fecha,
    distancia = EXCLUDED.distancia, tiempo_movimiento = EXCLUDED.tiempo_movimiento,
    tiempo_total = EXCLUDED.tiempo_total, desnivel = EXCLUDED.desnivel,
    vel_media = EXCLUDED.vel_media, vel_max = EXCLUDED.vel_max,
    fc_media = EXCLUDED.fc_media, fc_max = EXCLUDED.fc_max,
    vatios = EXCLUDED.vatios, vatios_reales = EXCLUDED.vatios_reales,
    calorias = EXCLUDED.calorias, esfuerzo = EXCLUDED.esfuerzo,
    personas = EXCLUDED.personas, fotos = EXCLUDED.fotos, kudos = EXCLUDED.kudos,
    comentarios = EXCLUDED.comentarios, prs = EXCLUDED.prs,
    logros_strava = EXCLUDED.logros_strava`,
  [s.id, s.nombre, s.tipo, s.fecha, s.distancia, s.tiempoMovimiento, s.tiempoTotal,
   s.desnivel, s.velMedia, s.velMax, s.fcMedia, s.fcMax, s.vatios, s.vatiosReales,
   s.calorias, s.esfuerzo, s.personas, s.fotos, s.kudos, s.comentarios, s.prs, s.logrosStrava]
);
  }
}

/**
 * Devuelve todas las salidas guardadas, en el mismo formato
 * (camelCase) que ya usa el resto del panel, ordenadas por fecha
 * ascendente.
 */
export async function listarSalidas() {
  const { rows } = await pool.query('SELECT * FROM salidas ORDER BY fecha ASC');
  
  return rows.map((r) => ({
  id: Number(r.id),
  nombre: r.nombre,
  tipo: r.tipo,
  fecha: r.fecha.toISOString(),
  distancia: r.distancia,
  tiempoMovimiento: r.tiempo_movimiento,
  tiempoTotal: r.tiempo_total,
  desnivel: r.desnivel,
  velMedia: r.vel_media,
  velMax: r.vel_max,
  fcMedia: r.fc_media,
  fcMax: r.fc_max,
  vatios: r.vatios,
  vatiosReales: r.vatios_reales,
  calorias: r.calorias,
  esfuerzo: r.esfuerzo,
  personas: r.personas,
  fotos: r.fotos,
  kudos: r.kudos,
  comentarios: r.comentarios,
  prs: r.prs,
  logrosStrava: r.logros_strava,
}));
}