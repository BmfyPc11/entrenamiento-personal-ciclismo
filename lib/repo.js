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

export async function guardarStreams(salidaId, streams){
	await pool.query(
  `INSERT INTO streams (salida_id, distancia, altitud, fc, tiempo, velocidad, cadencia, vatios, latlng)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
   ON CONFLICT (salida_id) DO UPDATE SET
     distancia = EXCLUDED.distancia, altitud = EXCLUDED.altitud, fc = EXCLUDED.fc,
     tiempo = EXCLUDED.tiempo, velocidad = EXCLUDED.velocidad, cadencia = EXCLUDED.cadencia,
     vatios = EXCLUDED.vatios, latlng = EXCLUDED.latlng`,
  [
    salidaId,
    JSON.stringify(streams.distancia),
    JSON.stringify(streams.altitud),
    JSON.stringify(streams.fc),
    JSON.stringify(streams.tiempo),
    JSON.stringify(streams.velocidad),
    JSON.stringify(streams.cadencia),
    JSON.stringify(streams.vatios),
    JSON.stringify(streams.latlng),
  ]
);
}

export async function obtenerStreams(salidaId) {
  const { rows } = await pool.query('SELECT * FROM streams WHERE salida_id = $1', [salidaId]);
  if (!rows.length) return null;

  const r = rows[0];
  return {
    distancia: r.distancia,
    altitud: r.altitud,
    fc: r.fc,
    tiempo: r.tiempo,
    velocidad: r.velocidad,
    cadencia: r.cadencia,
    vatios: r.vatios,
    latlng: r.latlng,
  };
}

export async function guardarSegmentos(salidaId, segmentos) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM segmentos WHERE salida_id = $1', [salidaId]);

    for (const seg of segmentos) {
      await client.query(
        'INSERT INTO segmentos (salida_id, nombre, inicio, fin, categoria) VALUES ($1,$2,$3,$4,$5)',
        [salidaId, seg.nombre, seg.inicio, seg.fin, seg.categoria]
      );
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function obtenerSegmentos(salidaId) {
  const { rows } = await pool.query(
    'SELECT nombre, inicio, fin, categoria FROM segmentos WHERE salida_id = $1 ORDER BY inicio',
    [salidaId]
  );
  return rows;
}