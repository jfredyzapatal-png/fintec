/* ============================================================
   Autenticacion por JWT.
   El token lleva {doc, rol, cuenta} y caduca a los 10 minutos
   (RNF-01: cierre de sesion por inactividad). En cada peticion se
   relee el usuario de la base: asi un bloqueo hecho por el admin
   surte efecto de inmediato sobre una sesion ya abierta (RN-07),
   sin esperar a que el token expire.
   ============================================================ */

import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';
import { noAutenticado, prohibido } from '../lib/errores.js';

export function firmarToken(usuario) {
  return jwt.sign(
    { doc: usuario.doc, rol: usuario.rol, cuenta: usuario.cuenta },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn, subject: String(usuario.doc) },
  );
}

function leerToken(req) {
  const cabecera = req.get('authorization') || '';
  const [esquema, valor] = cabecera.split(' ');
  if (!valor || esquema.toLowerCase() !== 'bearer') return null;
  return valor.trim();
}

export async function requiereAuth(req, _res, next) {
  try {
    const token = leerToken(req);
    if (!token) throw noAutenticado('Falta el token de sesión.');

    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch (e) {
      const msg = e.name === 'TokenExpiredError'
        ? 'Sesión cerrada por inactividad. Vuelve a ingresar.'
        : 'Sesión no válida.';
      throw noAutenticado(msg);
    }

    const { rows } = await query('SELECT * FROM usuarios WHERE doc = $1', [payload.doc]);
    const usuario = rows[0];
    if (!usuario) throw noAutenticado('El usuario de la sesión ya no existe.');

    // RN-07: una cuenta bloqueada no transacciona ni consulta
    if (usuario.estado === 'bloqueada') {
      throw prohibido('Tu cuenta fue bloqueada por el administrador. Cerramos la sesión.');
    }

    req.usuario = usuario;
    next();
  } catch (e) {
    next(e);
  }
}
