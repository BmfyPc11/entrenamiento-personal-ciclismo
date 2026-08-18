'use client';

import { useEffect, useMemo, useState } from 'react';
import PerfilPuerto from './PerfilPuerto';
import {
  agruparAscensiones, distanciaEquivalente, nivelDificultadPuerto,
  vatiosPuerto, num, duracion, fechaCorta, distanciaGeo, categoriaPuerto,
} from '@/lib/metrics';
import { buscarNombre, guardarNombre, RADIO_NOMBRE } from '@/lib/nombres';
import { useCacheNombres, escribirCache } from '@/lib/nombresCache';

export default function Ascensiones({ salidas, cache, excluidas, cfg, zonas, pedirStreams }) {
  const [abierta, setAbierta] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [progreso, setProgreso] = useState({ hechas: 0, total: 0 });
  const [cargando, setCargando] = useState(false);
  const [orden, setOrden] = useState('dificultad');
  const [cacheNombres, setCacheNombres] = useCacheNombres();
  const [editando, setEditando] = useState(null);
  const [borrador, setBorrador] = useState('');

  const grupos = useMemo(
    () => agruparAscensiones(salidas, cache, excluidas),
    [salidas, cache, excluidas]
  );

  const ordenadas = useMemo(() => {
    const g = [...grupos];
    if (orden === 'longitud') g.sort((a, b) => b.metros - a.metros);
    else if (orden === 'desnivel') g.sort((a, b) => b.desnivel - a.desnivel);
    else if (orden === 'pendiente') g.sort((a, b) => b.pendiente - a.pendiente);
    else if (orden === 'veces') g.sort((a, b) => b.veces - a.veces);
    return g;
  }, [grupos, orden]);

  /* Carga en bloque de las salidas que aun no tienen detalle. */
  const sinAnalizar = (salidas || []).filter(
    (s) => !excluidas?.has(s.id) && !cache?.[s.id]
  );

  const analizarTodas = async () => {
    setCargando(true);
    for (const s of sinAnalizar) {
      try { await pedirStreams(s.id); } catch { /* una salida que falle no debe cortar el resto */ }
    }
    setCargando(false);
  };

  /*
    Altitud de la cima del grupo.

    agruparAscensiones guarda las coordenadas de la cima pero no su
    altura, asi que se recupera aqui: cada grupo apunta con streamsId y
    puertoRef a la salida y al puerto de referencia. Sin este dato la
    eleccion de cima pierde su mejor criterio de desempate y se queda en
    "el nodo mas cercano", que es justo lo que da nombres equivocados.
  */
  const altitudCima = (g) => {
    const st = cache?.[g.streamsId];
    const i = g.puertoRef?.fin;
    const a = st?.altitud;
    return a && i != null && a[i] != null ? Math.round(a[i]) : null;
  };

  const sinNombre = grupos.filter(
    (g) => g.cima && buscarNombre(cacheNombres, g.cima) === null
  );

  /*
    Nunca automatico. Overpass es un servicio de voluntarios y en las
    pruebas fallo dos de cada seis consultas: dispararlas solo por entrar
    en la pestana seria abusar, y ademas daria una lista a medias sin que
    se entienda por que.
  */
  const buscarNombres = async () => {
    setBuscando(true);
    setProgreso({ hechas: 0, total: sinNombre.length });

    let nueva = cacheNombres;
    for (let i = 0; i < sinNombre.length; i++) {
      const g = sinNombre[i];
      try {
        const a = altitudCima(g);
        const alt = a != null ? `&alt=${a}` : '';
        const r = await fetch(
          `/api/nombres/cima?lat=${g.cima[0]}&lon=${g.cima[1]}${alt}`,
          { cache: 'no-store' }
        );
        const j = await r.json();
        /* Se guarda tambien cuando no hay nombre: asi no se vuelve a
           preguntar por una cima que OSM no conoce. */
        nueva = guardarNombre(nueva, g.cima, j.nombre || null, 'osm');
      } catch {
        nueva = guardarNombre(nueva, g.cima, null, 'osm');
      }
      setCacheNombres(nueva);
      escribirCache(nueva);
      setProgreso({ hechas: i + 1, total: sinNombre.length });
      await new Promise((r) => setTimeout(r, 1100));
    }
    setBuscando(false);
  };

  const nombreDe = (g, i) =>
    buscarNombre(cacheNombres, g.cima)?.nombre || `Ascenso ${i + 1}`;

  /* Guardar vacio equivale a volver al nombre automatico. */
  const guardarManual = (g) => {
    const limpio = borrador.trim();
    const nueva = limpio
      ? guardarNombre(cacheNombres, g.cima, limpio, 'manual')
      : cacheNombres.filter(
          (e) => !(e.fuente === 'manual' && distanciaGeo([e.lat, e.lon], g.cima) < RADIO_NOMBRE)
        );
    setCacheNombres(nueva);
    escribirCache(nueva);
    setEditando(null);
  };

  return (
    <>
      <h2>Mis ascensiones</h2>
      <p className="hint">
        Todas las subidas que has hecho, agrupadas: si has repetido un puerto aparece una sola vez
        y por dentro guarda todos tus intentos. El orden por defecto usa la distancia equivalente,
        que suma al kilometraje el coste del desnivel y de las rampas.
      </p>

      {sinAnalizar.length > 0 && (
        <div className="callout">
          <strong>{sinAnalizar.length} salidas todavía sin analizar.</strong> Las ascensiones se
          extraen del detalle de cada salida, así que hasta que no se descarguen no aparecen aquí.
          <div style={{ marginTop: 12 }}>
            <button onClick={analizarTodas} disabled={cargando}>
              {cargando ? 'Analizando…' : `Analizar las ${sinAnalizar.length} pendientes`}
            </button>
          </div>
        </div>
      )}

      {sinNombre.length > 0 && (
        <div className="callout">
          <strong>{sinNombre.length} subidas sin nombre.</strong> Se consultan las cimas en
          OpenStreetMap, de una en una y con pausa, porque es un servicio gratuito mantenido
          por voluntarios. Las que no tengan topónimo se quedan como «Ascenso N», y siempre
          puedes ponerles nombre tú pulsando sobre él.
          <div style={{ marginTop: 12 }}>
            <button onClick={buscarNombres} disabled={buscando}>
              {buscando
                ? `Buscando… ${progreso.hechas} de ${progreso.total}`
                : `Buscar los ${sinNombre.length} nombres`}
            </button>
          </div>
        </div>
      )}

      {grupos.length === 0 ? (
        <div className="callout">
          Sin salidas analizadas no hay ascensiones que mostrar.
        </div>
      ) : (
        <>
          <div className="chips" style={{ marginBottom: 14 }}>
            {[['dificultad', 'Dificultad'], ['longitud', 'Longitud'], ['desnivel', 'Desnivel'],
              ['pendiente', 'Pendiente'], ['veces', 'Veces subida']].map(([id, n]) => (
              <button key={id} aria-pressed={orden === id} onClick={() => setOrden(id)}
                style={orden === id ? { background: 'var(--ink)', borderColor: 'var(--ink)' } : null}>
                {n}
              </button>
            ))}
          </div>

          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Ascensión</th><th>Long.</th><th>Desn.</th><th>Pend.</th>
                  <th>Máx.</th><th>Veces</th><th>Mejor tiempo</th><th>Dificultad</th>
                </tr>
              </thead>
              <tbody>
                {ordenadas.map((g, i) => {
                  const niv = nivelDificultadPuerto(g.metros, g.desnivel, g.pendienteMax);
                  return (
                    <tr key={g.id} onClick={() => setAbierta(abierta === g.id ? null : g.id)}
                      style={{ cursor: 'pointer',
                        background: abierta === g.id ? 'var(--card2)' : undefined }}>
                      <td>
                        <span style={{ color: 'var(--ink3)', fontFamily: 'var(--mono)',
                          fontSize: 11, marginRight: 7 }}>
                          {abierta === g.id ? '▾' : '▸'}
                        </span>
                        {editando === g.id ? (
                          <input
                            autoFocus
                            value={borrador}
                            onChange={(e) => setBorrador(e.target.value)}
                            onBlur={() => guardarManual(g)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') guardarManual(g);
                              if (e.key === 'Escape') setEditando(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="Vacío para volver al automático"
                            style={{ width: '100%', maxWidth: 260 }}
                          />
                        ) : (
                          <span
                            onClick={(e) => {
                              /* La fila entera despliega el detalle: sin
                                 esto, editar el nombre lo abriria a la vez. */
                              e.stopPropagation();
                              if (!g.cima) return;
                              setEditando(g.id);
                              setBorrador(buscarNombre(cacheNombres, g.cima)?.nombre || '');
                            }}
                            title={g.cima ? 'Pulsa para renombrar' : 'Sin coordenadas: no se puede nombrar'}
                            style={{ cursor: g.cima ? 'text' : 'default',
                              borderBottom: g.cima ? '1px dotted var(--line2)' : undefined }}>
                            {nombreDe(g, i)}
                          </span>
                        )}
                        {(() => {
                          const c = categoriaPuerto(g.metros, g.pendiente);
                          return (
                            <span title={`Coeficiente ${num(c.coef, 0)}`}
                              style={{ color: c.color, fontFamily: 'var(--mono)',
                                fontSize: 11.5, marginLeft: 7 }}>
                              ({c.nombre})
                            </span>
                          );
                        })()}
                        {g.sinCoordenadas && (
                          <span className="tag" title="Sin coordenadas: agrupada por forma">
                            sin GPS
                          </span>
                        )}
                      </td>
                      <td>{num(g.metros / 1000, 2)} km</td>
                      <td>+{num(g.desnivel, 0)} m</td>
                      <td><strong>{num(g.pendiente, 1)} %</strong></td>
                      <td>{num(g.pendienteMax, 1)} %</td>
                      <td>{g.veces}</td>
                      <td>{g.mejor.segundos ? duracion(g.mejor.segundos) : '—'}</td>
                      <td style={{ color: niv.color }}>{niv.nombre}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="hint" style={{ marginTop: 10 }}>
            Pulsa sobre el nombre de cualquier subida para escribir el tuyo. El que pongas
            manda sobre el automático y se conserva aunque se vuelvan a buscar los nombres.
          </p>

          {abierta && (() => {
            const g = ordenadas.find((x) => x.id === abierta);
            const idx = ordenadas.indexOf(g);
            const st = cache?.[g.streamsId];
            if (!st) return null;
            return (
              <>
                <PerfilPuerto streams={st} puerto={g.puertoRef} indice={idx}
                  cfg={cfg} zonas={zonas} nombre={nombreDe(g, idx)} />

                <h2>Tus marcas en esta subida</h2>
                <p className="hint">
                  {g.veces === 1
                    ? 'La has subido una sola vez, así que todavía no hay con qué comparar.'
                    : `La has subido ${g.veces} veces. Ordenadas de mejor a peor tiempo.`}
                </p>
                <div className="scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Puesto</th><th>Fecha</th><th>Salida</th><th>Tiempo</th>
                        <th>Vel.</th><th>VAM</th><th>FC</th><th>W est.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.intentos.map((it, j) => (
                        <tr key={j} style={j === 0 ? { background: 'var(--card2)' } : null}>
                          <td style={j === 0
                            ? { background: '#E0C020', color: '#0E1116', fontWeight: 600 }
                            : null}>
                            {j + 1}
                          </td>
                          <td>{fechaCorta(it.fecha)}</td>
                          <td>{it.salidaNombre}</td>
                          <td><strong>{it.segundos ? duracion(it.segundos) : '—'}</strong></td>
                          <td>{it.velocidad ? num(it.velocidad, 1) : '—'}</td>
                          <td>{it.vam ? num(it.vam, 0) : '—'}</td>
                          <td>{it.fcMedia ?? '—'}</td>
                          <td>{num(vatiosPuerto(it, cfg), 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}
        </>
      )}
    </>
  );
}
