import { NextResponse } from 'next/server';
import { leerSesion, traerActividades } from '@/lib/strava';

export const dynamic = 'force-dynamic';

async function responder(conocidas) {
  const s = leerSesion();
  if (!s) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 });

  const { salidas, error, limite } = await traerActividades(5, conocidas);
  if (error && !salidas?.length) return NextResponse.json({ error, limite }, { status: 502 });

  return NextResponse.json({ salidas, atleta: s.atleta, aviso: error || null, limite });
}

export async function GET() {
  return responder(null);
}

/*
  El cliente manda aqui, en el cuerpo, el mapa {id: personas} que ya tiene
  cacheado de una carga anterior -asi traerActividades solo pide a Strava
  el athlete_count de las actividades que de verdad no conoce todavia, en
  vez de las N de siempre en cada carga. Ver el comentario en lib/strava.js.
*/
export async function POST(req) {
  let conocidas = null;
  try {
    const body = await req.json();
    conocidas = body?.conocidas || null;
  } catch { /* sin cuerpo o cuerpo invalido: se sigue como un GET normal */ }
  return responder(conocidas);
}
