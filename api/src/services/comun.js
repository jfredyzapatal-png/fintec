/* Helpers compartidos por los servicios: insertar movimientos,
   alertas y calcular lo enviado en el dia/mes para los topes.
   Todas las funciones reciben el `cliente` de la transaccion. */

/* Inserta un movimiento y devuelve la fila completa.
   RN-03: si el estado no es 'Completada', la nota (el motivo) es
   obligatoria — la restriccion CHECK del esquema tambien lo exige. */
export async function insertarMovimiento(cliente, {
  tipo, estado, origen, destino, valor, nota = '', originalId = null,
}) {
  const { rows } = await cliente.query(
    `INSERT INTO movimientos (tipo, estado, origen, destino, valor, nota, original_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [tipo, estado, origen, destino, valor, nota, originalId],
  );
  return rows[0];
}

export async function insertarAlerta(cliente, doc, texto) {
  if (!doc) return null;
  const { rows } = await cliente.query(
    `INSERT INTO alertas (usuario_doc, texto) VALUES ($1, $2) RETURNING *`,
    [doc, texto],
  );
  return rows[0];
}

/* Suma de transferencias COMPLETADAS que han salido de la cuenta en
   el dia y en el mes en curso (RF-04). Se calcula con la hora del
   servidor de base de datos para que coincida con creado_en. */
export async function enviadoDiaYMes(cliente, cuenta) {
  const { rows } = await cliente.query(
    `SELECT
       COALESCE(SUM(valor) FILTER (
         WHERE creado_en >= date_trunc('day', now())
       ), 0) AS dia,
       COALESCE(SUM(valor) FILTER (
         WHERE creado_en >= date_trunc('month', now())
       ), 0) AS mes
     FROM movimientos
     WHERE tipo = 'Transferencia'
       AND estado = 'Completada'
       AND origen = $1`,
    [cuenta],
  );
  return { dia: Number(rows[0].dia), mes: Number(rows[0].mes) };
}

/* Vista publica de un movimiento: el cliente ve el codigo TX-####,
   no el id interno. */
export function movimientoPublico(m, codigoOriginal = null) {
  return {
    id: m.codigo,
    tipo: m.tipo,
    estado: m.estado,
    origen: m.origen,
    destino: m.destino,
    valor: Number(m.valor),
    nota: m.nota,
    fecha: m.creado_en,
    revertida: m.revertida,
    original: codigoOriginal ?? m.codigo_original ?? null,
  };
}

export function bolsilloPublico(b) {
  return { id: Number(b.id), nombre: b.nombre, saldo: Number(b.saldo) };
}
