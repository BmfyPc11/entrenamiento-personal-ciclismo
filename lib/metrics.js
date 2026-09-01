/* ============================================================
   Motor de calculo. Todo lo que convierte datos brutos de Strava
   en algo que sirva para entrenar.
   ============================================================ */

export const G = 9.81;
export const RHO = 1.2;      // densidad del aire a nivel del mar
export const TRANS = 0.97;   // rendimiento de la transmision

export const PERFILES_BICI = [
  { id: 'gravel_alto', nombre: 'Gravel, manos arriba', cda: 0.36, crr: 0.008 },
  { id: 'gravel_bajo', nombre: 'Gravel, manos abajo', cda: 0.32, crr: 0.007 },
  { id: 'carretera', nombre: 'Carretera, manos abajo', cda: 0.30, crr: 0.005 },
  { id: 'aero', nombre: 'Carretera, posicion aero', cda: 0.26, crr: 0.0045 },
];

export const NOMBRES_ZONA = ['Recuperacion', 'Fondo', 'Tempo', 'Umbral', 'VO2 max'];
export const COLORES_ZONA = ['#8FA3AC', '#6FA35A', '#E0A82E', '#E07B2E', '#D14B42'];

/*
  Modelos de zonas. Cada uno define los cuatro cortes entre las cinco zonas,
  como porcentaje de la FC maxima. Que Strava, Garmin y este panel den
  numeros distintos casi siempre se debe a dos cosas: usan modelos distintos
  y, sobre todo, tienen configurada una FC maxima distinta.
*/
export const MODELOS_ZONAS = {
  clasico: {
    nombre: 'Clasico (50/60/70/80/90 %)',
    descripcion: 'El modelo por defecto de Strava y del que parten casi todas las tablas.',
    cortes: [50, 60, 70, 80, 90],
  },
};

/* Devuelve las cinco zonas en pulsaciones, listas para usar. */
export function calcularZonas(cfg) {
  const fcmax = cfg.fcmax || 185;

  let limites;
  if (cfg.modeloZonas === 'personalizado' && Array.isArray(cfg.zonasPropias)) {
    limites = cfg.zonasPropias.map((v) => Math.round(v));
  } else {
    const m = MODELOS_ZONAS[cfg.modeloZonas] || MODELOS_ZONAS.clasico;
    limites = m.cortes.map((p) => Math.round((p / 100) * fcmax));
  }

  return limites.map((desde, i) => ({
    n: i + 1,
    nombre: NOMBRES_ZONA[i],
    color: COLORES_ZONA[i],
    desde,
    hasta: i < 4 ? limites[i + 1] - 1 : null,
    pct: Math.round((desde / fcmax) * 100),
  }));
}

export function zonaDeFC(fc, zonas) {
  for (let i = zonas.length - 1; i >= 0; i--) if (fc >= zonas[i].desde) return zonas[i];
  return zonas[0];
}

/* ---------- potencia ---------- */

/* Potencia necesaria para ir a velocidad v (m/s) con pendiente dada (fraccion). */
export function vatios(v, pendiente, masaTotal, cda, crr) {
  const ang = Math.atan(pendiente);
  const grav = masaTotal * G * Math.sin(ang) * v;
  const rod = crr * masaTotal * G * Math.cos(ang) * v;
  const aero = 0.5 * RHO * cda * v ** 3;
  return (grav + rod + aero) / TRANS;
}

/* Velocidad que alcanzarias con una potencia dada. */
export function velocidadPara(w, pendiente, masaTotal, cda, crr) {
  let lo = 0.2, hi = 30;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    vatios(mid, pendiente, masaTotal, cda, crr) > w ? (hi = mid) : (lo = mid);
  }
  return (lo + hi) / 2;
}

/* Potencia media estimada de una salida completa, a partir de sus totales.
   Si Strava trae potencia real de un medidor, usamos esa. */
export function vatiosSalida(s, cfg) {
  if (s.vatiosReales && s.vatios) return s.vatios;
  const mt = cfg.peso + cfg.bici;
  const v = s.distancia / s.tiempoMovimiento;
  const grav = (mt * G * s.desnivel) / s.tiempoMovimiento;
  const rod = cfg.crr * mt * G * v;
  const aero = 0.5 * RHO * cfg.cda * v ** 3 * 1.15; // correccion por variabilidad
  return (grav + rod + aero) / TRANS;
}

/* Potencia media estimada de un puerto concreto. */
export function vatiosPuerto(p, cfg) {
  const mt = cfg.peso + cfg.bici;
  const v = p.metros / p.segundos;
  return vatios(v, p.pendiente / 100, mt, cfg.cda, cfg.crr);
}

/* ---------- umbral estimado ---------- */

/* A partir de los mejores esfuerzos sostenidos en subida.
   Un esfuerzo de 10-15 min se sostiene por encima del umbral; uno
   de 40 min, ligeramente por debajo. De ahi los factores. */
export function umbralEstimado(puertos, cfg) {
  if (!puertos.length) return null;
  const factor = (s) => (s < 480 ? 0.82 : s < 900 ? 0.88 : s < 1500 ? 0.93 : s < 2400 ? 0.98 : 1.02);
  return Math.round(Math.max(...puertos.map((p) => vatiosPuerto(p, cfg) * factor(p.segundos))));
}

/* ---------- deteccion de puertos ---------- */

function suavizar(arr, ventana = 5) {
  const out = new Array(arr.length);
  const r = Math.max(1, Math.floor(ventana / 2));
  for (let i = 0; i < arr.length; i++) {
    let s = 0, n = 0;
    for (let j = Math.max(0, i - r); j <= Math.min(arr.length - 1, i + r); j++) { s += arr[j]; n++; }
    out[i] = s / n;
  }
  return out;
}

/* La ventana de suavizado se calcula en metros, no en numero de puntos:
   asi funciona igual con un stream de 1 punto por segundo que con uno reducido. */
function ventanaPara(distancia, metros = 120) {
  const n = distancia.length;
  const pasoMedio = (distancia[n - 1] - distancia[0]) / (n - 1) || 10;
  return Math.max(3, Math.min(31, Math.round(metros / pasoMedio) | 1));
}

/*
  Deteccion de puertos.

  El problema de recorrer el perfil "de minimo a maximo" es que arrastra
  los llaneos de antes y despues de la subida, y sale un puerto larguisimo
  con una pendiente media ridicula. Aqui se puntua cada tramo con

      puntos = desnivel ganado  -  pendienteMinima * distancia

  de modo que un tramo llano puntua negativo y un tramo empinado positivo.
  Buscando la subsecuencia de puntuacion maxima (Kadane), los extremos
  se recortan solos justo donde empieza y acaba la pendiente de verdad.

  Una sola pendiente minima no puede decidirlo todo, y ese era el
  problema de la version anterior. El mismo numero mandaba en tres
  decisiones que piden permisividades distintas:

    a) donde EMPIEZA el puerto. Aqui hay que ser estricto: el descanso
       que muchas subidas traen justo antes de picar de verdad no es
       parte del puerto, y colarlo hunde la pendiente media (una subida
       al 5,3 % pasaba a marcar 3,7 % por arrastrar la aproximacion).
    b) donde ACABA. Aqui hay que ser permisivo: es normal que una subida
       afloje a falta de un kilometro, baje un poco y vuelva a picar
       suave hasta la cima, y ese tramo final es parte del puerto.
    c) si dos subidas seguidas son una o son dos. Ni lo uno ni lo otro
       siempre: un encadenado de dos puertos de verdad tiene que salir
       como dos, y una sola subida partida en dos por un llaneo a mitad
       tiene que salir como una.

  Con un unico umbral, arreglar (b) rompia (a) y (c) a la vez. Ahora cada
  cosa se decide en su fase, con su propio criterio:

    1. Nucleos: Kadane con minPend estricto (3 %). Da los limites buenos
       para (a) -su recorte del inicio ya funcionaba bien- y deja los
       encadenados bien separados.
    2. Vecinos: dos nucleos pegados se unen solo si unirlos da un puerto
       MEJOR que las partes; si el primero es una rampa de aproximacion
       al segundo, se descarta en vez de fundirse, para que el grande
       conserve su pendiente. Eso es (c).
    3. Colas: el final de cada puerto se alarga por terreno mas blando
       (pendExtension, 2 %) mientras siga ganando altura. Eso es (b), y
       al ir despues de la fase 2 no puede juntar dos puertos que ya se
       decidio separar.

  opciones:
    minMetros        - longitud minima del puerto
    minDesnivel      - desnivel minimo acumulado
    minPend          - pendiente que separa "subida" de "llaneo" al
                        buscar el nucleo, en %
    maxPuertos       - cuantos buscar como mucho
    pendExtension    - pendiente media minima que se le exige al tramo
                        que se anade al final de un puerto (fase 3)
    extensionMaxima  - cuantos metros como mucho se puede alargar ese final
    huecoMaximo      - metros de tramo flojo entre dos puertos por debajo
                        de los cuales se estudia unirlos o descartar el
                        pequeno (fase 2)
    pendienteHuecoMin - pendiente minima (puede ser negativa) que se
                        tolera en ese hueco; por debajo de esto es una
                        bajada real y los dos puertos se quedan aparte
    factorAbsorcion  - si el coeficiente del puerto de delante no llega a
                        esta proporcion del de detras, se considera su
                        rampa de aproximacion y se descarta
*/
export function detectarPuertos(streams, opciones = {}) {
  const {
    minMetros = 500, minDesnivel = 30, minPend = 3, maxPuertos = 12,
    pendExtension = 2, extensionMaxima = 1200,
    huecoMaximo = 400, pendienteHuecoMin = -1, factorAbsorcion = 0.35,
  } = opciones;
  const { distancia: d, altitud: a0, tiempo: t, fc } = streams || {};
  if (!d || !a0 || d.length < 10) return [];

  const a = suavizar(a0, ventanaPara(d));
  const n = a.length;
  const umbral = minPend / 100;

  // puntuacion de cada tramo entre dos puntos consecutivos
  const puntos = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    puntos[i] = a[i + 1] - a[i] - umbral * (d[i + 1] - d[i]);
  }

  const usado = new Array(n - 1).fill(false);

  /*
    Construye el objeto puerto entre dos indices del stream completo.
    Se usa tanto para cada tramo que encuentra el Kadane de abajo como
    para los que salen de fusionar dos puertos vecinos (ver mas abajo):
    las cifras finales (metros, desnivel, pendiente...) siempre se
    recalculan sobre el tramo entero, nunca se suman a mano, para que un
    puerto fusionado quede identico a como habria salido si el Kadane lo
    hubiera detectado de una pieza desde el principio.
  */
  const construir = (s, e) => {
    // Los limites se buscan sobre el perfil suavizado, pero las cifras que
    // se muestran se calculan sobre la altitud original: el suavizado achata
    // los extremos y subestimaria el desnivel real.
    const metros = d[e] - d[s];
    let desnivel = 0;
    for (let i = s; i < e; i++) { const dz = a0[i + 1] - a0[i]; if (dz > 0) desnivel += dz; }
    const desnivelNeto = a0[e] - a0[s];
    if (metros < minMetros || desnivelNeto < minDesnivel) return null;

    const pend = (desnivelNeto / metros) * 100;
    const segundos = t ? t[e] - t[s] : null;

    let fcMedia = null, fcMax = null;
    if (fc) {
      const tramo = fc.slice(s, e + 1).filter((x) => x > 0);
      if (tramo.length) {
        fcMedia = Math.round(tramo.reduce((x, y) => x + y, 0) / tramo.length);
        fcMax = Math.max(...tramo);
      }
    }

    // pendiente maxima sostenida en tramos de unos 200 m
    let pendMax = pend;
    for (let k = s; k < e; k++) {
      let m = k;
      while (m < e && d[m] - d[k] < 200) m++;
      if (d[m] - d[k] > 100) pendMax = Math.max(pendMax, ((a[m] - a[k]) / (d[m] - d[k])) * 100);
    }

    return {
      inicio: s,
      fin: e,
      kmInicio: d[s] / 1000,
      kmFin: d[e] / 1000,
      metros,
      desnivel: desnivelNeto,
      desnivelAcumulado: desnivel,
      pendiente: pend,
      pendienteMax: pendMax,
      segundos,
      velocidad: segundos ? (metros / segundos) * 3.6 : null,
      vam: segundos ? desnivelNeto / (segundos / 3600) : null,
      fcMedia,
      fcMax,
    };
  };

  const puertos = [];

  for (let vuelta = 0; vuelta < maxPuertos * 2 && puertos.length < maxPuertos; vuelta++) {
    let mejorVal = 0, mejorIni = 0, mejorFin = -1;
    let acum = 0, ini = 0;

    for (let i = 0; i < puntos.length; i++) {
      if (usado[i]) { acum = 0; ini = i + 1; continue; }
      if (acum <= 0) { acum = puntos[i]; ini = i; } else { acum += puntos[i]; }
      if (acum > mejorVal) { mejorVal = acum; mejorIni = ini; mejorFin = i; }
    }

    if (mejorFin < 0 || mejorVal < minDesnivel * 0.25) break;

    const s = mejorIni, e = mejorFin + 1;
    for (let i = mejorIni; i <= mejorFin; i++) usado[i] = true;

    const candidato = construir(s, e);
    if (candidato) puertos.push(candidato);
  }

  puertos.sort((x, y) => x.kmInicio - y.kmInicio);

  /*
    --- fase 2: que hacer con dos nucleos pegados ---

    Solo se estudia si el hueco entre ellos es corto y no es una bajada
    de verdad; si media un descenso real, es un encadenado de dos puertos
    y no hay nada que decidir.

    Cumplido eso, decide el coeficiente de categoria (km x pendiente^2,
    el mismo con el que se reparten 4a...HC), y el orden de las dos
    preguntas importa:

    1. .Es el de delante mucho mas flojo que el de detras? Entonces no es
       un puerto, es la rampa de aproximacion, y se DESCARTA. No se
       funde: fundirlo arrastraria el descanso de en medio dentro del
       puerto grande y le hundiria la pendiente media, que es justo lo
       que no se quiere.
    2. Si los dos se sostienen, .unirlos da un puerto mejor que
       cualquiera de las partes? Entonces era una sola subida partida en
       dos por un llaneo a mitad, y se funden. Si unirlos solo diluye,
       son dos puertos de verdad y se quedan aparte.

    La primera pregunta va antes a proposito. Como el hueco tiene que ser
    corto para llegar hasta aqui, fundir casi siempre "puntua" mejor
    -mas metros a cambio de perder poca pendiente-, asi que preguntando
    por la fusion primero no se llegaria nunca a descartar una rampa.
  */
  const coefDe = (p) => coeficientePuerto(p.metros, p.pendiente);

  const depurados = [];
  for (const p of puertos) {
    const anterior = depurados[depurados.length - 1];
    if (!anterior) { depurados.push(p); continue; }

    const huecoMetros = d[p.inicio] - d[anterior.fin];
    const huecoDesnivel = a0[p.inicio] - a0[anterior.fin];
    const huecoPendiente = huecoMetros > 0 ? (huecoDesnivel / huecoMetros) * 100 : 0;
    const pegados = huecoMetros >= 0 && huecoMetros <= huecoMaximo
      && huecoPendiente >= pendienteHuecoMin;
    if (!pegados) { depurados.push(p); continue; }

    const coefAnterior = coefDe(anterior), coefActual = coefDe(p);
    const combinado = construir(anterior.inicio, p.fin);

    if (coefAnterior < coefActual * factorAbsorcion) {
      depurados[depurados.length - 1] = p;
    } else if (combinado && coefDe(combinado) >= Math.max(coefAnterior, coefActual)) {
      depurados[depurados.length - 1] = combinado;
    } else {
      depurados.push(p);
    }
  }

  /*
    --- fase 3: alargar la cola ---

    Es normal que una subida afloje antes de la cima: baja un poco y
    vuelve a picar suave hasta arriba. Ese tramo es parte del puerto,
    pero al nucleo no le compensa cargar con el a minPend, asi que se
    anade aqui con un umbral mas blando.

    Se mide la pendiente MEDIA de todo lo que se anade, no punto a punto,
    que es lo que permite tragarse un bajon corto si despues se recupera.
    Tres frenos lo mantienen honesto: no puede pasar de extensionMaxima,
    tiene que acabar mas arriba de donde acababa el nucleo, y no puede
    llegar al puerto siguiente -de ahi que esta fase vaya despues de la
    2, para no rehacer por la puerta de atras una separacion que ya se
    decidio.

    De entre todos los finales validos se coge el que deja MEJOR puerto,
    no el mas lejano. Con el mas lejano la cima se iba llano adelante:
    pasada la ultima rampa la media aguantaba por encima del umbral un
    buen rato, y el puerto acababa doscientos metros despues de haber
    dejado de subir.
  */
  for (let i = 0; i < depurados.length; i++) {
    const p = depurados[i];
    const tope = i + 1 < depurados.length ? depurados[i + 1].inicio : n - 1;
    let mejor = p, mejorCoef = coefDe(p);

    for (let j = p.fin + 1; j < tope; j++) {
      const avance = d[j] - d[p.fin];
      if (avance > extensionMaxima) break;
      const ganancia = a0[j] - a0[p.fin];
      if (ganancia <= 0) continue;
      if ((ganancia / avance) * 100 < pendExtension) continue;
      const candidato = construir(p.inicio, j);
      if (!candidato) continue;
      const coef = coefDe(candidato);
      if (coef > mejorCoef) { mejor = candidato; mejorCoef = coef; }
    }

    depurados[i] = mejor;
  }

  return depurados;
}

