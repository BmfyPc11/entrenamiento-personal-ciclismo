'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Entrenamientos from './Entrenamientos';
import Perfil from './Perfil';
import Datos from './Datos';
import Objetivos from './Objetivos';
import Ascensiones from './Ascensiones';
import Evolucion from './Evolucion';
import Rutas from './Rutas';
import AnalizadorGPX from './AnalizadorGPX';
import Logros, { TopLogros, calcularLogros, PopupLogrosActualizados } from './Logros';
import UltimosDias from './UltimosDias';
import { Flecha, ThOrden, ordenarPor } from './Tablas';
import Consejo from './Consejo';
import { IcoAviso } from './Iconos';
import Layout, { SECCIONES } from './Layout';
import { OBJETIVOS_INICIALES } from './objetivosLib';
import { Linea, Barras, Carga } from './Graficos';
import {
  PERFILES_BICI, detectarPuertos, serieCarga, umbralEstimado,
  vatios, vatiosPuerto, repartoZonas, repartoGlobal,
  calcularZonas, ultimosDias, consejoEntrenador, normalizarAltitud,
  velocidadMaximaLlano, tipoRuta, TIPO_INSIGNIA, ORDEN_TIPO, referenciaTerreno,
  num, duracion, duracionHMS, fechaCorta, fechaDDMMAA, kmh, km,
} from '@/lib/metrics';

/* La lista de secciones vive en Layout, que es quien la pinta. */

const CFG_INICIAL = {
  peso: 75, bici: 11, fcmax: 185, cda: 0.36, crr: 0.008, perfil: 'gravel_alto',
  modeloZonas: 'clasico', zonasPropias: null,
};

/*
  Lee la cache de streams guardada en el navegador de una carga anterior.
  Perezoso (se pasa como funcion a useState) para no tocar localStorage en
  cada render, solo una vez al montar. Si el JSON esta corrupto o no hay
  nada guardado, arranca vacio -exactamente como arrancaba siempre antes
  de este cambio.
*/
function leerCacheStreams() {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem('streams_ciclismo')) || {};
  } catch {
    return {};
  }
}

/*
  Strava manda en cada respuesta cuanto llevas gastado de tus dos topes.
  Se copia esta funcion de lib/strava.js en vez de importarla porque ese
  archivo tambien usa next/headers (cookies), que no se puede empaquetar
  en un componente de cliente -aunque solo se use una funcion pura suya.
*/
function cercaDelLimite(limite) {
  if (!limite) return false;
  return limite.corto.usado / limite.corto.tope > 0.9
    || limite.dia.usado / limite.dia.tope > 0.9;
}

