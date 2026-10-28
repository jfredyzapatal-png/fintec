/* npm run migrate:ajustes
 *
 * Aplica db/schema_ajustes.sql. Es ADITIVO e IDEMPOTENTE: se puede
 * correr sobre una base ya en uso sin perder saldos ni movimientos.
 * Habilita la meta de los bolsillos, la marca de alerta leida y las
 * cuentas de pago guardadas.
 *
 * Uso:
 *   npm run migrate:ajustes
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool, cerrarPool } from '../src/db.js';
import { verificarConfig } from '../src/config.js';

const aqui = dirname(fileURLToPath(import.meta.url));

async function main() {
  verificarConfig();
  const sql = await readFile(join(aqui, 'schema_ajustes.sql'), 'utf8');
  console.log('[migrate:ajustes] aplicando schema_ajustes.sql ...');
  await pool.query(sql);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM cuentas_pago');
  console.log(`[migrate:ajustes] listo. cuentas de pago registradas: ${rows[0].n}`);
}

main()
  .catch((e) => {
    console.error('[migrate:ajustes] falló:', e.message);
    process.exitCode = 1;
  })
  .finally(cerrarPool);
