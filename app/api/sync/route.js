import { NextResponse } from 'next/server';
import { leerSesion, traerActividades, traerStreams, cercaDelLimite } from '@/lib/strava';
import {
	guardarSalidas, guardarStreams, obtenerIdsConStreams, obtenerPersonasConocidas,
	guardarSplits, obtenerIdsConSplits, obtenerStreams,
	listarSegmentosManuales, fingerprintCatalogo, obtenerIdsPuertosAlDia, guardarPuertosHechos,
	registrarAtleta,
} from '@/lib/repo';
import { calcularSplits, medirSegmentosManualesEnSalida } from '@/lib/metrics';

export const dynamic = 'force-dynamic';

export async function POST() {
	const s = leerSesion();
	if (!s) return NextResponse.json({ error: 'sin_sesion' }, { status: 401 });
	const athleteId = s.atleta?.id;

	/* Registrar al atleta en cada sync (no solo en el login OAuth): asi
	   quien ya tenia la sesion abierta antes de que existiera la tabla
	   "atletas" aparece en la pestana Amigos sin tener que reconectar. */
	try { await registrarAtleta(s.atleta); } catch {}

	const conocidas = await obtenerPersonasConocidas(athleteId);
	const { salidas, error } = await traerActividades(5, conocidas);
	if (error && !salidas?.length) return NextResponse.json({ error }, { status: 502 });

	await guardarSalidas(salidas, athleteId);

	/*
	  El detalle (streams) solo se pide de lo que todavia no lo tiene
	  guardado: son datos que no cambian una vez terminada la salida, asi
	  que releerlos en cada sincronizacion era trabajo tirado -y lo que de
	  verdad hacia lenta la sincronizacion cuanto mas historico habia.
	  Se procesan de mas reciente a mas antigua para que, si el limite de
	  Strava corta la tanda a medias, lo que se quede sin sincronizar sea
	  lo mas viejo y no lo ultimo que ha subido el usuario.
	*/
	/* Catalogo de segmentos manuales y su version, para medir los puertos de
	   cada salida (ver puertos_hechos en schema.sql). Se leen una vez. */
	const definicionesSegmentos = await listarSegmentosManuales();
	const fpPuertos = await fingerprintCatalogo();

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
			await guardarPuertosHechos(salida.id, fpPuertos,
				medirSegmentosManualesEnSalida(r.streams, definicionesSegmentos));
		}
	}

	/*
	  Backfill sobre salidas que ya tenian streams guardados: splits que
	  faltan (de antes de que ese calculo existiera) y puertos_hechos que no
	  estan al dia con la version actual del catalogo (segmento nuevo o
	  editado). Es lectura/escritura local en Postgres, sin llamar a Strava,
	  asi que no compite con el limite de la API. Un solo recorrido, con una
	  sola lectura de streams por salida.
	*/
	const idsConSplits = await obtenerIdsConSplits(athleteId);
	const idsPuertosAlDia = await obtenerIdsPuertosAlDia(athleteId, fpPuertos);
	for (const id of idsConStreams) {
		const faltaSplits = !idsConSplits.has(id);
		const faltaPuertos = !idsPuertosAlDia.has(id);
		if (!faltaSplits && !faltaPuertos) continue;
		const streams = await obtenerStreams(id);
		if (!streams) continue;
		if (faltaSplits) await guardarSplits(id, calcularSplits(streams));
		if (faltaPuertos) {
			await guardarPuertosHechos(id, fpPuertos,
				medirSegmentosManualesEnSalida(streams, definicionesSegmentos));
		}
	}

	return NextResponse.json({
	ok: true,
	sincronizadas: salidas.length,
	detalleNuevo: pendientes.length,
	aviso: error || null
	});
}