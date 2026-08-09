'use client';

import { useMemo, useState } from 'react';
import {
  zonaDeFC, tramoDureza, TRAMOS_DUREZA, categoriaPuerto, num,
} from '@/lib/metrics';

/*
  Redondea el techo del eje a una cifra que quede bien en la etiqueta.
  El paso crece con la magnitud: a nadie le dice nada un eje que acabe
  en 763 m.
*/
function redondearTecho(v) {
  const paso = v > 4000 ? 500 : v > 2000 ? 250 : v > 800 ? 100 : v > 300 ? 50 : 25;
  return Math.ceil(v / paso) * paso;
}

/*
  Aire sobre la cota maxima. El normal es generoso a proposito: con el
  eje pegado al desnivel real, una subida de doscientos metros se dibuja
  como un puerto alpino y el perfil miente sobre lo que costo. El
  ampliado es para mirar la forma del terreno de cerca.
*/
const AIRE_NORMAL = 4;
const AIRE_AMPLIADO = 1.2;

/* Posicion de un indice del stream original dentro del array reducido. */
function mapearIdx(iOriginal, datos) {
  let mejor = 0;
  for (let k = 0; k < datos.idx.length; k++) {
    if (datos.idx[k] <= iOriginal) mejor = k;
    else break;
  }
  return mejor;
}