/* ---------- deteccion de paradas ---------- */

/*
  Puntos donde la salida se detuvo: semaforos, fotos, un pinchazo, la
  parada en la fuente.

  Se mide en velocidad y no en distancia por muestra, y la diferencia
  no es de estilo. A una muestra por segundo, "avanzar menos de 3 m"
  equivale a ir por debajo de 10,8 km/h, y eso lo cumple cualquier
  repecho normal: la primera version de esto marcaba como "parada"
  minutos enteros de una subida al 8 %, que no tiene nada de parada.
  Bajando el umbral a 0,6 m/s (poco mas de 2 km/h) solo entran los
  puntos donde de verdad no giraba la rueda, sea cual sea la pendiente.

  Se usa el stream de velocidad de Strava cuando llega, que ya viene
  suavizado. Si la salida no lo trae, se deriva de distancia y tiempo
  entre muestras consecutivas: es mas ruidoso, pero sigue midiendo
  velocidad y no metros brutos, así que el umbral vale igual.

  El minimo de tiempo importa tanto como el de velocidad: un semaforo
  en ambar o una rotonda despacio no son una parada, y quince segundos
  los deja fuera sin necesidad de otro umbral.
*/
export function detectarParadas(streams, opciones = {}) {
  const { minSegundos = 15, velUmbral = 0.6 } = opciones;
  const { distancia: d, altitud: a, tiempo: t, velocidad: v } = streams || {};
  if (!t || t.length < 2 || (!v && !d)) return [];

  const paradas = [];
  let inicio = null;

  const cerrar = (fin) => {
    const segundos = t[fin] - t[inicio];
    if (segundos >= minSegundos) {
      paradas.push({
        inicio,
        fin,
        segundos,
        km: d ? d[inicio] / 1000 : null,
        altitud: a ? a[inicio] : null,
      });
    }
    inicio = null;
  };

  for (let i = 1; i < t.length; i++) {
    const dt = t[i] - t[i - 1];
    if (dt <= 0) continue;

    /* Con stream de velocidad se promedian los dos extremos del tramo,
       que amortigua el ruido de una muestra suelta. Sin el, se deriva
       de la distancia recorrida en ese mismo tramo. */
    const vel = v ? (v[i - 1] + v[i]) / 2 : (d[i] - d[i - 1]) / dt;

    if (vel < velUmbral) {
      if (inicio === null) inicio = i - 1;
    } else if (inicio !== null) {
      cerrar(i - 1);
    }
  }
  if (inicio !== null) cerrar(t.length - 1);

  return paradas;
}

/* ---------- velocidad maxima en llano ---------- */

