'use client';

import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import {
  IcoLogros, IcoFlecha, IcoFlechaDerecha, IcoTriangulo, IcoCerrar,
  IcoRodaje, IcoAscensiones, IcoVelocidad, IcoHabitos, IcoExploracion, IcoComunidad,
} from './Iconos';
import {
  km, kmh, num, duracionHMS, detectarParadas, detectarPuertos, categoriaPuerto,
  tipoRuta, vatiosSalida, velocidadMaximaLlano, distanciaGeo,
} from '@/lib/metrics';

const CATEGORIAS = [
  ['rodaje', 'Rodaje', IcoRodaje],
  ['montana', 'Montaña', IcoAscensiones],
  ['velocidad', 'Velocidad', IcoVelocidad],
  ['habitos', 'Hábitos', IcoHabitos],
  ['exploracion', 'Exploración', IcoExploracion],
  ['comunidad', 'Comunidad', IcoComunidad],
];

/*
  Las siete divisiones de toda escala de rango, de la mas baja a la mas
  alta. Cada logro numerico (distancia, desnivel, velocidad...) reutiliza
  esta misma escala para que el usuario aprenda una unica gramatica de
  progreso en vez de una distinta por logro. Los colores son tematicos
  -bronce, plata, oro...- y viven solo aqui: no reutilizan --acento
  porque ese esta reservado al cromo de la interfaz y esto es un dato
  (el rango conseguido), no cromo.
*/
const DIVISIONES = [
  { id: 'hierro', nombre: 'Hierro', color: '#8A93A1' },
  { id: 'bronce', nombre: 'Bronce', color: '#C1793F' },
  { id: 'plata', nombre: 'Plata', color: '#C7CCD3' },
  { id: 'oro', nombre: 'Oro', color: '#E3B341' },
  { id: 'platino', nombre: 'Platino', color: '#7FE0D2' },
  { id: 'diamante', nombre: 'Diamante', color: '#5FBCF2' },
];
const SUBDIVISIONES = ['V', 'IV', 'III', 'II', 'I'];
const COLOR_MAESTRO = '#B98CF2';

/* Reparte una lista de 31 umbrales crecientes (5 por division, mas el
   ultimo para Maestro) en la escala de rangos. */
function construirEscala(umbrales) {
  const tiers = [];
  let i = 0;
  DIVISIONES.forEach((div) => {
    SUBDIVISIONES.forEach((sub) => {
      tiers.push({ id: `${div.id}-${sub}`, division: div.nombre, sub, color: div.color, umbral: umbrales[i] });
      i += 1;
    });
  });
  tiers.push({ id: 'maestro', division: 'Maestro', sub: null, color: COLOR_MAESTRO, umbral: umbrales[i] });
  return tiers;
}

/* Distancia de una sola salida. Hierro V empieza en 15 km -una vuelta
   corta cualquiera- y Maestro pide 300 km, una salida de un dia entero
   con mayuscula. Es un primer trazo de la escala: se recalibra mas
   adelante con datos reales de uso. */
const ESCALA_RUTA_UNICA = construirEscala([
  15, 20, 25, 30, 35,
  40, 45, 50, 55, 60,
  65, 70, 75, 80, 90,
  100, 110, 120, 130, 140,
  150, 160, 170, 180, 190,
  200, 215, 230, 245, 260,
  300,
]);

/* Distancia acumulada en una semana natural (lunes a domingo). Maestro
   pide 1500 km en siete dias, un volumen de etapa de vuelta grande
   mantenido toda la semana. */
const ESCALA_VOLUMEN_SEMANAL = construirEscala([
  50, 70, 90, 110, 130,
  150, 175, 200, 225, 250,
  275, 300, 325, 350, 400,
  450, 500, 550, 600, 650,
  700, 750, 800, 850, 900,
  950, 1000, 1050, 1100, 1200,
  1500,
]);

/* Distancia acumulada en un mes natural. Maestro pide 3000 km al mes,
   cerca de los 100 km diarios de promedio de una vuelta grande. */
const ESCALA_VOLUMEN_MENSUAL = construirEscala([
  150, 200, 250, 300, 350,
  400, 450, 500, 550, 600,
  650, 700, 750, 800, 900,
  1000, 1100, 1200, 1300, 1400,
  1500, 1600, 1700, 1800, 1900,
  2000, 2150, 2300, 2450, 2600,
  3000,
]);

/* Distancia acumulada en un año natural. Maestro pide 26 000 km, el
   volumen anual de un profesional. */
const ESCALA_VOLUMEN_ANUAL = construirEscala([
  1000, 1500, 2000, 2500, 3000,
  3500, 4000, 4500, 5000, 5500,
  6000, 6500, 7000, 7500, 8000,
  9000, 10000, 11000, 12000, 13000,
  14000, 15000, 16000, 17000, 18000,
  19000, 20000, 21500, 23000, 24500,
  26000,
]);

/* Distancia acumulada en todo el historial. Maestro pide 180 000 km,
   algo mas de cuatro vueltas y media al ecuador terrestre. */
const ESCALA_ODISEA_HISTORICA = construirEscala([
  500, 1000, 1500, 2500, 4000,
  6000, 8000, 10000, 13000, 16000,
  20000, 24000, 28000, 32000, 37000,
  42000, 48000, 54000, 60000, 67000,
  74000, 82000, 90000, 98000, 107000,
  116000, 126000, 136000, 146000, 157000,
  180000,
]);

/* Distancia acumulada en un fin de semana (sabado + domingo). Maestro
   pide 700 km entre los dos dias, un doble centenar de fin de semana. */
const ESCALA_DOMINGUERO = construirEscala([
  30, 45, 60, 75, 90,
  105, 120, 135, 150, 165,
  180, 200, 220, 240, 260,
  280, 300, 325, 350, 375,
  400, 425, 450, 475, 500,
  525, 550, 575, 600, 650,
  700,
]);

/* Distancia continua mas larga sin un paron de mas de tres minutos
   dentro de una misma salida. Acotado por lo que da de si una salida
   real, asi que la escala es mas corta de tramo que Ruta unica. */
const ESCALA_MOTOR_DIESEL = construirEscala([
  10, 15, 20, 25, 30,
  35, 40, 45, 50, 55,
  60, 65, 70, 75, 80,
  90, 100, 110, 120, 130,
  140, 150, 160, 170, 180,
  190, 200, 215, 230, 245,
  260,
]);

/* Desnivel positivo acumulado en un solo dia. Maestro pide 4000 m, una
   etapa de alta montana con varios puertos encadenados. */
const ESCALA_ALPINISTA_DIA = construirEscala([
  100, 150, 200, 250, 300,
  350, 400, 450, 500, 550,
  600, 650, 700, 750, 850,
  950, 1050, 1150, 1250, 1350,
  1500, 1650, 1800, 1950, 2100,
  2300, 2500, 2700, 2900, 3200,
  4000,
]);

/* Desnivel positivo acumulado en un mes natural. Maestro pide 35 000 m,
   un mes entero centrado en subir. */
const ESCALA_CAZADOR_NUBES = construirEscala([
  500, 800, 1100, 1500, 2000,
  2500, 3000, 3500, 4000, 4500,
  5000, 5500, 6000, 6500, 7500,
  8500, 9500, 10500, 11500, 12500,
  14000, 15500, 17000, 18500, 20000,
  22000, 24000, 26000, 28000, 30000,
  35000,
]);

/* Desnivel positivo acumulado en todo el historial. Maestro pide medio
   millon de metros, unas 56 veces la altura del Everest desde el mar. */
const ESCALA_CABRA_MONTES = construirEscala([
  2000, 4000, 6000, 9000, 13000,
  18000, 24000, 30000, 37000, 45000,
  54000, 64000, 75000, 87000, 100000,
  115000, 131000, 148000, 166000, 185000,
  205000, 226000, 248000, 271000, 295000,
  320000, 346000, 373000, 401000, 430000,
  500000,
]);

/* Altitud maxima alcanzada en cualquier punto de una salida, sobre el
   nivel del mar. Los tramos altos siguen puertos reales -Tourmalet
   ronda 2115 m, el Bonette 2802- y Maestro pide 6000, por encima de
   cualquier carretera asfaltada del planeta. */
const ESCALA_TOCAR_CIELO = construirEscala([
  100, 200, 300, 450, 600,
  800, 1000, 1200, 1400, 1600,
  1800, 2000, 2200, 2400, 2600,
  2800, 3000, 3200, 3400, 3600,
  3800, 4000, 4200, 4400, 4600,
  4800, 5000, 5200, 5400, 5600,
  6000,
]);

