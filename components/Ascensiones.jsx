'use client';

import { Fragment, useMemo, useState } from 'react';
import PerfilPuerto from './PerfilPuerto';
import { recogerSegmentosManuales, vatiosPuerto, num, duracion, fechaCorta, categoriaPuerto } from '@/lib/metrics';
import { useSegmentosManuales, actualizarSegmentoManual } from '@/lib/segmentosManualesCache';

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
  /* Que vista del detalle se ve: el perfil de altimetria o el scatter de
     tendencia. Vive aqui (no dentro de detalleSegmento) porque solo hay un
     grupo abierto a la vez -igual que vertienteActiva. */
  const [vistaDetalle, setVistaDetalle] = useState('perfil');
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

          {st && mejor && intentos.length > 1 && (
            <div className="chips" style={{ marginBottom: 14 }}>
              <button type="button" aria-pressed={vistaDetalle === 'perfil'}
                onClick={() => setVistaDetalle('perfil')}
                style={vistaDetalle === 'perfil' ? { background: 'var(--ink)', borderColor: 'var(--ink)' } : null}>
                Perfil
              </button>
              <button type="button" aria-pressed={vistaDetalle === 'tendencia'}
                onClick={() => setVistaDetalle('tendencia')}
                style={vistaDetalle === 'tendencia' ? { background: 'var(--ink)', borderColor: 'var(--ink)' } : null}>
                Tendencia
              </button>
            </div>
          )}

          {st && mejor && (vistaDetalle === 'perfil' || intentos.length <= 1) && (
            <PerfilPuerto streams={st} puerto={mejor} indice={0}
              cfg={cfg} zonas={zonas} nombre={g.nombre} />
          )}
          {st && mejor && intentos.length > 1 && vistaDetalle === 'tendencia' && (
            <TendenciaPuerto intentos={intentos} />
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
                  <th>Nombre</th><th>Km</th><th>% Med</th><th>% Max</th><th>Desnivel</th>
                  <th>Coef. Dif.</th>
                </tr>
              </thead>
              <tbody>
                {gruposSegmentos
                  .filter((g) => g.mejor) // sin ningun intento reconocido todavia
                  /* Por defecto, de mas a menos dificil -mismo coeficiente
                     que decide la categoria (km x % medio al cuadrado),
                     calculado sobre la vertiente principal de cada grupo. */
                  .map((g) => ({ g, c: categoriaPuerto(g.principal.metros, g.principal.pendiente) }))
                  .sort((a, b) => b.c.coef - a.c.coef)
                  .map(({ g, c }) => {
                  /* La fila principal describe la vertiente principal -la
                     mas usada, ver recogerSegmentosManuales- no la del
                     mejor tiempo (g.mejor), que puede ser una vertiente
                     distinta y mucho menos habitual. */
                  const p = g.principal;
                  const abiertoEste = abiertoSegmento === g.id;
                  return (
                    <Fragment key={g.id}>
                    <tr onClick={() => {
                        setAbiertoSegmento(abiertoEste ? null : g.id);
                        setVertienteActiva(null); // al abrir un grupo nuevo, empieza en la vertiente principal
                        setVistaDetalle('perfil'); // y en la vista de perfil, no en la que se dejara la vez anterior
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
                      <td>{num(p.pendienteMax, 1)} %</td>
                      <td>+{num(p.desnivel, 0)} m</td>
                      <td>{num(c.coef, 0)}</td>
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

/*
  Dispersion de tiempo por fecha, con recta de tendencia: cada punto es un
  paso por la vertiente, y la recta (regresion lineal simple sobre el
  tiempo normalizado, no sobre el tiempo real -evita que fechas muy
  separadas hagan inestable la pendiente) dice de un vistazo si vas a
  mejor o a peor con las salidas, en vez de tener que leer la tabla fila a
  fila. El eje vertical va invertido a proposito: menos segundos (mas
  rapido) se dibuja mas arriba, que es como se lee "mejora" en cualquier
  otro grafico de esta app (Carga y forma, Evolucion).
*/
function TendenciaPuerto({ intentos }) {
  const validos = intentos
    .filter((it) => it.segundos != null)
    .map((it) => ({ ...it, t: new Date(it.fecha).getTime() }))
    .sort((a, b) => a.t - b.t);

  if (validos.length < 2) return null;

  const W = 760, H = 200;
  const mIzq = 58, mDer = 18, mSup = 18, mInf = 30;
  const ancho = W - mIzq - mDer, alto = H - mSup - mInf;

  const tMin = validos[0].t, tMax = validos[validos.length - 1].t;
  const segs = validos.map((it) => it.segundos);
  const segMin = Math.min(...segs) * 0.94, segMax = Math.max(...segs) * 1.06;

  const x = (t) => (tMax === tMin ? mIzq + ancho / 2 : mIzq + ((t - tMin) / (tMax - tMin)) * ancho);
  const y = (s) => mSup + ((s - segMin) / (segMax - segMin)) * alto;

  /* Regresion sobre t normalizado a [0,1] -no sobre el timestamp real- para
     que la pendiente no pierda precision con fechas de mas de una decada
     de separacion (el propio rango de esta app, ano a ano). */
  const n = validos.length;
  const tsNorm = validos.map((it) => (tMax === tMin ? 0 : (it.t - tMin) / (tMax - tMin)));
  const mediaT = tsNorm.reduce((s, v) => s + v, 0) / n;
  const mediaS = segs.reduce((s, v) => s + v, 0) / n;
  let sumProd = 0, sumCuad = 0;
  tsNorm.forEach((tn, i) => { sumProd += (tn - mediaT) * (segs[i] - mediaS); sumCuad += (tn - mediaT) ** 2; });
  const pendiente = sumCuad ? sumProd / sumCuad : 0;
  const ordenada = mediaS - pendiente * mediaT;
  const segEn = (tn) => ordenada + pendiente * tn;

  const mejorando = pendiente < 0;

  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%">
        {[0, 0.5, 1].map((f) => (
          <line key={f} x1={mIzq} x2={W - mDer} y1={mSup + alto * f} y2={mSup + alto * f}
            stroke="var(--line)" strokeWidth="1" opacity=".5" />
        ))}

        {validos.length >= 3 && (
          <line x1={mIzq} y1={y(segEn(0))} x2={W - mDer} y2={y(segEn(1))}
            stroke={mejorando ? 'var(--green)' : 'var(--red)'} strokeWidth="2" strokeDasharray="6 5"
            className="g-crece-x" />
        )}

        {validos.map((it, i) => (
          <circle key={i} cx={x(it.t)} cy={y(it.segundos)} r="4.5"
            fill="var(--blue)" stroke="var(--bg2)" strokeWidth="1.5"
            className="g-pop" style={{ animationDelay: `${i * 0.03}s` }}>
            <title>{`${fechaCorta(it.fecha)} · ${duracion(it.segundos)}`}</title>
          </circle>
        ))}

        <text x={mIzq - 8} y={mSup + 4} textAnchor="end" fontFamily="var(--mono)"
          fontSize="10.5" fill="var(--ink2)">{duracion(segMin)}</text>
        <text x={mIzq - 8} y={mSup + alto} textAnchor="end" fontFamily="var(--mono)"
          fontSize="10.5" fill="var(--ink2)">{duracion(segMax)}</text>

        <text x={mIzq} y={H - 8} textAnchor="start" fontFamily="var(--mono)"
          fontSize="10" fill="var(--ink3)">{fechaCorta(validos[0].fecha)}</text>
        <text x={W - mDer} y={H - 8} textAnchor="end" fontFamily="var(--mono)"
          fontSize="10" fill="var(--ink3)">{fechaCorta(validos[validos.length - 1].fecha)}</text>
      </svg>
    </div>
  );
}
