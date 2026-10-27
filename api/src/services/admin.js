/* ============================================================
   Gestion administrativa (RF-05, RN-04, RN-05, RN-07).

   RN-04: no hay ninguna funcion que edite un saldo a mano. Lo unico
   que mueve dinero aqui es `devolucion` y `cancelacion`, y ambas
   parten de un movimiento que ya existe.
   ============================================================ */

import { enTransaccion, query } from '../db.js';
import { malaPeticion, noEncontrado, conflicto } from '../lib/errores.js';
import { fmt } from '../lib/reglas.js';
import { insertarMovimiento, insertarAlerta, movimientoPublico } from './comun.js';

/* GET /api/admin/usuarios?q=
   RF-05 CA-05.1: busca por documento, cuenta, correo o nombre. */
export async function buscarUsuarios({ q } = {}) {
  const termino = String(q || '').trim();
  const patron = `%${termino.toLowerCase()}%`;

  const { rows } = await query(
    `SELECT u.doc, u.nombre, u.tipo, u.correo, u.cuenta, u.estado,
            u.disponible, u.tope_diario, u.tope_mensual,
            COALESCE(b.total, 0) AS total_bolsillos
     FROM usuarios u
     LEFT JOIN (
       SELECT usuario_doc, SUM(saldo) AS total FROM bolsillos GROUP BY usuario_doc
     ) b ON b.usuario_doc = u.doc
     WHERE u.rol = 'usuario'
       AND ($1 = '' OR lower(u.nombre) LIKE $2 OR lower(u.doc) LIKE $2
            OR lower(u.cuenta) LIKE $2 OR lower(u.correo) LIKE $2)
     ORDER BY u.nombre`,
    [termino, patron],
  );

  return rows.map((u) => ({
    doc: u.doc,
    nombre: u.nombre,
    tipo: u.tipo,
    correo: u.correo,
    cuenta: u.cuenta,
    estado: u.estado,
    disponible: Number(u.disponible),
    totalBolsillos: Number(u.total_bolsillos),
    total: Number(u.disponible) + Number(u.total_bolsillos),
    topeDiario: Number(u.tope_diario),
    topeMensual: Number(u.tope_mensual),
  }));
}

/* PATCH /api/admin/usuarios/:doc/estado — RN-07 */
export async function cambiarEstado(doc, { estado }) {
  if (!['activa', 'bloqueada'].includes(estado)) {
    throw malaPeticion("El estado debe ser 'activa' o 'bloqueada'.");
  }

  return enTransaccion(async (cliente) => {
    const { rows } = await cliente.query(
      `SELECT * FROM usuarios WHERE doc = $1 FOR UPDATE`, [doc],
    );
    const u = rows[0];
    if (!u) throw noEncontrado('Ese usuario no existe.');
    if (u.rol !== 'usuario') {
      throw malaPeticion('Solo se puede bloquear o activar cuentas de clientes.');
    }

    await cliente.query(`UPDATE usuarios SET estado = $2 WHERE doc = $1`, [doc, estado]);

    await insertarAlerta(
      cliente, doc,
      estado === 'bloqueada'
        ? 'Tu cuenta fue bloqueada por el administrador'
        : 'Tu cuenta fue reactivada',
    );
    return { doc, estado };
  });
}

/* GET /api/admin/movimientos?estado&tipo&cuenta — historial global */
export async function historial({ estado, tipo, cuenta } = {}) {
  const { rows } = await query(
    `SELECT m.*, o.codigo AS codigo_original
     FROM movimientos m
     LEFT JOIN movimientos o ON o.id = m.original_id
     WHERE ($1::text IS NULL OR $1 = '' OR m.estado = $1)
       AND ($2::text IS NULL OR $2 = '' OR m.tipo = $2)
       AND ($3::text IS NULL OR $3 = ''
            OR lower(m.origen) LIKE '%' || lower($3) || '%'
            OR lower(m.destino) LIKE '%' || lower($3) || '%')
     ORDER BY m.creado_en DESC, m.id DESC
     LIMIT 1000`,
    [estado || '', tipo || '', cuenta || ''],
  );
  return rows.map((m) => movimientoPublico(m, m.codigo_original));
}

/* ------------------------------------------------------------
   RN-05 — devolucion y cancelacion.

   Ambas reponen el dinero y crean un movimiento NUEVO enlazado al
   original (original_id). La diferencia:
     - devolucion: el original CONSERVA su estado 'Completada', como
       rastro de auditoria. No se edita.
     - cancelacion: el original pasa a 'Cancelada'.
   En los dos casos se marca `revertida` para que no se pueda
   aplicar dos veces (el indice unico sobre original_id lo refuerza).
   ------------------------------------------------------------ */