/* Numero de puertos de 1a categoria coronados, sumando todas las
   salidas. Es un recuento historico, no un maximo: cada puerto subido
   cuenta, se repita o no. */
const ESCALA_ESCALADOR_PRIMERA = construirEscala([
  1, 2, 3, 4, 5,
  6, 7, 8, 9, 10,
  12, 14, 16, 18, 20,
  23, 26, 29, 32, 35,
  40, 45, 50, 55, 60,
  70, 80, 90, 100, 115,
  150,
]);

/* Numero de puertos fuera de categoria (HC) coronados. Los HC son mas
   raros que los de 1a -el coeficiente que hace falta es mayor- asi que
   la escala pide menos repeticiones por tramo para llegar igual de
   lejos. */
const ESCALA_FUERA_DE_CATEGORIA = construirEscala([
  1, 2, 3, 4, 5,
  6, 7, 8, 9, 10,
  11, 13, 15, 17, 19,
  21, 24, 27, 30, 33,
  36, 40, 44, 48, 52,
  57, 62, 67, 72, 78,
  90,
]);

/* Las seis escalas de velocidad sostenida en llano (Rodador, Locomotora,
   Tren bala, y las tres "X km lisos") miden lo mismo -la velocidad
   media mas alta en una salida llana de al menos esa distancia- asi que
   comparten forma: techos altos en las distancias cortas, mas bajos en
   las largas porque cuesta mas sostener el ritmo cuanto mas dura el
   esfuerzo. */
const ESCALA_RODADOR = construirEscala([
  18, 20, 22, 24, 26,
  27, 28, 29, 30, 31,
  32, 33, 34, 35, 36,
  37, 38, 39, 40, 41,
  42, 43, 44, 45, 46,
  47, 48, 49, 50, 51,
  55,
]);

const ESCALA_KM_LISOS_25 = construirEscala([
  18, 20, 22, 24, 26,
  27, 28, 29, 30, 31,
  32, 33, 34, 35, 36,
  37, 38, 39, 40, 41,
  42, 43, 44, 45, 46,
  47, 48, 49, 50, 51,
  54,
]);

const ESCALA_LOCOMOTORA = construirEscala([
  17, 19, 21, 23, 25,
  26, 27, 28, 29, 30,
  31, 32, 33, 34, 35,
  36, 37, 38, 39, 40,
  41, 42, 43, 44, 45,
  46, 47, 48, 49, 50,
  52,
]);

const ESCALA_KM_LISOS_50 = construirEscala([
  17, 19, 21, 23, 25,
  26, 27, 28, 29, 30,
  31, 32, 33, 34, 35,
  36, 37, 38, 39, 40,
  41, 42, 43, 44, 45,
  46, 47, 48, 49, 50,
  52,
]);

const ESCALA_TREN_BALA = construirEscala([
  16, 18, 20, 22, 24,
  25, 26, 27, 28, 29,
  30, 31, 32, 33, 34,
  35, 36, 37, 38, 39,
  40, 41, 42, 43, 44,
  45, 46, 47, 48, 49,
  50,
]);

const ESCALA_KM_LISOS_100 = construirEscala([
  16, 18, 20, 22, 24,
  25, 26, 27, 28, 29,
  30, 31, 32, 33, 34,
  35, 36, 37, 38, 39,
  40, 41, 42, 43, 44,
  45, 46, 47, 48, 49,
  50,
]);

/* Velocidad punta en llano -la misma cuenta que "Vel. punta en llano"
   de Tus estadisticas, no una nueva-, tramos de verdad rodados y no
   ruido de GPS. Maestro pide 110 km/h, por encima de cualquier sprint
   real en llano sin viento ni rueda ajena. */
const ESCALA_SPRINTER = construirEscala([
  30, 35, 40, 45, 50,
  52, 54, 56, 58, 60,
  62, 64, 66, 68, 70,
  72, 74, 76, 78, 80,
  82, 84, 86, 88, 90,
  92, 94, 96, 98, 100,
  110,
]);

/* Potencia media estimada de una salida completa (o medida, si el
   medidor la trajo). Maestro pide 550 W de media en toda una salida,
   fuera del alcance de cualquier ciclista aficionado. */
const ESCALA_POTENCIA = construirEscala([
  80, 100, 120, 140, 160,
  175, 190, 205, 220, 235,
  250, 265, 280, 295, 310,
  325, 340, 355, 370, 385,
  400, 415, 430, 445, 460,
  475, 490, 505, 520, 535,
  550,
]);

/* Racha mas larga de dias consecutivos con al menos una salida. Maestro
   pide 150 dias seguidos, cinco meses sin fallar ni uno. */
const ESCALA_INQUEBRANTABLE = construirEscala([
  2, 3, 4, 5, 6,
  7, 8, 9, 10, 11,
  12, 14, 16, 18, 20,
  23, 26, 29, 32, 35,
  40, 45, 50, 55, 60,
  70, 80, 90, 100, 115,
  150,
]);

/* Numero de dias -no de salidas- que empezaron antes de las 8:00. Es un
   recuento historico, como los puertos coronados: cada dia madrugador
   cuenta una vez, se repita o no la fecha con mas de una salida. */
const ESCALA_MADRUGADOR = construirEscala([
  1, 2, 3, 4, 5,
  6, 8, 10, 12, 14,
  17, 20, 23, 26, 30,
  35, 40, 45, 50, 56,
  63, 70, 78, 86, 95,
  105, 115, 126, 138, 151,
  200,
]);

/* Dias -no salidas- con alguna actividad que empezo despues de las
   20:00. El reverso nocturno de Madrugador, con la misma cuenta por
   dia unico. */
const ESCALA_BUHO = construirEscala([
  1, 2, 3, 4, 5,
  6, 8, 10, 12, 14,
  17, 20, 23, 26, 30,
  35, 40, 45, 50, 56,
  63, 70, 78, 86, 95,
  105, 115, 126, 138, 151,
  200,
]);

/* Fines de semana en los que ha salido tanto el sabado como el
   domingo. Maestro pide 40, casi un año entero de findes completos. */
const ESCALA_FINDE_PERFECTO = construirEscala([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 24, 26, 28, 30, 32, 34, 36, 38,
  40,
]);

/* Racha mas larga de semanas ISO consecutivas con al menos una salida.
   Mas indulgente que Inquebrantable -un dia flojo no la rompe- pero
   exige regularidad semana tras semana. Maestro pide 52, un año
   entero sin fallar ninguna semana. */
const ESCALA_RACHA_SEMANAL = construirEscala([
  2, 3, 4, 5, 6,
  7, 8, 9, 10, 11,
  12, 13, 14, 16, 18,
  20, 22, 24, 26, 28,
  30, 33, 36, 39, 42,
  45, 47, 49, 50, 51,
  52,
]);

/* Meses distintos -no necesariamente seguidos- con cuatro salidas o
   mas: no premia una racha puntual sino mantener un ritmo alto mes
   tras mes. Maestro pide 60, cinco años enteros a ese ritmo. */
const ESCALA_RITMO_CONSTANTE = construirEscala([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 18, 20, 22, 24,
  27, 30, 33, 36, 39, 42, 46, 50, 54, 57,
  60,
]);

/* Numero de provincias distintas donde ha empezado alguna salida.
   Maestro pide 50, practicamente todo el mapa de provincias
   españolas. */
const ESCALA_VIAJERO = construirEscala([
  1, 2, 3, 4, 5,
  6, 7, 8, 9, 10,
  11, 12, 13, 14, 15,
  16, 17, 18, 19, 20,
  22, 24, 26, 28, 30,
  33, 36, 39, 42, 45,
  50,
]);

/* Kilometros cuadrados distintos pisados, contando cada celda de una
   rejilla de 1 km una sola vez aunque se repita la ruta. Maestro pide
   1500 km², un territorio grande de verdad y no solo las mismas
   vueltas de siempre. */
const ESCALA_CARTOGRAFO = construirEscala([
  20, 35, 50, 70, 90,
  110, 130, 150, 175, 200,
  230, 260, 290, 320, 360,
  400, 450, 500, 550, 600,
  650, 700, 760, 820, 880,
  950, 1020, 1100, 1180, 1260,
  1500,
]);

/* Numero de puntos de partida distintos -agrupados por cercania, no
   salida a salida- para que salir siempre del mismo sitio no cuente
   como explorar. Maestro pide 150 origenes distintos. */
