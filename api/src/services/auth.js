/* ============================================================
   Registro, login y cambio de contrasena (RF-01, RF-02, RF-06).
   Las contrasenas SOLO se guardan como hash bcrypt (RNF-02).
   ============================================================ */

import bcrypt from 'bcrypt';
import { config } from '../config.js';
import { enTransaccion, query } from '../db.js';
import { malaPeticion, conflicto, noAutenticado, prohibido } from '../lib/errores.js';
import {
  validarRegistro, validarCambioClave, nuevoNumeroCuenta,
  siguienteIntento, estaBloqueadoPorIntentos, MAX_INTENTOS, BLOQUEO_MIN,
  TOPE_DIARIO_DEF, TOPE_MENSUAL_DEF, fechaCorta,
} from '../lib/reglas.js';
import { insertarAlerta } from './comun.js';

const MSG_CREDENCIALES = 'Usuario o contraseña incorrectos.';

export async function registrar({ doc, nombre, clave, correo, tipo, nacimiento }) {
  const error = validarRegistro({ doc, nombre, clave, correo, nacimiento });
  if (error) throw malaPeticion(error);

  return enTransaccion(async (cliente) => {
    const { rows: existe } = await cliente.query(
      `SELECT 1 FROM usuarios WHERE doc = $1 OR lower(doc) = lower($1)`,
      [doc],
    );
    if (existe.length) throw conflicto('Ese documento ya tiene una cuenta.');

    if (correo) {
      const { rows: dup } = await cliente.query(
        `SELECT 1 FROM usuarios WHERE lower(correo) = lower($1) AND correo <> ''`,
        [correo],
      );
      if (dup.length) throw conflicto('Ese correo ya está registrado.');
    }

    const { rows: cuantos } = await cliente.query(
      `SELECT count(*)::int AS n FROM usuarios WHERE rol = 'usuario'`,
    );

    // Se reintenta por si el numero aleatorio choca con uno existente
    let cuenta = null;
    for (let i = 0; i < 20 && !cuenta; i++) {
      const candidata = nuevoNumeroCuenta(cuantos[0].n + i);
      const { rows: ocupada } = await cliente.query(
        `SELECT 1 FROM usuarios WHERE cuenta = $1`, [candidata],
      );
      if (!ocupada.length) cuenta = candidata;
    }
    if (!cuenta) throw conflicto('No se pudo asignar un número de cuenta. Intenta de nuevo.');

    const hash = await bcrypt.hash(String(clave), config.bcryptRounds);

    // CA-01.2: la cuenta nace activa y con disponible en 0
    const { rows } = await cliente.query(
      `INSERT INTO usuarios
         (doc, nombre, clave_hash, correo, tipo, nacimiento, rol, cuenta,
          disponible, estado, tope_diario, tope_mensual)
       VALUES ($1, $2, $3, $4, $5, $6, 'usuario', $7, 0, 'activa', $8, $9)
       RETURNING doc, nombre, rol, cuenta, estado, disponible`,
      [doc, String(nombre).trim(), hash, correo || '', tipo || 'CC',
        nacimiento || null, cuenta, TOPE_DIARIO_DEF, TOPE_MENSUAL_DEF],
    );

    await insertarAlerta(cliente, doc, `Cuenta ${cuenta} activada con saldo $0`);
    return rows[0];
  });
}

/* Login. El mensaje de credenciales es generico a proposito
   (CA-02.2): no revela si fallo el documento o la clave. */
export async function login({ documento, clave }) {
  if (!documento) throw malaPeticion('Escribe tu usuario o documento.');
  if (!clave) throw malaPeticion('Escribe tu contraseña.');

  return enTransaccion(async (cliente) => {
    const { rows } = await cliente.query(
      `SELECT * FROM usuarios WHERE doc = $1 OR lower(doc) = lower($1) FOR UPDATE`,
      [String(documento).trim()],
    );
    const usuario = rows[0];

    // RNF-02: bloqueo temporal de 15 min tras 5 intentos fallidos.
    // Se comprueba antes de validar la clave: ni con la clave correcta
    // se entra mientras el bloqueo esta vigente.
    if (usuario && estaBloqueadoPorIntentos(usuario.bloqueado_hasta)) {
      const min = Math.ceil((new Date(usuario.bloqueado_hasta).getTime() - Date.now()) / 60000);
      throw noAutenticado(
        `Esta cuenta está bloqueada. Intenta de nuevo en ${min} minuto${min === 1 ? '' : 's'}.`,
      );
    }

    const claveOk = usuario ? await bcrypt.compare(String(clave), usuario.clave_hash) : false;

    if (!usuario || !claveOk) {
      // Solo se contabiliza el intento si el documento existe; de lo
      // contrario un atacante podria crear bloqueos de documentos ajenos
      // probando documentos al azar.
      let restantes = MAX_INTENTOS - 1;
      if (usuario) {
        const paso = siguienteIntento(usuario.intentos_fallidos);
        await cliente.query(
          `UPDATE usuarios SET intentos_fallidos = $2, bloqueado_hasta = $3 WHERE doc = $1`,
          [usuario.doc, paso.intentos, paso.bloqueadoHasta],
        );
        if (paso.bloqueado) {
          throw noAutenticado(
            `Esta cuenta queda bloqueada ${BLOQUEO_MIN} minutos por ${MAX_INTENTOS} intentos fallidos.`,
          );
        }
        restantes = paso.restantes;
      }
      throw noAutenticado(
        `${MSG_CREDENCIALES} Te queda${restantes === 1 ? '' : 'n'} ${restantes} intento${restantes === 1 ? '' : 's'} para esta cuenta.`,
      );
    }

    // RN-07: una cuenta bloqueada por el administrador no inicia sesion
    if (usuario.estado === 'bloqueada') {
      throw prohibido('Esta cuenta está bloqueada por el administrador. Comunícate con soporte.');
    }

    await cliente.query(
      `UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE doc = $1`,
      [usuario.doc],
    );
    return usuario;
  });
}

/* RF-06 CA-06.2: el cambio de contrasena deja una notificacion con
   fecha y hora. */
export async function cambiarPassword(usuario, { actual, nueva }) {
  const error = validarCambioClave({ actual, nueva });
  if (error) throw malaPeticion(error);

  return enTransaccion(async (cliente) => {
    const { rows } = await cliente.query(
      `SELECT * FROM usuarios WHERE doc = $1 FOR UPDATE`, [usuario.doc],
    );
    const actualDb = rows[0];
    if (!actualDb) throw noAutenticado('El usuario ya no existe.');

    const ok = await bcrypt.compare(String(actual), actualDb.clave_hash);
    if (!ok) throw malaPeticion('La contraseña actual no coincide.');

    const mismaQueGuardada = await bcrypt.compare(String(nueva), actualDb.clave_hash);
    if (mismaQueGuardada) throw malaPeticion('La nueva contraseña debe ser distinta a la actual.');

    const hash = await bcrypt.hash(String(nueva), config.bcryptRounds);
    await cliente.query(`UPDATE usuarios SET clave_hash = $2 WHERE doc = $1`, [usuario.doc, hash]);

    await insertarAlerta(cliente, usuario.doc, `Contraseña modificada el ${fechaCorta(new Date())}`);
    return { ok: true };
  });
}

/* Lectura suelta usada por el middleware de auth. */
export async function porDoc(doc) {
  const { rows } = await query(`SELECT * FROM usuarios WHERE doc = $1`, [doc]);
  return rows[0] || null;
}
