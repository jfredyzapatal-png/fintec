/* ============================================================
   Modulo de creditos (prototipo academico).

   Operaciones:
     solicitar    POST  /api/creditos
     listar       GET   /api/creditos
     pagarCuota   POST  /api/creditos/:id/pagar-cuota
     pagarTotal   POST  /api/creditos/:id/pagar-total

   Reglas clave:
     - El desembolso suma el monto principal al disponible del
       usuario y crea un movimiento tipo 'Crédito' (Desembolso).
     - La cuota mensual se calcula con amortizacion francesa:
         cuota = monto * r / (1 - (1+r)^-plazo)
       y total_a_pagar = cuota * plazo. Se congela al desembolso.
     - Un pago de cuota resta cuota (o el saldo pendiente si es
       menor) del disponible del usuario. Si el disponible no
       alcanza se rechaza con 400.
     - El pago total resta todo el saldo pendiente.
     - Todas las escrituras ocurren en UNA transaccion, con
       FOR UPDATE sobre el usuario y el credito.
     - El CHECK (saldo_pendiente >= 0) y el disponible >= 0 son
       la ultima red de seguridad.
   ============================================================ */

import { enTransaccion, query } from '../db.js';
import { malaPeticion, noEncontrado, conflicto } from '../lib/errores.js';
import { normalizarMonto, fmt } from '../lib/reglas.js';
import { insertarMovimiento, insertarAlerta, movimientoPublico } from './comun.js';

/* Tasas y nombres por tipo. Mismos valores que el simulador del
   landing (web/js/app.js). Si se cambia uno, cambiar el otro. */
export const TASAS = { libre: 0.025, vehiculo: 0.019, hipoteca: 0.015 };
export const NOMBRES = {
  libre: 'libre inversión',
  vehiculo: 'vehículo',
  hipoteca: 'hipoteca',
};

export const MONTO_MIN  =    500000;
export const MONTO_MAX  =  20000000;
export const PLAZOS_OK  = [12, 24, 36, 48];
const CUENTA_CREDITO = {
  libre:    'CREDITO-LIBRE',
  vehiculo: 'CREDITO-VEHICULO',
  hipoteca: 'CREDITO-HIPOTECA',
};

/* Redondeo a pesos enteros (el sistema trabaja en pesos). */
const round = (n) => Math.round(Number(n));

export function calcularCuota(monto, plazoMeses, tasaMensual) {
  const r = Number(tasaMensual);
  const n = Number(plazoMeses);
  const cuota = Number(monto) * r / (1 - Math.pow(1 + r, -n));
  return round(cuota);
}

/* Pura: valida el payload de solicitud de credito. Devuelve null si todo
   bien o el mensaje de error. Se exporta para poder probarla sin PostgreSQL. */
export function validarSolicitud({ tipo, monto, plazo }) {
  if (!(tipo in TASAS)) {
    return 'Tipo de crédito inválido (libre, vehiculo o hipoteca).';
  }
  const m = normalizarMonto(monto);
  if (!Number.isFinite(m) || m < MONTO_MIN || m > MONTO_MAX) {
    return `El monto debe estar entre ${fmt(MONTO_MIN)} y ${fmt(MONTO_MAX)}.`;
  }
  const p = Number(plazo);
  if (!PLAZOS_OK.includes(p)) {
    return 'El plazo debe ser 12, 24, 36 o 48 meses.';
  }
  return null;
}

/* Pura: calcula el efecto de un pago (cuota o total) sobre un credito.
   Devuelve el valor a cobrar, el nuevo saldo, el nuevo estado y los
   contadores actualizados. No toca la base: la unica razon de que esto
   viva aqui es poder probar la aritmetica y la transicion de estado sin
   PostgreSQL. El servicio llama esta funcion dentro de la transaccion y
   luego persiste el resultado. */
