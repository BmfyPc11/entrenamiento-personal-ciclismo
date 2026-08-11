import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  velocidadMaximaLlanoTramo, velocidadMaximaLlano, zonasGpsDudoso,
} from '../lib/metrics.js';

/*
  Streams sinteticos, muestreados a 1 Hz como los de Strava. Cada fase
  dice a que velocidad (m/s) y con que pendiente (fraccion) se rueda y
  cuantos segundos dura; v1 permite una rampa lineal de velocidad, que es
  como se imita tanto la inercia al salir de una bajada como un sprint.
*/
function construir(fases) {
  const distancia = [0], altitud = [100], tiempo = [0];
  let d = 0, a = 100, t = 0;
  for (const f of fases) {
    for (let s = 0; s < f.segs; s++) {
      const v = f.v1 != null ? f.v0 + ((f.v1 - f.v0) * (s + 1)) / f.segs : f.v0;
      d += v; a += v * (f.pend || 0); t += 1;
      distancia.push(d); altitud.push(a); tiempo.push(t);
    }
  }
  return { distancia, altitud, tiempo };
}

/* 7 m/s son 25,2 km/h: el crucero en llano de referencia en estas pruebas. */
const LLANO = { v0: 7, pend: 0, segs: 300 };

test('en llano puro devuelve la velocidad del tramo', () => {
  const v = velocidadMaximaLlanoTramo(construir([LLANO]));
  assert.ok(Math.abs(v - 25.2) < 0.2, `esperaba ~25,2 km/h y dio ${v}`);
});

test('una bajada sostenida no cuenta como llano', () => {
  assert.equal(velocidadMaximaLlanoTramo(construir([{ v0: 12.5, pend: -0.04, segs: 200 }])), null);
});

/*
  La razon de ser del filtro de aproximacion. Al salir de una bajada del
  -4 % a 45 km/h, los primeros metros de llano son planos de verdad y
  pasan el filtro de pendiente, pero la velocidad la puso la gravedad
  antes de entrar. Sin aproximacion esto devolvia 42 km/h con un crucero
  real de 25.
*/
test('la inercia al salir de una bajada no infla el resultado', () => {
  const v = velocidadMaximaLlanoTramo(construir([
    { v0: 12.5, pend: -0.04, segs: 60 },
    { v0: 12.5, v1: 7, pend: 0, segs: 40 },
    LLANO,
  ]));
  assert.ok(v < 32, `la inercia de la bajada se esta colando: ${v} km/h`);
});

/*
  La rampa corta escondida en la media, calcado del 16 de julio. Alli los
  400 m previos daban +0,19 % de media -subida, en teoria- porque un
  repecho del +2,7 % compensaba la bajada del -2,9 % que venia justo
  despues. El ciclista llegaba al tramo a 39 km/h tras pasar por 21 en la
  subida, y con solo mirar la media aquello contaba como llano.
*/
test('una rampa corta antes del tramo no la tapa la media', () => {
  const v = velocidadMaximaLlanoTramo(construir([
    { v0: 7, pend: 0, segs: 60 },              // llano de aproximacion
    { v0: 6, pend: 0.027, segs: 30 },          // repecho: sube la media
    { v0: 9.5, pend: -0.029, segs: 20 },       // y bajada corta, la que acelera
    { v0: 11, v1: 9, pend: 0, segs: 25 },      // el tramo "llano" contaminado
    { v0: 7, pend: 0, segs: 120 },             // ritmo real
  ]));
  assert.ok(v < 30, `la rampa previa se esta colando: ${v} km/h`);
});

/* Y el reverso: venir de una subida no puede penalizar. Es la situacion
   normal de coronar y ponerse a rodar en llano. */
test('venir de una subida no descarta el tramo', () => {
  const v = velocidadMaximaLlanoTramo(construir([
    { v0: 5, pend: 0.04, segs: 60 },           // subida
    { v0: 9, pend: 0, segs: 120 },             // llano de verdad, 32,4 km/h
  ]));
  assert.ok(v > 30, `un llano tras subida se esta descartando: ${v} km/h`);
});