const ESCALA_NOMADA = construirEscala([
  1, 2, 3, 4, 5,
  6, 7, 8, 9, 10,
  12, 14, 16, 18, 20,
  23, 26, 29, 32, 35,
  40, 45, 50, 55, 60,
  70, 80, 90, 100, 115,
  150,
]);

/* Distancia en linea recta mas lejos que ha llegado cualquier punto de
   cualquier ruta desde el punto de partida habitual -el origen que mas
   se repite-. Maestro pide 900 km, casi otro pais. */
const ESCALA_LEJOS_DE_CASA = construirEscala([
  5, 10, 15, 22, 30,
  40, 50, 60, 72, 85,
  100, 115, 130, 150, 170,
  195, 220, 250, 280, 310,
  345, 380, 420, 460, 500,
  550, 600, 660, 720, 780,
  900,
]);

/* Numero de salidas con mas de un ciclista (a.athlete_count > 1 en el
   listado de Strava). Maestro pide 150 salidas en grupo. */
const ESCALA_GRUPETA = construirEscala([
  1, 2, 3, 4, 5,
  6, 7, 8, 9, 10,
  12, 14, 16, 18, 20,
  23, 26, 29, 32, 35,
  40, 45, 50, 55, 60,
  70, 80, 90, 100, 115,
  150,
]);

/* Numero de salidas con al menos una foto adjunta. Misma forma que
   Grupeta: es el mismo tipo de recuento historico. */
const ESCALA_FOTOGRAFO = construirEscala([
  1, 2, 3, 4, 5,
  6, 7, 8, 9, 10,
  12, 14, 16, 18, 20,
  23, 26, 29, 32, 35,
  40, 45, 50, 55, 60,
  70, 80, 90, 100, 115,
  150,
]);

/* Kudos acumulados en total, sumando todas las salidas. Maestro pide
   2000, la clase de numero que solo se ve en cuentas con mucho
   seguimiento. */
const ESCALA_POPULAR = construirEscala([
  5, 10, 20, 35, 50,
  70, 90, 115, 140, 170,
  200, 235, 270, 310, 350,
  400, 450, 500, 560, 620,
  690, 760, 830, 910, 1000,
  1100, 1200, 1300, 1450, 1600,
  2000,
]);

/* Comentarios en una sola salida, el maximo conseguido. Es un record
   de "una vez", no una suma -como Ruta unica con la distancia-. */
const ESCALA_COMENTADO = construirEscala([
  1, 2, 3, 4, 5,
  6, 7, 8, 9, 10,
  12, 14, 16, 18, 20,
  23, 26, 29, 32, 35,
  40, 45, 50, 55, 60,
  70, 80, 90, 100, 115,
  150,
]);

/* Centros aproximados de las provincias españolas (capital de
   provincia como proxy). Sirve para clasificar cada salida por su
   punto de partida via vecino mas cercano: no hace falta precision de
   limites administrativos reales, solo saber "cerca de que capital
   empezo esto". */
const PROVINCIAS_ES = [
  ['A Coruña', 43.3623, -8.4115], ['Álava', 42.8467, -2.6716],
  ['Albacete', 38.9943, -1.8585], ['Alicante', 38.3452, -0.4810],
  ['Almería', 36.8340, -2.4637], ['Asturias', 43.3603, -5.8448],
  ['Ávila', 40.6566, -4.6818], ['Badajoz', 38.8794, -6.9707],
  ['Baleares', 39.5696, 2.6502], ['Barcelona', 41.3874, 2.1686],
  ['Burgos', 42.3439, -3.6969], ['Cáceres', 39.4753, -6.3724],
  ['Cádiz', 36.5271, -6.2886], ['Cantabria', 43.4623, -3.8099],
  ['Castellón', 39.9864, -0.0513], ['Ciudad Real', 38.9848, -3.9272],
  ['Córdoba', 37.8882, -4.7794], ['Cuenca', 40.0704, -2.1374],
  ['Girona', 41.9794, 2.8214], ['Granada', 37.1773, -3.5986],
  ['Guadalajara', 40.6333, -3.1669], ['Guipúzcoa', 43.3183, -1.9812],
  ['Huelva', 37.2614, -6.9447], ['Huesca', 42.1401, -0.4089],
  ['Jaén', 37.7796, -3.7849], ['La Rioja', 42.4650, -2.4456],
  ['Las Palmas', 28.1235, -15.4363], ['León', 42.5987, -5.5671],
  ['Lleida', 41.6176, 0.6200], ['Lugo', 43.0121, -7.5560],
  ['Madrid', 40.4168, -3.7038], ['Málaga', 36.7213, -4.4214],
  ['Murcia', 37.9922, -1.1307], ['Navarra', 42.8125, -1.6458],
  ['Ourense', 42.3358, -7.8639], ['Palencia', 42.0096, -4.5288],
  ['Pontevedra', 42.4310, -8.6444], ['Salamanca', 40.9701, -5.6635],
  ['Segovia', 40.9429, -4.1088], ['Sevilla', 37.3891, -5.9845],
  ['Soria', 41.7636, -2.4649], ['Tarragona', 41.1189, 1.2445],
  ['Santa Cruz de Tenerife', 28.4636, -16.2518], ['Teruel', 40.3456, -1.1065],
  ['Toledo', 39.8628, -4.0273], ['Valencia', 39.4699, -0.3763],
  ['Valladolid', 41.6523, -4.7245], ['Vizcaya', 43.2630, -2.9350],
  ['Zamora', 41.5033, -5.7446], ['Zaragoza', 41.6488, -0.8891],
  ['Ceuta', 35.8894, -5.3213], ['Melilla', 35.2923, -2.9381],
];

/* Provincia mas cercana a un punto [lat, lon]. */
function provinciaDe([lat, lon]) {
  let mejor = null, mejorDist = Infinity;
  PROVINCIAS_ES.forEach(([nombre, plat, plon]) => {
    const d = distanciaGeo([lat, lon], [plat, plon]);
    if (d < mejorDist) { mejorDist = d; mejor = nombre; }
  });
  return mejor;
}

/* Dado el mejor valor conseguido, devuelve el ultimo tramo ya superado
   y el siguiente por conseguir (null si ya se llego al tope). */
function estadoEscala(tiers, valor) {
  let actual = null;
  let siguiente = null;
  for (let i = 0; i < tiers.length; i += 1) {
    if (valor >= tiers[i].umbral) actual = tiers[i];
    else { siguiente = tiers[i]; break; }
  }
  return { actual, siguiente };
}

/* Cuantos tramos de una escala ya estan conseguidos (0 a 31). Es la
   misma cuenta que usa TarjetaRango para pintar el desplegable, pero
   aqui hace falta el numero, no el tramo: el resumen de arriba de la
   pagina promedia esta cifra entre todos los logros para sacar un
   rango y un porcentaje globales. */
function nivelesConseguidos(escala, valor) {
  let n = 0;
  for (let i = 0; i < escala.length; i += 1) if (valor >= escala[i].umbral) n += 1;
  return n;
}

function nombreTier(t) {
  return t.sub ? `${t.division} ${t.sub}` : t.division;
}

/* Lista de divisiones en el orden de la escala, deducida de sus tramos
   -asi el desplegable no depende de mantener DIVISIONES y "Maestro"
   sincronizados a mano en dos sitios. */
function divisionesDe(escala) {
  const vistas = new Set();
  const lista = [];
  escala.forEach((t) => {
    if (!vistas.has(t.division)) { vistas.add(t.division); lista.push({ nombre: t.division, color: t.color }); }
  });
  return lista;
}

/*
  Bloque estandar de un logro con escala de rangos: icono con la
  subdivision actual, nombre y descripcion del logro, barra hacia el
  siguiente tramo, y un desplegable con la escala completa. Cada logro
  monta esto pasandole su propia escala y el valor conseguido: el
  bloque en si no sabe nada de distancias ni de Strava.
*/
/* Cuando la tarjeta lleva "distanciaKm", el logro es una velocidad por
   dentro -la escala sigue siendo km/h, mas rapido sigue desbloqueando
   tramos mas altos- pero se enseña como el tiempo que hace falta para
   cubrir esa distancia a esa velocidad: distancia/velocidad. Es el
   mismo numero visto del otro lado, asi que no hace falta invertir la
   comparacion "valor >= umbral" en ningun sitio. */
