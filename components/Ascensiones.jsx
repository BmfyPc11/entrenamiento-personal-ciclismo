'use client';

import { Fragment, useMemo, useState } from 'react';
import PerfilPuerto from './PerfilPuerto';
import { recogerSegmentosManuales, vatiosPuerto, num, duracion, fechaCorta, categoriaPuerto } from '@/lib/metrics';
import { useSegmentosManuales, guardarSegmentosManuales } from '@/lib/segmentosManualesCache';

export default function Ascensiones({ salidas, cache, excluidas, cfg, zonas, pedirStreams }) {
  const [cargando, setCargando] = useState(false);
  const [definicionesSegmentos, setDefinicionesSegmentos] = useSegmentosManuales();
  const [abiertoSegmento, setAbiertoSegmento] = useState(null);
  const [editandoSegmento, setEditandoSegmento] = useState(null);
  const [borradorSegmento, setBorradorSegmento] = useState('');

  const gruposSegmentos = useMemo(
    () => recogerSegmentosManuales(salidas, cache, excluidas, definicionesSegmentos),
    [salidas, cache, excluidas, definicionesSegmentos]
  );

  const renombrarSegmento = (id, nombre) => {
    const actualizadas = definicionesSegmentos.map((d) => (d.id === id ? { ...d, nombre } : d));
    setDefinicionesSegmentos(actualizadas);
    guardarSegmentosManuales(actualizadas);
    setEditandoSegmento(null);
  };

  const borrarSegmento = (id) => {
    const actualizadas = definicionesSegmentos.filter((d) => d.id !== id);
    setDefinicionesSegmentos(actualizadas);
    guardarSegmentosManuales(actualizadas);
    if (abiertoSegmento === id) setAbiertoSegmento(null);
  };

  /* Carga en bloque de las salidas que aun no tienen detalle: hace falta
     tener los streams descargados para poder reconocer un segmento en
     ellas, igual que antes hacia falta para detectar ascensiones. */
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

  /* La fila desplegable de un segmento: mismo formato en las dos vistas
     de la app (aqui y en "Detalles de la ruta" de Actividades). De
     referencia usa el mejor intento (g.mejor) en vez de una salida
     propia -un segmento no tiene una "de origen", puede haber nacido en
     cualquiera de las que aparece. */
  const detalleSegmento = (g) => {
    const st = cache?.[g.mejor?.salidaId];
    if (!st) return null;
    return (
      <tr className="fila-detalle">
        <td colSpan={6}>
          <PerfilPuerto streams={st} puerto={g.mejor} indice={0}
            cfg={cfg} zonas={zonas} nombre={g.nombre} />

          <p className="hint" style={{ margin: '18px 0 8px' }}>
            {g.veces === 1
              ? 'Solo lo has pasado una vez, así que todavía no hay con qué comparar.'
              : `Lo has pasado ${g.veces} veces. Ordenados de mejor a peor tiempo.`}
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
        Los tramos que marques a mano en el perfil de una salida (Actividades): acércate al
        punto que sigue el perfil y márcalo hacia atrás para empezar. Se reconocen por su
        recorrido, así que en cuanto vuelvas a pasar por el mismo sitio aparecerá aquí un
        intento más.
      </p>

      {sinAnalizar.length > 0 && (
        <div className="callout">
          <strong>{sinAnalizar.length} salidas todavía sin analizar.</strong> Un segmento solo
          se reconoce en las salidas que ya tienen sus series descargadas.
          <div style={{ marginTop: 12 }}>
            <button onClick={analizarTodas} disabled={cargando}>
              {cargando ? 'Analizando…' : `Analizar las ${sinAnalizar.length} pendientes`}
            </button>
          </div>
        </div>
      )}

      {gruposSegmentos.length === 0 ? (
        <div className="callout">
          Todavía no has marcado ningún segmento. Se crean desde el perfil de una salida,
          en Actividades: acércate al punto que sigue el perfil y márcalo hacia atrás.
        </div>
      ) : (
        <>
          <div className="cab-tabla">
            <span className="rotulo">Segmentos</span>
            <span className="hint" style={{ margin: 0 }}>
              Pulsa una fila para ver su perfil detallado
            </span>
          </div>

          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th><th>Km</th><th>% Med</th><th>Desnivel</th>
                  <th>Veces</th><th>Mejor tiempo</th>
                </tr>
              </thead>
              <tbody>
                {gruposSegmentos.map((g) => {
                  if (!g.mejor) return null; // sin ningun intento reconocido todavia
                  const c = categoriaPuerto(g.mejor.metros, g.mejor.pendiente);
                  const abiertoEste = abiertoSegmento === g.id;
                  return (
                    <Fragment key={g.id}>
                    <tr onClick={() => setAbiertoSegmento(abiertoEste ? null : g.id)}
                      style={{ cursor: 'pointer',
                        background: abiertoEste ? 'var(--card2)' : undefined }}>
                      <td className="col-nombre">
                        <span className="fila-puerto">
                        <span className="flecha">{abiertoEste ? '▾' : '▸'}</span>
                        <span className="cat" title={`Coeficiente ${num(c.coef, 0)}`}
                          style={{ background: c.color,
                            color: c.codigo === 'hc' ? '#FFFFFF' : '#0A0C0F' }}>
                          {c.nombre}
                        </span>
                        {editandoSegmento === g.id ? (
                          <input
                            autoFocus
                            value={borradorSegmento}
                            onChange={(e) => setBorradorSegmento(e.target.value)}
                            onBlur={() => renombrarSegmento(g.id, borradorSegmento.trim() || g.nombre)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') renombrarSegmento(g.id, borradorSegmento.trim() || g.nombre);
                              if (e.key === 'Escape') setEditandoSegmento(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            style={{ width: '100%', maxWidth: 260 }}
                          />
                        ) : (
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditandoSegmento(g.id);
                              setBorradorSegmento(g.nombre || '');
                            }}
                            title="Pulsa para renombrar"
                            style={{ cursor: 'text', borderBottom: '1px dotted var(--line2)' }}>
                            {g.nombre}
                          </span>
                        )}
                        </span>
                      </td>
                      <td>{num(g.mejor.metros / 1000, 2)} km</td>
                      <td><strong>{num(g.mejor.pendiente, 1)} %</strong></td>
                      <td>+{num(g.mejor.desnivel, 0)} m</td>
                      <td>{g.veces}</td>
                      <td>
                        {g.mejor.segundos ? duracion(g.mejor.segundos) : '—'}
                        <button
                          onClick={(e) => { e.stopPropagation(); borrarSegmento(g.id); }}
                          title="Borrar este segmento"
                          style={{ marginLeft: 10, padding: '2px 7px', border: 'none',
                            background: 'transparent', color: 'var(--ink3)' }}>
                          ✕
                        </button>
                      </td>
                    </tr>

                    {abiertoEste && detalleSegmento(g)}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
