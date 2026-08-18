import { NextResponse } from 'next/server';
import { leerSesion } from '@/lib/strava';
import { obtenerSegmentos } from '@/lib/repo';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  if (!leerSesion()) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'falta_id' }, { status: 400 });

  const segmentos = await obtenerSegmentos(id);
  return NextResponse.json({ segmentos });
}
