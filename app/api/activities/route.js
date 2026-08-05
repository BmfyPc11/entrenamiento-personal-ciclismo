import { NextResponse } from 'next/server';
import { leerSesion, traerActividades } from '@/lib/strava';

export const dynamic = 'force-dynamic';

export async function GET() {
  const s = leerSesion();
  if (!s) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 });

  const { salidas, error } = await traerActividades();
  if (error && !salidas?.length) return NextResponse.json({ error }, { status: 502 });

  return NextResponse.json({ salidas, atleta: s.atleta, aviso: error || null });
}
