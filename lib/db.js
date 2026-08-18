import pg from 'pg';

const { Pool, types } = pg;

// Postgres devuelve las columnas NUMERIC como strings por defecto (para no
// perder precisión con floats). Aquí forzamos que se parseen como números,
// que es lo que espera todo el codigo del panel (sumas, restas, graficas...).
// OID 1700 = tipo "numeric" en Postgres.
types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val)));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

export default pool;
