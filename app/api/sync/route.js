import { NextResponse } from 'next/server';
import { leerSesion, traerActividades, traerStreams, traerSegmentos, cercaDelLimite } from '@/lib/strava';
import {
	guardarSalidas, guardarStreams, guardarSegmentos, obtenerIdsConStreams, obtenerPersonasConocidas,
	guardarSplits, obtenerIdsConSplits, obtenerStreams,
} from '@/lib/repo';
import { calcularSplits } from '@/lib/metrics';

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
		if (r.streams) {
			await guardarStreams(salida.id, r.streams);
			await guardarSplits(salida.id, calcularSplits(r.streams));
		}
		const rs = await traerSegmentos(salida.id);
		if (rs.segmentos) await guardarSegmentos(salida.id, rs.segmentos);
	}

	/*
	  Backfill de splits para salidas que ya tenian streams guardados de
	  antes de que este calculo existiera. Es lectura/escritura local en
	  Postgres, sin llamar a Strava, asi que no compite con el limite de
	  la API y puede procesar todo el historico pendiente de una vez.
	*/
	const idsConSplits = await obtenerIdsConSplits(athleteId);
	const faltanSplits = [...idsConStreams].filter((id) => !idsConSplits.has(id));
	for (const id of faltanSplits) {
		const streams = await obtenerStreams(id);
		if (streams) await guardarSplits(id, calcularSplits(streams));
	}

	return NextResponse.json({
	ok: true,
	sincronizadas: salidas.length,
	detalleNuevo: pendientes.length,
	aviso: error || null
	});
}