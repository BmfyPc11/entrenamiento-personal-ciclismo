'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import Entrenamientos from './Entrenamientos';
import Perfil from './Perfil';
import Datos from './Datos';
import Objetivos from './Objetivos';
import Ascensiones from './Ascensiones';
import Evolucion from './Evolucion';
import Rutas from './Rutas';
import AnalizadorGPX from './AnalizadorGPX';
import UltimosDias from './UltimosDias';
import Consejo from './Consejo';
import { IcoAviso } from './Iconos';
import Layout, { SECCIONES } from './Layout';
import { OBJETIVOS_INICIALES } from './objetivosLib';
import { Linea, Barras, Carga } from './Graficos';
import {
  PERFILES_BICI, detectarPuertos, serieCarga, umbralEstimado,
  vatios, vatiosPuerto, repartoZonas, repartoGlobal,
  calcularZonas, ultimosDias, consejoEntrenador, normalizarAltitud,
  velocidadMaximaLlano, tipoRuta,
  num, duracionHMS, fechaCorta, fechaDDMMAA, kmh, km,
} from '@/lib/metrics';

/* Codigo de tres letras y color de cada tipo de terreno, para la
   insignia de la tabla de salidas. No son los mismos colores que usa
   COLORES_TIPO en el calendario de Ultimos 30 dias: alli el naranja de
   "mixto" tiene que distinguirse del ambar de la zona 3 de FC en el
   mismo golpe de vista, y aqui la insignia va sola en su columna, sin
   esa colision. */
const TIPO_INSIGNIA = {
  llano: { codigo: 'LLA', fondo: 'var(--green)', tinta: '#0A0C0F' },
  mixto: { codigo: 'COL', fondo: 'var(--amber)', tinta: '#0A0C0F' },
  puerto: { codigo: 'MON', fondo: 'var(--red)', tinta: '#FFFFFF' },
};

/* La lista de secciones vive en Layout, que es quien la pinta. */

const CFG_INICIAL = {
  peso: 75, bici: 11, fcmax: 185, cda: 0.36, crr: 0.008, perfil: 'gravel_alto',
  modeloZonas: 'clasico', zonasPropias: null,
};

