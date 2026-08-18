'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import PerfilPuerto from './PerfilPuerto';
import { ThOrden, ordenarPor } from './Tablas';
import {
  agruparAscensiones, distanciaEquivalente,
  vatiosPuerto, num, duracion, fechaCorta, distanciaGeo, categoriaPuerto,
  indicePuerto,
} from '@/lib/metrics';
import { buscarNombre, guardarNombre, RADIO_NOMBRE } from '@/lib/nombres';
import { useCacheNombres, escribirCache } from '@/lib/nombresCache';

export default function Ascensiones({ salidas, cache, excluidas, cfg, zonas, pedirStreams }) {
  const [abierta, setAbierta] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [progreso, setProgreso] = useState({ hechas: 0, total: 0 });
  const [cargando, setCargando] = useState(false);
  const [orden, setOrden] = useState({ campo: 'dificultad', desc: true });
  const [cacheNombres, setCacheNombres] = useCacheNombres();
  const [editando, setEditando] = useState(null);
  const [borrador, setBorrador] = useState('');

  const grupos = useMemo(
    () => agruparAscensiones(salidas, cache, excluidas),
    [salidas, cache, excluidas]
  );

  /* El numero de las que no tienen toponimo se fija sobre el orden por
     defecto (dificultad) y no cambia al reordenar la tabla: si se
     contara sobre lo que hay en pantalla, "Ascenso 6" pasaria a ser
     "Ascenso 3" en cuanto ordenases por longitud y ningun numero
     significaria nada. */
  const numeros = useMemo(() => {
    const m = new Map();
    [...grupos]
      .sort((a, b) => indicePuerto(b.metros, b.desnivel, b.pendienteMax)
        - indicePuerto(a.metros, a.desnivel, a.pendienteMax))
      .forEach((g, i) => m.set(g.id, i + 1));
    return m;
  }, [grupos]);

  const nombreDe = (g) =>
    buscarNombre(cacheNombres, g.cima)?.nombre || `Ascenso ${numeros.get(g.id)}`;

  /*
    Criterios de cada columna. El nombre depende del cache de nombres, no
    solo del grupo, asi que la lista se reconstruye tambien cuando ese
    cache cambia.
  */
  const criterios = useMemo(() => ({
    /* Ahora que "Dificultad" es su propia columna con el coeficiente,
       "Nombre" vuelve a ordenar alfabeticamente: cada cabecera ordena por
       lo que dice en su rotulo. */
    nombre: (g) => nombreDe(g).toLowerCase(),
    longitud: (g) => g.metros,
    desnivel: (g) => g.desnivel,
    pendiente: (g) => g.pendiente,
    veces: (g) => g.veces,
    mejor: (g) => g.mejor?.segundos,
    /* El mismo coeficiente que decide la categoria del puerto
       (distancia x %medio^2), no la escala Suave..Muy dura de antes. */
    dificultad: (g) => categoriaPuerto(g.metros, g.pendiente).coef,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [grupos, cacheNombres]);

  const ordenadas = useMemo(
    () => ordenarPor(grupos, criterios, orden.campo, orden.desc),
    [grupos, criterios, orden]
  );

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

  /* La fila desplegable de una ascension: su perfil y la tabla de
     intentos. Devuelve null cuando la salida de referencia todavia no
     tiene las series descargadas. */
  const detalle = (g, i) => {
    const st = cache?.[g.streamsId];
    if (!st) return null;
    return (
      <tr className="fila-detalle">
        <td colSpan={7}>
          <PerfilPuerto streams={st} puerto={g.puertoRef} indice={i}
            cfg={cfg} zonas={zonas} nombre={nombreDe(g)} />

          <p className="hint" style={{ margin: '18px 0 8px' }}>
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
        </td>
      </tr>
    );
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
          <div className="cab-tabla">
            <span className="rotulo">Ascensiones</span>
            <span className="hint" style={{ margin: 0 }}>
              Pulsa una fila para ver su perfil detallado
            </span>
          </div>

          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <ThOrden campo="nombre" orden={orden} setOrden={setOrden}
                    className="col-nombre">Nombre</ThOrden>
                  <ThOrden campo="longitud" orden={orden} setOrden={setOrden}>Km</ThOrden>
                  <ThOrden campo="pendiente" orden={orden} setOrden={setOrden}>% Med</ThOrden>
                  <ThOrden campo="desnivel" orden={orden} setOrden={setOrden}>Desnivel</ThOrden>
                  <ThOrden campo="dificultad" orden={orden} setOrden={setOrden}>Dificultad</ThOrden>
                  <ThOrden campo="veces" orden={orden} setOrden={setOrden}>Veces</ThOrden>
                  <ThOrden campo="mejor" orden={orden} setOrden={setOrden}>Mejor tiempo</ThOrden>
                </tr>
              </thead>
              <tbody>
                {ordenadas.map((g, i) => {
                  const c = categoriaPuerto(g.metros, g.pendiente);
                  const abiertaEsta = abierta === g.id;
                  return (
                    <Fragment key={g.id}>
                    <tr onClick={() => setAbierta(abiertaEsta ? null : g.id)}
                      style={{ cursor: 'pointer',
                        background: abiertaEsta ? 'var(--card2)' : undefined }}>
                      <td className="col-nombre">
                        <span className="fila-puerto">
                        <span className="flecha">{abiertaEsta ? '▾' : '▸'}</span>
                        <span className="cat" title={`Coeficiente ${num(c.coef, 0)}`}
                          style={{ background: c.color,
                            color: c.codigo === 'hc' ? '#FFFFFF' : '#0A0C0F' }}>
                          {c.nombre}
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
                            {nombreDe(g)}
                          </span>
                        )}
                        {g.sinCoordenadas && (
                          <span className="tag" title="Sin coordenadas: agrupada por forma">
                            sin GPS
                          </span>
                        )}
                        </span>
                      </td>
                      <td>{num(g.metros / 1000, 2)} km</td>
                      <td><strong>{num(g.pendiente, 1)} %</strong></td>
                      <td>+{num(g.desnivel, 0)} m</td>
                      <td style={{ color: c.color, fontFamily: 'var(--mono)' }}
                        title="Distancia (km) × %medio²">
                        {num(c.coef, 0)}
                      </td>
                      <td>{g.veces}</td>
                      <td>{g.mejor.segundos ? duracion(g.mejor.segundos) : '—'}</td>
                    </tr>

                    {/*
                      El detalle se despliega dentro de la tabla, en una
                      fila propia justo debajo de la suya, igual que los
                      puertos de Actividades. Colgado del final del bloque,
                      con veinte ascensiones pulsabas la primera y el
                      perfil aparecia a media pantalla de distancia.
                    */}
                    {abiertaEsta && detalle(g, i)}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="hint" style={{ marginTop: 10 }}>
            Pulsa sobre el nombre de cualquier subida para escribir el tuyo. El que pongas
            manda sobre el automático y se conserva aunque se vuelvan a buscar los nombres.
          </p>
        </>
      )}
    </>
  );
}
