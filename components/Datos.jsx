'use client';

import { MODELOS_ZONAS, NOMBRES_ZONA, PERFILES_BICI } from '@/lib/metrics';

/*
  Pestaña de configuracion pura: las constantes que editas y los rangos
  de cada zona que salen de ellas. El reparto real de tiempo por zona -lo
  que mides, no lo que defines- vive ahora en Resumen, donde ademas
  respeta el filtro de fechas en vez de arrastrar todo el historial.
*/
export default function Datos({ cfg, setCfg, zonas }) {
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