/* El filtro no puede pasarse de celoso: un sprint de verdad en llano es
   justo lo que la tarjeta quiere ensenar. */
test('un sprint real en llano si cuenta', () => {
  const v = velocidadMaximaLlanoTramo(construir([
    { v0: 7, pend: 0, segs: 100 },
    { v0: 7, v1: 11, pend: 0, segs: 15 },
    { v0: 11, v1: 7, pend: 0, segs: 15 },
    { v0: 7, pend: 0, segs: 100 },
  ]));
  assert.ok(v > 33, `un sprint legitimo se esta descartando: ${v} km/h`);
});

/*
  Regresion del arreglo original: la primera muestra de una salida saltaba
  de 0 a 52,5 m en un segundo (189 km/h) porque el GPS no habia fijado
  posicion todavia.
*/
test('un salto de GPS al arrancar se descarta', () => {
  const s = construir([LLANO]);
  s.distancia = s.distancia.map((d, i) => (i === 0 ? d : d + 52.5));
  s.distancia[0] = 0;
  const v = velocidadMaximaLlanoTramo(s);
  assert.ok(v < 30, `el salto de GPS se ha colado: ${v} km/h`);
});

/*
  El salto de GPS que NO se pasa de velocidad. Reproduce el tramo real de
  la salida del 22 de junio en el delta: terreno plano, el ciclista va a
  32 km/h, y de golpe la distancia acumulada corre cinco segundos a ~70
  km/h. Ningun paso llega a los 90 km/h del techo y no hay bajada
  ninguna, asi que solo la aceleracion lo delata: 10,7 -> 17,7 m/s en un
  segundo son 7 m/s². Sin este filtro la tarjeta mostraba 62,3 km/h.
*/
test('un salto de GPS por debajo del techo de velocidad se descarta', () => {
  const distancia = [0], altitud = [8], tiempo = [0];
  const pasos = [
    ...Array(20).fill(9),                    // 32 km/h normales
    10.7, 17.7, 19.7, 19.3, 19.1, 17.3,      // el salto de posicion
    10.5, ...Array(20).fill(8.5),            // vuelta a la normalidad
  ];
  pasos.forEach((m, k) => {
    distancia.push(distancia[k] + m);
    altitud.push(8);
    tiempo.push(k + 1);
  });
  const v = velocidadMaximaLlanoTramo({ distancia, altitud, tiempo });
  assert.ok(v < 40, `el salto de GPS se ha colado: ${v} km/h`);
});

/* La otra cara: una aceleracion fuerte pero humana no puede descartarse.
   De 25 a 40 km/h en cuatro segundos son 1 m/s², dentro de lo posible. */
test('una aceleracion humana fuerte no se descarta', () => {
  const v = velocidadMaximaLlanoTramo(construir([
    { v0: 7, pend: 0, segs: 60 },
    { v0: 7, v1: 11, pend: 0, segs: 4 },
    { v0: 11, pend: 0, segs: 60 },
  ]));
  assert.ok(v > 33, `una aceleracion legitima se esta descartando: ${v} km/h`);
});

/* Regresion del arreglo original: un hueco de muestreo largo cubre mucha
   distancia de golpe y por si solo no demuestra nada. */
test('una ventana con muy pocas muestras no vale', () => {
  const v = velocidadMaximaLlanoTramo({
    distancia: [0, 62.6, 125.2],
    altitud: [100, 100, 100],
    tiempo: [0, 3, 6],
  });
  assert.equal(v, null);
});

test('sin streams utiles no hay resultado', () => {
  assert.equal(velocidadMaximaLlanoTramo(null), null);
  assert.equal(velocidadMaximaLlanoTramo({}), null);
  assert.equal(velocidadMaximaLlanoTramo({ distancia: [0], altitud: [1], tiempo: [0] }), null);
  assert.equal(velocidadMaximaLlanoTramo({ distancia: [0, 1], altitud: [1, 1] }), null);
});

