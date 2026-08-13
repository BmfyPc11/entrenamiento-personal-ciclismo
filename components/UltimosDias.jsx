'use client';

import { COLORES_TIPO, NOMBRES_TIPO, num, duracion } from '@/lib/metrics';

/*
  Los ultimos N dias hasta hoy, en cajas minimas: solo cabe el numero del
  dia, coloreado segun el terreno de la salida (o el mas exigente, si
  hubo mas de una ese dia). El detalle completo -nombre, distancia,
  desnivel- vive en el tooltip: a este tamano no cabe escrito, y para
  treinta dias tampoco hace falta verlo todo el rato.
*/
export default function UltimosDias({ dias }) {
  if (!dias || !dias.length) return null;

  return (
    <>
      <div className="dias30">
        {dias.map((d) => {
          const a = d.actividad;
          const color = a ? COLORES_TIPO[a.tipo] : null;
          const fecha = `${d.diaSemana} ${d.diaMes} ${d.mes}`;

          return (
            <div
              key={d.clave}
              className={`dia30${a ? ' activo' : ''}${d.esHoy ? ' hoy' : ''}`}
              style={a ? { background: `${color}2E`, borderColor: `${color}80`, color } : undefined}
              title={
                a
                  ? `${fecha}\n${a.nombre}\n${num(a.km, 1)} km · +${num(a.desnivel, 0)} m · ${duracion(a.segundos)}\n${NOMBRES_TIPO[a.tipo]}`
                  : `${fecha}\nSin entrenamiento`
              }
            >
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
