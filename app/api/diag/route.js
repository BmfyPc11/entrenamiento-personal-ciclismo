import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

/* TEMPORAL: diagnostico de la conexion a la base en produccion. NO expone
   usuario ni contrasena -solo el host- ni datos de nadie, solo el estado
   del esquema y unos conteos. Borrar en cuanto se resuelva el problema
   de despliegue de la pestana Amigos. */
export async function GET() {
  let host = null;
  try { host = new URL(process.env.DATABASE_URL).host; } catch {}

  const out = { host, tieneDatabaseUrl: Boolean(process.env.DATABASE_URL) };
  try {
    const meta = await pool.query(`
      SELECT current_database() AS db,
        to_regclass('public.atletas')        IS NOT NULL AS t_atletas,
        to_regclass('public.puertos_hechos') IS NOT NULL AS t_puertos_hechos,
        EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'segmentos_manuales' AND column_name = 'actualizado') AS c_actualizado,
        EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'streams' AND column_name = 'puertos_calc') AS c_puertos_calc
    `);
    Object.assign(out, meta.rows[0]);

    const sal = await pool.query('SELECT count(*)::int AS n FROM salidas');
    out.n_salidas = sal.rows[0].n;
    if (out.t_atletas) {
      const a = await pool.query('SELECT count(*)::int AS n FROM atletas');
      out.n_atletas = a.rows[0].n;
    }
  } catch (e) {
    out.error = String(e?.message || e);
  }
  return NextResponse.json(out);
}