export function planearPago(credito, modo) {
  const saldoPendiente = Number(credito.saldo_pendiente);
  const cuotaFija = Number(credito.cuota);
  const cuotasPagadas = Number(credito.cuotas_pagadas);
  const plazo = Number(credito.plazo_meses);
  const nombreTipo = NOMBRES[credito.tipo] || credito.tipo;

  if (modo === 'cuota') {
    // La ultima cuota puede ser menor que la cuota regular por redondeo
    const valor = Math.min(cuotaFija, saldoPendiente);
    const nuevoSaldo = round(saldoPendiente - valor);
    const nuevasPagadas = cuotasPagadas + 1;
    return {
      valor,
      nuevoSaldo,
      nuevasPagadas,
      nuevoEstado: nuevoSaldo === 0 ? 'pagado' : 'activo',
      notaMov: `Cuota ${nuevasPagadas}/${plazo} crédito ${nombreTipo}`,
      notaAlerta: `Pagaste ${fmt(valor)} (cuota ${nuevasPagadas}/${plazo}) de tu crédito ${nombreTipo}`,
    };
  }
  // modo === 'total'
  const valor = saldoPendiente;
  return {
    valor,
    nuevoSaldo: 0,
    nuevasPagadas: cuotasPagadas,
    nuevoEstado: 'pagado',
    notaMov: `Pago total crédito ${nombreTipo}`,
    notaAlerta: `Pagaste el total (${fmt(valor)}) de tu crédito ${nombreTipo}`,
  };
}

function creditoPublico(c) {
  return {
    id: Number(c.id),
    tipo: c.tipo,
    tipoNombre: NOMBRES[c.tipo] || c.tipo,
    monto: Number(c.monto),
    plazoMeses: Number(c.plazo_meses),
    tasaMensual: Number(c.tasa_mensual),
    cuota: Number(c.cuota),
    totalAPagar: Number(c.total_a_pagar),
    saldoPendiente: Number(c.saldo_pendiente),
    cuotasPagadas: Number(c.cuotas_pagadas),
    estado: c.estado,
    fechaDesembolso: c.fecha_desembolso,
    cerradoEn: c.cerrado_en,
  };
}

/* -----------------------------------------------------------
   POST /api/creditos — solicitar y desembolsar
----------------------------------------------------------- */
export async function solicitar(usuario, { tipo, monto, plazo }) {
  const error = validarSolicitud({ tipo, monto, plazo });
  if (error) throw malaPeticion(error);

  const principal = normalizarMonto(monto);
  const plazoMeses = Number(plazo);
  const tasa = TASAS[tipo];
  const cuota = calcularCuota(principal, plazoMeses, tasa);
  const total = cuota * plazoMeses;

  return enTransaccion(async (cliente) => {
    const { rows: filas } = await cliente.query(
      `SELECT * FROM usuarios WHERE doc = $1 FOR UPDATE`, [usuario.doc],
    );
    const u = filas[0];
    if (!u) throw malaPeticion('Tu cuenta no está disponible.');
    if (u.estado === 'bloqueada') {
      throw malaPeticion('Tu cuenta está bloqueada y no puede recibir desembolsos.');
    }

    // 1) Alta del credito
    const { rows: insCred } = await cliente.query(
      `INSERT INTO creditos
         (usuario_doc, tipo, monto, plazo_meses, tasa_mensual, cuota,
          total_a_pagar, saldo_pendiente, cuotas_pagadas, estado)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7,0,'activo')
       RETURNING *`,
      [u.doc, tipo, principal, plazoMeses, tasa, cuota, total],
    );
    const credito = insCred[0];

    // 2) Desembolso: aumenta disponible
    await cliente.query(
      `UPDATE usuarios SET disponible = disponible + $2 WHERE doc = $1`,
      [u.doc, principal],
    );

    // 3) Movimiento tipo 'Crédito' (desembolso)
    const m = await insertarMovimiento(cliente, {
      tipo: 'Crédito',
      estado: 'Completada',
      origen: CUENTA_CREDITO[tipo],
      destino: u.cuenta,
      valor: principal,
      nota: `Desembolso crédito ${NOMBRES[tipo]} · ${plazoMeses} meses · cuota ${fmt(cuota)}`,
    });

    await insertarAlerta(
      cliente, u.doc,
      `Desembolso de ${fmt(principal)} por crédito ${NOMBRES[tipo]} a ${plazoMeses} meses · cuota ${fmt(cuota)}`,
    );

    return {
      credito: creditoPublico(credito),
      movimiento: movimientoPublico(m),
      disponible: Number(u.disponible) + principal,
    };
  });
}

