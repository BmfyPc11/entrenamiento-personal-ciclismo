'use client';

import { useState } from 'react';
import { MODELOS_ZONAS, NOMBRES_ZONA, PERFILES_BICI, num, duracion } from '@/lib/metrics';

export default function Datos({ cfg, setCfg, zonas, reparto, fondo }) {
  const [vista, setVista] = useState('barras');

  const cambiarModelo = (id) => {
    if (id === 'personalizado') {
      // Al pasar a manual se parte de las zonas actuales, no de cero
      setCfg({ ...cfg, modeloZonas: 'personalizado', zonasPropias: zonas.map((z) => z.desde) });
    } else {
      setCfg({ ...cfg, modeloZonas: id });
    }
  };

  const editarLimite = (i, valor) => {
    const v = [...zonas.map((z) => z.desde)];
    v[i] = Math.max(30, Math.min(230, valor || 0));
    for (let k = 1; k < 5; k++) if (v[k] <= v[k - 1]) v[k] = v[k - 1] + 1;
    setCfg({ ...cfg, modeloZonas: 'personalizado', zonasPropias: v });
  };

  const manual = cfg.modeloZonas === 'personalizado';
  const modelo = MODELOS_ZONAS[cfg.modeloZonas];
  const hayDatos = reparto && reparto.total > 0;

  return (
    <>
      <h2>Tus constantes</h2>
      <p className="hint">
        Estos cuatro valores alimentan todos los cálculos del panel: el peso y la posición
        determinan la potencia estimada, y la frecuencia cardíaca máxima define dónde caen tus
        zonas.
      </p>

      <div className="panel">
        <div className="fields">
          <div>
            <label htmlFor="peso">Peso ciclista (kg)</label>
            <input id="peso" type="number" min="35" max="150" step="0.5" value={cfg.peso}
              onChange={(e) => setCfg({ ...cfg, peso: +e.target.value || 75 })} />
          </div>
          <div>
            <label htmlFor="bici">Peso bici + equipo (kg)</label>
            <input id="bici" type="number" min="5" max="30" step="0.5" value={cfg.bici}
              onChange={(e) => setCfg({ ...cfg, bici: +e.target.value || 11 })} />
          </div>
          <div>
            <label htmlFor="fcmaxc">FC máxima (ppm)</label>
            <input id="fcmaxc" type="number" min="140" max="220" value={cfg.fcmax}
              onChange={(e) => setCfg({ ...cfg, fcmax: +e.target.value || 185 })} />
          </div>
          <div>
            <label htmlFor="tipo">Bici y posición</label>
            <select id="tipo" value={cfg.perfil}
              onChange={(e) => {
                const p = PERFILES_BICI.find((x) => x.id === e.target.value);
                setCfg({ ...cfg, perfil: p.id, cda: p.cda, crr: p.crr });
              }}>
              {PERFILES_BICI.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
        </div>
      </div>

      <h2>Tus zonas de frecuencia cardíaca</h2>
      <p className="hint">
        Strava, Garmin y este panel casi nunca coinciden, y no es un error de ninguno: cada uno usa
        un modelo distinto y, sobre todo, una frecuencia cardíaca máxima distinta. Elige aquí el
        tuyo y todo el panel pasará a calcular con él.
      </p>

      <div className="panel">
        <div className="fields">
          <div>
            <label htmlFor="modelo">Modelo de zonas</label>
            <select id="modelo" value={cfg.modeloZonas} onChange={(e) => cambiarModelo(e.target.value)}>
              {Object.entries(MODELOS_ZONAS).map(([id, m]) => (
                <option key={id} value={id}>{m.nombre}</option>
              ))}
              <option value="personalizado">Personalizado</option>
            </select>
          </div>
          <div>
            <label htmlFor="fcmaxz">FC máxima (ppm)</label>
            <input id="fcmaxz" type="number" min="140" max="220" value={cfg.fcmax}
              disabled={manual}
              onChange={(e) => setCfg({ ...cfg, fcmax: +e.target.value || 185 })} />
          </div>
        </div>
        <p className="hint" style={{ margin: '14px 0 0' }}>
          {manual
            ? 'Estás en modo manual: escribe directamente dónde empieza cada zona.'
            : modelo?.descripcion}
        </p>
      </div>

      <h2>Dónde queda cada zona</h2>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Zona</th><th>Desde</th><th>Hasta</th><th>% FC máx</th><th>Para qué sirve</th>
            </tr>
          </thead>
          <tbody>
            {zonas.map((z, i) => (
              <tr key={z.n}>
                <td>
                  <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2,
                    background: z.color, marginRight: 9, verticalAlign: -1 }} />
                  Z{z.n} · {z.nombre}
                </td>
                <td>
                  {manual ? (
                    <input type="number" min="30" max="230" value={z.desde}
                      onChange={(e) => editarLimite(i, +e.target.value)}
                      style={{ width: 82, padding: '5px 8px', fontSize: 13, textAlign: 'right' }} />
                  ) : (
                    <strong style={{ color: 'var(--ink)' }}>{z.desde} ppm</strong>
                  )}
                </td>
                <td>{z.hasta ? `${z.hasta} ppm` : 'máx'}</td>
                <td>{z.pct} %</td>
                <td style={{ fontFamily: 'var(--sans)', textAlign: 'left', whiteSpace: 'normal',
                  fontSize: 13, color: 'var(--ink2)', verticalAlign: 'middle',
                  paddingLeft: 18, lineHeight: 1.5 }}>
                  {DESCRIPCIONES[i]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Cómo has repartido tu entrenamiento</h2>
      <p className="hint">
        {hayDatos
          ? `Acumulado de las ${reparto.analizadas} salidas con pulsómetro, ${duracion(reparto.total)} en total.`
          : fondo?.activo
            ? 'Trayendo el detalle de tus salidas…'
            : 'Todavía no hay ninguna salida con pulsómetro analizada.'}
      </p>

      {!hayDatos && fondo?.activo && (
        <div className="callout" style={{ marginBottom: 14 }}>
          Cargando el detalle de tus salidas ({fondo.hechas} de {fondo.total}). El desglose por
          zonas aparece en cuanto termine; no hace falta que hagas nada.
        </div>
      )}

      {hayDatos && (
        <>
          <div className="chips" style={{ marginTop: 0, marginBottom: 14 }}>
            {[['barras', 'Barras'], ['radar', 'Radar'], ['pastel', 'Sectores']].map(([id, txt]) => (
              <button key={id} aria-pressed={vista === id} onClick={() => setVista(id)}
                style={vista === id ? { background: 'var(--ink)', borderColor: 'var(--ink)' } : null}>
                {txt}
              </button>
            ))}
          </div>

          <div className="chart">
            {vista === 'barras' && <Barras zonas={zonas} reparto={reparto} />}
            {vista === 'radar' && <Radar zonas={zonas} reparto={reparto} />}
            {vista === 'pastel' && <Pastel zonas={zonas} reparto={reparto} />}
            <div className="legend">
              {zonas.map((z) => (
                <span key={z.n}>
                  <i style={{ background: z.color }} />Z{z.n} {z.nombre} · {num(reparto.porcentaje[z.n - 1], 0)} %
                </span>
              ))}
            </div>
          </div>

          <Veredicto reparto={reparto} zonas={zonas} />
        </>
      )}
    </>
  );
}

const DESCRIPCIONES = [
  'Rodar suave, recuperar entre series. No entrena nada por sí sola.',
  'El fondo. Donde debería estar la mayor parte de tu tiempo.',
  'Ni base ni umbral. Cansa mucho y aporta poco.',
  'El ritmo que puedes sostener una hora. Sube tu techo sostenible.',
  'Series cortas y muy duras. Mejora el consumo máximo de oxígeno.',
];

/* ---------- barras horizontales ---------- */
function Barras({ zonas, reparto }) {
  const max = Math.max(...reparto.segundos) || 1;
  return (
    <svg viewBox="0 0 1000 260" width="100%">
      {zonas.map((z, i) => {
        const y = 14 + i * 48;
        const w = (reparto.segundos[i] / max) * 700;
        return (
          <g key={z.n}>
            <text x="0" y={y + 22} fill="#9BA5B4" fontSize="13" fontFamily="Helvetica,Arial,sans-serif">
              Z{z.n} {z.nombre}
            </text>
            <rect x="170" y={y + 6} width="700" height="22" fill="#151A21" rx="4" />
            <rect x="170" y={y + 6} width={Math.max(w, 2)} height="22" fill={z.color} rx="4" />
            <text x="885" y={y + 22} fill="#E8EAED" fontSize="13" fontWeight="500"
              fontFamily="ui-monospace,Menlo,monospace">
              {num(reparto.porcentaje[i], 0)} %
            </text>
            <text x="1000" y={y + 22} textAnchor="end" fill="#6B7684" fontSize="12"
              fontFamily="ui-monospace,Menlo,monospace">
              {duracion(reparto.segundos[i])}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- radar / poligonal ---------- */
function Radar({ zonas, reparto }) {
  const cx = 500, cy = 210, R = 165;
  const max = Math.max(...reparto.porcentaje) || 1;
  const ang = (i) => (Math.PI * 2 * i) / 5 - Math.PI / 2;
  const punto = (i, f) => [cx + Math.cos(ang(i)) * R * f, cy + Math.sin(ang(i)) * R * f];

  const anillos = [0.25, 0.5, 0.75, 1];
  const forma = zonas
    .map((z, i) => punto(i, Math.max(reparto.porcentaje[i] / max, 0.02)).join(','))
    .join(' ');

  return (
    <svg viewBox="0 0 1000 420" width="100%">
      {anillos.map((f) => (
        <polygon key={f}
          points={zonas.map((z, i) => punto(i, f).join(',')).join(' ')}
          fill="none" stroke="#2A3341" strokeWidth="1" />
      ))}
      {zonas.map((z, i) => (
        <line key={z.n} x1={cx} y1={cy} x2={punto(i, 1)[0]} y2={punto(i, 1)[1]}
          stroke="#2A3341" strokeWidth="1" />
      ))}

      <polygon points={forma} fill="#4A90D9" fillOpacity=".18" stroke="#4A90D9" strokeWidth="2" />

      {zonas.map((z, i) => {
        const [px, py] = punto(i, Math.max(reparto.porcentaje[i] / max, 0.02));
        const [lx, ly] = punto(i, 1.19);
        return (
          <g key={z.n}>
            <circle cx={px} cy={py} r="5" fill={z.color} stroke="#0E1116" strokeWidth="2" />
            <text x={lx} y={ly} textAnchor="middle" fill={z.color} fontSize="13" fontWeight="500"
              fontFamily="Helvetica,Arial,sans-serif">
              Z{z.n}
            </text>
            <text x={lx} y={ly + 16} textAnchor="middle" fill="#6B7684" fontSize="11.5"
              fontFamily="ui-monospace,Menlo,monospace">
              {num(reparto.porcentaje[i], 0)} %
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- sectores ---------- */
function Pastel({ zonas, reparto }) {
  const cx = 500, cy = 190, R = 150, r = 82;
  let acc = -Math.PI / 2;

  const sectores = zonas.map((z, i) => {
    const frac = reparto.porcentaje[i] / 100;
    const ini = acc;
    const fin = acc + frac * Math.PI * 2;
    acc = fin;
    if (frac <= 0.0005) return null;

    const grande = fin - ini > Math.PI ? 1 : 0;
    const P = (a, rad) => [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad];
    const [x1, y1] = P(ini, R), [x2, y2] = P(fin, R);
    const [x3, y3] = P(fin, r), [x4, y4] = P(ini, r);
    const medio = (ini + fin) / 2;
    const [tx, ty] = P(medio, (R + r) / 2);

    return (
      <g key={z.n}>
        <path
          d={`M ${x1} ${y1} A ${R} ${R} 0 ${grande} 1 ${x2} ${y2} L ${x3} ${y3} A ${r} ${r} 0 ${grande} 0 ${x4} ${y4} Z`}
          fill={z.color} stroke="#0E1116" strokeWidth="2" />
        {frac > 0.06 && (
          <text x={tx} y={ty + 5} textAnchor="middle" fill="#0E1116" fontSize="14" fontWeight="500"
            fontFamily="ui-monospace,Menlo,monospace">
            {num(reparto.porcentaje[i], 0)} %
          </text>
        )}
      </g>
    );
  });

  const suave = reparto.porcentaje[0] + reparto.porcentaje[1];
  return (
    <svg viewBox="0 0 1000 380" width="100%">
      {sectores}
      <text x={cx} y={cy - 6} textAnchor="middle" fill="#E8EAED" fontSize="26" fontWeight="500"
        fontFamily="ui-monospace,Menlo,monospace">
        {num(suave, 0)} %
      </text>
      <text x={cx} y={cy + 16} textAnchor="middle" fill="#6B7684" fontSize="12"
        fontFamily="Helvetica,Arial,sans-serif">
        en zona 1 y 2
      </text>
      <text x={cx} y={cy + 34} textAnchor="middle" fill="#6B7684" fontSize="11.5"
        fontFamily="Helvetica,Arial,sans-serif">
        {duracion(reparto.total)} analizados
      </text>
    </svg>
  );
}

/* ---------- lectura del reparto ---------- */
function Veredicto({ reparto, zonas }) {
  const suave = reparto.porcentaje[0] + reparto.porcentaje[1];
  const media = reparto.porcentaje[2];
  const dura = reparto.porcentaje[3] + reparto.porcentaje[4];

  if (media > 28) {
    return (
      <div className="callout warn">
        <strong>Un {num(media, 0)} % de tu tiempo cae en zona 3.</strong> Es el ritmo que más cansa
        y menos aporta: demasiado duro para construir base, demasiado suave para subir el umbral. En
        las salidas de fondo, obligarte a bajar de {zonas[2].desde} ppm aunque tengas que poner un
        desarrollo ridículo en las rampas.
      </div>
    );
  }
  if (suave >= 75 && dura >= 10) {
    return (
      <div className="callout ok">
        <strong>Reparto polarizado de manual:</strong> {num(suave, 0)} % en fondo y {num(dura, 0)} %
        en alta intensidad. Es exactamente lo que buscas. Ahora el margen de mejora está en subir el
        volumen, no en cambiar el reparto.
      </div>
    );
  }
  if (dura < 8) {
    return (
      <div className="callout">
        <strong>Solo un {num(dura, 0)} % por encima del umbral.</strong> Tienes base de sobra pero te
        falta el estímulo que sube el techo. Una sesión dura por semana, sin tocar el resto, cambiaría
        bastante el panorama.
      </div>
    );
  }
  return (
    <div className="callout ok">
      <strong>{num(suave, 0)} % en fondo, {num(dura, 0)} % en alta intensidad.</strong> El reparto es
      razonable. Vigila solo que la zona 3 no se vaya creciendo mes a mes.
    </div>
  );
}
