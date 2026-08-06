import { detectarPuertos, repartoDureza, tramoDureza, num, km, metrosPorKm } from './metrics';

/* ============================================================
   Lectura de archivos GPX.
   ============================================================ */

const R = 6371000; // radio terrestre en metros

function haversine(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const la1 = a.lat * rad, la2 = b.lat * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/*
  Suavizado de la altitud por media movil.

  Los GPX de planificadores traen la altitud de un modelo digital del
  terreno, con escalones de metro entero, y los grabados con GPS traen
  ruido del propio sensor. Sin suavizar, el desnivel acumulado se dispara:
  cada oscilacion de un metro que sube y baja se cuenta como desnivel real
  y una ruta llana acaba declarando 400 m positivos que no existen.
*/
function suavizar(alt, ventana = 5) {
  if (alt.length < ventana) return alt.slice();
  const r = new Array(alt.length);
  const lado = Math.floor(ventana / 2);
  for (let i = 0; i < alt.length; i++) {
    let s = 0, n = 0;
    for (let j = Math.max(0, i - lado); j <= Math.min(alt.length - 1, i + lado); j++) {
      s += alt[j]; n++;
    }
    r[i] = s / n;
  }
  return r;
}

/*
  Devuelve un objeto con la misma forma que los streams de Strava, para
  que el perfil y el detector de puertos funcionen sin cambiar nada.
  No hay tiempo ni frecuencia cardiaca: una ruta planificada no se ha
  rodado todavia, asi que cualquier metrica de esfuerzo seria inventada.
*/
export function parseGPX(texto) {
  let doc;
  try {
    const P = typeof DOMParser !== 'undefined' ? DOMParser : global.DOMParser;
    doc = new P().parseFromString(texto, 'text/xml');
  } catch {
    throw new Error('No se ha podido leer el archivo.');
  }
  if (!doc || doc.getElementsByTagName('parsererror').length) {
    throw new Error('El archivo no es un GPX válido.');
  }

  let nodos = doc.getElementsByTagName('trkpt');
  if (!nodos.length) nodos = doc.getElementsByTagName('rtept');
  if (!nodos.length) throw new Error('El GPX no contiene ningún track ni ruta.');

  const puntos = [];
  let sinAltitud = 0;
  for (let i = 0; i < nodos.length; i++) {
    const n = nodos[i];
    const lat = parseFloat(n.getAttribute('lat'));
    const lon = parseFloat(n.getAttribute('lon'));
    if (!isFinite(lat) || !isFinite(lon)) continue;
    const e = n.getElementsByTagName('ele')[0];
    const ele = e ? parseFloat(e.textContent) : NaN;
    if (!isFinite(ele)) sinAltitud++;
    puntos.push({ lat, lon, ele: isFinite(ele) ? ele : null });
  }
  if (puntos.length < 2) throw new Error('El GPX tiene muy pocos puntos para analizarlo.');

  /* Huecos de altitud rellenados por interpolacion con los vecinos validos. */
  const conAlt = puntos.filter((p) => p.ele !== null).length;
  if (conAlt === 0) throw new Error('El GPX no incluye datos de altitud, no se puede analizar el perfil.');
  for (let i = 0; i < puntos.length; i++) {
    if (puntos[i].ele !== null) continue;
    let a = i - 1; while (a >= 0 && puntos[a].ele === null) a--;
    let b = i + 1; while (b < puntos.length && puntos[b].ele === null) b++;
    if (a < 0) puntos[i].ele = puntos[b].ele;
    else if (b >= puntos.length) puntos[i].ele = puntos[a].ele;
    else puntos[i].ele = puntos[a].ele + (puntos[b].ele - puntos[a].ele) * ((i - a) / (b - a));
  }

  const distancia = [0];
  for (let i = 1; i < puntos.length; i++) {
    distancia.push(distancia[i - 1] + haversine(puntos[i - 1], puntos[i]));
  }

  const bruta = puntos.map((p) => p.ele);
  const altitud = suavizar(bruta);

  /* Desnivel positivo con umbral: solo cuentan las subidas de mas de un
     metro, para no acumular el temblor residual del suavizado. */
  let desnivel = 0, acum = 0;
  for (let i = 1; i < altitud.length; i++) {
    const dz = altitud[i] - altitud[i - 1];
    if (dz > 0) { acum += dz; if (acum >= 1) { desnivel += acum; acum = 0; } }
    else acum = 0;
  }

  const nombreNodo = doc.getElementsByTagName('name')[0];
  const nombre = nombreNodo ? nombreNodo.textContent.trim() : 'Ruta sin nombre';

  const min = Math.min(...altitud);
  const streams = {
    distancia,
    altitud: min < 0 ? altitud.map((a) => a - min) : altitud,
  };

  return {
    nombre,
    streams,
    puntos,
    metros: distancia[distancia.length - 1],
    desnivel,
    altMin: Math.min(...altitud),
    altMax: Math.max(...altitud),
    nPuntos: puntos.length,
    sinAltitud,
  };
}

/* ============================================================
   Analisis de la ruta contra el historial del ciclista.
   ============================================================ */

/*
  Resume lo que el ciclista ya ha demostrado ser capaz de hacer.
  Se apoya en dos fuentes: la lista de salidas (siempre disponible) para
  distancia y desnivel, y los streams ya analizados para los ascensos.
*/
export function referenciasCiclista(salidas, cache, excluidas) {
  const val = (salidas || []).filter((s) => !excluidas?.has(s.id));
  const puertos = Object.entries(cache || {}).flatMap(([id, st]) =>
    excluidas?.has(Number(id)) ? [] : detectarPuertos(st, { minMetros: 600, minDesnivel: 40, minPend: 3 })
  );

  const porLargo = [...puertos].sort((a, b) => b.metros - a.metros)[0];
  const porDesnivel = [...puertos].sort((a, b) => b.desnivel - a.desnivel)[0];

  return {
    nSalidas: val.length,
    maxKm: val.length ? Math.max(...val.map(km)) : 0,
    maxDesnivel: val.length ? Math.max(...val.map((s) => s.desnivel)) : 0,
    maxMkm: val.length ? Math.max(...val.map(metrosPorKm)) : 0,
    ascensoMasLargo: porLargo || null,
    ascensoMasDuro: porDesnivel || null,
    nPuertos: puertos.length,
  };
}

/*
  Veredicto sobre si la ruta esta al alcance.

  El criterio es comparar cada exigencia de la ruta con el mejor registro
  del ciclista y quedarse con la peor relacion: una ruta no se hace dificil
  por su promedio sino por su punto mas exigente. Si la distancia esta
  dentro de lo hecho pero el puerto dobla al mayor subido nunca, la ruta es
  dura, y decir lo contrario porque "de media encaja" seria enganarse.
*/
export function analizarRuta(datos, ref, cfg) {
  const kmR = datos.metros / 1000;
  const mkm = datos.desnivel / kmR;

  const puertos = detectarPuertos(datos.streams, { minMetros: 600, minDesnivel: 40, minPend: 3 });
  const dureza = repartoDureza(datos.streams);
  const mayor = [...puertos].sort((a, b) => b.desnivel - a.desnivel)[0] || null;

  /* --- relaciones con lo ya demostrado --- */
  const rel = [];
  if (ref.maxKm) rel.push({
    k: 'Distancia', r: kmR / ref.maxKm,
    tuyo: `${num(ref.maxKm, 1)} km`, ruta: `${num(kmR, 1)} km`,
  });
  if (ref.maxDesnivel) rel.push({
    k: 'Desnivel', r: datos.desnivel / ref.maxDesnivel,
    tuyo: `+${num(ref.maxDesnivel, 0)} m`, ruta: `+${num(datos.desnivel, 0)} m`,
  });
  if (ref.ascensoMasDuro && mayor) rel.push({
    k: 'Mayor subida', r: mayor.desnivel / ref.ascensoMasDuro.desnivel,
    tuyo: `+${num(ref.ascensoMasDuro.desnivel, 0)} m`,
    ruta: `+${num(mayor.desnivel, 0)} m`,
  });
  if (ref.ascensoMasLargo && mayor) rel.push({
    k: 'Subida más larga', r: mayor.metros / ref.ascensoMasLargo.metros,
    tuyo: `${num(ref.ascensoMasLargo.metros / 1000, 2)} km`,
    ruta: `${num(mayor.metros / 1000, 2)} km`,
  });

  const peor = rel.length ? Math.max(...rel.map((x) => x.r)) : 0;
  const critico = rel.find((x) => x.r === peor);

  /* --- veredicto --- */
  let nivel, titulo, texto;
  if (!ref.nSalidas) {
    nivel = 'neutro';
    titulo = 'Sin historial con el que comparar';
    texto = 'Todavía no hay salidas cargadas, así que puedo describir la ruta pero no decirte si está a tu alcance.';
  } else if (peor <= 1) {
    nivel = 'ok';
    titulo = 'Dentro de lo que ya has hecho';
    texto = `Ninguna exigencia de esta ruta supera tu mejor registro. La parte más comprometida es ${critico.k.toLowerCase()} (${critico.ruta} frente a los ${critico.tuyo} que ya has firmado). Es una ruta para disfrutar, no para sufrir.`;
  } else if (peor <= 1.25) {
    nivel = 'ok';
    titulo = 'Un paso adelante razonable';
    texto = `Se te va un ${num((peor - 1) * 100, 0)} % por encima de tu tope en ${critico.k.toLowerCase()}: ${critico.ruta} frente a ${critico.tuyo}. Es exactamente el tamaño de salto que hace progresar sin romper nada. Sal conservador y guarda para el final.`;
  } else if (peor <= 1.6) {
    nivel = 'aviso';
    titulo = 'Exigente para tu nivel actual';
    texto = `${critico.k} se va a ${critico.ruta} cuando tu mejor marca son ${critico.tuyo}, un ${num((peor - 1) * 100, 0)} % más. Es abordable si vas con la idea de terminarla y no de hacer tiempo: ritmo bajo desde el kilómetro cero, comer antes de tener hambre y aceptar parar si hace falta.`;
  } else {
    nivel = 'aviso';
    titulo = 'Todavía no';
    texto = `${critico.k} de esta ruta (${critico.ruta}) casi ${num(peor, 1)} veces tu mejor registro (${critico.tuyo}). Meterse ahí ahora no es valentía, es acabar andando a mitad y volver con mala experiencia. Construye primero un par de salidas intermedias y vuelve a este archivo en unas semanas.`;
  }

  /* --- cosas a tener en cuenta --- */
  const avisos = [];
  if (dureza) {
    const dp = dureza.porcentaje;
    if (dp[5] > 0.5) avisos.push(`Hay ${num(dureza.metros[5], 0)} m por encima del 20 %. Comprueba que llevas un desarrollo capaz de subir eso sentado; de pie a 20 % se agota muy rápido.`);
    if (dp[4] > 1.5) avisos.push(`Un ${num(dp[4], 1)} % del recorrido va entre el 15 y el 20 %. Son las rampas donde se decide si terminas la ruta entera.`);
    if (dp[0] > 85 && !puertos.length) avisos.push('Perfil casi llano: el trabajo aquí es sostener ritmo y posición, no la fuerza. El viento te condicionará más que la pendiente.');
  }
  if (mkm > 18) avisos.push(`${num(mkm, 1)} metros de desnivel por kilómetro la convierten en una ruta de montaña continua, con poca zona de recuperación entre subidas.`);
  if (puertos.length >= 4) avisos.push(`${puertos.length} subidas encadenadas. El problema no será ninguna en concreto sino la acumulación: la última se sube con las piernas de las tres anteriores.`);
  if (kmR > 60) avisos.push(`Por encima de las tres horas de salida la alimentación deja de ser un detalle: algo sólido cada 45 minutos desde el principio, no cuando aparece el hambre.`);
  if (datos.sinAltitud > datos.nPuntos * 0.1) avisos.push(`Al ${num((datos.sinAltitud / datos.nPuntos) * 100, 0)} % de los puntos del archivo les faltaba la altitud y se ha interpolado. El desnivel real puede diferir algo del que ves aquí.`);

  /* --- consejos de como afrontarla --- */
  const consejos = [];
  if (mayor) {
    const pos = (mayor.kmInicio / kmR) * 100;
    consejos.push(
      pos > 65
        ? `La subida grande (${num(mayor.metros / 1000, 2)} km al ${num(mayor.pendiente, 1)} %) llega en el km ${num(mayor.kmInicio, 1)}, con la ruta ya avanzada. Todo lo que gastes antes te lo va a cobrar ahí.`
        : pos < 30
          ? `La subida grande aparece pronto, en el km ${num(mayor.kmInicio, 1)}. La tentación es subirla con las piernas frescas a tope; si lo haces, los ${num(kmR - mayor.kmFin, 0)} km que quedan después se hacen eternos.`
          : `La subida grande está hacia la mitad, en el km ${num(mayor.kmInicio, 1)}. Buen sitio: llegas rodado pero aún con margen.`
    );
  }
  if (puertos.length > 1) {
    const ultimo = puertos[puertos.length - 1];
    if (ultimo.kmFin > kmR * 0.8) consejos.push(`La última subida termina en el km ${num(ultimo.kmFin, 1)}, prácticamente en meta. Reserva algo para ella en vez de vaciarte en la penúltima.`);
  }
  if (dureza && dureza.porcentaje[0] > 60 && puertos.length) {
    consejos.push('Entre subidas hay bastante llano: son los tramos para beber, comer y bajar pulsaciones, no para apretar.');
  }
  consejos.push(
    peor > 1.25
      ? 'Plantéala como una salida de completar. El cronómetro puede esperar a la segunda vez que la hagas.'
      : 'Puedes plantearte hacerla a ritmo, pero sigue midiendo el esfuerzo en las subidas: es donde se pierde una ruta.'
  );

  return {
    kmR, mkm, puertos, dureza, mayor, rel, peor, critico,
    nivel, titulo, texto, avisos, consejos,
  };
}