/*
  La velocidad mas alta sostenida en un tramo de terreno llano.

  No es la velocidad punta que da Strava: esa la puede disparar un bache
  de dos segundos o el final de una bajada larga, y no dice nada de como
  ruedas en llano. Aqui se busca la ventana de 100 m mas rapida entre las
  que no bajan de un -1 % de pendiente: admite un llano con un pelin de
  descenso o viento de cola, pero descarta hasta el falso llano suave,
  que ya deja notar la gravedad y no el pedaleo. La primera version
  usaba 50 m y -2 %, y en la practica seguia colando bajadas cortas que
  no eran representativas de crucero en llano; alargar el tramo y
  endurecer el corte de pendiente exige mas metros reales de esfuerzo
  sostenido antes de aceptar un resultado.

  La pendiente se calcula sobre la altitud suavizada, con la misma
  ventana que usa seccionesPuerto() para sus barras de 50 m: sin
  suavizar, el temblor del altimetro convierte tramos llanos en
  "bajadas" del -3 % y los descarta por error.

  Mirar solo la pendiente DE DENTRO de la ventana no basta, y esto costo
  un numero que parecia bueno y no lo era. Al salir de una bajada entras
  al llano a 45-50 km/h: esos primeros 100 m son planos de verdad y
  pasaban el filtro, pero la velocidad la puso la gravedad cien metros
  antes, no el pedaleo. Con las constantes de este ciclista, bajar un
  -4 % pedaleando a su umbral se estabiliza en 46 km/h: sostener esa
  cifra en llano de verdad pediria unos 550 W, cuatro veces su umbral.
  De ahi la ventana de aproximacion: los metros PREVIOS tampoco pueden
  venir de bajada.

  Hay una segunda forma de ensuciar el dato, independiente de la
  anterior y que costo llegar a ver: el GPS salta de sitio y la distancia
  acumulada corre varios segundos a 70 km/h en pleno delta, sin bajada
  ninguna y sin que ningun paso suelto pase del techo de velocidad. Contra
  eso el criterio es la aceleracion, no la velocidad. Los dos filtros
  hacen falta: cada uno atrapa una basura que el otro deja pasar.

  Un aviso para quien venga a tocar los numeros de aqui: las tres cifras
  que mandan -100 m de ventana, 400 m de aproximacion, 3 m/s²- estan
  calibradas contra datos reales de Strava, no elegidas a ojo. Conviene
  medir antes de moverlas, que es justo lo que hacen las pruebas de
  tests/velocidad.test.mjs.
*/
export function velocidadMaximaLlanoTramo(streams, opciones = {}) {
  const {
    metros: minMetros = 100, pendienteMinima = -1,
    /*
      Cuanto terreno previo tiene que ser tambien llano. La inercia de una
      bajada no se agota en veinte metros: medido sobre la simulacion de
      este mismo ciclista, con 200 m de aproximacion todavia quedaban
      +5 km/h de regalo y con 400 m bajan a +1,5. Pasar de ahi empieza a
      descartar llanos legitimos y cortos entre dos subidas, que es peor
      remedio que enfermedad. Un sprint real en llano no se ve afectado:
      su aproximacion tambien es llana.
    */
    metrosAproximacion = 400,
    /*
      Y la aproximacion tampoco puede esconder una rampa corta. Lo de
      arriba mira la pendiente MEDIA de los 400 m previos, y una media
      miente: en la salida del 16 de julio esos 400 m daban +0,19 %
      -o sea, subida- porque un repecho del +2,7 % compensaba en el
      promedio la bajada del -2,9 % que venia justo despues. El ciclista
      entraba al tramo a 39 km/h despues de haber pasado por 21 en la
      subida, y el numero se colaba como llano.

      Asi que ademas de la media se mira el peor cacho: ningun tramo de
      50 m dentro de los 200 m anteriores puede bajar de esto. Con -3 %
      no cambiaba nada y con -2 % cae justo el caso real, sin tocar
      ninguna otra salida.
    */
    rampaPrevia = 2, metrosRampaPrevia = 200,
    /* Por encima de esto, un salto entre dos muestras consecutivas no es
       un ciclista: es la senal de GPS recuperandose tras el arbolado de
       Collserola, un tunel o el arranque en frio al inicio de la
       grabacion. 90 km/h de techo es generoso a proposito, muy por
       encima de lo que se alcanza en llano, para no descartar nunca un
       sprint real. */
    velMaxPaso = 90,
    /*
      Aceleracion imposible entre dos muestras, en m/s². El techo de
      velocidad de arriba deja pasar un tipo de basura que se ve mucho en
      el delta: la senal salta de sitio y la distancia acumulada corre
      cinco segundos a 70 km/h en terreno perfectamente plano, sin que
      ningun paso suelto llegue a los 90 y sin que sea una bajada, asi
      que ni el techo ni la aproximacion lo tocan. Lo que si delata a ese
      tramo es la fisica: pasar de 10,7 a 17,7 m/s en un segundo son
      7 m/s², o 0,7 g, que en bicicleta no existe.

      El corte esta medido sobre las 87.762 muestras de esta cuenta: la
      mediana de aceleracion es 0,1 m/s², el percentil 99 es 1,4 y solo
      un 0,37 % pasa de 3. Por encima de 3 m/s² ya no hay ciclismo, hay
      ruido de GPS -3 m/s² es un 0 a 30 km/h en 2,8 s, sprint de elite-,
      asi que ese es el limite.
    */
    acelMaxima = 3,
    /*
      Una ventana de solo dos muestras (un unico paso) no mide un tramo,
      mide el ruido de esa muestra suelta. Se vio con datos reales: un
      hueco de muestreo de 3 s en vez del habitual 1 s cubrio 62,6 m y
      eso solo ya ganaba como "velocidad maxima", sin que hubiese 50 m de
      pedaleo sostenido detras. Exigir al menos cinco muestras obliga a
      que la ventana recoja varios pasos reales, no la extrapolacion de
      uno solo.
    */
    minPuntos = 5,
    /* Puntos donde el GPS no es de fiar, los que devuelve
       zonasGpsDudoso(). Cualquier paso que caiga dentro se descarta. */
    zonasDudosas = null,
  } = opciones;
  const { distancia: d, altitud: a0, tiempo: t, latlng: ll } = streams || {};
  if (!d || !a0 || !t || d.length < 2) return null;

  const a = suavizar(a0, ventanaPara(d, 100));
  const techoMS = velMaxPaso / 3.6;

  /*
    Se detecto midiendo con datos reales: la primera muestra de una
    salida saltaba de 0 a 52,5 m en un segundo (189 km/h) porque el GPS
    aun no habia fijado la posicion, y esa unica muestra ya bastaba para
    completar la ventana de 50 m entera. Aqui se marca cada paso entre
    dos muestras como valido o no, y con un prefijo acumulado se puede
    comprobar en O(1) si una ventana [i, j) contiene alguno invalido: no
    es que ese tramo fuese lento o rapido, es que el dato no es de fiar y
    no debe entrar en el calculo.
  */
  const invalidosHasta = new Array(d.length).fill(0);
  for (let k = 0; k < d.length - 1; k++) {
    const dt = t[k + 1] - t[k];
    const dd = d[k + 1] - d[k];
    let malo = !(dt > 0) || dd / dt > techoMS;
    /* El salto de posicion no siempre se pasa de velocidad, pero siempre
       se pasa de aceleracion: se mira tambien el cambio respecto al paso
       anterior. */
    if (!malo && k > 0) {
      const dtPrevio = t[k] - t[k - 1];
      if (dtPrevio > 0) {
        const vPrevia = (d[k] - d[k - 1]) / dtPrevio;
        if (Math.abs(dd / dt - vPrevia) / dt > acelMaxima) malo = true;
      }
    }
    /* Y por ultimo, el sitio: en un punto negro conocido el dato no vale
       aunque este paso concreto parezca razonable. */
    if (!malo && zonasDudosas?.length && ll?.[k + 1]) {
      if (zonasDudosas.some((z) => distanciaGeo(z.punto, ll[k + 1]) <= z.radio)) malo = true;
    }
    invalidosHasta[k + 1] = invalidosHasta[k] + (malo ? 1 : 0);
  }

  /* Para cada punto, el ultimo indice que queda un tramo de 50 m por
     detras. Se precalcula con un puntero que solo avanza -O(n) en total-
     y permite recorrer la aproximacion a saltos de 50 m sin volver a
     buscar cada vez. */
  const PASO_RAMPA = 50;
  const atras = new Array(d.length).fill(0);
  for (let k = 0, q = 0; k < d.length; k++) {
    while (d[k] - d[q + 1] >= PASO_RAMPA) q++;
    atras[k] = q;
  }

  let max = null;
  let j = 0;
  /* La aproximacion se recorre con su propio puntero, que solo avanza:
     igual que j, el coste total queda amortizado en O(n). */
  let p = 0;

  for (let i = 0; i < d.length - 1; i++) {
    if (j < i) j = i;
    while (j < d.length - 1 && (d[j] - d[i] < minMetros || j - i < minPuntos)) j++;
    const dist = d[j] - d[i];
    if (dist < minMetros || j - i < minPuntos) break;

    if (invalidosHasta[j] - invalidosHasta[i] > 0) continue;

    const seg = t[j] - t[i];
    if (!(seg > 0)) continue;

    const pend = ((a[j] - a[i]) / dist) * 100;
    if (pend < pendienteMinima) continue;

    /*
      El tramo de aproximacion es el ultimo p tal que quedan al menos
      metrosAproximacion por detras de i. Al principio de la salida no hay
      tanto recorrido detras, y ahi no se exige nada: descartar el arranque
      entero costaria mas de lo que arregla.
    */
    while (d[i] - d[p + 1] >= metrosAproximacion) p++;
    if (d[i] - d[p] >= metrosAproximacion) {
      const pendPrevia = ((a[i] - a[p]) / (d[i] - d[p])) * 100;
      if (pendPrevia < pendienteMinima) continue;
    }

    /* La media de la aproximacion no basta: se recorre hacia atras a
       saltos de 50 m y basta con que uno solo baje demasiado para
       descartar el tramo, aunque el resto lo compense. */
    if (rampaPrevia) {
      let k = i, limpia = true;
      while (d[i] - d[k] < metrosRampaPrevia) {
        const q = atras[k];
        if (q >= k) break;                     // ya no queda recorrido detras
        if (((a[k] - a[q]) / (d[k] - d[q])) * 100 < -rampaPrevia) { limpia = false; break; }
        k = q;
      }
      if (!limpia) continue;
    }

    const vel = (dist / seg) * 3.6;
    if (max == null || vel > max) max = vel;
  }
  return max;
}

/*
  Tiempo real (en segundos, interpolado entre dos muestras) en que el
  stream de distancia cruza por primera vez `metros`. null si la salida
  nunca llega tan lejos.

  A diferencia de velocidadMaximaLlanoTramo esto no necesita filtrar
  ruido de aceleracion: ahi el peligro era un salto de POSICION que
  disparaba una velocidad instantanea absurda entre dos muestras
  consecutivas. Aqui se lee una distancia acumulada, que ya viene
  creciente de Strava y no se ve afectada de la misma forma por ese
  jitter -un salto puntual adelanta o atrasa el cruce por unos metros,
  no inventa un cruce que no existe.
*/
export function tiempoHastaDistancia(streams, metros) {
  const { distancia: d, tiempo: t } = streams || {};
  if (!d || !t || d.length < 2 || !(metros > 0)) return null;
  if (d[d.length - 1] < metros) return null;
  if (d[0] >= metros) return t[0];

  for (let i = 1; i < d.length; i++) {
    if (d[i] < metros) continue;
    if (d[i] === d[i - 1]) return t[i];
    const frac = (metros - d[i - 1]) / (d[i] - d[i - 1]);
    return t[i - 1] + frac * (t[i] - t[i - 1]);
  }
  return null;
}

/* Primer indice j >= jDesde (y >= i) en que la distancia acumulada
   llega a `objetivo`, con el tiempo interpolado en ese punto exacto.
   null si la salida se acaba antes de llegar. Comparte la interpolacion
   de tiempoHastaDistancia pero permite arrancar la busqueda en
   cualquier indice i, no solo en el 0 -es lo que hace falta para
   mejorVentanaTiempo, mas abajo. */
function cruceDesde(d, t, i, objetivo, jDesde) {
  let j = Math.max(jDesde, i);
  while (j < d.length - 1 && d[j] < objetivo) j++;
  if (d[j] < objetivo) return null;
  if (j === i) return { tiempo: t[i], j };
  const dPrev = d[j - 1], tPrev = t[j - 1];
  const tiempo = dPrev === d[j] ? t[j] : tPrev + ((objetivo - dPrev) / (d[j] - dPrev)) * (t[j] - tPrev);
  return { tiempo, j };
}

/*
  El mejor tiempo real en cubrir `metros` en CUALQUIER punto de la
  salida, no solo desde el km 0 -a diferencia de tiempoHastaDistancia.
  Si el ritmo mas fuerte llego a mitad de salida, con calentamiento
  antes y bajada de ritmo despues, esta es la version que lo encuentra
  en vez de devolver el tiempo (peor) desde el arranque.

  Con la distancia acumulada siempre creciente, el final de cada
  ventana candidata solo puede avanzar segun el inicio tambien avanza:
  mismo doble puntero de velocidadMaximaLlanoTramo, asi que probar
  TODOS los inicios posibles sigue siendo O(n) y no O(n²).

  A diferencia de Sprinter, aqui no se filtra pendiente por ventana: en
  un tramo de 5-80 km una bajada corta se diluye en el promedio mucho
  mas que en un pico de 100 m, y la salida entera ya tiene que ser
  "llano" (tipoRuta) para que esta cuenta se use -ver mejorSplitReal en
  Logros.jsx.
*/
export function mejorVentanaTiempo(streams, metros) {
  const { distancia: d, tiempo: t } = streams || {};
  if (!d || !t || d.length < 2 || !(metros > 0)) return null;
  if (d[d.length - 1] - d[0] < metros) return null;

  let mejor = null;
  let j = 0;
  for (let i = 0; i < d.length; i++) {
    const objetivo = d[i] + metros;
    if (objetivo > d[d.length - 1]) break;
    const r = cruceDesde(d, t, i, objetivo, j);
    if (!r) break;
    j = r.j;
    const dur = r.tiempo - t[i];
    if (mejor == null || dur < mejor) mejor = dur;
  }
  return mejor;
}

/* Distancias (en km) sobre las que Logros mide "tiempo mas rapido en
   recorrer X km en llano". Un solo sitio para las 5 tarjetas, en vez de
   repetir la lista en metrics.js, repo.js y el sync. */
export const DISTANCIAS_SPLIT_KM = [5, 10, 20, 40, 80];

/* {5: segundos, 10: segundos, ...} - solo las claves que la salida
   realmente alcanza. Se calcula una vez en /api/sync y se guarda, para
   que Logros solo tenga que leer un numero ya calculado en cada carga.
   Usa mejorVentanaTiempo (mejor tramo en cualquier punto de la salida),
   no tiempoHastaDistancia (solo desde el km 0). */
export function calcularSplits(streams, distanciasKm = DISTANCIAS_SPLIT_KM) {
  const splits = {};
  distanciasKm.forEach((km) => {
    const seg = mejorVentanaTiempo(streams, km * 1000);
    if (seg != null) splits[km] = seg;
  });
  return splits;
}

