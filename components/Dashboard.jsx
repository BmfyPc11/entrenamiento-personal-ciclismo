'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Entrenamientos from './Entrenamientos';
import Zonas from './Zonas';
import Objetivos from './Objetivos';
import Semana from './Semana';
import Consejo from './Consejo';
import { Linea, Barras, Carga } from './Graficos';
import {
  PERFILES_BICI, detectarPuertos, serieCarga, umbralEstimado,
  vatios, vatiosSalida, vatiosPuerto, repartoZonas, repartoGlobal,
  calcularZonas, ultimosDias, consejoEntrenador,
  num, duracion, fechaCorta, kmh, km, metrosPorKm, vamSalida, esLlana,
} from '@/lib/metrics';

const PESTANAS = [
  ['resumen', 'Resumen'],
  ['entrenamientos', 'Entrenamientos'],
  ['zonas', 'Zonas'],
  ['llano', 'Llano'],
  ['subida', 'Subida'],
  ['carga', 'Carga y forma'],
  ['objetivos', 'Objetivos'],
  ['proyeccion', 'Proyección'],
];

const CFG_INICIAL = {
  peso: 75, bici: 11, fcmax: 185, cda: 0.36, crr: 0.008, perfil: 'gravel_alto',
  modeloZonas: 'fcmax', zonasPropias: null,
};

