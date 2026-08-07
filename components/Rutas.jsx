'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Perfil from './Perfil';
import PerfilPuerto from './PerfilPuerto';
import { parseGPX, referenciasCiclista, analizarRuta } from '@/lib/gpx';
import {
  distanciaEquivalente, nivelDificultad, TRAMOS_DUREZA, num, categoriaPuerto,
} from '@/lib/metrics';
import {
  buscarNombre, guardarNombre, leerCache, escribirCache,
} from '@/lib/nombres';

/*
  Traduce el codigo de error del servidor a algo accionable.

  Hasta la v3.3 cualquier fallo aqui decia "No se pudo descargar el
  trazado" y nada mas. Eso escondio durante versiones un 401 constante por
  un token mal leido: el mensaje era el mismo tanto si Strava estaba
  saturada como si el panel mandaba una cabecera rota, y no habia forma de
  distinguirlos sin mirar el codigo.
*/
function motivoGpx(codigo) {
  switch (codigo) {
    case 'sin_sesion':
      return 'Tu sesión de Strava ha caducado. Vuelve a conectar desde arriba.';
    case 'limite_alcanzado':
      return 'Strava ha alcanzado su límite de peticiones (100 cada 15 minutos). Espera un cuarto de hora y vuelve a intentarlo.';
    case 'gpx_vacio':
      return 'Strava devolvió un trazado vacío para esta ruta. Suele pasar con rutas creadas a mano sin datos de altitud.';
    case 'strava_404':
      return 'Strava ya no encuentra esta ruta. ¿La has borrado o hecho privada?';
    case 'strava_401':
    case 'strava_403':
      return 'Strava ha rechazado el permiso para leer esta ruta. Sal y vuelve a conectar la cuenta.';
    default:
      return `No se pudo descargar el trazado${codigo ? ` (${codigo})` : ''}.`;
  }
}

