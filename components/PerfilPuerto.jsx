'use client';

import { useMemo, useState } from 'react';
import {
  seccionesPuerto, TRAMOS_DUREZA, zonaDeFC, num, duracion,
} from '@/lib/metrics';

/*
  Perfil detallado de un solo puerto, dibujado como los perfiles de las
  guias de carrera: barras de longitud fija con su pendiente escrita.

  A escala de un puerto lo que importa no es la silueta sino cuanto pica
  cada tramo, y eso una linea suave no lo dice: hay que leerlo del color
  y del numero.
*/
export default function PerfilPuerto({ streams, puerto, indice, cfg, zonas, nombre }) {
  const [foco, setFoco] = useState(null);
  const [modo, setModo] = useState('dureza');

  const det = useMemo(() => seccionesPuerto(streams, puerto), [streams, puerto]);
  if (!det || !det.secciones.length) return null;
  const sec = det.secciones;

  const hayFC = Boolean(streams.fc) && sec.some((s) => s.fcMedia);

  /* --- geometria --- */
  const W = 760, H = 240;
  const mIzq = 46, mDer = 14, mSup = 34, mInf = 34;
  const ancho = W - mIzq - mDer;
  const alto = H - mSup - mInf;

  /*
    El eje horizontal arranca en el pie del puerto, no en el kilometro de
    la salida donde empieza a subir: al mirar una ascension interesa
    cuanto llevas de ella, no cuanto llevabas de ruta.
  */
  const km0 = sec[0].kmIni;
  const kmT = sec[sec.length - 1].kmFin - km0;

  const altMin = Math.min(...sec.map((s) => s.altIni));
  const altMax = Math.max(...sec.map((s) => s.altFin));
  const rango = Math.max(altMax - altMin, 20) * 1.12;
  const base = altMin;

  const x = (km) => mIzq + ((km - km0) / kmT) * ancho;
  const y = (alt) => mSup + alto - ((alt - base) / rango) * alto;

  const refs = [base, base + rango / 2, base + rango].map((v) => Math.round(v / 10) * 10);

  const colorDe = (s) => {
    if (modo === 'zonas') {
      if (!s.fcMedia || !zonas) return '#4A5563';
      return zonaDeFC(s.fcMedia, zonas).color;
    }
    return TRAMOS_DUREZA[s.tramo - 1].color;
  };

  const etiquetaDe = (s) => {
    if (modo === 'zonas') return s.fcMedia ? String(s.fcMedia) : '';
    return num(s.pendiente, 1);
  };

  /* Leyenda: solo las categorias que aparecen de verdad en este puerto. */
  const leyenda = modo === 'zonas'
    ? (zonas || [])
        .filter((z) => sec.some((s) => s.fcMedia && zonaDeFC(s.fcMedia, zonas).n === z.n))
        .map((z) => ({ color: z.color, nombre: `Z${z.n} · ${z.nombre}` }))
    : TRAMOS_DUREZA.filter((t) => sec.some((s) => s.tramo === t.n))
        .map((t) => ({ color: t.color, nombre: t.nombre }));

  return (
    <div className="panel" style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between',
        alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
        <h3 style={{ margin: 0 }}>{nombre || `Subida ${indice + 1}`}</h3>
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
          const c = colorDe(s);
          const x1 = x(s.kmIni), x2 = x(s.kmFin);
          const activo = foco === i;
          /*
            Cada seccion es un trapecio que sube de la altura de entrada a
            la de salida, de modo que el conjunto reconstruye el perfil real
            en vez de ser un histograma desconectado del terreno.
          */
          const d = `M ${x1} ${y(base)} L ${x1} ${y(s.altIni)} L ${x2} ${y(s.altFin)} L ${x2} ${y(base)} Z`;
          const anchoPx = x2 - x1;
          const et = etiquetaDe(s);
          return (
            <g key={i} onMouseEnter={() => setFoco(i)} style={{ cursor: 'default' }}>
              <path d={d} fill={c} stroke={c} strokeWidth="0.5"
                opacity={foco === null ? 0.92 : activo ? 1 : 0.35} />
              <rect x={x1} y={mSup} width={anchoPx} height={alto} fill="transparent" />
              {anchoPx > 26 && et !== '' && (
                <text x={(x1 + x2) / 2} y={y(Math.max(s.altIni, s.altFin)) - 6}
                  textAnchor="middle" fontFamily="var(--mono)" fontSize="10"
                  fontWeight="600" fill={activo ? 'var(--ink)' : 'var(--ink2)'}>
                  {et}
                </text>
              )}
            </g>
          );
        })}

        <line x1={mIzq} x2={W - mDer} y1={y(base)} y2={y(base)}
          stroke="var(--line2)" strokeWidth="1" />

        {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
          <text key={i} x={mIzq + ancho * f} y={H - 12}
            textAnchor={i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}
            fontFamily="var(--mono)" fontSize="10.5" fill="var(--ink3)">
            {num(kmT * f, 1)} km
          </text>
        ))}
      </svg>

      <div className="chips" style={{ marginTop: 12 }}>
        <button aria-pressed={modo === 'dureza'} onClick={() => setModo('dureza')}
          style={modo === 'dureza' ? { background: 'var(--ink)', borderColor: 'var(--ink)' } : null}>
          Perfil y dureza
        </button>
        <button aria-pressed={modo === 'zonas'} disabled={!hayFC}
          onClick={() => setModo('zonas')}
          title={hayFC ? '' : 'Esta subida no tiene frecuencia cardíaca'}
          style={modo === 'zonas' ? { background: 'var(--ink)', borderColor: 'var(--ink)' } : null}>
          Zonas de frecuencia cardíaca
        </button>
      </div>

      {foco !== null && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--ink2)',
          borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 12 }}>
          Km {num(sec[foco].kmIni - km0, 2)}–{num(sec[foco].kmFin - km0, 2)} de la subida ·{' '}
          <b style={{ color: colorDe(sec[foco]) }}>{num(sec[foco].pendiente, 1)} %</b>
          {' '}· +{num(sec[foco].altFin - sec[foco].altIni, 0)} m
          {sec[foco].segundos ? ` · ${duracion(sec[foco].segundos)}` : ''}
          {sec[foco].vam ? ` · ${num(sec[foco].vam, 0)} m/h` : ''}
          {sec[foco].fcMedia ? ` · ${sec[foco].fcMedia} ppm` : ''}
        </div>
      )}

      <div className="chips" style={{ marginTop: 12 }}>
        {leyenda.map((l, i) => (
          <span key={i} style={{ fontFamily: 'var(--mono)', fontSize: 11.5,
            color: 'var(--ink2)', display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 9px', border: '1px solid var(--line2)', borderRadius: 6 }}>
            <i style={{ background: l.color, width: 9, height: 9, borderRadius: 2,
              display: 'inline-block' }} />
            {l.nombre}
          </span>
        ))}
      </div>
    </div>
  );
}
