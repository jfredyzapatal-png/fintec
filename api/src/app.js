/* Ensamblado de la aplicacion Express 5. */

import express from 'express';
import { pool } from './db.js';
import { rutasAuth } from './routes/auth.js';
import { rutasCuenta } from './routes/cuenta.js';
import { rutasAdmin } from './routes/admin.js';
import { rutasContable } from './routes/contable.js';
import { manejadorErrores, noEncontrado404 } from './middleware/errores.js';

export function crearApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  // CORS minimo para que el front (otro origen en desarrollo) consuma la API
  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  /* Health check SIN autenticacion. El blueprint de despliegue
     declara healthCheckPath: /api/health, asi que esta ruta debe
     existir y responder 200 o todos los despliegues se marcan como
     fallidos. Responde 200 aunque la base no conteste: informa del
     estado de la conexion en el cuerpo, no con el codigo HTTP. */
  app.get('/api/health', async (_req, res) => {
    let bd = 'desconocida';
    try {
      await pool.query('SELECT 1');
      bd = 'conectada';
    } catch {
      bd = 'sin conexión';
    }
    res.status(200).json({ ok: true, servicio: 'fintec-api', bd });
  });

  // alias historico
  app.get('/api/salud', (_req, res) => res.json({ ok: true, servicio: 'fintec-api' }));

  app.use('/api/auth', rutasAuth);
  app.use('/api', rutasCuenta);
  app.use('/api/admin', rutasAdmin);
  app.use('/api/contable', rutasContable);

  app.use(noEncontrado404);
  app.use(manejadorErrores);

  return app;
}
