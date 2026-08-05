'use client';

import { COLORES_ZONA, NOMBRES_ZONA, num, duracion } from '@/lib/metrics';

/*
  Los ultimos siete dias, siempre acabando en hoy. Se recalcula en cada
  carga a partir de la fecha del dispositivo, asi que no hay nada que
  mantener: manana la rejilla se ha desplazado sola un dia.
*/
export default function Semana({ dias }) {
  return (
    <div className="semana">
      {dias.map((d) => {
        const a = d.actividad;
        const color = a ? COLORES_ZONA[a.zona - 1] : null;

        return (
          <div
            key={d.clave}
            className={`dia${a ? ' activo' : ''}${d.esHoy ? ' hoy' : ''}`}
            style={
              a
                ? { background: `${color}1F`, borderColor: `${color}66` }
                : undefined
            }
            title={
              a
                ? `${a.nombre}\n${num(a.km, 1)} km · +${num(a.desnivel, 0)} m · ${duracion(a.segundos)}\nZ${a.zona} ${NOMBRES_ZONA[a.zona - 1]}${a.estimada ? ' (estimada, sin pulsometro)' : ''}`
                : 'Sin entrenamiento'
            }
          >
            <div>
              <div className="dow">{d.diaSemana}</div>
              <div className="num" style={a ? { color } : { color: 'var(--ink3)' }}>
                {d.diaMes}
              </div>
              <div className="mes">{d.mes}</div>
            </div>

            {a ? (
              <div>
                <div className="km" style={{ color }}>{num(a.km, 1)} km</div>
                <div className="zn" style={{ color }}>
                  Z{a.zona}{a.estimada ? '*' : ''}
                </div>
              </div>
            ) : (
              <div className="vacio">—</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
