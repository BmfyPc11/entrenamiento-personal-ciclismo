'use client';

import { useMemo, useState } from 'react';
import { seccionesPuerto, lecturaPuerto, TRAMOS_DUREZA, num, duracion } from '@/lib/metrics';

/*
  Perfil detallado de un solo puerto, dibujado como los perfiles de las
  guias de carrera: barras de longitud fija con su pendiente escrita.

  Se elige esta forma y no la linea suave del perfil general porque a
  escala de un puerto lo que importa no es la silueta sino cuanto pica
  cada tramo, y eso una linea no lo dice: hay que leerlo del color y del
  numero.
*/
export default function PerfilPuerto({ streams, puerto, indice, cfg }) {
  const [foco, setFoco] = useState(null);

  const det = useMemo(() => seccionesPuerto(streams, puerto), [streams, puerto]);
  const notas = useMemo(() => lecturaPuerto(det, puerto), [det, puerto]);

  if (!det || !det.secciones.length) return null;
  const sec = det.secciones;

  /* --- geometria --- */
  const W = 760, H = 230;
  const mIzq = 46, mDer = 14, mSup = 30, mInf = 34;
  const ancho = W - mIzq - mDer;
  const alto = H - mSup - mInf;

  const km0 = sec[0].kmIni;
  const kmT = sec[sec.length - 1].kmFin - km0;

  const altMin = Math.min(...sec.map((s) => s.altIni));
  const altMax = Math.max(...sec.map((s) => s.altFin));
  /* Un margen del 12 % evita que la cima toque el borde superior. */
  const rango = Math.max(altMax - altMin, 20) * 1.12;
  const base = altMin;

  const x = (km) => mIzq + ((km - km0) / kmT) * ancho;
  const y = (alt) => mSup + alto - ((alt - base) / rango) * alto;

  /* Etiquetas de altitud: tres referencias limpias. */
  const refs = [base, base + rango / 2, base + rango].map((v) => Math.round(v / 10) * 10);

  return (
    <div className="panel" style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
        <h3 style={{ margin: 0 }}>Subida {indice + 1} en detalle</h3>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--ink2)' }}>
          {num(puerto.metros / 1000, 2)} km · +{num(puerto.desnivel, 0)} m ·{' '}
          {num(puerto.pendiente, 1)} % · secciones de {det.paso} m
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}
        onMouseLeave={() => setFoco(null)}>

        {refs.map((v, i) => (
          <g key={i}>
            <line x1={mIzq} x2={W - mDer} y1={y(v)} y2={y(v)}
              stroke="var(--line)" strokeWidth="1" opacity=".5" />
            <text x={mIzq - 8} y={y(v) + 4} textAnchor="end"
              fontFamily="var(--mono)" fontSize="10.5" fill="var(--ink3)">{v}</text>
          </g>
        ))}

        {sec.map((s, i) => {
          const c = TRAMOS_DUREZA[s.tramo - 1];
          const x1 = x(s.kmIni), x2 = x(s.kmFin);
          const activo = foco === i;
          /*
            Cada seccion es un trapecio: sube de la altura de entrada a la
            de salida. Asi el conjunto reconstruye el perfil real en vez de
            ser un histograma de pendientes desconectado del terreno.
          */
          const d = `M ${x1} ${y(base)} L ${x1} ${y(s.altIni)} L ${x2} ${y(s.altFin)} L ${x2} ${y(base)} Z`;
          const anchoPx = x2 - x1;
          return (
            <g key={i} onMouseEnter={() => setFoco(i)} style={{ cursor: 'default' }}>
              <path d={d} fill={c.color} stroke={c.color} strokeWidth="0.5"
                opacity={foco === null ? 0.9 : activo ? 1 : 0.35} />
              <rect x={x1} y={mSup} width={anchoPx} height={alto} fill="transparent" />
              {anchoPx > 26 && (
                <text x={(x1 + x2) / 2} y={y(Math.max(s.altIni, s.altFin)) - 6}
                  textAnchor="middle" fontFamily="var(--mono)" fontSize="10"
                  fontWeight="600"
                  fill={activo ? 'var(--ink)' : 'var(--ink2)'}>
                  {num(s.pendiente, 1)}
                </text>
              )}
            </g>
          );
        })}

        <line x1={mIzq} x2={W - mDer} y1={y(base)} y2={y(base)}
          stroke="var(--line2)" strokeWidth="1" />

        {[0, 0.25, 0.5, 0.75, 1].map((f, i) => {
          const km = km0 + kmT * f;
          return (
            <text key={i} x={x(km)} y={H - 12}
              textAnchor={i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}
              fontFamily="var(--mono)" fontSize="10.5" fill="var(--ink3)">
              {num(km, 1)} km
            </text>
          );
        })}
      </svg>

      {foco !== null && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--ink2)',
          borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 4 }}>
          Km {num(sec[foco].kmIni, 2)}–{num(sec[foco].kmFin, 2)} ·{' '}
          <b style={{ color: TRAMOS_DUREZA[sec[foco].tramo - 1].color }}>
            {num(sec[foco].pendiente, 1)} %
          </b>{' '}
          · +{num(sec[foco].altFin - sec[foco].altIni, 0)} m
          {sec[foco].segundos ? ` · ${duracion(sec[foco].segundos)}` : ''}
          {sec[foco].vam ? ` · ${num(sec[foco].vam, 0)} m/h` : ''}
          {sec[foco].fcMedia ? ` · ${sec[foco].fcMedia} ppm` : ''}
        </div>
      )}

      <div className="chips" style={{ marginTop: 12 }}>
        {TRAMOS_DUREZA.map((t, i) =>
          sec.some((s) => s.tramo === t.n) ? (
            <span key={t.n} style={{ fontFamily: 'var(--mono)', fontSize: 11.5,
              color: 'var(--ink2)', display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 9px', border: '1px solid var(--line2)', borderRadius: 6 }}>
              <i style={{ background: t.color, width: 9, height: 9, borderRadius: 2,
                display: 'inline-block' }} />
              {t.nombre}
            </span>
          ) : null
        )}
      </div>

      <div className="grid" style={{ marginTop: 16 }}>
        {notas.map((n, i) => (
          <div className="dato" key={i}>
            <span className="k">{n.k}</span>
            <span className="v">{n.v}</span>
            <span className="d">{n.d}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