/*
  Puntos del mapa donde el GPS no es de fiar.

  Hay sitios que rompen la senal siempre: naves industriales que la
  rebotan, calles estrechas entre edificios altos, un paso bajo tierra.
  Ahi la posicion salta y la distancia acumulada se inventa metros, con
  la particularidad de que a veces lo hace despacio -una deriva suave, no
  un salto- y entonces ni el techo de velocidad ni el de aceleracion la
  ven venir.

  Lo que si delata a esos sitios es que fallan una y otra vez. Una
  anomalia suelta puede ser un bache o un tiron real; la misma anomalia
  en el mismo punto en salidas de dias distintos ya no es casualidad, es
  el sitio. De ahi el criterio: se juntan las anomalias por proximidad y
  solo se da por mala la zona cuando aparecen en dos salidas diferentes
  como minimo.

  Se detecta en vez de mantener una lista escrita a mano porque la lista
  obliga a conocer el terreno y a acordarse de actualizarla. Midiendo
  sobre esta cuenta, la deteccion encontro sola el punto de la Zona
  Franca que ya se sospechaba, y otros quince mas que nadie habia
  senalado, todos en sitios con edificios alrededor.

  Se recorre TODA la cache y no las salidas filtradas, y esto ya se
  habia hecho al reves una vez: iterar la cache entera hacia que esta
  fuera la unica tarjeta de "Tus estadisticas" que ignoraba el filtro de
  fechas, asi que se cambio a recibir las salidas ya filtradas. Ese
  cambio arreglaba una cosa y rompia otra sin que se notara enseguida.
  Con el historico completo (12 salidas) esta cuenta confirma 16 zonas
  dudosas, alguna con hasta 5 salidas de respaldo; filtrando a "ultimo
  mes" (6 salidas) sobrevivian solo 6, porque las salidas que
  confirmaban las otras diez quedaban fuera de la ventana y la condicion
  de "al menos dos salidas" dejaba de cumplirse. El GPS de un sitio no
  cambia porque se acorte el calendario: lo unico que cambiaba era
  cuantas pruebas quedaban a mano, y con menos pruebas una zona conocida
  volvia a colarse como buena. Filtrando a ese mes la velocidad punta
  subia de 35 a 40 km/h por una anomalia que el historico completo ya
  sabia descartar.

  La solucion separa las dos preguntas, que no son la misma: si un
  SITIO es de fiar se responde con todos los datos que haya, sin
  filtrar; que salida se lleva el record de un periodo concreto si debe
  mirar solo ese periodo, y eso lo sigue haciendo velocidadMaximaLlano
  con las salidas que se le pasan.
*/
export function zonasGpsDudoso(cache, opciones = {}) {
  const { acelMaxima = 3, radio = 150, minSalidas = 2 } = opciones;

  /* 1. Todas las anomalias de aceleracion, con donde ocurrieron. */
  const anomalias = [];
  Object.entries(cache || {}).forEach(([id, st]) => {
    const { distancia: d, tiempo: t, latlng: ll } = st || {};
    if (!d || !t || !ll) return;
    for (let k = 2; k < d.length; k++) {
      const dtPrevio = t[k - 1] - t[k - 2];
      const dt = t[k] - t[k - 1];
      if (!(dtPrevio > 0) || !(dt > 0) || !ll[k]) continue;
      const vPrevia = (d[k - 1] - d[k - 2]) / dtPrevio;
      const v = (d[k] - d[k - 1]) / dt;
      if (Math.abs(v - vPrevia) / dt > acelMaxima) anomalias.push({ punto: ll[k], id });
    }
  });

  /* 2. Se agrupan por cercania y sobrevive la que repite en varias
        salidas. El coste es cuadratico sobre las anomalias, no sobre los
        puntos del recorrido: son unos cientos, no cientos de miles. */
  const zonas = [];
  const usada = new Array(anomalias.length).fill(false);
  for (let i = 0; i < anomalias.length; i++) {
    if (usada[i]) continue;
    usada[i] = true;
    const salidasVistas = new Set([anomalias[i].id]);
    for (let k = i + 1; k < anomalias.length; k++) {
      if (usada[k] || distanciaGeo(anomalias[i].punto, anomalias[k].punto) > radio) continue;
      usada[k] = true;
      salidasVistas.add(anomalias[k].id);
    }
    if (salidasVistas.size >= minSalidas) zonas.push({ punto: anomalias[i].punto, radio });
  }
  return zonas;
}

/*
  La misma busqueda sobre las salidas que se estan analizando. Solo
  cuentan las que tienen streams en cache: sin distancia y altitud punto
  a punto no hay ventana que medir.

  Recorre las salidas y no la cache para el TRAMO GANADOR: el rango de
  fechas y las exclusiones tienen que aplicarse a que salida se lleva el
  record, igual que a las demas tarjetas de "Tus estadisticas". Pero el
  catalogo de zonas dudosas (zonasGpsDudoso) se calcula aparte, sobre
  toda la cache sin filtrar: vale la pena repetirlo porque son preguntas
  distintas. Cuanta mas pruebas tenga, mejor sabe si un sitio es de
  fiar, y esa fiabilidad no depende de que fechas este mirando el
  usuario ahora mismo.

  Devuelve tambien el id de la salida ganadora -no solo la cifra- para
  que la tarjeta de "Tus estadisticas" pueda enlazar directamente a esa
  salida en vez de dejar el record sin rastro de donde salio.
*/
export function velocidadMaximaLlano(cache, salidas) {
  const zonasDudosas = zonasGpsDudoso(cache);
  let max = null, salidaId = null;
  (salidas || []).forEach((s) => {
    const st = cache?.[s.id];
    if (!st) return;
    const v = velocidadMaximaLlanoTramo(st, { zonasDudosas });
    if (v != null && (max == null || v > max)) { max = v; salidaId = s.id; }
  });
  return max == null ? null : { valor: max, salidaId };
}

/* ---------- reparto por zonas ---------- */

export function repartoZonas(streams, zonas, opciones = {}) {
  const { velUmbral = 0.6 } = opciones;
  const { fc, tiempo, velocidad: v } = streams || {};
  if (!fc || !zonas) return null;
  const seg = [0, 0, 0, 0, 0];
  for (let i = 0; i < fc.length; i++) {
    if (!fc[i]) continue;
    const dt = tiempo && i > 0 ? tiempo[i] - tiempo[i - 1] : 1;
    /* El stream "time" de Strava es tiempo transcurrido, no en movimiento:
       sin este filtro, las paradas cortas (semaforos, fotos) se colarian
       en el reparto pese a la promesa del pie de pagina. Mismo umbral que
       detectarParadas, promediando los dos extremos del tramo. */
    if (v && i > 0 && (v[i - 1] + v[i]) / 2 < velUmbral) continue;
    seg[zonaDeFC(fc[i], zonas).n - 1] += Math.min(dt, 30); // ignora huecos largos
  }
  const total = seg.reduce((a, b) => a + b, 0) || 1;
  return { segundos: seg, porcentaje: seg.map((s) => (s / total) * 100), total };
}

/* ---------- carga, fatiga y forma ---------- */

export function serieCarga(salidas, cfg, umbral) {
  if (!salidas.length || !umbral) return [];
  const porDia = new Map();
  salidas.forEach((s) => {
    const f = s.fecha.slice(0, 10);
    const IF = vatiosSalida(s, cfg) / umbral;
    const carga = (s.tiempoMovimiento / 3600) * IF * IF * 100;
    porDia.set(f, (porDia.get(f) || 0) + carga);
  });

  const inicio = new Date(salidas[0].fecha.slice(0, 10));
  const fin = new Date(salidas[salidas.length - 1].fecha.slice(0, 10));
  const serie = [];
  let condicion = 0, fatiga = 0;

  for (let t = new Date(inicio); t <= fin; t.setDate(t.getDate() + 1)) {
    const f = t.toISOString().slice(0, 10);
    const c = porDia.get(f) || 0;
    condicion += (c - condicion) / 42;
    fatiga += (c - fatiga) / 7;
    serie.push({ fecha: f, carga: c, condicion, fatiga, forma: condicion - fatiga });
  }
  return serie;
}

/* ---------- utilidades ---------- */

export const kmh = (s) => (s.distancia / s.tiempoMovimiento) * 3.6;
export const km = (s) => s.distancia / 1000;
export const metrosPorKm = (s) => s.desnivel / (s.distancia / 1000);
export const vamSalida = (s) => s.desnivel / (s.tiempoMovimiento / 3600);
/*
  ---------- Tipo de terreno de una salida completa ----------

  Hasta la v3.4 esto era un solo numero: metros de desnivel por
  kilometro, llano por debajo de 5 y puerto por encima de 12. El
  problema de una media suelta es que no sabe de quien es la salida. Doce
  metros por kilometro son terreno de paso para quien vive entre puertos
  y la salida mas dura del ano para quien rueda en el delta, y sin
  embargo se pintaban igual.

  Ahora la clasificacion tiene dos piezas:

  1. Unos MINIMOS absolutos, que son los que impiden que a base de
     compararse consigo mismo cualquiera acabe teniendo "etapas de
     montana". Una salida no puede ser de montana si no sube de verdad,
     por muy dura que sea para su dueno.

  2. Una REFERENCIA propia de cada usuario: la salida mas exigente de las
     que superan esos minimos. El resto se mide contra ella. Asi la
     escala se estira o se encoge con el historial de cada uno, y va
     cambiando sola segun se ruedan cosas mas duras.

  Si nadie llega al minimo de montana -lo normal cuando todavia no has
  hecho un puerto grande-, la referencia la marca la mejor colina y
  simplemente no hay etapas de montana. Es correcto que no las haya:
  aparecerian el dia que subas una.
*/

/*
  Indice de montana de una salida: desnivel partido por la raiz de los
  kilometros.

  Se usa la raiz y no los kilometros a secas (que serian los metros por
  kilometro de siempre) porque dividir por la distancia entera castiga
  demasiado a las salidas largas: 1000 m en 100 km salen a 10 m/km,
  igual que 200 m en 20 km, y no son la misma salida ni de lejos. La
  raiz deja que el desnivel total siga pesando, pero descuenta parte del
  llaneo de aproximacion.
*/
export const indiceTerreno = (s) => s.desnivel / Math.sqrt(km(s) || 1);

/*
  Minimos para poder aspirar a cada tipo. El desnivel es lo que separa
  una salida de montana de un dia de toboganes; la densidad evita que
  una marcha larguisima sume mil metros a base de repechos y se cuele.
*/
export const MINIMOS_TERRENO = {
  puerto: { desnivel: 1000, densidad: 10 },
  mixto: { desnivel: 150, densidad: 5 },
};

/* Proporcion de la referencia a partir de la cual se entra en cada tipo. */
export const PROPORCION_TERRENO = { puerto: 0.55, mixto: 0.22 };

const llegaA = (s, tipo) => {
  const m = MINIMOS_TERRENO[tipo];
  return s.desnivel >= m.desnivel && metrosPorKm(s) >= m.densidad;
};

/*
  La vara de medir de este usuario: el indice de su salida mas dura de
  las que llegan al minimo de montana y, si no hay ninguna, el de la
  mejor colina. Se calcula una vez sobre todo el historial y se pasa a
  quien tenga que clasificar; sin ella, tipoRuta se queda solo con los
  minimos absolutos.
*/
export function referenciaTerreno(salidas) {
  const indices = (tipo) => (salidas || [])
    .filter((s) => s.distancia > 0 && llegaA(s, tipo))
    .map(indiceTerreno);

  const deMontana = indices('puerto');
  if (deMontana.length) return { indice: Math.max(...deMontana), hayMontana: true };

  const deColina = indices('mixto');
  if (deColina.length) return { indice: Math.max(...deColina), hayMontana: false };

  return null;
}

export function tipoRuta(s, referencia = null) {
  if (!s?.distancia) return 'llano';

  /* Sin referencia -una ruta suelta, un GPX analizado sin historial-
     solo se pueden aplicar los minimos. */
  if (!referencia) {
    if (llegaA(s, 'puerto')) return 'puerto';
    return llegaA(s, 'mixto') ? 'mixto' : 'llano';
  }

  const i = indiceTerreno(s);
  if (llegaA(s, 'puerto') && i >= PROPORCION_TERRENO.puerto * referencia.indice) return 'puerto';
  if (llegaA(s, 'mixto') && i >= PROPORCION_TERRENO.mixto * referencia.indice) return 'mixto';
  return 'llano';
}

export const esLlana = (s, referencia = null) => tipoRuta(s, referencia) === 'llano';

export const COLORES_TIPO = { llano: '#6FA35A', mixto: '#E07B2E', puerto: '#D14B42' };
export const NOMBRES_TIPO = { llano: 'Llano', mixto: 'Mixto', puerto: 'Puerto' };

/* Misma insignia de tres letras que la tabla de "Tus salidas" en Resumen
   -codigo, fondo y color de texto-, centralizada aqui para que cualquier
   otra lista de salidas (el desplegable de Entrenamientos, por ejemplo)
   pueda reutilizarla sin duplicar los colores ni arriesgarse a que se
   desincronicen. No son los mismos colores que COLORES_TIPO: alli el
   naranja de "mixto" tiene que distinguirse del ambar de zona 3 de FC en
   el mismo golpe de vista, y la insignia va sola, sin esa colision. */
export const TIPO_INSIGNIA = {
  llano: { codigo: 'LLA', fondo: 'var(--green)', tinta: '#0A0C0F' },
  mixto: { codigo: 'COL', fondo: 'var(--amber)', tinta: '#0A0C0F' },
  puerto: { codigo: 'MON', fondo: 'var(--red)', tinta: '#FFFFFF' },
};

export const num = (v, d = 1) =>
  v == null || Number.isNaN(v)
    ? '—'
    : v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });

