/*
  Iconos de la navegacion.

  Van dibujados a mano y no traidos de una libreria: son ocho piezas y
  cualquier paquete de iconos pesaria mas que esto entero. Todos comparten
  la misma rejilla de 24, trazo de 1,5 y currentColor, de modo que heredan
  el color de la seccion activa sin tener que pasarles nada.
*/

const base = {
  width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.5,
  strokeLinecap: 'round', strokeLinejoin: 'round',
};

/* Resumen: rejilla de bloques, la vista general. */
export const IcoResumen = (p) => (
  <svg {...base} {...p}>
    <rect x="3" y="3" width="7" height="8" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="11" width="7" height="10" rx="1.5" />
  </svg>
);

/* Tus datos: la persona y sus constantes. */
export const IcoDatos = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M4.5 20c.7-3.6 3.8-5.5 7.5-5.5s6.8 1.9 7.5 5.5" />
  </svg>
);

/* Actividades: la bicicleta, cada actividad es una salida en ella. */
export const IcoActividades = (p) => (
  <svg {...base} {...p}>
    <circle cx="5.5" cy="17" r="3.4" />
    <circle cx="18.5" cy="17" r="3.4" />
    <path d="M5.5 17l4-9h3l-2 4h3.5l4.5 5" />
    <path d="M9.5 8h4" />
  </svg>
);

/* Mis ascensiones: una cima con su bandera. */
export const IcoAscensiones = (p) => (
  <svg {...base} {...p}>
    <path d="M3 20l6-11 4 6.5 2.5-4L21 20z" />
    <path d="M12 9V3.5" />
    <path d="M12 4l4 1.5L12 7" />
  </svg>
);

/* Carga y forma: la onda de la condicion en el tiempo. */
export const IcoCarga = (p) => (
  <svg {...base} {...p}>
    <path d="M3 15c2.5 0 3-6 5.5-6S11 17 13.5 17 16 7 18.5 7 21 11 21 11" />
  </svg>
);

/* Objetivos: la diana. */
export const IcoObjetivos = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r=".9" fill="currentColor" stroke="none" />
  </svg>
);

/* Rutas: el trazado con su punto de partida. */
export const IcoRutas = (p) => (
  <svg {...base} {...p}>
    <path d="M6.5 20c0-4 4-4 4-8s-4-4-4-8" />
    <path d="M10.5 4h4a3 3 0 0 1 0 6h-1" />
    <circle cx="17.5" cy="17" r="2.5" />
    <path d="M13 20h2" />
  </svg>
);

/* Analizar GPX: el archivo que se sube. */
export const IcoGPX = (p) => (
  <svg {...base} {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
    <path d="M8.5 16l2-3 1.6 2 2.4-4" />
  </svg>
);

/* Logros: la medalla con su cinta. */
export const IcoLogros = (p) => (
  <svg {...base} {...p}>
    <path d="M8 3l2.5 6.5M16 3l-2.5 6.5" />
    <circle cx="12" cy="14.5" r="6.5" />
    <path d="M12 11.2l1.1 2.3 2.5.4-1.8 1.8.4 2.5-2.2-1.2-2.2 1.2.4-2.5-1.8-1.8 2.5-.4z" />
  </svg>
);

/* Mapa: el pin de ubicacion, para el boton que muestra el trazado. */
export const IcoMapa = (p) => (
  <svg {...base} {...p}>
    <path d="M12 21s7-7.5 7-12a7 7 0 1 0-14 0c0 4.5 7 12 7 12z" />
    <circle cx="12" cy="9" r="2.3" />
  </svg>
);

/* Restablecer: flecha circular, para volver el zoom del mapa a su ajuste
   inicial. */
export const IcoRestablecer = (p) => (
  <svg {...base} {...p}>
    <path d="M4 12a8 8 0 1 1 2.5 5.8" />
    <path d="M4 17v-5h5" />
  </svg>
);

/* Flecha hacia abajo: abre un desplegable. Gira 180 grados desde CSS
   cuando el desplegable esta abierto, asi que solo hace falta este
   sentido -no una pareja arriba/abajo-. */
export const IcoFlecha = (p) => (
  <svg {...base} {...p}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

/* Flechita horizontal: "de esta división a la siguiente". */
export const IcoFlechaDerecha = (p) => (
  <svg {...base} {...p}>
    <path d="M5 12h13M13 6l6 6-6 6" />
  </svg>
);

/* Triangulo relleno hacia arriba: cuanto le falta al usuario para subir
   de division. Solido en vez de trazo -distinto del resto de iconos-
   porque a este tamano un trazo de 1,5 apenas se distingue del hueco. */
export const IcoTriangulo = (p) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M12 5l8 14H4z" />
  </svg>
);

/* ---------- categorias de logros ---------- */

/* Rodaje: la bicicleta, sin ciclista -mas legible a este tamano. */
export const IcoRodaje = (p) => (
  <svg {...base} {...p}>
    <circle cx="5.5" cy="17.5" r="3.5" />
    <circle cx="18.5" cy="17.5" r="3.5" />
    <path d="M12 17.5V14l-3-3 4-3 2 3h2.5" />
    <circle cx="15" cy="5" r="1.3" fill="currentColor" stroke="none" />
  </svg>
);

/* Velocidad: el cuentakilometros con la aguja alta. */
export const IcoVelocidad = (p) => (
  <svg {...base} {...p}>
    <path d="M4 16a8 8 0 1 1 16 0" />
    <path d="M12 16l4-5" />
    <circle cx="12" cy="16" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);

/* Habitos: la llama de la racha que no se apaga. */
export const IcoHabitos = (p) => (
  <svg {...base} {...p}>
    <path d="M12 3c2 3 5 6 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4-.3 1.6.5 2.6 1.5 2.6S12 10 11 8c-1-2 0-4 1-5z" />
  </svg>
);

/* Exploracion: el mapa plegado. */
export const IcoExploracion = (p) => (
  <svg {...base} {...p}>
    <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
    <path d="M9 4v14M15 6v14" />
  </svg>
);

/* Comunidad: el grupo, no una sola persona. */
export const IcoComunidad = (p) => (
  <svg {...base} {...p}>
    <circle cx="8.3" cy="8" r="3" />
    <circle cx="17" cy="9.2" r="2.5" />
    <path d="M2.5 20c.6-3.4 3-5.2 5.8-5.2s5.2 1.8 5.8 5.2" />
    <path d="M14.7 20c.4-2.6 1.8-4.2 3.6-4.2s3.2 1.4 3.6 4.2" />
  </svg>
);

/* Menu de hamburguesa, solo para abrir el cajon en movil. */
export const IcoMenu = (p) => (
  <svg {...base} {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

export const IcoCerrar = (p) => (
  <svg {...base} {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

/* Expandir: las cuatro esquinas abriendose, para pasar un grafico a
   pantalla completa. */
export const IcoExpandir = (p) => (
  <svg {...base} {...p}>
    <path d="M4 9V4h5" />
    <path d="M20 9V4h-5" />
    <path d="M4 15v5h5" />
    <path d="M20 15v5h-5" />
  </svg>
);

/* Aviso: el triangulo de precaucion, para avisos junto a un callout. */
export const IcoAviso = (p) => (
  <svg {...base} {...p}>
    <path d="M12 3.5 21.5 20h-19z" />
    <path d="M12 9.5v5" />
    <circle cx="12" cy="17.3" r=".9" fill="currentColor" stroke="none" />
  </svg>
);
