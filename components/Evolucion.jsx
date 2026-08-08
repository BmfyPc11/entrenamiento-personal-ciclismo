'use client';

import { useMemo, useState } from 'react';
import { evolucionPorZonaTerreno, num, fechaCorta } from '@/lib/metrics';

/*
  Evolucion de velocidad por zona de pulso dentro de cada terreno.

  La comparacion solo significa algo entre esfuerzos equivalentes. Hasta la
  v3.2 el agrupamiento era por salida entera, y eso mezclaba dentro de una
  misma linea el llaneo del delta con la subida a Montjuic. Ahora cada
  salida se trocea en tramos y cada tramo cuenta en su propio terreno y en
  su propia zona: lo que se compara es homogeneo.
*/
export default function Evolucion({ salidas, cache, zonas, excluidas, fondo }) {
  const terrenos = useMemo(
    () => evolucionPorZonaTerreno(salidas, cache, zonas, excluidas),
    [salidas, cache, zonas, excluidas]
  );

  const [sel, setSel] = useState(null);
  const activo = (sel && terrenos.find((t) => t.id === sel))
    || terrenos.find((t) => t.total > 0)
    || terrenos[0];

  const hayDatos = terrenos.some((t) => t.total > 0);

  return (
    <>
      <h2>Evolución por zona y terreno</h2>
      <p className="hint">
        Cada salida se trocea en tramos de 100 m. Cada tramo cuenta en el terreno que le
        corresponde por su propia pendiente y en la zona de pulso en la que ibas en ese
        momento. Así lo que compara la gráfica son esfuerzos equivalentes: lo que rindes
        hoy en una zona y un terreno frente a lo que rendías antes en esa misma
        combinación. Los descensos quedan fuera: bajar a 45 km/h sin pedalear no dice
        nada de cómo llaneas, y contarlo como llano solo inflaba la media.
      </p>

      {!hayDatos ? (
        <div className="callout">
          {fondo?.activo
            ? <>Analizando salidas… <strong>{fondo.hechas} de {fondo.total}</strong>. La
              gráfica aparece en cuanto haya detalle suficiente.</>
            : <>Todavía no hay ninguna salida con pulsómetro analizada. Esta vista necesita
              el detalle completo (altitud y pulso segundo a segundo), no solo los totales
              de cada salida.</>}
        </div>
      ) : (
        <>
          <div className="chips" style={{ marginBottom: 14 }}>
            {terrenos.map((t) => (
              <button key={t.id} aria-pressed={activo?.id === t.id} onClick={() => setSel(t.id)}
                style={activo?.id === t.id
                  ? { background: t.color, borderColor: t.color, color: '#0E1116' } : null}>
                <i style={{ background: t.color }} />
                {t.nombre} · {t.total}
              </button>
            ))}
          </div>

          {activo && <Terreno t={activo} />}

          {fondo?.activo && (
            <div className="callout">
              Todavía se están trayendo salidas de Strava ({fondo.hechas} de {fondo.total}).
              La gráfica se completará sola.
            </div>
          )}
        </>
      )}
    </>
  );
}