export default function Dashboard({ atleta }) {
  const [salidas, setSalidas] = useState(null);
  const [error, setError] = useState(null);
  const [cache, setCache] = useState(leerCacheStreams);
  const [pestana, setPestana] = useState('resumen');
  const [cfg, setCfg] = useState(CFG_INICIAL);
  const [excluidas, setExcluidas] = useState(new Set());
  const [rango, setRango] = useState({ desde: '', hasta: '' });
  const [objetivos, setObjetivos] = useState({ ...OBJETIVOS_INICIALES });

  /* La vara de medir del terreno sale del historial entero, no del rango
     de fechas elegido: si no, filtrar por "ultima semana" recalificaria
     todas las salidas contra la mejor de esa semana. */
  const refTerreno = useMemo(() => referenciaTerreno(salidas), [salidas]);
  const [refrescando, setRefrescando] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);

  /*
    Aviso de "salidas sin sincronizar" al abrir la app. null = todavia no
    se ha comprobado o no hace falta avisar; {cantidad, saturado} cuando
    si. bannerCerrado no se guarda en ningun sitio a proposito -es una
    eleccion, no un bug-: si sigues sin sincronizar, la proxima vez que
    abras la app te lo vuelve a decir en vez de callarselo para siempre.
  */
  const [avisoNuevas, setAvisoNuevas] = useState(null);
  const [bannerCerrado, setBannerCerrado] = useState(false);

  /* Ultimo uso de la API que Strava ha informado, para poder frenar la
     sincronizacion de fondo antes de chocar con el limite. Un ref y no un
     estado: cambia con cada peticion y no debe disparar un re-render. */
  const limiteRef = useRef(null);

  /* Copia siempre al dia de "cache", para leerla dentro del bucle de
     fondo sin que su efecto tenga que depender de ella (ver mas abajo:
     si dependiera de cache, cada salida que va llegando reiniciaria el
     propio bucle que la esta rellenando). */
  const cacheRef = useRef({});
  useEffect(() => { cacheRef.current = cache; }, [cache]);

  /*
    Enlace desde una tarjeta de "Tus estadisticas" (salida mas larga, vel.
    punta...) hasta esa salida concreta en Entrenamientos. Como esa pestana
    se desmonta en cuanto sales de ella (mas abajo, "pestana ===
    'entrenamientos'"), le basta con leer este id UNA vez al montar -de
    ahi el useState perezoso en Entrenamientos en vez de un efecto- y
    avisar por onSalidaInicialConsumida para que aqui se limpie. Sin ese
    aviso, volver a la pestana mas tarde por el menu normal reabriria
    siempre esa misma salida antigua en vez de la mas reciente.
  */
  const [saltarASalida, setSaltarASalida] = useState(null);
  const irASalida = (id) => { setSaltarASalida(id); setPestana('entrenamientos'); };

  /* --- preferencias guardadas en el navegador --- */
  useEffect(() => {
    try {
      const g = localStorage.getItem('cfg_ciclismo');
      if (g) setCfg({ ...CFG_INICIAL, ...JSON.parse(g) });
      const e = localStorage.getItem('excluidas_ciclismo');
      if (e) setExcluidas(new Set(JSON.parse(e)));
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem('cfg_ciclismo', JSON.stringify(cfg)); } catch {}
  }, [cfg]);
  useEffect(() => {
    try { localStorage.setItem('excluidas_ciclismo', JSON.stringify([...excluidas])); } catch {}
  }, [excluidas]);

  /*
    La cache de streams tambien se guarda en el navegador. Sin esto, cada
    F5 la vaciaba y el efecto de mas abajo volvia a pedir a Strava el
    detalle de TODAS las salidas otra vez -33 peticiones por cada recarga,
    aunque no hubiera ninguna salida nueva. Es justo lo que agoto el
    limite de la API: ver PROYECTO.md.

    Un stream ya grabado no cambia, asi que no hace falta ninguna
    caducidad: solo se vuelve a pedir si "Actualizar" trae una salida que
    no estaba antes. Si el navegador se queda sin cuota (localStorage
    ronda los 5 MB y el historial solo crece), se descartan aqui las
    salidas mas antiguas -las mas recientes son las que de verdad se
    consultan a menudo- y si ni asi cabe, la cache sigue funcionando en
    memoria para esta sesion, solo que no sobrevive a la siguiente recarga.

    El recorte subio de 15 a 40: con 15, cualquiera con mas actividades
    que eso volvia a pagar la descarga completa de las salidas mas viejas
    en cada visita -era el propio recorte el que causaba trafico de mas,
    no solo la falta de cache.
  */
  useEffect(() => {
    const ids = Object.keys(cache);
    if (!ids.length) return;
    try {
      localStorage.setItem('streams_ciclismo', JSON.stringify(cache));
      return;
    } catch {}
    try {
      const recientes = (salidas || [])
        .map((s) => String(s.id))
        .filter((id) => cache[id])
        .slice(-40);
      const recortada = Object.fromEntries(recientes.map((id) => [id, cache[id]]));
      localStorage.setItem('streams_ciclismo', JSON.stringify(recortada));
    } catch {
      // Sin espacio ni para eso: se sigue solo en memoria, como antes de este cambio.
    }
  }, [cache, salidas]);

  /* --- carga de actividades, desde la base de datos --- */
  const cargar = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch('/api/activities', { cache: 'no-store' });
      if (r.status === 401) { window.location.reload(); return null; }
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setSalidas(j.salidas);
      // si Strava tiene tu peso, se usa la primera vez
      if (atleta?.peso && cfg.peso === CFG_INICIAL.peso) {
        setCfg((c) => ({ ...c, peso: Math.round(atleta.peso) }));
      }
      return j.salidas;
    } catch (e) {
      setError('No se pudieron leer tus actividades. Prueba a recargar la página.');
      return null;
    }
  }, [atleta, cfg.peso]);

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, []);

  /*
    Comprobacion ligera de salidas sin sincronizar, una vez al abrir la
    app -no en cada cambio de pestana. Es la unica llamada a Strava fuera
    de "Actualizar": una peticion (ver /api/sync/check), nada que ver con
    el coste de una sincronizacion de verdad.
  */
  useEffect(() => {
    fetch('/api/sync/check', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.cantidad > 0) setAvisoNuevas(j); })
      .catch(() => {});
  }, []);

  /* --- streams bajo demanda, con cache --- */
  const pedirStreams = useCallback(async (id) => {
    const r = await fetch(`/api/streams?id=${id}`, { cache: 'no-store' });
    /*
      El cuerpo se lee siempre, aunque la respuesta sea un error: es ahi
      donde viaja el "limite" que necesita el bucle de fondo para saber
      cuando parar. Leerlo solo en el camino feliz (como antes) perdia
      justo el dato que hacia falta cuando mas hacia falta -al borde del
      limite, que es cuando empiezan a llegar los 502.
    */
    const j = await r.json().catch(() => ({}));
    if (j.limite) limiteRef.current = j.limite;
    if (!r.ok) throw new Error(r.status === 502 ? 'Strava no devolvió el detalle' : 'Error de conexión');
    if (j.error) throw new Error(j.error);
    /*
      Una respuesta sin series utiles no se guarda en la cache. Si se
      guardara un hueco, el resto del panel lo tomaria por una salida ya
      analizada y reventaria al leerla: el reparto por zonas y el detalle
      de puertos dan por hecho que lo que hay en cache es valido.
    */
    if (!j.streams || !j.streams.distancia || !j.streams.distancia.length) {
      throw new Error('Strava no devolvió las series de esta salida');
    }
    /* Se corrige aqui para que todo el panel vea siempre la serie saneada. */
    const st = normalizarAltitud(j.streams);
    setCache((c) => ({ ...c, [id]: st }));
    return st;
  }, []);

  /* --- popup de logros actualizados, tras un "Actualizar" con actividad nueva --- */
  const [popupLogros, setPopupLogros] = useState(null);

  /* --- sincronizacion con Strava, a mano desde "Actualizar" --- */
  const sincronizar = useCallback(async () => {
    setRefrescando(true);
    setError(null);
    setAvisoNuevas(null);

    /*
      Instantanea de "antes de sincronizar": salidas y cache tal cual
      estan justo al pulsar el boton. Se guarda ya, antes de la llamada
      a Strava, porque es la unica referencia valida para saber despues
      cuanto ha subido cada logro -pedirla mas tarde ya reflejaria la
      actividad nueva.
    */
    const idsAntes = new Set(salidas.map((s) => s.id));
    const historicasAntes = salidas.filter((s) => !excluidas.has(s.id));
    const valorAntesPorId = Object.fromEntries(
      calcularLogros(historicasAntes, cache, cfg, refTerreno).map((l) => [l.id, l.valor])
    );

    try {
      const r = await fetch('/api/sync', { method: 'POST', cache: 'no-store' });
      if (r.status === 401) { window.location.reload(); return; }
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      if (j.aviso === 'limite_alcanzado') {
        setError('Strava ha limitado las peticiones por unos minutos. Se sincronizó lo que dio tiempo.');
      }

      const salidasNuevas = await cargar();

      /*
        "detalleNuevo" (cuantas salidas no tenian streams guardados antes
        de este sync, ver /api/sync) es la senal de que ha llegado
        actividad de verdad nueva, no solo la misma lista de siempre.
        Solo entonces merece la pena montar el popup: calcular el
        "despues" de los 33 logros para nada, cuando no hay nada nuevo,
        es trabajo tirado en cada pulsacion de "Actualizar".
      */
      if (j.detalleNuevo > 0 && salidasNuevas) {
        const idsNuevas = salidasNuevas.filter((s) => !idsAntes.has(s.id)).map((s) => s.id);

        /*
          Los streams de las salidas nuevas ya estan en Postgres -el
          propio /api/sync los acaba de guardar-, asi que pedirlos aqui
          por /api/streams es una lectura local, no una llamada a
          Strava: no compite por el limite de la API. Sin este paso
          exprofeso, logros como Tocar el cielo o Escalador de primera
          se quedarian sin la actividad nueva hasta que le tocara su
          turno en la carga de fondo, y el popup los daria por no
          modificados aunque de verdad hayan subido.
        */
        const streamsNuevos = {};
        await Promise.all(idsNuevas.map(async (id) => {
          try { streamsNuevos[id] = await pedirStreams(id); } catch { /* sin stream, como el resto del panel */ }
        }));

        const cacheDespues = { ...cache, ...streamsNuevos };
        const historicasDespues = salidasNuevas.filter((s) => !excluidas.has(s.id));
        const refTerrenoDespues = referenciaTerreno(salidasNuevas);

        const modificados = calcularLogros(historicasDespues, cacheDespues, cfg, refTerrenoDespues)
          .map((l) => ({ ...l, valorAntes: valorAntesPorId[l.id] ?? 0, valorDespues: l.valor }))
          .filter((l) => l.valorDespues - l.valorAntes > 1e-9);

        if (modificados.length) setPopupLogros(modificados);
      }
    } catch (e) {
      setError(
        e.message === 'limite_alcanzado'
          ? 'Strava ha alcanzado su límite de peticiones. Espera unos 15 minutos y vuelve a intentarlo.'
          : 'No se pudo sincronizar con Strava. Prueba de nuevo en un momento.'
      );
    } finally {
      setRefrescando(false);
    }
  }, [cargar, salidas, cache, cfg, excluidas, refTerreno, pedirStreams]);

  /*
    Carga automatica en segundo plano.

    El reparto por zonas, el umbral estimado y el listado de ascensiones
    necesitan el detalle completo de cada salida, no solo el resumen que
    da la lista de actividades. Antes de la v3.1 ese detalle se traia de
    golpe para todas las salidas; al repartir el trabajo en pestañas
    quedo sin disparador, y "Tus datos" se quedaba vacio hasta que el
    usuario abria cada salida a mano en Entrenamientos.

    Este efecto rellena la cache solo, de una en una para no saturar a
    Strava, nada mas tener la lista de salidas. Si ya estaba en cache
    (por ejemplo tras un "Actualizar") no la vuelve a pedir.

    Dos ajustes mas sobre la version original:

    - Va de la salida mas reciente a la mas antigua ("salidas" llega
      ordenado al reves, de la mas vieja a la mas nueva): es mas probable
      que sea una salida reciente la que se abra a mano mientras esto
      sigue trabajando detras, y asi le toca antes su turno.

    - Antes de pedir cada una, mira cacheRef por si ya llego mientras
      tanto por otro camino -normalmente porque el usuario abrio esa
      salida en Entrenamientos y eso la pidio directamente-. Sin esta
      comprobacion se acababa pidiendo dos veces la misma salida: una
      vez la que la abriste tu, y otra cuando le tocaba el turno aqui.
  */
  const [fondo, setFondo] = useState({ activo: false, hechas: 0, total: 0 });

  useEffect(() => {
    if (!salidas || !salidas.length) return;
    const pendientes = salidas.filter((s) => !cache[s.id]).slice().reverse();
    if (!pendientes.length) return;

    let cancelado = false;
    (async () => {
      setFondo({ activo: true, hechas: 0, total: pendientes.length });
      for (let i = 0; i < pendientes.length; i++) {
        if (cancelado) break;
        /*
          Si Strava ya avisa que vamos por encima del 90 % de cualquiera
          de los dos topes, se corta aqui: mejor dejar salidas sin
          detalle hasta la proxima carga que ser la peticion de mas que
          hace saltar el 429 para el resto de la app (o para manana).
        */
        if (cercaDelLimite(limiteRef.current)) break;
        if (!cacheRef.current[pendientes[i].id]) {
          try { await pedirStreams(pendientes[i].id); } catch { /* una salida rota no debe frenar el resto */ }
          /* Deja un respiro mayor entre peticiones -antes eran 200 ms-
             para que este barrido de fondo compita menos por red y CPU
             con lo que el usuario este haciendo justo despues de cargar
             la pagina. */
          if (!cancelado) await new Promise((r) => setTimeout(r, 400));
        }
        if (!cancelado) setFondo({ activo: true, hechas: i + 1, total: pendientes.length });
      }
      if (!cancelado) setFondo((f) => ({ ...f, activo: false }));
    })();

    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salidas]);

  /*
    Dos filtros encadenados. El de fechas acota el periodo que se quiere
    analizar; el manual descarta salidas concretas que no representan tu
    rendimiento (rutas acompañando a alguien, errores de registro).
  */
  const enRango = useMemo(() => {
    if (!salidas) return [];
    if (!rango.desde && !rango.hasta) return salidas;
    return salidas.filter((s) => {
      const d = s.fecha.slice(0, 10);
      if (rango.desde && d < rango.desde) return false;
      if (rango.hasta && d > rango.hasta) return false;
      return true;
    });
  }, [salidas, rango]);

  const activas = useMemo(
    () => enRango.filter((s) => !excluidas.has(s.id)),
    [enRango, excluidas]
  );

  /* Logros de volumen (semanal, mensual, anual, historico...) son
     records de toda la vida, no del rango de fechas que este mirando
     "Tus estadisticas" en este momento: usan todo el historial, solo
     sin las salidas marcadas como no representativas. */
  const historicas = useMemo(
    () => (salidas ? salidas.filter((s) => !excluidas.has(s.id)) : []),
    [salidas, excluidas]
  );

  const umbral = useMemo(() => {
    const todos = Object.entries(cache).flatMap(([id, st]) =>
      excluidas.has(Number(id)) ? [] : detectarPuertos(st, { minMetros: 1000, minDesnivel: 80, minPend: 4 })
    );
    return umbralEstimado(todos, cfg) || 150;
  }, [cache, cfg, excluidas]);

  /*
    Se calcula una vez por carga completa, no una vez por salida que va
    llegando.

    Por dentro, velocidadMaximaLlano agrupa las anomalias de GPS de todas
    las salidas con un coste que crece con el cuadrado de cuantas
    anomalias haya. Con esta cuenta son 325 y tarda unos 4 ms, nada -pero
    el useMemo anterior repetia la funcion ENTERA cada vez que cache
    cambiaba de referencia, y cache cambia una vez por cada salida que
    pedirStreams va trayendo en segundo plano. Con 12 salidas cargando
    eso eran 8 pasadas de mas por el mismo resultado (31 ms en vez de
    4). El desperdicio crece con el numero de salidas, no es fijo.

    El efecto de abajo solo dispara cuando fondo.activo pasa a false, es
    decir, cuando la carga de fondo ya ha terminado: se calcula una vez
    por carga real. El efecto secundario -y el que se pedia aqui- es que
    el dato deja de cambiar de valor delante del usuario mientras van
    llegando salidas: aparece una sola vez, ya con el resultado final.
  */
  const [velMaxLlano, setVelMaxLlano] = useState(null);
  useEffect(() => {
    if (fondo.activo) return;
    setVelMaxLlano(velocidadMaximaLlano(cache, activas));
  }, [fondo.activo, cache, activas]);

  const masaTotal = cfg.peso + cfg.bici;
  const wPara30 = vatios(30 / 3.6, 0, masaTotal, cfg.cda, cfg.crr);

  /* Zonas del usuario: una sola fuente de verdad para todo el panel. */
  const zonas = useMemo(() => calcularZonas(cfg), [cfg]);

  const dias = useMemo(
    () => ultimosDias(activas, cfg, zonas, umbral, 30, refTerreno),
    [activas, cfg, zonas, umbral]
  );
  const consejo = useMemo(
    () => consejoEntrenador(activas, cfg, zonas, umbral),
    [activas, cfg, zonas, umbral]
  );
  const global = useMemo(
    () => repartoGlobal(cache, zonas, excluidas),
    [cache, zonas, excluidas]
  );
  /* Mismo reparto por zonas, pero acotado al periodo del filtro de fechas
     de Resumen -a diferencia de "global", que es todo el historial y
     alimenta la pestaña Carga. */
  const repartoResumen = useMemo(
    () => repartoGlobal(cache, zonas, excluidas, new Set(activas.map((s) => s.id))),
    [cache, zonas, excluidas, activas]
  );

  if (error && !salidas) {
    return (
      <div className="wrap">
        <div className="login">
          <h1>Algo falló</h1>
          <div className="callout warn" style={{ textAlign: 'left' }}>{error}</div>
          <button onClick={cargar}>Reintentar</button>
        </div>
      </div>
    );
  }

  if (!salidas) {
    return (
      <div className="wrap">
        <p className="cargando"><span className="spin" />Leyendo tus actividades de Strava…</p>
      </div>
    );
  }

  const seccionActual = SECCIONES.find(([id]) => id === pestana) || [];
  const titulo = seccionActual[1] || '';
  const IconoTitulo = seccionActual[2];

  return (
    <Fragment>
    {avisoNuevas && !bannerCerrado && (
      <div className="banner-sync">
        <span>
          {avisoNuevas.saturado
            ? 'Más de 10 salidas sin sincronizar'
            : `${avisoNuevas.cantidad} salida${avisoNuevas.cantidad === 1 ? '' : 's'} nueva${avisoNuevas.cantidad === 1 ? '' : 's'} sin sincronizar`}
        </span>
        <button type="button" onClick={sincronizar} disabled={refrescando}>
          {refrescando ? 'Actualizando…' : 'Actualizar ahora'}
        </button>
        <button type="button" className="banner-sync-cerrar"
          onClick={() => setBannerCerrado(true)} aria-label="Cerrar aviso">
          ✕
        </button>
      </div>
    )}
    <Layout seccion={pestana} setSeccion={setPestana} atleta={atleta}
      onActualizar={sincronizar} refrescando={refrescando}
      abierto={menuAbierto} setAbierto={setMenuAbierto}>
    <div className="wrap">
      {/*
        Entrenamientos y Logros pintan su propia cabecera: Entrenamientos
        porque el selector de salida va junto al titulo, Logros porque
        necesita la fila de subpestanas justo debajo. El resto de secciones
        usa esta generica hasta que les toque su pasada de la fase 3.
      */}
      {pestana !== 'entrenamientos' && pestana !== 'logros' && (
        <div className="top">
          <div>
            <h1>
              <button type="button" className="titulo-clic"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                {IconoTitulo && <IconoTitulo className="icono-titulo" />}{titulo}
              </button>
            </h1>
          </div>
        </div>
      )}

      {error && <div className="callout warn">{error}</div>}

      {pestana === 'resumen' && (
        <Estadisticas salidas={activas} todas={salidas} excluidas={excluidas} cfg={cfg} umbral={umbral}
          enRango={enRango} rango={rango} setRango={setRango} velMaxLlano={velMaxLlano}
          irASalida={irASalida} />
      )}
      {pestana === 'resumen' && <TopLogros salidas={historicas} cache={cache} cfg={cfg} refTerreno={refTerreno} />}
      {pestana === 'resumen' && <Consejo consejo={consejo} />}

      {pestana === 'resumen' && (
        <Resumen salidas={activas} cfg={cfg} umbral={umbral} masaTotal={masaTotal}
          excluidas={excluidas} setExcluidas={setExcluidas} enRango={enRango}
          cache={cache} dias={dias} pedirStreams={pedirStreams} irASalida={irASalida}
          zonas={zonas} reparto={repartoResumen} refTerreno={refTerreno} />
      )}
      {pestana === 'entrenamientos' && (
        <Entrenamientos salidas={salidas} cfg={cfg} zonas={zonas} umbral={umbral} cache={cache}
          pedirStreams={pedirStreams} salidaInicial={saltarASalida}
          onSalidaInicialConsumida={() => setSaltarASalida(null)} refTerreno={refTerreno} />
      )}
      {pestana === 'datos' && (
        <Datos cfg={cfg} setCfg={setCfg} zonas={zonas} />
      )}
      {pestana === 'ascensiones' && (
        <Ascensiones salidas={activas} cache={cache} excluidas={excluidas}
          cfg={cfg} zonas={zonas} pedirStreams={pedirStreams} />
      )}
      {pestana === 'carga' && (
        <>
          <Evolucion salidas={activas} cache={cache} excluidas={excluidas}
            zonas={zonas} fondo={fondo} />
          <CargaTab salidas={activas} cfg={cfg} umbral={umbral} zonas={zonas} global={global} />
        </>
      )}
      {pestana === 'rutas' && (
        <Rutas salidas={activas} cache={cache} excluidas={excluidas} cfg={cfg} zonas={zonas}
          refTerreno={refTerreno} />
      )}

      {pestana === 'analizador' && (
        <AnalizadorGPX salidas={activas} cache={cache} excluidas={excluidas}
          cfg={cfg} zonas={zonas} />
      )}

      {pestana === 'objetivos' && (
        <Objetivos salidas={activas} cfg={cfg} cache={cache} excluidas={excluidas}
          masaTotal={masaTotal} objetivos={objetivos} setObjetivos={setObjetivos}
          refTerreno={refTerreno} />
      )}

      {pestana === 'logros' && <Logros salidas={historicas} cache={cache} cfg={cfg} atleta={atleta}
        refTerreno={refTerreno} />}

    </div>
    </Layout>

    {popupLogros && (
      <PopupLogrosActualizados logros={popupLogros} onCerrar={() => setPopupLogros(null)} />
    )}
    </Fragment>
  );
}

