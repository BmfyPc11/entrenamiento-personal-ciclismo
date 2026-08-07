'use client';

import { useEffect, useMemo, useState } from 'react';
import Perfil from './Perfil';
import PerfilPuerto from './PerfilPuerto';
import { parseGPX, referenciasCiclista, analizarRuta } from '@/lib/gpx';
import { TRAMOS_DUREZA, num, categoriaPuerto } from '@/lib/metrics';
import {
  buscarNombre, guardarNombre, leerCache, escribirCache,
} from '@/lib/nombres';

export default function AnalizadorGPX({ salidas, cache, excluidas, cfg, zonas }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [archivo, setArchivo] = useState(null);
  const [modo, setModo] = useState('dureza');
  const [durezaFoco, setDurezaFoco] = useState(null);
  const [mono, setMono] = useState(false);
  const [abierto, setAbierto] = useState(null);
  const [arrastra, setArrastra] = useState(false);

  const ref = useMemo(
    () => referenciasCiclista(salidas, cache, excluidas),
    [salidas, cache, excluidas]
  );
  const an = useMemo(
    () => (datos ? analizarRuta(datos, ref, cfg) : null),
    [datos, ref, cfg]
  );

  const [cacheNombres, setCacheNombres] = useState(() => leerCache());

  /*
    Un GPX subido no se ha rodado con Strava, asi que no hay segmentos
    que consultar: la unica fuente es la cima de OSM. De una en una y
    con pausa, porque Overpass lo mantienen voluntarios.
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

  const leer = (file) => {
    if (!file) return;
    setError(null);
    if (!/\.gpx$/i.test(file.name)) {
      setError('Ese archivo no es un GPX. Exporta la ruta en formato GPX desde Strava, Komoot o Wahoo.');
      return;
    }
    const r = new FileReader();
    r.onload = () => {
      try {
        setDatos(parseGPX(r.result));
        setArchivo(file.name);
        setAbierto(null);
      } catch (e) {
        setDatos(null);
        setError(e.message || 'No se ha podido leer el archivo.');
      }
    };
    r.onerror = () => setError('No se ha podido abrir el archivo.');
    r.readAsText(file);
  };

  return (
    <>
      <h2>Analiza una ruta antes de hacerla</h2>
      <p className="hint">
        Sube el GPX de una ruta que estés valorando y te digo qué te vas a encontrar y si está a
        tu alcance ahora mismo, comparándola con lo que ya has hecho. El archivo se lee en tu
        navegador: no se sube a ningún sitio.
      </p>

      <div
        onDragOver={(e) => { e.preventDefault(); setArrastra(true); }}
        onDragLeave={() => setArrastra(false)}
        onDrop={(e) => { e.preventDefault(); setArrastra(false); leer(e.dataTransfer.files[0]); }}
        style={{
          border: `1.5px dashed ${arrastra ? 'var(--acc)' : 'var(--line2)'}`,
          borderRadius: 12, padding: '30px 20px', textAlign: 'center',
          background: arrastra ? 'var(--card2)' : 'var(--card)',
          transition: 'border-color .15s, background .15s',
        }}>
        <p style={{ margin: '0 0 14px', color: 'var(--ink2)', fontSize: 14.5 }}>
          {archivo
            ? <>Analizando <b style={{ color: 'var(--ink)' }}>{archivo}</b></>
            : 'Arrastra aquí un archivo .gpx o selecciónalo'}
        </p>
        <label className="btn-file">
          <input type="file" accept=".gpx,application/gpx+xml"
            onChange={(e) => leer(e.target.files[0])}
            style={{ display: 'none' }} />
          <span>{archivo ? 'Cambiar archivo' : 'Elegir archivo'}</span>
        </label>
      </div>

      {error && <div className="callout warn">{error}</div>}

      {!ref.nSalidas && !error && (
        <div className="callout">
          Sin salidas cargadas puedo describir la ruta, pero no compararla contigo.
        </div>
      )}

      {datos && an && (
        <>
          <h2>{datos.nombre}</h2>
          <div className="grid">
            <Dato k="Distancia" v={num(an.kmR, 1)} u="km" />
            <Dato k="Desnivel positivo" v={num(datos.desnivel, 0)} u="m" />
            <Dato k="Desnivel por km" v={num(an.mkm, 1)} u="m/km"
              d={an.mkm > 15 ? 'montaña' : an.mkm > 8 ? 'mixto' : 'llano'} />
            <Dato k="Altitud máxima" v={num(datos.altMax, 0)} u="m" />
            <Dato k="Subidas detectadas" v={an.puertos.length}
              d={an.mayor ? `la mayor, +${num(an.mayor.desnivel, 0)} m` : 'sin ascensos relevantes'} />
            <Dato k="Rampa más dura" v={an.mayor ? num(an.mayor.pendienteMax, 1) : '—'} u="%"
              d="sostenida 200 m" />
          </div>

          {/* ---------- veredicto ---------- */}
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
                      <td>{r.k}</td>
                      <td>{r.ruta}</td>
                      <td>{r.tuyo}</td>
                      <td style={r.r === an.peor
                        ? { background: '#E0C020', color: '#0E1116', fontWeight: 600 }
                        : null}>
                        ×{num(r.r, 2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="hint">
            La relación compara cada exigencia con tu mejor marca. Se resalta la más comprometida,
            que es la que manda: una ruta se hace dura por su punto más exigente, no por su media.
          </p>

          {/* ---------- perfil ---------- */}
          <h2>Perfil de la ruta</h2>
          <div className="panel">
            <Perfil streams={datos.streams} zonas={zonas} modo={modo}
              puertos={an.puertos} nombres={an.puertos.map(nombrePuerto)}
              durezaFoco={durezaFoco} mono={mono} altura={340} />

            <div className="chips" style={{ marginTop: 14 }}>
              <button aria-pressed={modo === 'relieve'}
                onClick={() => { setModo('relieve'); setDurezaFoco(null); }}
                style={modo === 'relieve' ? { background: 'var(--ink)', borderColor: 'var(--ink)' } : null}>
                Información
              </button>
              <button aria-pressed={modo === 'dureza'}
                onClick={() => setModo('dureza')}
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
                  fontFamily: 'var(--sans)', fontSize: 13.5, color: 'var(--ink2)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={mono} onChange={(e) => setMono(e.target.checked)} />
                  Ver el perfil en un solo color
                </label>
              </>
            )}
          </div>

          {/* ---------- puertos ---------- */}
          {an.puertos.length > 0 && (
            <>
              <h2>Las subidas, una a una</h2>
              <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Subida</th><th>Km</th><th>Long.</th><th>Desn.</th>
                      <th>Pend.</th><th>Máx.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {an.puertos.map((p, i) => (
                      <tr key={i} onClick={() => setAbierto(abierto === i ? null : i)}
                        style={{ cursor: 'pointer',
                          background: abierto === i ? 'var(--card2)' : undefined }}>
                        <td>
                          <span style={{ color: 'var(--ink3)', fontFamily: 'var(--mono)',
                            fontSize: 11, marginRight: 7 }}>
                            {abierto === i ? '▾' : '▸'}
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
              <p className="hint" style={{ marginTop: 10 }}>
                Pulsa cualquier subida para desplegar su perfil detallado.
              </p>
              {abierto !== null && an.puertos[abierto] && (
                <PerfilPuerto streams={datos.streams} puerto={an.puertos[abierto]}
                  indice={abierto} cfg={cfg} zonas={zonas}
                  nombre={nombrePuerto(an.puertos[abierto], abierto)} />
              )}
            </>
          )}

          {/* ---------- avisos y consejos ---------- */}
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
      )}
    </>
  );
}

function Dato({ k, v, u, d }) {
  return (
    <div className="dato">
      <span className="k">{k}</span>
      <span className="v">{v}{u && <em>{u}</em>}</span>
      {d && <span className="d">{d}</span>}
    </div>
  );
}
