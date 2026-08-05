'use client';

import { num } from '@/lib/metrics';

const MONO = 'ui-monospace,Menlo,monospace';

/* ---------- grafico de linea con puntos y objetivo opcional ---------- */
export function Linea({ puntos, objetivo, color = '#4A90D9', unidad = '', altura = 300, minY, maxY }) {
  if (!puntos.length) return <p className="hint">Sin datos suficientes para dibujar la tendencia.</p>;

  const W = 1000, H = altura, L = 50, R = 18, T = 22, B = 52;
  const vals = puntos.map((p) => p.y).concat(objetivo ? [objetivo] : []);
  const lo = minY ?? Math.min(...vals) * 0.85;
  const hi = maxY ?? Math.max(...vals) * 1.08;
  const X = (i) => L + (puntos.length === 1 ? 0.5 : i / (puntos.length - 1)) * (W - L - R);
  const Y = (v) => H - B - ((v - lo) / (hi - lo)) * (H - T - B);

  const guias = 5;
  const paso = (hi - lo) / (guias - 1);

  let d = '';
  puntos.forEach((p, i) => (d += (i ? ' L ' : 'M ') + X(i) + ' ' + Y(p.y)));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%">
      {Array.from({ length: guias }, (_, k) => lo + paso * k).map((v, k) => (
        <g key={k}>
          <line x1={L} y1={Y(v)} x2={W - R} y2={Y(v)} stroke="#2A3341" />
          <text x={L - 8} y={Y(v) + 4} textAnchor="end" fill="#6B7684" fontSize="10" fontFamily={MONO}>
            {num(v, 0)}
          </text>
        </g>
      ))}

      {objetivo != null && (
        <>
          <line x1={L} y1={Y(objetivo)} x2={W - R} y2={Y(objetivo)}
            stroke="#D14B42" strokeWidth="2" strokeDasharray="7 5" />
          <text x={W - R - 4} y={Y(objetivo) - 8} textAnchor="end" fill="#D14B42"
            fontSize="11" fontWeight="600" fontFamily={MONO}>
            OBJETIVO {num(objetivo, 0)} {unidad}
          </text>
        </>
      )}

      <path d={d} fill="none" stroke={color} strokeWidth="2.6" strokeLinejoin="round" />
      {puntos.map((p, i) => (
        <g key={i}>
          <circle cx={X(i)} cy={Y(p.y)} r="5.5" fill="#0E1116" stroke={color} strokeWidth="2.6" />
          <text x={X(i)} y={Y(p.y) - 14} textAnchor="middle" fill="#E8EAED"
            fontSize="12" fontWeight="600" fontFamily={MONO}>{num(p.y, 1)}</text>
          {puntos.length <= 14 && (
            <text x={X(i)} y={H - B + 20} textAnchor="middle" fill="#6B7684" fontSize="10.5" fontFamily={MONO}>
              {p.etiqueta}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

/* ---------- barras ---------- */
export function Barras({ datos, altura = 280, resaltar }) {
  if (!datos.length) return <p className="hint">Sin datos.</p>;
  const W = 1000, H = altura, L = 50, R = 18, T = 22, B = 46;
  const hi = Math.max(...datos.map((d) => d.y)) * 1.14 || 10;
  const bw = (W - L - R) / datos.length;
  const guias = 5, paso = hi / (guias - 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%">
      {Array.from({ length: guias }, (_, k) => paso * k).map((v, k) => (
        <g key={k}>
          <line x1={L} y1={H - B - (v / hi) * (H - T - B)} x2={W - R} y2={H - B - (v / hi) * (H - T - B)}
            stroke="#2A3341" />
          <text x={L - 8} y={H - B - (v / hi) * (H - T - B) + 4} textAnchor="end"
            fill="#6B7684" fontSize="10" fontFamily={MONO}>{num(v, 0)}</text>
        </g>
      ))}
      {datos.map((d, i) => {
        const h = (d.y / hi) * (H - T - B);
        return (
          <g key={i}>
            <rect x={L + i * bw + bw * 0.17} y={H - B - h} width={bw * 0.66} height={Math.max(h, 1)}
              fill={resaltar && resaltar(d) ? '#E0A82E' : '#4A5563'} rx="1" />
            <text x={L + i * bw + bw / 2} y={H - B - h - 6} textAnchor="middle"
              fill="#9BA5B4" fontSize="10" fontWeight="600" fontFamily={MONO}>{num(d.y, 0)}</text>
            {datos.length <= 24 && (
              <text x={L + i * bw + bw / 2} y={H - B + 16} textAnchor="middle"
                fill="#6B7684" fontSize="9.5" fontFamily={MONO}>{d.etiqueta}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- condicion / fatiga / forma ---------- */
export function Carga({ serie, altura = 290 }) {
  if (serie.length < 2) return <p className="hint">Necesitas más salidas para dibujar la curva de forma.</p>;
  const W = 1000, H = altura, L = 48, R = 18, T = 20, B = 44;
  const hi = Math.max(...serie.map((s) => Math.max(s.condicion, s.fatiga))) * 1.25 || 10;
  const lo = Math.min(0, ...serie.map((s) => s.forma)) * 1.25;
  const X = (i) => L + (i / (serie.length - 1)) * (W - L - R);
  const Y = (v) => H - B - ((v - lo) / (hi - lo)) * (H - T - B);
  const path = (k) => serie.map((s, i) => (i ? ' L ' : 'M ') + X(i) + ' ' + Y(s[k])).join('');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%">
      <line x1={L} y1={Y(0)} x2={W - R} y2={Y(0)} stroke="#4A5563" strokeWidth="1.5" />
      <path d={path('condicion')} fill="none" stroke="#4A90D9" strokeWidth="2.8" strokeLinejoin="round" />
      <path d={path('fatiga')} fill="none" stroke="#D14B42" strokeWidth="1.9" strokeLinejoin="round" />
      <path d={path('forma')} fill="none" stroke="#6FA35A" strokeWidth="1.9"
        strokeDasharray="5 4" strokeLinejoin="round" />
      {serie.map((s, i) =>
        i % Math.ceil(serie.length / 8) === 0 || i === serie.length - 1 ? (
          <text key={i} x={X(i)} y={H - B + 18} textAnchor="middle" fill="#6B7684"
            fontSize="10" fontFamily={MONO}>
            {s.fecha.slice(5).replace('-', '/')}
          </text>
        ) : null
      )}
    </svg>
  );
}