/* ============================================================ */

function Dato({ k, v, u, d, cl, dEnHover, delta, deltaDecimales = 0, deltaUnidad, tituloDelta }) {
  return (
    <div className={`stat${dEnHover ? ' con-detalle' : ''}`} tabIndex={dEnHover && d ? 0 : undefined}>
      <div className="k">{k}</div>
      <div className="v">{v} {u && <small>{u}</small>}</div>
      {delta != null && (
        <div className={`delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}`} title={tituloDelta}>
          {delta > 0 ? '▲' : delta < 0 ? '▼' : '–'} {num(Math.abs(delta), deltaDecimales)}
          {deltaUnidad ? ` ${deltaUnidad}` : ''}
        </div>
      )}
      {d && <div className={`d ${cl || ''}`}>{d}</div>}
    </div>
  );
}

/*
  Lo primero que se ve al entrar en Resumen: el estado actual, antes de
  nada mas. El filtro de fechas vive aqui mismo, entre el titulo y las
  cifras, porque es lo que decide que periodo resumen: verlo justo antes
  evita tener que buscarlo mas abajo para entender a que corresponden.
*/
function Estadisticas({ salidas, todas, excluidas, cfg, umbral, enRango, rango, setRango,
  velMaxLlano, irASalida }) {
  /* Limites reales del historial, para acotar los selectores de fecha */
  const limites = useMemo(() => {
    if (!enRango.length && !salidas.length) return null;
    const rango2 = enRango.length ? enRango : salidas;
    return { min: rango2[0].fecha.slice(0, 10), max: rango2[rango2.length - 1].fecha.slice(0, 10) };
  }, [enRango, salidas]);

  const atajo = (dias) => {
    const hoy = new Date();
    const desde = new Date(hoy.getTime() - dias * 864e5);
    setRango({ desde: desde.toISOString().slice(0, 10), hasta: hoy.toISOString().slice(0, 10) });
  };

  /* Un atajo esta "activo" cuando el rango actual es exactamente el que
     produciria hoy -asi si tocas las fechas a mano el chip se apaga solo,
     en vez de quedarse marcado sobre un rango que ya no es el suyo. */
  const activoAtajo = (dias) => {
    if (!rango.desde || !rango.hasta) return false;
    const hoy = new Date();
    const desdeEsperado = new Date(hoy.getTime() - dias * 864e5).toISOString().slice(0, 10);
    return rango.desde === desdeEsperado && rango.hasta === hoy.toISOString().slice(0, 10);
  };

  /* Tocar un atajo ya activo lo quita -vuelve a "Todo el historial"- en
     vez de dejarlo pulsado sin forma de deshacerlo salvo borrando las
     fechas a mano. */
  const toggleAtajo = (dias) => {
    if (activoAtajo(dias)) setRango({ desde: '', hasta: '' });
    else atajo(dias);
  };

  const suma = (f) => salidas.reduce((a, s) => a + f(s), 0);
  const masLarga = salidas.length
    ? salidas.reduce((a, s) => (s.distancia > a.distancia ? s : a))
    : null;

  /* Misma lista de salidas con la que se calculo velMaxLlano (Dashboard le
     pasa "activas" a los dos), asi que la salida ganadora siempre esta
     aqui dentro. */
  const salidaVel = velMaxLlano ? salidas.find((s) => s.id === velMaxLlano.salidaId) : null;

  /*
    Tramo inmediatamente anterior, de la misma duracion que el elegido, para
    poder comparar "vas a mas o a menos" sin salir de Resumen. Sin fechas
    elegidas (Todo el historial) no hay un tramo anterior que tenga sentido,
    asi que no se calcula nada y las flechas no aparecen.
  */
  const anterior = useMemo(() => {
    if (!rango.desde || !rango.hasta) return null;
    const msDia = 864e5;
    const ini = new Date(rango.desde), fin = new Date(rango.hasta);
    const dias = Math.round((fin - ini) / msDia) + 1;
    const prevFin = new Date(ini.getTime() - msDia);
    const prevIni = new Date(prevFin.getTime() - (dias - 1) * msDia);
    return { desde: prevIni.toISOString().slice(0, 10), hasta: prevFin.toISOString().slice(0, 10) };
  }, [rango]);

  const salidasAnterior = useMemo(() => {
    if (!anterior || !todas) return [];
    return todas.filter((s) => {
      if (excluidas.has(s.id)) return false;
      const d = s.fecha.slice(0, 10);
      return d >= anterior.desde && d <= anterior.hasta;
    });
  }, [todas, excluidas, anterior]);

  const sumaAnt = (f) => salidasAnterior.reduce((a, s) => a + f(s), 0);
  /* Diferencia en valor absoluto, no en porcentaje: null solo cuando no
     hay tramo anterior con el que comparar (Todo el historial). */
  const diffDelta = (actual, ant) => (anterior ? actual - ant : null);

  const distTotal = suma(km);
  const desnTotal = suma((s) => s.desnivel);
  const horasTotal = suma((s) => s.tiempoMovimiento) / 3600;

  const deltaDist = diffDelta(distTotal, sumaAnt(km));
  const deltaDesn = diffDelta(desnTotal, sumaAnt((s) => s.desnivel));
  const deltaHoras = diffDelta(horasTotal, sumaAnt((s) => s.tiempoMovimiento) / 3600);
  const deltaSalidas = diffDelta(salidas.length, salidasAnterior.length);
  const tituloDelta = anterior
    ? `vs. ${fechaCorta(anterior.desde)} – ${fechaCorta(anterior.hasta)}` : undefined;

  return (
    <>
      <h2 className="titulo-resumen">Tus estadísticas</h2>

      <div className="chips chips-rango" style={{ marginTop: 0, marginBottom: 'var(--e4)' }}>
        <span className="campo-fecha">
          <label htmlFor="fd">Desde</label>
          <input id="fd" type="date" value={rango.desde} min={limites?.min} max={limites?.max}
            onChange={(e) => setRango({ ...rango, desde: e.target.value })} />
        </span>
        <span className="campo-fecha">
          <label htmlFor="fh">Hasta</label>
          <input id="fh" type="date" value={rango.hasta} min={limites?.min} max={limites?.max}
            onChange={(e) => setRango({ ...rango, hasta: e.target.value })} />
        </span>

        <button aria-pressed={activoAtajo(7)} onClick={() => toggleAtajo(7)}>Última semana</button>
        <button aria-pressed={activoAtajo(30)} onClick={() => toggleAtajo(30)}>Último mes</button>
        <button aria-pressed={activoAtajo(90)} onClick={() => toggleAtajo(90)}>Últimos 3 meses</button>
        <button aria-pressed={activoAtajo(365)} onClick={() => toggleAtajo(365)}>Último año</button>
        <button aria-pressed={!rango.desde && !rango.hasta}
          onClick={() => setRango({ desde: '', hasta: '' })}>Todo el historial</button>
      </div>

      {salidas.length > 0 && (
        <div className="grid centrado" style={{ marginBottom: 'var(--e4)' }}>
          <Dato k="Distancia total" v={num(distTotal, 0)} u="km"
            delta={deltaDist} deltaDecimales={1} deltaUnidad="km" tituloDelta={tituloDelta} />
          <Dato k="Desnivel acumulado" v={num(desnTotal, 0)} u="m"
            delta={deltaDesn} deltaDecimales={0} deltaUnidad="m" tituloDelta={tituloDelta} />
          <Dato k="Horas totales" v={num(horasTotal, 1)} u="h"
            delta={deltaHoras} deltaDecimales={1} deltaUnidad="h" tituloDelta={tituloDelta} />
          <Dato k="Número de salidas" v={salidas.length}
            delta={deltaSalidas} deltaDecimales={0} deltaUnidad="" tituloDelta={tituloDelta} />
          <Dato k="Salida más larga" v={masLarga ? num(km(masLarga), 1) : '—'} u="km" dEnHover
            d={masLarga ? (
              <>
                {fechaCorta(masLarga.fecha)} ·{' '}
                <button className="link-dato" onClick={() => irASalida(masLarga.id)}>
                  {masLarga.nombre}
                </button>
              </>
            ) : 'sin salidas'} />
          <Dato k="Vel. punta en llano" v={velMaxLlano ? num(velMaxLlano.valor, 1) : '—'} u="km/h" dEnHover
            d={velMaxLlano && salidaVel ? (
              <>
                {fechaCorta(salidaVel.fecha)} ·{' '}
                <button className="link-dato" onClick={() => irASalida(salidaVel.id)}>
                  {salidaVel.nombre}
                </button>
              </>
            ) : 'sin tramos analizados'} />
        </div>
      )}
    </>
  );
}

