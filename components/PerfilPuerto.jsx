'use client';

import { useMemo, useState } from 'react';
import {
  seccionesPuerto, puntoPendienteMaxima, TRAMOS_DUREZA, tramoDureza,
  categoriaPuerto, num, duracion,
} from '@/lib/metrics';

const HELVETICA = '"Helvetica Neue",Helvetica,Arial,"Segoe UI",system-ui,sans-serif';

/*
  Perfil detallado de un solo puerto, dibujado como los perfiles de las
  guias de carrera: barras de longitud fija con su pendiente escrita.

  A escala de un puerto lo que importa no es la silueta sino cuanto pica
  cada tramo, y eso una linea suave no lo dice: hay que leerlo del color
  y del numero. Los tramos son de 250 m -mas anchos que los 50 m de
  Actividades- porque aqui no hace falta cazar cada rampa suelta, solo
  como se reparte el esfuerzo a lo largo de la subida.
*/
export default function PerfilPuerto({ streams, puerto, indice, cfg, zonas, nombre }) {
  const [foco, setFoco] = useState(null);

  const det = useMemo(() => seccionesPuerto(streams, puerto, { paso: 250 }), [streams, puerto]);
  const picoReal = useMemo(() => puntoPendienteMaxima(streams, puerto), [streams, puerto]);
  if (!det || !det.secciones.length) return null;
  const sec = det.secciones;

  const cat = categoriaPuerto(puerto.metros, puerto.pendiente);
  const nombrePuerto = nombre || `Subida ${indice + 1}`;

  /* --- geometria ---
     Debajo de la linea base se reserva una franja para los % de cada
     tramo (antes iban encima de cada barra y con muchos tramos se
     amontonaban) y, arriba, un hueco para la "coronacion": la linea que
     sube desde el final de la subida hasta la insignia con la categoria.
     La ficha del puerto (nombre y datos) queda a la IZQUIERDA de esa
     insignia y no a un lado reservado aparte, asi el grafico conserva
     todo su ancho. Los margenes laterales son mas ajustados que al
     principio para que las barras cubran mas caja y menos aire.
  */
  const W = 820, mIzq = 40, mDer = 10, mSupBase = 34, mInf = 26;
  const alto = 220;
  /* Antes quedaba mucho hueco muerto entre la insignia y el borde
     superior de la caja: la ficha y la insignia solo necesitan unos
     40 px de los 66 que se reservaban. */
  const extraSup = 40;
  const gapFranja = 4, franjaH = 26;
  const mSup = mSupBase + extraSup;
  const H = mSup + alto + gapFranja + franjaH + mInf;
  const ancho = W - mIzq - mDer;

  /*
    El eje horizontal arranca en el pie del puerto, no en el kilometro de
    la salida donde empieza a subir: al mirar una ascension interesa
    cuanto llevas de ella, no cuanto llevabas de ruta.
  */
  const km0 = sec[0].kmIni;
  const kmT = sec[sec.length - 1].kmFin - km0;

  const altMin = Math.min(...sec.map((s) => s.altIni));
  const altMax = Math.max(...sec.map((s) => s.altFin));
  const rango = Math.max(altMax - altMin, 20) * 1.12;
  const base = altMin;

  const x = (km) => mIzq + ((km - km0) / kmT) * ancho;
  const y = (alt) => mSup + alto - ((alt - base) / rango) * alto;

  const refs = [base, base + rango / 2, base + rango].map((v) => Math.round(v / 10) * 10);

  const colorDe = (s) => TRAMOS_DUREZA[s.tramo - 1].color;

  /* Altura del perfil DIBUJADO (no la altitud suavizada real) en un km
     cualquiera: interpola sobre la misma cadena de trapecios que se
     pinta, para que cualquier marcador que se apoye aqui quede pegado a
     la silueta que se ve, no a un valor que no coincide con el dibujo. */
  const alturaEnKm = (km) => {
    if (km <= sec[0].kmIni) return sec[0].altIni;
    for (const s of sec) {
      if (km <= s.kmFin) {
        const t = s.kmFin > s.kmIni ? (km - s.kmIni) / (s.kmFin - s.kmIni) : 0;
        return s.altIni + t * (s.altFin - s.altIni);
      }
    }
    return sec[sec.length - 1].altFin;
  };

  /*
    Indicadores de distancia a paso limpio (0,25 / 0,5 / 1 km) en vez de
    repartir el eje en quintos: un puerto de 1,5 km con marcas cada 0,25
    se lee mejor que uno con marcas en 0,38-0,75-1,13 km, que no dicen
    nada por si solas. El paso crece con la longitud para que un puerto
    largo no acabe con quince numeros pegados unos a otros.
  */
  /* Sin decimales de mas: "1,0 km" se queda en "1 km", pero "0,25 km"
     o "3,7 km" conservan los que hacen falta para no perder precision. */
  const formatoKm = (v) => {
    const r2 = Math.round(v * 100) / 100;
    if (Math.abs(r2 - Math.round(r2)) < 1e-9) return num(r2, 0);
    const r1 = Math.round(v * 10) / 10;
    return Math.abs(r1 - r2) < 1e-9 ? num(r1, 1) : num(r2, 2);
  };

  /*
    Las marcas salen de los limites REALES de los tramos (cada 250 m),
    no de numeros redondos independientes: un puerto no mide un multiplo
    exacto de 0,5 km, asi que una marca en "1,0 km" a secas caia entre
    dos tramos y la linea discontinua no coincidia con ninguno. Aqui se
    cuenta en tramos -dos (~0,5 km) o cuatro (~1 km) segun lo largo que
    sea el puerto- y se usa el limite real de ese tramo como posicion,
    que es exactamente donde ya cae la barra de al lado.
  */
  const segPorMarca = kmT <= 3 ? 2 : 4;
  const marcasEje = [0];
  for (let i = segPorMarca; i < sec.length; i += segPorMarca) {
    marcasEje.push(sec[i].kmIni - km0);
  }
  const pasoAprox = segPorMarca * 0.25;
  if (kmT - marcasEje[marcasEje.length - 1] > pasoAprox * 0.4) marcasEje.push(kmT);
  else marcasEje[marcasEje.length - 1] = kmT;

  /* --- el pico real: no el tramo con la media mas alta, sino la ventana
     de ~200 m mas empinada de toda la subida (la misma cuenta que usa
     detectarPuertos para "pendienteMax"), clavada en su punto real. */
  const kmPico = picoReal ? (picoReal.kmIni + picoReal.kmFin) / 2 : null;
  const xPico = kmPico != null ? x(kmPico) : null;
  const yPico = kmPico != null ? y(alturaEnKm(kmPico)) : null;
  const colorPico = picoReal ? tramoDureza(picoReal.pendiente).color : null;

  /* --- la coronacion: linea ascendente desde el final del perfil hasta
     la insignia de categoria; la ficha (nombre + datos) queda a su
     izquierda, dentro del propio ancho del grafico. */
  const xCima = W - mDer;
  const yFinal = y(sec[sec.length - 1].altFin);
  const yInsignia = mSup - 20;
  const rInsignia = 14;
  const xFicha = xCima - rInsignia - 10;
  const tamNombre = nombrePuerto.length > 26 ? 12 : 13.5;

  /* --- la franja de %, debajo de la linea base: una caja negra con el
     numero en blanco -no un chip de color por tramo-, para que se lea
     como una etiqueta de dato y no compita con los colores de arriba. */
  const yFranjaTop = y(base) + gapFranja;

  return (
    <div className="panel" style={{ marginTop: 4 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}
        onMouseLeave={() => setFoco(null)}>

        {refs.map((v, i) => (
          <g key={i}>
            <line x1={mIzq} x2={xCima} y1={y(v)} y2={y(v)}
              stroke="var(--line)" strokeWidth="1" opacity=".5" />
            <text x={mIzq - 8} y={y(v) + 4} textAnchor="end"
              fontFamily="var(--mono)" fontSize="10.5" fill="var(--ink3)">{v}</text>
          </g>
        ))}

        {sec.map((s, i) => {
          const c = colorDe(s);
          const x1 = x(s.kmIni), x2 = x(s.kmFin);
          const activo = foco === i;
          /*
            Cada seccion es un trapecio que sube de la altura de entrada a
            la de salida, de modo que el conjunto reconstruye el perfil real
            en vez de ser un histograma desconectado del terreno.
          */
          const d = `M ${x1} ${y(base)} L ${x1} ${y(s.altIni)} L ${x2} ${y(s.altFin)} L ${x2} ${y(base)} Z`;
          const anchoPx = x2 - x1;
          return (
            <g key={i} onMouseEnter={() => setFoco(i)} style={{ cursor: 'default' }}>
              <path d={d} fill={c} stroke={c} strokeWidth="0.5"
                opacity={foco === null ? 1 : activo ? 1 : 0.35} />
              <rect x={x1} y={mSup} width={anchoPx} height={alto} fill="transparent" />
            </g>
          );
        })}

        <line x1={mIzq} x2={xCima} y1={y(base)} y2={y(base)}
          stroke="var(--line2)" strokeWidth="1" />

        {/* Una linea vertical discontinua en cada marca de km, superpuesta
            sobre el propio relleno -no detras, como al principio- para que
            se lea cruzando el color. Sube desde la base solo hasta tocar la
            silueta real del perfil en ese punto: si siguiera hasta arriba
            se saldria del grafico, por el "cielo" vacio donde ya no hay
            nada que marcar. Tampoco se repite en los dos extremos, que ya
            los marcan el eje y la linea de coronacion. */}
        {marcasEje.filter((v) => v > 0.02 && v < kmT - 0.02).map((v, i) => (
          <line key={`vk${i}`} x1={x(km0 + v)} x2={x(km0 + v)}
            y1={y(base)} y2={y(alturaEnKm(km0 + v))}
            stroke="rgba(255,255,255,.55)" strokeWidth="1.8" strokeDasharray="3 4" />
        ))}

        {/* Franja de % por tramo, debajo de la linea base: caja negra,
            texto blanco y el "%" siempre visible -no hay que adivinar
            de que unidad se habla. */}
        {sec.map((s, i) => {
          const x1 = x(s.kmIni), x2 = x(s.kmFin);
          const activo = foco === i;
          return (
            <g key={i} onMouseEnter={() => setFoco(i)} style={{ cursor: 'default' }}>
              <rect x={x1} y={yFranjaTop} width={x2 - x1} height={franjaH}
                fill="#101318" opacity={foco === null ? 1 : activo ? 1 : 0.45} />
              {x1 > mIzq && (
                <line x1={x1} x2={x1} y1={yFranjaTop} y2={yFranjaTop + franjaH}
                  stroke="var(--bg)" strokeWidth="1" />
              )}
              {(x2 - x1) > 30 && (
                <text x={(x1 + x2) / 2} y={yFranjaTop + franjaH / 2 + 4} textAnchor="middle"
                  fontFamily="var(--mono)" fontSize="11" fontWeight="700" fill="#FFFFFF">
                  {num(s.pendiente, 1)} %
                </text>
              )}
            </g>
          );
        })}

        {marcasEje.map((v, i) => {
          /*
            La linea tiene que clavarse en el borde real del tramo (por
            eso v es ese valor exacto, con sus decimales feos), pero el
            numero que se lee no: se redondea al medio/kilometro mas
            cercano -salvo el ultimo, que es el final real de la subida
            y ese si interesa exacto, no redondeado. */
          const esUltima = i === marcasEje.length - 1;
          const etiqueta = esUltima ? v : Math.round(v / pasoAprox) * pasoAprox;
          return (
            <text key={i} x={x(km0 + v)} y={H - 10}
              textAnchor={i === 0 ? 'start' : esUltima ? 'end' : 'middle'}
              fontFamily="var(--mono)" fontSize="10.5" fontWeight="700" fill="var(--ink)">
              {formatoKm(etiqueta)} km
            </text>
          );
        })}

        {/*
          El pico real de la subida: no el tramo con la media mas alta,
          sino el punto exacto -dentro de ese tramo o a caballo entre dos-
          donde la pendiente aprieta de verdad. Es la unica rampa que se
          marca sobre el propio perfil; el resto de porcentajes vive en
          la franja de abajo.
        */}
        {picoReal && (
          <g>
            <path
              d={`M ${xPico} ${yPico - 4} l -5 -8 l 10 0 Z`}
              fill={colorPico} stroke="var(--ink)" strokeWidth="1" strokeLinejoin="round" />
            <text x={xPico} y={yPico - 16} textAnchor="middle"
              fontFamily="var(--mono)" fontSize="11" fontWeight="700" fill="var(--ink)">
              {num(picoReal.pendiente, 1)} %
            </text>
          </g>
        )}

        {/*
          La coronacion: donde acaba el perfil, una linea sube hasta una
          insignia con la categoria del puerto; a su izquierda, el nombre
          y la ficha (desnivel, distancia, pendiente media). Es la misma
          lectura que da el mapa de un puerto en una guia de carrera: se
          ve de un vistazo que ahi arriba se acaba de coronar.
        */}
        <line x1={xCima} x2={xCima} y1={yFinal} y2={yInsignia + rInsignia}
          stroke={cat.color} strokeWidth="2" strokeDasharray="1 4" strokeLinecap="round" />
        <circle cx={xCima} cy={yInsignia} r={rInsignia} fill={cat.color} />
        <text x={xCima} y={yInsignia + 4} textAnchor="middle"
          fontFamily={HELVETICA} fontWeight="700" fontSize="11.5"
          fill={cat.codigo === 'hc' ? '#FFFFFF' : '#0A0C0F'}>
          {cat.nombre}
        </text>
        <text x={xFicha} y={yInsignia - 3} textAnchor="end"
          fontFamily={HELVETICA} fontWeight="700" fontSize={tamNombre} fill="var(--ink)">
          {nombrePuerto}
        </text>
        <text x={xFicha} y={yInsignia + 13} textAnchor="end"
          fontFamily={HELVETICA} fontWeight="400" fontSize="11" fill="var(--ink2)">
          +{num(puerto.desnivel, 0)} m - {num(puerto.metros / 1000, 2)} km a {num(puerto.pendiente, 1)} %
        </text>
      </svg>

      {foco !== null && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--ink2)',
          borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 12 }}>
          Km {num(sec[foco].kmIni - km0, 2)}–{num(sec[foco].kmFin - km0, 2)} de la subida ·{' '}
          <b style={{ color: colorDe(sec[foco]) }}>{num(sec[foco].pendiente, 1)} %</b>
          {' '}· +{num(sec[foco].altFin - sec[foco].altIni, 0)} m
          {sec[foco].segundos ? ` · ${duracion(sec[foco].segundos)}` : ''}
          {sec[foco].vam ? ` · ${num(sec[foco].vam, 0)} m/h` : ''}
          {sec[foco].fcMedia ? ` · ${sec[foco].fcMedia} ppm` : ''}
        </div>
      )}

      {/* La leyenda arranca justo donde arranca el grafico (mIzq), no en
          el borde del panel: mismo eje vertical que el resto de la UI. */}
      <div className="perfil-leyenda" style={{ marginTop: 12, marginLeft: `${(mIzq / W) * 100}%` }}>
        {TRAMOS_DUREZA.filter((t) => sec.some((s) => s.tramo === t.n)).map((t) => (
          <span key={t.n} className="leyenda-item">
            <i style={{ background: t.color }} />{t.nombre}
          </span>
        ))}
      </div>
    </div>
  );
}
