import pool from './db.js';

/**
 * Convierte valores booleanos o inválidos a NULL para campos numéricos
 */
function sanitizarNumerico(val) {
  if (val === false || val === 'false' || val === null || val === undefined) return null;
  const num = Number(val);
  return isNaN(num) ? null : num;
}

/**
 * Guarda o actualiza un array de salidas (la forma que devuelve
 * traerActividades). Si una salida con esa id ya existe, la pisa.
 * athleteId identifica de quien son, para que cada persona vea solo
 * las suyas al leerlas.
 */
export async function guardarSalidas(salidas, athleteId) {
  for (const s of salidas) {
	  await pool.query(
  `INSERT INTO salidas (
    id, athlete_id, nombre, tipo, fecha, distancia, tiempo_movimiento, tiempo_total,
    desnivel, vel_media, vel_max, fc_media, fc_max, vatios, vatios_reales,
    calorias, esfuerzo, personas, fotos, kudos, comentarios, prs, logros_strava
  ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
  ON CONFLICT (id) DO UPDATE SET
    athlete_id = EXCLUDED.athlete_id,
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
  [s.id, athleteId, s.nombre, s.tipo, s.fecha, sanitizarNumerico(s.distancia), sanitizarNumerico(s.tiempoMovimiento), sanitizarNumerico(s.tiempoTotal),
   sanitizarNumerico(s.desnivel), sanitizarNumerico(s.velMedia), sanitizarNumerico(s.velMax), sanitizarNumerico(s.fcMedia), sanitizarNumerico(s.fcMax), sanitizarNumerico(s.vatios), sanitizarNumerico(s.vatiosReales),
   sanitizarNumerico(s.calorias), sanitizarNumerico(s.esfuerzo), sanitizarNumerico(s.personas), sanitizarNumerico(s.fotos), sanitizarNumerico(s.kudos), sanitizarNumerico(s.comentarios), sanitizarNumerico(s.prs), sanitizarNumerico(s.logrosStrava)]
);
  }
}

/**
 * De una lista de ids de Strava, cuales ya estan guardados para ese
 * atleta. Solo trae los ids, no las filas enteras: es lo unico que hace
 * falta para saber cuantos de esos ids son nuevos.
 */
export async function idsExistentes(ids, athleteId) {
  if (!ids?.length || !athleteId) return new Set();
  const { rows } = await pool.query(
    'SELECT id FROM salidas WHERE athlete_id = $1 AND id = ANY($2::bigint[])',
    [athleteId, ids]
  );
  return new Set(rows.map((r) => Number(r.id)));
}

/**
 * Devuelve las salidas guardadas de un atleta concreto, en el mismo
 * formato (camelCase) que ya usa el resto del panel, ordenadas por
 * fecha ascendente. Sin athleteId no se devuelve nada: mejor una
 * pantalla vacia que mezclar los datos de todo el mundo por error.
 */
export async function listarSalidas(athleteId) {
  if (!athleteId) return [];
  const { rows } = await pool.query(
    'SELECT * FROM salidas WHERE athlete_id = $1 ORDER BY fecha ASC',
    [athleteId]
  );
  
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

/**
 * Ids de salidas de un atleta que ya tienen streams guardados: la marca de
 * que esa salida ya paso por el detalle (streams + segmentos) alguna vez.
 * /api/sync la usa para no volver a pedirle a Strava el detalle de
 * actividades que ya tenemos -esos datos no cambian una vez terminada la
 * salida, asi que releerlos en cada sincronizacion era trabajo tirado.
 */
export async function obtenerIdsConStreams(athleteId) {
  if (!athleteId) return new Set();
  const { rows } = await pool.query(
    `SELECT s.salida_id FROM streams s
     JOIN salidas sal ON sal.id = s.salida_id
     WHERE sal.athlete_id = $1`,
    [athleteId]
  );
  return new Set(rows.map((r) => Number(r.salida_id)));
}

/**
 * Mapa {id: personas} de las salidas ya guardadas de un atleta. Se le pasa
 * a traerActividades() como "conocidas" para que no vuelva a pedirle a
 * Strava el athlete_count actividad por actividad de lo que ya tenemos
 * -antes se pedia de nuevo en cada sincronizacion, para todo el historico.
 */
export async function obtenerPersonasConocidas(athleteId) {
  if (!athleteId) return {};
  const { rows } = await pool.query(
    'SELECT id, personas FROM salidas WHERE athlete_id = $1',
    [athleteId]
  );
  return Object.fromEntries(rows.map((r) => [Number(r.id), r.personas]));
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

/**
 * Ids de salidas de un atleta que ya tienen splits guardados (tiempo real
 * hasta cada distancia de DISTANCIAS_SPLIT_KM). Mismo patron que
 * obtenerIdsConStreams: /api/sync la usa para saber a que salidas con
 * streams ya guardados les falta todavia este calculo.
 */
export async function obtenerIdsConSplits(athleteId) {
  if (!athleteId) return new Set();
  const { rows } = await pool.query(
    `SELECT DISTINCT l.salida_id FROM logros l
     JOIN salidas sal ON sal.id = l.salida_id
     WHERE sal.athlete_id = $1`,
    [athleteId]
  );
  return new Set(rows.map((r) => Number(r.salida_id)));
}

/**
 * Guarda los splits de una salida (objeto {5: segundos, 10: segundos, ...},
 * como devuelve calcularSplits). Borra y vuelve a insertar, igual que
 * guardarSegmentos: son pocas filas por salida y asi no hace falta una
 * restriccion UNIQUE para poder usar ON CONFLICT.
 */
export async function guardarSplits(salidaId, splits) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("DELETE FROM logros WHERE salida_id = $1 AND tipo LIKE '%km'", [salidaId]);

    for (const [km, segundos] of Object.entries(splits || {})) {
      await client.query(
        'INSERT INTO logros (salida_id, tipo, dato) VALUES ($1,$2,$3)',
        [salidaId, `${km}km`, String(Math.round(segundos))]
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

/**
 * Splits guardados de todas las salidas de un atleta, listos para que
 * Logros los use sin volver a tocar streams: { [salidaId]: { 5: segundos,
 * 10: segundos, ... } }.
 */
export async function obtenerSplits(athleteId) {
  if (!athleteId) return {};
  const { rows } = await pool.query(
    `SELECT l.salida_id, l.tipo, l.dato FROM logros l
     JOIN salidas sal ON sal.id = l.salida_id
     WHERE sal.athlete_id = $1 AND l.tipo LIKE '%km'`,
    [athleteId]
  );
  const porSalida = {};
  rows.forEach((r) => {
    const km = Number(r.tipo.replace('km', ''));
    const id = Number(r.salida_id);
    if (!porSalida[id]) porSalida[id] = {};
    porSalida[id][km] = Number(r.dato);
  });
  return porSalida;
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

/**
 * Caché de nombres de cimas (manual, strava, osm). Se guarda global,
 * no por atleta: el nombre de un puerto es un hecho geografico, no un
 * dato privado de cada persona.
 */
export async function listarNombresCima() {
  const { rows } = await pool.query('SELECT lat, lon, nombre, fuente FROM nombres_cima');
  return rows;
}

/**
 * Reemplaza toda la caché por el array que manda el cliente. El cliente
 * ya calcula el array final correcto (con la entrada nueva o corregida
 * puesta y las viejas del mismo sitio quitadas), asi que aqui no hay
 * que fusionar nada: solo borrar y volver a insertar, igual que
 * guardarSegmentos.
 */
export async function guardarNombresCima(entradas) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM nombres_cima');

    for (const e of entradas) {
      await client.query(
        'INSERT INTO nombres_cima (lat, lon, nombre, fuente) VALUES ($1,$2,$3,$4)',
        [e.lat, e.lon, e.nombre, e.fuente]
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