/*
  Perfil de altimetria.
  - modo "relieve": relleno neutro clasico, con los puertos subrayados
  - modo "dureza":  cada tramo se pinta segun su pendiente
  - modo "zonas":   cada tramo se pinta con el color de la zona de FC en la que ibas
  - zonaFoco:       si hay una zona seleccionada, el resto se atenua
  - mono:           en modo dureza, pinta todo del mismo color
*/
export default function Perfil({
  streams,
  puertos = [],
  nombres = [],
  zonas,
  modo = 'relieve',
  zonaFoco = null,
  durezaFoco = null,
  mono = false,
  altura = 260,
  puertoFoco = null,
}) {
  const [hover, setHover] = useState(null);
  const [zoom, setZoom] = useState(false);

  /*
    Los nombres de las subidas ya no son cosa del modo "Informacion".
    Saber que esa rampa es Vallvesana ayuda igual mirando el color de la
    pendiente o la zona de pulso en la que ibas, asi que la ficha se
    conserva en los tres y se puede apagar cuando estorbe.
  */
  const [verNombres, setVerNombres] = useState(true);

  const datos = useMemo(() => {
    const { distancia: d, altitud: a, fc } = streams || {};
    if (!d || !a || d.length < 2) return null;

    // Reducimos a un maximo de 900 puntos para que el SVG sea ligero
    const paso = Math.max(1, Math.ceil(d.length / 900));
    const idx = [];
    for (let i = 0; i < d.length; i += paso) idx.push(i);
    if (idx[idx.length - 1] !== d.length - 1) idx.push(d.length - 1);

    return {
      d: idx.map((i) => d[i] / 1000),
      a: idx.map((i) => a[i]),
      fc: fc ? idx.map((i) => fc[i]) : null,
      idx,
    };
  }, [streams]);

  if (!datos) return <p className="hint">Esta salida no tiene perfil de altimetría registrado.</p>;

  const W = 1000, L = 44, R = 14, B = 30, T0 = 18;
  const maxA = Math.max(...datos.a);
  const minA = Math.min(...datos.a);
  const maxD = datos.d[datos.d.length - 1];

  const X = (k) => L + (k / maxD) * (W - L - R);

  /*
    El grafico ya no crece para hacer sitio a las fichas.

    Hubo dos intentos antes de este. El primero duplicaba la escala de
    altitud para dejar hueco arriba, y aplastaba el relieve un 38 %. El
    segundo, que es el que se sustituye aqui, reservaba una banda de
    pixeles por encima del area de dibujo: no deformaba nada, pero abria
    un pasillo vacio entre cada nombre y su cima que crecia con cada fila,
    hasta comerse media altura del grafico con cuatro puertos.

    Ahora las fichas van dentro, aprovechando el aire que la escala ya
    deja sobre la cota maxima. Como su sitio depende de la altura de cada
    cima, se colocan despues de la escala y no antes.
  */
  const ALTO_FICHA = 44, HUECO_FICHA = 4;

  /* Aire entre la cima y la ficha que la nombra. Suficiente para que se
     lean como dos cosas unidas por el hilo, no como una encima de otra. */
  const SEPARACION_CIMA = 12;

  const H = altura;
  const T = T0;

  /*
    Escala vertical: dos reglas, y manda la que pida mas aire.

    La primera es el 20 % de margen sobre la cota maxima, que es lo que
    quita dramatismo a las salidas con puerto.

    La segunda es un suelo de rango proporcional a la distancia, y sin
    ella una salida llana se dibuja fatal: con 137 m de desnivel en 41 km,
    ajustar el eje a la cota real convierte el temblor del altimetro en
    una sierra que ocupa toda la pantalla. Una salida del delta tiene que
    verse plana, porque es plana.

    Al quedarse con el maximo de las dos, cada terreno cae donde debe sin
    tener que clasificarlo: en montana manda el 20 % y en llano manda el
    suelo, que es justo el comportamiento de siempre.
  */
  const rangoMinimo = Math.max(120, Math.min(400, maxD * 6));

  /* La base baja a cero en cuanto la salida ronda el nivel del mar. Solo
     sube cuando el recorrido entero transcurre alto, que si no el
     relieve quedaria aplastado contra el techo. */
  const base = minA < 0
    ? Math.floor(minA / 25) * 25
    : Math.max(0, Math.floor((minA - rangoMinimo * 0.15) / 25) * 25);

  /*
    Dos aires posibles sobre la cota maxima. Por defecto se dibuja con el
    holgado, que deja los puertos pequenos y da la medida real de lo que
    es una subida; el ampliado sirve para mirar la forma del terreno de
    cerca.
  */
  const techoCon = (factor) => redondearTecho(
    base + Math.max((Math.max(maxA, 1) - base) * factor, rangoMinimo)
  );
  const techo = techoCon(zoom ? AIRE_AMPLIADO : AIRE_NORMAL);

  /*
    El interruptor solo se ofrece cuando cambia algo. En una salida llana
    manda el suelo por distancia y los dos factores dan el mismo eje:
    ensenar ahi un boton que no hace nada solo confunde.
  */
  const zoomUtil = techoCon(AIRE_NORMAL) !== techoCon(AIRE_AMPLIADO);

  const Y = (v) => H - B - ((v - base) / (techo - base)) * (H - T - B);

  /*
    --- colocacion de las fichas de puerto ---

    Cada una quiere ir justo encima de su cima, que es donde la vista la
    busca. Cuando dos se pisan —puertos seguidos, o nombres largos— la
    siguiente sube un piso, y asi hasta encontrar hueco.

    El limite es el techo del area de dibujo: por encima no se sale,
    aunque eso signifique que dos fichas queden mas juntas de lo ideal.
    Mejor eso que una etiqueta recortada fuera del marco.
  */
  const cajas = [];
  if (verNombres && puertos.length) {
    puertos
      .map((p, i) => ({ p, i, k: mapearIdx(p.fin, datos) }))
      .sort((u, v) => datos.d[u.k] - datos.d[v.k])
      .forEach(({ p, i, k }) => {
        const cat = categoriaPuerto(p.metros, p.pendiente);
        const nombre = nombres[i] || `Subida ${i + 1}`;
        const anchoCat = cat.nombre.length * 8 + 12;
        const ancho = Math.max(150,
          Math.min(6 + anchoCat + 7 + nombre.length * 6.7 + 10, 300));
        const x = X(datos.d[k]);
        const xCaja = Math.max(L, Math.min(x - ancho / 2, W - R - ancho));
        const yCima = Y(datos.a[k]);

        let yCaja = yCima - SEPARACION_CIMA - ALTO_FICHA;

        /* Sube mientras pise a alguna ya colocada que solape en horizontal. */
        for (let vuelta = 0; vuelta < cajas.length + 1; vuelta++) {
          const choca = cajas.find((c) =>
            xCaja < c.xCaja + c.ancho + HUECO_FICHA &&
            c.xCaja < xCaja + ancho + HUECO_FICHA &&
            yCaja < c.yCaja + ALTO_FICHA + HUECO_FICHA &&
            c.yCaja < yCaja + ALTO_FICHA + HUECO_FICHA);
          if (!choca) break;
          yCaja = choca.yCaja - ALTO_FICHA - HUECO_FICHA;
        }
        if (yCaja < T0) yCaja = T0;

        cajas.push({ p, i, k, cat, nombre, ancho, anchoCat, x, xCaja, yCaja, yCima });
      });
    /* Se ordenan por indice para que el foco y las claves no bailen. */
    cajas.sort((a, b) => a.i - b.i);
  }

  /* --- lineas de altura de referencia --- */
  const vista = techo - base;
  const escalon = vista > 900 ? 250 : vista > 600 ? 200 : vista > 300 ? 100 : vista > 140 ? 50 : 25;
  const guias = [];
  for (let v = Math.ceil(base / escalon) * escalon; v < techo; v += escalon) guias.push(v);

  /* --- construccion de los tramos --- */
  const tramos = [];

  /*
    En modo dureza no se calcula la pendiente punto a punto: el ruido del
    altimetro entre dos muestras contiguas produce pendientes absurdas en
    pleno llano. Se promedia sobre ventanas cortas para captar el detalle
    de cada rampa sin heredar ese ruido.
  */
  if (modo === 'dureza') {
    const VENTANA = 0.02; // km
    let i = 0;
    while (i < datos.d.length - 1) {
      let j = i;
      while (j < datos.d.length - 1 && datos.d[j] - datos.d[i] < VENTANA) j++;
      const dist = (datos.d[j] - datos.d[i]) * 1000;
      if (dist <= 0) { i = j + 1; continue; }
      const pend = ((datos.a[j] - datos.a[i]) / dist) * 100;
      const n = tramoDureza(pend).n;
      const ult = tramos[tramos.length - 1];
      /*
        Si el tramo cae en la misma franja que el anterior se extiende en vez
        de crear uno nuevo. Con ventanas de 20 m habria cientos de paths
        contiguos y cada frontera entre dos <path> deja una costura oscura
        de antialiasing: justo las rayas verticales que sobraban.
      */
      if (ult && ult.dureza === n) ult.fin = j;
      else tramos.push({ ini: i, fin: j, dureza: n, pendiente: pend });
      i = j;
    }
  }

  if (modo === 'zonas' && datos.fc) {
    let ini = 0;
    let zAct = datos.fc[0] ? zonaDeFC(datos.fc[0], zonas).n : null;
    for (let i = 1; i < datos.d.length; i++) {
      const z = datos.fc[i] ? zonaDeFC(datos.fc[i], zonas).n : null;
      if (z !== zAct || i === datos.d.length - 1) {
        tramos.push({ ini, fin: i, zona: zAct });
        ini = i - 1 < 0 ? 0 : i - 1;
        zAct = z;
      }
    }
  }

  const areaPath = (desde, hasta) => {
    let p = `M ${X(datos.d[desde])} ${H - B}`;
    for (let i = desde; i <= hasta; i++) p += ` L ${X(datos.d[i])} ${Y(datos.a[i])}`;
    p += ` L ${X(datos.d[hasta])} ${H - B} Z`;
    return p;
  };
  const lineaPath = (desde, hasta) => {
    let p = '';
    for (let i = desde; i <= hasta; i++) p += (i === desde ? 'M ' : ' L ') + X(datos.d[i]) + ' ' + Y(datos.a[i]);
    return p;
  };

  /* --- posicion de los puertos en el array reducido --- */
  const mapear = (iOriginal) => mapearIdx(iOriginal, datos);

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const kmPos = ((x - L) / (W - L - R)) * maxD;
    if (kmPos < 0 || kmPos > maxD) return setHover(null);
    let mejor = 0, dif = Infinity;
    datos.d.forEach((v, i) => { const dd = Math.abs(v - kmPos); if (dd < dif) { dif = dd; mejor = i; } });
    setHover(mejor);
  };

  /* Las cajas ya traen sitio y medidas; aqui solo se marca cual esta
     bajo el cursor, que es lo unico que cambia al vuelo. */
  const fichas = cajas.map((c) => ({
    ...c,
    alto: ALTO_FICHA,
    activo: puertoFoco === c.i,
  }));

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        style={{ cursor: 'crosshair', touchAction: 'pan-y' }}
      >
        <defs>
          <linearGradient id="relieve" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4A5563" stopOpacity=".55" />
            <stop offset="100%" stopColor="#4A5563" stopOpacity=".05" />
          </linearGradient>
        </defs>

        {guias.map((v) => (
          <g key={v}>
            <line x1={L} y1={Y(v)} x2={W - R} y2={Y(v)} stroke="#2A3341" strokeWidth="1" />
            <text x={L - 8} y={Y(v) + 4} textAnchor="end" fill="#6B7684"
              fontSize="10" fontFamily="ui-monospace,Menlo,monospace">{v}</text>
          </g>
        ))}

        {modo === 'dureza' ? (
          <>
            {/*
              En monocromo se dibuja UN solo path para todo el recorrido.
              Pintar los tramos por separado con opacidad parcial hacia que
              las zonas donde dos tramos se solapan sumasen opacidad y
              apareciesen franjas verticales mas claras: de ahi los dos
              tonos que se veian en vez de uno.
            */}
            {mono ? (
              <path d={areaPath(0, datos.d.length - 1)} fill="#C8CFD8" opacity="0.55" />
            ) : (
              tramos.map((t, i) => {
                const c = TRAMOS_DUREZA[t.dureza - 1];
                const atenuado = durezaFoco && t.dureza !== durezaFoco;
                return (
                  <path key={i} d={areaPath(t.ini, Math.min(t.fin + 1, datos.d.length - 1))}
                    fill={c.color} stroke={c.color} strokeWidth="0.6"
                    shapeRendering="crispEdges"
                    opacity={atenuado ? 0.12 : 1} />
                );
              })
            )}
            <path d={lineaPath(0, datos.d.length - 1)} fill="none" stroke="#E8EAED"
              strokeWidth="1.2" strokeLinejoin="round" opacity={mono ? 0.9 : 0.45} />
          </>
        ) : modo === 'zonas' && datos.fc && zonas ? (
          <>
            {tramos.map((t, i) => {
              const z = zonas.find((x) => x.n === t.zona);
              const atenuado = zonaFoco && t.zona !== zonaFoco;
              return (
                <path key={i} d={areaPath(t.ini, t.fin)}
                  fill={z ? z.color : '#4A5563'}
                  opacity={atenuado ? 0.13 : 0.82} />
              );
            })}
            <path d={lineaPath(0, datos.d.length - 1)} fill="none" stroke="#0E1116"
              strokeWidth="1.2" strokeLinejoin="round" opacity=".55" />
          </>
        ) : (
          <>
            <path d={areaPath(0, datos.d.length - 1)} fill="url(#relieve)" />
            <path d={lineaPath(0, datos.d.length - 1)} fill="none" stroke="#C8CFD8"
              strokeWidth="1.7" strokeLinejoin="round" />
          </>
        )}

        {/*
          El subrayado de la subida se queda solo en "Informacion". En los
          otros dos modos el recorrido ya esta pintado con su propio codigo
          de color —la pendiente o la zona de pulso— y una linea amarilla
          encima competiria con el: el amarillo significa ya otra cosa en
          la escala de dureza. La ficha, en cambio, no compite con nada
          porque va sobre fondo opaco.
        */}
        {modo === 'relieve' && puertos.map((p, i) => {
          const a = mapear(p.inicio), b = mapear(p.fin);
          if (b <= a) return null;
          const activo = puertoFoco === i;
          return (
            <path key={`s${i}`} d={lineaPath(a, b)} fill="none"
              stroke={activo ? '#D14B42' : '#E0A82E'}
              strokeWidth={activo ? 4.5 : 3.2} strokeLinecap="round" />
          );
        })}

        {fichas.map((f) => {
              /* Marco y vertical van del color del trazo de la subida, no
                 del de la categoria: asi la ficha se lee como parte del
                 mismo dibujo y la vista sigue sola de una a la otra. El
                 unico color de categoria es el del distintivo. */
              const trazo = f.activo ? '#D14B42' : '#E0A82E';
              return (
              <g key={`f${f.i}`} pointerEvents="none">
                <line x1={f.x} y1={f.yCaja + f.alto} x2={f.x} y2={f.yCima}
                  stroke={trazo} strokeWidth={f.activo ? 2 : 1.2}
                  strokeDasharray="4 3" opacity={f.activo ? 0.95 : 0.65} />
                <circle cx={f.x} cy={f.yCima} r={f.activo ? 4 : 3}
                  fill={trazo} />

                <g transform={`translate(${f.xCaja},${f.yCaja})`}>
                  <rect width={f.ancho} height={f.alto} rx="3"
                    fill="#161C26" stroke={trazo}
                    strokeWidth={f.activo ? 1.6 : 1} opacity=".97" />

                  {/* La categoria, en grande: es lo que se busca de un vistazo. */}
                  <rect x="6" y="6" width={f.anchoCat} height="19" rx="2"
                    fill={f.cat.color} />
                  <text x={6 + f.anchoCat / 2} y="19.5" textAnchor="middle"
                    fill={f.cat.codigo === 'hc' ? '#FFFFFF' : '#0E1116'}
                    fontSize="12.5" fontWeight="700"
                    fontFamily="ui-monospace,Menlo,monospace">
                    {f.cat.nombre}
                  </text>

                  <text x={6 + f.anchoCat + 7} y="19.5" fill="#E8EAED"
                    fontSize="11.5" fontWeight="600"
                    fontFamily="ui-monospace,Menlo,monospace">
                    {f.nombre}
                  </text>
                  <text x="7" y="35" fill="#9BA5B4" fontSize="10.5"
                    fontFamily="ui-monospace,Menlo,monospace">
                    {num(f.p.metros / 1000, 1)} km · {num(f.p.pendiente, 1)} % ·{' '}
                    +{num(f.p.desnivel, 0)} m
                  </text>
                </g>
              </g>
              );
            })}

        <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke="#2A3341" strokeWidth="1" />
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <text key={f} x={X(maxD * f)} y={H - 9} textAnchor="middle" fill="#6B7684"
            fontSize="10" fontFamily="ui-monospace,Menlo,monospace">
            {num(maxD * f, 0)} km
          </text>
        ))}

        {hover != null && (
          <g pointerEvents="none">
            <line x1={X(datos.d[hover])} y1={T} x2={X(datos.d[hover])} y2={H - B}
              stroke="#9BA5B4" strokeWidth="1" strokeDasharray="3 3" opacity=".55" />
            <circle cx={X(datos.d[hover])} cy={Y(datos.a[hover])} r="4.5"
              fill="#0E1116" stroke="#E8EAED" strokeWidth="2" />
            <g transform={`translate(${Math.min(X(datos.d[hover]) + 10, W - 150)},${T + 4})`}>
              <rect width="140" height={datos.fc ? 50 : 34} rx="2"
                fill="#212936" stroke="#3A4553" opacity=".97" />
              <text x="9" y="18" fill="#E8EAED" fontSize="11.5"
                fontFamily="ui-monospace,Menlo,monospace">
                {num(datos.d[hover], 2)} km · {num(datos.a[hover], 0)} m
              </text>
              {datos.fc && (
                <text x="9" y="36" fill="#E8EAED" fontSize="11.5"
                  fontFamily="ui-monospace,Menlo,monospace">
                  {datos.fc[hover] ? `${datos.fc[hover]} ppm · Z${zonaDeFC(datos.fc[hover], zonas).n}` : 'sin FC'}
                </text>
              )}
            </g>
          </g>
        )}
      </svg>

      {(zoomUtil || puertos.length > 0) && (
        <div className="interruptores">
          {puertos.length > 0 && (
            <label className="interruptor">
              <input type="checkbox" checked={verNombres}
                onChange={(e) => setVerNombres(e.target.checked)} />
              Nombres de las subidas
              <span className="apunte">
                — {puertos.length === 1 ? 'la subida detectada' : `las ${puertos.length} subidas detectadas`},
                con su categoría, sobre el perfil
              </span>
            </label>
          )}
          {zoomUtil && (
            <label className="interruptor">
              <input type="checkbox" checked={zoom}
                onChange={(e) => setZoom(e.target.checked)} />
              Ampliar el relieve
              <span className="apunte">
                — el perfil se dibuja con menos aire, para ver la forma del terreno de cerca
              </span>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
