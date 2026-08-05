'use client';

import { detectarPuertos, vatios, num, esLlana, kmh } from '@/lib/metrics';

export default function Objetivos({ salidas, cfg, cache, excluidas, masaTotal }) {
  const llanas = salidas.filter(esLlana);
  const mejorLlano = llanas.length ? Math.max(...llanas.map(kmh)) : 0;

  const puertos = Object.entries(cache).flatMap(([id, st]) =>
    excluidas.has(Number(id)) ? [] : detectarPuertos(st, { minMetros: 800, minDesnivel: 60, minPend: 4 })
  );
  const mejor6 = puertos.filter((p) => p.pendiente >= 5.8 && p.pendiente <= 7.5)
    .sort((a, b) => b.metros - a.metros)[0];
  const mejor8 = puertos.filter((p) => p.pendiente > 7.5)
    .sort((a, b) => b.metros - a.metros)[0];

  const wActual = mejorLlano ? vatios(mejorLlano / 3.6, 0, masaTotal, cfg.cda, cfg.crr) : 0;
  const wPara30 = vatios(30 / 3.6, 0, masaTotal, cfg.cda, cfg.crr);
  const wCarretera = vatios(30 / 3.6, 0, masaTotal, 0.3, 0.005);

  const lista = [
    {
      n: '30 km/h de crucero en llano',
      pct: Math.min(100, (mejorLlano / 30) * 100),
      color: 'var(--blue)',
      dato: mejorLlano ? `${num(mejorLlano, 1)} de 30 km/h` : 'sin medir',
      nota: mejorLlano
        ? `Tu mejor registro en terreno realmente llano. Los ${num(30 - mejorLlano, 1)} km/h que faltan significan pasar de ${num(wActual, 0)} a ${num(wPara30, 0)} W sostenidos.`
        : 'Aún no hay salidas en terreno llano puro para medirlo.',
    },
    {
      n: 'Puerto de 5 km al 6–7 %',
      pct: mejor6 ? Math.min(100, (mejor6.metros / 5000) * 100) : 0,
      color: 'var(--red)',
      dato: mejor6 ? `${num(mejor6.metros / 1000, 2)} de 5 km` : 'sin datos aún',
      nota: mejor6
        ? `Tu ascenso más largo en ese rango: ${num(mejor6.metros / 1000, 2)} km al ${num(mejor6.pendiente, 1)} %. Faltan ${num(Math.max(0, 5 - mejor6.metros / 1000), 2)} km de pendiente sostenida, que es cuestión de elegir el puerto adecuado más que de forma.`
        : 'Abre salidas con desnivel en Entrenamientos para que el panel las analice.',
    },
    {
      n: '2–3 km al 8–9 %',
      pct: mejor8 ? Math.min(100, (mejor8.metros / 2000) * 100) : 0,
      color: 'var(--amber)',
      dato: mejor8 ? `${num(mejor8.metros / 1000, 2)} km al ${num(mejor8.pendiente, 1)} %` : 'sin datos aún',
      nota: mejor8
        ? `Tu mejor ascenso por encima del 7,5 %.${mejor8.vam ? ` Lo subiste a ${num(mejor8.vam, 0)} metros verticales por hora.` : ''}`
        : 'Todavía no hay ningún ascenso analizado por encima del 7,5 %.',
    },
  ];

  return (
    <>
      <h2>Tus objetivos</h2>
      <p className="hint">
        Medidos contra tu mejor registro real, no contra una media. Cuantas más salidas abras en
        Entrenamientos, más afinada será la medición de los dos objetivos de subida.
      </p>

      {lista.map((o) => (
        <div className="goal" key={o.n}>
          <div className="top2">
            <span className="name">{o.n}</span>
            <span className="pct" style={{ color: o.color }}>{num(o.pct, 0)} %</span>
          </div>
          <div className="bar"><i style={{ width: `${o.pct}%`, background: o.color }} /></div>
          <p className="note">
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--ink)' }}>{o.dato}</span>
            {' · '}{o.nota}
          </p>
        </div>
      ))}

      <div className="callout warn">
        <strong>El objetivo del llano es mucho más ambicioso que los dos de subida.</strong> Mantener
        30 km/h con tu configuración actual pide unos {num(wPara30, 0)} W sostenidos; con una bici de
        carretera en posición baja, los mismos 30 km/h bajan a {num(wCarretera, 0)} W. Son{' '}
        {num(wPara30 - wCarretera, 0)} W de diferencia sin ganar un solo vatio de forma. En llano la
        aerodinámica pesa más que el motor.
      </div>
    </>
  );
}
