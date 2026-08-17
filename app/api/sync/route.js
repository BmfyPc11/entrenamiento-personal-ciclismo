import { NextResponse } from 'next/server';
import { leerSesion, traerActividades } from '@/lib/strava';
import { guardarSalidas } from '@/lib/repo';

export const dynamic = 'force-dynamic';

export async function POST() {
	const s = leerSesion();
	if (!s) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 });
	
	const { salidas, error } = await traerActividades();
	if (error && !salidas?.length) return NextResponse.json({ error }, { status: 502 });

	await guardarSalidas(salidas);

	return NextResponse.json({ 
	ok: true, 
	sincronizadas: salidas.length, 
	aviso: error || null 
	});
}