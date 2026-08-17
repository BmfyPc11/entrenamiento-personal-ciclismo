import { NextResponse } from 'next/server';
import { leerSesion, traerStreams } from '@/lib/strava';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  if (!leerSesion()) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'falta_id' }, { status: 400 });

  const { streams, error, limite } = await traerStreams(id);
  if (error) return NextResponse.json({ error, limite }, { status: 502 });

  return NextResponse.json({ streams, limite });
}
