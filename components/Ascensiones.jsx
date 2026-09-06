'use client';

import { Fragment, useMemo, useState } from 'react';
import PerfilPuerto from './PerfilPuerto';
import { recogerSegmentosManuales, vatiosPuerto, num, duracion, fechaCorta, categoriaPuerto } from '@/lib/metrics';
import { useSegmentosManuales, actualizarSegmentoManual, eliminarSegmentoManual } from '@/lib/segmentosManualesCache';

export default function Ascensiones({ salidas, cache, excluidas, cfg, zonas, pedirStreams }) {
  const [cargando, setCargando] = useState(false);
  const [definicionesSegmentos, setDefinicionesSegmentos] = useSegmentosManuales();
  const [abiertoSegmento, setAbiertoSegmento] = useState(null);
  const [editandoSegmento, setEditandoSegmento] = useState(null);
  const [borradorSegmento, setBorradorSegmento] = useState('');
  /* Que vertiente se ve en el detalle del grupo abierto -null es "la de
     mejor tiempo", que es el valor por defecto al abrir uno nuevo (ver el
     onClick de la fila mas abajo, que la reinicia). */
  const [vertienteActiva, setVertienteActiva] = useState(null);
  /* Edicion del nombre propio de una vertiente (nombreVertiente, distinto
     del nombre del grupo que las vincula -ver renombrarVertiente). */
  const [editandoVertiente, setEditandoVertiente] = useState(null);
  const [borradorVertiente, setBorradorVertiente] = useState('');

  /*
    Se vinculan solas las que comparten nombre exacto (recortado de
    espacios) -ver recogerSegmentosManuales: no hace falta fusionar nada
    a mano, renombrar dos vertientes igual ya las junta en un grupo, y
    cambiarle el nombre a una las separa otra vez.
  */
  const gruposSegmentos = useMemo(
    () => recogerSegmentosManuales(salidas, cache, excluidas, definicionesSegmentos),
    [salidas, cache, excluidas, definicionesSegmentos]
  );

  /* Renombra TODAS las vertientes del grupo a la vez -es lo que mantiene
     vinculado (o desvincula, si el nuevo nombre ya no coincide con nada)
     un grupo de mas de una vertiente: la vinculacion no es mas que
     compartir el mismo nombre. */
  const renombrarGrupo = (g, nombre) => {
    const idsGrupo = new Set(g.vertientes.map((v) => v.id));
    setDefinicionesSegmentos((prev) => prev.map((d) => (idsGrupo.has(d.id) ? { ...d, nombre } : d)));
    idsGrupo.forEach((id) => actualizarSegmentoManual(id, { nombre }));
    setEditandoSegmento(null);
  };

  const borrarGrupo = (g) => {
    const idsGrupo = new Set(g.vertientes.map((v) => v.id));
    setDefinicionesSegmentos((prev) => prev.filter((d) => !idsGrupo.has(d.id)));
    idsGrupo.forEach((id) => eliminarSegmentoManual(id));
    if (abiertoSegmento === g.id) setAbiertoSegmento(null);
  };

  /* El nombre propio de UNA vertiente (no el del grupo, que es lo que la
     vincula a las demas -ver renombrarGrupo). Vacio vuelve a la etiqueta
     por defecto (su longitud), no hay nada a lo que "volver" aparte. */
  const renombrarVertiente = (vertienteId, nombreVertiente) => {
    setDefinicionesSegmentos((prev) => prev.map((d) => (d.id === vertienteId
      ? { ...d, nombreVertiente: nombreVertiente || null }
      : d)));
    actualizarSegmentoManual(vertienteId, { nombreVertiente: nombreVertiente || null });
    setEditandoVertiente(null);
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

  /* La fila desplegable de un grupo: mismo formato en las dos vistas de
     la app (aqui y en "Detalles de la ruta" de Actividades). Con mas de
     una vertiente, el boton de arriba del todo decide cual de ellas se
     ve -perfil, tabla de intentos, todo cambia con la seleccion, porque
     son tramos fisicos distintos y no tiene sentido mezclarlos en un
     mismo grafico. */
  const detalleSegmento = (g) => {
    const variasVertientes = g.vertientes.length > 1;
    const vertiente = variasVertientes
      ? (g.vertientes.find((v) => v.id === vertienteActiva) || g.vertientes.find((v) => v.id === g.principal?.vertienteId) || g.vertientes[0])
      : g.vertientes[0];
    const intentos = variasVertientes ? g.intentos.filter((it) => it.vertienteId === vertiente.id) : g.intentos;
    const mejor = variasVertientes ? (intentos[0] || null) : g.mejor;
    const st = cache?.[mejor?.salidaId];

    return (
      <tr className="fila-detalle">
        <td colSpan={6}>
          {variasVertientes && (
            /* Las vertientes de un mismo grupo comparten nombre -es lo
               que las vincula-, asi que cada una lleva su propia
               etiqueta: primero su categoria (puede variar de una
               vertiente a otra, la dificultad no es la misma por todos
               los caminos), luego un nombre editable (doble clic), y fijo
               al lado -no se edita, sale solo de sus propias cifras- la
               distancia con la pendiente media. Sin ningun intento
               reconocido todavia no hay pendiente que mostrar, asi que la
               categoria y el % se omiten -solo queda el nombre y el km
               guardado al crearla. chips-rango: mismo estilo redondeado
               que ya usa Dashboard.jsx para sus propios selectores. */
            <div className="chips chips-rango" style={{ marginBottom: 14 }}>
              {[...g.vertientes]
                .map((v, i) => {
                  const intentosV = g.intentos.filter((it) => it.vertienteId === v.id);
                  const mejorV = intentosV[0] || null; // g.intentos ya viene ordenado de mejor a peor tiempo
                  const cat = mejorV ? categoriaPuerto(mejorV.metros, mejorV.pendiente) : null;
                  /* Solo las veces "de verdad" cuentan para el orden -las
                     anidadas (este tramo subido de paso, dentro de otro mas
                     largo, ver recogerSegmentosManuales) siguen saliendo en
                     su tabla de tiempos pero no deben inflar su puesto por
                     delante de una vertiente que de verdad se sube a
                     proposito. */
                  const veces = intentosV.filter((it) => !it.anidado).length;
                  return { v, indiceOriginal: i, veces, mejorV, cat };
                })
                /* Primero la mas recorrida; en empate, la mas dura (mismo
                   coeficiente que decide la categoria). Una vertiente sin
                   ningun intento reconocido -sin cat- va siempre la
                   ultima de su empate en veces (0), como cualquier otra
                   con 0 veces. */
                .sort((a, b) => b.veces - a.veces || (b.cat?.coef ?? -1) - (a.cat?.coef ?? -1))
                .map(({ v, indiceOriginal, mejorV, cat }) => {
                const metros = mejorV?.metros ?? v.metros ?? 0;
                const nombreVertiente = v.nombreVertiente || `Vertiente ${indiceOriginal + 1}`;
                const cifras = `${num(metros / 1000, 1)} km` + (mejorV ? ` - ${num(mejorV.pendiente, 1)}%` : '');
                const editandoEsta = editandoVertiente === v.id;
                const activa = v.id === vertiente.id;

                const contenido = (
                  <>
                    {cat && (
                      <span className="cat" title={`Coeficiente ${num(cat.coef, 0)}`}
                        style={{ background: cat.color, color: cat.codigo === 'hc' ? '#FFFFFF' : '#0A0C0F',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        {cat.nombre}
                      </span>
                    )}
                    {editandoEsta ? (
                      <input autoFocus
                        value={borradorVertiente}
                        onChange={(e) => setBorradorVertiente(e.target.value)}
                        onBlur={() => renombrarVertiente(v.id, borradorVertiente.trim())}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') renombrarVertiente(v.id, borradorVertiente.trim());
                          if (e.key === 'Escape') setEditandoVertiente(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder={nombreVertiente}
                        style={{ width: 110 }}
                      />
                    ) : (
                      /* En la seleccionada (fondo amarillo de --acento) el
                         peso medio de siempre se pierde contra ese color
                         -aqui se fuerza negro y negrita para que el nombre
                         se siga leyendo bien. */
                      <span style={{ fontSize: 13, ...(activa ? { fontWeight: 700, color: '#0E1116' } : null) }}>
                        {nombreVertiente}
                      </span>
                    )}
                    <span className="hint"
                      style={{ margin: 0, fontSize: 13, ...(activa ? { color: '#0E1116' } : null) }}>
                      {cifras}
                    </span>
                  </>
                );

                /* Mientras se edita, un <span> (no <button>): un <input>
                   dentro de un <button> es fragil -el propio boton puede
                   robarle el foco o el clic. Se le da a mano un aspecto
                   parecido al de la pastilla para que no salte demasiado
                   al pasar de uno a otro. */
                return editandoEsta ? (
                  <span key={v.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '5px 10px', border: '1px solid var(--line2)', borderRadius: 999 }}>
                    {contenido}
                  </span>
                ) : (
                  <button key={v.id} type="button"
                    aria-pressed={activa}
                    onClick={() => setVertienteActiva(v.id)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditandoVertiente(v.id);
                      setBorradorVertiente(v.nombreVertiente || '');
                    }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px' }}
                    title="Doble clic para ponerle nombre a esta vertiente">
                    {contenido}
                  </button>
                );
              })}
            </div>
          )}

          {st && mejor && (
            <PerfilPuerto streams={st} puerto={mejor} indice={0}
              cfg={cfg} zonas={zonas} nombre={g.nombre} />
          )}

          <p className="hint" style={{ margin: '18px 0 8px' }}>
            {intentos.length === 0
              ? 'Todavía no tienes ningún intento reconocido en esta vertiente.'
              : intentos.length === 1
                ? 'Solo lo has pasado una vez, así que todavía no hay con qué comparar.'
                : `Lo has pasado ${intentos.length} veces. Ordenados de mejor a peor tiempo.`}
          </p>
          {intentos.length > 0 && (
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>Puesto</th><th>Fecha</th><th>Salida</th><th>Tiempo</th>
                    <th>Vel.</th><th>VAM</th><th>FC</th><th>W est.</th>
                  </tr>
                </thead>
                <tbody>
                  {intentos.map((it, j) => (
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
          )}
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
        intento más. Si una subida tiene varias vertientes (una versión reducida, un desvío
        que llega al mismo alto por otro camino...), márcalas por separado y ponles el mismo
        nombre: se vinculan solas, y arriba del perfil podrás elegir cuál ver.
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
                  /* La fila principal describe la vertiente principal -la
                     mas usada, ver recogerSegmentosManuales- no la del
                     mejor tiempo (g.mejor), que puede ser una vertiente
                     distinta y mucho menos habitual. */
                  const p = g.principal;
                  const c = categoriaPuerto(p.metros, p.pendiente);
                  const abiertoEste = abiertoSegmento === g.id;
                  return (
                    <Fragment key={g.id}>
                    <tr onClick={() => {
                        setAbiertoSegmento(abiertoEste ? null : g.id);
                        setVertienteActiva(null); // al abrir un grupo nuevo, empieza en la vertiente principal
                      }}
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
                            onBlur={() => renombrarGrupo(g, borradorSegmento.trim() || g.nombre)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') renombrarGrupo(g, borradorSegmento.trim() || g.nombre);
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
                        {g.vertientes.length > 1 && (
                          <span className="hint" style={{ margin: 0 }} title="Vertientes vinculadas por compartir nombre">
                            · {g.vertientes.length} vertientes
                          </span>
                        )}
                        </span>
                      </td>
                      <td>{num(p.metros / 1000, 2)} km</td>
                      <td><strong>{num(p.pendiente, 1)} %</strong></td>
                      <td>+{num(p.desnivel, 0)} m</td>
                      <td>{g.veces}</td>
                      <td>
                        {p.segundos ? duracion(p.segundos) : '—'}
                        <button
                          onClick={(e) => { e.stopPropagation(); borrarGrupo(g); }}
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