/* Envuelve el contenido de una celda en la insignia del maximo cuando
   corresponde; si no, lo deja tal cual, sin nodo extra alrededor. */
function ValorTabla({ max, children }) {
  return max ? <span className="marca-max">{children}</span> : children;
}

/*
  Criterios de ordenacion de la tabla de salidas. Cada uno saca de la
  salida el valor por el que comparar; el resto de la mecanica (sentido,
  nulos al final, empates) es comun y vive en ordenarSalidas.
*/
const criteriosSalidas = (refTerreno) => ({
  tipo: (s) => ORDEN_TIPO[tipoRuta(s, refTerreno)],
  fecha: (s) => s.fecha,
  nombre: (s) => (s.nombre || '').toLowerCase(),
  km: (s) => km(s),
  tiempo: (s) => s.tiempoMovimiento,
  desnivel: (s) => s.desnivel,
  vel: (s) => kmh(s),
  fc: (s) => s.fcMedia,
});

/*
  Las salidas sin el dato (FC sin pulsometro, sobre todo) van siempre al
  final, se ordene como se ordene: mandarlas arriba al invertir el
  sentido solo llenaria la primera pantalla de guiones.
*/
function ordenarSalidas(lista, campo, desc, tipoElegido, refTerreno) {
  /* Con un terreno elegido en la cabecera de Tipo el criterio deja de
     ser la dureza y pasa a ser "esta es de las que busco o no"; dentro
     de cada grupo se conserva el orden por fecha, de la mas reciente a
     la mas antigua. */
  if (campo === 'tipo' && tipoElegido) {
    return [...lista].sort((a, b) => {
      const ea = tipoRuta(a, refTerreno) === tipoElegido ? 0 : 1;
      const eb = tipoRuta(b, refTerreno) === tipoElegido ? 0 : 1;
      if (ea !== eb) return ea - eb;
      return b.fecha.localeCompare(a.fecha);
    });
  }
  const criterios = criteriosSalidas(refTerreno);
  return ordenarPor(lista, criterios, criterios[campo] ? campo : 'fecha', desc);
}

