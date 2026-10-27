/* Pagos a convenios (RF-04). El dinero sale del sistema hacia un
   tercero, asi que el destino es el nombre del convenio, no una
   cuenta. Igual que la transferencia: transaccion + FOR UPDATE. */

import { enTransaccion } from '../db.js';
import { malaPeticion } from '../lib/errores.js';
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
