import { NextResponse } from 'next/server';
import { leerSesion, traerActividades, traerStreams, traerSegmentos, cercaDelLimite } from '@/lib/strava';
import { guardarSalidas, guardarStreams, guardarSegmentos, obtenerIdsConStreams, obtenerPersonasConocidas } from '@/lib/repo';

export const dynamic = 'force-dynamic';

export async function POST() {
	const s = leerSesion();
	if (!s) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 });
	const athleteId = s.atleta?.id;

	const conocidas = await obtenerPersonasConocidas(athleteId);
	const { salidas, error } = await traerActividades(5, conocidas);
	if (error && !salidas?.length) return NextResponse.json({ error }, { status: 502 });

	await guardarSalidas(salidas, athleteId);

	/*
	  El detalle (streams + segmentos) solo se pide de lo que todavia no lo
	  tiene guardado: son datos que no cambian una vez terminada la salida,
	  asi que releerlos en cada sincronizacion era trabajo tirado -y lo que
	  de verdad hacia lenta la sincronizacion cuanto mas historico habia.
	  Se procesan de mas reciente a mas antigua para que, si el limite de
	  Strava corta la tanda a medias, lo que se quede sin sincronizar sea
	  lo mas viejo y no lo ultimo que ha subido el usuario.
	*/
	const idsConStreams = await obtenerIdsConStreams(athleteId);
	const pendientes = salidas.filter((salida) => !idsConStreams.has(salida.id)).reverse();

	let limite = null;
	for (const salida of pendientes) {
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
	detalleNuevo: pendientes.length,
	aviso: error || null
	});
}