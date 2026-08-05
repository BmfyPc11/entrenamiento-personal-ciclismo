'use client';

import { useMemo, useState } from 'react';
import { ZONAS, zonaDeFC, num } from '@/lib/metrics';

/*
  Perfil de altimetria.
  - modo "relieve": relleno sepia clasico
  - modo "zonas":   cada tramo se pinta con el color de la zona de FC en la que ibas
  - zonaFoco:       si hay una zona seleccionada, el resto se atenua
  - puertos:        se subrayan sobre la linea
*/
export default function Perfil({
  streams,
  puertos = [],
  fcmax = 185,
  modo = 'relieve',
  zonaFoco = null,
  altura = 260,
  puertoFoco = null,
}) {
  const [hover, setHover] = useState(null);

  const datos = useMemo(() => {
    const { distancia: d, altitud: a, fc } = streams || {};
    if (!d || !a || d.length < 2) return null;

    // Reducimos a un maximo de 900 puntos para que el SVG sea ligero
    const paso = Math.max(1, Math.ceil(d.length / 900));
    const idx = [];
    for (let i = 0; i < d.length; i += paso) idx.push(i);
    if (idx[idx.length - 1] !== d.length - 1) idx.push(d.length - 1);

    return {
      d: idx.map((i) => d[i] / 1000),
      a: idx.map((i) => a[i]),
      fc: fc ? idx.map((i) => fc[i]) : null,
      idx,
    };
  }, [streams]);

  if (!datos) return <p className="hint">Esta salida no tiene perfil de altimetría registrado.</p>;

  const W = 1000, H = altura, L = 44, R = 14, T = 18, B = 30;
  const maxA = Math.max(...datos.a);
  const minA = Math.min(...datos.a);
  const rango = Math.max(maxA - minA, 30);
  const base = Math.max(0, minA - rango * 0.12);
  const techo = maxA + rango * 0.14;
  const maxD = datos.d[datos.d.length - 1];

  const X = (k) => L + (k / maxD) * (W - L - R);
  const Y = (v) => H - B - ((v - base) / (techo - base)) * (H - T - B);

  /* --- lineas de altura de referencia --- */
  const escalon = rango > 600 ? 200 : rango > 300 ? 100 : rango > 120 ? 50 : 25;
  const guias = [];
  for (let v = Math.ceil(base / escalon) * escalon; v < techo; v += escalon) guias.push(v);

  /* --- construccion de los tramos --- */
  const tramos = [];
  if (modo === 'zonas' && datos.fc) {
    let ini = 0;
    let zAct = datos.fc[0] ? zonaDeFC(datos.fc[0], fcmax).n : null;
    for (let i = 1; i < datos.d.length; i++) {
      const z = datos.fc[i] ? zonaDeFC(datos.fc[i], fcmax).n : null;
      if (z !== zAct || i === datos.d.length - 1) {
        tramos.push({ ini, fin: i, zona: zAct });
        ini = i - 1 < 0 ? 0 : i - 1;
        zAct = z;
      }
    }
  }

  const areaPath = (desde, hasta) => {
    let p = `M ${X(datos.d[desde])} ${H - B}`;
    for (let i = desde; i <= hasta; i++) p += ` L ${X(datos.d[i])} ${Y(datos.a[i])}`;
    p += ` L ${X(datos.d[hasta])} ${H - B} Z`;
    return p;
  };
  const lineaPath = (desde, hasta) => {
    let p = '';
    for (let i = desde; i <= hasta; i++) p += (i === desde ? 'M ' : ' L ') + X(datos.d[i]) + ' ' + Y(datos.a[i]);
    return p;
  };

  /* --- posicion de los puertos en el array reducido --- */
  const mapear = (iOriginal) => {
    let mejor = 0;
    for (let k = 0; k < datos.idx.length; k++) {
      if (datos.idx[k] <= iOriginal) mejor = k;
      else break;
    }
    return mejor;
  };

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const kmPos = ((x - L) / (W - L - R)) * maxD;
    if (kmPos < 0 || kmPos > maxD) return setHover(null);
    let mejor = 0, dif = Infinity;
    datos.d.forEach((v, i) => { const dd = Math.abs(v - kmPos); if (dd < dif) { dif = dd; mejor = i; } });
    setHover(mejor);
  };

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        style={{ cursor: 'crosshair', touchAction: 'pan-y' }}
      >
        <defs>
          <linearGradient id="relieve" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#C9BCA2" stopOpacity=".85" />
            <stop offset="100%" stopColor="#C9BCA2" stopOpacity=".12" />
          </linearGradient>
        </defs>

        {guias.map((v) => (
          <g key={v}>
            <line x1={L} y1={Y(v)} x2={W - R} y2={Y(v)} stroke="#DDE2D6" strokeWidth="1" />
            <text x={L - 8} y={Y(v) + 4} textAnchor="end" fill="#8A968E"
              fontSize="10" fontFamily="ui-monospace,Menlo,monospace">{v}</text>
          </g>
        ))}

        {modo === 'zonas' && datos.fc ? (
          <>
            {tramos.map((t, i) => {
              const z = ZONAS.find((x) => x.n === t.zona);
              const atenuado = zonaFoco && t.zona !== zonaFoco;
              return (
                <path key={i} d={areaPath(t.ini, t.fin)}
                  fill={z ? z.color : '#C9BCA2'}
                  opacity={atenuado ? 0.13 : 0.82} />
              );
            })}
            <path d={lineaPath(0, datos.d.length - 1)} fill="none" stroke="#1A2420"
              strokeWidth="1.2" strokeLinejoin="round" opacity=".55" />
          </>
        ) : (
          <>
            <path d={areaPath(0, datos.d.length - 1)} fill="url(#relieve)" />
            <path d={lineaPath(0, datos.d.length - 1)} fill="none" stroke="#1A2420"
              strokeWidth="1.6" strokeLinejoin="round" />
          </>
        )}

        {/* puertos subrayados */}
        {modo !== 'zonas' &&
          puertos.map((p, i) => {
            const a = mapear(p.inicio), b = mapear(p.fin);
            if (b <= a) return null;
            const activo = puertoFoco === i;
            return (
              <g key={i}>
                <path d={lineaPath(a, b)} fill="none"
                  stroke={activo ? '#B4372B' : '#D99A21'}
                  strokeWidth={activo ? 4.5 : 3.2} strokeLinecap="round" />
                {(activo || puertos.length <= 4) && (
                  <text x={X((datos.d[a] + datos.d[b]) / 2)} y={Y(datos.a[b]) - 11}
                    textAnchor="middle" fill={activo ? '#B4372B' : '#8A968E'}
                    fontSize="11" fontWeight="600" fontFamily="ui-monospace,Menlo,monospace">
                    {num(p.metros / 1000, 1)} km · {num(p.pendiente, 1)} %
                  </text>
                )}
              </g>
            );
          })}

        <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke="#C9BCA2" strokeWidth="1" />
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <text key={f} x={X(maxD * f)} y={H - 9} textAnchor="middle" fill="#8A968E"
            fontSize="10" fontFamily="ui-monospace,Menlo,monospace">
            {num(maxD * f, 0)} km
          </text>
        ))}

        {hover != null && (
          <g pointerEvents="none">
            <line x1={X(datos.d[hover])} y1={T} x2={X(datos.d[hover])} y2={H - B}
              stroke="#1A2420" strokeWidth="1" strokeDasharray="3 3" opacity=".5" />
            <circle cx={X(datos.d[hover])} cy={Y(datos.a[hover])} r="4.5"
              fill="#FBFCF9" stroke="#1A2420" strokeWidth="2" />
            <g transform={`translate(${Math.min(X(datos.d[hover]) + 10, W - 150)},${T + 4})`}>
              <rect width="140" height={datos.fc ? 50 : 34} rx="2"
                fill="#1A2420" opacity=".92" />
              <text x="9" y="18" fill="#F2F4EF" fontSize="11.5"
                fontFamily="ui-monospace,Menlo,monospace">
                {num(datos.d[hover], 2)} km · {num(datos.a[hover], 0)} m
              </text>
              {datos.fc && (
                <text x="9" y="36" fill="#F2F4EF" fontSize="11.5"
                  fontFamily="ui-monospace,Menlo,monospace">
                  {datos.fc[hover] ? `${datos.fc[hover]} ppm · Z${zonaDeFC(datos.fc[hover], fcmax).n}` : 'sin FC'}
                </text>
              )}
            </g>
          </g>
        )}
      </svg>
    </div>
  );
}