export default function Dashboard({ atleta }) {
  const [salidas, setSalidas] = useState(null);
  const [error, setError] = useState(null);
  const [cache, setCache] = useState({});
  const [pestana, setPestana] = useState('resumen');
  const [cfg, setCfg] = useState(CFG_INICIAL);
  const [excluidas, setExcluidas] = useState(new Set());
  const [rango, setRango] = useState({ desde: '', hasta: '' });
  const [objetivos, setObjetivos] = useState({ ...OBJETIVOS_INICIALES });
  const [refrescando, setRefrescando] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);

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

  /* --- carga de actividades --- */
  const cargar = useCallback(async () => {
    setRefrescando(true);
    setError(null);
    try {
      const r = await fetch('/api/activities', { cache: 'no-store' });
      if (r.status === 401) { window.location.reload(); return; }
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      setSalidas(j.salidas);
      if (j.aviso === 'limite_alcanzado') {
        setError('Strava ha limitado las peticiones por unos minutos. Se muestran las salidas que dio tiempo a leer.');
      }
      // si Strava tiene tu peso, lo usamos la primera vez
      if (atleta?.peso && cfg.peso === CFG_INICIAL.peso) {
        setCfg((c) => ({ ...c, peso: Math.round(atleta.peso) }));
      }
    } catch (e) {
      setError(
        e.message === 'limite_alcanzado'
          ? 'Strava ha alcanzado su límite de peticiones. Espera unos 15 minutos y vuelve a intentarlo.'
          : 'No se pudieron leer tus actividades. Prueba a recargar la página.'
      );
    } finally {
      setRefrescando(false);
    }
  }, [atleta, cfg.peso]);

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, []);

  /* --- streams bajo demanda, con cache --- */
  const pedirStreams = useCallback(async (id) => {
    const r = await fetch(`/api/streams?id=${id}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status === 502 ? 'Strava no devolvió el detalle' : 'Error de conexión');
    const j = await r.json();
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
  */
  const [fondo, setFondo] = useState({ activo: false, hechas: 0, total: 0 });

  useEffect(() => {
    if (!salidas || !salidas.length) return;
    const pendientes = salidas.filter((s) => !cache[s.id]);
    if (!pendientes.length) return;

    let cancelado = false;
    (async () => {
      setFondo({ activo: true, hechas: 0, total: pendientes.length });
      for (let i = 0; i < pendientes.length; i++) {
        if (cancelado) break;
        try { await pedirStreams(pendientes[i].id); } catch { /* una salida rota no debe frenar el resto */ }
        if (!cancelado) setFondo({ activo: true, hechas: i + 1, total: pendientes.length });
        await new Promise((r) => setTimeout(r, 200));
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
    () => ultimosDias(activas, cfg, zonas, umbral, 30),
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
    <Layout seccion={pestana} setSeccion={setPestana} atleta={atleta}
      onActualizar={cargar} refrescando={refrescando}
      abierto={menuAbierto} setAbierto={setMenuAbierto}>
    <div className="wrap">
      {/*
        Entrenamientos pinta su propia cabecera porque el selector de salida
        va junto al titulo. El resto de secciones usa esta generica hasta que
        les toque su pasada de la fase 3.
      */}
      {pestana !== 'entrenamientos' && (
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
        <Estadisticas salidas={activas} cfg={cfg} umbral={umbral}
          enRango={enRango} rango={rango} setRango={setRango} velMaxLlano={velMaxLlano}
          irASalida={irASalida} />
      )}
      {pestana === 'resumen' && <Consejo consejo={consejo} />}

      {pestana === 'resumen' && (
        <Resumen salidas={activas} cfg={cfg} umbral={umbral} masaTotal={masaTotal}
          excluidas={excluidas} setExcluidas={setExcluidas} enRango={enRango}
          cache={cache} dias={dias} pedirStreams={pedirStreams} irASalida={irASalida} />
      )}
      {pestana === 'entrenamientos' && (
        <Entrenamientos salidas={salidas} cfg={cfg} zonas={zonas} umbral={umbral} cache={cache}
          pedirStreams={pedirStreams} salidaInicial={saltarASalida}
          onSalidaInicialConsumida={() => setSaltarASalida(null)} />
      )}
      {pestana === 'datos' && (
        <Datos cfg={cfg} setCfg={setCfg} zonas={zonas} reparto={global} fondo={fondo} />
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
        <Rutas salidas={activas} cache={cache} excluidas={excluidas} cfg={cfg} zonas={zonas} />
      )}

      {pestana === 'analizador' && (
        <AnalizadorGPX salidas={activas} cache={cache} excluidas={excluidas}
          cfg={cfg} zonas={zonas} />
      )}

      {pestana === 'objetivos' && (
        <Objetivos salidas={activas} cfg={cfg} cache={cache} excluidas={excluidas}
          masaTotal={masaTotal} objetivos={objetivos} setObjetivos={setObjetivos} />
      )}

    </div>
    </Layout>
  );
}

/* ============================================================ */

function Dato({ k, v, u, d, cl, dEnHover }) {
  return (
    <div className={`stat${dEnHover ? ' con-detalle' : ''}`} tabIndex={dEnHover && d ? 0 : undefined}>
      <div className="k">{k}</div>
      <div className="v">{v} {u && <small>{u}</small>}</div>
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
function Estadisticas({ salidas, cfg, umbral, enRango, rango, setRango, velMaxLlano, irASalida }) {
  /* Limites reales del historial, para acotar los selectores de fecha */
  const limites = useMemo(() => {
    if (!enRango.length && !salidas.length) return null;
    const todas = enRango.length ? enRango : salidas;
    return { min: todas[0].fecha.slice(0, 10), max: todas[todas.length - 1].fecha.slice(0, 10) };
  }, [enRango, salidas]);

  const atajo = (dias) => {
    const hoy = new Date();
    const desde = new Date(hoy.getTime() - dias * 864e5);
    setRango({ desde: desde.toISOString().slice(0, 10), hasta: hoy.toISOString().slice(0, 10) });
  };

  const suma = (f) => salidas.reduce((a, s) => a + f(s), 0);
  const masLarga = salidas.length
    ? salidas.reduce((a, s) => (s.distancia > a.distancia ? s : a))
    : null;

  /* Misma lista de salidas con la que se calculo velMaxLlano (Dashboard le
     pasa "activas" a los dos), asi que la salida ganadora siempre esta
     aqui dentro. */
  const salidaVel = velMaxLlano ? salidas.find((s) => s.id === velMaxLlano.salidaId) : null;

  return (
    <>
      <h2 className="titulo-resumen">Tus estadísticas</h2>

      <div className="chips" style={{ marginTop: 0, marginBottom: 'var(--e4)' }}>
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

        <button onClick={() => atajo(30)}>Último mes</button>
        <button onClick={() => atajo(90)}>Últimos 3 meses</button>
        <button onClick={() => atajo(365)}>Último año</button>
        <button onClick={() => setRango({ desde: '', hasta: '' })}>Todo el historial</button>
      </div>

      {salidas.length > 0 && (
        <div className="grid centrado" style={{ marginBottom: 'var(--e4)' }}>
          <Dato k="Distancia total" v={num(suma(km), 0)} u="km" />
          <Dato k="Desnivel acumulado" v={num(suma((s) => s.desnivel), 0)} u="m" />
          <Dato k="Horas totales" v={num(suma((s) => s.tiempoMovimiento) / 3600, 1)} u="h" />
          <Dato k="Número de salidas" v={salidas.length} />
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

function Resumen({ salidas, cfg, umbral, masaTotal, excluidas, setExcluidas,
  enRango, cache, dias, pedirStreams, irASalida }) {

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
  const [cargandoPerfil, setCargandoPerfil] = useState(false);

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
      <UltimosDias dias={dias} />

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
                    <th className="col-tipo">Tipo</th><th className="col-fecha">Fecha</th>
                    <th className="col-nombre">Salida</th><th>Km</th><th>Tiempo</th>
                    <th>Desnivel +</th><th>Vel media</th><th>FC</th><th>Incluir</th>
                  </tr>
                </thead>
                <tbody>
                  {[...enRango].reverse().map((s) => {
                    const dentro = !excluidas.has(s.id);
                    const distVal = km(s);
                    const desnVal = s.desnivel;
                    const velVal = kmh(s);
                    const fcVal = s.fcMedia;
                    const insignia = TIPO_INSIGNIA[tipoRuta(s)];

                    const abierta = salidaAbierta === s.id;
                    const streamsFila = cache[s.id];
                    const puertosFila = streamsFila ? detectarPuertos(streamsFila) : [];

                    return (
                      <Fragment key={s.id}>
                      <tr onClick={() => alternarFila(s)}
                        style={{ opacity: dentro ? 1 : 0.35, cursor: 'pointer',
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

                      {abierta && (
                        <tr className="fila-detalle">
                          <td colSpan={9}>
                            {streamsFila ? (
                              <div className="perfil-mini">
                                <div className="perfil-mini-grafico">
                                  <Perfil streams={streamsFila} puertos={puertosFila}
                                    modo="relieve" compacto simple altura={190} />
                                </div>
                                <button className="btn-analisis"
                                  onClick={() => irASalida(s.id)}>
                                  Analizar
                                </button>
                              </div>
                            ) : (
                              <p className="perfil-mini-cargando">
                                {cargandoPerfil && <span className="spin" />}
                                {cargandoPerfil ? 'Cargando el perfil…' : 'Sin perfil disponible.'}
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
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
