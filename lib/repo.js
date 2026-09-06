import pool from './db.js';

/**
 * Convierte valores booleanos o inválidos a NULL para campos numéricos
 */
function sanitizarNumerico(val) {
  if (val === false || val === 'false' || val === null || val === undefined) return null;
  const num = Number(val);
  return isNaN(num) ? null : num;
}

/* ---------- atletas (para la pestana "Amigos") ---------- */

/**
 * Registra -o actualiza- al atleta que acaba de iniciar sesion. Es lo unico
 * que persiste la identidad de cada ciclista: su nombre vive si no solo en la
 * cookie de sesion. De aqui sale la lista de "Amigos".
 */
export async function registrarAtleta(atleta) {
  if (!atleta?.id) return;
  await pool.query(
    `INSERT INTO atletas (id, nombre) VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre`,
    [atleta.id, atleta.nombre || null]
  );
}

/**
 * Todos los atletas que han conectado alguna vez, por orden alfabetico.
 * Con "excluir" se deja fuera a uno -normalmente quien mira: sus amigos son
 * todos los demas (pool abierto, ver schema.sql).
 */
export async function listarAtletas(excluir = null) {
  const { rows } = await pool.query('SELECT id, nombre FROM atletas ORDER BY nombre ASC');
  return rows
    .filter((r) => String(r.id) !== String(excluir))
    .map((r) => ({ id: Number(r.id), nombre: r.nombre }));
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
 * como devuelve calcularSplits). Borra y vuelve a insertar: son pocas filas
 * por salida y asi no hace falta una restriccion UNIQUE para usar ON CONFLICT.
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

/* ---------- puertos hechos (comparacion de la pestana "Amigos") ---------- */

/**
 * Version actual del catalogo de segmentos: el MAX(actualizado). La
 * sincronizacion re-escanea toda salida cuyo streams.puertos_calc sea
 * anterior a esto. Sin segmentos, epoca 0 (nada que escanear).
 */
export async function fingerprintCatalogo() {
  const { rows } = await pool.query('SELECT MAX(actualizado) AS fp FROM segmentos_manuales');
  return rows[0]?.fp || new Date(0);
}

/**
 * Ids de salidas de un atleta cuyos puertos_hechos ya estan calculados
 * contra la version "fp" del catalogo (o una posterior). Lo que no salga
 * aqui es lo que la sincronizacion tiene que (re)escanear.
 */
export async function obtenerIdsPuertosAlDia(athleteId, fp) {
  if (!athleteId) return new Set();
  const { rows } = await pool.query(
    `SELECT s.salida_id FROM streams s
     JOIN salidas sal ON sal.id = s.salida_id
     WHERE sal.athlete_id = $1 AND s.puertos_calc IS NOT NULL AND s.puertos_calc >= $2`,
    [athleteId, fp]
  );
  return new Set(rows.map((r) => Number(r.salida_id)));
}

/**
 * Reescribe los puertos_hechos de una salida (los que devuelve
 * medirSegmentosManualesEnSalida) y marca streams.puertos_calc con la
 * version "fp" del catalogo contra la que se calcularon. Borra y vuelve a
 * insertar, igual que guardarSplits: reejecutar es idempotente. Una lista
 * vacia es valida -deja la salida marcada como "sin puertos, ya mirada".
 */
