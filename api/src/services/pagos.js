/* Pagos a convenios (RF-04). El dinero sale del sistema hacia un
   tercero, asi que el destino es el nombre del convenio, no una
   cuenta. Igual que la transferencia: transaccion + FOR UPDATE. */

import { enTransaccion, query } from '../db.js';
import { malaPeticion, noEncontrado, conflicto } from '../lib/errores.js';
import { validarMonto, normalizarMonto, CONVENIOS, fmt } from '../lib/reglas.js';
import { insertarMovimiento, insertarAlerta, movimientoPublico } from './comun.js';

export async function pagar(usuario, { convenio, referencia, valor }) {
  if (!convenio) throw malaPeticion('Selecciona el convenio.');
  if (!CONVENIOS.includes(convenio)) {
    throw malaPeticion(`Convenio no reconocido. Disponibles: ${CONVENIOS.join(', ')}.`);
  }
  if (!referencia || !String(referencia).trim()) {
    throw malaPeticion('Escribe la referencia del convenio.');
  }
  const errMonto = validarMonto(valor);
  if (errMonto) throw malaPeticion(errMonto.replace('monto', 'valor'));

  const importe = normalizarMonto(valor);
  const ref = String(referencia).trim().slice(0, 100);

  return enTransaccion(async (cliente) => {
    const { rows } = await cliente.query(
      `SELECT * FROM usuarios WHERE doc = $1 FOR UPDATE`, [usuario.doc],
    );
    const u = rows[0];
    if (!u) throw malaPeticion('Tu cuenta no está disponible.');
    if (u.estado === 'bloqueada') {
      throw malaPeticion('Tu cuenta está bloqueada y no puede transaccionar.');
    }

    // RN-01 / RN-03: sin saldo el pago queda Rechazado, con motivo
    if (importe > Number(u.disponible)) {
      const m = await insertarMovimiento(cliente, {
        tipo: 'Pago',
        estado: 'Rechazada',
        origen: u.cuenta,
        destino: convenio,
        valor: importe,
        nota: 'Saldo insuficiente',
      });
      await insertarAlerta(
        cliente, u.doc,
        `Pago a ${convenio} por ${fmt(importe)} rechazado por saldo insuficiente`,
      );
      throw malaPeticion('Saldo insuficiente. El pago quedó Rechazado.', {
        movimiento: movimientoPublico(m),
        motivo: 'Saldo insuficiente',
      });
    }

    const { rowCount } = await cliente.query(
      `UPDATE usuarios SET disponible = disponible - $2
       WHERE doc = $1 AND disponible >= $2`,
      [u.doc, importe],
    );
    if (rowCount !== 1) throw malaPeticion('Saldo insuficiente. El pago no se realizó.');

    const m = await insertarMovimiento(cliente, {
      tipo: 'Pago',
      estado: 'Completada',
      origen: u.cuenta,
      destino: convenio,
      valor: importe,
      nota: `Referencia ${ref}`,
    });
    await insertarAlerta(cliente, u.doc, `Pago a ${convenio} por ${fmt(importe)}`);

    return {
      movimiento: movimientoPublico(m),
      disponible: Number(u.disponible) - importe,
    };
  });
}

/* Convenios que el usuario deja guardados para no reescribir
   la referencia cada vez que va a pagar. */

function cuentaPagoPublica(c) {
  return {
    id: Number(c.id),
    alias: c.alias,
    convenio: c.convenio,
    referencia: c.referencia,
  };
}

export async function listarCuentas(usuario) {
  const { rows } = await query(
    `SELECT id, alias, convenio, referencia
     FROM cuentas_pago
     WHERE usuario_doc = $1
     ORDER BY lower(alias), id`,
    [usuario.doc],
  );
  return rows.map(cuentaPagoPublica);
}

export async function registrarCuenta(usuario, { alias, convenio, referencia }) {
  const nombre = String(alias || '').trim();
  if (!nombre) throw malaPeticion('Ponle un nombre a la cuenta.');
  if (nombre.length > 40) throw malaPeticion('El nombre de la cuenta es demasiado largo.');
  if (!convenio || !CONVENIOS.includes(convenio)) {
    throw malaPeticion(`Convenio no reconocido. Disponibles: ${CONVENIOS.join(', ')}.`);
  }
  const ref = String(referencia || '').trim();
  if (!ref) throw malaPeticion('Escribe la referencia del convenio.');
  if (ref.length > 100) throw malaPeticion('La referencia es demasiado larga.');

  return enTransaccion(async (cliente) => {
    const { rows: dup } = await cliente.query(
      `SELECT alias, convenio, referencia FROM cuentas_pago
       WHERE usuario_doc = $1
         AND (lower(btrim(alias)) = lower(btrim($2))
              OR (convenio = $3 AND lower(btrim(referencia)) = lower(btrim($4))))`,
      [usuario.doc, nombre, convenio, ref],
    );
    if (dup.length) {
      const misma = dup[0];
      const porAlias = String(misma.alias).trim().toLowerCase() === nombre.toLowerCase();
      throw conflicto(porAlias
        ? 'Ya tienes una cuenta registrada con ese nombre.'
        : 'Esa referencia ya está registrada en ese convenio.');
    }
    const { rows } = await cliente.query(
      `INSERT INTO cuentas_pago (usuario_doc, alias, convenio, referencia)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [usuario.doc, nombre, convenio, ref],
    );
    return cuentaPagoPublica(rows[0]);
  });
}

export async function eliminarCuenta(usuario, id) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum <= 0) throw malaPeticion('Cuenta inválida.');
  const { rowCount } = await query(
    `DELETE FROM cuentas_pago WHERE id = $1 AND usuario_doc = $2`,
    [idNum, usuario.doc],
  );
  if (rowCount !== 1) throw noEncontrado('Esa cuenta no está registrada.');
  return { ok: true };
}
