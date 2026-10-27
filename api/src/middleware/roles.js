/* ============================================================
   Autorizacion por rol (RF-02 / RN-04 / RN-06).
   El front puede esconder botones; la decision real se toma aqui.
   ============================================================ */

import { puede } from '../lib/reglas.js';
import { prohibido } from '../lib/errores.js';

/* Exige uno de los roles indicados. */
export function requiereRol(...roles) {
  return (req, _res, next) => {
    if (!req.usuario) return next(prohibido('Sesión requerida.'));
    if (!roles.includes(req.usuario.rol)) {
      return next(prohibido(`Esta operación es solo para: ${roles.join(', ')}.`));
    }
    next();
  };
}

/* Exige un permiso concreto de la matriz PERMISOS. Es mas estricto
   que requiereRol porque un rol puede existir y no tener el permiso:
   asi el contable queda bloqueado en toda escritura (RN-06). */
export function requierePermiso(permiso) {
  return (req, _res, next) => {
    if (!req.usuario) return next(prohibido('Sesión requerida.'));
    if (!puede(req.usuario.rol, permiso)) {
      return next(prohibido('Tu rol no tiene permiso para esta operación.'));
    }
    next();
  };
}

/* RN-06: red de seguridad explicita. El contable nunca puede usar
   un metodo de escritura, pase lo que pase con las rutas. */
export function soloLecturaContable(req, _res, next) {
  const escribe = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (req.usuario?.rol === 'contable' && escribe) {
    // el cambio de su propia contrasena es la unica excepcion
    // (originalUrl, no path: dentro de un Router path es relativo)
    const esCambioClave = (req.originalUrl || '').split('?')[0] === '/api/auth/password';
    if (!esCambioClave) {
      return next(prohibido('El rol contable es de solo lectura.'));
    }
  }
  next();
}
