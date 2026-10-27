/* Estado de la cuenta propia, topes, titular de una cuenta destino,
   movimientos propios y alertas. (RF-03, RF-04, RF-06, RF-07) */

import { enTransaccion, query } from '../db.js';
import { malaPeticion, noEncontrado } from '../lib/errores.js';
import {
  validarTopes, cupoDiario, cupoMensual, normalizarMonto, rangoFechas, fmt,
} from '../lib/reglas.js';
import { enviadoDiaYMes, insertarAlerta, movimientoPublico, bolsilloPublico } from './comun.js';

/* GET /api/cuenta/me */
export async function resumen(usuario) {
  const [bolsillos, enviado] = await Promise.all([
    query(`SELECT * FROM bolsillos WHERE usuario_doc = $1 ORDER BY id`, [usuario.doc]),
    enviadoDiaYMes({ query }, usuario.cuenta),
  ]);

  return {
    cuenta: usuario.cuenta,
    disponible: Number(usuario.disponible),
    bolsillos: bolsillos.rows.map(bolsilloPublico),
    totalBolsillos: bolsillos.rows.reduce((s, b) => s + Number(b.saldo), 0),
    topeDiario: Number(usuario.tope_diario),
    topeMensual: Number(usuario.tope_mensual),
    cupoDiario: cupoDiario(usuario, enviado.dia),
    cupoMensual: cupoMensual(usuario, enviado.mes),
    enviadoHoy: enviado.dia,
    enviadoMes: enviado.mes,
  };
}

/* PUT /api/cuenta/topes — RF-04 */
export async function guardarTopes(usuario, { topeDiario, topeMensual }) {
  const error = validarTopes(topeDiario, topeMensual);
  if (error) throw malaPeticion(error);

  const d = normalizarMonto(topeDiario);
  const m = normalizarMonto(topeMensual);

  return enTransaccion(async (cliente) => {
    const { rows } = await cliente.query(
      `UPDATE usuarios SET tope_diario = $2, tope_mensual = $3
       WHERE doc = $1
       RETURNING tope_diario, tope_mensual`,
      [usuario.doc, d, m],
    );
    await insertarAlerta(
      cliente, usuario.doc,
      `Topes actualizados: ${fmt(d)} diario y ${fmt(m)} mensual`,
    );
    return {
      topeDiario: Number(rows[0].tope_diario),
      topeMensual: Number(rows[0].tope_mensual),
    };
  });
}

/* GET /api/cuenta/:cuenta/titular
   Permite confirmar el destinatario ANTES de mover dinero (RF-04).
   Solo expone nombre, tipo y documento: lo justo para que la persona
   reconozca a quien le envia. No revela saldos. */
export async function titular(numeroCuenta, solicitante) {
  const { rows } = await query(
    `SELECT nombre, tipo, doc, estado FROM usuarios WHERE cuenta = $1 AND rol = 'usuario'`,
    [numeroCuenta],
  );
  const u = rows[0];
  if (!u) throw noEncontrado('Esa cuenta no existe.');
  if (u.estado === 'bloqueada') {
    throw malaPeticion('La cuenta destino está bloqueada y no puede recibir dinero.');
  }
  if (solicitante && u.doc === solicitante.doc) {
    throw malaPeticion('No puedes transferirte a tu propia cuenta.');
  }
  return { nombre: u.nombre, tipo: u.tipo, doc: u.doc };
}

/* GET /api/movimientos?desde&hasta — RF-07 */
export async function movimientos(usuario, { desde, hasta } = {}) {
  const r = rangoFechas(desde, hasta, new Date());
  if (r.error) throw malaPeticion(r.error);

  // Si no se pasa ningun filtro se devuelve todo el historial propio;
  // el prototipo mostraba la lista completa en "Movimientos".
  const sinFiltro = !desde && !hasta;
  const params = sinFiltro ? [usuario.cuenta] : [usuario.cuenta, r.desde, r.hasta];
  const filtroFecha = sinFiltro ? '' : 'AND m.creado_en BETWEEN $2 AND $3';

  const { rows } = await query(
    `SELECT m.*, o.codigo AS codigo_original
     FROM movimientos m
     LEFT JOIN movimientos o ON o.id = m.original_id
     WHERE (m.origen = $1 OR m.destino = $1) ${filtroFecha}
     ORDER BY m.creado_en DESC, m.id DESC`,
    params,
  );
  return rows.map((m) => movimientoPublico(m, m.codigo_original));
}

/* GET /api/alertas — RF-06 */
export async function alertas(usuario) {
  const { rows } = await query(
    `SELECT id, texto, creado_en FROM alertas
     WHERE usuario_doc = $1
     ORDER BY creado_en DESC, id DESC
     LIMIT 200`,
    [usuario.doc],
  );
  return rows.map((a) => ({ id: Number(a.id), texto: a.texto, fecha: a.creado_en }));
}
