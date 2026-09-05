'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import Perfil, { MARGEN_EJE } from './Perfil';
import Mapa from './Mapa';
import PerfilPuerto from './PerfilPuerto';
import { IcoExpandir, IcoCerrar, IcoActividades, IcoFlecha, IcoMapa, IcoBuscar } from './Iconos';
import {
  construirPuerto, encontrarTodosLosSegmentosManuales,
  repartoZonas, repartoDureza, repartoVelocidad, valorarEntrenamiento,
  TRAMOS_DUREZA, TRAMOS_VELOCIDAD, vatiosPuerto, vatiosSalida, categoriaPuerto,
  num, duracion, fechaLarga, fechaDDMMAA, kmh, km, metrosPorKm, tipoRuta, TIPO_INSIGNIA,
} from '@/lib/metrics';
import { useSegmentosManuales, guardarSegmentosManuales } from '@/lib/segmentosManualesCache';

export default function Entrenamientos({
  salidas, cfg, zonas, umbral, cache, pedirStreams,
  salidaInicial, onSalidaInicialConsumida, refTerreno,
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
    Se arranca en "Informacion" (relieve amarillo, sin colorear por
    pendiente): es la vista de referencia, y Dureza es ahora una casilla
    que el usuario enciende si la quiere, no el punto de partida.
  */
  const [modo, setModo] = useState('relieve');
  /* El mapa no es un modo mas del perfil -no cambia de que color se pinta
     el relieve-, es un panel aparte que se abre al lado: por eso es un
     interruptor propio y no una opcion de "modo". */
  const [verMapa, setVerMapa] = useState(false);
  /* Listas, no un valor unico: se pueden marcar varias franjas de la
     leyenda a la vez (por ejemplo 10-15% y 15-20% en Desnivel) y ver
     ambas resaltadas juntas en el perfil. */
  const [zonaFoco, setZonaFoco] = useState([]);
  const [durezaFoco, setDurezaFoco] = useState([]);
  const [velFoco, setVelFoco] = useState([]);
  const [puertoFoco, setPuertoFoco] = useState(null);
  const [puertoAbierto, setPuertoAbierto] = useState(null);
  /* Version de puertoAbierto con un frame de retraso, solo para la clase
     que dispara la animacion del panel -mismo motivo y misma tecnica que
     claseAbierta en Dashboard.jsx: sin este retraso, un contenido que se
     monte mientras el panel ya lleva la clase "abierta" puesta nace
     directamente en su estado final, sin nada que animar. */
  const [puertoClaseAbierta, setPuertoClaseAbierta] = useState(null);
  useEffect(() => {
    if (puertoAbierto == null) { setPuertoClaseAbierta(null); return; }
    const id = requestAnimationFrame(() => setPuertoClaseAbierta(puertoAbierto));
    return () => cancelAnimationFrame(id);
  }, [puertoAbierto]);
  /* Punto bajo el cursor en el perfil (indice del stream completo), para
     pintar el mismo punto en el mapa mientras se recorre el grafico. */
  const [puntoHover, setPuntoHover] = useState(null);
  /* Una fila de la tabla por puerto, para poder llevar la vista hasta ella
     cuando se pulsa su ficha en el perfil (ver irAPuerto mas abajo). */
  const filaPuertoRefs = useRef([]);
  /*
    Catalogo de segmentos marcados a mano (ver prop `marcado` de Perfil),
    guardado en Postgres por sus coordenadas -no por indices de esta
    salida- para poder reconocerse tambien en cualquier otra (ver
    lib/segmentosManualesCache.js y encontrarSegmentoManual en
    lib/metrics.js). Vive aqui -no dentro de Perfil- porque tambien hace
    falta para la tabla de "Detalles de la ruta" de abajo, y para "Mis
    segmentos" en Ascensiones.
  */
  const [definicionesSegmentos, setDefinicionesSegmentos] = useSegmentosManuales();
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

  /*
    Pulsar la ficha de un puerto en el perfil abre su fila en la tabla de
    abajo (la misma que ya se abre al pulsar la fila) y lleva la vista
    hasta ahi. Si se pulsa desde el overlay horizontal, primero hay que
    cerrarlo -la tabla vive en la pagina normal, no dentro del dialogo
    rotado.
  */
  const irAPuerto = (p) => {
    setHorizontal(false);
    /* Perfil manda el propio objeto puerto (no un indice): la tabla de
       abajo reordena los segmentos por km, asi que su posicion ahi no
       tiene por que coincidir con la que tenia en la lista que ve el
       perfil. inicio/fin (indices del stream completo) identifican al
       puerto sin ambiguedad. */
    const idx = puertosTabla.findIndex((x) => x.inicio === p.inicio && x.fin === p.fin);
    const destino = idx >= 0 ? idx : 0;
    setPuertoAbierto(destino);
    filaPuertoRefs.current[destino]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  /* Anade o quita un valor de una lista de foco (zonaFoco, durezaFoco,
     velFoco): asi cada franja de la leyenda se marca de forma
     independiente y se pueden tener varias encendidas a la vez. */
  const alternarFoco = (setter) => (valor) => {
    setter((actual) => (
      actual.includes(valor) ? actual.filter((v) => v !== valor) : [...actual, valor]
    ));
  };

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

  /*
    Cambiar de actividad sin abrir el desplegable: "ordenadas" va de la
    mas reciente a la mas antigua, asi que ir a la "siguiente" (mas
    reciente) es retroceder una posicion en la lista, e ir a la
    "anterior" (mas antigua) es avanzar una.
  */
  const indiceSalida = ordenadas.findIndex((s) => s.id === sel);
  const irASalidaAnterior = () => {
    if (indiceSalida >= 0 && indiceSalida < ordenadas.length - 1) setSel(ordenadas[indiceSalida + 1].id);
  };
  const irASalidaSiguiente = () => {
    if (indiceSalida > 0) setSel(ordenadas[indiceSalida - 1].id);
  };

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

  useEffect(() => {
    setPuertoFoco(null); setZonaFoco([]); setPuertoAbierto(null); setPuntoHover(null);
  }, [sel]);

  /* Donde cae cada segmento manual DENTRO de esta salida (si es que cae).
     Un segmento puede repetirse varias veces en la misma salida -series,
     intervalos- y cada pasada cuenta como su propio puerto en "Detalles
     de la ruta", igual que ya hace Mis segmentos con sus intentos: por
     eso encontrarTodosLosSegmentosManuales, no solo la primera
     coincidencia. */
  const rangosManuales = useMemo(() => {
    if (!streams) return [];
    return definicionesSegmentos
      .flatMap((def) => encontrarTodosLosSegmentosManuales(streams, def).map((idxs) => ({ ...idxs, def })));
  }, [streams, definicionesSegmentos]);

  /* Edita o borra un segmento manual: recalcula sus coordenadas a partir
     de los nuevos indices y reescribe esa entrada del catalogo
     compartido (definicionesSegmentos). */
  const editarPuerto = (p, nuevoInicio, nuevoFin) => {
    const a = streams?.latlng?.[nuevoInicio], b = streams?.latlng?.[nuevoFin];
    if (!a || !b) return;
    const metros = streams.distancia[nuevoFin] - streams.distancia[nuevoInicio];
    const actualizadas = definicionesSegmentos.map((d) => (d.id === p.manualId
      ? { ...d, latInicio: a[0], lonInicio: a[1], latFin: b[0], lonFin: b[1], metros }
      : d));
    setDefinicionesSegmentos(actualizadas);
    guardarSegmentosManuales(actualizadas);
  };
  const eliminarPuerto = (p) => {
    const actualizadas = definicionesSegmentos.filter((d) => d.id !== p.manualId);
    setDefinicionesSegmentos(actualizadas);
    guardarSegmentosManuales(actualizadas);
  };

  /* Da de alta un segmento nuevo en el catalogo, a partir del tramo recien
     confirmado en Perfil (indices del stream de esta salida). Se guarda
     por coordenadas -no por esos indices, que no significan nada en otra
     salida- para que se pueda reconocer despues en cualquier otra que
     pase por el mismo sitio (ver encontrarSegmentoManual en lib/metrics).
     metros (la longitud real de este tramo) viaja con la definicion para
     que esa misma funcion pueda descartar un pie+cima que coincidan de
     casualidad pero por un camino de otra longitud. */
  const crearSegmentoManual = (inicioIdx, finIdx) => {
    const a = streams?.latlng?.[inicioIdx], b = streams?.latlng?.[finIdx];
    if (!a || !b) return;
    const nueva = {
      id: crypto.randomUUID(),
      nombre: `Segmento ${definicionesSegmentos.length + 1}`,
      latInicio: a[0], lonInicio: a[1],
      latFin: b[0], lonFin: b[1],
      metros: streams.distancia[finIdx] - streams.distancia[inicioIdx],
    };
    const actualizadas = [...definicionesSegmentos, nueva];
    setDefinicionesSegmentos(actualizadas);
    guardarSegmentosManuales(actualizadas);
  };

  /* Los mismos calculos que un puerto detectado antes (metros, pendiente,
     VAM, categoria...), pero sobre lo que el catalogo de segmentos
     manuales encuentra en ESTA salida (rangosManuales, por coordenadas):
     no todos los segmentos marcados en otras salidas tienen por que
     pasar por aqui, y los que si pasan no tienen que pasar por ningun
     minimo -si estan en el catalogo, se muestran tal cual. */
  const puertosTabla = useMemo(() => {
    if (!streams) return [];
    return rangosManuales
      .map(({ inicio, fin, def }) => {
        const p = construirPuerto(streams, inicio, fin);
        return p ? { ...p, manual: true, manualId: def.id, nombreManual: def.nombre } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.kmInicio - b.kmInicio);
  }, [streams, rangosManuales]);

  const reparto = useMemo(
    () => (streams ? repartoZonas(streams, zonas) : null),
    [streams, zonas]
  );
  const dureza = useMemo(() => (streams ? repartoDureza(streams) : null), [streams]);
  const velocidad = useMemo(() => (streams ? repartoVelocidad(streams) : null), [streams]);

  const tieneFC = !!(streams && streams.fc);

  /* ---------- nombres de los segmentos ---------- */

  /* Todo puerto es manual ahora: su nombre viene siempre del catalogo de
     segmentos manuales -el mismo que se ve y se edita en "Mis
     segmentos"-, sin sistema de nombrado automatico de por medio. */
  const nombresPuertos = useMemo(
    () => puertosTabla.map((p, i) => p.nombreManual || `Segmento ${i + 1}`),
    [puertosTabla]
  );

  /* ---------- renombrado, igual que en Mis segmentos ---------- */

  const [editandoPuerto, setEditandoPuerto] = useState(null);
  const [borradorPuerto, setBorradorPuerto] = useState('');

  /* Vacio se queda con el nombre que ya tenia -no hay nada a lo que
     "volver" para un segmento manual. */
  const guardarManualPuerto = (p) => {
    const nombre = borradorPuerto.trim();
    const actualizadas = definicionesSegmentos.map((d) => (d.id === p.manualId
      ? { ...d, nombre: nombre || d.nombre }
      : d));
    setDefinicionesSegmentos(actualizadas);
    guardarSegmentosManuales(actualizadas);
    setEditandoPuerto(null);
  };

  /*
    Selector de modo y panel de submodo, sacados a variables para no
    duplicar el JSX: los usan tanto la vista normal como el overlay
    horizontal, que necesita los mismos controles para poder cambiar de
    vista sin salir de pantalla completa.
  */
  const chipsPrincipales = (
    <div className="chips">
      <button
        aria-pressed={modo === 'relieve'}
        onClick={() => { setModo('relieve'); setZonaFoco([]); setVelFoco([]); setDurezaFoco([]); }}
      >
        Perfil
      </button>
      <button
        aria-pressed={modo === 'dureza'}
        onClick={() => { setModo('dureza'); setZonaFoco([]); setVelFoco([]); }}
      >
        Desnivel
      </button>
      <button
        aria-pressed={modo === 'velocidad'}
        onClick={() => { setModo('velocidad'); setZonaFoco([]); setDurezaFoco([]); }}
      >
        Velocidad
      </button>
      <button
        aria-pressed={modo === 'zonas'}
        disabled={!tieneFC}
        onClick={() => { setModo('zonas'); setDurezaFoco([]); setVelFoco([]); }}
        title={tieneFC ? '' : 'Esta salida no tiene frecuencia cardíaca'}
      >
        Frecuencia cardíaca
      </button>
      {/*
        No es un modo mas -no cambia el color del perfil-, es un panel que
        se abre al lado (ver verMapa mas abajo): por eso alterna con su
        propio interruptor en vez de mover "modo" como los de la
        izquierda.
      */}
      <button
        aria-pressed={verMapa}
        onClick={() => setVerMapa((v) => !v)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <IcoMapa width="14" height="14" />
        Mapa
      </button>
    </div>
  );

  /* compacto=true quita las frases explicativas (el "Selecciona una
     zona..." y el aviso de "sin pulsometro"): en el overlay rotado el alto
     disponible es el ancho del movil, y ese texto es justo lo que sobra
     para dejarle mas sitio al grafico. */
  /*
    Las leyendas de los tres submodos (Desnivel, Velocidad, FC) viven aqui,
    todas en el mismo sitio y con el mismo contenedor de altura minima: asi
    la caja del perfil mide siempre lo mismo tenga o no tenga leyenda la
    pestana activa (Perfil, la vista base, no tiene ninguna), y cambiar de
    pestana no da el salto de tamano que daba antes.
  */
  const panelSubmodo = (compacto) => (
    <div className="perfil-leyenda-hueco">
      {modo === 'dureza' && (
        /* marginLeft: mismo margen (MARGEN_EJE, importado de Perfil) que
           usa el propio perfil para alinear sus controles con el eje del
           grafico. Sin el % de la etapa que cubre cada color -eso ya se ve pintado en el
           propio perfil, aqui solo hace falta saber que pendiente
           representa cada color. */
        <div className="perfil-leyenda" style={{ marginLeft: MARGEN_EJE }}>
          {TRAMOS_DUREZA.map((t) => (
            <button key={t.n} type="button"
              aria-pressed={durezaFoco.includes(t.n)}
              style={durezaFoco.includes(t.n)
                ? { borderBottomColor: t.color, background: `${t.color}26` } : null}
              onClick={() => alternarFoco(setDurezaFoco)(t.n)}>
              <i style={{ background: t.color }} />{t.nombre}
            </button>
          ))}
        </div>
      )}

      {modo === 'velocidad' && velocidad && (
        <div className="perfil-leyenda" style={{ marginLeft: MARGEN_EJE }}>
          {TRAMOS_VELOCIDAD.map((t, i) =>
            velocidad.porcentaje[i] > 0.4 ? (
              <button key={t.n} type="button"
                aria-pressed={velFoco.includes(t.n)}
                style={velFoco.includes(t.n)
                  ? { borderBottomColor: t.color, background: `${t.color}26` } : null}
                onClick={() => alternarFoco(setVelFoco)(t.n)}>
                <i style={{ background: t.color }} />{t.nombre} · {num(velocidad.porcentaje[i], 0)} %
              </button>
            ) : null
          )}
        </div>
      )}

      {modo === 'zonas' && tieneFC && (
        <div className="perfil-leyenda" style={{ marginLeft: MARGEN_EJE }}>
          {zonas.map((z) => (
            <button key={z.n} type="button"
              aria-pressed={zonaFoco.includes(z.n)}
              style={zonaFoco.includes(z.n)
                ? { borderBottomColor: z.color, background: `${z.color}26` } : null}
              onClick={() => alternarFoco(setZonaFoco)(z.n)}>
              <i style={{ background: z.color }} />Z{z.n} {z.nombre}
              {reparto && ` · ${num(reparto.porcentaje[z.n - 1], 0)} %`}
            </button>
          ))}
        </div>
      )}

      {modo === 'zonas' && !tieneFC && !compacto && (
        <div className="callout warn" style={{ marginTop: 0 }}>
          Esta salida se registró sin pulsómetro, así que no hay zonas que pintar.
          Si la grabaste con el móvil en lugar del Garmin, ahí está la razón.
        </div>
      )}
    </div>
  );

  /* Sin salidas tambien hay que pintar la cabecera: desde que esta seccion
     la trae puesta, Dashboard ya no dibuja ninguna por ella y la pagina se
     quedaria sin titulo. */
  if (!ordenadas.length) {
    return (
      <div>
        <div className="top">
          <div>
            <h1>
              <button type="button" className="titulo-clic"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                <IcoActividades className="icono-titulo" />
                Actividades
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
      {/*
        cab-fija ancla el titulo/selector junto con el resumen general
        (Distancia, Desnivel, Tiempo...): los dos se quedan fijos como un
        solo bloque al hacer scroll, no solo el titulo. El .top de dentro
        conserva su propio sticky (queda de mas dentro de un padre ya
        fijo, pero no molesta) para no tocar la regla que usan el resto
        de secciones.
      */}
      <div className="cab-fija">
        <div className="top">
          <div>
            <h1>
              <button type="button" className="titulo-clic"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                <IcoActividades className="icono-titulo" />
                Actividades
              </button>
            </h1>
          </div>
          <div className="sel-salida">
            <div className="salida-nav">
              <BuscadorSalida ordenadas={ordenadas} sel={sel} setSel={setSel} refTerreno={refTerreno} />
              <SelectorSalida ordenadas={ordenadas} sel={sel} setSel={setSel} refTerreno={refTerreno} />
              <div className="salida-nav-flechas">
                <button type="button" className="btn-nav-salida"
                  onClick={irASalidaAnterior}
                  disabled={indiceSalida < 0 || indiceSalida >= ordenadas.length - 1}
                  title="Actividad anterior" aria-label="Actividad anterior">
                  <IcoFlecha width="15" height="15" style={{ transform: 'rotate(90deg)' }} />
                </button>
                <button type="button" className="btn-nav-salida"
                  onClick={irASalidaSiguiente}
                  disabled={indiceSalida <= 0}
                  title="Actividad siguiente" aria-label="Actividad siguiente">
                  <IcoFlecha width="15" height="15" style={{ transform: 'rotate(-90deg)' }} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {salida && (
          <>
            {/* El desplegable ya dice el nombre y la fecha corta; aqui solo se
                anade el dia de la semana, que es lo que situa la salida. */}
            <p className="eyebrow" style={{ marginBottom: 18 }}>
              {fechaLarga(salida.fecha)}
            </p>

            <div className="grid centrado">
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
          </>
        )}
      </div>

      {salida && (
        <>

          {/*
            ---------- perfil ----------
            paddingBottom mas ajustado que el resto de .chart de la app
            (20px por defecto): entre el texto de la leyenda y el borde
            de la caja sobraba aire que aqui no hace falta -la leyenda ya
            trae su propio hueco arriba (perfil-leyenda-hueco).
          */}
          <div className="chart" style={{ marginTop: 26, paddingBottom: 12 }}>
            {/*
              Los modos suben a la cabecera del panel. Debajo del grafico
              estaban en el sitio donde menos se buscan: para cambiar de vista
              hay que mirar primero que vista hay, y eso se mira arriba.
            */}
            <div className="cab-panel">
              <span className="rotulo rotulo-nombre-salida">{salida.nombre}</span>
              {streams && chipsPrincipales}
            </div>

            {cargando && <p className="cargando"><span className="spin" />Cargando el perfil…</p>}
            {fallo && <div className="callout warn">No se pudo cargar el perfil: {fallo}</div>}
            {streams && (
              /*
                El perfil ahora se dibuja de verdad a su ancho reducido
                (60 %) en vez de dibujarse entero y comprimirse con un
                scaleX: as textos, iconos y trazos conservan sus
                proporciones, solo que a un tamano menor -escalados de
                verdad, no aplastados.

                alignItems: 'stretch' (el valor por defecto, pero puesto a
                proposito) hace que el mapa tome la altura que le queda al
                perfil una vez reducido, en vez de tener la suya propia.
              */
              <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
                <div style={{ position: 'relative', flex: verMapa ? '0 0 60%' : '1 1 100%', minWidth: 0 }}>
                  {/*
                    El boton vive encima del propio grafico y no en la
                    cabecera: es una accion sobre el dibujo (verlo mas
                    grande), no un modo mas que elegir junto a
                    dureza/velocidad/FC.
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
                    puertos={puertosTabla}
                    nombres={nombresPuertos}
                    zonas={zonas}
                    modo={modo}
                    zonaFoco={zonaFoco}
                    durezaFoco={durezaFoco}
                    velFoco={velFoco}
                    puertoFoco={puertoFoco}
                    altura={340}
                    amarillo
                    onPuertoClick={irAPuerto}
                    onHoverChange={verMapa ? setPuntoHover : undefined}
                    llana={tipoRuta(salida, refTerreno) === 'llano'}
                    marcado
                    onCrearPuerto={crearSegmentoManual}
                    onEditarPuerto={editarPuerto}
                    onEliminarPuerto={eliminarPuerto}
                  />
                </div>

                {verMapa && (
                  <div style={{ flex: '0 0 40%', minWidth: 0 }}>
                    <Mapa streams={streams} puertos={puertosTabla} hoverIdx={puntoHover} />
                  </div>
                )}
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
                  puertos={puertosTabla}
                  nombres={nombresPuertos}
                  zonas={zonas}
                  modo={modo}
                  zonaFoco={zonaFoco}
                  durezaFoco={durezaFoco}
                  velFoco={velFoco}
                  puertoFoco={puertoFoco}
                  altura={altoHorizontal}
                  amarillo
                  compacto
                  onPuertoClick={irAPuerto}
                  llana={tipoRuta(salida, refTerreno) === 'llano'}
                />

                {panelSubmodo(true)}
              </div>
            </div>
          )}

          {/* ---------- puertos ---------- */}
          {puertosTabla.length > 0 && (
            <>
              <h2>Detalles de la ruta</h2>

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
                    {puertosTabla.map((p, i) => {
                      const c = categoriaPuerto(p.metros, p.pendiente);
                      return (
                        <Fragment key={i}>
                        <tr
                          ref={(el) => (filaPuertoRefs.current[i] = el)}
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
                              {editandoPuerto === i ? (
                                <input
                                  autoFocus
                                  value={borradorPuerto}
                                  onChange={(e) => setBorradorPuerto(e.target.value)}
                                  onBlur={() => guardarManualPuerto(p)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') guardarManualPuerto(p);
                                    if (e.key === 'Escape') setEditandoPuerto(null);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  placeholder="Nombre del segmento"
                                  style={{ width: '100%', maxWidth: 220 }}
                                />
                              ) : (
                                <span
                                  onClick={(e) => {
                                    /* La fila entera despliega el detalle: sin
                                       esto, editar el nombre lo abriria a la vez. */
                                    e.stopPropagation();
                                    setEditandoPuerto(i);
                                    setBorradorPuerto(p.nombreManual || '');
                                  }}
                                  title="Pulsa para renombrar"
                                  style={{ cursor: 'text', borderBottom: '1px dotted var(--line2)' }}>
                                  {nombresPuertos[i]}
                                </span>
                              )}
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

                          Igual que en Resumen: fila siempre montada -no
                          {puertoAbierto === i && (...)}- para que el cierre
                          tambien se pueda animar, con el alto real resuelto
                          por CSS (.fila-detalle-panel, grid-template-rows
                          0fr/1fr) en vez de por esta condicion.
                        */}
                        <tr className="fila-detalle">
                          <td colSpan={11} className="fila-detalle-panel-td">
                            <div className={`fila-detalle-panel${puertoClaseAbierta === i ? ' abierta' : ''}`}>
                              <div className="fila-detalle-inner">
                                {streams && (
                                  <PerfilPuerto streams={streams} puerto={p}
                                    indice={i} cfg={cfg} zonas={zonas}
                                    nombre={nombresPuertos[i]} />
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

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
              puertos={puertosTabla} cfg={cfg} zonas={zonas} umbral={umbral}
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
/*
  Buscador de actividades por nombre: un boton de lupa que alterna un
  panel con un campo de texto, a la izquierda del propio desplegable. No
  esta integrado dentro de SelectorSalida a proposito -el usuario lo pidio
  como un control aparte-, pero reutiliza su misma lista de resultados
  (selector-salida-lista) para que las dos formas de elegir salida se lean
  como parte del mismo control.
*/
function BuscadorSalida({ ordenadas, sel, setSel, refTerreno }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const raiz = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => {
      if (raiz.current && !raiz.current.contains(e.target)) { setAbierto(false); setTexto(''); }
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);

  /* Foco automatico al abrir: es un buscador, se abre para escribir ya
     mismo, no para tener que volver a hacer click en el campo. */
  useEffect(() => {
    if (abierto) inputRef.current?.focus();
  }, [abierto]);

  const resultados = useMemo(() => {
    const q = texto.trim().toLowerCase();
    if (!q) return [];
    return ordenadas.filter((s) => s.nombre.toLowerCase().includes(q));
  }, [ordenadas, texto]);

  return (
    <div className="buscador-salida" ref={raiz}>
      <button type="button" className="btn-buscar-salida" aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
        title="Buscar actividad" aria-label="Buscar actividad">
        <IcoBuscar width="16" height="16" />
      </button>

      {abierto && (
        <div className="buscador-salida-panel">
          <input ref={inputRef} type="text" value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por nombre…" />

          {texto.trim() && (
            <ul className="selector-salida-lista buscador-salida-lista" role="listbox">
              {resultados.length === 0 && (
                <li className="buscador-salida-vacio">Sin resultados</li>
              )}
              {resultados.map((s) => {
                const insignia = TIPO_INSIGNIA[tipoRuta(s, refTerreno)];
                return (
                  <li key={s.id}>
                    <button type="button" role="option" aria-selected={s.id === sel}
                      onClick={() => { setSel(s.id); setAbierto(false); setTexto(''); }}>
                      <span className="cat" style={{ background: insignia.fondo, color: insignia.tinta }}>
                        {insignia.codigo}
                      </span>
                      <span className="fecha">{fechaDDMMAA(s.fecha)}</span>
                      <span className="nombre">{s.nombre}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/*
  Reemplaza al <select> nativo porque este necesita la insignia de color
  del tipo de salida (LLA/COL/MON), la misma que ya usa la tabla de "Tus
  salidas" en Resumen -algo que un <option> no puede pintar, solo texto
  plano. Mismo patron de boton-mas-panel que el desplegable de escala en
  Logros: un boton que alterna un panel absoluto debajo, y un listener
  de click fuera para cerrarlo.
*/
function SelectorSalida({ ordenadas, sel, setSel, refTerreno }) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef(null);

  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => {
      if (raiz.current && !raiz.current.contains(e.target)) setAbierto(false);
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);

  const actual = ordenadas.find((s) => s.id === sel) || null;

  return (
    <div className="selector-salida" ref={raiz}>
      <button type="button" className="selector-salida-boton" aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}>
        {actual && (
          <>
            <span className="cat" style={{
              background: TIPO_INSIGNIA[tipoRuta(actual, refTerreno)].fondo,
              color: TIPO_INSIGNIA[tipoRuta(actual, refTerreno)].tinta,
            }}>
              {TIPO_INSIGNIA[tipoRuta(actual, refTerreno)].codigo}
            </span>
            <span className="fecha">{fechaDDMMAA(actual.fecha)}</span>
            <span className="nombre">{actual.nombre}</span>
          </>
        )}
        <IcoFlecha className="chevron" />
      </button>

      {abierto && (
        <ul className="selector-salida-lista" role="listbox">
          {ordenadas.map((s) => {
            const insignia = TIPO_INSIGNIA[tipoRuta(s, refTerreno)];
            return (
              <li key={s.id}>
                <button type="button" role="option" aria-selected={s.id === sel}
                  onClick={() => { setSel(s.id); setAbierto(false); }}>
                  <span className="cat" style={{ background: insignia.fondo, color: insignia.tinta }}>
                    {insignia.codigo}
                  </span>
                  <span className="fecha">{fechaDDMMAA(s.fecha)}</span>
                  <span className="nombre">{s.nombre}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Dato({ k, v, u, d }) {
  return (
    <div className="stat" title={d || undefined}>
      <div className="k">{k}</div>
      <div className="v">{v} {u && <small>{u}</small>}</div>
    </div>
  );
}
