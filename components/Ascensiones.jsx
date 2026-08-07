'use client';

import { useEffect, useMemo, useState } from 'react';
import PerfilPuerto from './PerfilPuerto';
import {
  agruparAscensiones, distanciaEquivalente, nivelDificultadPuerto,
  vatiosPuerto, num, duracion, fechaCorta,
} from '@/lib/metrics';

/*
  Consulta a Nominatim (OpenStreetMap) el nombre del lugar donde corona
  cada ascension.

  Se hace de una en una y con pausa de un segundo porque es la condicion
  de uso del servicio publico. Con pocas ascensiones el retardo es
  imperceptible; si algun dia son decenas, conviene revisar esto.
*/
async function nombrarCima(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
    `&lat=${lat}&lon=${lon}&zoom=15&addressdetails=1&accept-language=ca,es`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('nominatim');
  const j = await r.json();
  const a = j.address || {};

  /*
    Se prefieren los topónimos de relieve y lugar sobre el nombre de la
    calle: "Sant Pere Màrtir" dice mucho más que "Carretera de Vallvidrera".
    Si solo hay via, se descarta y se deja el nombre generico, porque un
    nombre de calle como titulo de una ascension confunde mas que ayuda.
  */
  return a.peak || a.natural || a.hamlet || a.isolated_dwelling ||
    a.neighbourhood || a.suburb || a.village || a.town || a.city_district ||
    a.municipality || null;
}

export default function Ascensiones({ salidas, cache, excluidas, cfg, zonas, pedirStreams }) {
  const [abierta, setAbierta] = useState(null);
  const [nombres, setNombres] = useState({});
  const [buscando, setBuscando] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [orden, setOrden] = useState('dificultad');

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

  /* Nombres reales de las cimas, uno por segundo. */
  useEffect(() => {
    const pendientes = grupos.filter((g) => g.cima && nombres[g.id] === undefined);
    if (!pendientes.length || buscando) return;

    let cancelado = false;
    (async () => {
      setBuscando(true);
      for (const g of pendientes) {
        if (cancelado) break;
        try {
          const n = await nombrarCima(g.cima[0], g.cima[1]);
          if (!cancelado) setNombres((v) => ({ ...v, [g.id]: n || null }));
        } catch {
          if (!cancelado) setNombres((v) => ({ ...v, [g.id]: null }));
        }
        await new Promise((r) => setTimeout(r, 1100));
      }
      if (!cancelado) setBuscando(false);
    })();

    return () => { cancelado = true; };
  }, [grupos, nombres, buscando]);

  const nombreDe = (g, i) => nombres[g.id] || `Ascenso ${i + 1}`;

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
                        {nombreDe(g, i)}
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

          {buscando && (
            <p className="hint" style={{ marginTop: 10 }}>
              Identificando los nombres de las cimas en OpenStreetMap, de una en una para respetar
              su límite de uso. Las que no tengan topónimo se quedan como «Ascenso N».
            </p>
          )}

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