async function revertir(idOrCodigo, modo) {
  const esCancelacion = modo === 'cancelacion';

  return enTransaccion(async (cliente) => {
    /* 1) Bloquear el movimiento original. Se acepta el codigo legible
          TX-#### o el id numerico interno. */
    const { rows: movs } = await cliente.query(
      `SELECT * FROM movimientos
       WHERE codigo = $1 OR ($2::bigint IS NOT NULL AND id = $2::bigint)
       FOR UPDATE`,
      [String(idOrCodigo), /^\d+$/.test(String(idOrCodigo)) ? String(idOrCodigo) : null],
    );
    const m = movs[0];
    if (!m) throw noEncontrado('Movimiento no encontrado.');

    if (m.revertida) {
      throw conflicto(esCancelacion
        ? 'Este movimiento ya fue devuelto o cancelado.'
        : 'Este movimiento ya fue revertido.');
    }
    if (m.tipo !== 'Transferencia' || m.estado !== 'Completada') {
      throw malaPeticion('Solo se devuelven o cancelan transferencias completadas.');
    }

    /* 2) Bloquear las dos cuentas implicadas, en orden estable. */
    const { rows: cuentas } = await cliente.query(
      `SELECT * FROM usuarios
       WHERE cuenta = $1 OR cuenta = $2
       ORDER BY doc
       FOR UPDATE`,
      [m.origen, m.destino],
    );
    const origen = cuentas.find((u) => u.cuenta === m.origen);
    const destino = cuentas.find((u) => u.cuenta === m.destino);

    if (!origen || !destino) {
      throw malaPeticion('El movimiento no es reversible: una de las cuentas no existe en FINTEC.');
    }

    const valor = Number(m.valor);
    // El dinero se le quita a quien lo recibio. Si ya se lo gasto,
    // la reversion no procede: el saldo no puede quedar negativo (RN-01).
    if (Number(destino.disponible) < valor) {
      throw conflicto(`La cuenta destino no tiene saldo suficiente para revertir ${fmt(valor)}.`);
    }

    const { rowCount } = await cliente.query(
      `UPDATE usuarios SET disponible = disponible - $2
       WHERE doc = $1 AND disponible >= $2`,
      [destino.doc, valor],
    );
    if (rowCount !== 1) {
      throw conflicto(`La cuenta destino no tiene saldo suficiente para revertir ${fmt(valor)}.`);
    }
    await cliente.query(
      `UPDATE usuarios SET disponible = disponible + $2 WHERE doc = $1`,
      [origen.doc, valor],
    );

    /* 3) Marcar el original. RN-05: en la devolucion solo se marca
          `revertida`; el estado 'Completada' NO se toca. */
    if (esCancelacion) {
      await cliente.query(
        `UPDATE movimientos SET revertida = TRUE, estado = 'Cancelada',
           nota = CASE WHEN btrim(nota) = '' THEN 'Cancelada por el administrador' ELSE nota END
         WHERE id = $1`,
        [m.id],
      );
    } else {
      await cliente.query(`UPDATE movimientos SET revertida = TRUE WHERE id = $1`, [m.id]);
    }

    /* 4) Movimiento nuevo, enlazado y Completado, para que el panel
          contable lo vea. Va en sentido contrario al original. */
    const nuevo = await insertarMovimiento(cliente, {
      tipo: esCancelacion ? 'Cancelación' : 'Reversión',
      estado: 'Completada',
      origen: destino.cuenta,
      destino: origen.cuenta,
      valor,
      nota: `${esCancelacion ? 'Cancelación' : 'Devolución'} de ${m.codigo}`,
      originalId: m.id,
    });

    if (esCancelacion) {
      await insertarAlerta(cliente, origen.doc,
        `Movimiento ${m.codigo} cancelado por el administrador · ${fmt(valor)}`);
      await insertarAlerta(cliente, destino.doc,
        `Se cancelaron ${fmt(valor)} asociados a ${m.codigo}`);
    } else {
      await insertarAlerta(cliente, origen.doc,
        `Devolución recibida de ${fmt(valor)} (${m.codigo})`);
      await insertarAlerta(cliente, destino.doc,
        `Se devolvió ${fmt(valor)} por ${m.codigo}`);
    }

    return {
      original: { ...movimientoPublico(m), estado: esCancelacion ? 'Cancelada' : m.estado, revertida: true },
      movimiento: movimientoPublico(nuevo, m.codigo),
    };
  });
}

export const devolucion = (id) => revertir(id, 'devolucion');
export const cancelacion = (id) => revertir(id, 'cancelacion');
