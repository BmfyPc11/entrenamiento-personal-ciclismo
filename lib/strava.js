import { cookies } from 'next/headers';

const COOKIE = 'sesion_strava';
const API = 'https://www.strava.com/api/v3';
const TOKEN_URL = 'https://www.strava.com/oauth/token';

/* ---------- sesion en cookie httpOnly ---------- */

export function guardarSesion(datos) {
  cookies().set(COOKIE, Buffer.from(JSON.stringify(datos)).toString('base64'), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 180, // 180 dias
  });
}

export function leerSesion() {
  const c = cookies().get(COOKIE);
  if (!c) return null;
  try {
    return JSON.parse(Buffer.from(c.value, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

export function borrarSesion() {
  cookies().delete(COOKIE);
}

/* ---------- OAuth ---------- */

export function urlAutorizacion() {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const p = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID,
    redirect_uri: `${base}/api/auth/callback`,
    response_type: 'code',
    approval_prompt: 'auto',
    // activity:read_all incluye las actividades privadas
    scope: 'read,read_all,activity:read_all,profile:read_all',
  });
  return `https://www.strava.com/oauth/authorize?${p}`;
}

export async function canjearCodigo(code) {
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    }),
  });
  if (!r.ok) throw new Error(`Strava rechazo el codigo (${r.status})`);
  return r.json();
}

async function refrescar(refresh_token) {
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  if (!r.ok) throw new Error('No se pudo refrescar el token');
  return r.json();
}

/* Devuelve un access_token valido, refrescandolo si hace falta. */
async function tokenValido() {
  const s = leerSesion();
  if (!s) return null;
  const ahora = Math.floor(Date.now() / 1000);
  if (s.expires_at > ahora + 120) return s.access_token;

  const nuevo = await refrescar(s.refresh_token);
  guardarSesion({ ...s, ...nuevo });
  return nuevo.access_token;
}

/* ---------- llamadas a la API ---------- */

/*
  Los identificadores de Strava son enteros de 64 bits y JSON.parse no
  sabe sostenerlos: cualquier entero por encima de 2^53 se redondea al
  double mas cercano. Los ids de ruta rondan los diecinueve digitos, asi
  que 3516017191061487846 se convierte en 3516017191061487600 y la ruta
  que se le pide despues a Strava sencillamente no existe. Peor todavia:
  rutas distintas pueden colapsar al mismo numero.

  Por eso el texto se retoca antes de parsearlo, entrecomillando los ids
  largos para que lleguen intactos como cadena. Solo se tocan enteros de
  dieciseis digitos o mas en claves que acaban en "id": por debajo de ese
  tamano el numero es exacto y no hay nada que arreglar, y ningun otro
  campo (distancias, tiempos, altitudes) llega jamas a esa magnitud.
*/
function parseJsonSeguro(texto) {
  return JSON.parse(texto.replace(/"(\w*id)":\s*(\d{16,})/g, '"$1":"$2"'));
}

/*
  Strava manda en cada respuesta, exito o error, cuanto llevas gastado de
  tus dos topes (15 minutos y diario) como "usados,limite" en un par de
  cabeceras. Se recoge aqui para que quien pida muchas cosas seguidas
  (el listado de actividades, la sincronizacion de streams en segundo
  plano) pueda frenar antes de chocar con el limite, en vez de enterarse
  a base de 429 -que es justo lo que agoto la cuota el 15 de agosto.
*/
function leerLimite(headers) {
  const usados = headers.get('x-ratelimit-usage');
  const tope = headers.get('x-ratelimit-limit');
  if (!usados || !tope) return null;
  const [usoCorto, usoDia] = usados.split(',').map(Number);
  const [topeCorto, topeDia] = tope.split(',').map(Number);
  if (!topeCorto || !topeDia) return null;
  return { corto: { usado: usoCorto, tope: topeCorto }, dia: { usado: usoDia, tope: topeDia } };
}

/* Por encima del 90 % de cualquiera de los dos topes, mejor parar de pedir
   cosas por iniciativa propia y dejar el margen que quede para lo que el
   usuario pida a mano. */
export function cercaDelLimite(limite) {
  if (!limite) return false;
  return limite.corto.usado / limite.corto.tope > 0.9
    || limite.dia.usado / limite.dia.tope > 0.9;
}