function Terreno({ t }) {
  /* Solo se traza linea con dos puntos o mas: con uno no hay tendencia que dibujar. */
  const conLinea = t.zonas.filter((z) => z.puntos.length >= 2);
  const escasas = t.zonas.filter((z) => z.puntos.length < 2);
  const todos = t.zonas.flatMap((z) => z.puntos.map((p) => ({ ...p, zona: z })));

  if (!todos.length) {
    return (
      <div className="callout">
        En {t.nombre.toLowerCase()} todavía no hay ningún tramo acumulado. Si no sueles
        pasar por este terreno, es lo esperable.
      </div>
    );
  }

  const W = 760, H = 260;
  const mIzq = 46, mDer = 22, mSup = 22, mInf = 38;
  const ancho = W - mIzq - mDer, alto = H - mSup - mInf;

  /*
    El eje X va por fecha real, no por indice. Cada zona tiene un numero
    distinto de puntos, y con indices las series quedarian desalineadas
    entre si: el tercer punto de Z2 y el tercero de Z4 se pintarian en la
    misma vertical aunque fueran de meses distintos.
  */
  const fechas = todos.map((p) => new Date(p.fecha).getTime());
  const tMin = Math.min(...fechas), tMax = Math.max(...fechas);
  const vels = todos.map((p) => p.velocidad);
  const vMin = Math.min(...vels) * 0.92, vMax = Math.max(...vels) * 1.08;

  const x = (f) => (tMax === tMin
    ? mIzq + ancho / 2
    : mIzq + ((new Date(f).getTime() - tMin) / (tMax - tMin)) * ancho);
  const y = (v) => (vMax === vMin
    ? mSup + alto / 2
    : mSup + alto - ((v - vMin) / (vMax - vMin)) * alto);

  /* Etiquetas del eje X: extremos y centro, que es lo que cabe sin amasijo. */
  const marcas = tMax === tMin
    ? [tMin]
    : [tMin, (tMin + tMax) / 2, tMax];

  return (
    <>
      <div className="panel">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
          {[0, 0.5, 1].map((f, i) => (
            <line key={i} x1={mIzq} x2={W - mDer}
              y1={mSup + alto * f} y2={mSup + alto * f}
              stroke="var(--line)" strokeWidth="1" opacity=".5" />
          ))}

          {conLinea.map((z) => (
            <path key={z.n} fill="none" stroke={z.color} strokeWidth="2" strokeLinejoin="round"
              d={z.puntos.map((p, i) =>
                `${i ? 'L' : 'M'} ${x(p.fecha)} ${y(p.velocidad)}`).join(' ')} />
          ))}

          {t.zonas.map((z) => z.puntos.map((p, i) => (
            <circle key={`${z.n}-${i}`} cx={x(p.fecha)} cy={y(p.velocidad)} r="3.5"
              fill={z.color} />
          )))}

          <text x={mIzq - 8} y={mSup + 4} textAnchor="end" fontFamily="var(--mono)"
            fontSize="10.5" fill="var(--ink2)">{num(vMax, 0)}</text>
          <text x={mIzq - 8} y={mSup + alto} textAnchor="end" fontFamily="var(--mono)"
            fontSize="10.5" fill="var(--ink2)">{num(vMin, 0)}</text>
          <text x={mIzq - 8} y={mSup - 8} textAnchor="end" fontFamily="var(--mono)"
            fontSize="10" fill="var(--ink3)">km/h</text>

          {marcas.map((m, i) => (
            <text key={i} x={x(m)} y={H - 14}
              textAnchor={i === 0 ? 'start' : i === marcas.length - 1 ? 'end' : 'middle'}
              fontFamily="var(--mono)" fontSize="10" fill="var(--ink3)">
              {fechaCorta(m).slice(0, 6)}
            </text>
          ))}
        </svg>

        {/*
          Las zonas sin datos siguen en la leyenda, atenuadas. Si
          desaparecieran sin mas, faltaria la mitad de la historia: que esa
          combinacion existe y todavia no tienes material en ella.
        */}
        <div className="chips" style={{ marginTop: 10 }}>
          {t.zonas.map((z) => {
            const flojo = z.puntos.length < 2;
            return (
              <span key={z.n} style={{
                fontFamily: 'var(--mono)', fontSize: 11.5,
                color: flojo ? 'var(--ink3)' : 'var(--ink2)',
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 9px',
                border: '1px solid var(--line2)', borderRadius: 6,
                opacity: flojo ? 0.55 : 1,
              }}>
                <i style={{ background: z.color, width: 9, height: 9, borderRadius: 2,
                  display: 'inline-block', opacity: flojo ? 0.5 : 1 }} />
                Z{z.n} {z.nombre} · {z.puntos.length}
              </span>
            );
          })}
        </div>
      </div>

      {escasas.length > 0 && (
        <div className="callout">
          En {t.nombre.toLowerCase()} todavía no hay tendencia que trazar en{' '}
          <strong>
            {escasas.map((z) => `Z${z.n}`).join(', ').replace(/, ([^,]*)$/, ' ni $1')}
          </strong>
          : hacen falta al menos dos salidas con tramos en esa combinación y ahora hay{' '}
          {escasas.every((z) => z.puntos.length === 0) ? 'cero' : 'una o ninguna'}. Es lo
          normal al principio — hay quince combinaciones de zona y terreno, y una sola
          salida solo alimenta unas pocas.
        </div>
      )}

      <div className="scroll" style={{ marginTop: 14 }}>
        <table>
          <thead>
            <tr>
              <th>Salida</th><th>Fecha</th><th>Zona</th><th>Km</th><th>Vel.</th><th>FC</th>
            </tr>
          </thead>
          <tbody>
            {[...todos]
              .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : a.zona.n - b.zona.n))
              .map((p) => (
                <tr key={`${p.id}-${p.zona.n}`}>
                  <td>{p.nombre}</td>
                  <td>{fechaCorta(p.fecha)}</td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <i style={{ background: p.zona.color, width: 9, height: 9,
                        borderRadius: 2, display: 'inline-block' }} />
                      Z{p.zona.n}
                    </span>
                  </td>
                  <td>{num(p.km, 1)}</td>
                  <td>{num(p.velocidad, 1)}</td>
                  <td>{num(p.fc, 0)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