export function duracion(s) {
  if (s == null) return '—';
  s = Math.round(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}:${String(seg).padStart(2, '0')}`;
}

/* HH:MM:SS con ceros a la izquierda en las tres posiciones, para tablas
   donde las cifras tienen que alinear en columna. duracion() no sirve
   ahi: cambia de forma segun haya horas o no ("3:45" frente a "1h 45m")
   y esa forma variable es justo lo que rompe la alineacion. */
export function duracionHMS(s) {
  if (s == null) return '—';
  s = Math.round(s);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(seg).padStart(2, '0')}`;
}

export function fechaCorta(f) {
  return new Date(f).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' });
}

export function fechaLarga(f) {
  return new Date(f).toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

/* dd/mm/aa, para tablas donde la fecha es solo un dato mas entre
   columnas y no necesita nombrar el mes: fechaCorta() ya cumple ese
   otro papel donde el mes en palabras ayuda a leer. */
export function fechaDDMMAA(f) {
  return new Date(f).toLocaleDateString('es-ES', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  });
}

/* ============================================================
   Intensidad de una salida, semana de entrenamiento y consejo.
   ============================================================ */

/*
  Intensidad de una salida en escala 1-5, equivalente a una zona.
  Si hay pulsometro se usa la FC media, que es el dato honesto.
  Si no lo hay, se estima desde la potencia relativa al umbral: peor,
  pero sirve para colorear el calendario sin dejar huecos.
*/
export function intensidadSalida(s, cfg, zonas, umbral) {
  if (s.fcMedia && zonas) {
    return { zona: zonaDeFC(s.fcMedia, zonas).n, estimada: false };
  }
  const IF = vatiosSalida(s, cfg) / (umbral || 150);
  const zona = IF < 0.55 ? 1 : IF < 0.7 ? 2 : IF < 0.82 ? 3 : IF < 0.95 ? 4 : 5;
  return { zona, estimada: true };
}

export const ORDEN_TIPO = { llano: 0, mixto: 1, puerto: 2 };

/* Los ultimos N dias hasta hoy, con la salida de cada dia si la hubo. */
export function ultimosDias(salidas, cfg, zonas, umbral, n = 30, referencia = null) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const dias = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoy);
    d.setDate(d.getDate() - i);
    const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const delDia = salidas.filter((s) => s.fecha.slice(0, 10) === clave);

    let resumen = null;
    if (delDia.length) {
      const km = delDia.reduce((a, s) => a + s.distancia, 0) / 1000;
      const seg = delDia.reduce((a, s) => a + s.tiempoMovimiento, 0);
      const desnivel = delDia.reduce((a, s) => a + s.desnivel, 0);
      const inten = delDia
        .map((s) => intensidadSalida(s, cfg, zonas, umbral))
        .reduce((a, b) => (b.zona > a.zona ? b : a));
      /* Con mas de una salida el mismo dia, manda la mas exigente de las
         dos: mismo criterio que un par de lineas mas arriba con la zona. */
      const tipo = delDia
        .map((x) => tipoRuta(x, referencia))
        .reduce((a, b) => (ORDEN_TIPO[b] > ORDEN_TIPO[a] ? b : a));
      resumen = {
        km,
        segundos: seg,
        desnivel,
        zona: inten.zona,
        estimada: inten.estimada,
        tipo,
        salidas: delDia,
        nombre: delDia[0].nombre,
      };
    }

    dias.push({
      fecha: d,
      clave,
      esHoy: i === 0,
      diaSemana: ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'][d.getDay()],
      diaMes: d.getDate(),
      mes: d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', ''),
      actividad: resumen,
    });
  }
  return dias;
}

/*
  Consejo del entrenador.

  Mira los ultimos diez dias y decide que toca. El orden de las reglas
  importa: primero lo que puede hacer dano (volver de un paron, encadenar
  dias duros) y solo despues lo que es afinar.
*/
export function consejoEntrenador(salidas, cfg, zonas, umbral) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const hace = (n) => new Date(hoy.getTime() - n * 864e5);

  const recientes = salidas.filter((s) => new Date(s.fecha) >= hace(10));
  const ultimaSemana = salidas.filter((s) => new Date(s.fecha) >= hace(7));

  if (!salidas.length) {
    return {
      titulo: 'Aun no hay nada que analizar',
      texto: 'En cuanto registres unas cuantas salidas podre decirte que te conviene entrenar.',
      tono: 'neutro',
      etiqueta: 'Sin datos',
    };
  }

  const ultima = salidas[salidas.length - 1];
  const diasParado = Math.floor((hoy - new Date(ultima.fecha.slice(0, 10))) / 864e5);

  const conZona = recientes.map((s) => ({ s, ...intensidadSalida(s, cfg, zonas, umbral) }));
  const duras = conZona.filter((x) => x.zona >= 4);
  const suaves = conZona.filter((x) => x.zona <= 2);
  // La zona 3 solo se afirma cuando hay pulsometro: estimarla desde el
  // desnivel da falsos positivos y no se puede acusar a nadie de rodar
  // en tierra de nadie basandose en una conjetura.
  const medias = conZona.filter((x) => x.zona === 3 && !x.estimada);
  const horasSemana = ultimaSemana.reduce((a, s) => a + s.tiempoMovimiento, 0) / 3600;
  const sinFC = recientes.filter((s) => !s.fcMedia).length;

  // Dias duros consecutivos contando hacia atras desde la ultima salida
  let seguidasDuras = 0;
  for (let i = conZona.length - 1; i >= 0; i--) {
    if (conZona[i].zona >= 4 && !conZona[i].estimada) seguidasDuras++;
    else break;
  }

  // Sin pulsometro en la mayoria de salidas recientes no hay nada solido
  // que decir sobre intensidad, asi que se pide el dato antes que nada.
  if (recientes.length >= 3 && sinFC / recientes.length > 0.6) {
    return {
      titulo: 'Ponte el pulsometro',
      texto: `${sinFC} de tus ultimas ${recientes.length} salidas no tienen frecuencia cardiaca, asi que su intensidad aqui es una estimacion a partir del desnivel y la velocidad. Cualquier consejo sobre en que zona entrenar seria adivinar. Graba con el Garmin y en un mes este panel te dira cosas que ahora solo puede intuir.`,
      tono: 'aviso',
      etiqueta: 'Faltan datos',
    };
  }

  if (diasParado >= 14) {
    return {
      titulo: 'Vuelve por lo suave',
      texto: `Llevas ${diasParado} dias sin subirte a la bici. Las dos primeras salidas deberian ser de fondo tranquilo, una hora u hora y media sin buscar ninguna rampa. La forma vuelve mas rapido de lo que crees, pero solo si no la fuerzas la primera semana.`,
      tono: 'aviso',
      etiqueta: 'Vuelta tras un paron',
    };
  }

  if (diasParado >= 5) {
    return {
      titulo: 'Retoma el ritmo con una salida de fondo',
      texto: `Han pasado ${diasParado} dias desde tu ultima salida. Sal a rodar en zona 2, sin mirar el reloj. Manana ya podras plantearte algo mas exigente.`,
      tono: 'neutro',
      etiqueta: 'Reanudar',
    };
  }

  if (seguidasDuras >= 2) {
    return {
      titulo: 'Te toca zona 2',
      texto: `Tus ultimas ${seguidasDuras} salidas han ido por encima del umbral. La adaptacion no ocurre durante el esfuerzo, ocurre despues. Hoy o manana, fondo tranquilo por debajo de ${zonas[2].desde} ppm, aunque tengas que poner un desarrollo ridiculo en las cuestas.`,
      tono: 'aviso',
      etiqueta: 'Demasiada intensidad seguida',
    };
  }

  if (medias.length >= 3 && duras.length === 0) {
    return {
      titulo: 'Estas viviendo en tierra de nadie',
      texto: `${medias.length} de tus ultimas ${conZona.length} salidas se han quedado en zona 3. Es el ritmo que mas cansa y menos aporta: ni construye base ni sube el umbral. Parte la semana en dos: la mayoria por debajo de ${zonas[2].desde} ppm y una sola sesion de verdad dura.`,
      tono: 'aviso',
      etiqueta: 'Intensidad intermedia',
    };
  }

  const suavesReales = suaves.filter((x) => !x.estimada);
  if (suavesReales.length >= 4 && duras.length === 0) {
    return {
      titulo: 'Tienes base. Toca meter una sesion dura',
      texto: `Llevas ${suavesReales.length} salidas seguidas de fondo sin ninguna intensidad. La base ya esta puesta; ahora hace falta el estimulo que sube el techo. Prueba cuatro series de cuatro minutos fuertes con cuatro de recuperacion, en una subida constante.`,
      tono: 'ok',
      etiqueta: 'Momento de subir el techo',
    };
  }

  if (horasSemana > 0 && horasSemana < 2 && recientes.length >= 3) {
    return {
      titulo: 'Falta volumen',
      texto: `Solo ${num(horasSemana, 1)} horas sobre la bici esta semana. Para los objetivos que persigues, el volumen manda mas que la intensidad: intenta que al menos una salida pase de las dos horas.`,
      tono: 'neutro',
      etiqueta: 'Poco volumen',
    };
  }

  const pctSuave = conZona.length ? (suaves.length / conZona.length) * 100 : 0;
  if (pctSuave >= 70 && duras.length >= 1) {
    return {
      titulo: 'El reparto esta donde debe',
      texto: `Un ${num(pctSuave, 0)} % de fondo y ${duras.length} ${duras.length === 1 ? 'sesion dura' : 'sesiones duras'} en los ultimos diez dias. Eso es exactamente el modelo polarizado. Sigue asi y sube el volumen poco a poco antes de tocar nada mas.`,
      tono: 'ok',
      etiqueta: 'Buen equilibrio',
    };
  }

  return {
    titulo: 'Toca salida de fondo',
    texto: `Llevas ${conZona.length} salidas en los ultimos diez dias con un reparto razonable. Si hoy no tienes una sesion dura planificada, rueda en zona 2 por debajo de ${zonas[2].desde} ppm: es lo que sostiene todo lo demas.`,
    tono: 'neutro',
    etiqueta: 'Rutina',
  };
}

/* Reparto acumulado de las salidas analizadas, para el apartado de zonas.
   Si se pasa soloIds (Set de ids), se acota a esas salidas -asi el
   resumen respeta el mismo filtro de fechas que el resto de la pestaña
   en vez de arrastrar todo el historial. */
export function repartoGlobal(cache, zonas, excluidas, soloIds = null) {
  const seg = [0, 0, 0, 0, 0];
  let analizadas = 0;
  Object.entries(cache).forEach(([id, st]) => {
    const nid = Number(id);
    if (excluidas && excluidas.has(nid)) return;
    if (soloIds && !soloIds.has(nid)) return;
    const r = repartoZonas(st, zonas);
    if (!r) return;
    analizadas++;
    r.segundos.forEach((v, i) => (seg[i] += v));
  });
  const total = seg.reduce((a, b) => a + b, 0);
  return {
    segundos: seg,
    porcentaje: seg.map((s) => (total ? (s / total) * 100 : 0)),
    total,
    analizadas,
  };
}

/* ============================================================
   Dureza del terreno y valoracion de la salida.
   ============================================================ */

/*
  Tramos de pendiente. El negro no es decorativo: por encima del 20 %
  la mayoria de ciclistas no puede mantener cadencia sentado, asi que
  merece su propia categoria.
*/
export const TRAMOS_DUREZA = [
  { n: 1, hasta: 4, nombre: 'Hasta 4 %', color: '#5BA85B', etiqueta: 'Llano o falso llano' },
  { n: 2, hasta: 7, nombre: '4 – 7 %', color: '#4A90D9', etiqueta: 'Subida sostenida' },
  { n: 3, hasta: 10, nombre: '7 – 10 %', color: '#E0C020', etiqueta: 'Exigente' },
  { n: 4, hasta: 15, nombre: '10 – 15 %', color: '#E07B2E', etiqueta: 'Dura' },
  { n: 5, hasta: 20, nombre: '15 – 20 %', color: '#D14B42', etiqueta: 'Muy dura' },
  { n: 6, hasta: Infinity, nombre: 'Más del 20 %', color: '#1A1A1A', etiqueta: 'Pared' },
];

export function tramoDureza(pendiente) {
  const p = Math.max(0, pendiente);
  return TRAMOS_DUREZA.find((t) => p < t.hasta) || TRAMOS_DUREZA[5];
}

