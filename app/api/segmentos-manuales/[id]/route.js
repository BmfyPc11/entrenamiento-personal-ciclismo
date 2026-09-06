import { NextResponse } from 'next/server';
import { leerSesion } from '@/lib/strava';
import { actualizarSegmentoManual, eliminarSegmentoManual } from '@/lib/repo';

export const dynamic = 'force-dynamic';

/* Cambia solo los campos que llegan en el cuerpo -un renombrado no manda
   coordenadas, un reajuste de extremos no manda el nombre- para no pisar
   el resto del catalogo (ver el comentario de crearSegmentoManual en
   lib/repo.js: este catalogo lo comparten dos ciclistas a la vez). */
export async function PATCH(req, { params }) {
  if (!leerSesion()) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 });

  const cambios = await req.json();
  await actualizarSegmentoManual(params.id, cambios);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req, { params }) {
  if (!leerSesion()) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 });

  await eliminarSegmentoManual(params.id);
  return NextResponse.json({ ok: true });
}
