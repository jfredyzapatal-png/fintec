/* ============================================================
   Registro, login y cambio de contrasena (RF-01, RF-02, RF-06).
   Las contrasenas SOLO se guardan como hash bcrypt (RNF-02).
   ============================================================ */

import { randomBytes, randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { enTransaccion, query } from '../db.js';
import { malaPeticion, conflicto, noAutenticado, prohibido } from '../lib/errores.js';
import {
  validarRegistro, validarCambioClave,
  nuevoNumeroCuenta, siguienteIntento, estaBloqueadoPorIntentos, MAX_INTENTOS, BLOQUEO_MIN,
  TOPE_DIARIO_DEF, TOPE_MENSUAL_DEF, fechaCorta,
} from '../lib/reglas.js';
import { insertarAlerta } from './comun.js';

const MSG_CREDENCIALES = 'Usuario o contraseña incorrectos.';
const CODIGO_MINUTOS = 5;
const CODIGO_INTENTOS = 3;

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
          `UPDATE usuarios
             SET intentos_fallidos = $2,
                 bloqueado_hasta = $3,
                 ultimo_bloqueo = CASE WHEN $4::boolean THEN now() ELSE ultimo_bloqueo END
           WHERE doc = $1`,
          [usuario.doc, paso.intentos, paso.bloqueadoHasta, paso.bloqueado === true],
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

    /* Admin y contable entran de un paso: la doble autenticación es
       solo para la cuenta del cliente, y nace apagada. */
    if (usuario.rol === 'usuario' && usuario.doble_factor === true) {
      const codigo = String(randomInt(0, 1000000)).padStart(6, '0');
      const desafioId = randomBytes(24).toString('hex');
      const expira = new Date(Date.now() + CODIGO_MINUTOS * 60000);
      const hash = await bcrypt.hash(codigo, config.bcryptRounds);
      await cliente.query(`DELETE FROM desafios_acceso WHERE usuario_doc = $1`, [usuario.doc]);
      await cliente.query(
        `INSERT INTO desafios_acceso (id, usuario_doc, codigo_hash, expira_en)
         VALUES ($1, $2, $3, $4)`,
        [desafioId, usuario.doc, hash, expira],
      );
      return {
        requiereCodigo: true,
        desafioId,
        codigoDemostracion: codigo,
        expiraEn: expira.toISOString(),
      };
    }

    await cliente.query(
      `UPDATE usuarios SET ultimo_ingreso = now() WHERE doc = $1`,
      [usuario.doc],
    );
    return { usuario };
  });
}

/* Segundo paso. Tres códigos malos o uno vencido obligan a empezar
   de nuevo con la contraseña. */
export async function confirmarCodigo({ desafioId, codigo }) {
  const id = String(desafioId || '').trim();
  const pin = String(codigo || '').trim();
  if (!id || !/^\d{6}$/.test(pin)) {
    throw malaPeticion('Escribe los 6 dígitos del código.');
  }

  return enTransaccion(async (cliente) => {
    const { rows } = await cliente.query(
      `SELECT * FROM desafios_acceso WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const desafio = rows[0];
    if (!desafio || new Date(desafio.expira_en).getTime() <= Date.now()) {
      if (desafio) {
        await cliente.query(`DELETE FROM desafios_acceso WHERE id = $1`, [id]);
      }
      throw noAutenticado('Ese código venció. Vuelve a escribir tu contraseña.');
    }

    const ok = await bcrypt.compare(pin, desafio.codigo_hash);
    if (!ok) {
      const intentos = Number(desafio.intentos) + 1;
      if (intentos >= CODIGO_INTENTOS) {
        await cliente.query(`DELETE FROM desafios_acceso WHERE id = $1`, [id]);
        throw noAutenticado('Se agotaron los 3 intentos del código. Vuelve a escribir tu contraseña.');
      }
      await cliente.query(
        `UPDATE desafios_acceso SET intentos = $2 WHERE id = $1`,
        [id, intentos],
      );
      const quedan = CODIGO_INTENTOS - intentos;
      throw noAutenticado(
        `El código no coincide. Te queda${quedan === 1 ? '' : 'n'} ${quedan} intento${quedan === 1 ? '' : 's'}.`,
      );
    }

    const { rows: usuarios } = await cliente.query(
      `SELECT * FROM usuarios WHERE doc = $1 FOR UPDATE`,
      [desafio.usuario_doc],
    );
    const usuario = usuarios[0];
    if (!usuario) throw noAutenticado('El usuario ya no existe.');
    if (usuario.estado === 'bloqueada') {
      throw prohibido('Esta cuenta está bloqueada por el administrador. Comunícate con soporte.');
    }

    await cliente.query(`DELETE FROM desafios_acceso WHERE usuario_doc = $1`, [usuario.doc]);
    await cliente.query(
      `UPDATE usuarios SET ultimo_ingreso = now(), intentos_fallidos = 0, bloqueado_hasta = NULL
       WHERE doc = $1`,
      [usuario.doc],
    );
    await insertarAlerta(
      cliente, usuario.doc,
      `Ingreso confirmado con código el ${fechaCorta(new Date())}`,
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
    await cliente.query(
      `UPDATE usuarios SET clave_hash = $2, clave_cambiada_en = now() WHERE doc = $1`,
      [usuario.doc, hash],
    );

    await insertarAlerta(cliente, usuario.doc, `Contraseña modificada el ${fechaCorta(new Date())}`);
    return { ok: true };
  });
}

async function exigirClave(cliente, doc, clave) {
  const { rows } = await cliente.query(
    `SELECT * FROM usuarios WHERE doc = $1 FOR UPDATE`, [doc],
  );
  const actual = rows[0];
  if (!actual) throw noAutenticado('El usuario ya no existe.');
  if (!clave) throw malaPeticion('Escribe tu contraseña para confirmar.');
  const ok = await bcrypt.compare(String(clave), actual.clave_hash);
  if (!ok) throw malaPeticion('La contraseña no coincide.');
  return actual;
}

export async function configurarDobleFactor(usuario, { activo, clave }) {
  if (usuario.rol !== 'usuario') {
    throw malaPeticion('La doble autenticación es para las cuentas de cliente.');
  }
  const encender = activo === true || activo === 'true';

  return enTransaccion(async (cliente) => {
    const actual = await exigirClave(cliente, usuario.doc, clave);
    await cliente.query(
      `UPDATE usuarios SET doble_factor = $2 WHERE doc = $1`,
      [actual.doc, encender],
    );
    if (!encender) {
      await cliente.query(`DELETE FROM desafios_acceso WHERE usuario_doc = $1`, [actual.doc]);
    }
    await insertarAlerta(
      cliente, actual.doc,
      encender
        ? 'Activaste la doble autenticación. El próximo ingreso pedirá un código.'
        : 'Desactivaste la doble autenticación.',
    );
    return { dobleFactor: encender };
  });
}

/* Lectura suelta usada por el middleware de auth. */
export async function porDoc(doc) {
  const { rows } = await query(`SELECT * FROM usuarios WHERE doc = $1`, [doc]);
  return rows[0] || null;
}
