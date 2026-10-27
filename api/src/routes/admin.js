/* Rutas del administrador (RF-05). Rol 'admin' obligatorio.
   RN-04: no existe ninguna ruta que edite un saldo. */

import { Router } from 'express';
import { requiereAuth } from '../middleware/auth.js';
import { requiereRol, requierePermiso } from '../middleware/roles.js';
import * as admin from '../services/admin.js';

export const rutasAdmin = Router();
rutasAdmin.use(requiereAuth, requiereRol('admin'));

/* GET /api/admin/usuarios?q= */
rutasAdmin.get('/usuarios', requierePermiso('admin:usuarios'), async (req, res, next) => {
  try {
    res.json(await admin.buscarUsuarios({ q: req.query.q }));
  } catch (e) { next(e); }
});

/* PATCH /api/admin/usuarios/:doc/estado */
rutasAdmin.patch('/usuarios/:doc/estado', requierePermiso('admin:estado'), async (req, res, next) => {
  try {
    res.json(await admin.cambiarEstado(req.params.doc, { estado: req.body?.estado }));
  } catch (e) { next(e); }
});

/* GET /api/admin/movimientos?estado&tipo&cuenta */
rutasAdmin.get('/movimientos', requierePermiso('admin:movimientos'), async (req, res, next) => {
  try {
    const { estado, tipo, cuenta } = req.query;
    res.json(await admin.historial({ estado, tipo, cuenta }));
  } catch (e) { next(e); }
});

/* POST /api/admin/movimientos/:id/devolucion — RN-05 */
rutasAdmin.post('/movimientos/:id/devolucion', requierePermiso('admin:devolucion'), async (req, res, next) => {
  try {
    res.status(201).json(await admin.devolucion(req.params.id));
  } catch (e) { next(e); }
});

/* POST /api/admin/movimientos/:id/cancelacion — RN-05 */
rutasAdmin.post('/movimientos/:id/cancelacion', requierePermiso('admin:cancelacion'), async (req, res, next) => {
  try {
    res.status(201).json(await admin.cancelacion(req.params.id));
  } catch (e) { next(e); }
});