/*
  Tipo no se ordena como las demas: "de mayor a menor terreno" no es lo
  que se busca casi nunca, sino ver primero las de montana, o las
  llanas. Asi que la cabecera abre un menu con los tres perfiles y el
  elegido sube arriba del todo.
*/
function ThTipo({ orden, setOrden }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef(null);
  const activo = orden.campo === 'tipo' && Boolean(orden.tipo);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e) => { if (!caja.current?.contains(e.target)) setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);

  /* Volver a elegir el mismo terreno lo suelta y devuelve la tabla a su
     orden por fecha: si no, no habria forma de deshacerlo. */
  const elegir = (t) => {
    setOrden(orden.tipo === t
      ? { campo: 'fecha', desc: true }
      : { campo: 'tipo', desc: true, tipo: t });
    setAbierto(false);
  };

  return (
    <th className="col-tipo" aria-sort={activo ? 'descending' : 'none'}>
      <div className="th-tipo" ref={caja}>
        <button type="button" className={`th-orden${activo ? ' activo' : ''}`}
          aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}>
          Tipo
          <Flecha activo={activo} desc />
        </button>
        {abierto && (
          <div className="th-tipo-menu">
            {Object.entries(TIPO_INSIGNIA).map(([t, ins]) => (
              <button key={t} type="button"
                aria-pressed={orden.tipo === t}
                onClick={() => elegir(t)}>
                <span className="cat" style={{ background: ins.fondo, color: ins.tinta }}>
                  {ins.codigo}
                </span>
                {NOMBRES_TERRENO[t]}
              </button>
            ))}
          </div>
        )}
      </div>
    </th>
  );
}

