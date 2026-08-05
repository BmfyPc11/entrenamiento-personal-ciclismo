import './globals.css';

export const metadata = {
  title: 'Cuaderno de ruta',
  description: 'Analisis de entrenamiento en bicicleta a partir de tus datos de Strava',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
