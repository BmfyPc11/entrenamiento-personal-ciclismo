/*
  Lista las tablas de una base, cuenta filas de las principales y detalla
  los atletas y cuantas salidas tiene cada uno.
  Uso:  node scripts/inspeccionar-base.mjs "postgresql://.../neondb?sslmode=require"
*/
import pg from 'pg';

const cs = process.argv[2] || process.env.DATABASE_URL;
if (!cs) {
  console.error('Falta la connection string como argumento.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: cs, ssl: { rejectUnauthorized: false } });

try {
  const meta = await pool.query('SELECT current_database() AS db');
  console.log('Base:', meta.rows[0].db);

  const t = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' ORDER BY table_name`
  );
  const tablas = t.rows.map((r) => r.table_name);
  console.log('\nTablas:', tablas.join(', ') || '(ninguna)');

  console.log('\nFilas:');
  for (const nombre of ['salidas', 'streams', 'segmentos_manuales', 'logros', 'atletas', 'puertos_hechos']) {
    if (!tablas.includes(nombre)) { console.log(`  ${nombre}: (no existe)`); continue; }
    const c = await pool.query(`SELECT count(*)::int AS n FROM ${nombre}`);
    console.log(`  ${nombre}: ${c.rows[0].n}`);
  }

  if (tablas.includes('atletas')) {
    const a = await pool.query('SELECT id, nombre FROM atletas ORDER BY nombre');
    console.log('\nAtletas:');
    for (const r of a.rows) {
      const s = await pool.query('SELECT count(*)::int AS n, max(fecha) AS ultima FROM salidas WHERE athlete_id = $1', [r.id]);
      const p = tablas.includes('puertos_hechos')
        ? (await pool.query('SELECT count(*)::int AS n FROM puertos_hechos WHERE athlete_id = $1', [r.id])).rows[0].n
        : '-';
      console.log(`  ${r.id}  ${r.nombre || '(sin nombre)'}  -> salidas: ${s.rows[0].n}, ultima: ${s.rows[0].ultima || '-'}, puertos_hechos: ${p}`);
    }
  }

  const huerfanas = await pool.query(
    `SELECT athlete_id, count(*)::int AS n FROM salidas
     WHERE athlete_id NOT IN (SELECT id FROM atletas)
     GROUP BY athlete_id`
  );
  if (huerfanas.rows.length) {
    console.log('\nSalidas de athlete_id que NO estan en atletas:');
    huerfanas.rows.forEach((r) => console.log(`  ${r.athlete_id}: ${r.n}`));
  }
} catch (e) {
  console.error('ERROR:', e.message);
  process.exit(1);
} finally {
  await pool.end();
}