export default function Rutas({ salidas, cache, excluidas, cfg, zonas }) {
  const [rutas, setRutas] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);

  const [abierta, setAbierta] = useState(null);
  const [detalle, setDetalle] = useState({});   // id → datos del GPX ya parseado
  const [cargandoGpx, setCargandoGpx] = useState(false);

  const [orden, setOrden] = useState('dificultad');
  const [filtros, setFiltros] = useState(false);
  const [kmMin, setKmMin] = useState('');
  const [kmMax, setKmMax] = useState('');
  const [dMin, setDMin] = useState('');
  const [dMax, setDMax] = useState('');

  const ref = useMemo(
    () => referenciasCiclista(salidas, cache, excluidas),
    [salidas, cache, excluidas]
  );

  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try {
      const r = await fetch('/api/rutas', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error === 'sin_permiso_rutas' ? 'permiso' : 'Strava no devolvió tus rutas.');
        setRutas([]);
      } else {
        /* Solo rutas de bici: las de correr no pintan nada en este panel. */
        setRutas(j.rutas.filter((x) => x.tipo === 'ride'));
      }
    } catch {
      setError('No se ha podido conectar.');
      setRutas([]);
    }
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const abrir = async (r) => {
    if (abierta === r.id) { setAbierta(null); return; }
    setAbierta(r.id);
    if (detalle[r.id]) return;
    setCargandoGpx(true);
    try {
      const res = await fetch(`/api/rutas/gpx?id=${r.id}`, { cache: 'no-store' });
      const j = await res.json();
      if (j.gpx) setDetalle((d) => ({ ...d, [r.id]: parseGPX(j.gpx) }));
      else setDetalle((d) => ({ ...d, [r.id]: { error: motivoGpx(j.error) } }));
    } catch (e) {
      setDetalle((d) => ({ ...d, [r.id]: { error: e.message || 'Error al leer el trazado.' } }));
    }
    setCargandoGpx(false);
  };

  const lista = useMemo(() => {
    if (!rutas) return [];
    const num_ = (v) => (v === '' ? null : +v);
    const a = num_(kmMin), b = num_(kmMax), c = num_(dMin), d = num_(dMax);

    return rutas
      .map((r) => {
        const km = r.metros / 1000;
        return { ...r, km, eq: distanciaEquivalente(km, r.desnivel),
          niv: nivelDificultad(km, r.desnivel) };
      })
      .filter((r) =>
        (a === null || r.km >= a) && (b === null || r.km <= b) &&
        (c === null || r.desnivel >= c) && (d === null || r.desnivel <= d))
      .sort((x, y) => {
        if (orden === 'distancia') return y.km - x.km;
        if (orden === 'desnivel') return y.desnivel - x.desnivel;
        if (orden === 'nombre') return x.nombre.localeCompare(y.nombre);
        return y.eq - x.eq;
      });
  }, [rutas, orden, kmMin, kmMax, dMin, dMax]);

  return (
    <>
      <h2>Tus rutas guardadas</h2>
      <p className="hint">
        Las rutas que tienes creadas o guardadas en Strava. Pulsa cualquiera para ver su perfil y
        el análisis de si está a tu alcance ahora mismo.
      </p>

      {error === 'permiso' ? (
        <div className="callout warn">
          <strong>Falta el permiso de lectura de rutas.</strong> Tu cuenta se conectó antes de que
          el panel pidiera acceso a las rutas guardadas. Sal y vuelve a conectar con Strava: en la
          pantalla de autorización aparecerá el permiso nuevo y ya podrás verlas aquí.
        </div>
      ) : error ? (
        <div className="callout warn">{error}</div>
      ) : null}

      {cargando && <p className="hint">Cargando tus rutas de Strava…</p>}

      {rutas && rutas.length === 0 && !error && (
        <div className="callout">
          No tienes ninguna ruta de bici guardada en Strava. Las que crees allí aparecerán aquí
          automáticamente.
        </div>
      )}

      {rutas && rutas.length > 0 && (
        <>
          <div className="chips" style={{ marginBottom: 6 }}>
            {[['dificultad', 'Dificultad'], ['distancia', 'Distancia'],
              ['desnivel', 'Desnivel'], ['nombre', 'Nombre']].map(([id, n]) => (
              <button key={id} aria-pressed={orden === id} onClick={() => setOrden(id)}
                style={orden === id ? { background: 'var(--ink)', borderColor: 'var(--ink)' } : null}>
                {n}
              </button>
            ))}
            <button onClick={() => setFiltros(!filtros)}
              style={filtros ? { background: 'var(--ink2)', borderColor: 'var(--ink2)' } : null}>
              {filtros ? 'Ocultar filtros' : 'Filtrar'}
            </button>
          </div>

          {filtros && (
            <div className="panel" style={{ marginBottom: 14 }}>
              <div className="fields">
                <div>
                  <label htmlFor="f1">Distancia mínima (km)</label>
                  <input id="f1" type="number" min="0" step="5" value={kmMin}
                    placeholder="sin límite" onChange={(e) => setKmMin(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="f2">Distancia máxima (km)</label>
                  <input id="f2" type="number" min="0" step="5" value={kmMax}
                    placeholder="sin límite" onChange={(e) => setKmMax(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="f3">Desnivel mínimo (m)</label>
                  <input id="f3" type="number" min="0" step="50" value={dMin}
                    placeholder="sin límite" onChange={(e) => setDMin(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="f4">Desnivel máximo (m)</label>
                  <input id="f4" type="number" min="0" step="50" value={dMax}
                    placeholder="sin límite" onChange={(e) => setDMax(e.target.value)} />
                </div>
              </div>
              <div className="chips" style={{ marginTop: 14 }}>
                <button onClick={() => { setKmMin(''); setKmMax(''); setDMin(''); setDMax(''); }}>
                  Quitar filtros
                </button>
              </div>
            </div>
          )}

          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Ruta</th><th>Dist.</th><th>Desn.</th><th>m/km</th>
                  <th>Km equiv.</th><th>Dificultad</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((r) => (
                  <tr key={r.id} onClick={() => abrir(r)}
                    style={{ cursor: 'pointer',
                      background: abierta === r.id ? 'var(--card2)' : undefined }}>
                    <td>
                      <span style={{ color: 'var(--ink3)', fontFamily: 'var(--mono)',
                        fontSize: 11, marginRight: 7 }}>
                        {abierta === r.id ? '▾' : '▸'}
                      </span>
                      {r.nombre}
                    </td>
                    <td>{num(r.km, 1)}</td>
                    <td>+{num(r.desnivel, 0)}</td>
                    <td>{num(r.desnivel / r.km, 1)}</td>
                    <td>{num(r.eq, 1)}</td>
                    <td style={{ color: r.niv.color }}>{r.niv.nombre}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="hint" style={{ marginTop: 10 }}>
            Los kilómetros equivalentes suman al recorrido el coste del desnivel: cada 100 m de
            subida cuentan como un kilómetro más, con un recargo cuando ese desnivel va muy
            concentrado. Por eso una llana larga puede pesar más que una corta con una subida.
          </p>

          {abierta && <DetalleRuta ruta={lista.find((x) => x.id === abierta)}
            datos={detalle[abierta]} cargando={cargandoGpx}
            ref_={ref} cfg={cfg} zonas={zonas} />}
        </>
      )}
    </>
  );
}

/* Perfil, veredicto y consejos de una ruta concreta. */
function DetalleRuta({ ruta, datos, cargando, ref_, cfg, zonas }) {
  const [modo, setModo] = useState('relieve');
  const [durezaFoco, setDurezaFoco] = useState(null);
  const [mono, setMono] = useState(false);
  const [puerto, setPuerto] = useState(null);

  const an = useMemo(
    () => (datos && !datos.error ? analizarRuta(datos, ref_, cfg) : null),
    [datos, ref_, cfg]
  );

  const [cacheNombres, setCacheNombres] = useState(() => leerCache());

  /*
    Una ruta guardada no se ha rodado, asi que no hay segmentos de
    Strava que consultar: aqui la unica fuente posible es la cima de
    OSM. Se piden solo las de la ruta abierta y de una en una, que
    Overpass lo mantienen voluntarios.
  */
  useEffect(() => {
    if (!an?.puertos?.length || !datos?.puntos) return;
    let cancelado = false;

    (async () => {
      let nueva = cacheNombres;
      for (const p of an.puertos) {
        if (cancelado) break;
        const pt = datos.puntos[p.fin];
        if (!pt) continue;
        const cima = [pt.lat, pt.lon];
        if (buscarNombre(nueva, cima)) continue;
        try {
          const r = await fetch(
            `/api/nombres/cima?lat=${pt.lat}&lon=${pt.lon}&alt=${Math.round(pt.ele)}`,
            { cache: 'no-store' });
          const j = await r.json();
          nueva = guardarNombre(nueva, cima, j.nombre || null, 'osm');
        } catch {
          nueva = guardarNombre(nueva, cima, null, 'osm');
        }
        if (!cancelado) { setCacheNombres(nueva); escribirCache(nueva); }
        await new Promise((r) => setTimeout(r, 1100));
      }
    })();

    return () => { cancelado = true; };
  }, [an, datos, cacheNombres]);

  const nombrePuerto = (p, i) => {
    const pt = datos?.puntos?.[p.fin];
    const n = pt ? buscarNombre(cacheNombres, [pt.lat, pt.lon])?.nombre : null;
    return n || `Subida ${i + 1}`;
  };

  if (cargando && !datos) return <p className="hint">Descargando el trazado de la ruta…</p>;
  if (!datos) return null;
  if (datos.error) {
    return (
      <div className="callout warn">
        <strong>No se ha podido montar el perfil de esta ruta.</strong> {datos.error}
        {' '}Si el problema persiste con varias rutas, es más probable que sea un fallo del panel
        que del archivo en sí — dímelo y lo reviso.
      </div>
    );
  }
  if (!an) return null;

  return (
    <>
      {ruta && (
        <>
          <h2 style={{ marginBottom: 2 }}>{ruta.nombre}</h2>
          <p className="hint" style={{ marginBottom: 18 }}>
            Ruta guardada en Strava · {ruta.niv.nombre.toLowerCase()}
          </p>

          <div className="grid">
            <Dato k="Distancia" v={num(ruta.km, 1)} u="km" />
            <Dato k="Desnivel" v={`+${num(ruta.desnivel, 0)}`} u="m"
              d={`${num(ruta.desnivel / ruta.km, 1)} m por km`} />
            <Dato k="Km equivalentes" v={num(ruta.eq, 1)} u="km"
              d="desnivel convertido a distancia" />
            <Dato k="Dificultad" v={ruta.niv.nombre} />
          </div>
        </>
      )}

      <h2>Perfil de la ruta</h2>
      <div className="panel">
        <Perfil streams={datos.streams} zonas={zonas} modo={modo}
          puertos={an.puertos} nombres={an.puertos.map(nombrePuerto)}
          durezaFoco={durezaFoco} mono={mono} altura={330} />

        <div className="chips" style={{ marginTop: 14 }}>
          <button aria-pressed={modo === 'relieve'}
            onClick={() => { setModo('relieve'); setDurezaFoco(null); }}
            style={modo === 'relieve' ? { background: 'var(--ink)', borderColor: 'var(--ink)' } : null}>
            Información
          </button>
          <button aria-pressed={modo === 'dureza'} onClick={() => setModo('dureza')}
            style={modo === 'dureza' ? { background: 'var(--ink)', borderColor: 'var(--ink)' } : null}>
            Perfil y dureza
          </button>
        </div>

        {modo === 'dureza' && an.dureza && (
          <>
            <div className="chips" style={{ marginTop: 8 }}>
              <button aria-pressed={durezaFoco === null} onClick={() => setDurezaFoco(null)}
                style={durezaFoco === null ? { background: 'var(--ink2)', borderColor: 'var(--ink2)' } : null}>
                Todo
              </button>
              {TRAMOS_DUREZA.map((t, i) =>
                an.dureza.porcentaje[i] > 0.4 ? (
                  <button key={t.n} aria-pressed={durezaFoco === t.n}
                    onClick={() => setDurezaFoco(durezaFoco === t.n ? null : t.n)}
                    style={durezaFoco === t.n
                      ? { background: t.color, borderColor: t.color,
                          color: t.n === 6 ? '#E8EAED' : '#0E1116' }
                      : null}>
                    <i style={{ background: t.color }} />{t.nombre} · {num(an.dureza.porcentaje[i], 0)} %
                  </button>
                ) : null
              )}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 14,
              fontSize: 13.5, color: 'var(--ink2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={mono} onChange={(e) => setMono(e.target.checked)} />
              Ver el perfil en un solo color
            </label>
          </>
        )}
      </div>

      <h2>¿Está a tu alcance?</h2>
      <div className={`consejo ${an.nivel}`}>
        <p className="tit">{an.titulo}</p>
        <p>{an.texto}</p>
      </div>

      {an.rel.length > 0 && (
        <div className="scroll" style={{ marginTop: 14 }}>
          <table>
            <thead>
              <tr><th>Exigencia</th><th>Esta ruta</th><th>Tu mejor registro</th><th>Relación</th></tr>
            </thead>
            <tbody>
              {an.rel.map((r, i) => (
                <tr key={i}>
                  <td>{r.k}</td><td>{r.ruta}</td><td>{r.tuyo}</td>
                  <td style={r.r === an.peor
                    ? { background: '#E0C020', color: '#0E1116', fontWeight: 600 } : null}>
                    ×{num(r.r, 2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {an.puertos.length > 0 && (
        <>
          <h2>Las subidas, una a una</h2>
          <div className="scroll">
            <table>
              <thead>
                <tr><th>Subida</th><th>Km</th><th>Long.</th><th>Desn.</th><th>Pend.</th><th>Máx.</th></tr>
              </thead>
              <tbody>
                {an.puertos.map((p, i) => (
                  <tr key={i} onClick={() => setPuerto(puerto === i ? null : i)}
                    style={{ cursor: 'pointer',
                      background: puerto === i ? 'var(--card2)' : undefined }}>
                    <td>
                      <span style={{ color: 'var(--ink3)', fontFamily: 'var(--mono)',
                        fontSize: 11, marginRight: 7 }}>
                        {puerto === i ? '▾' : '▸'}
                      </span>
                      {nombrePuerto(p, i)}
                      {(() => {
                        const c = categoriaPuerto(p.metros, p.pendiente);
                        return (
                          <span title={`Coeficiente ${num(c.coef, 0)}`}
                            style={{ color: c.color, fontFamily: 'var(--mono)',
                              fontSize: 11.5, marginLeft: 7 }}>
                            ({c.nombre})
                          </span>
                        );
                      })()}
                    </td>
                    <td>{num(p.kmInicio, 1)}–{num(p.kmFin, 1)}</td>
                    <td>{num(p.metros / 1000, 2)} km</td>
                    <td>+{num(p.desnivel, 0)} m</td>
                    <td><strong>{num(p.pendiente, 1)} %</strong></td>
                    <td>{num(p.pendienteMax, 1)} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {puerto !== null && an.puertos[puerto] && (
            <PerfilPuerto streams={datos.streams} puerto={an.puertos[puerto]}
              indice={puerto} cfg={cfg} zonas={zonas}
              nombre={nombrePuerto(an.puertos[puerto], puerto)} />
          )}
        </>
      )}

      {an.avisos.length > 0 && (
        <>
          <h2>A tener en cuenta</h2>
          <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--ink2)',
            fontSize: 14.5, lineHeight: 1.7 }}>
            {an.avisos.map((a, i) => <li key={i} style={{ marginBottom: 9 }}>{a}</li>)}
          </ul>
        </>
      )}

      <h2>Cómo afrontarla</h2>
      <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--ink2)',
        fontSize: 14.5, lineHeight: 1.7 }}>
        {an.consejos.map((c, i) => <li key={i} style={{ marginBottom: 9 }}>{c}</li>)}
      </ul>
    </>
  );
}

function Dato({ k, v, u, d }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className="v">{v} {u && <small>{u}</small>}</div>
      {d && <div className="d">{d}</div>}
    </div>
  );
}