/* -----------------------------------------------------------
   GET /api/creditos — mis creditos
----------------------------------------------------------- */
export async function listar(usuario) {
  const { rows } = await query(
    `SELECT * FROM creditos
     WHERE usuario_doc = $1
     ORDER BY (estado = 'activo') DESC, fecha_desembolso DESC, id DESC`,
    [usuario.doc],
  );
  return rows.map(creditoPublico);
}

/* -----------------------------------------------------------
   Helper comun para los dos pagos
----------------------------------------------------------- */
async function pagarCredito(usuario, idCredito, modo) {
  const id = Number(idCredito);
  if (!Number.isFinite(id) || id <= 0) {
    throw malaPeticion('Identificador de crédito inválido.');
  }

  return enTransaccion(async (cliente) => {
    const { rows: cs } = await cliente.query(
      `SELECT * FROM creditos WHERE id = $1 FOR UPDATE`, [id],
    );
    const c = cs[0];
    if (!c) throw noEncontrado('Ese crédito no existe.');
    if (c.usuario_doc !== usuario.doc) {
      throw noEncontrado('Ese crédito no existe.');
    }
    if (c.estado !== 'activo') {
      throw conflicto('Este crédito ya está pagado.');
    }

    const { rows: filas } = await cliente.query(
      `SELECT * FROM usuarios WHERE doc = $1 FOR UPDATE`, [usuario.doc],
    );
    const u = filas[0];
    if (!u) throw malaPeticion('Tu cuenta no está disponible.');
    if (u.estado === 'bloqueada') {
      throw malaPeticion('Tu cuenta está bloqueada y no puede pagar.');
    }

    const plan = planearPago(c, modo);

    if (Number(u.disponible) < plan.valor) {
      throw malaPeticion(
        `Saldo insuficiente. Para pagar ${fmt(plan.valor)} necesitas al menos ese disponible.`,
      );
    }

    const { rowCount } = await cliente.query(
      `UPDATE usuarios SET disponible = disponible - $2
       WHERE doc = $1 AND disponible >= $2`,
      [u.doc, plan.valor],
    );
    if (rowCount !== 1) {
      throw malaPeticion('Saldo insuficiente. El pago no se realizó.');
    }

    const { rows: upd } = await cliente.query(
      `UPDATE creditos
         SET saldo_pendiente = $2,
             cuotas_pagadas  = $3,
             estado          = $4,
             cerrado_en      = CASE WHEN $4 = 'pagado' THEN now() ELSE cerrado_en END
       WHERE id = $1
       RETURNING *`,
      [c.id, plan.nuevoSaldo, plan.nuevasPagadas, plan.nuevoEstado],
    );

    const m = await insertarMovimiento(cliente, {
      tipo: 'Crédito',
      estado: 'Completada',
      origen: u.cuenta,
      destino: CUENTA_CREDITO[c.tipo],
      valor: plan.valor,
      nota: plan.notaMov,
    });

    await insertarAlerta(cliente, u.doc,
      plan.nuevoEstado === 'pagado'
        ? `${plan.notaAlerta}. ¡Credito cerrado!`
        : `${plan.notaAlerta}. Saldo pendiente: ${fmt(plan.nuevoSaldo)}`,
    );

    return {
      credito: creditoPublico(upd[0]),
      movimiento: movimientoPublico(m),
      disponible: Number(u.disponible) - plan.valor,
    };
  });
}

/* POST /api/creditos/:id/pagar-cuota */
export const pagarCuota = (usuario, idCredito) =>
  pagarCredito(usuario, idCredito, 'cuota');

/* POST /api/creditos/:id/pagar-total */
export const pagarTotal = (usuario, idCredito) =>
  pagarCredito(usuario, idCredito, 'total');