/* ---------- agregado sobre varias salidas ---------- */

test('se queda con la mejor de las salidas analizadas', () => {
  const cache = {
    1: construir([LLANO]),
    2: construir([{ v0: 9, pend: 0, segs: 300 }]),   // 32,4 km/h
  };
  const v = velocidadMaximaLlano(cache, [{ id: 1 }, { id: 2 }]);
  assert.ok(Math.abs(v - 32.4) < 0.2, `esperaba ~32,4 km/h y dio ${v}`);
});

/*
  La tarjeta vive bajo el filtro de fechas de Resumen y tiene que
  obedecerlo: se le pasan las salidas ya filtradas, y una salida fuera del
  rango no puede aportar su marca aunque siga en la cache.
*/
test('solo cuentan las salidas que se le pasan, no toda la cache', () => {
  const cache = {
    1: construir([LLANO]),
    2: construir([{ v0: 9, pend: 0, segs: 300 }]),
  };
  const v = velocidadMaximaLlano(cache, [{ id: 1 }]);
  assert.ok(Math.abs(v - 25.2) < 0.2, `esperaba ~25,2 km/h y dio ${v}`);
});

test('sin salidas o sin cache no hay resultado', () => {
  assert.equal(velocidadMaximaLlano({}, []), null);
  assert.equal(velocidadMaximaLlano(null, null), null);
  assert.equal(velocidadMaximaLlano({}, [{ id: 99 }]), null);
});

/* ---------- zonas donde el GPS no es de fiar ---------- */

/*
  Salida llana con una deriva de GPS metida donde se pida.

  Es a proposito una deriva SUAVE y no un salto: acelera a 1,8 m/s², por
  debajo del corte de aceleracion, asi que ese filtro no la ve y solo el
  criterio de sitio puede descartarla. Es el caso real que motivo todo
  esto -el tramo del 25 de julio en la Zona Franca subia a 2,6 m/s²- y
  seria inutil probarlo con un salto brusco, que ya cae antes.

  Lleva latlng porque las zonas se localizan en el mapa y no en el
  kilometraje: el mismo punto cae en kilometros distintos segun por donde
  se haya entrado.
*/
function conDerivaEn(indice, punto) {
  const velocidad = (k) => {
    const r = k - indice;
    if (r < 0 || r >= 12) return 8.6;          // ~31 km/h de crucero
    if (r < 3) return 8.6 + 1.8 * (r + 1);     // sube a 14 m/s
    if (r < 9) return 14;                      // ~50 km/h imposibles
    return 14 - 1.8 * (r - 8);                 // y vuelve a bajar
  };
  const distancia = [0], altitud = [8], tiempo = [0], latlng = [[41.3, 2.1]];
  for (let k = 1; k <= 120; k++) {
    distancia.push(distancia[k - 1] + velocidad(k));
    altitud.push(8);
    tiempo.push(k);
    latlng.push(k >= indice - 2 && k < indice + 14 ? punto : [41.3 + k * 1e-4, 2.1]);
  }
  return { distancia, altitud, tiempo, latlng };
}

/* La otra mitad del montaje: un salto brusco, de los que si disparan el
   filtro de aceleracion. Son estos los que delatan el sitio. */
function conSaltoEn(indice, punto) {
  const distancia = [0], altitud = [8], tiempo = [0], latlng = [[41.3, 2.1]];
  for (let k = 1; k <= 120; k++) {
    const salta = k >= indice && k < indice + 4;
    distancia.push(distancia[k - 1] + (salta ? 19 : 8.6));
    altitud.push(8);
    tiempo.push(k);
    latlng.push(k >= indice - 2 && k < indice + 6 ? punto : [41.3 + k * 1e-4, 2.1]);
  }
  return { distancia, altitud, tiempo, latlng };
}

const PUNTO_MALO = [41.32514, 2.13376];