export async function guardarPuertosHechos(salidaId, fp, registros) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM puertos_hechos WHERE salida_id = $1', [salidaId]);

    for (const r of registros || []) {
      await client.query(
        `INSERT INTO puertos_hechos (athlete_id, segmento_id, salida_id, inicio, fecha, segundos, vam, desnivel, metros)
         SELECT sal.athlete_id, $2, sal.id, $3, sal.fecha, $4, $5, $6, $7
         FROM salidas sal WHERE sal.id = $1`,
        [salidaId, r.segmentoId, r.inicio,
         r.segundos ?? null, r.vam ?? null, r.desnivel ?? null, r.metros ?? null]
      );
    }

    await client.query('UPDATE streams SET puertos_calc = $2 WHERE salida_id = $1', [salidaId, fp]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Resumen por segmento de un atleta para la tabla de "Amigos":
 * { [segmentoId]: { mejorSegundos, mejorVam, veces } }. El mejor tiempo y
 * el mejor VAM pueden venir de intentos distintos -es un marcador de
 * "lo mejor que ha hecho aqui", no de una subida concreta.
 */
export async function obtenerResumenPuertos(athleteId) {
  if (!athleteId) return {};
  const { rows } = await pool.query(
    `SELECT segmento_id,
            MIN(segundos) AS mejor_segundos,
            MAX(vam) AS mejor_vam,
            COUNT(*)::int AS veces
     FROM puertos_hechos WHERE athlete_id = $1
     GROUP BY segmento_id`,
    [athleteId]
  );
  const out = {};
  rows.forEach((r) => {
    out[r.segmento_id] = {
      mejorSegundos: r.mejor_segundos == null ? null : Number(r.mejor_segundos),
      mejorVam: r.mejor_vam == null ? null : Number(r.mejor_vam),
      veces: r.veces,
    };
  });
  return out;
}

/**
 * Catálogo entero de segmentos marcados a mano (ver Perfil, modo "marcado"),
 * guardados por coordenadas para poder reconocerlos en cualquier salida que
 * pase por el mismo sitio. El alta, cambio y borrado van fila a fila
 * (crearSegmentoManual / actualizarSegmentoManual / eliminarSegmentoManual).
 */
export async function listarSegmentosManuales() {
  const { rows } = await pool.query(
    'SELECT id, nombre, nombre_vertiente, lat_inicio, lon_inicio, lat_fin, lon_fin, metros FROM segmentos_manuales'
  );
  return rows.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    nombreVertiente: r.nombre_vertiente,
    latInicio: r.lat_inicio,
    lonInicio: r.lon_inicio,
    latFin: r.lat_fin,
    lonFin: r.lon_fin,
    metros: r.metros,
  }));
}

/*
  Una fila cada vez -crear, cambiar, borrar- en vez de "manda la lista
  entera, borra la tabla y vuelve a insertarla": este catalogo lo
  comparten dos ciclistas a la vez (no lleva athlete_id, ver schema.sql),
  cada uno con su propia copia en memoria del catalogo cargada en un
  momento distinto. Con el patron de "reemplazar todo" bastaba con que
  uno guardara un cambio con su copia ya un poco desactualizada -por
  ejemplo, justo despues de que el otro creara un segmento nuevo que su
  navegador aun no habia recargado- para que ese guardado borrase de la
  base de datos cualquier cosa que no estuviera en SU copia: el segmento
  del companero desaparecia sin que nadie lo borrara a proposito. Tocando
  solo la fila que de verdad cambia, la copia desactualizada del resto no
  puede pisar nada.
*/
export async function crearSegmentoManual(d) {
  await pool.query(
    `INSERT INTO segmentos_manuales (id, nombre, nombre_vertiente, lat_inicio, lon_inicio, lat_fin, lon_fin, metros)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [d.id, d.nombre, d.nombreVertiente ?? null, d.latInicio, d.lonInicio, d.latFin, d.lonFin, d.metros ?? null]
  );
}

const COLUMNAS_SEGMENTO_MANUAL = {
  nombre: 'nombre',
  nombreVertiente: 'nombre_vertiente',
  latInicio: 'lat_inicio',
  lonInicio: 'lon_inicio',
  latFin: 'lat_fin',
  lonFin: 'lon_fin',
  metros: 'metros',
};

/* Solo escribe los campos presentes en "cambios" -un renombrado no toca
   coordenadas, un reajuste de extremos no toca el nombre. */
export async function actualizarSegmentoManual(id, cambios) {
  const entradas = Object.entries(cambios || {}).filter(([k]) => k in COLUMNAS_SEGMENTO_MANUAL);
  if (!entradas.length) return;
  const set = entradas.map(([k], i) => `${COLUMNAS_SEGMENTO_MANUAL[k]} = $${i + 2}`).join(', ');
  const valores = entradas.map(([, v]) => v);
  /* actualizado = now() marca al catalogo como cambiado: la proxima
     sincronizacion re-escanea los puertos_hechos contra esta version. */
  await pool.query(`UPDATE segmentos_manuales SET ${set}, actualizado = now() WHERE id = $1`, [id, ...valores]);
}

export async function eliminarSegmentoManual(id) {
  await pool.query('DELETE FROM segmentos_manuales WHERE id = $1', [id]);
}