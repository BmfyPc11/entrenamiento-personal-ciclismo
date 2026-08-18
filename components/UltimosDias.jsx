'use client';

import { COLORES_TIPO, NOMBRES_TIPO, num, duracion } from '@/lib/metrics';

/*
  Los ultimos N dias hasta hoy, en cajas minimas: solo cabe el numero del
  dia, coloreado segun el terreno de la salida (o el mas exigente, si
  hubo mas de una ese dia). El detalle completo -nombre, distancia,
  desnivel- vive en el tooltip: a este tamano no cabe escrito, y para
  treinta dias tampoco hace falta verlo todo el rato.

  Si se recibe onSalida, los dias con actividad pasan a ser botones que
  llevan al analisis de esa salida; los dias vacios siguen siendo cajas
  muertas, que no hay nada que abrir.
*/
export default function UltimosDias({ dias, onSalida }) {
  if (!dias || !dias.length) return null;

  return (
    <>
      <div className="dias30">
        {dias.map((d) => {
          const a = d.actividad;
          const color = a ? COLORES_TIPO[a.tipo] : null;
          const fecha = `${d.diaSemana} ${d.diaMes} ${d.mes}`;
          /* Con varias salidas el mismo dia se abre la primera: es la
             que da nombre al dia en el tooltip. */
          const destino = a?.salidas?.[0]?.id ?? null;
          const enlaza = Boolean(onSalida && destino != null);

          const clase = `dia30${a ? ' activo' : ''}${d.esHoy ? ' hoy' : ''}`;
          const estilo = a
            ? { background: `${color}2E`, borderColor: `${color}80`, color }
            : undefined;
          const titulo = a
            ? `${fecha}\n${a.nombre}\n${num(a.km, 1)} km · +${num(a.desnivel, 0)} m · ${duracion(a.segundos)}\n${NOMBRES_TIPO[a.tipo]}${enlaza ? '\n\nVer el análisis' : ''}`
            : `${fecha}\nSin entrenamiento`;

          if (enlaza) {
            return (
              <button key={d.clave} type="button" className={clase} style={estilo}
                title={titulo} onClick={() => onSalida(destino)}>
                {d.diaMes}
              </button>
            );
          }

          return (
            <div key={d.clave} className={clase} style={estilo} title={titulo}>
              {d.diaMes}
            </div>
          );
        })}
      </div>
      <div className="legend">
        <span><i style={{ background: COLORES_TIPO.llano }} />Llano</span>
        <span><i style={{ background: COLORES_TIPO.mixto }} />Colina</span>
        <span><i style={{ background: COLORES_TIPO.puerto }} />Montaña</span>
      </div>
    </>
  );
}