/*
  Tramos de velocidad, para pintar el perfil por ritmo igual que ya se
  pinta por pendiente. Los cortes estan pensados para este ciclista y no
  para un profesional: su objetivo de crucero en llano son 30 km/h
  (Objetivos), asi que ese numero cae a proposito justo en la frontera
  entre "buen ritmo" y "rapido", no enterrado en medio de un tramo.
*/
export const TRAMOS_VELOCIDAD = [
  { n: 1, hasta: 12, nombre: 'Hasta 12 km/h', color: '#4A5563', etiqueta: 'Puerto duro o parado' },
  { n: 2, hasta: 18, nombre: '12 – 18 km/h', color: '#4A90D9', etiqueta: 'Subida o ritmo suave' },
  { n: 3, hasta: 24, nombre: '18 – 24 km/h', color: '#5BA85B', etiqueta: 'Ritmo medio' },
  { n: 4, hasta: 30, nombre: '24 – 30 km/h', color: '#E0C020', etiqueta: 'Buen ritmo' },
  { n: 5, hasta: 40, nombre: '30 – 40 km/h', color: '#E07B2E', etiqueta: 'Rápido' },
  { n: 6, hasta: Infinity, nombre: 'Más de 40 km/h', color: '#D14B42', etiqueta: 'Punta o bajada' },
];

export function tramoVelocidad(kmh) {
  const v = Math.max(0, kmh);
  return TRAMOS_VELOCIDAD.find((t) => v < t.hasta) || TRAMOS_VELOCIDAD[5];
}

/* ---------- categoria ciclista de un puerto ---------- */

/*
  Categorias al modo de las grandes vueltas, de 4a a fuera de categoria.

  El coeficiente es longitud en kilometros por el cuadrado de la
  pendiente media. Que la pendiente vaya al cuadrado no es un capricho:
  doblar la inclinacion cuesta mucho mas que doblar la distancia, y una
  formula lineal pondria un repecho largo y tendido por encima de una
  pared corta.

  La escala esta ajustada al terreno donde se entrena de verdad. Con los
  cortes al uso de las grandes vueltas todo lo de Collserola y Montjuic
  caia en 4a, y una etiqueta que siempre dice lo mismo no informa de
  nada. Con estos umbrales una salida por Montjuic ya reparte sus
  subidas entre 4a y 3a.

  Los puertos grandes siguen encajando: Alpe d'Huez, Tourmalet, Angliru
  y Mortirolo salen todos HC, que es lo que son.
*/
export const CATEGORIAS_PUERTO = [
  { codigo: '4a', nombre: '4ª', hasta: 75, color: '#5BA85B' },
  { codigo: '3a', nombre: '3ª', hasta: 200, color: '#4A90D9' },
  { codigo: '2a', nombre: '2ª', hasta: 500, color: '#E0C020' },
  { codigo: '1a', nombre: '1ª', hasta: 750, color: '#E07B2E' },
  { codigo: 'hc', nombre: 'HC', hasta: Infinity, color: '#D14B42' },
];

export function coeficientePuerto(metros, pendiente) {
  if (!(metros > 0) || !(pendiente > 0)) return 0;
  return (metros / 1000) * pendiente * pendiente;
}

/* Devuelve la categoria de un puerto, con su coeficiente ya calculado. */
export function categoriaPuerto(metros, pendiente) {
  const coef = coeficientePuerto(metros, pendiente);
  const cat = CATEGORIAS_PUERTO.find((c) => coef <= c.hasta) || CATEGORIAS_PUERTO[4];
  return { ...cat, coef };
}

/*
  Reparto de distancia por tramo de dureza.

  Se calcula sobre ventanas de unos 100 m y no punto a punto: el ruido
  del altimetro entre dos muestras contiguas genera pendientes absurdas
  del 30 % en pleno llano, y pintariamos de negro una salida plana.
*/
export function repartoDureza(streams, ventana = 20) {
  const { distancia: d, altitud: a } = streams;
  if (!d || !a || d.length < 3) return null;

  const metros = new Array(6).fill(0);
  let i = 0;
  const tramos = [];

  while (i < d.length - 1) {
    let j = i;
    while (j < d.length - 1 && d[j] - d[i] < ventana) j++;
    const dist = d[j] - d[i];
    if (dist <= 0) { i = j + 1; continue; }

    const pend = ((a[j] - a[i]) / dist) * 100;
    const t = tramoDureza(pend);
    metros[t.n - 1] += dist;
    tramos.push({ desde: i, hasta: j, pendiente: pend, tramo: t.n });
    i = j;
  }

  const total = metros.reduce((x, y) => x + y, 0);
  return {
    metros,
    porcentaje: metros.map((m) => (total ? (m / total) * 100 : 0)),
    total,
    tramos,
  };
}

/*
  Igual que repartoDureza pero por velocidad en vez de pendiente: mismo
  tamano de ventana, mismo reparto en metros y no en segundos, para que
  las dos vistas midan con la misma vara. Se calcula sobre
  distancia/tiempo y no sobre el stream de velocidad de Strava aunque
  este disponible: es una vista de conjunto, no el calculo de un record,
  y conviene que un puerto y un llano midan con el mismo criterio en vez
  de que uno dependa de si el stream vino o no.
*/
export function repartoVelocidad(streams, ventana = 20) {
  const { distancia: d, tiempo: t } = streams;
  if (!d || !t || d.length < 3) return null;

  const metros = new Array(6).fill(0);
  let i = 0;
  const tramos = [];

  while (i < d.length - 1) {
    let j = i;
    while (j < d.length - 1 && d[j] - d[i] < ventana) j++;
    const dist = d[j] - d[i];
    const seg = t[j] - t[i];
    if (dist <= 0 || !(seg > 0)) { i = j + 1; continue; }

    const kmh = (dist / seg) * 3.6;
    const tr = tramoVelocidad(kmh);
    metros[tr.n - 1] += dist;
    tramos.push({ desde: i, hasta: j, kmh, tramo: tr.n });
    i = j;
  }

  const total = metros.reduce((x, y) => x + y, 0);
  return {
    metros,
    porcentaje: metros.map((m) => (total ? (m / total) * 100 : 0)),
    total,
    tramos,
  };
}

/*
  Valoracion de una salida concreta.

  Devuelve un veredicto y una lista de observaciones. La regla que me
  impongo aqui: no felicitar por defecto. Si la salida se ha quedado en
  tierra de nadie hay que decirlo, aunque el usuario haya sudado.
*/
export function valorarEntrenamiento({ salida, streams, reparto, dureza, puertos, cfg, zonas, umbral }) {
  const notas = [];
  const kms = salida.distancia / 1000;
  const horas = salida.tiempoMovimiento / 3600;
  const mkm = salida.desnivel / kms;
  const vel = kms / horas;

  let titulo, tono, resumen;

  if (reparto) {
    const p = reparto.porcentaje;
    const suave = p[0] + p[1];
    const media = p[2];
    const dura = p[3] + p[4];

    if (media >= 40) {
      titulo = 'Se te ha quedado en tierra de nadie';
      tono = 'aviso';
      resumen = `Un ${num(media, 0)} % del tiempo en zona 3. Es el ritmo que mas cansa y menos construye: demasiado alto para acumular base, demasiado bajo para mover el umbral. Si la intencion era rodar, tenias que haber bajado de ${zonas[2].desde} ppm; si era una sesion dura, faltaba subir por encima de ${zonas[3].desde}.`;
    } else if (dura >= 35) {
      titulo = 'Sesion dura de verdad';
      tono = dura >= 55 ? 'aviso' : 'ok';
      resumen = `${num(dura, 0)} % del tiempo por encima del umbral. Es un estimulo potente${dura >= 55 ? ', casi de competicion. Cuenta con necesitar dos dias faciles despues: el beneficio se cobra en la recuperacion, no en la salida.' : '. Bien dosificado.'}`;
    } else if (suave >= 85) {
      titulo = 'Fondo puro';
      tono = 'ok';
      resumen = `${num(suave, 0)} % en zona 1 y 2. Exactamente lo que debe ser una salida de base: aburrida de ritmo y valiosa de efecto. Este es el tipo de sesion que deberia ocupar la mayor parte de tus semanas.`;
    } else if (dura >= 12 && suave >= 60) {
      titulo = 'Salida bien repartida';
      tono = 'ok';
      resumen = `${num(suave, 0)} % de fondo con un ${num(dura, 0)} % de intensidad concentrada. Es el patron polarizado aplicado a una sola salida y funciona.`;
    } else {
      titulo = 'Salida correcta, sin mas';
      tono = 'neutro';
      resumen = `${num(suave, 0)} % suave, ${num(media, 0)} % en zona 3 y ${num(dura, 0)} % duro. No hay nada mal, pero tampoco un estimulo claro en ninguna direccion.`;
    }

    if (p[4] > 12) notas.push(`Un ${num(p[4], 0)} % en zona 5 es mucho para una salida que no era de series. Suele significar que las rampas te cogieron con un desarrollo corto.`);
    if (suave >= 85 && kms < 30) notas.push('Fondo suave pero corto. El fondo solo cumple su funcion cuando pasa de la hora y media larga; por debajo, el estimulo se queda a medias.');
  } else {
    titulo = 'Sin pulsometro no hay veredicto';
    tono = 'neutro';
    resumen = 'Esta salida no tiene frecuencia cardiaca, asi que cualquier cosa que dijese sobre su intensidad seria una conjetura a partir del desnivel y la velocidad. Lo que si puedo valorar es el terreno.';
  }

  /* Terreno */
  if (dureza) {
    const dp = dureza.porcentaje;
    const duro = dp[2] + dp[3] + dp[4] + dp[5];
    if (dp[5] > 1) notas.push(`Hay ${num(dureza.metros[5], 0)} m de recorrido por encima del 20 %. Esas rampas se pagan caras si no llevas un desarrollo suficientemente corto.`);
    if (duro > 25) notas.push(`Un ${num(duro, 0)} % del recorrido va por encima del 7 %. Es un perfil rompepiernas, no un puerto sostenido: la dificultad esta en los cambios de ritmo.`);
    if (dp[0] > 88) notas.push('Perfil practicamente llano. Es el terreno donde se trabaja la posicion aerodinamica y el ritmo constante, no la fuerza.');
  }

  /* Puertos */
  if (puertos && puertos.length) {
    const mejor = [...puertos].sort((a, b) => b.desnivel - a.desnivel)[0];
    if (mejor.vam) {
      const ref = umbral ? (mejor.vatios || 0) / umbral : 0;
      notas.push(
        `Tu mejor ascenso del dia: ${num(mejor.metros / 1000, 2)} km al ${num(mejor.pendiente, 1)} % a ${num(mejor.vam, 0)} m/h` +
        (ref ? `, lo que supone un ${num(ref * 100, 0)} % de tu umbral estimado.` : '.')
      );
    }
  }

  /* Volumen */
  if (horas >= 2.5) notas.push(`${num(horas, 1)} horas en movimiento. Salidas asi son las que construyen la base que necesitas para los puertos largos.`);
  if (mkm > 15) notas.push(`${num(mkm, 1)} metros de desnivel por kilometro: es una salida de montaña en toda regla.`);

  const paradas = salida.tiempoTotal - salida.tiempoMovimiento;
  if (paradas > 900) notas.push(`${duracion(paradas)} de paradas frente a ${duracion(salida.tiempoMovimiento)} rodando. Si no era una ruta social, cortar tanto rompe la continuidad del estimulo aerobico.`);

  return { titulo, tono, resumen, notas, vel, mkm };
}

/* ============================================================
   Normalizacion de altitud.
   ============================================================ */

/*
  Los altimetros barometricos derivan. Cerca del mar, con la presion
  cambiando durante la salida, es habitual que el registro baje de cero:
  el delta del Llobregat aparece a -100 m cuando esta a cinco.

  La correccion es un desplazamiento constante de toda la serie hasta
  dejar el punto mas bajo en cero. Conviene tener claro que esto NO
  cambia ningun calculo: pendientes, desnivel, VAM y potencia salen de
  diferencias entre puntos, y una diferencia no varia si desplazas los
  dos extremos lo mismo. Lo unico que se arregla es el eje del grafico,
  que es justo donde molestaba.
*/
export function normalizarAltitud(streams) {
  if (!streams || !streams.altitud || !streams.altitud.length) return streams;
  const min = Math.min(...streams.altitud);
  if (min >= 0) return streams;
  return { ...streams, altitud: streams.altitud.map((a) => a - min), corregida: -min };
}

/* ============================================================
   Detalle de un puerto concreto.
   ============================================================ */

