import { NextResponse } from 'next/server';
import { leerSesion, traerActividades, traerStreams, traerSegmentos, cercaDelLimite } from '@/lib/strava';
import { guardarSalidas, guardarStreams, guardarSegmentos } from '@/lib/repo';

export const dynamic = 'force-dynamic';

export async function POST() {
	const s = leerSesion();
	if (!s) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 });
	
	const { salidas, error } = await traerActividades();
	if (error && !salidas?.length) return NextResponse.json({ error }, { status: 502 });

	await guardarSalidas(salidas, s.atleta?.id);
	
	let limite = null;
	for (const salida of salidas) {
		if (cercaDelLimite(limite)) break;
		const r = await traerStreams(salida.id);
		limite = r.limite || limite;
		if (r.streams) await guardarStreams(salida.id, r.streams);
		const rs = await traerSegmentos(salida.id);
		if (rs.segmentos) await guardarSegmentos(salida.id, rs.segmentos);
	}

	return NextResponse.json({ 
	ok: true, 
	sincronizadas: salidas.length, 
	aviso: error || null 
	});
}