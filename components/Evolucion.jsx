'use client';

import { useMemo, useState } from 'react';
import { evolucionPorZonaTerreno, num, fechaCorta } from '@/lib/metrics';

/*
  Evolucion de velocidad por zona de pulso dentro de cada terreno.

  La comparacion solo significa algo entre esfuerzos equivalentes. Hasta la
  v3.2 el agrupamiento era por salida entera, y eso mezclaba dentro de una
  misma linea el llaneo del delta con la subida a Montjuic. Ahora cada
  salida se trocea en tramos y cada tramo cuenta en su propio terreno y en
  su propia zona: lo que se compara es homogeneo.
*/
export default function Evolucion({ salidas, cache, zonas, excluidas, fondo }) {
  const terrenos = useMemo(
    () => evolucionPorZonaTerreno(salidas, cache, zonas, excluidas),
    [salidas, cache, zonas, excluidas]
  );

  const [sel, setSel] = useState(null);
  const activo = (sel && terrenos.find((t) => t.id === sel))
    || terrenos.find((t) => t.total > 0)
    || terrenos[0];

  const hayDatos = terrenos.some((t) => t.total > 0);

  return (
    <>
      <h2>Evolución por zona y terreno</h2>
      <p className="hint">
        Cada salida se trocea en tramos de 100 m. Cada tramo cuenta en el terreno que le
        corresponde por su propia pendiente y en la zona de pulso en la que ibas en ese
        momento. Así lo que compara la gráfica son esfuerzos equivalentes: lo que rindes
        hoy en una zona y un terreno frente a lo que rendías antes en esa misma
        combinación. Los descensos quedan fuera: bajar a 45 km/h sin pedalear no dice
        nada de cómo llaneas, y contarlo como llano solo inflaba la media. El eje
        horizontal da una columna a cada salida, no a cada día del calendario: así un
        parón no deja un hueco que la línea cruce como si fuera progreso.
      </p>
      <p className="hint">
        <strong>El llano se mide en km/h y las subidas en metros verticales por hora.</strong>{' '}
        No es un capricho: a igual esfuerzo, subir al 15 % en vez de al 7 % te deja la
        velocidad por la mitad, mientras que la VAM apenas se mueve. En km/h, dos ascensos
        idénticos de esfuerzo saldrían distintos solo porque uno era más empinado, y la
        gráfica estaría midiendo qué puerto tocaba ese día en lugar de cómo estás.
      </p>

      {!hayDatos ? (
        <div className="callout">
          {fondo?.activo
            ? <>Analizando salidas… <strong>{fondo.hechas} de {fondo.total}</strong>. La
              gráfica aparece en cuanto haya detalle suficiente.</>
            : <>Todavía no hay ninguna salida con pulsómetro analizada. Esta vista necesita
              el detalle completo (altitud y pulso segundo a segundo), no solo los totales
              de cada salida.</>}
        </div>
      ) : (
        <>
          <div className="chips" style={{ marginBottom: 14 }}>
            {terrenos.map((t) => (
              <button key={t.id} aria-pressed={activo?.id === t.id} onClick={() => setSel(t.id)}
                style={activo?.id === t.id
                  ? { background: t.color, borderColor: t.color, color: '#0E1116' } : null}>
                <i style={{ background: t.color }} />
                {t.nombre} · {t.total}
              </button>
            ))}
          </div>

          {/* La clave reinicia la zona elegida al cambiar de terreno: una zona
              con datos en Llano puede no tener ninguno en Montaña. */}
          {activo && <Terreno t={activo} key={activo.id} />}

          {fondo?.activo && (
            <div className="callout">
              Todavía se están trayendo salidas de Strava ({fondo.hechas} de {fondo.total}).
              La gráfica se completará sola.
            </div>
          )}
        </>
      )}
    </>
  );
}

