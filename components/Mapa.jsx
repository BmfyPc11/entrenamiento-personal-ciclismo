'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { IcoRestablecer } from './Iconos';

/* Zoom minimo 1 (el ajuste inicial, que ya encaja toda la ruta -no tiene
   sentido alejar mas) y maximo 6 (suficiente para distinguir una rotonda
   o el trazado de una ciudad sin pixelar el trazo). */
const ZOOM_MIN = 1, ZOOM_MAX = 6;
const VISTA_INICIAL = { escala: ZOOM_MIN, x: 0, y: 0 };

/* Misma reduccion que usa Perfil: un maximo de 900 puntos para que el SVG
   no arrastre miles de coordenadas si el reloj graba cada segundo. */
function reducir(n) {
  const paso = Math.max(1, Math.ceil(n / 900));
  const idx = [];
  for (let i = 0; i < n; i += paso) idx.push(i);
  if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
  return idx;
}

/* Posicion de un indice del stream original dentro del array reducido.
   Los puertos (inicio/fin) vienen en indices del stream completo, no del
   reducido -igual que en Perfil, hace falta este mapeo para saber donde
   cae cada uno dentro de "idx". */
function mapearIdx(iOriginal, idx) {
  let mejor = 0;
  for (let k = 0; k < idx.length; k++) {
    if (idx[k] <= iOriginal) mejor = k;
    else break;
  }
  return mejor;
}