/*
  Trocea un puerto en secciones para dibujarlo al estilo de los perfiles
  de carrera: barras de longitud fija con su pendiente escrita encima.

  El paso es fijo de 50 m desde la v3.2. Antes se adaptaba a la longitud
  del puerto para que nunca salieran mas de una veintena de barras, pero
  eso promediaba las rampas hasta hacerlas desaparecer: un tramo corto al
  14 % dentro de una seccion de 250 m se diluia en la media y no se veia.

  El precio de bajar a 50 m es el ruido. El altimetro se equivoca en unas
  decimas de metro por muestra, y sobre 50 m ese error se traduce en
  pendientes que oscilan varios puntos: un puerto constante al 7 % llega a
  pintarse con cuatro colores distintos, y la rampa "maxima" acaba siendo
  un pico inventado por el sensor. Por eso la pendiente se calcula sobre
  la altitud suavizada en una ventana de unos 60 m, suficiente para matar
  el temblor del sensor sin achatar las rampas de verdad, que duran mucho
  mas que eso.
*/
export function seccionesPuerto(streams, puerto, opciones = {}) {
  const { distancia: d, altitud: a0, tiempo: t, fc } = streams || {};
  if (!d || !a0 || !puerto) return null;
  const { inicio: s, fin: e } = puerto;

  const { paso = 50 } = opciones;
  const a = suavizar(a0, ventanaPara(d, 100));

  const secciones = [];
  let i = s;
  while (i < e) {
    let j = i;
    while (j < e && d[j] - d[i] < paso) j++;
    const dist = d[j] - d[i];
    if (dist < paso * 0.35 && secciones.length) {
      /* Un ultimo trozo demasiado corto se funde con el anterior en vez de
         quedar como una barra raquitica que exagera su pendiente. */
      const u = secciones[secciones.length - 1];
      u.fin = j; u.kmFin = d[j] / 1000; u.altFin = a[j];
      u.metros = (u.kmFin - u.kmIni) * 1000;
      u.pendiente = ((u.altFin - u.altIni) / u.metros) * 100;
      u.tramo = tramoDureza(u.pendiente).n;
      break;
    }
    if (dist <= 0) break;

    const pend = ((a[j] - a[i]) / dist) * 100;
    const seg = t ? t[j] - t[i] : null;
    let fcm = null;
    if (fc) {
      let sum = 0, n = 0;
      for (let k = i; k <= j; k++) if (fc[k]) { sum += fc[k]; n++; }
      fcm = n ? Math.round(sum / n) : null;
    }

    secciones.push({
      ini: i, fin: j,
      kmIni: d[i] / 1000, kmFin: d[j] / 1000,
      altIni: a[i], altFin: a[j],
      metros: dist,
      pendiente: pend,
      tramo: tramoDureza(pend).n,
      segundos: seg,
      vam: seg ? ((a[j] - a[i]) / (seg / 3600)) : null,
      fcMedia: fcm,
    });
    i = j;
  }
  return { paso, secciones };
}

/*
  El punto real mas empinado de la subida, no la media del tramo de 250 m
  que lo contiene. Repite la misma ventana movil de ~200 m que usa
  detectarPuertos para calcular pendienteMax -incluso el guardia
  "d[m]-d[k] > 100"-, asi que el numero que devuelve coincide con el que
  ya se ensena en la tabla de puertos. Lo que anade aqui es DONDE cae ese
  maximo (el tramo de la ventana ganadora), que la tabla no necesita pero
  el perfil si, para clavar el marcador en su sitio real y no en el
  centro de una barra de 250 m que solo da la media.
*/
export function puntoPendienteMaxima(streams, puerto, ventana = 200) {
  const { distancia: d, altitud: a0 } = streams || {};
  if (!d || !a0 || !puerto) return null;
  const { inicio: s, fin: e } = puerto;
  const a = suavizar(a0, ventanaPara(d, 100));

  let mejor = null;
  for (let k = s; k < e; k++) {
    let m = k;
    while (m < e && d[m] - d[k] < ventana) m++;
    if (d[m] - d[k] <= 100) continue;
    const pendiente = ((a[m] - a[k]) / (d[m] - d[k])) * 100;
    if (!mejor || pendiente > mejor.pendiente) {
      mejor = { pendiente, kmIni: d[k] / 1000, kmFin: d[m] / 1000 };
    }
  }
  return mejor;
}

/*
  Lectura en palabras de como esta repartida la dificultad del puerto.
  Interesa mas donde se concentra el esfuerzo que la media, porque dos
  puertos con el mismo 6 % se suben de forma muy distinta segun si ese
  6 % es constante o es la media entre un llano y una pared.
*/
export function lecturaPuerto(det, puerto) {
  if (!det || !det.secciones.length) return [];
  const sec = det.secciones;
  const notas = [];

  const dura = sec.reduce((m, x) => (x.pendiente > m.pendiente ? x : m), sec[0]);
  const suave = sec.reduce((m, x) => (x.pendiente < m.pendiente ? x : m), sec[0]);

  notas.push({
    k: 'Sección más dura',
    v: `${num(dura.pendiente, 1)} %`,
    d: `entre el km ${num(dura.kmIni, 1)} y el ${num(dura.kmFin, 1)} de la salida`,
  });

  if (suave.pendiente < 2 && sec.length > 3) {
    notas.push({
      k: 'Respiro',
      v: `${num(suave.pendiente, 1)} %`,
      d: `hacia el km ${num(suave.kmIni, 1)}: el sitio para recuperar antes de volver a apretar`,
    });
  }

  /* Regularidad: desviacion de las secciones respecto a la media. */
  const media = puerto.pendiente;
  const desv = Math.sqrt(sec.reduce((s, x) => s + (x.pendiente - media) ** 2, 0) / sec.length);
  notas.push({
    k: 'Regularidad',
    v: desv < 1.5 ? 'Constante' : desv < 3 ? 'Con cambios' : 'Muy irregular',
    d: desv < 1.5
      ? 'la pendiente apenas varía: se puede subir a ritmo fijo desde abajo'
      : desv < 3
        ? 'hay cambios de ritmo, conviene no ir al límite en las rampas'
        : 'alterna rampas y respiros, subirlo a ritmo constante es un error',
  });

  /* Donde esta el grueso del desnivel: primera o segunda mitad. */
  const mitad = Math.floor(sec.length / 2);
  const d1 = sec.slice(0, mitad).reduce((s, x) => s + (x.altFin - x.altIni), 0);
  const d2 = sec.slice(mitad).reduce((s, x) => s + (x.altFin - x.altIni), 0);
  const total = d1 + d2;
  if (total > 0) {
    const p1 = (d1 / total) * 100;
    notas.push({
      k: 'Reparto',
      v: p1 > 58 ? 'Duro abajo' : p1 < 42 ? 'Duro arriba' : 'Equilibrado',
      d: p1 > 58
        ? `${num(p1, 0)} % del desnivel está en la primera mitad: arranca conservador o llegarás fundido`
        : p1 < 42
          ? `${num(100 - p1, 0)} % del desnivel está en la segunda mitad: guarda fuerzas, lo peor viene al final`
          : 'el desnivel se reparte de forma pareja entre las dos mitades',
    });
  }

  return notas;
}

/* ============================================================
   Dificultad de una ruta.
   ============================================================ */

/*
  Distancia equivalente, conocida entre cicloturistas como "la regla del
  10": cada 100 m de desnivel positivo cuestan aproximadamente lo mismo
  que un kilometro extra de llano.

  Resuelve el defecto del criterio anterior, que ordenaba por desnivel
  bruto y dejaba una llana de 60 km por debajo de una de 40 km con
  subidas, cuando en tiempo y fatiga no es asi.
*/
export function distanciaEquivalente(km, desnivel, pendienteMax = null) {
  if (!km) return 0;
  const mkm = desnivel / km;

  /*
    La regla base trata igual 800 m repartidos en 60 km que concentrados
    en 15, y no es lo mismo: cuanto mas junto esta el desnivel, menos
    zonas de recuperacion hay y mas cara sale cada subida. Se recarga el
    desnivel segun su concentracion.
  */
  const factor = mkm < 10 ? 1 : mkm < 20 ? 1.15 : 1.3;

  /*
    Y una rampa del 20 % no se paga en resistencia sino en fuerza, algo
    que ninguna media recoge. Si conocemos la pendiente maxima, se anade
    un recargo aparte.
  */
  const rampa = pendienteMax && pendienteMax > 12
    ? Math.min((pendienteMax - 12) * 0.8, 12)
    : 0;

  return km + (desnivel / 100) * factor + rampa;
}

export function nivelDificultad(km, desnivel, pendienteMax = null) {
  const eq = distanciaEquivalente(km, desnivel, pendienteMax);
  if (eq < 30) return { n: 1, nombre: 'Suave', color: '#5BA85B' };
  if (eq < 50) return { n: 2, nombre: 'Moderada', color: '#4A90D9' };
  if (eq < 75) return { n: 3, nombre: 'Exigente', color: '#E0C020' };
  if (eq < 110) return { n: 4, nombre: 'Dura', color: '#E07B2E' };
  return { n: 5, nombre: 'Muy dura', color: '#D14B42' };
}

/*
  Dificultad de un puerto AISLADO. No es la misma escala que una ruta.

  Reutilizar nivelDificultad() aqui fue un error: sus umbrales estan
  pensados para rutas de decenas de kilometros, y ningun puerto suelto
  de 2-6 km llega ni de lejos a esas cifras. Con esa formula, hasta el
  ascenso a Sant Pere Martir salia "Suave", que es justo el problema que
  detecto Alex.

  Aqui se usa el indice clasico de los ciclistas de montana: kilometros
  por pendiente media. Crece con la longitud y con lo empinado a la vez,
  que es como se siente de verdad un puerto en las piernas. Se anade un
  recargo aparte cuando hay rampas sueltas por encima del 15 %, porque
  esas no las recoge bien ninguna media.
*/
export function indicePuerto(metros, desnivel, pendienteMax = null) {
  if (!metros) return 0;
  const km = metros / 1000;
  const pendMedia = (desnivel / metros) * 100;
  let idx = km * pendMedia;
  if (pendienteMax && pendienteMax > 15) {
    idx += Math.min((pendienteMax - 15) * 1.5, 15);
  }
  return idx;
}

export function nivelDificultadPuerto(metros, desnivel, pendienteMax = null) {
  const idx = indicePuerto(metros, desnivel, pendienteMax);
  if (idx < 6) return { n: 1, nombre: 'Suave', color: '#5BA85B' };
  if (idx < 15) return { n: 2, nombre: 'Moderada', color: '#4A90D9' };
  if (idx < 28) return { n: 3, nombre: 'Exigente', color: '#E0C020' };
  if (idx < 45) return { n: 4, nombre: 'Dura', color: '#E07B2E' };
  return { n: 5, nombre: 'Muy dura', color: '#D14B42' };
}

/* ============================================================
   Ascensiones: agrupacion de subidas repetidas.
   ============================================================ */

const RADIO_TIERRA = 6371000;

export function distanciaGeo(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * RADIO_TIERRA * Math.asin(Math.sqrt(h));
}

