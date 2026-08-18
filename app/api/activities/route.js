import { NextResponse } from 'next/server';
import { leerSesion } from '@/lib/strava';
import { listarSalidas } from '@/lib/repo';

export const dynamic = 'force-dynamic';

export async function GET() {
  const s = leerSesion();
  if (!s) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 });

  const salidas = await listarSalidas();
  return NextResponse.json({ salidas, atleta: s.atleta });
}
