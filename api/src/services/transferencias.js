/* ============================================================
   Transferencias entre cuentas FINTEC.

   Esta es la operacion mas delicada del sistema y la razon de ser
   del backend. Todo ocurre dentro de UNA transaccion de base de
   datos y las dos filas de usuario se bloquean con FOR UPDATE antes
   de leer saldos. Asi dos transferencias simultaneas sobre la misma
   cuenta se serializan y no pueden dejar el saldo corrupto ni
   negativo (RN-01). El CHECK (disponible >= 0) del esquema es la
   ultima red de seguridad.
   ============================================================ */

import { enTransaccion } from '../db.js';
import { malaPeticion } from '../lib/errores.js';
import { evaluarTransferencia, normalizarMonto, fmt } from '../lib/reglas.js';
import {
  insertarMovimiento, insertarAlerta, enviadoDiaYMes, movimientoPublico,
} from './comun.js';

export async function transferir(usuario, { cuentaDestino, monto, nota }) {
  if (!cuentaDestino) throw malaPeticion('Escribe la cuenta destino.');

  return enTransaccion(async (cliente) => {
    /* 1) Bloqueo de las dos filas en un orden estable (por doc) para
          evitar deadlocks cuando A->B y B->A corren a la vez. */
    const { rows: filas } = await cliente.query(
      `SELECT * FROM usuarios
       WHERE cuenta = $1 OR cuenta = $2
       ORDER BY doc
       FOR UPDATE`,
      [usuario.cuenta, String(cuentaDestino).trim()],
    );

    const origen = filas.find((u) => u.cuenta === usuario.cuenta);
    const destino = filas.find((u) => u.cuenta === String(cuentaDestino).trim()
      && u.rol === 'usuario');

    if (!origen) throw malaPeticion('Tu cuenta no está disponible.');
    // RN-07: el origen bloqueado no transacciona
    if (origen.estado === 'bloqueada') {
      throw malaPeticion('Tu cuenta está bloqueada y no puede transaccionar.');
    }

    /* 2) Cupos ya consumidos hoy y este mes, leidos DENTRO del
          bloqueo para que no cambien mientras decidimos (RF-04). */
    const enviado = await enviadoDiaYMes(cliente, origen.cuenta);

    /* 3) Decision unica, con la logica pura y probada de reglas.js */
    const veredicto = evaluarTransferencia({
      origen, destino, monto, enviadoHoy: enviado.dia, enviadoMes: enviado.mes,
    });

    if (!veredicto.ok) {
      /* RN-03 / RF-04: saldo insuficiente y exceso de tope SI dejan
         rastro: un movimiento 'Rechazada' con su motivo, sin mover
         un peso. Los errores de forma (cuenta inexistente, monto
         invalido, cuenta propia) no generan movimiento. */
      if (veredicto.registrar) {
        const m = await insertarMovimiento(cliente, {
          tipo: 'Transferencia',
          estado: 'Rechazada',
          origen: origen.cuenta,
          destino: destino ? destino.cuenta : String(cuentaDestino).trim(),
          valor: normalizarMonto(monto),
          nota: veredicto.motivo,
        });
        await insertarAlerta(
          cliente, origen.doc,
          `Transferencia de ${fmt(normalizarMonto(monto))} rechazada: ${veredicto.motivo.toLowerCase()}`,
        );
        throw malaPeticion(veredicto.mensaje, {
          movimiento: movimientoPublico(m),
          motivo: veredicto.motivo,
        });
      }
      throw malaPeticion(veredicto.mensaje, { motivo: veredicto.motivo });
    }

    /* 4) Movimiento de dinero. El WHERE con `disponible >= monto`
          hace que el UPDATE no pueda dejar la cuenta en negativo ni
          siquiera si algo se nos escapo en la validacion. */
    const valor = veredicto.monto;
    const { rowCount } = await cliente.query(
      `UPDATE usuarios SET disponible = disponible - $2
       WHERE doc = $1 AND disponible >= $2`,
      [origen.doc, valor],
    );
    if (rowCount !== 1) {
      // Imposible con el FOR UPDATE tomado, pero si ocurre se aborta
      // la transaccion entera: ROLLBACK y ningun saldo tocado.
      throw malaPeticion('Saldo insuficiente. El movimiento no se realizó.');
    }
    await cliente.query(
      `UPDATE usuarios SET disponible = disponible + $2 WHERE doc = $1`,
      [destino.doc, valor],
    );

    const m = await insertarMovimiento(cliente, {
      tipo: 'Transferencia',
      estado: 'Completada',
      origen: origen.cuenta,
      destino: destino.cuenta,
      valor,
      nota: nota ? String(nota).slice(0, 500) : '',
    });

    await insertarAlerta(cliente, origen.doc, `Enviada ${fmt(valor)} a ${destino.nombre}`);
    await insertarAlerta(cliente, destino.doc, `Recibida ${fmt(valor)} de ${origen.nombre}`);

    return {
      movimiento: movimientoPublico(m),
      disponible: Number(origen.disponible) - valor,
      destinatario: destino.nombre,
    };
  });
}