/*
  Trazado de la ruta: la silueta del recorrido a partir de las coordenadas
  GPS (latlng), en el mismo estilo dibujado a mano que el perfil de
  altimetria -sin mapa de fondo ni libreria de mapas, solo la forma.

  Reutiliza el mismo lenguaje visual que Perfil: amarillo para el
  recorrido, rojo para los puertos, y los mismos iconos de salida (play) y
  meta (bandera de cuadros) que ya tiene el perfil, para que las dos
  vistas de la misma salida se lean como parte del mismo dibujo.
*/
export default function Mapa({ streams, puertos = [] }) {
  const svgRef = useRef(null);
  const [vista, setVista] = useState(VISTA_INICIAL);

  /* Copia siempre al dia de "vista", para leerla dentro del listener de
     rueda nativo (ver el useEffect de onWheel mas abajo): ese listener
     solo se vuelve a enganchar cuando cambia "datos", no en cada zoom, asi
     que sin esto leeria un "vista" congelado del momento en que se
     engancho. */
  const vistaRef = useRef(vista);
  vistaRef.current = vista;

  /* Arrastre en curso: en un ref porque cambia en cada pixel de
     movimiento y no necesita disparar un render por si mismo -solo el
     "setVista" de dentro lo hace. */
  const arrastreRef = useRef(null);

  /*
    Tamano real de la caja (el marco con borde, mas abajo), para que el
    viewBox se ajuste exactamente a su forma -ver "vbX/vbY/vbW/vbH" mas
    adelante. Sin esto, si la caja no tiene la misma proporcion que la
    ruta, el ajuste automatico del SVG (preserveAspectRatio) deja franjas
    vacias a los lados o arriba/abajo en vez de llegar a los cuatro
    bordes.
  */
  const cajaRef = useRef(null);
  const [caja, setCaja] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = cajaRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setCaja({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const datos = useMemo(() => {
    const latlng = streams?.latlng;
    if (!latlng || latlng.length < 2) return null;

    /* Strava a veces graba un [0,0] suelto en un corte de senal -se
       descartan aqui para que no arrastren la escala hacia el ecuador. */
    const validos = latlng
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => Array.isArray(p) && (p[0] !== 0 || p[1] !== 0));
    if (validos.length < 2) return null;

    const idx = reducir(latlng.length).filter((i) => latlng[i] && (latlng[i][0] !== 0 || latlng[i][1] !== 0));
    if (idx.length < 2) return null;

    return {
      idx,
      lat: idx.map((i) => latlng[i][0]),
      lon: idx.map((i) => latlng[i][1]),
    };
  }, [streams]);

  if (!datos) return <p className="hint">Esta salida no tiene coordenadas GPS registradas.</p>;

  const minLat = Math.min(...datos.lat), maxLat = Math.max(...datos.lat);
  const minLon = Math.min(...datos.lon), maxLon = Math.max(...datos.lon);

  /*
    Correccion de longitud por latitud: a la misma distancia real, un
    grado de longitud ocupa menos terreno cuanto mas lejos del ecuador.
    Sin este factor la ruta sale ensanchada o aplastada segun donde se
    grabase -en Catalunya, por ejemplo, un 20% mas ancha de lo real.
  */
  const corrLon = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);

  const anchoGeo = (maxLon - minLon) * corrLon;
  const altoGeo = maxLat - minLat;

  /*
    El viewBox mide exactamente lo que ocupa la ruta (mas un margen), ni
    un pixel de canvas de sobra alrededor: el "encaje dentro de la caja
    disponible" ya no lo hace este componente a mano, lo hace el propio
    SVG con su comportamiento de toda la vida (preserveAspectRatio por
    defecto, sin forzar "none"), que escala sin deformar y centra el
    resultado en lo que le de Entrenamientos. Sin canvas fijo de sobra,
    ese encaje aprovecha el 100 % del hueco en vez de dejar aire de mas.

    REF fija la escala de las coordenadas -no del recuadro final en
    pantalla, que decide el contenedor-, para que un radio de icono "9" o
    un trazo de grosor "3" se vean igual de grandes sea cual sea el area
    real de la ruta (300 m o 150 km de lado).
  */
  const REF = 1000;
  const escala = anchoGeo > 0 && altoGeo > 0 ? REF / Math.max(anchoGeo, altoGeo) : 1;
  const anchoSvg = anchoGeo * escala, altoSvg = altoGeo * escala;
  const PAD = Math.max(anchoSvg, altoSvg) * 0.045;

  const X = (lon) => PAD + (lon - minLon) * corrLon * escala;
  /* Y invertida: la latitud crece hacia el norte, y en SVG "arriba" es
     el valor de Y mas pequeno. */
  const Y = (lat) => PAD + (maxLat - lat) * escala;

  /*
    El "lienzo" natural de la ruta (anchoSvg+PAD*2 x altoSvg+PAD*2) casi
    nunca tiene la misma proporcion que la caja real -una ruta puede ser
    muy alargada, la caja es la que da el diseno-. Con el viewBox tal
    cual, el ajuste automatico del SVG (preserveAspectRatio) deja franjas
    vacias en el eje que sobra. Aqui se ensancha ese viewBox (nunca se
    recorta la ruta, solo se anade margen) en el eje que le falte hasta
    igualar la proporcion real de la caja, repartiendo el margen nuevo a
    partes iguales a los dos lados -asi la ruta queda centrada y el SVG
    llega a los cuatro bordes sin dejar ningun hueco.
  */
  let vbX = 0, vbY = 0, vbW = anchoSvg + PAD * 2, vbH = altoSvg + PAD * 2;
  if (caja.w > 0 && caja.h > 0) {
    const relCaja = caja.w / caja.h;
    const relLienzo = vbW / vbH;
    if (relCaja > relLienzo) {
      const vbWNuevo = vbH * relCaja;
      vbX -= (vbWNuevo - vbW) / 2;
      vbW = vbWNuevo;
    } else if (relCaja < relLienzo) {
      const vbHNuevo = vbW / relCaja;
      vbY -= (vbHNuevo - vbH) / 2;
      vbH = vbHNuevo;
    }
  }

  const puntos = (desde, hasta) =>
    datos.idx.slice(desde, hasta + 1).map((_, k) => `${X(datos.lon[desde + k])},${Y(datos.lat[desde + k])}`).join(' ');

  const xIni = X(datos.lon[0]), yIni = Y(datos.lat[0]);
  const ultimo = datos.lon.length - 1;
  const xFin = X(datos.lon[ultimo]), yFin = Y(datos.lat[ultimo]);

  /* Posicion del cursor en el espacio de coordenadas del SVG (el mismo en
     el que vive el <g> de zoom/paneo), usando la matriz que el propio
     navegador ya calcula para convertir pantalla -> viewBox. */
  const puntoSvg = (clientX, clientY) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = svg.createSVGPoint();
    p.x = clientX; p.y = clientY;
    const t = p.matrixTransform(ctm.inverse());
    return { x: t.x, y: t.y };
  };

  /*
    Zoom centrado en el cursor: el punto del mapa que hay bajo el raton se
    queda bajo el raton despues de acercar o alejar, en vez de que el
    zoom "empuje" la vista hacia una esquina como haria escalar sin mas
    desde el origen.

    En el minimo (ya se ve toda la ruta) un scroll que siga alejando no
    hace nada util aqui, asi que ni se bloquea: se deja pasar tal cual
    para que la pagina pueda scrollear, como si el mapa no estuviera
    debajo del cursor. En cuanto se llega al minimo tambien se descarta
    cualquier resto de arrastre -x/y vuelven a 0-, para que la vista quede
    centrada en vez de con la ruta desplazada a un lado.
  */
  const onWheel = (e) => {
    const factorZoom = e.deltaY < 0 ? 1.2 : 1 / 1.2;
    if (vistaRef.current.escala <= ZOOM_MIN && factorZoom < 1) return;

    e.preventDefault();
    const p = puntoSvg(e.clientX, e.clientY);
    setVista((v) => {
      const escalaNueva = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.escala * factorZoom));
      if (escalaNueva <= ZOOM_MIN) return VISTA_INICIAL;
      const factor = escalaNueva / v.escala;
      if (factor === 1) return v;
      return {
        escala: escalaNueva,
        x: p.x * (1 - factor) + v.x * factor,
        y: p.y * (1 - factor) + v.y * factor,
      };
    });
  };

  /*
    React registra su listener de "onWheel" como pasivo (por rendimiento
    de scroll, es igual en toda la app) y en un listener pasivo
    "preventDefault()" no hace nada -asi que el zoom funcionaba pero la
    pagina scrolleaba igual por detras. Enganchando el evento a mano
    sobre el propio nodo, sin pasivo, "preventDefault()" si frena el
    scroll de la pagina mientras el cursor esta sobre el mapa.
  */
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos]);

  /* Arrastrar para moverse solo tiene sentido con zoom aplicado -a escala
     1 ya se ve toda la ruta, no hay a donde desplazarse. */
  const onPointerDown = (e) => {
    if (vista.escala <= ZOOM_MIN) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastreRef.current = { x: e.clientX, y: e.clientY, vx: vista.x, vy: vista.y };
  };
  const onPointerMove = (e) => {
    const a = arrastreRef.current;
    if (!a) return;
    const ctm = svgRef.current?.getScreenCTM();
    const escalaPantalla = ctm ? ctm.a : 1; // pixeles de pantalla por unidad del SVG
    setVista((v) => ({
      ...v,
      x: a.vx + (e.clientX - a.x) / escalaPantalla,
      y: a.vy + (e.clientY - a.y) / escalaPantalla,
    }));
  };
  const onPointerUp = (e) => {
    arrastreRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  };

  const zoomAplicado = vista.escala > ZOOM_MIN;

  return (
    /*
      Marco propio -mismo fondo/borde/redondeo que el resto de tarjetas
      de la app (var(--card2)/var(--line2)/var(--r), el tono "nested" que
      ya se usa para superficies dentro de otra superficie)- para que se
      note donde empieza y acaba el mapa en vez de flotar suelto junto al
      perfil.
    */
    <div ref={cajaRef} style={{
      position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box',
      background: 'var(--card2)', border: '1px solid var(--line2)',
      borderRadius: 'var(--r)', padding: 4, overflow: 'hidden',
    }}>
      {zoomAplicado && (
        <button type="button" className="btn-reset-mapa" onClick={() => setVista(VISTA_INICIAL)}
          title="Restablecer el zoom" aria-label="Restablecer el zoom">
          <IcoRestablecer width="15" height="15" />
        </button>
      )}
      <svg ref={svgRef} viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} width="100%" height="100%"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onDoubleClick={() => setVista(VISTA_INICIAL)}
        style={{
          display: 'block',
          cursor: zoomAplicado ? (arrastreRef.current ? 'grabbing' : 'grab') : 'default',
          touchAction: 'none',
        }}>
      <g transform={`translate(${vista.x} ${vista.y}) scale(${vista.escala})`}>
      <polyline points={puntos(0, datos.idx.length - 1)} fill="none"
        stroke="#E0A82E" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

      {/* Los tramos de puerto se remarcan en rojo sobre el trazado base,
          igual que en el perfil: de un vistazo se ve donde caen las
          subidas dentro de la ruta, no solo en el eje de distancia. */}
      {puertos.map((p, i) => {
        const a = mapearIdx(p.inicio, datos.idx);
        const b = mapearIdx(p.fin, datos.idx);
        if (b <= a) return null;
        return (
          <polyline key={i} points={puntos(a, b)} fill="none"
            stroke="#D14B42" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
        );
      })}

      {/* Mismos iconos que el inicio/fin del perfil: play para la salida,
          bandera de cuadros para la meta. */}
      <g transform={`translate(${xIni},${yIni})`}>
        <circle r="9" fill="#F2C230" stroke="#0E1116" strokeWidth="1.5" />
        <path d="M -3,-5 L 6,0 L -3,5 Z" fill="#0E1116" />
      </g>
      <g transform={`translate(${xFin},${yFin})`}>
        <circle r="9" fill="#F2C230" stroke="#0E1116" strokeWidth="1.5" />
        {[0, 1, 2, 3].flatMap((col) => [0, 1].map((fila) => (
          (col + fila) % 2 === 0 && (
            <rect key={`${col}-${fila}`} x={-6 + col * 3} y={-4 + fila * 4}
              width="3" height="4" fill="#0E1116" />
          )
        )))}
      </g>
      </g>
      </svg>
    </div>
  );
}
