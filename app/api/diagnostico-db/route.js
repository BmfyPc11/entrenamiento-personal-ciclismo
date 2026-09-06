import { NextResponse } from 'next/server';

/*
  Ruta de diagnostico TEMPORAL -borrar en cuanto se resuelva el bug de
  segmentos_manuales que no persisten en produccion. Sin sesion ni datos
  sensibles: solo el host de DATABASE_URL (nunca usuario/contrasena), para
  poder confirmar desde fuera a que base de datos esta conectado el
  servidor de verdad, sin depender de comparar variables de entorno a
  ciegas.
*/
export const dynamic = 'force-dynamic';

export async function GET() {
  let host = null;
  try {
    host = new URL(process.env.DATABASE_URL).host;
  } catch {
    host = 'DATABASE_URL no es una URL valida o no esta definida';
  }
  return NextResponse.json({ host });
}
