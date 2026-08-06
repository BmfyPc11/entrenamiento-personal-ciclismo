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
  fcmax: {
    nombre: 'Cinco zonas (60/70/80/90 %)',
    descripcion: 'Zona 2 mas estrecha y mas exigente. Es el modelo que usaba este panel.',
    cortes: [0, 60, 70, 80, 90],
  },
  polarizado: {
    nombre: 'Polarizado (Seiler)',
    descripcion: 'Zona 2 muy ancha para el fondo y salto directo a la alta intensidad.',
    cortes: [0, 60, 78, 87, 93],
  },
  garmin: {
    nombre: 'Garmin por defecto',
    descripcion: 'Zona 2 ancha, tal y como reparte el reloj de serie.',
    cortes: [0, 60, 80, 90, 100],
  },
};

/* Devuelve las cinco zonas en pulsaciones, listas para usar. */
export function calcularZonas(cfg) {
  const fcmax = cfg.fcmax || 185;

  let limites;
  if (cfg.modeloZonas === 'personalizado' && Array.isArray(cfg.zonasPropias)) {
    limites = cfg.zonasPropias.map((v) => Math.round(v));
  } else {
    const m = MODELOS_ZONAS[cfg.modeloZonas] || MODELOS_ZONAS.fcmax;
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

  opciones:
    minMetros   - longitud minima del puerto
    minDesnivel - desnivel minimo acumulado
    minPend     - pendiente que separa "subida" de "llaneo", en %
    maxPuertos  - cuantos buscar como mucho
*/
export function detectarPuertos(streams, opciones = {}) {
  const { minMetros = 500, minDesnivel = 30, minPend = 3, maxPuertos = 12 } = opciones;
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

    // Los limites se buscan sobre el perfil suavizado, pero las cifras que
    // se muestran se calculan sobre la altitud original: el suavizado achata
    // los extremos y subestimaria el desnivel real.
    const metros = d[e] - d[s];
    let desnivel = 0;
    for (let i = s; i < e; i++) { const dz = a0[i + 1] - a0[i]; if (dz > 0) desnivel += dz; }
    const desnivelNeto = a0[e] - a0[s];
    if (metros < minMetros || desnivelNeto < minDesnivel) continue;

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

    puertos.push({
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
    });
  }

  return puertos.sort((x, y) => x.kmInicio - y.kmInicio);
}

/* ---------- reparto por zonas ---------- */

export function repartoZonas(streams, zonas) {
  const { fc, tiempo } = streams;
  if (!fc || !zonas) return null;
  const seg = [0, 0, 0, 0, 0];
  for (let i = 0; i < fc.length; i++) {
    if (!fc[i]) continue;
    const dt = tiempo && i > 0 ? tiempo[i] - tiempo[i - 1] : 1;
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
export const esLlana = (s) => metrosPorKm(s) < 5;

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

export function fechaCorta(f) {
  return new Date(f).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' });
}

export function fechaLarga(f) {
  return new Date(f).toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
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

/* Los ultimos N dias hasta hoy, con la salida de cada dia si la hubo. */
export function ultimosDias(salidas, cfg, zonas, umbral, n = 7) {
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
      resumen = {
        km,
        segundos: seg,
        desnivel,
        zona: inten.zona,
        estimada: inten.estimada,
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

/* Reparto acumulado de todas las salidas analizadas, para el apartado de zonas. */
export function repartoGlobal(cache, zonas, excluidas) {
  const seg = [0, 0, 0, 0, 0];
  let analizadas = 0;
  Object.entries(cache).forEach(([id, st]) => {
    if (excluidas && excluidas.has(Number(id))) return;
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

  El paso no es fijo porque un repecho de 700 m y un puerto de 6 km no
  admiten la misma resolucion: se busca un numero de secciones legible
  (entre 8 y 20) y se redondea a un paso "redondo" para que las etiquetas
  de kilometro no queden en 0,37.
*/
export function seccionesPuerto(streams, puerto) {
  const { distancia: d, altitud: a, tiempo: t, fc } = streams;
  if (!d || !a) return null;
  const { inicio: s, fin: e, metros } = puerto;

  const PASOS = [50, 100, 150, 200, 250, 300, 400, 500, 750, 1000];
  const ideal = metros / 14;
  const paso = PASOS.reduce((mej, p) =>
    Math.abs(p - ideal) < Math.abs(mej - ideal) ? p : mej, PASOS[0]);

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
