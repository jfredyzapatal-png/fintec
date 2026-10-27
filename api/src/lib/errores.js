/* Error de aplicacion con codigo HTTP. Lo lanza cualquier capa y el
   middleware de errores lo traduce a la respuesta JSON. */

export class ErrorApp extends Error {
  constructor(estado, mensaje, extra = {}) {
    super(mensaje);
    this.name = 'ErrorApp';
    this.estado = estado;
    this.extra = extra;
  }
}

export const malaPeticion = (msg, extra) => new ErrorApp(400, msg, extra);
export const noAutenticado = (msg = 'Sesión no válida o expirada.') => new ErrorApp(401, msg);
export const prohibido = (msg = 'No tienes acceso a esta operación.') => new ErrorApp(403, msg);
export const noEncontrado = (msg = 'Recurso no encontrado.') => new ErrorApp(404, msg);
export const conflicto = (msg, extra) => new ErrorApp(409, msg, extra);
