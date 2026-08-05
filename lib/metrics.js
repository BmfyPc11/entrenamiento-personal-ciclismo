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

export const ZONAS = [
  { n: 1, nombre: 'Recuperacion', min: 0, max: 60, color: '#8FA3AC' },
  { n: 2, nombre: 'Fondo', min: 60, max: 70, color: '#5E7D4F' },
  { n: 3, nombre: 'Tempo', min: 70, max: 80, color: '#D99A21' },
  { n: 4, nombre: 'Umbral', min: 80, max: 90, color: '#D9761F' },
  { n: 5, nombre: 'VO2 max', min: 90, max: 999, color: '#B4372B' },
];

export function zonaDeFC(fc, fcmax) {
  const p = (fc / fcmax) * 100;
  return ZONAS.find((z) => p >= z.min && p < z.max) || ZONAS[4];
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

export function repartoZonas(streams, fcmax) {
  const { fc, tiempo } = streams;
  if (!fc) return null;
  const seg = [0, 0, 0, 0, 0];
  for (let i = 0; i < fc.length; i++) {
    if (!fc[i]) continue;
    const dt = tiempo && i > 0 ? tiempo[i] - tiempo[i - 1] : 1;
    seg[zonaDeFC(fc[i], fcmax).n - 1] += Math.min(dt, 30); // ignora huecos largos
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
