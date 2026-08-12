import './globals.css';

/*
  Metadatos de PWA: sin esto, "Anadir a pantalla de inicio" en el movil
  crea un simple acceso directo al navegador, con su barra de
  direcciones y sus botones alrededor. Con el manifest y los iconos, se
  instala como una app de verdad -pantalla completa, icono propio- y
  ademas queda barra de estado y tema del propio color del panel.

  No hay service worker a proposito: esta app no tiene nada que ofrecer
  sin conexion, cada pantalla depende de datos en directo de Strava.
  Un service worker que solo cachea el cascaron sin poder mostrar datos
  reales seria complejidad sin beneficio.
*/
export const metadata = {
  title: 'Cuaderno de ruta',
  description: 'Analisis de entrenamiento en bicicleta a partir de tus datos de Strava',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'Cuaderno',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

export const viewport = {
  themeColor: '#08090C',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
