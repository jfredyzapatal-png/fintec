/* Arranque del servidor. */

import { crearApp } from './app.js';
import { config, verificarConfig } from './config.js';
import { pool, cerrarPool } from './db.js';

verificarConfig();

const app = crearApp();

const servidor = app.listen(config.port, () => {
  console.log(`[fintec-api] escuchando en http://localhost:${config.port} (${config.entorno})`);
});

/* Comprobacion de conectividad: si la base no responde se avisa pero
   no se tumba el proceso, para que el error se vea tambien por HTTP. */
pool.query('SELECT 1')
  .then(() => console.log('[fintec-api] conexión a PostgreSQL verificada'))
  .catch((e) => console.error('[fintec-api] NO hay conexión a PostgreSQL:', e.message));

async function apagar(senal) {
  console.log(`\n[fintec-api] ${senal} recibido, cerrando...`);
  servidor.close(async () => {
    await cerrarPool();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGINT', () => apagar('SIGINT'));
process.on('SIGTERM', () => apagar('SIGTERM'));
