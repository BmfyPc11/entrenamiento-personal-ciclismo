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

/* Entrenamientos: el perfil de una salida. */
export const IcoEntrenamientos = (p) => (
  <svg {...base} {...p}>
    <path d="M3 18l4.5-7 3.5 4L15 8l6 10" />
    <path d="M3 21h18" />
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
