/* npm run migrate:creditos
 *
 * Aplica db/schema_creditos.sql. Es ADITIVO e IDEMPOTENTE: se puede
 * correr sobre una base ya en produccion sin perder datos. Habilita
 * la tabla 'creditos' y permite el tipo 'Crédito' en movimientos.
 *
 * Uso en Render (o cualquier entorno):
 *   DATABASE_URL="postgresql://..." npm run migrate:creditos
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool, cerrarPool } from '../src/db.js';
import { verificarConfig } from '../src/config.js';

const aqui = dirname(fileURLToPath(import.meta.url));

async function main() {
  verificarConfig();
  const sql = await readFile(join(aqui, 'schema_creditos.sql'), 'utf8');
  console.log('[migrate:creditos] aplicando schema_creditos.sql ...');
  await pool.query(sql);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM creditos');
  console.log(`[migrate:creditos] listo. creditos existentes: ${rows[0].n}`);
}

main()
  .catch((e) => {
    console.error('[migrate:creditos] falló:', e.message);
    process.exitCode = 1;
  })
  .finally(cerrarPool);
