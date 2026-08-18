import { NextResponse } from 'next/server';
import { leerSesion } from '@/lib/strava';
import { listarNombresCima, guardarNombresCima } from '@/lib/repo';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!leerSesion()) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 });

  const entradas = await listarNombresCima();
  return NextResponse.json({ entradas });
}

export async function POST(req) {
  if (!leerSesion()) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 });

  const { entradas } = await req.json();
  if (!Array.isArray(entradas)) {
    return NextResponse.json({ error: 'formato_invalido' }, { status: 400 });
  }

  await guardarNombresCima(entradas);
  return NextResponse.json({ ok: true });
}
