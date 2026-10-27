/* Arranque del servidor. */

import { crearApp } from './app.js';
import { config, verificarConfig } from './config.js';
import { pool, cerrarPool } from './db.js';

verificarConfig();

const app = crearApp();

/* 0.0.0.0: Render no detecta el puerto si el proceso escucha solo
   en 127.0.0.1. En local sigue siendo alcanzable por localhost. */
const servidor = app.listen(config.port, '0.0.0.0', () => {
  console.log(`[fintec-api] escuchando en http://0.0.0.0:${config.port} (${config.entorno})`);
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
