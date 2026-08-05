import { NextResponse } from 'next/server';
import { urlAutorizacion } from '@/lib/strava';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!process.env.STRAVA_CLIENT_ID || !process.env.STRAVA_CLIENT_SECRET) {
    return NextResponse.json(
      { error: 'Faltan STRAVA_CLIENT_ID o STRAVA_CLIENT_SECRET en las variables de entorno.' },
      { status: 500 }
    );
  }
  return NextResponse.redirect(urlAutorizacion());
}
