import { NextResponse } from 'next/server';
import { canjearCodigo, guardarSesion } from '@/lib/strava';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  const { searchParams } = new URL(req.url);

  if (searchParams.get('error')) {
    return NextResponse.redirect(`${base}/?error=permiso_denegado`);
  }

  const code = searchParams.get('code');
  const scope = searchParams.get('scope') || '';
  if (!code) return NextResponse.redirect(`${base}/?error=sin_codigo`);

  if (!scope.includes('activity:read')) {
    return NextResponse.redirect(`${base}/?error=falta_permiso_actividades`);
  }

  try {
    const t = await canjearCodigo(code);
    guardarSesion({
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      expires_at: t.expires_at,
      atleta: {
        id: t.athlete?.id,
        nombre: [t.athlete?.firstname, t.athlete?.lastname].filter(Boolean).join(' '),
        foto: t.athlete?.profile_medium || null,
        peso: t.athlete?.weight || null,
      },
    });
    return NextResponse.redirect(`${base}/`);
  } catch {
    return NextResponse.redirect(`${base}/?error=fallo_conexion`);
  }
}
