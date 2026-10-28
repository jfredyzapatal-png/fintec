/* Arranque del servidor. */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { crearApp } from './app.js';
import { config, verificarConfig } from './config.js';
import { pool, cerrarPool } from './db.js';

verificarConfig();

const app = crearApp();
const aqui = dirname(fileURLToPath(import.meta.url));

/* La migracion de ajustes es aditiva: agrega meta, alertas leidas y
   cuentas de pago sin borrar saldos. Se aplica en cada arranque para
   que un deploy no quede con el codigo nuevo y la base vieja. */
async function aplicarAjustes() {
  const sql = await readFile(join(aqui, '../db/schema_ajustes.sql'), 'utf8');
  await pool.query(sql);
  console.log('[fintec-api] base al día: metas, alertas leídas y cuentas de pago');
}

/* 0.0.0.0: Render no detecta el puerto si el proceso escucha solo
   en 127.0.0.1. En local sigue siendo alcanzable por localhost. */
let servidor;
aplicarAjustes()
  .catch((e) => console.error('[fintec-api] no se pudieron aplicar los ajustes:', e.message))
  .finally(() => {
    servidor = app.listen(config.port, '0.0.0.0', () => {
      console.log(`[fintec-api] escuchando en http://0.0.0.0:${config.port} (${config.entorno})`);
    });
  });

async function apagar(senal) {
  console.log(`\n[fintec-api] ${senal} recibido, cerrando...`);
  const cerrar = async () => {
    await cerrarPool();
    process.exit(0);
  };
  if (!servidor) { await cerrar(); return; }
  servidor.close(cerrar);
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGINT', () => apagar('SIGINT'));
process.on('SIGTERM', () => apagar('SIGTERM'));
