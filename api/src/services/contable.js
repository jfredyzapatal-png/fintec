/* ============================================================
   Dashboard contable (RF-08). Solo lectura (RN-06).

   Definiciones, las mismas del prototipo:
     ingresos = transferencias completadas acreditadas a una cuenta
                FINTEC (plata que entra al sistema)
     egresos  = pagos completados a convenios (plata que sale a
                terceros)
     neto     = ingresos - egresos
   ============================================================ */

import { query } from '../db.js';
import { malaPeticion } from '../lib/errores.js';
import { rangoFechas } from '../lib/reglas.js';
import { movimientoPublico } from './comun.js';

/* GET /api/contable/movimientos?desde&hasta
   Movimientos de TODAS las cuentas en el rango. Lo necesita el panel
   contable para exportar el CSV global; antes el unico endpoint con
   el historial completo era el de administrador, prohibido para este
   rol. Misma forma que /api/admin/movimientos. Solo lectura (RN-06). */
export async function movimientos({ desde, hasta } = {}) {
  const r = rangoFechas(desde, hasta, new Date());
  if (r.error) throw malaPeticion(r.error);

  const { rows } = await query(
    `SELECT m.*, o.codigo AS codigo_original
     FROM movimientos m
     LEFT JOIN movimientos o ON o.id = m.original_id
     WHERE m.creado_en BETWEEN $1 AND $2
     ORDER BY m.creado_en DESC, m.id DESC
     LIMIT 5000`,
    [r.desde, r.hasta],
  );
  return rows.map((m) => movimientoPublico(m, m.codigo_original));
}

export async function resumen({ desde, hasta } = {}) {
  const r = rangoFechas(desde, hasta, new Date());
  if (r.error) throw malaPeticion(r.error);

  const params = [r.desde, r.hasta];

  const [totales, porTipo, porCliente] = await Promise.all([
    query(
      `SELECT
         COALESCE(SUM(m.valor) FILTER (
           WHERE m.tipo = 'Transferencia' AND d.doc IS NOT NULL
         ), 0) AS ingresos,
         COALESCE(SUM(m.valor) FILTER (WHERE m.tipo = 'Pago'), 0) AS egresos,
         count(*)::int AS operaciones
       FROM movimientos m
       LEFT JOIN usuarios d ON d.cuenta = m.destino
       WHERE m.estado = 'Completada' AND m.creado_en BETWEEN $1 AND $2`,
      params,
    ),
    query(
      `SELECT t.tipo,
              COALESCE(count(m.id), 0)::int AS operaciones,
              COALESCE(SUM(m.valor), 0) AS monto
       FROM (VALUES ('Transferencia'), ('Pago'), ('Bolsillo'),
                    ('Reversión'), ('Cancelación'), ('Crédito')) AS t(tipo)
       LEFT JOIN movimientos m
         ON m.tipo = t.tipo AND m.estado = 'Completada'
            AND m.creado_en BETWEEN $1 AND $2
       GROUP BY t.tipo
       ORDER BY t.tipo`,
      params,
    ),
    // Saldo actual por cliente (foto de hoy, no del rango)
    query(
      `SELECT u.doc, u.nombre, u.cuenta, u.disponible,
              COALESCE(b.total, 0) AS total_bolsillos
       FROM usuarios u
       LEFT JOIN (
         SELECT usuario_doc, SUM(saldo) AS total FROM bolsillos GROUP BY usuario_doc
       ) b ON b.usuario_doc = u.doc
       WHERE u.rol = 'usuario'
       ORDER BY u.nombre`,
    ),
  ]);

  const ingresos = Number(totales.rows[0].ingresos);
  const egresos = Number(totales.rows[0].egresos);

  return {
    desde: r.desde,
    hasta: r.hasta,
    operaciones: totales.rows[0].operaciones,
    ingresos,
    egresos,
    neto: ingresos - egresos,
    porTipo: porTipo.rows.map((t) => ({
      tipo: t.tipo,
      operaciones: t.operaciones,
      monto: Number(t.monto),
    })),
    porCliente: porCliente.rows.map((c) => ({
      doc: c.doc,
      nombre: c.nombre,
      cuenta: c.cuenta,
      disponible: Number(c.disponible),
      bolsillos: Number(c.total_bolsillos),
      total: Number(c.disponible) + Number(c.total_bolsillos),
    })),
  };
}