function formatoMagnitud(v, distanciaKm, unidad, decimales, conUnidad = true) {
  if (distanciaKm) return v > 0 ? duracionHMS((distanciaKm / v) * 3600) : '—';
  return conUnidad ? `${num(v, decimales)}${unidad ? ` ${unidad}` : ''}` : num(v, decimales);
}

/*
  Diferencia entre dos valores de un mismo logro, en las mismas unidades
  que se ven en pantalla. En las tarjetas de tiempo el valor guardado
  sigue siendo velocidad, asi que la resta se hace sobre los tiempos ya
  convertidos -no sobre los km/h- para que la diferencia sea un tiempo
  (ganado o por recortar) y no una velocidad.

  Generica sobre dos valores cualesquiera (no solo "valor" contra el
  umbral de un tramo) para poder reutilizarla tambien al comparar el
  antes y el despues de una sincronizacion -ver diferenciaMagnitud, mas
  abajo, y el popup de logros actualizados.
*/
function diferenciaValores(desde, hasta, distanciaKm, unidad, decimales) {
  if (distanciaKm) {
    if (desde <= 0 || hasta <= 0) return null;
    const diffSeg = (distanciaKm / desde) * 3600 - (distanciaKm / hasta) * 3600;
    return diffSeg > 0 ? duracionHMS(diffSeg) : null;
  }
  const diff = hasta - desde;
  return diff > 0 ? `${num(diff, decimales)}${unidad ? ` ${unidad}` : ''}` : null;
}

/* Cuanto le falta (o le faltaba) para el siguiente tramo: la misma
   diferencia de arriba, entre el valor actual y el umbral del siguiente
   tramo. */
function diferenciaMagnitud(valor, siguiente, distanciaKm, unidad, decimales) {
  if (!siguiente) return null;
  return diferenciaValores(valor, siguiente.umbral, distanciaKm, unidad, decimales);
}

