import { NextResponse } from 'next/server';
import { borrarSesion } from '@/lib/strava';

export const dynamic = 'force-dynamic';

export async function POST() {
  borrarSesion();
  return NextResponse.json({ ok: true });
}