function Terreno({ t }) {
  const [zonaSel, setZonaSel] = useState(null);

  const todos = t.zonas.flatMap((z) => z.puntos.map((p) => ({ ...p, zona: z })));

  /*
    Con una zona elegida se dibuja solo ella. No se atenuan las demas como
    en el perfil de Entrenamientos, y la diferencia importa: al quedarse
    una sola serie, la escala vertical se reajusta a su rango y la
    tendencia se despliega. Con las cinco a la vez el eje tiene que cubrir
    desde el paseo de Z1 hasta el sprint de Z5, y dentro de esa horquilla
    la variacion de una zona concreta se ve como una linea casi plana.
  */
  const zonasVisibles = zonaSel ? t.zonas.filter((z) => z.n === zonaSel) : t.zonas;
  const visibles = zonasVisibles.flatMap((z) => z.puntos.map((p) => ({ ...p, zona: z })));

  /* Cada terreno se mide con lo suyo: el llano en km/h y las subidas en
     metros verticales por hora. El motivo esta en TERRENOS, en metrics.js. */
  const valor = (p) => (t.metrica === 'vam' ? p.vam : p.velocidad);

  /* Un punto sin valor en la metrica del terreno no se puede colocar en el
     eje. Con las bandas actuales no deberia darse —en mixto y montaña todo
     tramo sube—, pero pintarlo saldria como un punto pegado al suelo sin
     que nada avisara de que es basura. */
  const dibujables = (z) => z.puntos.filter((p) => valor(p) != null);

  /* Solo se traza linea con dos puntos o mas: con uno no hay tendencia que dibujar. */
  const conLinea = zonasVisibles.filter((z) => dibujables(z).length >= 2);
  const escasas = zonasVisibles.filter((z) => dibujables(z).length < 2);

  if (!todos.length) {
    return (
      <div className="callout">
        En {t.nombre.toLowerCase()} todavía no hay ningún tramo acumulado. Si no sueles
        pasar por este terreno, es lo esperable.
      </div>
    );
  }

  const W = 760, H = 260;
  const mIzq = 46, mDer = 22, mSup = 22, mInf = 38;
  const ancho = W - mIzq - mDer, alto = H - mSup - mInf;

  /*
    El eje X reparte por salidas, no por calendario.

    Con fechas reales, un mes sin entrenar se comia un tercio del ancho
    en blanco y una semana de cuatro salidas se apelotonaba en dos
    centimetros. Peor todavia: la linea cruzaba el hueco como un segmento
    recto larguisimo, que se lee como una progresion continua cuando ahi
    en medio no se midio nada.

    La numeracion viene de metrics.js y es por salida, no por serie, de
    modo que todos los puntos del mismo dia comparten columna y las zonas
    siguen alineadas entre si. Las etiquetas siguen siendo fechas reales:
    lo que se pierde es la escala temporal, no la referencia.
  */
  /* El eje horizontal se calcula siempre sobre todas las salidas del
     terreno, elijas la zona que elijas: si se encogiera al filtrar, cada
     zona pintaria sus puntos en sitios distintos y compararlas saltando
     de una a otra dejaria de significar nada. */
  const ultimo = Math.max(0, t.salidas - 1);

  /* El vertical, en cambio, se ajusta a lo que se esta viendo. */
  const vals = visibles.map(valor).filter((v) => v != null);
  const vMin = Math.min(...vals) * 0.92, vMax = Math.max(...vals) * 1.08;

  const x = (orden) => (ultimo === 0
    ? mIzq + ancho / 2
    : mIzq + (orden / ultimo) * ancho);
  const y = (v) => (vMax === vMin
    ? mSup + alto / 2
    : mSup + alto - ((v - vMin) / (vMax - vMin)) * alto);

  /* Fecha de cada columna, para poder etiquetar el eje. Se construye con
     todos los puntos y no solo con los visibles: una zona filtrada puede
     no tener punto en la columna que toca etiquetar. */
  const fechaDe = new Map();
  todos.forEach((p) => { if (!fechaDe.has(p.orden)) fechaDe.set(p.orden, p.fecha); });

  /* Etiquetas del eje X: extremos y centro, que es lo que cabe sin amasijo. */
  const marcas = ultimo === 0
    ? [0]
    : [0, Math.round(ultimo / 2), ultimo];

  return (
    <>
      <div className="panel">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
          {[0, 0.5, 1].map((f, i) => (
            <line key={i} x1={mIzq} x2={W - mDer}
              y1={mSup + alto * f} y2={mSup + alto * f}
              stroke="var(--line)" strokeWidth="1" opacity=".5" />
          ))}

          {conLinea.map((z) => (
            <path key={z.n} fill="none" stroke={z.color} strokeWidth="2" strokeLinejoin="round"
              d={dibujables(z).map((p, i) =>
                `${i ? 'L' : 'M'} ${x(p.orden)} ${y(valor(p))}`).join(' ')} />
          ))}

          {zonasVisibles.map((z) => dibujables(z).map((p, i) => (
            <circle key={`${z.n}-${i}`} cx={x(p.orden)} cy={y(valor(p))} r="3.5"
              fill={z.color} />
          )))}

          <text x={mIzq - 8} y={mSup + 4} textAnchor="end" fontFamily="var(--mono)"
            fontSize="10.5" fill="var(--ink2)">{num(vMax, 0)}</text>
          <text x={mIzq - 8} y={mSup + alto} textAnchor="end" fontFamily="var(--mono)"
            fontSize="10.5" fill="var(--ink2)">{num(vMin, 0)}</text>
          <text x={mIzq - 8} y={mSup - 8} textAnchor="end" fontFamily="var(--mono)"
            fontSize="10" fill="var(--ink3)">{t.unidad}</text>

          {marcas.map((m, i) => (
            <text key={i} x={x(m)} y={H - 14}
              textAnchor={i === 0 ? 'start' : i === marcas.length - 1 ? 'end' : 'middle'}
              fontFamily="var(--mono)" fontSize="10" fill="var(--ink3)">
              {fechaCorta(fechaDe.get(m)).slice(0, 6)}
            </text>
          ))}
        </svg>

        {/*
          La leyenda es tambien el selector. Las zonas sin datos siguen
          listadas, atenuadas y sin poder pulsarse: si desapareciesen sin
          mas, faltaria la mitad de la historia: que esa combinacion existe
          y todavia no tienes material en ella.
        */}
        <div className="chips" style={{ marginTop: 10 }}>
          <button
            aria-pressed={zonaSel === null}
            onClick={() => setZonaSel(null)}
            style={zonaSel === null
              ? { background: 'var(--ink2)', borderColor: 'var(--ink2)' } : null}
          >
            Todas
          </button>
          {t.zonas.map((z) => {
            const vacia = z.puntos.length === 0;
            const activa = zonaSel === z.n;
            return (
              <button
                key={z.n}
                aria-pressed={activa}
                disabled={vacia}
                onClick={() => setZonaSel(activa ? null : z.n)}
                title={vacia
                  ? `Todavía no hay ninguna salida con tramos en Z${z.n} en este terreno`
                  : `Ver solo Z${z.n}`}
                style={activa
                  ? { background: z.color, borderColor: z.color, color: '#0E1116' }
                  : null}
              >
                <i style={{ background: z.color, opacity: vacia ? 0.4 : 1 }} />
                Z{z.n} {z.nombre} · {z.puntos.length}
              </button>
            );
          })}
        </div>
      </div>

      {escasas.length > 0 && (
        <div className="callout">
          En {t.nombre.toLowerCase()} todavía no hay tendencia que trazar en{' '}
          <strong>
            {escasas.map((z) => `Z${z.n}`).join(', ').replace(/, ([^,]*)$/, ' ni $1')}
          </strong>
          : hacen falta al menos dos salidas con tramos en esa combinación y ahora hay{' '}
          {escasas.every((z) => z.puntos.length === 0) ? 'cero' : 'una o ninguna'}. Es lo
          normal al principio — hay quince combinaciones de zona y terreno, y una sola
          salida solo alimenta unas pocas.
        </div>
      )}

    </>
  );
}
