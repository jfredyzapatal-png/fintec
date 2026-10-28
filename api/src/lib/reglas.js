/* ============================================================
   FINTEC — reglas de negocio puras
   Aqui vive la logica que NO necesita base de datos: validar
   montos, calcular cupos, decidir si un rol puede entrar a un
   recurso, validar los datos de registro. Esta separada a
   proposito para poder probarla con node:test sin PostgreSQL.
   ============================================================ */

export const TOPE_DIARIO_DEF = 5000000;
export const TOPE_MENSUAL_DEF = 20000000;
export const MAX_INTENTOS = 5;
export const BLOQUEO_MIN = 15;
export const INACTIVIDAD_MIN = 10;            // RNF-01, se refleja en el exp del JWT
export const CLAVE_MIN = 8;
export const CONVENIOS = ['EPM', 'Universidad', 'Acueducto', 'Claro'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOC_RE = /^[0-9A-Za-z]{5,15}$/;

/* ---------------- dinero ---------------- */

/* El prototipo hacia Math.round(Number(valor)). Se conserva ese
   comportamiento: el sistema trabaja en pesos enteros. */
export function normalizarMonto(valor) {
  const n = Math.round(Number(valor));
  if (!Number.isFinite(n)) return NaN;
  return n;
}

/* Devuelve null si el monto es valido, o el mensaje de error.
   Un monto invalido NO genera movimiento (CP-04, CP-05). */
export function validarMonto(valor) {
  const n = normalizarMonto(valor);
  if (Number.isNaN(n)) return 'Escribe un monto mayor que cero.';
  if (!n || n <= 0) return 'Escribe un monto mayor que cero.';
  if (n > 1e14) return 'El monto excede el maximo permitido.';
  return null;
}

/* Meta de un bolsillo. Vacio o cero significa "sin meta": el bolsillo
   sigue existiendo, solo que no muestra porcentaje de avance. */
export function validarMeta(valor) {
  if (valor === undefined || valor === null || valor === '') return { meta: 0 };
  const n = normalizarMonto(valor);
  if (Number.isNaN(n) || n < 0) return { error: 'La meta debe ser cero o un monto mayor.' };
  if (n > 1e14) return { error: 'La meta excede el máximo permitido.' };
  return { meta: n };
}

export function fmt(n) {
  return '$' + Math.round(Number(n)).toLocaleString('es-CO');
}

/* ---------------- topes y cupos (RF-04) ---------------- */

export function cupoDisponible(tope, yaEnviado) {
  return Math.max(0, Number(tope) - Number(yaEnviado));
}

export function cupoDiario(usuario, enviadoHoy) {
  return cupoDisponible(usuario.tope_diario, enviadoHoy);
}

export function cupoMensual(usuario, enviadoMes) {
  return cupoDisponible(usuario.tope_mensual, enviadoMes);
}

/* Validacion de los topes que el usuario guarda desde su perfil. */
export function validarTopes(diario, mensual) {
  const d = normalizarMonto(diario);
  const m = normalizarMonto(mensual);
  if (Number.isNaN(d) || Number.isNaN(m) || !d || d <= 0 || !m || m <= 0) {
    return 'Los topes deben ser mayores que cero.';
  }
  if (d > m) return 'El tope diario no puede superar al mensual.';
  return null;
}

/* ------------------------------------------------------------
   Decision central de una transferencia.
   Devuelve {ok:true} o {ok:false, motivo, mensaje, registrar}.
   - registrar:true  -> hay que dejar un movimiento 'Rechazada'
                        con su motivo (RN-03 / RF-04)
   - registrar:false -> es un error de forma, no se registra nada
   El ORDEN importa: saldo insuficiente se evalua antes que los
   topes, igual que en el prototipo.
   ------------------------------------------------------------ */
export function evaluarTransferencia({
  origen, destino, monto, enviadoHoy = 0, enviadoMes = 0,
}) {
  const errMonto = validarMonto(monto);
  const n = normalizarMonto(monto);

  if (!destino) {
    return { ok: false, registrar: false, motivo: 'Cuenta destino inexistente', mensaje: 'Esa cuenta no existe.' };
  }
  if (destino.doc === origen.doc) {
    return { ok: false, registrar: false, motivo: 'Cuenta propia', mensaje: 'No puedes transferirte a tu propia cuenta.' };
  }
  if (errMonto) {
    return { ok: false, registrar: false, motivo: 'Monto invalido', mensaje: errMonto };
  }
  // RN-07: una cuenta bloqueada tampoco puede RECIBIR dinero
  if (destino.estado === 'bloqueada') {
    return {
      ok: false, registrar: false, motivo: 'Cuenta destino bloqueada',
      mensaje: 'La cuenta destino está bloqueada y no puede recibir dinero.',
    };
  }
  // RN-01: el disponible nunca queda negativo
  if (n > Number(origen.disponible)) {
    return {
      ok: false, registrar: true, motivo: 'Saldo insuficiente',
      mensaje: 'Saldo insuficiente. El movimiento quedó registrado como Rechazado.',
    };
  }
  // RF-04: topes del propio usuario
  const cd = cupoDiario(origen, enviadoHoy);
  if (n > cd) {
    return {
      ok: false, registrar: true, motivo: 'Supera el tope diario',
      mensaje: `Supera tu tope diario de ${fmt(origen.tope_diario)}. Hoy te queda ${fmt(cd)}.`,
    };
  }
  const cm = cupoMensual(origen, enviadoMes);
  if (n > cm) {
    return {
      ok: false, registrar: true, motivo: 'Supera el tope mensual',
      mensaje: `Supera tu tope mensual de ${fmt(origen.tope_mensual)}. Este mes te queda ${fmt(cm)}.`,
    };
  }
  return { ok: true, monto: n };
}

/* ---------------- autorizacion por rol ---------------- */

/* Que recursos toca cada rol. 'contable' es SOLO LECTURA (RN-06):
   no aparece en ninguna entrada de escritura. */
export const PERMISOS = {
  usuario: [
    'cuenta:leer', 'cuenta:topes', 'movimientos:propios', 'transferencia:crear',
    'pago:crear', 'bolsillo:crear', 'bolsillo:mover', 'alertas:propias', 'password:cambiar',
    'credito:leer', 'credito:solicitar', 'credito:pagar',
  ],
  admin: [
    'admin:usuarios', 'admin:estado', 'admin:movimientos',
    'admin:devolucion', 'admin:cancelacion', 'password:cambiar',
    // el historial global tambien lo consulta el admin
    'contable:movimientos',
  ],
  contable: [
    // ambos son de LECTURA (RN-06)
    'contable:resumen', 'contable:movimientos', 'password:cambiar',
  ],
};

export function puede(rol, permiso) {
  const lista = PERMISOS[rol];
  return Array.isArray(lista) && lista.includes(permiso);
}

/* RN-04: el administrador no edita saldos a mano. Lo unico que puede
   hacer sobre el dinero es devolver o cancelar un movimiento ya
   existente. Cualquier otra intencion sobre saldos se niega. */
export function adminPuedeSobreSaldos(accion) {
  return accion === 'devolucion' || accion === 'cancelacion';
}

/* ---------------- registro (RF-01) ---------------- */

export function edadEn(nacimiento, hoy = new Date()) {
  const f = nacimiento instanceof Date ? nacimiento : new Date(`${nacimiento}T00:00:00`);
  if (Number.isNaN(f.getTime())) return NaN;
  let edad = hoy.getFullYear() - f.getFullYear();
  const m = hoy.getMonth() - f.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < f.getDate())) edad--;
  return edad;
}

