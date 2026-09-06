import { NextResponse } from 'next/server';
import { leerSesion } from '@/lib/strava';
import {
  listarAtletas, listarSalidas, obtenerSplits,
  listarSegmentosManuales, obtenerResumenPuertos,
} from '@/lib/repo';
import { mejoresSplits, volumen } from '@/lib/amigos';

export const dynamic = 'force-dynamic';

/*
  Comparacion de quien mira contra el resto de ciclistas conectados. Todo
  se calcula en el servidor y solo se devuelven las cifras agregadas
  -nunca los streams de nadie, que son enormes-. Los puertos salen ya
  precalculados de la tabla puertos_hechos (la llena /api/sync). N+1
  consultas, pero N es el numero de personas que han conectado (2-3).
*/
export async function GET() {
  const s = leerSesion();
  if (!s) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 });
  const yo = s.atleta;
  if (!yo?.id) return NextResponse.json({ error: 'sin_atleta' }, { status: 400 });

  const otros = await listarAtletas(yo.id);
  const atletas = [
    { id: Number(yo.id), nombre: yo.nombre, yo: true },
    ...otros.map((a) => ({ id: a.id, nombre: a.nombre, yo: false })),
  ];

  const segmentos = await listarSegmentosManuales();

  const ahora = Date.now();
  const comparacion = [];
  for (const a of atletas) {
    const salidas = await listarSalidas(a.id);
    const splits = await obtenerSplits(a.id);
    comparacion.push({
      id: a.id,
      splits: mejoresSplits(salidas, splits),
      volumen: volumen(salidas, ahora),
      puertos: await obtenerResumenPuertos(a.id),
    });
  }

  return NextResponse.json({ atletas, segmentos, comparacion });
}