export default function Dashboard({ atleta }) {
  const [salidas, setSalidas] = useState(null);
  const [error, setError] = useState(null);
  const [cache, setCache] = useState({});
  const [pestana, setPestana] = useState('resumen');
  const [cfg, setCfg] = useState(CFG_INICIAL);
  const [excluidas, setExcluidas] = useState(new Set());
  const [refrescando, setRefrescando] = useState(false);

  /* --- preferencias guardadas en el navegador --- */
  useEffect(() => {
    try {
      const g = localStorage.getItem('cfg_ciclismo');
      if (g) setCfg({ ...CFG_INICIAL, ...JSON.parse(g) });
      const e = localStorage.getItem('excluidas_ciclismo');
      if (e) setExcluidas(new Set(JSON.parse(e)));
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem('cfg_ciclismo', JSON.stringify(cfg)); } catch {}
  }, [cfg]);
  useEffect(() => {
    try { localStorage.setItem('excluidas_ciclismo', JSON.stringify([...excluidas])); } catch {}
  }, [excluidas]);

  /* --- carga de actividades --- */
  const cargar = useCallback(async () => {
    setRefrescando(true);
    setError(null);
    try {
      const r = await fetch('/api/activities', { cache: 'no-store' });
      if (r.status === 401) { window.location.reload(); return; }
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setSalidas(j.salidas);
      if (j.aviso === 'limite_alcanzado') {
        setError('Strava ha limitado las peticiones por unos minutos. Se muestran las salidas que dio tiempo a leer.');
      }
      // si Strava tiene tu peso, lo usamos la primera vez
      if (atleta?.peso && cfg.peso === CFG_INICIAL.peso) {
        setCfg((c) => ({ ...c, peso: Math.round(atleta.peso) }));
      }
    } catch (e) {
      setError(
        e.message === 'limite_alcanzado'
          ? 'Strava ha alcanzado su límite de peticiones. Espera unos 15 minutos y vuelve a intentarlo.'
          : 'No se pudieron leer tus actividades. Prueba a recargar la página.'
      );
    } finally {
      setRefrescando(false);
    }
  }, [atleta, cfg.peso]);

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, []);

  /* --- streams bajo demanda, con cache --- */
  const pedirStreams = useCallback(async (id) => {
    const r = await fetch(`/api/streams?id=${id}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status === 502 ? 'Strava no devolvió el detalle' : 'Error de conexión');
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    setCache((c) => ({ ...c, [id]: j.streams }));
    return j.streams;
  }, []);

  const activas = useMemo(
    () => (salidas || []).filter((s) => !excluidas.has(s.id)),
    [salidas, excluidas]
  );

  /*
    Precarga de las ultimas salidas con pulsometro. Sin esto, el apartado
    de zonas y el umbral estimado arrancan vacios hasta que el usuario abre
    salidas a mano. Se limita a cinco para no gastar el cupo de Strava.
  */
  useEffect(() => {
    if (!activas.length) return;
    const pendientes = [...activas]
      .reverse()
      .filter((s) => s.fcMedia && !cache[s.id])
      .slice(0, 5);
    if (!pendientes.length) return;
    let vivo = true;
    (async () => {
      for (const s of pendientes) {
        if (!vivo) return;
        try { await pedirStreams(s.id); } catch { /* sin detalle, seguimos */ }
      }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activas.length]);

  const umbral = useMemo(() => {
    const todos = Object.entries(cache).flatMap(([id, st]) =>
      excluidas.has(Number(id)) ? [] : detectarPuertos(st, { minMetros: 1000, minDesnivel: 80, minPend: 4 })
    );
    return umbralEstimado(todos, cfg) || 150;
  }, [cache, cfg, excluidas]);

  const masaTotal = cfg.peso + cfg.bici;
  const wPara30 = vatios(30 / 3.6, 0, masaTotal, cfg.cda, cfg.crr);

  /* Zonas del usuario: una sola fuente de verdad para todo el panel. */
  const zonas = useMemo(() => calcularZonas(cfg), [cfg]);

  const dias = useMemo(
    () => ultimosDias(activas, cfg, zonas, umbral, 7),
    [activas, cfg, zonas, umbral]
  );
  const consejo = useMemo(
    () => consejoEntrenador(activas, cfg, zonas, umbral),
    [activas, cfg, zonas, umbral]
  );
  const global = useMemo(
    () => repartoGlobal(cache, zonas, excluidas),
    [cache, zonas, excluidas]
  );

  if (error && !salidas) {
    return (
      <div className="wrap">
        <div className="login">
          <h1>Algo falló</h1>
          <div className="callout warn" style={{ textAlign: 'left' }}>{error}</div>
          <button onClick={cargar}>Reintentar</button>
        </div>
      </div>
    );
  }

  if (!salidas) {
    return (
      <div className="wrap">
        <p className="cargando"><span className="spin" />Leyendo tus actividades de Strava…</p>
      </div>
    );
  }

  return (
    <div className="wrap">
      <div className="top">
        <div>
          <p className="eyebrow">
            Cuaderno de ruta · {activas.length} salidas
            {activas.length > 0 && ` · desde ${fechaCorta(activas[0].fecha)}`}
          </p>
          <h1>Analiza tu<br /><em>rendimiento</em></h1>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="usuario">
            {atleta?.foto
              ? <img src={atleta.foto} alt="" />
              : <div className="ini">{(atleta?.nombre || '?').charAt(0)}</div>}
            <div>
              <b>{atleta?.nombre || 'Conectado'}</b>
              <span>vía Strava</span>
            </div>
          </div>
          <button onClick={cargar} disabled={refrescando}>
            {refrescando ? 'Actualizando…' : 'Actualizar'}
          </button>
          <button onClick={() =>
            fetch('/api/auth/logout', { method: 'POST' }).then(() => window.location.reload())}>
            Salir
          </button>
        </div>
      </div>

      {error && <div className="callout warn">{error}</div>}

      <h3 style={{ marginTop: 10 }}>Últimos siete días</h3>
      <Semana dias={dias} />

      <div style={{ marginTop: 22 }}>
        <Consejo consejo={consejo} />
      </div>

      <nav role="tablist">
        {PESTANAS.map(([id, txt]) => (
          <button key={id} role="tab" aria-selected={pestana === id} onClick={() => setPestana(id)}>
            {txt}
          </button>
        ))}
      </nav>

      {/* ---------- constantes ---------- */}
      <div className="panel">
        <h3 style={{ marginBottom: 14 }}>Tus constantes</h3>
        <div className="fields">
          <div>
            <label htmlFor="peso">Peso ciclista (kg)</label>
            <input id="peso" type="number" min="40" max="140" step="0.5" value={cfg.peso}
              onChange={(e) => setCfg({ ...cfg, peso: +e.target.value || 75 })} />
          </div>
          <div>
            <label htmlFor="bici">Peso bici + equipo (kg)</label>
            <input id="bici" type="number" min="5" max="25" step="0.5" value={cfg.bici}
              onChange={(e) => setCfg({ ...cfg, bici: +e.target.value || 11 })} />
          </div>
          <div>
            <label htmlFor="fcmax">FC máxima (ppm)</label>
            <input id="fcmax" type="number" min="140" max="215" value={cfg.fcmax}
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
        <p className="hint" style={{ margin: '14px 0 0' }}>
          Estos valores alimentan todos los cálculos. Cámbialos y el panel se recalcula al momento.
          Las zonas de frecuencia cardíaca se configuran en su propia pestaña.
        </p>
      </div>

      {pestana === 'resumen' && (
        <Resumen salidas={activas} cfg={cfg} umbral={umbral} masaTotal={masaTotal}
          excluidas={excluidas} setExcluidas={setExcluidas} todas={salidas} />
      )}
      {pestana === 'entrenamientos' && (
        <Entrenamientos salidas={salidas} cfg={cfg} zonas={zonas} cache={cache}
          pedirStreams={pedirStreams} />
      )}
      {pestana === 'zonas' && (
        <Zonas cfg={cfg} setCfg={setCfg} zonas={zonas} reparto={global} />
      )}
      {pestana === 'llano' && <Llano salidas={activas} cfg={cfg} masaTotal={masaTotal} />}
      {pestana === 'subida' && <Subida salidas={activas} cfg={cfg} cache={cache} umbral={umbral} masaTotal={masaTotal} />}
      {pestana === 'carga' && <CargaTab salidas={activas} cfg={cfg} umbral={umbral} zonas={zonas} global={global} />}
      {pestana === 'objetivos' && (
        <Objetivos salidas={activas} cfg={cfg} cache={cache} excluidas={excluidas} masaTotal={masaTotal} />
      )}
      {pestana === 'proyeccion' && <Proyeccion salidas={activas} cfg={cfg} umbral={umbral} masaTotal={masaTotal} />}

      <footer>
        <strong>Origen de los datos:</strong> tu cuenta de Strava, leída en directo. Solo se analizan
        actividades de tipo bicicleta.<br />
        <strong>Tiempos:</strong> siempre tiempo en movimiento, nunca tiempo transcurrido.<br />
        <strong>Potencias:</strong> estimadas a partir de peso, desnivel, velocidad y tiempo, salvo que
        tengas medidor de potencia, en cuyo caso se usa el dato real.
      </footer>
    </div>
  );
}

/* ============================================================ */

function Dato({ k, v, u, d, cl }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className="v">{v} {u && <small>{u}</small>}</div>
      {d && <div className={`d ${cl || ''}`}>{d}</div>}
    </div>
  );
}

function Resumen({ salidas, cfg, umbral, masaTotal, excluidas, setExcluidas, todas }) {
  if (!salidas.length) return <p className="hint">No hay salidas seleccionadas.</p>;

  const suma = (f) => salidas.reduce((a, s) => a + f(s), 0);
  const llanas = salidas.filter(esLlana);
  const mejorLlano = llanas.length ? Math.max(...llanas.map(kmh)) : 0;
  const sinFC = salidas.filter((s) => !s.fcMedia).length;
  const wPara30 = vatios(30 / 3.6, 0, masaTotal, cfg.cda, cfg.crr);
  const wCarretera = vatios(30 / 3.6, 0, masaTotal, 0.3, 0.005);

  return (
    <>
      <h2>Dónde estás hoy</h2>
      <div className="grid">
        <Dato k="Distancia total" v={num(suma(km), 0)} u="km" d={`${salidas.length} salidas`} />
        <Dato k="Desnivel acumulado" v={num(suma((s) => s.desnivel), 0)} u="m" />
        <Dato k="Horas sobre la bici" v={num(suma((s) => s.tiempoMovimiento) / 3600, 1)} u="h"
          d="tiempo en movimiento" />
        <Dato k="Salida media" v={num(suma(km) / salidas.length, 1)} u="km" />
        <Dato k="Mejor registro en llano" v={mejorLlano ? num(mejorLlano, 1) : '—'} u="km/h"
          d={mejorLlano ? 'terreno realmente llano' : 'sin salidas llanas'} />
        <Dato k="Umbral estimado" v={umbral} u="W" d={`${num(umbral / cfg.peso, 2)} W/kg`} />
      </div>

      <div className="callout warn">
        <strong>Mantener 30 km/h con tu configuración actual exige unos {num(wPara30, 0)} W
        sostenidos.</strong> Con una bici de carretera y posición baja, esos mismos 30 km/h bajan a{' '}
        {num(wCarretera, 0)} W: {num(wPara30 - wCarretera, 0)} W de diferencia sin ganar un solo
        vatio de forma. En llano, la aerodinámica pesa más que el motor.
      </div>

      {sinFC > 0 && (
        <div className="callout">
          <strong>{sinFC} de tus {salidas.length} salidas no tienen frecuencia cardíaca.</strong> Sin
          ese dato, su intensidad en el calendario es una estimación a partir del desnivel y la
          velocidad. Graba siempre con el Garmin y en unos meses este panel valdrá el doble.
        </div>
      )}

      <h2>Qué salidas entran en el análisis</h2>
      <p className="hint">
        Desmarca las que no sean representativas (paradas largas, ruta acompañando a alguien, error
        de registro) y desaparecerán de todos los cálculos.
      </p>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Salida</th><th>Fecha</th><th>Dist.</th><th>Desn.</th>
              <th>m/km</th><th>Vel.</th><th>VAM</th><th>FC</th><th>W est.</th><th>Incluir</th>
            </tr>
          </thead>
          <tbody>
            {[...todas].reverse().map((s) => {
              const dentro = !excluidas.has(s.id);
              return (
                <tr key={s.id} style={{ opacity: dentro ? 1 : 0.35 }}>
                  <td>
                    {s.nombre}
                    <span className={`tag ${esLlana(s) ? 'lla' : metrosPorKm(s) > 12 ? 'col' : ''}`}>
                      {esLlana(s) ? 'llano' : metrosPorKm(s) > 12 ? 'puerto' : 'mixto'}
                    </span>
                  </td>
                  <td>{fechaCorta(s.fecha)}</td>
                  <td>{num(km(s), 1)}</td>
                  <td>+{num(s.desnivel, 0)}</td>
                  <td>{num(metrosPorKm(s), 1)}</td>
                  <td>{num(kmh(s), 1)}</td>
                  <td>{num(vamSalida(s), 0)}</td>
                  <td>{s.fcMedia ? num(s.fcMedia, 0) : '—'}</td>
                  <td>{num(vatiosSalida(s, cfg), 0)}</td>
                  <td>
                    <input type="checkbox" checked={dentro}
                      onChange={() => {
                        const n = new Set(excluidas);
                        dentro ? n.add(s.id) : n.delete(s.id);
                        setExcluidas(n);
                      }} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Llano({ salidas, cfg, masaTotal }) {
  const llanas = salidas.filter(esLlana);
  const mejor = llanas.length ? Math.max(...llanas.map(kmh)) : 20;
  const wMejor = vatios(mejor / 3.6, 0, masaTotal, cfg.cda, cfg.crr);

  return (
    <>
      <h2>Velocidad en llano</h2>
      <p className="hint">
        Solo salidas con menos de 5 m de desnivel por kilómetro: terreno realmente llano, donde el
        objetivo de 30 km/h tiene sentido.
      </p>
      <div className="chart">
        <Linea
          puntos={llanas.map((s) => ({ y: kmh(s), etiqueta: fechaCorta(s.fecha) }))}
          objetivo={30} unidad="km/h" minY={10} maxY={32}
        />
      </div>

      <h2>Qué potencia exige cada velocidad</h2>
      <p className="hint">Calculado con física real de ciclismo para tu peso y tu configuración.</p>
      <div className="scroll">
        <table>
          <thead>
            <tr><th>Velocidad en llano</th><th>Potencia</th><th>W/kg</th><th>Frente a hoy</th></tr>
          </thead>
          <tbody>
            {[18, 20, 22, 24, 26, 28, 30].map((v) => {
              const w = vatios(v / 3.6, 0, masaTotal, cfg.cda, cfg.crr);
              const esTuyo = Math.abs(v - mejor) < 1;
              return (
                <tr key={v} style={esTuyo ? { background: 'var(--card2)' } : null}>
                  <td>{v} km/h {esTuyo && <span className="tag">tu nivel</span>}</td>
                  <td>{num(w, 0)} W</td>
                  <td>{num(w / cfg.peso, 2)}</td>
                  <td style={{ color: w > wMejor ? 'var(--orange)' : 'var(--green)' }}>
                    {w > wMejor ? '+' : ''}{num(w - wMejor, 0)} W
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="callout">
        <strong>Lee la última columna.</strong> Subir de {num(mejor, 0)} a 30 km/h no es un 40 % más de
        esfuerzo: es {num((vatios(30 / 3.6, 0, masaTotal, cfg.cda, cfg.crr) / wMejor) * 100 - 100, 0)} % más
        de potencia. La resistencia del aire crece con el cubo de la velocidad, así que cada km/h extra
        cuesta más que el anterior.
      </div>
    </>
  );
}

function Subida({ salidas, cfg, cache, umbral, masaTotal }) {
  const [calc, setCalc] = useState({ km: 5, pct: 6.5, vam: 565 });

  const puertos = Object.values(cache).flatMap((st) =>
    detectarPuertos(st, { minMetros: 1000, minDesnivel: 80, minPend: 4 })
  ).sort((a, b) => b.desnivel - a.desnivel).slice(0, 12);

  const desnivel = calc.km * 1000 * (calc.pct / 100);
  const seg = (desnivel / calc.vam) * 3600;
  const v = (calc.km * 1000) / seg;
  const w = vatios(v, calc.pct / 100, masaTotal, cfg.cda, cfg.crr);
  const pctUmbral = (w / umbral) * 100;

  const veredicto =
    pctUmbral < 80 ? ['Cómodo. Ritmo de fondo, lo aguantas sin problema.', 'var(--green)']
      : pctUmbral < 95 ? ['Exigente pero sostenible. Este es tu terreno de progreso.', 'var(--amber)']
      : pctUmbral < 108 ? ['Al límite. Solo si el puerto es el objetivo del día.', 'var(--orange)']
      : ['Fuera de alcance hoy. Necesitas más base antes de intentarlo.', 'var(--red)'];

  return (
    <>
      <h2>Tus mejores ascensos</h2>
      <p className="hint">
        Detectados sobre el perfil de las salidas que has abierto. Cuantas más veas en la pestaña
        Entrenamientos, más completa será esta tabla.
      </p>
      {puertos.length === 0 ? (
        <div className="callout">
          Todavía no hay ascensos analizados. Abre alguna salida con desnivel en la pestaña
          <strong> Entrenamientos</strong> y volverán a aparecer aquí.
        </div>
      ) : (
        <div className="scroll">
          <table>
            <thead>
              <tr><th>Ascenso</th><th>Long.</th><th>Desn.</th><th>Pend.</th><th>Máx.</th>
                <th>Tiempo</th><th>VAM</th><th>FC</th><th>W est.</th><th>W/kg</th></tr>
            </thead>
            <tbody>
              {puertos.map((p, i) => {
                const w = vatiosPuerto(p, cfg);
                return (
                  <tr key={i}>
                    <td>Ascenso {i + 1}</td>
                    <td>{num(p.metros / 1000, 2)} km</td>
                    <td>+{num(p.desnivel, 0)} m</td>
                    <td><strong>{num(p.pendiente, 1)} %</strong></td>
                    <td>{num(p.pendienteMax, 1)} %</td>
                    <td>{duracion(p.segundos)}</td>
                    <td>{p.vam ? num(p.vam, 0) : '—'}</td>
                    <td>{p.fcMedia ?? '—'}</td>
                    <td>{num(w, 0)}</td>
                    <td>{num(w / cfg.peso, 2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2>VAM por salida</h2>
      <p className="hint">
        Metros verticales por hora sobre el total de la salida. No es el VAM puro de subida, pero al
        comparar sesiones del mismo tipo muestra la tendencia.
      </p>
      <div className="chart">
        <Barras
          datos={salidas.map((s) => ({ y: vamSalida(s), etiqueta: fechaCorta(s.fecha).slice(0, 6) }))}
          resaltar={(d) => d.y > 200}
        />
      </div>

      <h2>Calculadora de ascensos</h2>
      <p className="hint">Introduce cualquier puerto y te digo el tiempo y la potencia que exige.</p>
      <div className="panel">
        <div className="fields">
          <div><label htmlFor="ck">Longitud (km)</label>
            <input id="ck" type="number" min="0.3" max="30" step="0.1" value={calc.km}
              onChange={(e) => setCalc({ ...calc, km: +e.target.value || 5 })} /></div>
          <div><label htmlFor="cp">Pendiente media (%)</label>
            <input id="cp" type="number" min="1" max="20" step="0.1" value={calc.pct}
              onChange={(e) => setCalc({ ...calc, pct: +e.target.value || 6 })} /></div>
          <div><label htmlFor="cv">Tu VAM objetivo (m/h)</label>
            <input id="cv" type="number" min="200" max="1800" step="5" value={calc.vam}
              onChange={(e) => setCalc({ ...calc, vam: +e.target.value || 550 })} /></div>
        </div>
      </div>
      <div className="grid">
        <Dato k="Desnivel" v={num(desnivel, 0)} u="m" d={`a ${num(calc.pct, 1)} % de media`} />
        <Dato k="Tiempo estimado" v={duracion(seg)} d={`a ${calc.vam} m/h`} />
        <Dato k="Velocidad" v={num(v * 3.6, 1)} u="km/h" d="media de ascenso" />
        <Dato k="Potencia necesaria" v={num(w, 0)} u="W" d={`${num(w / cfg.peso, 2)} W/kg`} />
        <div className="stat" style={{ borderLeft: `3px solid ${veredicto[1]}` }}>
          <div className="k">Exigencia</div>
          <div className="v" style={{ color: veredicto[1] }}>{num(pctUmbral, 0)} <small>% del umbral</small></div>
          <div className="d">{veredicto[0]}</div>
        </div>
      </div>
    </>
  );
}

function CargaTab({ salidas, cfg, umbral, zonas, global: rep }) {
  const serie = useMemo(() => serieCarga(salidas, cfg, umbral), [salidas, cfg, umbral]);
  const ult = serie[serie.length - 1];

  const estado = !ult ? ['—', 'var(--ink2)']
    : ult.forma > 10 ? ['Fresco', 'var(--green)']
    : ult.forma > -10 ? ['Equilibrado', 'var(--blue)']
    : ult.forma > -25 ? ['Cargado', 'var(--amber)']
    : ['Muy cargado', 'var(--red)'];

  return (
    <>
      <h2>Carga, fatiga y forma</h2>
      <p className="hint">
        La <strong>condición</strong> es tu base acumulada a 42 días; la <strong>fatiga</strong>, el
        cansancio de los últimos 7; la <strong>forma</strong>, la diferencia entre ambas.
      </p>
      <div className="chart">
        <Carga serie={serie} />
        <div className="legend">
          <span><i style={{ background: 'var(--blue)' }} />Condición</span>
          <span><i style={{ background: 'var(--red)' }} />Fatiga</span>
          <span><i style={{ background: 'var(--green)' }} />Forma</span>
        </div>
      </div>
      {ult && (
        <div className="grid" style={{ marginTop: 14 }}>
          <Dato k="Condición" v={num(ult.condicion, 0)} d="base aeróbica acumulada" />
          <Dato k="Fatiga" v={num(ult.fatiga, 0)} d="carga de los últimos 7 días" />
          <div className="stat" style={{ borderLeft: `3px solid ${estado[1]}` }}>
            <div className="k">Forma</div>
            <div className="v" style={{ color: estado[1] }}>
              {ult.forma > 0 ? '+' : ''}{num(ult.forma, 0)}
            </div>
            <div className="d">{estado[0]}</div>
          </div>
          <Dato k="Umbral estimado" v={umbral} u="W" d={`${num(umbral / cfg.peso, 2)} W/kg`} />
        </div>
      )}
      <div className="callout">
        <em>Matiz:</em> la serie arranca de cero en tu primera salida registrada, así que las
        primeras semanas de condición están artificialmente bajas. La forma solo es fiable pasados
        un par de meses.
      </div>

      <h2>Reparto de intensidad</h2>
      {!rep || rep.total === 0 ? (
        <div className="callout">
          Abre alguna salida con pulsómetro en <strong>Entrenamientos</strong> para ver aquí el
          reparto por zonas. El desglose completo, con varias vistas, está en la pestaña{' '}
          <strong>Zonas</strong>.
        </div>
      ) : (
        <>
          <p className="hint">
            Acumulado de las {rep.analizadas} salidas analizadas. El modelo polarizado busca en
            torno al 80 % en zona 1–2 y el 20 % en alta intensidad.
          </p>
          <div className="chart">
            <svg viewBox="0 0 1000 60" width="100%">
              {(() => {
                let acc = 0;
                return zonas.map((z, k) => {
                  const w = (rep.porcentaje[k] / 100) * 1000;
                  const x = acc; acc += w;
                  return w > 0 ? (
                    <g key={z.n}>
                      <rect x={x} y="10" width={w} height="34" fill={z.color} />
                      {w > 55 && (
                        <text x={x + w / 2} y="32" textAnchor="middle" fill="#0E1116" fontSize="13"
                          fontWeight="500" fontFamily="ui-monospace,Menlo,monospace">
                          {num(rep.porcentaje[k], 0)} %
                        </text>
                      )}
                    </g>
                  ) : null;
                });
              })()}
            </svg>
            <div className="legend">
              {zonas.map((z) => <span key={z.n}><i style={{ background: z.color }} />Z{z.n} {z.nombre}</span>)}
            </div>
          </div>
          {rep.porcentaje[2] > 25 && (
            <div className="callout warn">
              <strong>Se te está yendo {num(rep.porcentaje[2], 0)} % del tiempo a zona 3.</strong> Es
              el terreno intermedio que cansa como el entrenamiento duro pero no da los beneficios de
              ninguno de los dos. En las salidas de fondo, obligarte a bajar de {zonas[2].desde} ppm
              aunque tengas que poner un desarrollo ridículo en las rampas.
            </div>
          )}
        </>
      )}
    </>
  );
}

function Proyeccion({ salidas, cfg, umbral, masaTotal }) {
  const llanas = salidas.filter(esLlana);
  const wGravel = vatios(30 / 3.6, 0, masaTotal, cfg.cda, cfg.crr);
  const wCarretera = vatios(30 / 3.6, 0, masaTotal, 0.30, 0.005);

  let mensaje;
  if (llanas.length >= 3) {
    const t0 = new Date(llanas[0].fecha).getTime();
    const pts = llanas.map((s) => ({ x: (new Date(s.fecha).getTime() - t0) / 864e5, y: kmh(s) }));
    const n = pts.length;
    const sx = pts.reduce((a, p) => a + p.x, 0), sy = pts.reduce((a, p) => a + p.y, 0);
    const sxy = pts.reduce((a, p) => a + p.x * p.y, 0), sxx = pts.reduce((a, p) => a + p.x * p.x, 0);
    const b = (n * sxy - sx * sy) / (n * sxx - sx * sx || 1);
    const a = (sy - b * sx) / n;
    const dias = b > 0 ? (30 - a) / b : null;
    if (dias && dias > 0 && dias < 3000) {
      const fecha = new Date(t0 + dias * 864e5);
      mensaje = (
        <>
          <strong>Al ritmo actual llegarías a 30 km/h hacia{' '}
            {fecha.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}.</strong>{' '}
          Ahora la parte honesta: esa recta no existe en ciclismo. Los primeros meses siempre suben
          rápido porque partes de cero, y la curva se aplana justo cuando te acercas al objetivo.
          Cuenta con bastante más tiempo del que dice la proyección.
        </>
      );
    } else {
      mensaje = <>Las salidas en llano no muestran todavía una tendencia clara al alza. Necesitas repetir un mismo recorrido llano varias veces para que la comparación signifique algo.</>;
    }
  } else {
    mensaje = <>Aún no hay suficientes salidas en llano puro para trazar una tendencia fiable. Necesitas al menos tres o cuatro, idealmente en el mismo recorrido.</>;
  }

  return (
    <>
      <h2>Tu curva hacia los 30 km/h</h2>
      <div className="chart">
        <Linea puntos={llanas.map((s) => ({ y: kmh(s), etiqueta: fechaCorta(s.fecha) }))}
          objetivo={30} unidad="km/h" minY={10} maxY={32} />
      </div>
      <div className="callout">{mensaje}</div>
      <div className="callout warn">
        <strong>El atajo real está en el material:</strong> los mismos 30 km/h piden {num(wGravel, 0)} W
        con tu configuración actual y {num(wCarretera, 0)} W con una bici de carretera en posición baja.
        Ese cambio te adelanta el objetivo más que un año de entrenamiento.
      </div>

      <h2>Test de FTP: qué esperar</h2>
      <p className="hint">
        Cuando hagas el test de 20 minutos, aquí tienes el rango en el que deberían caer tus números
        según lo que ya has demostrado sobre la bici.
      </p>
      <div className="grid">
        <Dato k="Umbral estimado" v={umbral} u="W" d="desde tus mejores ascensos" />
        <Dato k="Relación peso-potencia" v={num(umbral / cfg.peso, 2)} u="W/kg" />
        <Dato k="Rango esperable" v={`${Math.round(umbral * 0.9)}–${Math.round(umbral * 1.25)}`} u="W"
          d="si tus subidas no fueron a tope" />
        <Dato k="Zona 2 objetivo" v={`${Math.round(umbral * 0.56)}–${Math.round(umbral * 0.75)}`} u="W"
          d={`${Math.round(cfg.fcmax * 0.6)}–${Math.round(cfg.fcmax * 0.7)} ppm`} />
      </div>
      <div className="callout warn">
        <strong>Ojo:</strong> todas las potencias son estimaciones físicas, no medidas. Sirven para
        comparar sesiones entre sí, pero el test de FTP es lo que convertirá estas zonas en algo con lo
        que entrenar de verdad.
      </div>
    </>
  );
}
