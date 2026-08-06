'use client';

import { useMemo, useState } from 'react';
import { evolucionPorTerreno, num, fechaCorta } from '@/lib/metrics';

/*
  Evolucion de velocidad y pulsaciones dentro de cada tipo de terreno.

  La comparacion solo tiene sentido entre salidas parecidas: 20 km/h en el
  delta y 20 km/h subiendo Montjuic no son el mismo esfuerzo, y mezclarlos
  en una linea unica produce un dibujo que no significa nada. Por eso las
  salidas se agrupan primero por desnivel por kilometro.
*/
export default function Evolucion({ salidas, excluidas }) {
  const grupos = useMemo(() => evolucionPorTerreno(salidas, excluidas), [salidas, excluidas]);
  const [sel, setSel] = useState(null);

  const conDatos = grupos.filter((g) => g.conFC >= 2);
  const activo = sel
    ? grupos.find((g) => g.id === sel)
    : (conDatos[0] || grupos[0]);

  if (!grupos.length) {
    return (
      <>
        <h2>Evolución por tipo de terreno</h2>
        <div className="callout">Sin salidas en el periodo no hay evolución que medir.</div>
      </>
    );
  }

  return (
    <>
      <h2>Evolución por tipo de terreno</h2>
      <p className="hint">
        Cada terreno se mide por separado, porque la misma velocidad significa cosas distintas en
        llano y en montaña. El dato que importa es la eficiencia: metros recorridos por cada
        latido. Si sube, avanzas más con el mismo esfuerzo del corazón.
      </p>

      <div className="chips" style={{ marginBottom: 14 }}>
        {grupos.map((g) => (
          <button key={g.id} aria-pressed={activo?.id === g.id} onClick={() => setSel(g.id)}
            style={activo?.id === g.id
              ? { background: g.color, borderColor: g.color, color: '#0E1116' } : null}>
            <i style={{ background: g.color }} />
            {g.nombre} · {g.puntos.length}
          </button>
        ))}
      </div>

      {activo && <Grupo g={activo} />}

      {conDatos.length === 0 && (
        <div className="callout">
          <strong>Todavía no hay dos salidas con pulsómetro en un mismo terreno.</strong> La
          comparación de eficiencia necesita al menos dos para trazar una tendencia. Según vayas
          grabando con el Garmin, esta pestaña se vuelve mucho más útil.
        </div>
      )}
    </>
  );
}

