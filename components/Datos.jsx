'use client';

import { useState } from 'react';
import { MODELOS_ZONAS, NOMBRES_ZONA, PERFILES_BICI, num, duracion } from '@/lib/metrics';

/*
  Constantes y zonas -lo que defines-, mas debajo el reparto real de
  tiempo por zona de todo el historial -lo que mides-. Va con todo el
  historial, no con el rango de fechas de Resumen: esta pestana no tiene
  filtro de fechas propio.
*/
export default function Datos({ cfg, setCfg, zonas, reparto }) {
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

  return (
    <>
      <h2>Tus constantes y tus zonas</h2>
      <p className="hint">
        A la izquierda, los cuatro valores que alimentan todos los cálculos del panel. A la
        derecha, dónde caen tus zonas de pulso.
      </p>

      <div className="dos-col">
        <section>
          <h3>Mis constantes</h3>
          <div className="panel">
            <div className="fields" style={{ gridTemplateColumns: '1fr' }}>
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
            <p className="hint" style={{ margin: '14px 0 0', fontSize: 13 }}>
              El peso y la posición determinan la potencia estimada; la frecuencia cardíaca
              máxima define dónde caen tus zonas.
            </p>
          </div>
        </section>

        <section>
          <h3>Tus zonas de frecuencia cardíaca</h3>

          <div className="panel" style={{ marginBottom: 'var(--e4)' }}>
            <div className="fields">
              <div>
                <label htmlFor="modelo">Modelo de zonas</label>
                <select id="modelo" value={cfg.modeloZonas}
                  onChange={(e) => cambiarModelo(e.target.value)}>
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
            <p className="hint" style={{ margin: '14px 0 0', fontSize: 13 }}>
              {manual
                ? 'Estás en modo manual: escribe directamente dónde empieza cada zona.'
                : modelo?.descripcion}
            </p>
          </div>

          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Zona</th><th>Desde</th><th>Hasta</th><th>% FC máx</th>
                </tr>
              </thead>
              <tbody>
                {zonas.map((z, i) => (
                  <tr key={z.n}>
                    <td>
                      <span style={{ display: 'inline-block', width: 10, height: 10,
                        borderRadius: 2, background: z.color, marginRight: 9,
                        verticalAlign: -1 }} />
                      Z{z.n} · {z.nombre}
                    </td>
                    <td>
                      {manual ? (
                        <input type="number" min="30" max="230" value={z.desde}
                          onChange={(e) => editarLimite(i, +e.target.value)}
                          style={{ width: 82, padding: '5px 8px', fontSize: 13,
                            textAlign: 'right' }} />
                      ) : (
                        <strong style={{ color: 'var(--ink)' }}>{z.desde} ppm</strong>
                      )}
                    </td>
                    <td>{z.hasta ? `${z.hasta} ppm` : 'máx'}</td>
                    <td>{z.pct} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className="glosario">
            {zonas.map((z, i) => (
              <div key={z.n}>
                <dt><i style={{ background: z.color }} />Z{z.n} · {z.nombre}</dt>
                <dd>{DESCRIPCIONES[i]}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <RepartoZonas zonas={zonas} reparto={reparto} />
    </>
  );
}

/*
  El reparto real de tiempo por zona, de todo el historial -a diferencia
  de la tabla de arriba, que es definicion, no medicion. La lectura
  textual queda oculta detras de un boton -es la explicacion larga, no
  hace falta que ocupe sitio siempre.
*/
function RepartoZonas({ zonas, reparto }) {
  const [verInfo, setVerInfo] = useState(false);
  const hayDatos = reparto && reparto.total > 0;

  if (!hayDatos) return null;

  return (
    <>
      <h2>Tus zonas</h2>
      <p className="hint">
        Acumulado de las {reparto.analizadas} salidas con pulsómetro de todo tu historial,{' '}
        {duracion(reparto.total)} en total.
      </p>
      <div className="chart">
        <BarrasZonas zonas={zonas} reparto={reparto} />
        <div className="legend">
          {zonas.map((z) => (
            <span key={z.n}>
              <i style={{ background: z.color }} />Z{z.n} {z.nombre} · {num(reparto.porcentaje[z.n - 1], 0)} %
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--e3)' }}>
          <button aria-expanded={verInfo} onClick={() => setVerInfo((v) => !v)}>
            {verInfo ? 'Ocultar' : 'Qué significa'}
          </button>
        </div>
      </div>
      {verInfo && <Veredicto reparto={reparto} zonas={zonas} />}
    </>
  );
}

/* ---------- barras horizontales del reparto por zonas ---------- */
function BarrasZonas({ zonas, reparto }) {
  const max = Math.max(...reparto.segundos) || 1;
  return (
    <svg viewBox="0 0 1000 260" width="100%">
      {zonas.map((z, i) => {
        const y = 14 + i * 48;
        const w = (reparto.segundos[i] / max) * 700;
        return (
          <g key={z.n}>
            <text x="0" y={y + 22} fill="#C6B89E" fontSize="13" fontFamily="Helvetica,Arial,sans-serif">
              Z{z.n} {z.nombre}
            </text>
            <rect x="170" y={y + 6} width="700" height="22" fill="#211C15" rx="4" />
            <rect x="170" y={y + 6} width={Math.max(w, 2)} height="22" fill={z.color} rx="4"
              className="g-crece-x" style={{ animationDelay: `${i * 0.06}s` }} />
            <text x="885" y={y + 22} fill="#F3ECE0" fontSize="13" fontWeight="500"
              fontFamily="ui-monospace,Menlo,monospace">
              {num(reparto.porcentaje[i], 0)} %
            </text>
            <text x="1000" y={y + 22} textAnchor="end" fill="#948564" fontSize="12"
              fontFamily="ui-monospace,Menlo,monospace">
              {duracion(reparto.segundos[i])}
            </text>
          </g>
        );
      })}
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

const DESCRIPCIONES = [
  'Rodar suave, recuperar entre series. No entrena nada por sí sola.',
  'El fondo. Donde debería estar la mayor parte de tu tiempo.',
  'Ni base ni umbral. Cansa mucho y aporta poco.',
  'El ritmo que puedes sostener una hora. Sube tu techo sostenible.',
  'Series cortas y muy duras. Mejora el consumo máximo de oxígeno.',
];