export async function api(ruta, params = {}) {
  const token = await tokenValido();
  if (!token) return { error: 'sin_sesion' };

  const url = new URL(API + ruta);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const limite = leerLimite(r.headers);

  if (r.status === 429) return { error: 'limite_alcanzado', limite };
  if (r.status === 401) return { error: 'sin_sesion' };
  if (!r.ok) return { error: `strava_${r.status}`, limite };

  try {
    return { datos: parseJsonSeguro(await r.text()), limite };
  } catch {
    return { error: 'respuesta_ilegible', limite };
  }
}

/*
  Trae todas las actividades de tipo bicicleta, paginando.

  conocidas: mapa opcional {id: personas} que manda el cliente con lo que
  ya tiene cacheado de una carga anterior. athlete_count no viene en el
  listado y hay que pedirlo actividad por actividad -sin este mapa, cada
  carga de la app (cada F5) repetia esa llamada para las mismas salidas de
  siempre, una a una, solo para confirmar un dato que casi nunca cambia
  una vez terminada la salida. Con el mapa, solo se pide para las
  actividades realmente nuevas.
*/
export async function traerActividades(maxPaginas = 5, conocidas = null) {
  const salidas = [];
  let limite = null;
  for (let p = 1; p <= maxPaginas; p++) {
    const r = await api('/athlete/activities', { per_page: 200, page: p });
    limite = r.limite || limite;
    if (r.error) return { error: r.error, salidas, limite };
    if (!r.datos.length) break;
    salidas.push(...r.datos);
    if (r.datos.length < 200) break;
    if (cercaDelLimite(limite)) break;
  }
  const bici = new Set(['Ride', 'GravelRide', 'MountainBikeRide', 'VirtualRide', 'EBikeRide']);
  let resultado = salidas
    .filter((a) => bici.has(a.sport_type || a.type))
    .map((a) => ({
      id: a.id,
      nombre: a.name,
      tipo: a.sport_type || a.type,
      fecha: a.start_date_local,
      distancia: a.distance,
      tiempoMovimiento: a.moving_time,
      tiempoTotal: a.elapsed_time,
      desnivel: a.total_elevation_gain,
      velMedia: a.average_speed,
      velMax: a.max_speed,
      fcMedia: a.average_heartrate ?? null,
      fcMax: a.max_heartrate ?? null,
      vatios: a.average_watts ?? null,
      vatiosReales: !!a.device_watts,
      calorias: a.kilojoules ?? null,
      esfuerzo: a.suffer_score ?? null,
      personas: a.athlete_count ?? 1,
      fotos: a.total_photo_count ?? 0,
      kudos: a.kudos_count ?? 0,
      comentarios: a.comment_count ?? 0,
      prs: a.pr_count ?? 0,
      logrosStrava: a.achievement_count ?? 0,
    }));

  /*
    athlete_count no viene en el listado de /athlete/activities: hay que
    pedir cada actividad individual. Solo se pide para las que el cliente
    no traiga ya en "conocidas" -el resto toma directamente ese valor. Si
    a mitad de la tanda el margen que queda del limite baja del 10 %, se
    corta aqui: las que se quedan sin dato de sobra se quedan con "1" (el
    valor por defecto) hasta la proxima carga, mejor eso que gastar lo
    poco que queda del limite en un dato secundario.
  */
  const actualizarPersonas = async () => {
    const pendientes = resultado.filter((s) => {
      const previo = conocidas?.[s.id];
      if (previo == null) return true;
      s.personas = previo;
      return false;
    });

    const bloqueSize = 5;
    for (let i = 0; i < pendientes.length; i += bloqueSize) {
      if (cercaDelLimite(limite)) break;
      await Promise.all(
        pendientes.slice(i, i + bloqueSize).map(async (s) => {
          const r = await api(`/activities/${s.id}`);
          limite = r.limite || limite;
          if (r.datos?.athlete_count) s.personas = r.datos.athlete_count;
        })
      );
      if (i + bloqueSize < pendientes.length) await new Promise((r) => setTimeout(r, 100));
    }
  };
  await actualizarPersonas();

  return {
    salidas: resultado.sort((x, y) => (x.fecha < y.fecha ? -1 : 1)),
    limite,
  };
}