test('fallar una vez en un sitio no lo convierte en zona dudosa', () => {
  /* dos salidas que fallan, pero cada una en un sitio distinto */
  const cache = { 1: conSaltoEn(40, PUNTO_MALO), 2: conSaltoEn(40, [41.9, 2.9]) };
  assert.equal(zonasGpsDudoso(cache).length, 0);
});

test('fallar en el mismo sitio en dos salidas si crea zona', () => {
  const cache = { 1: conSaltoEn(40, PUNTO_MALO), 2: conSaltoEn(70, PUNTO_MALO) };
  const zonas = zonasGpsDudoso(cache);
  assert.equal(zonas.length, 1);
  assert.ok(Math.abs(zonas[0].punto[0] - PUNTO_MALO[0]) < 0.01);
});

/*
  El caso que justifica todo esto, calcado del real. En la Zona Franca el
  GPS se rompe a lo bestia en unas salidas (22 de junio, 11 de julio, 10
  de agosto) y en otras solo deriva un poco (25 de julio). La deriva
  suave, mirada a solas, es indistinguible de un sprint y se lleva el
  record. Lo que la descarta no es nada de su propia salida, sino que
  OTROS dias el mismo punto se rompio del todo.
*/
test('una zona marcada por otras salidas descarta la deriva suave', () => {
  const cache = {
    1: conSaltoEn(40, PUNTO_MALO),     // rompe fuerte, marca el sitio
    2: conSaltoEn(70, PUNTO_MALO),     // idem, otro dia
    3: conDerivaEn(50, PUNTO_MALO),    // aqui solo deriva: nada la delata
  };
  const salidas = [{ id: 1 }, { id: 2 }, { id: 3 }];

  const aSolas = velocidadMaximaLlanoTramo(cache[3]);
  assert.ok(aSolas > 45, `el montaje no reproduce la deriva: ${aSolas} km/h`);

  const conZonas = velocidadMaximaLlano(cache, salidas);
  assert.ok(conZonas < 35, `la zona dudosa no se esta descontando: ${conZonas} km/h`);
});

test('sin latlng no se inventan zonas', () => {
  const cache = { 1: construir([LLANO]), 2: construir([LLANO]) };
  assert.equal(zonasGpsDudoso(cache).length, 0);
  assert.equal(zonasGpsDudoso(null).length, 0);
});

/*
  Regresion del bug real: filtrar por fecha resucitaba una zona ya
  conocida. Con las tres salidas en cache, la de la deriva suave (3) se
  descarta porque 1 y 2 rompieron fuerte en el mismo sitio. Pero si el
  filtro de "velocidadMaximaLlano" solo mira la salida 3 -por ejemplo,
  porque 1 y 2 quedaron fuera del rango de fechas elegido- el criterio
  antiguo (zonasGpsDudoso solo sobre las salidas filtradas) dejaba de
  ver esas dos confirmaciones y la zona desaparecia: la deriva volvia a
  colarse como un sprint legitimo.

  zonasGpsDudoso ya no recibe una lista de salidas: recorre toda la
  cache siempre, asi que el filtro de fechas no puede arrebatarle
  pruebas. La fiabilidad de un sitio no depende de que dias mire el
  usuario ahora mismo.
*/
test('un filtro de fechas no le quita pruebas al catalogo de zonas', () => {
  const cache = {
    1: conSaltoEn(40, PUNTO_MALO),     // fuera del filtro, pero sigue en cache
    2: conSaltoEn(70, PUNTO_MALO),     // idem
    3: conDerivaEn(50, PUNTO_MALO),    // la unica salida "del periodo filtrado"
  };

  /* Solo la salida 3 entra en el filtro -como si 1 y 2 fueran de otro mes-,
     pero 1 y 2 siguen en cache porque el fondo las descarga todas. */
  const soloFiltrada = velocidadMaximaLlano(cache, [{ id: 3 }]);
  assert.ok(soloFiltrada < 35, `la zona dudosa deberia seguir descontandose: ${soloFiltrada} km/h`);
});
