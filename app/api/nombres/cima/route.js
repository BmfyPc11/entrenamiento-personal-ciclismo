import { NextResponse } from 'next/server';
import { elegirCima, normalizarNombre } from '@/lib/nombres';
import { distanciaGeo } from '@/lib/metrics';

export const dynamic = 'force-dynamic';

const OVERPASS = 'https://overpass-api.de/api/interpreter';

/* Radio de consulta amplio a proposito: un nodo lejano con la altitud
   correcta vale mas que uno pegado a una altitud que no cuadra, y hay
   que traerlo para poder compararlo. Quien decide es elegirCima. */
const RADIO_CONSULTA = 1000;

export async function GET(req) {
  const p = new URL(req.url).searchParams;
  const lat = parseFloat(p.get('lat'));
  const lon = parseFloat(p.get('lon'));
  const alt = p.get('alt') != null ? parseFloat(p.get('alt')) : null;

  if (!isFinite(lat) || !isFinite(lon)) {
    return NextResponse.json({ error: 'faltan_coordenadas' }, { status: 400 });
  }

  const q = `[out:json][timeout:20];(` +
    `node(around:${RADIO_CONSULTA},${lat},${lon})[natural=peak];` +
    `node(around:${RADIO_CONSULTA},${lat},${lon})[natural=saddle];` +
    `node(around:${RADIO_CONSULTA},${lat},${lon})[mountain_pass];` +
    `);out body;`;

  let datos;
  try {
    const r = await fetch(OVERPASS, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        /* Overpass pide identificarse. Es un servicio de voluntarios y
           las peticiones anonimas se cortan antes. Esta cabecera es
           tambien el motivo de que esto viva en el servidor: un
           navegador tiene prohibido fijarla. */
        'User-Agent': 'cuaderno-de-ruta (panel personal de ciclismo)',
      },
      body: `data=${encodeURIComponent(q)}`,
      cache: 'no-store',
    });
    if (!r.ok) return NextResponse.json({ error: `overpass_${r.status}` }, { status: 502 });

    const texto = await r.text();
    /* Overpass devuelve una pagina XML cuando esta saturado, aunque se
       le pida JSON. Intentar parsearla revienta, asi que se trata como
       un fallo del servicio y punto. */
    try { datos = JSON.parse(texto); }
    catch { return NextResponse.json({ error: 'overpass_saturado' }, { status: 502 }); }
  } catch {
    return NextResponse.json({ error: 'overpass_inaccesible' }, { status: 502 });
  }

  const candidatos = (datos.elements || []).map((e) => ({
    nombre: e.tags?.name || null,
    distancia: distanciaGeo([lat, lon], [e.lat, e.lon]),
    altitud: e.tags?.ele != null ? parseFloat(e.tags.ele) : null,
  }));

  const elegida = elegirCima(candidatos, alt);
  return NextResponse.json({ nombre: elegida ? normalizarNombre(elegida.nombre) : null });
}
