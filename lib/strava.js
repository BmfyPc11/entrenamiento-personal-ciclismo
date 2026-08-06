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

export async function api(ruta, params = {}) {
  const token = await tokenValido();
  if (!token) return { error: 'sin_sesion' };

  const url = new URL(API + ruta);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (r.status === 429) return { error: 'limite_alcanzado' };
  if (r.status === 401) return { error: 'sin_sesion' };
  if (!r.ok) return { error: `strava_${r.status}` };
  return { datos: await r.json() };
}

/* Trae todas las actividades de tipo bicicleta, paginando. */
export async function traerActividades(maxPaginas = 5) {
  const salidas = [];
  for (let p = 1; p <= maxPaginas; p++) {
    const { datos, error } = await api('/athlete/activities', { per_page: 200, page: p });
    if (error) return { error, salidas };
    if (!datos.length) break;
    salidas.push(...datos);
    if (datos.length < 200) break;
  }
  const bici = new Set(['Ride', 'GravelRide', 'MountainBikeRide', 'VirtualRide', 'EBikeRide']);
  return {
    salidas: salidas
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
      }))
      .sort((x, y) => (x.fecha < y.fecha ? -1 : 1)),
  };
}

/* Trae los streams de una actividad concreta. */
export async function traerStreams(id) {
  const { datos, error } = await api(`/activities/${id}/streams`, {
    keys: 'distance,altitude,heartrate,time,velocity_smooth,cadence,watts,latlng',
    key_by_type: 'true',
  });
  if (error) return { error };
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
  const ses = leerSesion();
  if (!ses) return { error: 'sin_sesion' };
  const r = await fetch(`https://www.strava.com/api/v3/routes/${id}/export_gpx`, {
    headers: { Authorization: `Bearer ${ses.access}` },
    cache: 'no-store',
  });
  if (!r.ok) return { error: `strava_${r.status}` };
  return { gpx: await r.text() };
}
