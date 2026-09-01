import { NextResponse } from 'next/server';
import { leerSesion, ultimasActividades } from '@/lib/strava';
import { idsExistentes } from '@/lib/repo';

export const dynamic = 'force-dynamic';

/*
  Cuantas actividades recientes se comprueban como maximo. Si las
  TOPE mas recientes resultan ser todas nuevas, no se puede saber el
  numero exacto sin pedir mas paginas -se avisa de "mas de TOPE-1" en
  vez de fingir que TOPE es la cifra real.
*/
const TOPE = 11;

export async function GET() {
  const s = leerSesion();
  if (!s) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 });

  const r = await ultimasActividades(TOPE);
  if (r.error) return NextResponse.json({ error: r.error }, { status: 502 });

  const existentes = await idsExistentes(r.ids, s.atleta?.id);
  const nuevas = r.ids.filter((id) => !existentes.has(id));

  return NextResponse.json({
    cantidad: nuevas.length,
    saturado: nuevas.length === TOPE,
  });
}