/* Trae los streams de una actividad concreta. */
export async function traerStreams(id) {
  const { datos, error, limite } = await api(`/activities/${id}/streams`, {
    keys: 'distance,altitude,heartrate,time,velocity_smooth,cadence,watts,latlng',
    key_by_type: 'true',
  });
  if (error) return { error, limite };
  const g = (k) => (datos[k] ? datos[k].data : null);
  return {
    streams: {
      distancia: g('distance'),
      altitud: g('altitude'),
      fc: g('heartrate'),
      tiempo: g('time'),
      velocidad: g('velocity_smooth'),
      cadencia: g('cadence'),
      vatios: g('watts'),
      latlng: g('latlng'),
    },
    limite,
  };
}

/*
  Nombres de los segmentos que cruza una actividad.

  Solo se toma el nombre y los indices. Los datos numericos del segmento
  (longitud, desnivel, pendiente) se ignoran a proposito: son poco
  fiables y el panel ya los calcula por su cuenta desde los streams.
*/
export async function traerSegmentos(id) {
  const { datos, error } = await api(`/activities/${id}`, {
    include_all_efforts: 'true',
  });
  if (error) return { error };

  const efforts = Array.isArray(datos?.segment_efforts) ? datos.segment_efforts : [];

  return {
    segmentos: efforts
      .filter((e) => e?.segment?.name && e.start_index != null && e.end_index != null)
      .map((e) => ({
        nombre: e.segment.name,
        inicio: e.start_index,
        fin: e.end_index,
        categoria: e.segment.climb_category || 0,
      })),
  };
}

/* ---------- rutas guardadas del ciclista ---------- */

/*
  Devuelve las rutas que el ciclista tiene guardadas en Strava. Necesita
  el scope read_all: si la cuenta se conecto antes de anadirlo, Strava
  responde 401 y hay que volver a autorizar.
*/
export async function traerRutas(maxPaginas = 3) {
  const todas = [];
  for (let p = 1; p <= maxPaginas; p++) {
    const { datos, error } = await api('/athlete/routes', { page: p, per_page: 50 });
    if (error) return { error };
    if (!Array.isArray(datos) || !datos.length) break;
    todas.push(...datos);
    if (datos.length < 50) break;
  }
  return {
    rutas: todas.map((r) => ({
      id: String(r.id),
      nombre: r.name || 'Ruta sin nombre',
      descripcion: r.description || '',
      metros: r.distance || 0,
      desnivel: r.elevation_gain || 0,
      tipo: r.type === 1 ? 'ride' : r.type === 2 ? 'run' : 'otro',
      subtipo: r.sub_type,
      fecha: r.created_at,
      privada: r.private,
    })),
  };
}

/*
  Strava expone el trazado completo con altitud en formato GPX. Es la via
  mas limpia: se reutiliza el mismo parser que ya usamos para los archivos
  que sube el usuario, en vez de decodificar polilineas sin altitud.
*/
export async function traerGpxRuta(id) {
  /*
    El token se pide a tokenValido() y no se lee a mano de la cookie.
    Hacerlo a mano fue justo el fallo que tuvo esta funcion hasta la v3.3:
    leia ses.access, un campo que no existe (la sesion guarda access_token),
    asi que mandaba "Bearer undefined" y Strava devolvia 401 siempre. El
    listado de rutas si funcionaba porque va por api(), y por eso el sintoma
    era ver la lista pero no poder abrir ninguna.

    Pasar por tokenValido() ademas refresca el token si esta a punto de
    caducar, que es lo que hace el resto del panel.
  */
  const token = await tokenValido();
  if (!token) return { error: 'sin_sesion' };

  const r = await fetch(`https://www.strava.com/api/v3/routes/${id}/export_gpx`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (r.status === 429) return { error: 'limite_alcanzado' };
  if (!r.ok) return { error: `strava_${r.status}` };

  const gpx = await r.text();
  /*
    Un GPX sin puntos parsearia a una ruta vacia y reventaria el perfil
    aguas abajo, asi que se corta aqui. Se aceptan las dos formas: Strava
    exporta unas rutas como track (<trkpt>) y otras como ruta (<rtept>),
    y parseGPX contempla ambas. Mirar solo una de las dos rechazaria
    archivos perfectamente validos.
  */
  if (!gpx || (!gpx.includes('<trkpt') && !gpx.includes('<rtept'))) {
    return { error: 'gpx_vacio' };
  }

  return { gpx };
}