function Grupo({ g }) {
  const pts = g.puntos;
  const conFC = pts.filter((p) => p.fc);

  const W = 760, H = 260;
  const mIzq = 46, mDer = 46, mSup = 22, mInf = 38;
  const ancho = W - mIzq - mDer, alto = H - mSup - mInf;

  const vMin = Math.min(...pts.map((p) => p.velocidad)) * 0.92;
  const vMax = Math.max(...pts.map((p) => p.velocidad)) * 1.08;
  const fMin = conFC.length ? Math.min(...conFC.map((p) => p.fc)) - 8 : 0;
  const fMax = conFC.length ? Math.max(...conFC.map((p) => p.fc)) + 8 : 1;

  const x = (i, n) => mIzq + (n <= 1 ? ancho / 2 : (i / (n - 1)) * ancho);
  const yV = (v) => mSup + alto - ((v - vMin) / (vMax - vMin)) * alto;
  const yF = (f) => mSup + alto - ((f - fMin) / (fMax - fMin)) * alto;

  const linea = (arr, fy, fv) => arr.map((p, i) =>
    `${i ? 'L' : 'M'} ${x(i, arr.length)} ${fy(fv(p))}`).join(' ');

  const t = g.tendencia;

  return (
    <>
      <div className="panel">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
          {[0, 0.5, 1].map((f, i) => (
            <line key={i} x1={mIzq} x2={W - mDer}
              y1={mSup + alto * f} y2={mSup + alto * f}
              stroke="var(--line)" strokeWidth="1" opacity=".5" />
          ))}

          {/* velocidad */}
          <path d={linea(pts, yV, (p) => p.velocidad)} fill="none"
            stroke={g.color} strokeWidth="2" strokeLinejoin="round" />
          {pts.map((p, i) => (
            <circle key={i} cx={x(i, pts.length)} cy={yV(p.velocidad)} r="3.5"
              fill={g.color} />
          ))}

          {/* pulsaciones */}
          {conFC.length > 1 && (
            <>
              <path d={linea(conFC, yF, (p) => p.fc)} fill="none"
                stroke="#D14B42" strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" />
              {conFC.map((p, i) => (
                <circle key={i} cx={x(pts.indexOf(p), pts.length)} cy={yF(p.fc)} r="3.5"
                  fill="#D14B42" />
              ))}
            </>
          )}

          <text x={mIzq - 8} y={mSup + 4} textAnchor="end" fontFamily="var(--mono)"
            fontSize="10.5" fill={g.color}>{num(vMax, 0)}</text>
          <text x={mIzq - 8} y={mSup + alto} textAnchor="end" fontFamily="var(--mono)"
            fontSize="10.5" fill={g.color}>{num(vMin, 0)}</text>
          <text x={mIzq - 8} y={mSup - 8} textAnchor="end" fontFamily="var(--mono)"
            fontSize="10" fill="var(--ink3)">km/h</text>

          {conFC.length > 1 && (
            <>
              <text x={W - mDer + 8} y={mSup + 4} fontFamily="var(--mono)"
                fontSize="10.5" fill="#D14B42">{num(fMax, 0)}</text>
              <text x={W - mDer + 8} y={mSup + alto} fontFamily="var(--mono)"
                fontSize="10.5" fill="#D14B42">{num(fMin, 0)}</text>
              <text x={W - mDer + 8} y={mSup - 8} fontFamily="var(--mono)"
                fontSize="10" fill="var(--ink3)">ppm</text>
            </>
          )}

          {pts.map((p, i) =>
            (pts.length <= 8 || i % Math.ceil(pts.length / 8) === 0) ? (
              <text key={i} x={x(i, pts.length)} y={H - 14} textAnchor="middle"
                fontFamily="var(--mono)" fontSize="10" fill="var(--ink3)">
                {fechaCorta(p.fecha).slice(0, 6)}
              </text>
            ) : null
          )}
        </svg>

        <div className="chips" style={{ marginTop: 10 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink2)',
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 9px',
            border: '1px solid var(--line2)', borderRadius: 6 }}>
            <i style={{ background: g.color, width: 9, height: 9, borderRadius: 2,
              display: 'inline-block' }} />Velocidad
          </span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink2)',
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 9px',
            border: '1px solid var(--line2)', borderRadius: 6 }}>
            <i style={{ background: '#D14B42', width: 9, height: 9, borderRadius: 2,
              display: 'inline-block' }} />Pulsaciones
          </span>
        </div>
      </div>

      {t ? (
        <div className={`consejo ${t.pctEfic > 3 ? 'ok' : t.pctEfic < -3 ? 'aviso' : 'neutro'}`}>
          <p className="tit">
            {t.pctEfic > 3
              ? `Estás ganando eficiencia en ${g.nombre.toLowerCase()}`
              : t.pctEfic < -3
                ? `Has perdido eficiencia en ${g.nombre.toLowerCase()}`
                : `Sin cambios claros en ${g.nombre.toLowerCase()}`}
          </p>
          <p>
            Entre {fechaCorta(t.desde)} y {fechaCorta(t.hasta)}, tu velocidad{' '}
            {t.dVel >= 0 ? 'subió' : 'bajó'} {num(Math.abs(t.dVel), 1)} km/h mientras las
            pulsaciones {t.dFC >= 0 ? 'subieron' : 'bajaron'} {num(Math.abs(t.dFC), 0)} ppm.
            Eso deja la eficiencia un {num(Math.abs(t.pctEfic), 1)} %{' '}
            {t.pctEfic >= 0 ? 'por encima' : 'por debajo'}.
            {t.dVel > 0 && t.dFC < 0
              ? ' Más rápido y con menos pulso a la vez: es la señal más limpia de que el trabajo aeróbico está funcionando.'
              : t.pctEfic > 3
                ? ' El corazón te rinde más por latido que al empezar.'
                : t.pctEfic < -3
                  ? ' Puede ser fatiga acumulada, calor, o simplemente que esas salidas no fueran comparables. Un solo dato no basta para preocuparse.'
                  : ' Con tan pocas salidas comparables aún es pronto para leer una tendencia.'}
          </p>
        </div>
      ) : (
        <div className="callout">
          En {g.nombre.toLowerCase()} solo hay {g.conFC} salida
          {g.conFC === 1 ? '' : 's'} con pulsómetro. Hacen falta al menos dos para comparar.
        </div>
      )}

      <div className="scroll" style={{ marginTop: 14 }}>
        <table>
          <thead>
            <tr>
              <th>Salida</th><th>Fecha</th><th>Dist.</th><th>m/km</th>
              <th>Vel.</th><th>FC</th><th>m por latido</th>
            </tr>
          </thead>
          <tbody>
            {[...pts].reverse().map((p) => (
              <tr key={p.id}>
                <td>{p.nombre}</td>
                <td>{fechaCorta(p.fecha)}</td>
                <td>{num(p.km, 1)}</td>
                <td>{num(p.mkm, 1)}</td>
                <td>{num(p.velocidad, 1)}</td>
                <td>{p.fc ? num(p.fc, 0) : '—'}</td>
                <td>{p.eficiencia ? num(p.eficiencia, 2) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