export function validarRegistro({ doc, nombre, clave, correo, nacimiento }, hoy = new Date()) {
  if (!doc || !nombre || !clave) return 'Nombre, documento y contraseña son obligatorios.';
  if (!DOC_RE.test(String(doc))) return 'Documento inválido: usa de 5 a 15 caracteres sin espacios.';
  if (String(clave).length < CLAVE_MIN) return `La contraseña debe tener al menos ${CLAVE_MIN} caracteres.`;
  if (correo && !EMAIL_RE.test(String(correo))) return 'El correo no tiene un formato válido.';
  if (nacimiento) {
    const edad = edadEn(nacimiento, hoy);
    if (Number.isNaN(edad)) return 'Fecha de nacimiento inválida.';
    if (edad < 18) return 'Debes ser mayor de 18 años para abrir una cuenta.';
    if (edad > 120) return 'Revisa la fecha de nacimiento.';
  }
  return null;
}

/* ---------------- cambio de contrasena (RF-06) ---------------- */

/* Solo las reglas que no dependen del hash. La comparacion contra
   el hash bcrypt la hace el servicio. */
export function validarCambioClave({ actual, nueva }) {
  if (!actual || !nueva) return 'Completa los campos de contraseña.';
  if (String(nueva).length < CLAVE_MIN) return `La nueva contraseña debe tener al menos ${CLAVE_MIN} caracteres.`;
  if (String(nueva) === String(actual)) return 'La nueva contraseña debe ser distinta a la actual.';
  return null;
}

/* ---------------- bloqueo por intentos (RNF-02) ---------------- */

export function siguienteIntento(intentosPrevios, ahora = Date.now()) {
  const intentos = Number(intentosPrevios || 0) + 1;
  if (intentos >= MAX_INTENTOS) {
    return { intentos: 0, bloqueadoHasta: new Date(ahora + BLOQUEO_MIN * 60000), bloqueado: true };
  }
  return { intentos, bloqueadoHasta: null, bloqueado: false, restantes: MAX_INTENTOS - intentos };
}

export function estaBloqueadoPorIntentos(bloqueadoHasta, ahora = Date.now()) {
  if (!bloqueadoHasta) return false;
  return new Date(bloqueadoHasta).getTime() > ahora;
}

/* ---------------- fechas ---------------- */

export function iso(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fechaCorta(d) {
  const f = d instanceof Date ? d : new Date(d);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(f.getDate())}/${p(f.getMonth() + 1)} ${p(f.getHours())}:${p(f.getMinutes())}`;
}

/* Normaliza el rango ?desde&hasta de los reportes. Si falta alguno
   se usa el mes en curso, igual que el prototipo. */
export function rangoFechas(desde, hasta, hoy = new Date()) {
  const d = desde ? new Date(`${desde}T00:00:00`) : new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const h = hasta ? new Date(`${hasta}T23:59:59.999`) : new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59, 999);
  if (Number.isNaN(d.getTime()) || Number.isNaN(h.getTime())) return { error: 'Fechas inválidas.' };
  if (d > h) return { error: 'La fecha "desde" debe ser menor o igual a "hasta".' };
  return { desde: d, hasta: h };
}

/* Numero de cuenta para una cuenta nueva: 001-<100+n>-<aleatorio> */
export function nuevoNumeroCuenta(cantidadClientes, aleatorio = Math.random) {
  const bloque = 100 + Number(cantidadClientes);
  const cola = Math.floor(aleatorio() * 900) + 100;
  return `001-${bloque}-${cola}`;
}
