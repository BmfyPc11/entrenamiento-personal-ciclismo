import { NextResponse } from 'next/server';
import { leerSesion } from '@/lib/strava';
import { listarSegmentosManuales, crearSegmentoManual } from '@/lib/repo';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!leerSesion()) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 });

  const definiciones = await listarSegmentosManuales();
  return NextResponse.json({ definiciones });
}

/* Da de alta UN segmento nuevo -no reemplaza el catalogo entero, ver el
   comentario de crearSegmentoManual en lib/repo.js. Cambiar o borrar uno
   ya existente va por /api/segmentos-manuales/[id] (PATCH/DELETE). */
export async function POST(req) {
  if (!leerSesion()) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 });

  const d = await req.json();
  if (!d || typeof d.id !== 'string') {
    return NextResponse.json({ error: 'formato_invalido' }, { status: 400 });
  }

  await crearSegmentoManual(d);
  return NextResponse.json({ ok: true });
}