/* Los nombres que se usan en la leyenda del calendario, no los de
   NOMBRES_TIPO ("Mixto", "Puerto"): en esta tabla el usuario ve Llano,
   Colina y Montana. */
const NOMBRES_TERRENO = { llano: 'Llano', mixto: 'Colina', puerto: 'Montaña' };

function Resumen({ salidas, cfg, umbral, masaTotal, excluidas, setExcluidas,
  enRango, cache, dias, pedirStreams, irASalida, zonas, reparto, refTerreno }) {

  /* Máximos de cada columna para resaltar */
  const maximos = useMemo(() => ({
    dist: salidas.length ? Math.max(...salidas.map(km)) : 0,
    tiempo: salidas.length ? Math.max(...salidas.map((s) => s.tiempoMovimiento)) : 0,
    desn: salidas.length ? Math.max(...salidas.map((s) => s.desnivel)) : 0,
    vel: salidas.length ? Math.max(...salidas.map(kmh)) : 0,
  }), [salidas]);

  /*
    Fila desplegada con el perfil de la salida. Solo una a la vez: abrir
    otra cierra la anterior, igual que las fichas de puerto en
    Entrenamientos. Si las series no estan en cache todavia (la carga en
    segundo plano no ha llegado ahi), se piden al abrir en vez de esperar
    a que le toque el turno.
  */
  const [salidaAbierta, setSalidaAbierta] = useState(null);
  /* Por defecto, lo mismo que se veia antes de poder ordenar: las mas
     recientes arriba. */
  const [orden, setOrden] = useState({ campo: 'fecha', desc: true });
  const [cargandoPerfil, setCargandoPerfil] = useState(false);

  /*
    Version de salidaAbierta con un frame de retraso, para que la clase
    CSS "abierta" del panel de detalle solo llegue a aplicarse un
    fotograma despues de que se pida abrir una fila.

    Sin este retraso, la primera vez que se abre una fila -streams sin
    cache todavia- el contenido real (.perfil-mini) no llega a existir
    hasta que la carga termina, y para entonces el panel ya llevaria un
    rato con "abierta" puesta: nace directamente en su estado final, sin
    haber pintado nunca el cerrado, y no hay transicion CSS que animar.
    Con este retraso, cualquier contenido que se monte de golpe -al
    instante o tras una carga- siempre tiene, como minimo, un fotograma
    pintado en su estado cerrado antes de que "abierta" llegue.
  */
  const [claseAbierta, setClaseAbierta] = useState(null);
  useEffect(() => {
    if (salidaAbierta == null) { setClaseAbierta(null); return; }
    const id = requestAnimationFrame(() => setClaseAbierta(salidaAbierta));
    return () => cancelAnimationFrame(id);
  }, [salidaAbierta]);

  const alternarFila = (s) => {
    if (salidaAbierta === s.id) { setSalidaAbierta(null); return; }
    setSalidaAbierta(s.id);
    if (!cache[s.id]) {
      setCargandoPerfil(true);
      pedirStreams(s.id).catch(() => {}).finally(() => setCargandoPerfil(false));
    }
  };
  /*
    La frecuencia cardiaca queda deliberadamente fuera de los maximos. Las
    demas columnas miden rendimiento y su mayor valor es un logro; la FC
    mide cuanto te costo, y la mas alta del historial no es una marca que
    celebrar sino, si acaso, un dia en que fuiste mas al limite.
  */

  const sinFC = salidas.filter((s) => !s.fcMedia).length;

  return (
    <>
      <h2>Últimos 30 días</h2>
      <UltimosDias dias={dias} onSalida={irASalida} />

      <RepartoZonas zonas={zonas} reparto={reparto} />

      {salidas.length === 0 ? (
        <div className="callout warn">
          Sin salidas en el periodo seleccionado no hay nada que calcular. Amplía el intervalo.
        </div>
      ) : (
        <>
          <h2>Tus salidas</h2>
          {sinFC > 0 && (
            <div className="callout con-icono">
              <IcoAviso className="icono" />
              <p>
                Algunas de tus salidas no tienen registrada una frecuencia cardíaca. Sin ese dato, su
                intensidad en el calendario es una estimación a partir del desnivel y la velocidad.
              </p>
            </div>
          )}
          {enRango.length === 0 ? (
            <div className="callout">No hay salidas en el intervalo elegido.</div>
          ) : (
            <div className="scroll">
              <table className="tabla-salidas">
                <thead>
                  <tr>
                    <ThTipo orden={orden} setOrden={setOrden} />
                    <ThOrden campo="fecha" orden={orden} setOrden={setOrden} className="col-fecha">Fecha</ThOrden>
                    <ThOrden campo="nombre" orden={orden} setOrden={setOrden} className="col-nombre">Salida</ThOrden>
                    <ThOrden campo="km" orden={orden} setOrden={setOrden}>Km</ThOrden>
                    <ThOrden campo="tiempo" orden={orden} setOrden={setOrden}>Tiempo</ThOrden>
                    <ThOrden campo="desnivel" orden={orden} setOrden={setOrden}>Desnivel +</ThOrden>
                    <ThOrden campo="vel" orden={orden} setOrden={setOrden}>Vel media</ThOrden>
                    <ThOrden campo="fc" orden={orden} setOrden={setOrden}>FC</ThOrden>
                    <th className="col-incluir">Incluir</th>
                  </tr>
                </thead>
                <tbody>
                  {ordenarSalidas(enRango, orden.campo, orden.desc, orden.tipo, refTerreno).map((s) => {
                    const dentro = !excluidas.has(s.id);
                    const distVal = km(s);
                    const desnVal = s.desnivel;
                    const velVal = kmh(s);
                    const fcVal = s.fcMedia;
                    const insignia = TIPO_INSIGNIA[tipoRuta(s, refTerreno)];

                    const abierta = salidaAbierta === s.id;
                    /* Con retraso de un frame respecto a "abierta" -ver
                       claseAbierta mas arriba-, solo para la clase que
                       dispara la animacion del panel. */
                    const panelAbierto = claseAbierta === s.id;
                    const streamsFila = cache[s.id];
                    const puertosFila = streamsFila ? detectarPuertos(streamsFila) : [];
                    /*
                      Foco (opcion 2b del rediseno, la elegida sobre la
                      alternativa "acordeon en su sitio"): con una fila
                      abierta, las demas se retiran en vez de quedarse
                      igual -asi la que importa de verdad destaca sin
                      necesidad de ocultar el resto.
                    */
                    const enfocada = salidaAbierta == null || abierta;

                    return (
                      <Fragment key={s.id}>
                      <tr onClick={() => alternarFila(s)}
                        className={abierta ? 'fila-activa' : undefined}
                        style={{ opacity: (dentro ? 1 : 0.35) * (enfocada ? 1 : 0.38),
                          cursor: 'pointer',
                          background: abierta ? 'var(--card2)' : undefined }}>
                        <td className="col-tipo">
                          <span className="cat" style={{ background: insignia.fondo, color: insignia.tinta }}>
                            {insignia.codigo}
                          </span>
                        </td>
                        <td className="col-fecha">{fechaDDMMAA(s.fecha)}</td>
                        <td className="col-nombre">
                          <span className="fila-puerto">
                            <span className="flecha">{abierta ? '▾' : '▸'}</span>
                            {s.nombre}
                          </span>
                        </td>
                        <td>
                          <ValorTabla max={Math.abs(distVal - maximos.dist) < 0.01}>
                            {num(distVal, 1)}
                          </ValorTabla>
                        </td>
                        <td>
                          <ValorTabla max={s.tiempoMovimiento === maximos.tiempo}>
                            {duracionHMS(s.tiempoMovimiento)}
                          </ValorTabla>
                        </td>
                        <td>
                          <ValorTabla max={desnVal === maximos.desn}>
                            +{num(desnVal, 0)}
                          </ValorTabla>
                        </td>
                        <td>
                          <ValorTabla max={Math.abs(velVal - maximos.vel) < 0.01}>
                            {num(velVal, 1)}
                          </ValorTabla>
                        </td>
                        <td>{fcVal ? num(fcVal, 0) : '—'}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={dentro}
                            onChange={() => {
                              const n = new Set(excluidas);
                              dentro ? n.add(s.id) : n.delete(s.id);
                              setExcluidas(n);
                            }} />
                        </td>
                      </tr>

                      {/*
                        Siempre montada -antes solo existia la de la fila
                        abierta, y por eso no habia forma de animar el
                        cierre: un elemento que se desmonta no puede hacer
                        una transicion de salida. El alto real lo decide
                        el CSS (grid-template-rows 0fr/1fr en
                        .fila-detalle-panel), no esta condicion.

                        El grafico solo se monta si streamsFila ya esta en
                        cache -evita pagar el coste de Perfil en filas que
                        nunca se han abierto- pero una vez montado se
                        queda: reabrir la misma fila despues es instantaneo.
                      */}
                      <tr className="fila-detalle">
                        <td colSpan={9} className="fila-detalle-panel-td">
                          <div className={`fila-detalle-panel${panelAbierto ? ' abierta' : ''}`}>
                            <div className="fila-detalle-inner">
                              {streamsFila ? (
                                <div className="perfil-mini">
                                  <div className="perfil-mini-grafico">
                                    <Perfil streams={streamsFila} puertos={puertosFila}
                                      modo="relieve" compacto simple altura={190} animarEntrada />
                                  </div>
                                  <button className="btn-analisis"
                                    onClick={() => irASalida(s.id)}>
                                    Analizar
                                  </button>
                                </div>
                              ) : abierta ? (
                                <p className="perfil-mini-cargando">
                                  {cargandoPerfil && <span className="spin" />}
                                  {cargandoPerfil ? 'Cargando el perfil…' : 'Sin perfil disponible.'}
                                </p>
                              ) : null}
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
          )}
        </>
      )}
    </>
  );
}

/*
  El reparto por zonas del periodo filtrado (el mismo rango de fechas que
  las cajas de arriba), no del historial completo: cambia el filtro y
  este bloque cambia con el. La lectura textual queda oculta detras de un
  boton -es la explicacion larga, no hace falta que ocupe sitio siempre.
*/
function RepartoZonas({ zonas, reparto }) {
  const [verInfo, setVerInfo] = useState(false);
  const hayDatos = reparto && reparto.total > 0;

  if (!hayDatos) return null;

  return (
    <>
      <h2>Tus zonas</h2>
      <p className="hint">
        Acumulado de las {reparto.analizadas} salidas con pulsómetro en el periodo elegido,{' '}
        {duracion(reparto.total)} en total.
      </p>
      <div className="chart">
        <BarrasZonas zonas={zonas} reparto={reparto} />
        <div className="legend">
          {zonas.map((z) => (
            <span key={z.n}>
              <i style={{ background: z.color }} />Z{z.n} {z.nombre} · {num(reparto.porcentaje[z.n - 1], 0)} %
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--e3)' }}>
          <button aria-expanded={verInfo} onClick={() => setVerInfo((v) => !v)}>
            {verInfo ? 'Ocultar' : 'Qué significa'}
          </button>
        </div>
      </div>
      {verInfo && <Veredicto reparto={reparto} zonas={zonas} />}
    </>
  );
}

/* ---------- barras horizontales del reparto por zonas ---------- */
function BarrasZonas({ zonas, reparto }) {
  const max = Math.max(...reparto.segundos) || 1;
  return (
    <svg viewBox="0 0 1000 260" width="100%">
      {zonas.map((z, i) => {
        const y = 14 + i * 48;
        const w = (reparto.segundos[i] / max) * 700;
        return (
          <g key={z.n}>
            <text x="0" y={y + 22} fill="#9BA5B4" fontSize="13" fontFamily="Helvetica,Arial,sans-serif">
              Z{z.n} {z.nombre}
            </text>
            <rect x="170" y={y + 6} width="700" height="22" fill="#151A21" rx="4" />
            <rect x="170" y={y + 6} width={Math.max(w, 2)} height="22" fill={z.color} rx="4" />
            <text x="885" y={y + 22} fill="#E8EAED" fontSize="13" fontWeight="500"
              fontFamily="ui-monospace,Menlo,monospace">
              {num(reparto.porcentaje[i], 0)} %
            </text>
            <text x="1000" y={y + 22} textAnchor="end" fill="#6B7684" fontSize="12"
              fontFamily="ui-monospace,Menlo,monospace">
              {duracion(reparto.segundos[i])}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- lectura del reparto ---------- */
function Veredicto({ reparto, zonas }) {
  const suave = reparto.porcentaje[0] + reparto.porcentaje[1];
  const media = reparto.porcentaje[2];
  const dura = reparto.porcentaje[3] + reparto.porcentaje[4];

  if (media > 28) {
    return (
      <div className="callout warn">
        <strong>Un {num(media, 0)} % de tu tiempo cae en zona 3.</strong> Es el ritmo que más cansa
        y menos aporta: demasiado duro para construir base, demasiado suave para subir el umbral. En
        las salidas de fondo, obligarte a bajar de {zonas[2].desde} ppm aunque tengas que poner un
        desarrollo ridículo en las rampas.
      </div>
    );
  }
  if (suave >= 75 && dura >= 10) {
    return (
      <div className="callout ok">
        <strong>Reparto polarizado de manual:</strong> {num(suave, 0)} % en fondo y {num(dura, 0)} %
        en alta intensidad. Es exactamente lo que buscas. Ahora el margen de mejora está en subir el
        volumen, no en cambiar el reparto.
      </div>
    );
  }
  if (dura < 8) {
    return (
      <div className="callout">
        <strong>Solo un {num(dura, 0)} % por encima del umbral.</strong> Tienes base de sobra pero te
        falta el estímulo que sube el techo. Una sesión dura por semana, sin tocar el resto, cambiaría
        bastante el panorama.
      </div>
    );
  }
  return (
    <div className="callout ok">
      <strong>{num(suave, 0)} % en fondo, {num(dura, 0)} % en alta intensidad.</strong> El reparto es
      razonable. Vigila solo que la zona 3 no se vaya creciendo mes a mes.
    </div>
  );
}

function CargaTab({ salidas, cfg, umbral, zonas, global: rep }) {
  const serie = useMemo(() => serieCarga(salidas, cfg, umbral), [salidas, cfg, umbral]);
  const ult = serie[serie.length - 1];

  const estado = !ult ? ['—', 'var(--ink2)']
    : ult.forma > 10 ? ['Fresco', 'var(--green)']
    : ult.forma > -10 ? ['Equilibrado', 'var(--blue)']
    : ult.forma > -25 ? ['Cargado', 'var(--amber)']
    : ['Muy cargado', 'var(--red)'];

  return (
    <>
      <h2>Carga, fatiga y forma</h2>
      <p className="hint">
        La <strong>condición</strong> es tu base acumulada a 42 días; la <strong>fatiga</strong>, el
        cansancio de los últimos 7; la <strong>forma</strong>, la diferencia entre ambas.
      </p>
      <div className="chart">
        <Carga serie={serie} />
        <div className="legend">
          <span><i style={{ background: 'var(--blue)' }} />Condición</span>
          <span><i style={{ background: 'var(--red)' }} />Fatiga</span>
          <span><i style={{ background: 'var(--green)' }} />Forma</span>
        </div>
      </div>
      {ult && (
        <div className="grid centrado" style={{ marginTop: 14 }}>
          <Dato k="Condición" v={num(ult.condicion, 0)} d="base aeróbica acumulada" />
          <Dato k="Fatiga" v={num(ult.fatiga, 0)} d="carga de los últimos 7 días" />
          <div className="stat" style={{ borderLeft: `3px solid ${estado[1]}` }}>
            <div className="k">Forma</div>
            <div className="v" style={{ color: estado[1] }}>
              {ult.forma > 0 ? '+' : ''}{num(ult.forma, 0)}
            </div>
            <div className="d">{estado[0]}</div>
          </div>
          <Dato k="Umbral estimado" v={umbral} u="W" d={`${num(umbral / cfg.peso, 2)} W/kg`} />
        </div>
      )}
      <div className="callout">
        <em>Matiz:</em> la serie arranca de cero en tu primera salida registrada, así que las
        primeras semanas de condición están artificialmente bajas. La forma solo es fiable pasados
        un par de meses.
      </div>

      <h2>Reparto de intensidad</h2>
      {!rep || rep.total === 0 ? (
        <div className="callout">
          Todavía no hay ninguna salida con pulsómetro analizada. El detalle se trae solo nada
          más entrar en el panel; el desglose completo, con varias vistas, está en{' '}
          <strong>Tus datos</strong>.
        </div>
      ) : (
        <>
          <p className="hint">
            Acumulado de las {rep.analizadas} salidas analizadas. El modelo polarizado busca en
            torno al 80 % en zona 1–2 y el 20 % en alta intensidad.
          </p>
          <div className="chart">
            <svg viewBox="0 0 1000 60" width="100%">
              {(() => {
                let acc = 0;
                return zonas.map((z, k) => {
                  const w = (rep.porcentaje[k] / 100) * 1000;
                  const x = acc; acc += w;
                  return w > 0 ? (
                    <g key={z.n}>
                      <rect x={x} y="10" width={w} height="34" fill={z.color} />
                      {w > 55 && (
                        <text x={x + w / 2} y="32" textAnchor="middle" fill="#0E1116" fontSize="13"
                          fontWeight="500" fontFamily="ui-monospace,Menlo,monospace">
                          {num(rep.porcentaje[k], 0)} %
                        </text>
                      )}
                    </g>
                  ) : null;
                });
              })()}
            </svg>
            <div className="legend">
              {zonas.map((z) => <span key={z.n}><i style={{ background: z.color }} />Z{z.n} {z.nombre}</span>)}
            </div>
          </div>
          {rep.porcentaje[2] > 25 && (
            <div className="callout warn">
              <strong>Se te está yendo {num(rep.porcentaje[2], 0)} % del tiempo a zona 3.</strong> Es
              el terreno intermedio que cansa como el entrenamiento duro pero no da los beneficios de
              ninguno de los dos. En las salidas de fondo, obligarte a bajar de {zonas[2].desde} ppm
              aunque tengas que poner un desarrollo ridículo en las rampas.
            </div>
          )}
        </>
      )}
    </>
  );
}
