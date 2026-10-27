/* ============================================================
   Bolsillos de ahorro (RF-03 / RN-02).

   RN-02: el dinero solo pasa entre el disponible y los bolsillos de
   la MISMA cuenta. Por eso cada consulta de bolsillo lleva siempre
   `AND usuario_doc = $x`: un id de bolsillo ajeno no se encuentra y
   la operacion termina en 404, nunca moviendo dinero entre cuentas.
   ============================================================ */

import { enTransaccion, query } from '../db.js';
import { malaPeticion, noEncontrado, conflicto } from '../lib/errores.js';
import { validarMonto, normalizarMonto, fmt } from '../lib/reglas.js';
import { insertarMovimiento, insertarAlerta, bolsilloPublico, movimientoPublico } from './comun.js';

export async function listar(usuario) {
  const { rows } = await query(
    `SELECT * FROM bolsillos WHERE usuario_doc = $1 ORDER BY id`, [usuario.doc],
  );
  return rows.map(bolsilloPublico);
}

export async function crear(usuario, { nombre }) {
  const limpio = String(nombre || '').trim();
  if (!limpio) throw malaPeticion('Ponle un nombre al bolsillo.');
  if (limpio.length > 40) throw malaPeticion('El nombre del bolsillo es demasiado largo.');

  return enTransaccion(async (cliente) => {
    const { rows: dup } = await cliente.query(
      `SELECT 1 FROM bolsillos
       WHERE usuario_doc = $1 AND lower(btrim(nombre)) = lower(btrim($2))`,
      [usuario.doc, limpio],
    );
    if (dup.length) throw conflicto('Ya tienes un bolsillo con ese nombre.');

    const { rows } = await cliente.query(
      `INSERT INTO bolsillos (usuario_doc, nombre, saldo)
       VALUES ($1, $2, 0) RETURNING *`,
      [usuario.doc, limpio],
    );
    return bolsilloPublico(rows[0]);
  });
}

/* Aportar: disponible -> bolsillo. Se bloquean AMBAS filas. */
export async function aportar(usuario, idBolsillo, { monto }) {
  const errMonto = validarMonto(monto);
  if (errMonto) throw malaPeticion(errMonto);
  const importe = normalizarMonto(monto);

  return enTransaccion(async (cliente) => {
    const u = await bloquearUsuario(cliente, usuario.doc);
    const b = await bloquearBolsilloPropio(cliente, idBolsillo, usuario.doc);

    if (importe > Number(u.disponible)) {
      throw malaPeticion(`No tienes ese disponible. Te quedan ${fmt(u.disponible)}.`);
    }

    const { rowCount } = await cliente.query(
      `UPDATE usuarios SET disponible = disponible - $2
       WHERE doc = $1 AND disponible >= $2`,
      [u.doc, importe],
    );
    if (rowCount !== 1) throw malaPeticion('No tienes ese disponible.');

    await cliente.query(
      `UPDATE bolsillos SET saldo = saldo + $2 WHERE id = $1 AND usuario_doc = $3`,
      [b.id, importe, u.doc],
    );

    const m = await insertarMovimiento(cliente, {
      tipo: 'Bolsillo',
      estado: 'Completada',
      origen: u.cuenta,
      destino: b.nombre,
      valor: importe,
      nota: 'Aporte a bolsillo',
    });
    await insertarAlerta(cliente, u.doc, `Aportaste ${fmt(importe)} a ${b.nombre}`);

    return {
      movimiento: movimientoPublico(m),
      disponible: Number(u.disponible) - importe,
      bolsillo: { id: Number(b.id), nombre: b.nombre, saldo: Number(b.saldo) + importe },
    };
  });
}

/* Retirar: bolsillo -> disponible. */
export async function retirar(usuario, idBolsillo, { monto }) {
  const errMonto = validarMonto(monto);
  if (errMonto) throw malaPeticion(errMonto);
  const importe = normalizarMonto(monto);

  return enTransaccion(async (cliente) => {
    const u = await bloquearUsuario(cliente, usuario.doc);
    const b = await bloquearBolsilloPropio(cliente, idBolsillo, usuario.doc);

    if (importe > Number(b.saldo)) {
      throw malaPeticion(`El bolsillo solo tiene ${fmt(b.saldo)}.`);
    }

    const { rowCount } = await cliente.query(
      `UPDATE bolsillos SET saldo = saldo - $2
       WHERE id = $1 AND usuario_doc = $3 AND saldo >= $2`,
      [b.id, importe, u.doc],
    );
    if (rowCount !== 1) throw malaPeticion('El bolsillo no tiene ese saldo.');

    await cliente.query(
      `UPDATE usuarios SET disponible = disponible + $2 WHERE doc = $1`,
      [u.doc, importe],
    );

    const m = await insertarMovimiento(cliente, {
      tipo: 'Bolsillo',
      estado: 'Completada',
      origen: b.nombre,
      destino: u.cuenta,
      valor: importe,
      nota: 'Retiro de bolsillo',
    });
    await insertarAlerta(cliente, u.doc, `Pasaste ${fmt(importe)} de ${b.nombre} a tu disponible`);

    return {
      movimiento: movimientoPublico(m),
      disponible: Number(u.disponible) + importe,
      bolsillo: { id: Number(b.id), nombre: b.nombre, saldo: Number(b.saldo) - importe },
    };
  });
}

/* ---------------- helpers internos ---------------- */

async function bloquearUsuario(cliente, doc) {
  const { rows } = await cliente.query(
    `SELECT * FROM usuarios WHERE doc = $1 FOR UPDATE`, [doc],
  );
  const u = rows[0];
  if (!u) throw malaPeticion('Tu cuenta no está disponible.');
  if (u.estado === 'bloqueada') {
    throw malaPeticion('Tu cuenta está bloqueada y no puede transaccionar.');
  }
  return u;
}

/* RN-02: el filtro por usuario_doc es lo que impide tocar el bolsillo
   de otra persona. No se busca el bolsillo y luego se compara el
   dueno: se busca directamente entre los propios. */
async function bloquearBolsilloPropio(cliente, id, doc) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum <= 0) throw malaPeticion('Bolsillo inválido.');
  const { rows } = await cliente.query(
    `SELECT * FROM bolsillos WHERE id = $1 AND usuario_doc = $2 FOR UPDATE`,
    [idNum, doc],
  );
  if (!rows[0]) throw noEncontrado('Ese bolsillo no existe en tu cuenta.');
  return rows[0];
}
