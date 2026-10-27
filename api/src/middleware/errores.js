/* Manejo central de errores y 404. Nunca se filtra el stack ni el
   detalle de SQL al cliente. */

import { ErrorApp } from '../lib/errores.js';

export function noEncontrado404(req, res) {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
}

export function manejadorErrores(err, _req, res, _next) {
  if (err instanceof ErrorApp) {
    return res.status(err.estado).json({ error: err.message, ...err.extra });
  }

  // JSON malformado en el body
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la petición no es JSON válido.' });
  }

  // Violaciones de restricciones de PostgreSQL: se traducen a 409/400
  // para no exponer nombres internos de tablas.
  const codigosPg = {
    23505: [409, 'Ese registro ya existe.'],
    23503: [409, 'El registro referenciado no existe.'],
    23514: [400, 'La operación viola una restricción del modelo de datos.'],
    40001: [409, 'Conflicto de concurrencia. Vuelve a intentarlo.'],
    '40P01': [409, 'Conflicto de concurrencia (deadlock). Vuelve a intentarlo.'],
  };
  if (err?.code && codigosPg[err.code]) {
    const [estado, mensaje] = codigosPg[err.code];
    console.error(`[pg ${err.code}] ${err.message}`);
    return res.status(estado).json({ error: mensaje });
  }

  console.error('[error no controlado]', err);
  return res.status(500).json({ error: 'Error interno del servidor.' });
}
