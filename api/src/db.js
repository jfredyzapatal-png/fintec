/* ============================================================
   Pool de conexiones y helper de transacciones.

   `enTransaccion` es la pieza critica del backend: toda operacion
   que mueve dinero se ejecuta dentro de BEGIN/COMMIT y bloquea las
   filas implicadas con SELECT ... FOR UPDATE. Si algo falla se hace
   ROLLBACK y ningun saldo queda a medias. Esto es lo que el
   prototipo en memoria no podia garantizar.
   ============================================================ */

import pg from 'pg';
import { config } from './config.js';

/* pg devuelve NUMERIC como string para no perder precision. Aqui el
   dominio son pesos colombianos enteros, asi que se convierte a
   Number de forma explicita y centralizada. */
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => (v === null ? null : Number(v)));

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[db] error en cliente idle del pool:', err.message);
});

/* Consulta suelta, sin transaccion. Solo para lecturas. */
export function query(texto, params) {
  return pool.query(texto, params);
}

/* Ejecuta `fn(cliente)` dentro de una transaccion.
   fn recibe el cliente dedicado: TODAS las consultas de la operacion
   deben usar ese cliente, nunca `query` del modulo, o quedarian fuera
   de la transaccion. */
export async function enTransaccion(fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (e) {
    try {
      await cliente.query('ROLLBACK');
    } catch (errRollback) {
      console.error('[db] fallo el ROLLBACK:', errRollback.message);
    }
    throw e;
  } finally {
    cliente.release();
  }
}

export async function cerrarPool() {
  await pool.end();
}
