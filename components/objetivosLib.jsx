'use client';

import { detectarPuertos, vatios, num, esLlana, kmh } from '@/lib/metrics';

export const OBJETIVOS_INICIALES = {
  llano: 30,        // km/h de crucero en terreno llano
  puertoKm: 5,      // longitud del puerto objetivo
  puertoPend: 6,    // pendiente minima que cuenta para ese puerto
  rampaKm: 2,       // longitud de la rampa corta objetivo
  rampaPend: 8,     // pendiente minima de la rampa
};

/*
  Progreso real hacia cada objetivo.

  Se mide contra el mejor registro, no contra la media: un objetivo se
  alcanza el dia que lo consigues una vez, no cuando lo promedias.
*/
export function calcularObjetivos({ salidas, cache, excluidas, cfg, masaTotal, obj, refTerreno }) {
  const o = { ...OBJETIVOS_INICIALES, ...(obj || {}) };

  const llanas = salidas.filter((s) => esLlana(s, refTerreno));
  const mejorLlano = llanas.length ? Math.max(...llanas.map(kmh)) : 0;

  const puertos = Object.entries(cache || {}).flatMap(([id, st]) =>
    excluidas?.has(Number(id))
      ? []
      : detectarPuertos(st, { minMetros: 600, minDesnivel: 40, minPend: 3 })
  );

  // Para el puerto largo cuenta cualquier ascenso en su franja de pendiente
  const candidatosPuerto = puertos.filter(
    (p) => p.pendiente >= o.puertoPend - 0.3 && p.pendiente < o.rampaPend - 0.3
  );
  const mejorPuerto = candidatosPuerto.sort((a, b) => b.metros - a.metros)[0];

  const candidatosRampa = puertos.filter((p) => p.pendiente >= o.rampaPend - 0.3);
  const mejorRampa = candidatosRampa.sort((a, b) => b.metros - a.metros)[0];

  const wActual = mejorLlano ? vatios(mejorLlano / 3.6, 0, masaTotal, cfg.cda, cfg.crr) : 0;
  const wObjetivo = vatios(o.llano / 3.6, 0, masaTotal, cfg.cda, cfg.crr);

  const sinAnalizar = Object.keys(cache || {}).length === 0;

  return {
    o,
    wActual,
    wObjetivo,
    sinAnalizar,
    lista: [
      {
        id: 'llano',
        n: `${num(o.llano, 0)} km/h de crucero en llano`,
        pct: mejorLlano ? Math.min(100, (mejorLlano / o.llano) * 100) : 0,
        color: 'var(--blue)',
        dato: mejorLlano ? `${num(mejorLlano, 1)} de ${num(o.llano, 0)} km/h` : 'sin medir',
        nota: mejorLlano
          ? `Tu mejor registro en terreno realmente llano. Los ${num(Math.max(0, o.llano - mejorLlano), 1)} km/h que faltan significan pasar de ${num(wActual, 0)} a ${num(wObjetivo, 0)} W sostenidos.`
          : 'Aún no hay salidas en terreno llano puro para medirlo.',
      },
      {
        id: 'puerto',
        n: `Puerto de ${num(o.puertoKm, 0)} km al ${num(o.puertoPend, 0)}–${num(o.rampaPend - 1, 0)} %`,
        pct: mejorPuerto ? Math.min(100, (mejorPuerto.metros / 1000 / o.puertoKm) * 100) : 0,
        color: 'var(--red)',
        dato: mejorPuerto
          ? `${num(mejorPuerto.metros / 1000, 2)} de ${num(o.puertoKm, 0)} km`
          : sinAnalizar ? 'sin salidas analizadas' : 'sin ascensos en esa franja',
        nota: mejorPuerto
          ? `Tu ascenso más largo en ese rango: ${num(mejorPuerto.metros / 1000, 2)} km al ${num(mejorPuerto.pendiente, 1)} %. Faltan ${num(Math.max(0, o.puertoKm - mejorPuerto.metros / 1000), 2)} km de pendiente sostenida, que es más cuestión de elegir el puerto adecuado que de forma.`
          : 'Abre salidas con desnivel en Entrenamientos para que el panel las analice.',
      },
      {
        id: 'rampa',
        n: `${num(o.rampaKm, 0)}–${num(o.rampaKm + 1, 0)} km al ${num(o.rampaPend, 0)}–${num(o.rampaPend + 1, 0)} %`,
        pct: mejorRampa ? Math.min(100, (mejorRampa.metros / 1000 / o.rampaKm) * 100) : 0,
        color: 'var(--amber)',
        dato: mejorRampa
          ? `${num(mejorRampa.metros / 1000, 2)} km al ${num(mejorRampa.pendiente, 1)} %`
          : sinAnalizar ? 'sin salidas analizadas' : 'sin ascensos en esa franja',
        nota: mejorRampa
          ? `Tu mejor ascenso por encima del ${num(o.rampaPend, 0)} %.${mejorRampa.vam ? ` Lo subiste a ${num(mejorRampa.vam, 0)} metros verticales por hora.` : ''}`
          : `Todavía no hay ningún ascenso analizado por encima del ${num(o.rampaPend, 0)} %.`,
      },
    ],
  };
}

export function BarrasObjetivo({ lista, compacto = false }) {
  return (
    <>
      {lista.map((o) => (
        <div className="goal" key={o.id}>
          <div className="top2">
            <span className="name">{o.n}</span>
            <span className="pct" style={{ color: o.color }}>{num(o.pct, 0)} %</span>
          </div>
          <div className="bar"><i style={{ width: `${o.pct}%`, background: o.color }} /></div>
          <p className="note">
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--ink)' }}>
              {o.dato}
            </span>
            {!compacto && <>{' · '}{o.nota}</>}
          </p>
        </div>
      ))}
    </>
  );
}
