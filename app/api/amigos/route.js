import { NextResponse } from 'next/server';
import { leerSesion } from '@/lib/strava';
import { listarAtletas } from '@/lib/repo';

export const dynamic = 'force-dynamic';

/* Los "amigos" son, sin mas, el resto de ciclistas que han conectado su
   Strava (pool abierto, ver schema.sql). */
export async function GET() {
  const s = leerSesion();
  if (!s) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 });

  const amigos = await listarAtletas(s.atleta?.id);
  return NextResponse.json({ amigos });
}
