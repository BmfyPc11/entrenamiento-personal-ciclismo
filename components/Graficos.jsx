'use client';

const MONO = 'ui-monospace,Menlo,monospace';

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
