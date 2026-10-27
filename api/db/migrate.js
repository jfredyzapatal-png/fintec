/* npm run migrate — aplica db/schema.sql completo.
   OJO: schema.sql hace DROP TABLE de las cuatro tablas, asi que
   recrea la base desde cero. Es lo apropiado para un proyecto
   academico con datos de demostracion. */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool, cerrarPool } from '../src/db.js';
import { verificarConfig } from '../src/config.js';

const aqui = dirname(fileURLToPath(import.meta.url));

async function main() {
  verificarConfig();
  const sql = await readFile(join(aqui, 'schema.sql'), 'utf8');
  console.log('[migrate] aplicando db/schema.sql ...');
  await pool.query(sql);
  console.log('[migrate] listo: usuarios, bolsillos, movimientos, alertas');
}

main()
  .catch((e) => {
    console.error('[migrate] falló:', e.message);
    process.exitCode = 1;
  })
  .finally(cerrarPool);
