import { NextResponse } from 'next/server';
import { leerSesion } from '@/lib/strava';
import { obtenerSplits } from '@/lib/repo';

export const dynamic = 'force-dynamic';

export async function GET() {
  const s = leerSesion();
  if (!s) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 });

  const splits = await obtenerSplits(s.atleta?.id);
  return NextResponse.json({ splits });
}
