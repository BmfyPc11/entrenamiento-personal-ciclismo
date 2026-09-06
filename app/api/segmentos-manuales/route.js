import { NextResponse } from 'next/server';
import { leerSesion } from '@/lib/strava';
import { listarSegmentosManuales, guardarSegmentosManuales } from '@/lib/repo';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!leerSesion()) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 });

  const definiciones = await listarSegmentosManuales();
  return NextResponse.json({ definiciones });
}

export async function POST(req) {
  if (!leerSesion()) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 });

  const { definiciones } = await req.json();
  if (!Array.isArray(definiciones)) {
    return NextResponse.json({ error: 'formato_invalido' }, { status: 400 });
  }

  await guardarSegmentosManuales(definiciones);
  return NextResponse.json({ ok: true });
}
