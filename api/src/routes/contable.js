/* Rutas del contable (RF-08). Solo GET: RN-06, es un rol de
   solo lectura.

   El rol se exige por ruta (no en el router) porque el historial
   global lo consultan tanto el contable como el administrador. */

import { Router } from 'express';
import { requiereAuth } from '../middleware/auth.js';
import { requiereRol, requierePermiso, soloLecturaContable } from '../middleware/roles.js';
import * as contable from '../services/contable.js';

export const rutasContable = Router();
rutasContable.use(requiereAuth, soloLecturaContable);

/* GET /api/contable/resumen?desde&hasta */
rutasContable.get(
  '/resumen',
  requiereRol('contable'),
  requierePermiso('contable:resumen'),
  async (req, res, next) => {
    try {
      const { desde, hasta } = req.query;
      res.json(await contable.resumen({ desde, hasta }));
    } catch (e) { next(e); }
  },
);

/* GET /api/contable/movimientos?desde&hasta
   Movimientos de todas las cuentas en el rango, para el CSV global
   del panel contable. Accesible al contable y al administrador. */
rutasContable.get(
  '/movimientos',
  requiereRol('contable', 'admin'),
  requierePermiso('contable:movimientos'),
  async (req, res, next) => {
    try {
      const { desde, hasta } = req.query;
      res.json(await contable.movimientos({ desde, hasta }));
    } catch (e) { next(e); }
  },
);