/*
  Recoge todas las subidas de todas las salidas y agrupa las que son la
  misma. Dos ascensos se consideran el mismo cuando su cima cae a menos
  de 250 m y su longitud no difiere mas de un 35 %.

  Se compara por la cima y no por el pie porque el mismo puerto se puede
  encarar desde varios sitios y el remate siempre coincide; la longitud
  entra como salvaguarda para no fundir dos vertientes distintas que
  acaban en el mismo collado.
*/
export function agruparAscensiones(salidas, cache, excluidas, opciones = {}) {
  const { radio = 250, tolLongitud = 0.35 } = opciones;
  const grupos = [];

  const ordenadas = [...(salidas || [])].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));

  for (const s of ordenadas) {
    if (excluidas?.has(s.id)) continue;
    const st = cache?.[s.id];
    if (!st) continue;

    const puertos = detectarPuertos(st, { minMetros: 600, minDesnivel: 40, minPend: 3 });
    for (const p of puertos) {
      const cima = st.latlng ? st.latlng[p.fin] : null;
      const intento = {
        salidaId: s.id,
        salidaNombre: s.nombre,
        fecha: s.fecha,
        cima,
        ...p,
      };

      let destino = null;
      if (cima) {
        destino = grupos.find((g) =>
          g.cima &&
          distanciaGeo(g.cima, cima) < radio &&
          Math.abs(g.metros - p.metros) / Math.max(g.metros, p.metros) < tolLongitud
        );
      }
      if (!destino) {
        /* Sin coordenadas se cae a una comparacion por forma: misma
           longitud y misma pendiente aproximada. Es menos fiable, y por
           eso se marca, pero evita duplicar todo cuando faltan latlng. */
        destino = grupos.find((g) =>
          !g.cima && !cima &&
          Math.abs(g.metros - p.metros) / Math.max(g.metros, p.metros) < 0.15 &&
          Math.abs(g.pendiente - p.pendiente) < 1
        );
      }

      if (destino) {
        destino.intentos.push(intento);
        /* La referencia del grupo es el ascenso mas largo registrado. */
        if (p.metros > destino.metros) {
          destino.metros = p.metros;
          destino.desnivel = p.desnivel;
          destino.pendiente = p.pendiente;
          destino.pendienteMax = p.pendienteMax;
          destino.streamsId = s.id;
          destino.puertoRef = p;
        }
      } else {
        grupos.push({
          id: `asc-${s.id}-${p.inicio}`,
          cima,
          metros: p.metros,
          desnivel: p.desnivel,
          pendiente: p.pendiente,
          pendienteMax: p.pendienteMax,
          streamsId: s.id,
          puertoRef: p,
          sinCoordenadas: !cima,
          intentos: [intento],
        });
      }
    }
  }

  /* Cada grupo se ordena por tiempo y se marca la mejor marca. */
  for (const g of grupos) {
    g.intentos.sort((a, b) => (a.segundos || 1e9) - (b.segundos || 1e9));
    g.mejor = g.intentos[0];
    g.veces = g.intentos.length;
  }

  return grupos.sort((a, b) =>
    distanciaEquivalente(b.metros / 1000, b.desnivel, b.pendienteMax) -
    distanciaEquivalente(a.metros / 1000, a.desnivel, a.pendienteMax));
}

/* ============================================================
   Evolucion por zona de FC y terreno.
   ============================================================ */

/*
  Terreno local de un tramo, no de la salida entera.

  Los cortes no son nuevos: son los de TRAMOS_DUREZA agrupados de seis
  bandas a tres. Asi lo que aqui se llama "montaña" es exactamente lo que
  en Entrenamientos sale pintado de amarillo para arriba, y no hay dos
  criterios distintos conviviendo en el mismo panel.

  Y cada terreno se mide ademas con la magnitud que en el si dice algo.

  En cuanto hay pendiente, la velocidad deja de servir para comparar. Con
  la formula de vatios() de este mismo archivo, a 185 W constantes y 83 kg
  de conjunto:

      pendiente    velocidad    VAM
         4 %       15,1 km/h    605 m/h
         7 %       10,0 km/h    697 m/h
        12 %        6,2 km/h    737 m/h
        15 %        5,1 km/h    753 m/h

  Del 7 al 15 % la velocidad se parte por la mitad mientras la VAM apenas
  se mueve un 8 %. Es decir: en km/h, dos ascensos identicos de esfuerzo
  salen distintos solo porque uno era mas empinado, y la grafica mediria
  que puerto tocaba ese dia en vez de como estas. Los metros verticales
  por hora son casi independientes de la pendiente por encima del 6-7 %, y
  por eso los escaladores miden en VAM.

  En llano, en cambio, la VAM no significa nada (el desnivel ronda cero) y
  la velocidad es exactamente la magnitud correcta. De ahi que cada
  terreno declare la suya.
*/
export const TERRENOS = [
  { id: 'llano', nombre: 'Llano', bandas: [1], color: '#4A90D9',
    metrica: 'velocidad', unidad: 'km/h' },
  { id: 'mixto', nombre: 'Mixto', bandas: [2], color: '#E0C020',
    metrica: 'vam', unidad: 'm/h' },
  { id: 'montana', nombre: 'Montaña', bandas: [3, 4, 5, 6], color: '#D14B42',
    metrica: 'vam', unidad: 'm/h' },
];

const TERRENO_DE_BANDA = TERRENOS.reduce((m, t) => {
  t.bandas.forEach((b) => (m[b] = t.id));
  return m;
}, {});

/* Ventana de troceo. Es la misma con la que se suaviza la altitud en el
   detalle de puertos: por debajo, la pendiente que sale es ruido del
   altimetro y clasificaria como "montaña" tramos de delta perfectamente
   llanos. */
export const VENTANA_TRAMO = 100;

/* Un tramo por debajo de este umbral de metros acumulados no basta para
   sostener un punto en la grafica. Sin el, una combinacion entera podria
   descansar sobre tres tramos sueltos de un semaforo. */
const MIN_METROS_PUNTO = 300;

/*
  Por debajo de esta velocidad el tramo se da por parado y no cuenta.

  El criterio es la velocidad y no el tiempo a proposito. Un tope de
  tiempo por tramo parece razonable hasta que se hacen los numeros: a 10
  km/h se tarda 36 s en cubrir 100 m, y a 8 km/h son 45 s. Cualquier tope
  por debajo de eso descartaria justo las subidas lentas, que son las que
  mas interesa medir. Tres km/h es mas lento que empujar la bici andando:
  ahi ya es un semaforo, una foto o el coche de vuelta a casa.
*/
const MIN_KMH_TRAMO = 3;

/*
  Pendiente por debajo de la cual el tramo se descarta por ser un descenso.

  Hace falta porque tramoDureza() aplica Math.max(0, pendiente) antes de
  clasificar, de modo que TODO lo que baja cae en la banda 1 y acaba
  contado como llano. Ahi, bajando al 8 %, se rueda a 45 km/h sin pedalear
  y con el pulso en zona 1: exactamente el punto que mas engorda la media
  de "Z1 en llano" y el que menos tiene que ver con llanear.

  El corte no es cero sino -1 %, y esa decision es la que importa. A 100 m
  de ventana el altimetro tiembla unas decimas y un llano de verdad
  produce pendientes que oscilan alrededor del cero, la mitad de ellas
  negativas. Cortando en cero se tiraria justo esa mitad y quedaria una
  muestra sesgada hacia el repecho: la velocidad del llano saldria
  artificialmente baja, que es el error contrario al que se venia a
  arreglar. Con -1 % el temblor sobrevive entero y el descenso real, que
  es lo que contamina, se va.
*/
const MIN_PENDIENTE_LLANO = -1;

/*
  Evolucion de velocidad por zona de FC y terreno, tramo a tramo.

  El modelo anterior miraba cada salida como un bloque: cogia su FC media
  y su desnivel por kilometro y la etiquetaba entera de "llano" o de
  "montaña". Pero ninguna salida real es de un solo terreno. Una vuelta al
  delta con subida a Montjuic salia clasificada como "mixta" y su
  velocidad media no describia nada: promediaba veinte kilometros a 30
  km/h con tres de subida a 11. Comparar esa media contra la de otro dia
  no medía progreso, medía que ruta habia tocado.

  Aqui cada salida se trocea en tramos de VENTANA_TRAMO metros y cada
  tramo se clasifica por su propia pendiente y por la zona de pulso en la
  que se iba en ese momento. Lo que se compara entonces es homogeneo: lo
  que rindes en Z2 en llano contra lo que rendias en Z2 en llano hace dos
  meses.
*/
export function evolucionPorZonaTerreno(salidas, cache, zonas, excluidas) {
  const val = (salidas || [])
    .filter((s) => !excluidas?.has(s.id))
    .sort((a, b) => (a.fecha < b.fecha ? -1 : 1));

  /* terreno -> zona -> array de puntos, uno por salida */
  const acumulado = {};
  TERRENOS.forEach((t) => {
    acumulado[t.id] = {};
    zonas.forEach((z) => (acumulado[t.id][z.n] = []));
  });

  /*
    Posicion de cada salida dentro de su terreno, para que la grafica
    pueda repartir el eje por dias de entreno y no por calendario.

    Se numera por SALIDA y no por serie, y esa es la diferencia que
    importa. Numerando dentro de cada zona, el tercer punto de Z2 y el
    tercero de Z4 caerian en la misma vertical aunque fuesen de salidas
    distintas, y las series dejarian de ser comparables entre si. Con un
    numero por salida, todos los puntos del mismo dia comparten columna y
    las zonas siguen alineadas.

    El contador es por terreno: en Montana solo cuentan las salidas que
    dejaron algo en Montana, o volveriamos a tener huecos por las salidas
    que no pisaron ese terreno.
  */
  const ordenTerreno = {};
  TERRENOS.forEach((t) => (ordenTerreno[t.id] = new Map()));

  for (const s of val) {
    const st = cache?.[s.id];
    if (!st) continue;

    const { distancia: d, altitud: a, tiempo: t, fc } = st;
    if (!d || !a || !t || !fc) continue;

    const dureza = repartoDureza(st, VENTANA_TRAMO);
    if (!dureza) continue;

    /* Suma ponderada por tramo, agrupada por terreno x zona. */
    const grupos = {};

    for (const tr of dureza.tramos) {
      const metros = d[tr.hasta] - d[tr.desde];
      const seg = t[tr.hasta] - t[tr.desde];
      if (!(metros > 0) || !(seg > 0)) continue;
      if ((metros / seg) * 3.6 < MIN_KMH_TRAMO) continue;
      /* Los descensos no son llano por mucho que la banda los recoja. */
      if (tr.pendiente < MIN_PENDIENTE_LLANO) continue;

      /* FC media del tramo. Si el pulsometro no cubre el tramo entero,
         se promedia lo que haya; si no hay nada, el tramo no se puede
         asignar a ninguna zona y se descarta. */
      let sumaFC = 0, nFC = 0;
      for (let i = tr.desde; i <= tr.hasta; i++) {
        if (fc[i]) { sumaFC += fc[i]; nFC++; }
      }
      if (!nFC) continue;

      const fcMedia = sumaFC / nFC;
      const terreno = TERRENO_DE_BANDA[tr.tramo];
      const zona = zonaDeFC(fcMedia, zonas).n;
      const clave = `${terreno}|${zona}`;

      const g = grupos[clave] || (grupos[clave] = {
        terreno, zona, metros: 0, segundos: 0, subida: 0, sumaFC: 0, nFC: 0,
      });
      g.metros += metros;
      g.segundos += seg;
      /* Desnivel del tramo, para poder dar la VAM en los terrenos que se
         miden con ella. En mixto y montaña todos los tramos suben por
         definicion, asi que la suma es siempre positiva. */
      g.subida += a[tr.hasta] - a[tr.desde];
      g.sumaFC += sumaFC;
      g.nFC += nFC;
    }

    /*
      Un punto por salida y combinacion. La velocidad sale de metros entre
      segundos totales, no de promediar las velocidades de cada tramo: un
      tramo de 100 m no puede pesar lo mismo que uno de 400 m.
    */
    Object.values(grupos).forEach((g) => {
      if (g.metros < MIN_METROS_PUNTO) return;
      /* El numero se asigna aqui y no al empezar la salida: si ninguna
         de sus casillas llega al minimo de metros, esa salida no pinta
         nada y tampoco debe gastar una columna del eje. */
      const orden = ordenTerreno[g.terreno];
      if (!orden.has(s.id)) orden.set(s.id, orden.size);
      acumulado[g.terreno][g.zona].push({
        id: s.id,
        orden: orden.get(s.id),
        fecha: s.fecha,
        nombre: s.nombre,
        km: g.metros / 1000,
        segundos: g.segundos,
        velocidad: (g.metros / g.segundos) * 3.6,
        desnivel: g.subida,
        /* En llano la suma de desniveles ronda el cero y puede salir
           negativa: ahi la VAM no se usa y se deja en null antes que
           publicar un numero sin sentido. */
        vam: g.subida > 0 ? g.subida / (g.segundos / 3600) : null,
        fc: g.sumaFC / g.nFC,
      });
    });
  }

  return TERRENOS.map((t) => ({
    id: t.id,
    nombre: t.nombre,
    color: t.color,
    metrica: t.metrica,
    unidad: t.unidad,
    /* Cuantas columnas tiene el eje: salidas que dejaron algun punto aqui. */
    salidas: ordenTerreno[t.id].size,
    zonas: zonas.map((z) => ({
      n: z.n,
      nombre: z.nombre,
      color: z.color,
      puntos: acumulado[t.id][z.n],
    })),
    total: zonas.reduce((n, z) => n + acumulado[t.id][z.n].length, 0),
  }));
}