function TarjetaRango({ nombre, descripcion, escala, valor, unidad = 'km', decimales = 1, distanciaKm = 0 }) {
  const [abierta, setAbierta] = useState(false);
  const divisiones = useMemo(() => divisionesDe(escala), [escala]);
  const { actual, siguiente } = useMemo(() => estadoEscala(escala, valor), [escala, valor]);
  const pct = siguiente ? Math.min(100, (valor / siguiente.umbral) * 100) : 100;
  const colorBarra = (actual ?? siguiente)?.color ?? 'var(--line2)';
  const diferencia = useMemo(
    () => diferenciaMagnitud(valor, siguiente, distanciaKm, unidad, decimales),
    [valor, siguiente, distanciaKm, unidad, decimales],
  );

  return (
    <div className="tarjeta-logro">
      <div className="panel">
        <div className="rango-actual">
          <div className="insignia-circulo" style={{ '--c': actual ? actual.color : 'var(--line2)' }}>
            {actual ? (actual.sub ?? '★') : '—'}
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{nombre}</p>
            <p className="hint" style={{ margin: '4px 0 0' }}>{descripcion}</p>
          </div>
        </div>

        <button type="button" className="rango-toggle" aria-expanded={abierta}
          onClick={() => setAbierta((a) => !a)}>
          <div className="goal">
            <div className="top2">
              <span className="name">
                {actual ? nombreTier(actual) : 'Todavía sin rango'}
                {siguiente && (
                  <span className="siguiente-nombre">
                    <IcoFlechaDerecha /> {nombreTier(siguiente)}
                  </span>
                )}
              </span>
              <span className="pct" style={{ color: colorBarra }}>
                {num(pct, 0)} % <IcoFlecha className="chevron" />
              </span>
            </div>
            <div className="bar"><i style={{ width: `${pct}%`, background: colorBarra }} /></div>
            <p className="note">
              {formatoMagnitud(valor, distanciaKm, unidad, decimales, false)} / {siguiente
                ? formatoMagnitud(siguiente.umbral, distanciaKm, unidad, 0)
                : `${formatoMagnitud(actual?.umbral ?? 0, distanciaKm, unidad, 0)} · rango máximo`}
              {diferencia && <span className="diferencia"> <IcoTriangulo /> {diferencia}</span>}
            </p>
          </div>
        </button>

        {abierta && (
          <div className="escala">
            {divisiones.map((div) => (
              <div className="escala-division" key={div.nombre}>
                <h3 style={{ color: div.color }}>{div.nombre}</h3>
                <div className="escala-grid">
                  {escala.filter((t) => t.division === div.nombre).map((t) => (
                    <div key={t.id} className={`escala-tier${valor >= t.umbral ? ' conseguido' : ''}`}
                      style={{ '--c': t.color }}>
                      {t.sub && <span className="sub">{t.sub}</span>}
                      <span className="umbral">{formatoMagnitud(t.umbral, distanciaKm, unidad, 0)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* Claves de agrupacion por fecha. Todas parten de "YYYY-MM-DD" (lo que
   ya trae s.fecha.slice(0,10)) asi que no dependen de la zona horaria
   del navegador. */
const claveDia = (f) => f.slice(0, 10);
const claveMes = (f) => f.slice(0, 7);
const claveAnio = (f) => f.slice(0, 4);

function claveSemana(f) {
  const d = new Date(`${f.slice(0, 10)}T00:00:00Z`);
  const diaISO = (d.getDay() + 6) % 7; // 0 = lunes
  d.setDate(d.getDate() - diaISO);
  return d.toISOString().slice(0, 10);
}

/* null para entre semana: esas salidas no cuentan para Dominguero.
   Sabado y domingo del mismo fin de semana comparten la fecha del
   sabado como clave. */
function claveFinDeSemana(f) {
  const d = new Date(`${f.slice(0, 10)}T00:00:00Z`);
  const dia = d.getDay(); // 0 domingo, 6 sabado
  if (dia !== 0 && dia !== 6) return null;
  if (dia === 0) d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/* Suma el valor de cada salida en el cubo que le toque -dia, semana,
   mes, fin de semana...- y devuelve el mayor de esos totales. Es la
   misma cuenta para Volumen semanal/mensual/anual, Dominguero, Alpinista
   de un dia y Cazador de nubes: solo cambia como se agrupan las fechas
   y que dato de la salida se suma (km por defecto, desnivel para las de
   montana). */
function sumaMaximaPorClave(salidas, claveDe, valorDe = km) {
  const sumas = new Map();
  (salidas || []).forEach((s) => {
    const clave = claveDe(s.fecha);
    if (clave == null) return;
    sumas.set(clave, (sumas.get(clave) || 0) + valorDe(s));
  });
  return sumas.size ? Math.max(...sumas.values()) : 0;
}

/* La unica cuenta de Rodaje que no sale de s.distancia: necesita el
   stream de cada salida para saber donde hubo paradas de mas de tres
   minutos. Dashboard va rellenando "cache" en segundo plano nada mas
   cargar la lista, asi que el valor crece solo segun van llegando esas
   salidas; las que aun no tienen stream cargado simplemente no cuentan
   todavia. */
function distanciaSinParon(streams, totalKm) {
  const paradas = detectarParadas(streams, { minSegundos: 180 });
  if (!paradas.length) return totalKm;
  const puntos = [0, ...paradas.map((p) => p.km).filter((v) => v != null), totalKm];
  let max = 0;
  for (let i = 1; i < puntos.length; i += 1) max = Math.max(max, puntos[i] - puntos[i - 1]);
  return max;
}

/* Cuenta puertos coronados de una categoria, sumando todas las
   salidas con stream en cache. Usa los mismos umbrales de deteccion
   que el resto de la app (umbralEstimado en Dashboard) para que "un
   puerto" quiera decir lo mismo aqui que en Mis ascensiones. */
function contarCoronaciones(salidas, cache, codigo) {
  let total = 0;
  (salidas || []).forEach((s) => {
    const streams = cache?.[s.id];
    if (!streams) return;
    const puertos = detectarPuertos(streams, { minMetros: 1000, minDesnivel: 80, minPend: 4 });
    puertos.forEach((p) => {
      if (categoriaPuerto(p.metros, p.pendiente).codigo === codigo) total += 1;
    });
  });
  return total;
}

/* La velocidad media mas alta entre las salidas llanas -tipoRuta(s)
   igual a "llano", el mismo corte que ya usa toda la app para esa
   etiqueta- que lleguen o pasen de minKm. No mira tramos sueltos
   dentro de la salida: usa la salida entera, así que solo cuentan
   salidas que ya de por si son llanas y suficientemente largas. */
function mejorVelocidadLlano(salidas, minKm, refTerreno) {
  let max = 0;
  (salidas || []).forEach((s) => {
    if (tipoRuta(s, refTerreno) !== 'llano' || km(s) < minKm) return;
    const v = kmh(s);
    if (v > max) max = v;
  });
  return max;
}

/* Recorre los dias con salida -un Set, para no contar dos veces un dia
   con mas de una actividad- y busca la racha mas larga de dias
   consecutivos. Solo se examina el arranque de cada racha (el dia
   anterior no esta en el set) para no recorrer cada tramo mas de una
   vez: es el mismo patron que "longest consecutive sequence". */
function rachaMasLarga(salidas) {
  const dias = new Set((salidas || []).map((s) => claveDia(s.fecha)));
  let mejor = 0;
  dias.forEach((d) => {
    const anterior = new Date(`${d}T00:00:00Z`);
    anterior.setDate(anterior.getDate() - 1);
    if (dias.has(anterior.toISOString().slice(0, 10))) return;

    let racha = 1;
    const cursor = new Date(`${d}T00:00:00Z`);
    for (;;) {
      cursor.setDate(cursor.getDate() + 1);
      if (!dias.has(cursor.toISOString().slice(0, 10))) break;
      racha += 1;
    }
    if (racha > mejor) mejor = racha;
  });
  return mejor;
}

/* Igual que rachaMasLarga pero a nivel de semana ISO -claveSemana ya
   normaliza cada fecha al lunes de su semana-, restando 7 dias en vez
   de 1 para movernos a la semana anterior/siguiente. */
function rachaSemanalMasLarga(salidas) {
  const semanas = new Set((salidas || []).map((s) => claveSemana(s.fecha)));
  let mejor = 0;
  semanas.forEach((sem) => {
    const anterior = new Date(`${sem}T00:00:00Z`);
    anterior.setDate(anterior.getDate() - 7);
    if (semanas.has(anterior.toISOString().slice(0, 10))) return;

    let racha = 1;
    const cursor = new Date(`${sem}T00:00:00Z`);
    for (;;) {
      cursor.setDate(cursor.getDate() + 7);
      if (!semanas.has(cursor.toISOString().slice(0, 10))) break;
      racha += 1;
    }
    if (racha > mejor) mejor = racha;
  });
  return mejor;
}

/* Fines de semana -clave del sabado, via claveFinDeSemana- en los que
   hay salida registrada tanto el sabado como el domingo. */
function findesPerfectos(salidas) {
  const porFinde = new Map();
  (salidas || []).forEach((s) => {
    const clave = claveFinDeSemana(s.fecha);
    if (clave == null) return;
    const dia = new Date(`${s.fecha.slice(0, 10)}T00:00:00Z`).getDay();
    const entrada = porFinde.get(clave) || { sabado: false, domingo: false };
    if (dia === 6) entrada.sabado = true; else entrada.domingo = true;
    porFinde.set(clave, entrada);
  });
  let total = 0;
  porFinde.forEach((e) => { if (e.sabado && e.domingo) total += 1; });
  return total;
}

/* Meses -claveMes- que llegan o superan un numero minimo de salidas.
   A diferencia de las rachas, no exige que los meses sean seguidos:
   mide ritmo sostenido en el tiempo, no una racha puntual. */
function mesesConMinimo(salidas, minSalidas) {
  const porMes = new Map();
  (salidas || []).forEach((s) => {
    const clave = claveMes(s.fecha);
    porMes.set(clave, (porMes.get(clave) || 0) + 1);
  });
  let total = 0;
  porMes.forEach((n) => { if (n >= minSalidas) total += 1; });
  return total;
}

/* Celda de 1 km de una rejilla, redondeando lat/lon a kilometros
   reales: 111 km por grado de latitud, y ese mismo grado de longitud
   se encoge con el coseno de la latitud segun te acercas a los polos.
   No hace falta que la rejilla sea perfecta, solo que cada celda mida
   aproximadamente lo mismo en cualquier punto del mapa. */
function celdaGeo(lat, lon) {
  const fila = Math.floor(lat * 111);
  const columna = Math.floor(lon * 111 * Math.cos((lat * Math.PI) / 180));
  return `${fila}:${columna}`;
}

/* Agrupa los puntos de partida por cercania -3 km de radio- en vez de
   comparar salida a salida: volver siempre al mismo garaje no debe
   contar como un origen nuevo cada vez. Nomada y Lejos de casa comparten
   este agrupamiento: al primero le interesa cuantos grupos hay, al
   segundo cual es el mas repetido (la "casa"). */
function agruparOrigenes(salidas, cache, radioM = 3000) {
  const grupos = [];
  (salidas || []).forEach((s) => {
    const inicio = cache?.[s.id]?.latlng?.[0];
    if (!inicio) return;
    const grupo = grupos.find((g) => distanciaGeo(g.centro, inicio) < radioM);
    if (grupo) grupo.veces += 1;
    else grupos.push({ centro: inicio, veces: 1 });
  });
  return grupos;
}

/*
  Catalogo de los 33 logros, agrupados por categoria. Cada entrada sabe
  su escala y como calcular su propio valor a partir de (salidas, cache,
  cfg) -las tres cosas que ya tiene toda la app-, pero no sabe nada de
  React: es una tabla de datos, no componentes. Eso permite calcular
  TODOS los logros de una vez en un unico useMemo (mas abajo, en
  Logros()) y usar el resultado tanto para pintar la categoria abierta
  como para el resumen de cabecera -rango medio, barra de % y radar-,
  sin repetir ninguna cuenta.
*/
const LOGROS_POR_CATEGORIA = {
  rodaje: [
    {
      id: 'ruta-unica', nombre: 'Ruta única', descripcion: 'Distancia recorrida en una sola salida.',
      escala: ESCALA_RUTA_UNICA,
      valor: (salidas) => (salidas?.length ? Math.max(...salidas.map(km)) : 0),
    },
    {
      id: 'volumen-semanal', nombre: 'Volumen semanal', descripcion: 'Distancia máxima recorrida en una semana.',
      escala: ESCALA_VOLUMEN_SEMANAL,
      valor: (salidas) => sumaMaximaPorClave(salidas, claveSemana),
    },
    {
      id: 'volumen-mensual', nombre: 'Volumen mensual', descripcion: 'Distancia máxima recorrida en un mes.',
      escala: ESCALA_VOLUMEN_MENSUAL,
      valor: (salidas) => sumaMaximaPorClave(salidas, claveMes),
    },
    {
      id: 'volumen-anual', nombre: 'Volumen anual', descripcion: 'Distancia máxima recorrida en un año.',
      escala: ESCALA_VOLUMEN_ANUAL,
      valor: (salidas) => sumaMaximaPorClave(salidas, claveAnio),
    },
    {
      id: 'dominguero', nombre: 'Dominguero', descripcion: 'Distancia máxima recorrida en un fin de semana.',
      escala: ESCALA_DOMINGUERO,
      valor: (salidas) => sumaMaximaPorClave(salidas, claveFinDeSemana),
    },
    {
      id: 'motor-diesel', nombre: 'Motor diesel', descripcion: 'Distancia máxima recorrida sin parones superiores a 3 minutos.',
      escala: ESCALA_MOTOR_DIESEL,
      valor: (salidas, cache) => {
        let max = 0;
        (salidas || []).forEach((s) => {
          const streams = cache?.[s.id];
          if (!streams) return;
          max = Math.max(max, distanciaSinParon(streams, km(s)));
        });
        return max;
      },
    },
    {
      id: 'odisea-historica', nombre: 'Odisea histórica', descripcion: 'Distancia recorrida en total, sumando todas tus salidas.',
      escala: ESCALA_ODISEA_HISTORICA,
      valor: (salidas) => (salidas || []).reduce((a, s) => a + km(s), 0),
    },
  ],
  montana: [
    {
      id: 'alpinista-dia', nombre: 'Alpinista de un día', descripcion: 'Desnivel positivo máximo acumulado en un día.',
      escala: ESCALA_ALPINISTA_DIA, unidad: 'm',
      valor: (salidas) => sumaMaximaPorClave(salidas, claveDia, (s) => s.desnivel),
    },
    {
      id: 'cazador-nubes', nombre: 'Cazador de nubes', descripcion: 'Desnivel positivo máximo acumulado en un mes.',
      escala: ESCALA_CAZADOR_NUBES, unidad: 'm',
      valor: (salidas) => sumaMaximaPorClave(salidas, claveMes, (s) => s.desnivel),
    },
    {
      id: 'cabra-montes', nombre: 'Cabra montés', descripcion: 'Desnivel positivo acumulado en total, sumando todas tus salidas.',
      escala: ESCALA_CABRA_MONTES, unidad: 'm',
      valor: (salidas) => (salidas || []).reduce((a, s) => a + s.desnivel, 0),
    },
    {
      id: 'tocar-cielo', nombre: 'Tocar el cielo', descripcion: 'Altitud máxima alcanzada en cualquier punto de una salida.',
      escala: ESCALA_TOCAR_CIELO, unidad: 'm', decimales: 0,
      valor: (salidas, cache) => {
        let max = 0;
        (salidas || []).forEach((s) => {
          const alt = cache?.[s.id]?.altitud;
          if (!alt || !alt.length) return;
          for (let i = 0; i < alt.length; i += 1) if (alt[i] > max) max = alt[i];
        });
        return max;
      },
    },
    {
      id: 'escalador-primera', nombre: 'Escalador de primera', descripcion: 'Puertos de 1ª categoría coronados.',
      escala: ESCALA_ESCALADOR_PRIMERA, unidad: '', decimales: 0,
      valor: (salidas, cache) => contarCoronaciones(salidas, cache, '1a'),
    },
    {
      id: 'fuera-categoria', nombre: 'Fuera de categoría', descripcion: 'Puertos fuera de categoría (HC) coronados.',
      escala: ESCALA_FUERA_DE_CATEGORIA, unidad: '', decimales: 0,
      valor: (salidas, cache) => contarCoronaciones(salidas, cache, 'hc'),
    },
  ],
  velocidad: [
    {
      id: 'rodador', nombre: 'Rodador', descripcion: 'Velocidad media en llano sostenida durante 15 km.',
      escala: ESCALA_RODADOR, unidad: 'km/h',
      valor: (salidas, cache, cfg, refTerreno) => mejorVelocidadLlano(salidas, 15, refTerreno),
    },
    {
      id: 'km-lisos-25', nombre: '25 km lisos', descripcion: 'Tiempo más rápido en recorrer 25 km en llano.',
      escala: ESCALA_KM_LISOS_25, distanciaKm: 25,
      valor: (salidas, cache, cfg, refTerreno) => mejorVelocidadLlano(salidas, 25, refTerreno),
    },
    {
      id: 'locomotora', nombre: 'Locomotora', descripcion: 'Velocidad media en llano sostenida durante 35 km.',
      escala: ESCALA_LOCOMOTORA, unidad: 'km/h',
      valor: (salidas, cache, cfg, refTerreno) => mejorVelocidadLlano(salidas, 35, refTerreno),
    },
    {
      id: 'km-lisos-50', nombre: '50 km lisos', descripcion: 'Tiempo más rápido en recorrer 50 km en llano.',
      escala: ESCALA_KM_LISOS_50, distanciaKm: 50,
      valor: (salidas, cache, cfg, refTerreno) => mejorVelocidadLlano(salidas, 50, refTerreno),
    },
    {
      id: 'tren-bala', nombre: 'Tren bala', descripcion: 'Velocidad media en llano sostenida durante 70 km.',
      escala: ESCALA_TREN_BALA, unidad: 'km/h',
      valor: (salidas, cache, cfg, refTerreno) => mejorVelocidadLlano(salidas, 70, refTerreno),
    },
    {
      id: 'km-lisos-100', nombre: '100 km lisos', descripcion: 'Tiempo más rápido en recorrer 100 km en llano.',
      escala: ESCALA_KM_LISOS_100, distanciaKm: 100,
      valor: (salidas, cache, cfg, refTerreno) => mejorVelocidadLlano(salidas, 100, refTerreno),
    },
    {
      id: 'sprinter', nombre: 'Sprinter', descripcion: 'Velocidad máxima sostenida en un tramo llano.',
      escala: ESCALA_SPRINTER, unidad: 'km/h',
      valor: (salidas, cache) => velocidadMaximaLlano(cache, salidas)?.valor ?? 0,
    },
    {
      id: 'potencia', nombre: 'Potencia', descripcion: 'Potencia media más alta en una salida completa.',
      escala: ESCALA_POTENCIA, unidad: 'W', decimales: 0,
      valor: (salidas, cache, cfg) => (salidas?.length && cfg ? Math.max(...salidas.map((s) => vatiosSalida(s, cfg))) : 0),
    },
  ],
  habitos: [
    {
      id: 'inquebrantable', nombre: 'Inquebrantable', descripcion: 'Racha más larga de días consecutivos saliendo.',
      escala: ESCALA_INQUEBRANTABLE, unidad: 'días', decimales: 0,
      valor: (salidas) => rachaMasLarga(salidas),
    },
    {
      id: 'madrugador', nombre: 'Madrugador', descripcion: 'Días saliendo antes de las 8:00 de la mañana.',
      escala: ESCALA_MADRUGADOR, unidad: 'días', decimales: 0,
      valor: (salidas) => {
        const dias = new Set();
        (salidas || []).forEach((s) => { if (new Date(s.fecha).getHours() < 8) dias.add(claveDia(s.fecha)); });
        return dias.size;
      },
    },
    {
      id: 'buho', nombre: 'Búho', descripcion: 'Días saliendo después de las 20:00 de la tarde.',
      escala: ESCALA_BUHO, unidad: 'días', decimales: 0,
      valor: (salidas) => {
        const dias = new Set();
        (salidas || []).forEach((s) => { if (new Date(s.fecha).getHours() >= 20) dias.add(claveDia(s.fecha)); });
        return dias.size;
      },
    },
    {
      id: 'finde-perfecto', nombre: 'Fin de semana perfecto', descripcion: 'Fines de semana con salida tanto el sábado como el domingo.',
      escala: ESCALA_FINDE_PERFECTO, unidad: '', decimales: 0,
      valor: (salidas) => findesPerfectos(salidas),
    },
    {
      id: 'racha-semanal', nombre: 'Racha semanal', descripcion: 'Semanas seguidas con al menos una salida.',
      escala: ESCALA_RACHA_SEMANAL, unidad: 'semanas', decimales: 0,
      valor: (salidas) => rachaSemanalMasLarga(salidas),
    },
    {
      id: 'ritmo-constante', nombre: 'Ritmo constante', descripcion: 'Meses distintos con cuatro salidas o más.',
      escala: ESCALA_RITMO_CONSTANTE, unidad: 'meses', decimales: 0,
      valor: (salidas) => mesesConMinimo(salidas, 4),
    },
  ],
  exploracion: [
    {
      id: 'viajero', nombre: 'Viajero', descripcion: 'Provincias distintas donde has empezado una salida.',
      escala: ESCALA_VIAJERO, unidad: '', decimales: 0,
      valor: (salidas, cache) => {
        const provincias = new Set();
        (salidas || []).forEach((s) => {
          const inicio = cache?.[s.id]?.latlng?.[0];
          if (!inicio) return;
          provincias.add(provinciaDe(inicio));
        });
        return provincias.size;
      },
    },
    {
      id: 'cartografo', nombre: 'Cartógrafo', descripcion: 'Kilómetros cuadrados de territorio distinto explorados.',
      escala: ESCALA_CARTOGRAFO, unidad: 'km²', decimales: 0,
      valor: (salidas, cache) => {
        const celdas = new Set();
        (salidas || []).forEach((s) => {
          const ll = cache?.[s.id]?.latlng;
          if (!ll) return;
          for (let i = 0; i < ll.length; i += 1) celdas.add(celdaGeo(ll[i][0], ll[i][1]));
        });
        return celdas.size;
      },
    },
    {
      id: 'nomada', nombre: 'Nómada', descripcion: 'Puntos de partida distintos, agrupados por cercanía.',
      escala: ESCALA_NOMADA, unidad: '', decimales: 0,
      valor: (salidas, cache) => agruparOrigenes(salidas, cache).length,
    },
    {
      id: 'lejos-de-casa', nombre: 'Lejos de casa', descripcion: 'Distancia en línea recta más lejos alcanzada desde tu punto de partida habitual.',
      escala: ESCALA_LEJOS_DE_CASA, unidad: 'km',
      valor: (salidas, cache) => {
        const grupos = agruparOrigenes(salidas, cache);
        if (!grupos.length) return 0;
        const casa = grupos.reduce((a, b) => (b.veces > a.veces ? b : a)).centro;
        let max = 0;
        (salidas || []).forEach((s) => {
          const ll = cache?.[s.id]?.latlng;
          if (!ll) return;
          for (let i = 0; i < ll.length; i += 1) {
            const d = distanciaGeo(casa, ll[i]) / 1000;
            if (d > max) max = d;
          }
        });
        return max;
      },
    },
  ],
  comunidad: [
    {
      id: 'grupeta', nombre: 'Grupeta', descripcion: 'Salidas con más de un ciclista.',
      escala: ESCALA_GRUPETA, unidad: '', decimales: 0,
      valor: (salidas) => (salidas || []).filter((s) => s.personas > 1).length,
    },
    {
      id: 'fotografo', nombre: 'Fotógrafo', descripcion: 'Salidas que incluyen alguna fotografía.',
      escala: ESCALA_FOTOGRAFO, unidad: '', decimales: 0,
      valor: (salidas) => (salidas || []).filter((s) => s.fotos > 0).length,
    },
    {
      id: 'popular', nombre: 'Popular', descripcion: 'Kudos acumulados en total, sumando todas tus salidas.',
      escala: ESCALA_POPULAR, unidad: '', decimales: 0,
      valor: (salidas) => (salidas || []).reduce((a, s) => a + (s.kudos || 0), 0),
    },
    {
      id: 'comentado', nombre: 'Comentado', descripcion: 'Comentarios recibidos en una sola salida.',
      escala: ESCALA_COMENTADO, unidad: '', decimales: 0,
      valor: (salidas) => (salidas?.length ? Math.max(...salidas.map((s) => s.comentarios || 0)) : 0),
    },
  ],
};

/*
  Aplana el catalogo y calcula el valor de los 33 logros de una vez,
  para (salidas, cache, cfg, refTerreno) dados. Es el mismo calculo que
  hacian por separado Logros() y TopLogros -cada uno con su propio
  bucle sobre LOGROS_POR_CATEGORIA-, ahora en un solo sitio para que no
  se puedan desincronizar. Tambien lo usa Dashboard para comparar el
  "antes" y el "despues" de una sincronizacion y montar el popup de
  logros actualizados (ver PopupLogrosActualizados, mas abajo).
*/
export function calcularLogros(salidas, cache, cfg, refTerreno) {
  const planos = [];
  Object.entries(LOGROS_POR_CATEGORIA).forEach(([categoria, lista]) => {
    lista.forEach((l) => {
      planos.push({ ...l, categoria, valor: l.valor(salidas, cache, cfg, refTerreno) });
    });
  });
  return planos;
}

/*
  Radar hexagonal: un eje por categoria, dibujado a mano en SVG -sin
  libreria de graficos, igual que el resto de Graficos.jsx-. Tres
  anillos de fondo marcan 33/66/100 % como referencia, y el poligono de
  datos usa --blue: es un dato agregado, no cromo de interfaz, asi que
  no toca --acento (ver la nota grande de mas arriba sobre por que las
  divisiones tampoco lo hacen).
*/
function RadarLogros({ categorias }) {
  const centro = 100;
  const radio = 74;
  const n = categorias.length;

  const punto = (i, r) => {
    const angulo = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [centro + r * Math.cos(angulo), centro + r * Math.sin(angulo)];
  };

  const anillo = (frac) => categorias.map((_, i) => punto(i, frac * radio).join(',')).join(' ');
  const datos = categorias.map((c, i) => punto(i, (Math.max(0, Math.min(100, c.puntuacion)) / 100) * radio));

  return (
    <svg viewBox="0 0 200 200" className="radar-logros" role="img" aria-label="Progreso por categoría">
      {[0.33, 0.66, 1].map((frac) => (
        <polygon key={frac} points={anillo(frac)} className="radar-anillo" />
      ))}
      {categorias.map((c, i) => {
        const [x, y] = punto(i, radio);
        return <line key={c.id} x1={centro} y1={centro} x2={x} y2={y} className="radar-eje" />;
      })}
      <polygon points={datos.map((p) => p.join(',')).join(' ')} className="radar-datos" />
      {datos.map(([x, y], i) => <circle key={categorias[i].id} cx={x} cy={y} r="2.6" className="radar-punto" />)}
      {categorias.map((c, i) => {
        const [x, y] = punto(i, radio + 20);
        return (
          <text key={c.id} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="radar-etiqueta">
            {c.nombre}
          </text>
        );
      })}
    </svg>
  );
}

/*
  Cabecera de presentacion: avatar del atleta, su rango general -la
  media de en que tramo de su escala esta cada uno de los 33 logros,
  redondeada sobre la misma escala de siete divisiones que usa cada
  tarjeta- con su barra de % del total, y el radar de al lado con el
  desglose por categoria. Vive encima de las pestañas: es el resumen,
  las pestañas son el detalle.
*/
function ResumenLogros({ atleta, resumen }) {
  const nivel = Math.round((resumen.global / 100) * 31);
  const rango = nivel > 0 ? ESCALA_RUTA_UNICA[nivel - 1] : null;
  const color = rango?.color ?? 'var(--line2)';

  return (
    <div className="panel resumen-logros">
      <div className="resumen-usuario">
        {atleta?.foto
          ? <img src={atleta.foto} alt="" className="resumen-avatar" />
          : <div className="resumen-avatar ini">{(atleta?.nombre || '?').charAt(0)}</div>}
        <div>
          <p className="eyebrow" style={{ margin: '0 0 4px' }}>Tu rango general</p>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color }}>
            {rango ? nombreTier(rango) : 'Todavía sin rango'}
          </p>
          <div className="bar" style={{ margin: '10px 0 0' }}>
            <i style={{ width: `${resumen.global}%`, background: color }} />
          </div>
          <p className="hint" style={{ margin: '6px 0 0' }}>
            {num(resumen.global, 0)} % del total de tus logros conseguido
          </p>
        </div>
      </div>

      <RadarLogros categorias={resumen.porCategoria} />
    </div>
  );
}

/*
  Los cinco logros donde el usuario va mas avanzado, de cualquier
  categoria, para pintar en Resumen. "Mas avanzado" es primero el
  numero de tramos ya conseguidos (0 a 31) y, a igualdad, el progreso
  dentro del tramo actual hacia el siguiente -asi dos logros en la
  misma division no quedan empatados sin mas.
*/
export function TopLogros({ salidas, cache, cfg, refTerreno }) {
  const mejores = useMemo(() => {
    const todos = calcularLogros(salidas, cache, cfg, refTerreno).map((l) => {
      const { actual, siguiente } = estadoEscala(l.escala, l.valor);
      const nivel = nivelesConseguidos(l.escala, l.valor);
      const pct = siguiente ? Math.min(100, (l.valor / siguiente.umbral) * 100) : 100;
      return { id: l.id, nombre: l.nombre, descripcion: l.descripcion, nivel, pct, actual };
    });
    return todos.sort((a, b) => (b.nivel - a.nivel) || (b.pct - a.pct)).slice(0, 5);
  }, [salidas, cache, cfg, refTerreno]);

  if (!mejores.length) return null;

  return (
    <div className="top-logros-grid">
      {mejores.map((m) => (
        <div className="top-logro" key={m.id} tabIndex={0}>
          <div className="insignia-circulo" style={{ '--c': m.actual ? m.actual.color : 'var(--line2)' }}>
            {m.actual ? (m.actual.sub ?? '★') : '—'}
          </div>
          <div>
            <p className="nombre">{m.nombre}</p>
            <p className="tier">{m.actual ? nombreTier(m.actual) : 'Todavía sin rango'}</p>
          </div>
          <p className="desc">{m.descripcion}</p>
        </div>
      ))}
    </div>
  );
}

/*
  Una tarjeta del carrusel del popup de logros actualizados: mismo
  vocabulario visual que TarjetaRango (insignia, nombre, descripcion,
  barra hacia el siguiente tramo) pero con dos anadidos propios de la
  comparacion antes/despues -el aviso de cuanto ha subido y el segundo
  tramo de la barra, en ocre, que pinta justo ese aumento.

  forwardRef porque el carrusel necesita el nodo de cada tarjeta para
  saber, con un IntersectionObserver, cual esta a la vista y llevar la
  cuenta "2 / 5" -ver PopupLogrosActualizados.
*/
const TarjetaPopupLogro = forwardRef(function TarjetaPopupLogro(
  { logro: {
    nombre, descripcion, escala, valorAntes, valorDespues,
    unidad: unidadRaw, decimales: decimalesRaw, distanciaKm: distanciaKmRaw,
  } },
  ref,
) {
  /* Mismos valores por defecto que TarjetaRango (ver su uso en
     Logros()): buena parte del catalogo no fija unidad/decimales
     porque "km" y un decimal ya son lo habitual. */
  const unidad = unidadRaw ?? 'km';
  const decimales = decimalesRaw ?? 1;
  const distanciaKm = distanciaKmRaw ?? 0;

  const { actual, siguiente } = estadoEscala(escala, valorDespues);
  const colorBarra = (actual ?? siguiente)?.color ?? 'var(--line2)';
  /* Denominador comun para las dos marcas de la barra: el umbral del
     siguiente tramo sin conseguir, o el del propio tramo maximo si ya
     no queda ninguno -asi "antes" y "despues" se leen sobre la misma
     regla en vez de saltar de escala a mitad de barra. */
  const denominador = siguiente ? siguiente.umbral : (actual?.umbral || valorDespues || 1);
  const pctDespues = Math.min(100, (valorDespues / denominador) * 100);
  const pctAntes = Math.min(pctDespues, Math.max(0, (valorAntes / denominador) * 100));

  const aumento = diferenciaValores(valorAntes, valorDespues, distanciaKm, unidad, decimales);
  const falta = diferenciaMagnitud(valorDespues, siguiente, distanciaKm, unidad, decimales);
  const total = siguiente
    ? formatoMagnitud(siguiente.umbral, distanciaKm, unidad, 0)
    : `${formatoMagnitud(actual?.umbral ?? 0, distanciaKm, unidad, 0)} · rango máximo`;

  return (
    <div className="popup-logro-card" ref={ref}>
      <div className="popup-logro-cabecera">
        <div className="insignia-circulo" style={{ '--c': actual ? actual.color : 'var(--line2)' }}>
          {actual ? (actual.sub ?? '★') : '—'}
        </div>
        <div>
          <p className="popup-logro-nombre">{nombre}</p>
          <p className="popup-logro-desc">{descripcion}</p>
        </div>
      </div>

      <div className="popup-logro-aumento">
        {aumento ? `+${aumento}` : 'Primera vez conseguido'}
      </div>

      <div className="bar-comparativa">
        <i className="base" style={{ width: `${pctAntes}%`, background: colorBarra }} />
        <i className="aumento" style={{ left: `${pctAntes}%`, width: `${Math.max(0, pctDespues - pctAntes)}%` }} />
      </div>

      <p className="popup-logro-note">
        {formatoMagnitud(valorDespues, distanciaKm, unidad, decimales, false)} / {total}
      </p>
      {falta && <p className="popup-logro-falta">Faltan {falta} para el siguiente nivel</p>}
    </div>
  );
});

/*
  Popup que aparece al pulsar "Actualizar" cuando la sincronizacion trae
  actividad nueva de verdad y esa actividad hace subir el valor de algun
  logro -suba o no de division: ver el filtro en Dashboard.sincronizar,
  que es quien decide que logros entran aqui y calcula valorAntes /
  valorDespues de cada uno.

  El propio popup no sabe nada de Strava ni de sincronizacion: solo
  pinta la lista que le llega, un logro por tarjeta, en un carrusel
  vertical con scroll-snap. El contador "2 / 5" y las flechas de arriba
  y abajo son la misma cosa vista de otras dos formas -el
  IntersectionObserver actualiza el contador al arrastrar a mano, y las
  flechas usan scrollIntoView para moverse una tarjeta cada vez-, asi
  que nunca deberian desincronizarse entre si.
*/
export function PopupLogrosActualizados({ logros, onCerrar }) {
  const [indice, setIndice] = useState(0);
  const contRef = useRef(null);
  const tarjetasRef = useRef([]);

  /* Fondo bloqueado mientras el popup esta abierto, igual que el cajon
     de navegacion movil en Layout. */
  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previo; };
  }, []);

  useEffect(() => {
    const alPulsar = (e) => { if (e.key === 'Escape') onCerrar(); };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [onCerrar]);

  /* Que tarjeta esta "a la vista" para el contador, tambien cuando el
     usuario mueve el carrusel a mano (rueda del raton, arrastre tactil)
     en vez de con las flechas. */
  useEffect(() => {
    const cont = contRef.current;
    if (!cont) return;
    const obs = new IntersectionObserver((entradas) => {
      entradas.forEach((e) => {
        if (e.isIntersecting && e.intersectionRatio > 0.6) {
          const i = tarjetasRef.current.indexOf(e.target);
          if (i !== -1) setIndice(i);
        }
      });
    }, { root: cont, threshold: [0.6] });
    tarjetasRef.current.forEach((n) => n && obs.observe(n));
    return () => obs.disconnect();
  }, [logros.length]);

  const irA = (i) => {
    const acotado = Math.max(0, Math.min(logros.length - 1, i));
    tarjetasRef.current[acotado]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (!logros.length) return null;

  return (
    <div className="popup-velo" onClick={onCerrar}>
      <div className="popup-logros" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true"
        aria-label="Logros actualizados">
        <button type="button" className="popup-cerrar" onClick={onCerrar} aria-label="Cerrar">
          <IcoCerrar />
        </button>

        <p className="popup-titulo">¡Progreso en tus logros!</p>
        <p className="popup-subtitulo">
          {logros.length === 1
            ? 'Un logro ha avanzado con tu última sincronización.'
            : `${logros.length} logros han avanzado con tu última sincronización.`}
        </p>

        <div className="popup-carrusel" ref={contRef}>
          {logros.map((l, i) => (
            <TarjetaPopupLogro key={l.id} logro={l} ref={(n) => { tarjetasRef.current[i] = n; }} />
          ))}
        </div>

        {logros.length > 1 && (
          <div className="popup-nav">
            <button type="button" onClick={() => irA(indice - 1)} disabled={indice === 0} aria-label="Logro anterior">
              <IcoFlecha style={{ transform: 'rotate(180deg)' }} />
            </button>
            <span className="popup-contador">{indice + 1} / {logros.length}</span>
            <button type="button" onClick={() => irA(indice + 1)} disabled={indice === logros.length - 1}
              aria-label="Siguiente logro">
              <IcoFlecha />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/*
  Panel de insignias por conseguir, en forma de acordeon: cada boton de
  categoria despliega su rejilla de logros debajo y cierra las demas -
  volver a pulsar la que ya esta abierta la cierra-. Encima va el
  resumen general, calculado sobre los 33 logros de las seis
  categorias a la vez para que el rango medio y el radar no dependan de
  cual este desplegada en cada momento.
*/
export default function Logros({ salidas, cache, cfg, atleta, refTerreno }) {
  const [cat, setCat] = useState('rodaje');

  const resultados = useMemo(() => {
    const planos = calcularLogros(salidas, cache, cfg, refTerreno);
    const out = {};
    Object.keys(LOGROS_POR_CATEGORIA).forEach((id) => {
      out[id] = planos.filter((l) => l.categoria === id);
    });
    return out;
  }, [salidas, cache, cfg, refTerreno]);

  const resumen = useMemo(() => {
    const porCategoria = CATEGORIAS.map(([id, nombre]) => {
      const lista = resultados[id] || [];
      const puntuacion = lista.length
        ? lista.reduce((a, l) => a + nivelesConseguidos(l.escala, l.valor), 0) / lista.length / 31 * 100
        : 0;
      return { id, nombre, puntuacion };
    });
    const global = porCategoria.length
      ? porCategoria.reduce((a, c) => a + c.puntuacion, 0) / porCategoria.length
      : 0;
    return { porCategoria, global };
  }, [resultados]);

  return (
    <div>
      <div className="top">
        <div>
          <h1>
            <button type="button" className="titulo-clic" style={{ outline: 'none' }} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              <IcoLogros className="icono-titulo" />
              LOGROS
            </button>
          </h1>
        </div>
      </div>

      <ResumenLogros atleta={atleta} resumen={resumen} />

      <nav className="logros-categorias" aria-label="Categorías de logros">
        {CATEGORIAS.map(([id, txt, Icono]) => (
          <button key={id} aria-selected={cat === id} onClick={() => setCat(id)}>
            <Icono />
            {txt}
          </button>
        ))}
      </nav>

      {cat && (
        <div className="logros-grid">
          {resultados[cat].map((l) => (
            <TarjetaRango key={l.id} nombre={l.nombre} descripcion={l.descripcion}
              escala={l.escala} valor={l.valor} unidad={l.unidad ?? 'km'} decimales={l.decimales ?? 1}
              distanciaKm={l.distanciaKm ?? 0} />
          ))}
        </div>
      )}
    </div>
  );
}
