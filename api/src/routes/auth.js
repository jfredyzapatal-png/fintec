/* Rutas de autenticacion: /api/auth/* */

import { Router } from 'express';
import * as servicio from '../services/auth.js';
import { firmarToken, requiereAuth } from '../middleware/auth.js';

export const rutasAuth = Router();

/* POST /api/auth/registro -> 201 */
rutasAuth.post('/registro', async (req, res, next) => {
  try {
    const { doc, nombre, clave, correo, tipo, nacimiento } = req.body || {};
    const u = await servicio.registrar({ doc, nombre, clave, correo, tipo, nacimiento });
    res.status(201).json({
      usuario: { doc: u.doc, nombre: u.nombre, rol: u.rol, cuenta: u.cuenta },
      disponible: Number(u.disponible),
      estado: u.estado,
      mensaje: `Cuenta ${u.cuenta} activada con saldo $0`,
    });
  } catch (e) { next(e); }
});

/* POST /api/auth/login -> {token, usuario} */
rutasAuth.post('/login', async (req, res, next) => {
  try {
    const { documento, clave } = req.body || {};
    const u = await servicio.login({ documento, clave });
    res.json({
      token: firmarToken(u),
      usuario: { doc: u.doc, nombre: u.nombre, rol: u.rol, cuenta: u.cuenta },
    });
  } catch (e) { next(e); }
});

/* POST /api/auth/password — cualquier rol puede cambiar la suya */
rutasAuth.post('/password', requiereAuth, async (req, res, next) => {
  try {
    const { actual, nueva } = req.body || {};
    await servicio.cambiarPassword(req.usuario, { actual, nueva });
    res.json({ ok: true, mensaje: 'Contraseña actualizada.' });
  } catch (e) { next(e); }
});
