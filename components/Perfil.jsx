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
    Las fichas de los puertos se colocan primero, porque de cuantas filas
    ocupen depende cuanto crece el grafico.

    Al principio esto se resolvia duplicando la escala de altitud: el
    relieve bajaba a la mitad inferior y arriba quedaba hueco. Pero eso
    mezclaba dos cosas que no tienen por que ir juntas, y el precio era
    aplastar el perfil un 38 %. El sitio para las etiquetas es una banda
    de pixeles; la escala de altitud es otra cosa. Separadas, el relieve
    conserva su forma y las fichas siguen teniendo su hueco.
  */
  const ALTO_FICHA = 44, HUECO_FICHA = 4;
  const cajas = [];
  if (modo === 'relieve' && puertos.length) {
    const filas = [];   // ultimo x ocupado por cada fila
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

        /* Primera fila donde la caja no pise a la anterior. */
        let fila = 0;
        while (filas[fila] != null && xCaja < filas[fila] + HUECO_FICHA) fila++;
        filas[fila] = xCaja + ancho;

        cajas.push({ p, i, k, cat, nombre, ancho, anchoCat, x, xCaja, fila });
      });
    /* Se ordenan por indice para que el foco y las claves no bailen. */
    cajas.sort((a, b) => a.i - b.i);
  }

  const nFilas = cajas.length ? Math.max(...cajas.map((c) => c.fila)) + 1 : 0;
  const banda = nFilas ? nFilas * (ALTO_FICHA + HUECO_FICHA) + 6 : 0;

  /* El grafico crece justo lo que ocupan las fichas, de modo que el area
     donde se dibuja el relieve conserva su tamano de siempre. */
  const H = altura + banda;
  const T = T0 + banda;

  /*
    Escala vertical con un margen holgado pero sin exagerar. Ajustarla al
    desnivel exacto hace que cualquier repecho llene la pantalla y
    parezca un puerto; un 20 % de aire basta para quitar ese dramatismo
    sin aplastar el relieve.
  */
  const techo = redondearTecho(Math.max(maxA, 1) * 1.2);
  const base = minA >= 0 ? 0 : Math.floor(minA / 50) * 50;

  const Y = (v) => H - B - ((v - base) / (techo - base)) * (H - T - B);

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

  /* Las cajas ya traen su fila y su ancho; aqui solo se les pone la
     altura, que necesita la escala vertical ya definida. */
  const fichas = cajas.map((c) => ({
    ...c,
    alto: ALTO_FICHA,
    yCaja: T0 + c.fila * (ALTO_FICHA + HUECO_FICHA),
    yCima: Y(datos.a[c.k]),
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

        {/* puertos: subrayado de la subida y ficha en la coronacion */}
        {modo === 'relieve' && (
          <>
            {puertos.map((p, i) => {
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
          </>
        )}

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
    </div>
  );
}
