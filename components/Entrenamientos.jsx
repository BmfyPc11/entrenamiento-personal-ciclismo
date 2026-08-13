'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Perfil from './Perfil';
import PerfilPuerto from './PerfilPuerto';
import { IcoExpandir, IcoCerrar } from './Iconos';
import {
  detectarPuertos, repartoZonas, repartoDureza, repartoVelocidad, valorarEntrenamiento,
  TRAMOS_DUREZA, TRAMOS_VELOCIDAD, vatiosPuerto, vatiosSalida, categoriaPuerto,
  num, duracion, fechaLarga, kmh, km, metrosPorKm,
} from '@/lib/metrics';
import {
  emparejarSegmento, buscarNombre, guardarNombre, leerCache, escribirCache,
} from '@/lib/nombres';

export default function Entrenamientos({
  salidas, cfg, zonas, umbral, cache, pedirStreams,
  salidaInicial, onSalidaInicialConsumida,
}) {
  const ordenadas = useMemo(
    () => [...salidas].sort((a, b) => (a.fecha < b.fecha ? 1 : -1)),
    [salidas]
  );

  /*
    salidaInicial llega de un enlace de "Tus estadisticas" (la salida que
    puso el record de distancia o de velocidad punta). Solo hace falta
    leerlo al montar -esta pestana se desmonta en cuanto sales de ella, asi
    que "montar" es exactamente "el usuario acaba de entrar aqui"- de ahi
    el useState perezoso en vez de un efecto que reaccione a cambios.
  */
  const [sel, setSel] = useState(salidaInicial ?? (ordenadas[0]?.id ?? null));

  /* Avisa para que Dashboard limpie el enlace consumido: si no, volver
     mas tarde por el menu normal reabriria siempre esa misma salida en
     vez de la mas reciente. */
  useEffect(() => { onSalidaInicialConsumida?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /*
    Se arranca en dureza. Habia un tercer modo, "Informacion", que pintaba
    el relieve en gris con las subidas subrayadas; desde que las fichas con
    el nombre y la categoria salen en los tres, ese modo se quedo sin nada
    propio que aportar y solo obligaba a un clic mas para llegar al color.
    La vista sigue existiendo en Perfil.jsx, que la usa la pestana de Rutas.
  */
  const [modo, setModo] = useState('dureza');
  const [zonaFoco, setZonaFoco] = useState(null);
  const [durezaFoco, setDurezaFoco] = useState(null);
  const [velFoco, setVelFoco] = useState(null);
  const [puertoFoco, setPuertoFoco] = useState(null);
  const [puertoAbierto, setPuertoAbierto] = useState(null);
  const [criterio, setCriterio] = useState({ minMetros: 500, minDesnivel: 30, minPend: 3 });
  const [cargando, setCargando] = useState(false);
  const [fallo, setFallo] = useState(null);

  /*
    Vista horizontal del perfil. En vertical el grafico apenas tiene alto
    para leerse bien; en vez de esperar a que cada uno gire el telefono, se
    rota el propio contenido por CSS dentro de un overlay a pantalla
    completa, asi el movil se queda como esta y el grafico ocupa el largo
    de la pantalla igualmente.
  */
  const [horizontal, setHorizontal] = useState(false);
  const [altoHorizontal, setAltoHorizontal] = useState(420);

  useEffect(() => {
    if (!horizontal) return;
    /*
      Tras la rotacion, el ancho fisico disponible para el grafico es el
      ancho de la pantalla en vertical (innerWidth), no el alto: por eso
      se resta aqui y no de innerHeight. El descuento de 150px deja sitio
      a la fila de cierre y a los chips de modo, que viven en la misma
      columna rotada.
    */
    const calcular = () => setAltoHorizontal(Math.max(220, window.innerWidth - 150));
    calcular();
    window.addEventListener('resize', calcular);
    return () => window.removeEventListener('resize', calcular);
  }, [horizontal]);

  /* Bloquea el scroll de fondo mientras el overlay esta abierto, y permite
     cerrarlo con Escape ademas de con el boton: es el gesto que la gente
     prueba primero en cualquier pantalla completa. */
  useEffect(() => {
    if (!horizontal) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') setHorizontal(false); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previo; window.removeEventListener('keydown', onKey); };
  }, [horizontal]);

  const salida = ordenadas.find((s) => s.id === sel) || null;
  const streams = sel ? cache[sel] : null;

  useEffect(() => {
    if (!sel || cache[sel]) return;
    let vivo = true;
    setCargando(true);
    setFallo(null);
    pedirStreams(sel)
      .then(() => vivo && setCargando(false))
      .catch((e) => vivo && (setFallo(e.message), setCargando(false)));
    return () => { vivo = false; };
  }, [sel, cache, pedirStreams]);

  useEffect(() => { setPuertoFoco(null); setZonaFoco(null); setPuertoAbierto(null); }, [sel]);

  const puertos = useMemo(
    () => (streams ? detectarPuertos(streams, criterio) : []),
    [streams, criterio]
  );

  const reparto = useMemo(
    () => (streams ? repartoZonas(streams, zonas) : null),
    [streams, zonas]
  );
  const dureza = useMemo(() => (streams ? repartoDureza(streams) : null), [streams]);
  const velocidad = useMemo(() => (streams ? repartoVelocidad(streams) : null), [streams]);

  const tieneFC = !!(streams && streams.fc);

  /* ---------- nombres reales de las subidas ---------- */

  const [cacheNombres, setCacheNombres] = useState(() => leerCache());
  const [segmentos, setSegmentos] = useState({});   // id de salida -> efforts

  /*
    Los segmentos se piden solo de la salida abierta. El detalle de
    actividad cuesta una peticion, y el limite de Strava son 100 cada
    quince minutos: traerlos de todas las salidas al entrar dejaria el
    panel sin cuota para lo demas.
  */
  useEffect(() => {
    if (!sel || segmentos[sel] !== undefined) return;
    let cancelado = false;
    (async () => {
      try {
        const r = await fetch(`/api/nombres/segmentos?id=${sel}`, { cache: 'no-store' });
        const j = await r.json();
        if (!cancelado) setSegmentos((s) => ({ ...s, [sel]: j.segmentos || [] }));
      } catch {
        if (!cancelado) setSegmentos((s) => ({ ...s, [sel]: [] }));
      }
    })();
    return () => { cancelado = true; };
  }, [sel, segmentos]);

  /*
    Precedencia: lo que hayas escrito tu, luego el segmento de Strava, y
    si nada de eso hay, el numero de siempre.
  */
  const nombresPuertos = useMemo(() => {
    const efforts = sel ? segmentos[sel] : null;
    return puertos.map((p, i) => {
      const cima = streams?.latlng ? streams.latlng[p.fin] : null;
      const guardado = buscarNombre(cacheNombres, cima);
      if (guardado?.fuente === 'manual' && guardado.nombre) return guardado.nombre;
      const deStrava = efforts ? emparejarSegmento(p, efforts) : null;
      return deStrava || guardado?.nombre || `Subida ${i + 1}`;
    });
  }, [puertos, segmentos, sel, streams, cacheNombres]);

  /*
    Se guardan para que el resto de pestanas los aprovechen sin volver a
    gastar peticiones.

    El efecto lee y escribe cacheNombres, y por eso NO puede llevarlo en
    sus dependencias: si lo llevara, cada guardado cambiaria la propia
    dependencia y el efecto se volveria a disparar solo. Con puertos
    detectados muy cerca entre si -algo normal al bajar los minimos de
    deteccion- dos de ellos pueden pisarse el guardado el uno al otro
    (cada cima cae dentro del radio de la del vecino) y la condicion de
    parada, "esto ya esta guardado igual", no llega a cumplirse nunca:
    bucle infinito de verdad, no solo un aviso en consola. Se vio como
    "Maximum update depth exceeded" y, con la pestana ocupada en volver a
    renderizar sin parar, el perfil se quedaba en "Cargando..." aunque la
    peticion de red llevara rato resuelta.

    La forma correcta de leer el ultimo valor sin declararlo como
    dependencia es la funcion de actualizacion de setState: React pasa el
    valor mas reciente como argumento, y si se devuelve exactamente el
    mismo (prev) cuando no hay cambios, ni siquiera vuelve a renderizar.
    Eso corta el bucle de raiz, tenga o no el problema de los puertos
    cercanos, que sigue existiendo pero ya no cuesta un cuelgue.
  */
  useEffect(() => {
    const efforts = sel ? segmentos[sel] : null;
    if (!efforts || !efforts.length || !streams?.latlng) return;

    setCacheNombres((prev) => {
      let nueva = prev, cambio = false;
      puertos.forEach((p) => {
        const cima = streams.latlng[p.fin];
        if (!cima) return;
        const n = emparejarSegmento(p, efforts);
        if (!n) return;
        const ya = buscarNombre(nueva, cima);
        if (ya?.fuente === 'strava' && ya.nombre === n) return;
        nueva = guardarNombre(nueva, cima, n, 'strava');
        cambio = true;
      });
      if (cambio) escribirCache(nueva);
      return cambio ? nueva : prev;
    });
  }, [segmentos, sel, puertos, streams]);

  /*
    Selector de modo y panel de submodo, sacados a variables para no
    duplicar el JSX: los usan tanto la vista normal como el overlay
    horizontal, que necesita los mismos controles para poder cambiar de
    vista sin salir de pantalla completa.
  */
  const chipsPrincipales = (
    <div className="chips">
      <button
        aria-pressed={modo === 'dureza'}
        onClick={() => { setModo('dureza'); setZonaFoco(null); setVelFoco(null); }}
      >
        Dureza
      </button>
      <button
        aria-pressed={modo === 'velocidad'}
        onClick={() => { setModo('velocidad'); setZonaFoco(null); setDurezaFoco(null); }}
      >
        Velocidad
      </button>
      <button
        aria-pressed={modo === 'zonas'}
        disabled={!tieneFC}
        onClick={() => { setModo('zonas'); setDurezaFoco(null); setVelFoco(null); }}
        title={tieneFC ? '' : 'Esta salida no tiene frecuencia cardíaca'}
      >
        Frecuencia cardíaca
      </button>
    </div>
  );

  /* compacto=true quita las frases explicativas (el "Selecciona una
     zona..." y el aviso de "sin pulsometro"): en el overlay rotado el alto
     disponible es el ancho del movil, y ese texto es justo lo que sobra
     para dejarle mas sitio al grafico. */
  const panelSubmodo = (compacto) => (
    <>
      {modo === 'dureza' && dureza && (
        <>
          <div className="chips">
            <button aria-pressed={durezaFoco === null} onClick={() => setDurezaFoco(null)}>Todo</button>
            {TRAMOS_DUREZA.map((t, i) =>
              dureza.porcentaje[i] > 0.4 ? (
                <button
                  key={t.n}
                  aria-pressed={durezaFoco === t.n}
                  onClick={() => setDurezaFoco(durezaFoco === t.n ? null : t.n)}
                  style={durezaFoco === t.n
                    ? { background: t.color, borderColor: t.color, color: t.n === 6 ? '#E8EAED' : '#0A0C0F' }
                    : null}
                >
                  <i style={{ background: t.color }} />{t.nombre} · {num(dureza.porcentaje[i], 0)} %
                </button>
              ) : null
            )}
          </div>
        </>
      )}

      {modo === 'velocidad' && velocidad && (
        <>
          <div className="chips">
            <button aria-pressed={velFoco === null} onClick={() => setVelFoco(null)}>Todo</button>
            {TRAMOS_VELOCIDAD.map((t, i) =>
              velocidad.porcentaje[i] > 0.4 ? (
                <button
                  key={t.n}
                  aria-pressed={velFoco === t.n}
                  onClick={() => setVelFoco(velFoco === t.n ? null : t.n)}
                  style={velFoco === t.n
                    ? { background: t.color, borderColor: t.color, color: '#0A0C0F' }
                    : null}
                >
                  <i style={{ background: t.color }} />{t.nombre} · {num(velocidad.porcentaje[i], 0)} %
                </button>
              ) : null
            )}
          </div>
        </>
      )}

      {modo === 'zonas' && tieneFC && (
        <>
          <div className="chips">
            <button aria-pressed={zonaFoco === null} onClick={() => setZonaFoco(null)}>Todas</button>
            {zonas.map((z) => (
              <button
                key={z.n}
                aria-pressed={zonaFoco === z.n}
                onClick={() => setZonaFoco(zonaFoco === z.n ? null : z.n)}
                style={zonaFoco === z.n ? { background: z.color, borderColor: z.color } : null}
              >
                <i style={{ background: z.color }} />Z{z.n} {z.nombre}
                {reparto && ` · ${num(reparto.porcentaje[z.n - 1], 0)} %`}
              </button>
            ))}
          </div>
          {!compacto && (
            <p className="hint" style={{ marginTop: 12, marginBottom: 0 }}>
              Selecciona una zona para ver exactamente en qué tramos de la ruta estuviste
              en ella. Los límites se configuran en <strong>Tus datos</strong>.
            </p>
          )}
        </>
      )}

      {!tieneFC && !compacto && (
        <div className="callout warn" style={{ marginTop: 16, marginBottom: 0 }}>
          Esta salida se registró sin pulsómetro, así que no hay zonas que pintar.
          Si la grabaste con el móvil en lugar del Garmin, ahí está la razón.
        </div>
      )}
    </>
  );

  /* Sin salidas tambien hay que pintar la cabecera: desde que esta seccion
     la trae puesta, Dashboard ya no dibuja ninguna por ella y la pagina se
     quedaria sin titulo. */
  if (!ordenadas.length) {
    return (
      <div>
        <div className="top">
          <div>
            <p className="eyebrow">Análisis de una salida</p>
            <h1>
              <button type="button" className="titulo-clic"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                Entrenamientos
              </button>
            </h1>
          </div>
        </div>
        <p className="hint">No hay salidas en bicicleta para mostrar.</p>
      </div>
    );
  }

  return (
    <div>
      {/*
        Esta seccion pinta su propia cabecera en vez de usar la generica de
        Dashboard. El motivo es el selector: la salida analizada manda sobre
        todo lo que hay debajo, y ponerla junto al titulo la convierte en lo
        primero que se lee. Antes ocupaba una fila entera a media pagina.
      */}
      <div className="top">
        <div>
          <p className="eyebrow">Análisis de una salida</p>
          <h1>
            <button type="button" className="titulo-clic"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              Entrenamientos
            </button>
          </h1>
        </div>
        <div className="sel-salida">
          <label htmlFor="salida">Salida analizada</label>
          <select
            id="salida"
            value={sel ?? ''}
            onChange={(e) => setSel(Number(e.target.value))}
          >
            {ordenadas.map((s) => (
              <option key={s.id} value={s.id}>
                {new Date(s.fecha).toLocaleDateString('es-ES')} · {s.nombre} · {num(km(s), 1)} km
                {s.desnivel > 0 ? ` · +${num(s.desnivel, 0)} m` : ''}
                {s.fcMedia ? ' · con FC' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {salida && (
        <>
          {/* El desplegable ya dice el nombre y la fecha corta; aqui solo se
              anade el dia de la semana, que es lo que situa la salida. */}
          <p className="eyebrow" style={{ marginBottom: 18 }}>
            {fechaLarga(salida.fecha)}
          </p>

          <div className="grid compacta">
            <Dato k="Distancia" v={num(km(salida), 1)} u="km" />
            <Dato k="Desnivel" v={`+${num(salida.desnivel, 0)}`} u="m"
              d={`${num(metrosPorKm(salida), 1)} m por km`} />
            <Dato k="Tiempo" v={duracion(salida.tiempoMovimiento)}
              d={salida.tiempoTotal > salida.tiempoMovimiento * 1.15
                ? `${duracion(salida.tiempoTotal)} en total, con paradas` : 'sin paradas relevantes'} />
            <Dato k="Velocidad media" v={num(kmh(salida), 1)} u="km/h" />
            <Dato k="FC" v={salida.fcMedia ? num(salida.fcMedia, 0) : '—'}
              u={salida.fcMedia ? 'ppm' : ''}
              d={salida.fcMax ? `máxima de ${num(salida.fcMax, 0)} ppm` : 'sin pulsómetro'} />
            <Dato k={salida.vatiosReales ? 'Potencia medida' : 'Potencia estimada'}
              v={num(vatiosSalida(salida, cfg), 0)} u="W"
              d={salida.vatiosReales ? 'de tu medidor' : 'calculada desde peso y desnivel'} />
          </div>

          {/* ---------- perfil ---------- */}
          <div className="chart" style={{ marginTop: 26 }}>
            {/*
              Los modos suben a la cabecera del panel. Debajo del grafico
              estaban en el sitio donde menos se buscan: para cambiar de vista
              hay que mirar primero que vista hay, y eso se mira arriba.
            */}
            <div className="cab-panel">
              <span className="rotulo">Perfil de altimetría</span>
              {streams && chipsPrincipales}
            </div>

            {cargando && <p className="cargando"><span className="spin" />Cargando el perfil…</p>}
            {fallo && <div className="callout warn">No se pudo cargar el perfil: {fallo}</div>}
            {streams && (
              <div style={{ position: 'relative' }}>
                {/*
                  El boton vive encima del propio grafico y no en la
                  cabecera: es una accion sobre el dibujo (verlo mas grande),
                  no un modo mas que elegir junto a dureza/velocidad/FC.
                */}
                <button
                  className="btn-expandir"
                  onClick={() => setHorizontal(true)}
                  title="Ver el perfil en horizontal"
                  aria-label="Ver el perfil en horizontal"
                >
                  <IcoExpandir width="16" height="16" />
                </button>
                <Perfil
                  streams={streams}
                  puertos={puertos}
                  nombres={nombresPuertos}
                  zonas={zonas}
                  modo={modo}
                  zonaFoco={zonaFoco}
                  durezaFoco={durezaFoco}
                  velFoco={velFoco}
                  puertoFoco={puertoFoco}
                  altura={340}
                />
              </div>
            )}

            {streams && panelSubmodo(false)}
          </div>

          {/*
            Overlay a pantalla completa con el perfil rotado 90 grados por
            CSS. El giro es del contenido, no del telefono: asi funciona
            aunque nadie gire el movil, que es como se usa esto en la
            practica (con una mano, de pie junto a la bici).
          */}
          {horizontal && streams && (
            <div className="perfil-horizontal" role="dialog" aria-label="Perfil en horizontal">
              <div className="perfil-horizontal-girar">
                <div className="perfil-horizontal-cab">
                  {chipsPrincipales}
                  <button
                    className="btn-cerrar-horizontal"
                    onClick={() => setHorizontal(false)}
                    aria-label="Cerrar la vista horizontal"
                  >
                    <IcoCerrar width="18" height="18" />
                  </button>
                </div>

                <Perfil
                  streams={streams}
                  puertos={puertos}
                  nombres={nombresPuertos}
                  zonas={zonas}
                  modo={modo}
                  zonaFoco={zonaFoco}
                  durezaFoco={durezaFoco}
                  velFoco={velFoco}
                  puertoFoco={puertoFoco}
                  altura={altoHorizontal}
                  compacto
                />

                {panelSubmodo(true)}
              </div>
            </div>
          )}

          {/* ---------- puertos ---------- */}
          <h2>Puertos de esta salida</h2>
          <p className="hint">
            Detectados automáticamente sobre el perfil. Ajusta los mínimos si quieres ver solo las
            subidas serias o incluir también las rampas cortas.
          </p>

          <div className="panel">
            <div className="fields">
              <div>
                <label htmlFor="mm">Longitud mínima (m)</label>
                <input id="mm" type="number" min="100" max="5000" step="50"
                  value={criterio.minMetros}
                  onChange={(e) => setCriterio({ ...criterio, minMetros: +e.target.value || 100 })} />
              </div>
              <div>
                <label htmlFor="md">Desnivel mínimo (m)</label>
                <input id="md" type="number" min="10" max="1000" step="5"
                  value={criterio.minDesnivel}
                  onChange={(e) => setCriterio({ ...criterio, minDesnivel: +e.target.value || 10 })} />
              </div>
              <div>
                <label htmlFor="mp">Pendiente mínima (%)</label>
                <input id="mp" type="number" min="1" max="15" step="0.5"
                  value={criterio.minPend}
                  onChange={(e) => setCriterio({ ...criterio, minPend: +e.target.value || 1 })} />
              </div>
            </div>
          </div>

          {puertos.length === 0 ? (
            <p className="hint" style={{ marginTop: 16 }}>
              {streams
                ? 'Ningún tramo cumple esos mínimos. Baja el desnivel o la pendiente mínima para ver subidas más suaves.'
                : ''}
            </p>
          ) : (
            <>
              <div className="cab-tabla">
                <span className="rotulo">Puertos detectados</span>
                <span className="hint" style={{ margin: 0 }}>
                  Pulsa una fila para ver su perfil detallado
                </span>
              </div>

              <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Puerto</th><th>Km</th><th>Long.</th><th>Desn.</th>
                      <th>Pend.</th><th>Máx.</th><th>Tiempo</th><th>Vel.</th>
                      <th>VAM</th><th>FC</th><th>W est.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {puertos.map((p, i) => {
                      const c = categoriaPuerto(p.metros, p.pendiente);
                      return (
                        <Fragment key={i}>
                        <tr
                          onMouseEnter={() => setPuertoFoco(i)}
                          onMouseLeave={() => setPuertoFoco(null)}
                          onClick={() => setPuertoAbierto(puertoAbierto === i ? null : i)}
                          style={{ cursor: 'pointer',
                            background: puertoAbierto === i ? 'var(--card2)'
                              : puertoFoco === i ? 'var(--card2)' : undefined }}>
                          <td>
                            <span className="fila-puerto">
                              <span className="flecha">{puertoAbierto === i ? '▾' : '▸'}</span>
                              <span className="cat" title={`Coeficiente ${num(c.coef, 0)}`}
                                style={{ background: c.color,
                                  color: c.codigo === 'hc' ? '#FFFFFF' : '#0A0C0F' }}>
                                {c.nombre}
                              </span>
                              {nombresPuertos[i]}
                            </span>
                          </td>
                          <td>{num(p.kmInicio, 1)}–{num(p.kmFin, 1)}</td>
                          <td>{num(p.metros / 1000, 2)} km</td>
                          <td>+{num(p.desnivel, 0)} m</td>
                          <td><strong>{num(p.pendiente, 1)} %</strong></td>
                          <td>{num(p.pendienteMax, 1)} %</td>
                          <td>{duracion(p.segundos)}</td>
                          <td>{num(p.velocidad, 1)}</td>
                          <td>{p.vam ? num(p.vam, 0) : '—'}</td>
                          <td>{p.fcMedia ?? '—'}</td>
                          <td>{num(vatiosPuerto(p, cfg), 0)}</td>
                        </tr>

                        {/*
                          El detalle se despliega dentro de la tabla, en una
                          fila propia justo debajo de la suya. Antes colgaba
                          del final del bloque: con seis puertos, pulsabas el
                          primero y el perfil aparecia cinco filas mas abajo,
                          sin nada que lo atara al que habias abierto.
                        */}
                        {puertoAbierto === i && streams && (
                          <tr className="fila-detalle">
                            <td colSpan={11}>
                              <PerfilPuerto streams={streams} puerto={p}
                                indice={i} cfg={cfg} zonas={zonas}
                                nombre={nombresPuertos[i]} />
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <p className="nota">
                {salida.vatiosReales
                  ? 'Los vatios de la salida vienen de tu medidor; los de cada puerto son una estimación a partir de la pendiente y el tiempo.'
                  : `Los vatios son una estimación con ${num(cfg.peso, 0)} kg de peso y ${num(cfg.bici, 0)} kg de bici, sin medidor de potencia.`}
              </p>
            </>
          )}

          {puertos.length > 0 && (() => {
            const duro = [...puertos].sort((a, b) => b.desnivel - a.desnivel)[0];
            return (
              <div className="callout">
                <strong>El puerto más duro de esta salida:</strong> {num(duro.metros / 1000, 2)} km
                al {num(duro.pendiente, 1)} % de media, con rampas de hasta {num(duro.pendienteMax, 1)} %.
                {duro.vam && <> Lo subiste a {num(duro.vam, 0)} metros verticales por hora</>}
                {duro.fcMedia && <> con el pulso en {duro.fcMedia} ppm</>}.
                {duro.metros >= 5000 && duro.pendiente >= 6 && (
                  <> <strong>Esto ya es un puerto de 5 km al 6 %: objetivo cumplido.</strong></>
                )}
              </div>
            );
          })()}

          {/* ---------- reparto de intensidad ---------- */}
          {reparto && (
            <>
              <h2>Reparto de intensidad</h2>
              <p className="hint">Cuánto tiempo pasaste en cada zona durante esta salida.</p>
              <div className="chart">
                <svg viewBox="0 0 1000 64" width="100%">
                  {(() => {
                    let acc = 0;
                    return zonas.map((z, k) => {
                      const w = (reparto.porcentaje[k] / 100) * 1000;
                      const x = acc;
                      acc += w;
                      if (w <= 0) return null;
                      return (
                        <g key={z.n}>
                          <rect x={x} y="8" width={w} height="34" fill={z.color} />
                          {w > 55 && (
                            <text x={x + w / 2} y="30" textAnchor="middle" fill="#0E1116"
                              fontSize="13" fontWeight="600" fontFamily="ui-monospace,Menlo,monospace">
                              {num(reparto.porcentaje[k], 0)} %
                            </text>
                          )}
                          {w > 90 && (
                            <text x={x + w / 2} y="57" textAnchor="middle" fill="#6B7684"
                              fontSize="11" fontFamily="ui-monospace,Menlo,monospace">
                              {duracion(reparto.segundos[k])}
                            </text>
                          )}
                        </g>
                      );
                    });
                  })()}
                </svg>
                <div className="legend">
                  {zonas.map((z) => (
                    <span key={z.n}><i style={{ background: z.color }} />Z{z.n} {z.nombre}</span>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ---------- valoracion del entrenador ---------- */}
          {streams && (
            <Valoracion
              salida={salida} streams={streams} reparto={reparto} dureza={dureza}
              puertos={puertos} cfg={cfg} zonas={zonas} umbral={umbral}
            />
          )}
        </>
      )}
    </div>
  );
}

/* Cierre de cada salida: que ha sido esto y que dice de tu entrenamiento. */
function Valoracion({ salida, streams, reparto, dureza, puertos, cfg, zonas, umbral }) {
  const v = useMemo(
    () => valorarEntrenamiento({ salida, streams, reparto, dureza, puertos, cfg, zonas, umbral }),
    [salida, streams, reparto, dureza, puertos, cfg, zonas, umbral]
  );

  return (
    <>
      <h2>Valoración del entrenador</h2>
      <div className={`consejo ${v.tono}`}>
        <span className="tag" style={{ marginLeft: 0, background: 'transparent', padding: 0 }}>
          Qué ha sido esta salida
        </span>
        <p className="tit">{v.titulo}</p>
        <p>{v.resumen}</p>

        {v.notas.length > 0 && (
          <ul style={{ margin: '18px 0 0', paddingLeft: 18, color: 'var(--ink2)',
            fontSize: 14, lineHeight: 1.65 }}>
            {v.notas.map((n, i) => (
              <li key={i} style={{ marginBottom: 7 }}>{n}</li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/*
  Tarjeta compacta: etiqueta y valor, sin la linea de descripcion.

  Esa linea era lo que hacia altas las tarjetas —una o dos lineas mas de
  texto por tarjeta, seis veces— y con ella dentro no habia forma de
  bajar de dos tercios del tamano original. Sin ella caen al 47 %, que
  es lo que se pedia, y coincide con lo que propone la maqueta.

  El dato no se tira: viaja al title, de modo que sigue estando a un
  cursor de distancia. Es una degradacion consciente, no un descuido:
  en un movil con dedos no hay title que valga, y ahi ese detalle deja
  de estar disponible.
*/
function Dato({ k, v, u, d }) {
  return (
    <div className="stat" title={d || undefined}>
      <div className="k">{k}</div>
      <div className="v">{v} {u && <small>{u}</small>}</div>
    </div>
  );
}
