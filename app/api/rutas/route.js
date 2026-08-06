import { NextResponse } from 'next/server';
import { leerSesion, traerRutas } from '@/lib/strava';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!leerSesion()) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 });

  const { rutas, error } = await traerRutas();
  if (error) {
    /*
      Un 401 aqui casi siempre significa que la cuenta se conecto antes de
      que pidiesemos el permiso de lectura de rutas, no que el token haya
      caducado. Conviene distinguirlo para poder decirselo al usuario.
    */
    const falta = error === 'strava_401' || error === 'strava_403';
    return NextResponse.json(
      { error: falta ? 'sin_permiso_rutas' : error },
      { status: falta ? 403 : 502 }
    );
  }
  return NextResponse.json({ rutas });
}
