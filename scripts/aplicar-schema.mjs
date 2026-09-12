/*
  Aplica schema.sql a la base que se le pase por argumento (o por DATABASE_URL).
  Uso:
    node scripts/aplicar-schema.mjs "postgresql://usuario:pass@host/neondb?sslmode=require"

  schema.sql es idempotente (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT
  EXISTS), asi que se puede reejecutar sin romper nada. Pensado para migrar
  la base de produccion cuando el schema cambia y no hay migraciones
  automaticas en el proyecto.
*/
import pg from 'pg';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/* La connection string sale, por orden: del argumento, de DATABASE_URL en el
   entorno, o de un archivo .env que haya dejado `vercel env pull` (busca
   DATABASE_URL= dentro, con o sin comillas). */
function desdeArchivoEnv() {
  for (const f of ['.env.vercel', '.env.production.local', '.env.local']) {
    const ruta = join(raizProyecto, f);
    if (!existsSync(ruta)) continue;
    const m = readFileSync(ruta, 'utf8').match(/^DATABASE_URL\s*=\s*["']?([^"'\r\n]+)["']?\s*$/m);
    if (m) return m[1];
  }
  return null;
}

const raizProyecto = join(dirname(fileURLToPath(import.meta.url)), '..');
const cs = process.argv[2] || process.env.DATABASE_URL || desdeArchivoEnv();
if (!cs) {
  console.error('Falta la connection string. Pasala como argumento, en DATABASE_URL, o');
  console.error('deja un .env.vercel con "vercel env pull .env.vercel --environment=production".');
  process.exit(1);
}

const sql = readFileSync(join(raizProyecto, 'schema.sql'), 'utf8');

const pool = new pg.Pool({ connectionString: cs, ssl: { rejectUnauthorized: false } });

try {
  const meta = await pool.query('SELECT current_database() AS db, inet_server_addr() AS host');
  console.log('Conectado a:', meta.rows[0]);

  await pool.query(sql);

  const check = await pool.query(`
    SELECT to_regclass('public.atletas')        IS NOT NULL AS t_atletas,
           to_regclass('public.puertos_hechos') IS NOT NULL AS t_puertos_hechos,
           EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'segmentos_manuales' AND column_name = 'actualizado') AS c_actualizado,
           EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'streams' AND column_name = 'puertos_calc') AS c_puertos_calc
  `);
  console.log('Estado tras aplicar:', check.rows[0]);
  console.log('OK');
} catch (e) {
  console.error('ERROR:', e.message);
  process.exit(1);
} finally {
  await pool.end();
}
