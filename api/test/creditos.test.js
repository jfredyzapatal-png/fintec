/* Pruebas del modulo de creditos (RF-09, v1.1.0).
   Cubren CP-49, CP-50 y CP-51 del plan de calidad extendido.

   Son pruebas de la LOGICA PURA extraida de services/creditos.js:
   calcularCuota (amortizacion francesa), validarSolicitud (payload de
   solicitud) y planearPago (efecto de un pago sobre el credito).

   CP-52 (dos pagos simultaneos) se deja documentado al final: requiere
   PostgreSQL real para probar el FOR UPDATE y la verificacion de estado
   antes de pagar. La aritmetica que se ejecuta DENTRO de esa carrera si
   esta cubierta aqui con planearPago. */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TASAS, NOMBRES, MONTO_MIN, MONTO_MAX, PLAZOS_OK,
  calcularCuota, validarSolicitud, planearPago,
} from '../src/services/creditos.js';

/* ============================================================
   Constantes del modulo — contrato con el simulador del landing
   ============================================================ */

test('TASAS coinciden con el simulador publico de web/js/app.js', () => {
  assert.deepStrictEqual(TASAS, {
    libre:    0.025,
    vehiculo: 0.019,
    hipoteca: 0.015,
  });
});

test('NOMBRES publicos tienen tilde donde corresponde', () => {
  assert.strictEqual(NOMBRES.libre, 'libre inversión');
  assert.strictEqual(NOMBRES.vehiculo, 'vehículo');
  assert.strictEqual(NOMBRES.hipoteca, 'hipoteca');
});

test('PLAZOS permitidos son exactamente 12, 24, 36 y 48 meses', () => {
  assert.deepStrictEqual(PLAZOS_OK, [12, 24, 36, 48]);
});

test('MONTO entre 500 mil y 20 millones (realista para la demo)', () => {
  assert.strictEqual(MONTO_MIN,    500_000);
  assert.strictEqual(MONTO_MAX, 20_000_000);
});

/* ============================================================
   CP-49 — Amortizacion francesa (calcularCuota)
   Verifica que la cuota mensual coincide con los valores
   documentados en docs/MODULO_CREDITO.md §2.
   ============================================================ */

test('CP-49a calcularCuota — libre 3M a 12m da $292.461', () => {
  const cuota = calcularCuota(3_000_000, 12, TASAS.libre);
  assert.strictEqual(cuota, 292_461);
});

test('CP-49b calcularCuota — vehiculo 5M a 24m da $261.370', () => {
  const cuota = calcularCuota(5_000_000, 24, TASAS.vehiculo);
  assert.strictEqual(cuota, 261_370);
});

test('CP-49c calcularCuota — hipoteca 10M a 48m da $293.750', () => {
  const cuota = calcularCuota(10_000_000, 48, TASAS.hipoteca);
  assert.strictEqual(cuota, 293_750);
});

test('calcularCuota — el total a pagar (cuota * plazo) >= monto para todas las tasas', () => {
  // Propiedad fundamental: con tasa > 0 el credito siempre cobra intereses
  for (const tipo of ['libre', 'vehiculo', 'hipoteca']) {
    for (const plazo of PLAZOS_OK) {
      for (const monto of [500_000, 1_000_000, 5_000_000, 20_000_000]) {
        const cuota = calcularCuota(monto, plazo, TASAS[tipo]);
        const total = cuota * plazo;
        assert.ok(total > monto,
          `${tipo} ${monto} a ${plazo}m: total ${total} debe ser > principal ${monto}`);
      }
    }
  }
});

test('calcularCuota — hipoteca cobra menos intereses que libre para el mismo credito', () => {
  const libre    = calcularCuota(5_000_000, 24, TASAS.libre);
  const vehiculo = calcularCuota(5_000_000, 24, TASAS.vehiculo);
  const hipoteca = calcularCuota(5_000_000, 24, TASAS.hipoteca);
  // Monotonia por tasa (ordenamiento esperado del simulador)
  assert.ok(hipoteca < vehiculo,
    `hipoteca ${hipoteca} debe ser menor que vehiculo ${vehiculo}`);
  assert.ok(vehiculo < libre,
    `vehiculo ${vehiculo} debe ser menor que libre ${libre}`);
});

/* ============================================================
   Validacion de la solicitud (payload mal formado)
   ============================================================ */

test('validarSolicitud — payload canonico es aceptado', () => {
  assert.strictEqual(
    validarSolicitud({ tipo: 'libre', monto: 3_000_000, plazo: 12 }),
    null,
  );
});

test('validarSolicitud — tipo inexistente', () => {
  const msg = validarSolicitud({ tipo: 'estudios', monto: 1_000_000, plazo: 12 });
  assert.ok(msg && msg.includes('Tipo de crédito inválido'));
});

test('validarSolicitud — tipo vacio o undefined', () => {
  assert.ok(validarSolicitud({ tipo: '', monto: 1_000_000, plazo: 12 }));
  assert.ok(validarSolicitud({ monto: 1_000_000, plazo: 12 }));
});

test('validarSolicitud — monto por debajo del minimo', () => {
  const msg = validarSolicitud({ tipo: 'libre', monto: 100_000, plazo: 12 });
  assert.ok(msg && msg.includes('monto'));
});

test('validarSolicitud — monto justo en el minimo pasa', () => {
  assert.strictEqual(
    validarSolicitud({ tipo: 'libre', monto: MONTO_MIN, plazo: 12 }),
    null,
  );
});

test('validarSolicitud — monto justo en el maximo pasa', () => {
  assert.strictEqual(
    validarSolicitud({ tipo: 'libre', monto: MONTO_MAX, plazo: 12 }),
    null,
  );
});

test('validarSolicitud — monto por encima del maximo', () => {
  const msg = validarSolicitud({ tipo: 'libre', monto: 25_000_000, plazo: 12 });
  assert.ok(msg && msg.includes('monto'));
});

test('validarSolicitud — monto negativo rechazado', () => {
  assert.ok(validarSolicitud({ tipo: 'libre', monto: -1_000_000, plazo: 12 }));
});

test('validarSolicitud — monto no numerico rechazado', () => {
  assert.ok(validarSolicitud({ tipo: 'libre', monto: 'un millon', plazo: 12 }));
});

test('validarSolicitud — plazo fuera de la lista permitida', () => {
  for (const p of [6, 18, 60, 0]) {
    const msg = validarSolicitud({ tipo: 'libre', monto: 1_000_000, plazo: p });
    assert.ok(msg && msg.includes('plazo'),
      `plazo ${p} debe ser rechazado`);
  }
});

test('validarSolicitud — todos los plazos permitidos son aceptados', () => {
  for (const p of PLAZOS_OK) {
    assert.strictEqual(
      validarSolicitud({ tipo: 'libre', monto: 1_000_000, plazo: p }),
      null,
    );
  }
});

/* ============================================================
   CP-50 — Pago de una cuota (planearPago modo='cuota')
   ============================================================ */

/* Credito de prueba: María Gómez, libre 3M a 12m. Los numeros vienen
   del e2e documentado en docs/MODULO_CREDITO.md §9. */
function creditoLibre3M() {
  return {
    id: 1,
    tipo: 'libre',
    monto: 3_000_000,
    plazo_meses: 12,
    tasa_mensual: 0.025,
    cuota: 292_461,
    total_a_pagar: 3_509_532,
    saldo_pendiente: 3_509_532,
    cuotas_pagadas: 0,
    estado: 'activo',
  };
}

test('CP-50a pago de cuota — descuenta la cuota fija del saldo', () => {
  const plan = planearPago(creditoLibre3M(), 'cuota');
  assert.strictEqual(plan.valor, 292_461);
  assert.strictEqual(plan.nuevoSaldo, 3_217_071); // 3.509.532 - 292.461
  assert.strictEqual(plan.nuevasPagadas, 1);
  assert.strictEqual(plan.nuevoEstado, 'activo');
});

test('CP-50b pago de cuota — nota incluye N/plazo y nombre del tipo', () => {
  const plan = planearPago(creditoLibre3M(), 'cuota');
  assert.strictEqual(plan.notaMov, 'Cuota 1/12 crédito libre inversión');
  assert.ok(plan.notaAlerta.includes('cuota 1/12'));
  assert.ok(plan.notaAlerta.includes('libre inversión'));
});

test('CP-50c pago de cuota — la ultima cuota solo cobra lo que falta', () => {
  // Credito con saldo pendiente menor que la cuota fija
  const credito = {
    ...creditoLibre3M(),
    saldo_pendiente: 150_000,  // menor que la cuota de 292.461
    cuotas_pagadas: 11,
  };
  const plan = planearPago(credito, 'cuota');
  assert.strictEqual(plan.valor, 150_000, 'cobra el saldo, no la cuota fija');
  assert.strictEqual(plan.nuevoSaldo, 0);
  assert.strictEqual(plan.nuevasPagadas, 12);
  assert.strictEqual(plan.nuevoEstado, 'pagado',
    'cuando saldo llega a 0, estado pasa a pagado');
});

test('CP-50d pago de cuota — n/n cuando se completa el plazo', () => {
  const credito = {
    ...creditoLibre3M(),
    saldo_pendiente: 292_461,
    cuotas_pagadas: 11,
  };
  const plan = planearPago(credito, 'cuota');
  assert.strictEqual(plan.nuevasPagadas, 12);
  assert.strictEqual(plan.notaMov, 'Cuota 12/12 crédito libre inversión');
});

test('CP-50e invariante del esquema — (estado=pagado) <=> (saldo=0) tras cada pago', () => {
  // Simulamos pagar las 12 cuotas y verificamos la invariante en cada paso
  let credito = creditoLibre3M();
  for (let i = 1; i <= 12; i++) {
    const plan = planearPago(credito, 'cuota');
    assert.strictEqual(
      plan.nuevoEstado === 'pagado',
      plan.nuevoSaldo === 0,
      `paso ${i}: estado y saldo deben coincidir con la invariante del CHECK`,
    );
    credito = {
      ...credito,
      saldo_pendiente: plan.nuevoSaldo,
      cuotas_pagadas: plan.nuevasPagadas,
      estado: plan.nuevoEstado,
    };
  }
  assert.strictEqual(credito.estado, 'pagado', 'al final de las 12 cuotas, pagado');
  assert.strictEqual(credito.saldo_pendiente, 0, 'y saldo cero');
  assert.strictEqual(credito.cuotas_pagadas, 12);
});

/* ============================================================
   CP-51 — Pago total (planearPago modo='total')
   ============================================================ */

test('CP-51a pago total — cobra todo el saldo pendiente', () => {
  const credito = {
    ...creditoLibre3M(),
    saldo_pendiente: 3_217_071, // despues de pagar una cuota
    cuotas_pagadas: 1,
  };
  const plan = planearPago(credito, 'total');
  assert.strictEqual(plan.valor, 3_217_071);
  assert.strictEqual(plan.nuevoSaldo, 0);
  assert.strictEqual(plan.nuevoEstado, 'pagado');
  // El pago total NO incrementa cuotas_pagadas (no es una cuota, es liquidacion)
  assert.strictEqual(plan.nuevasPagadas, 1);
});

test('CP-51b pago total — nota y alerta mencionan "Pago total"', () => {
  const plan = planearPago(creditoLibre3M(), 'total');
  assert.strictEqual(plan.notaMov, 'Pago total crédito libre inversión');
  assert.ok(plan.notaAlerta.includes('el total'));
});

test('CP-51c pago total de un credito recien desembolsado liquida intereses + principal', () => {
  const credito = creditoLibre3M(); // saldo = 3.509.532 (incluye intereses)
  const plan = planearPago(credito, 'total');
  assert.strictEqual(plan.valor, 3_509_532);
  // La diferencia con el principal son los intereses del credito completo
  assert.strictEqual(plan.valor - credito.monto, 509_532);
});

test('CP-51d pago total funciona para los tres tipos', () => {
  for (const tipo of ['libre', 'vehiculo', 'hipoteca']) {
    const plan = planearPago({ ...creditoLibre3M(), tipo }, 'total');
    assert.strictEqual(plan.nuevoEstado, 'pagado');
    assert.strictEqual(plan.nuevoSaldo, 0);
    assert.ok(plan.notaMov.includes(NOMBRES[tipo]),
      `nota de ${tipo} debe mencionar "${NOMBRES[tipo]}"`);
  }
});

/* ============================================================
   CP-52 — Dos pagos simultaneos (concurrencia)
   ============================================================
   La carrera real necesita PostgreSQL para probar FOR UPDATE y la
   verificacion `if (c.estado !== 'activo') throw conflicto(...)`
   dentro de la transaccion. Lo que SI se puede probar aqui son los
   dos post-condiciones que harian al ganador y al perdedor comportarse
   bien incluso si llegaran al mismo tiempo:

   1) El ganador deja el credito en un estado consistente (saldo 0 /
      pagado) — ya cubierto por CP-51a.
   2) El perdedor, al releer el credito ya pagado, debe ser rechazado
      por la validacion de estado del servicio. Esto se puede probar
      verificando que planearPago sobre un credito ya 'pagado'
      calcula un pago de $0 — es decir, no toca el saldo. */

test('CP-52 pago total sobre credito ya pagado no mueve dinero', () => {
  const yaPagado = {
    ...creditoLibre3M(),
    saldo_pendiente: 0,
    cuotas_pagadas: 12,
    estado: 'pagado',
  };
  const plan = planearPago(yaPagado, 'total');
  assert.strictEqual(plan.valor, 0,
    'un pago total sobre saldo 0 no cobra nada (el servicio lo rechaza antes de llamar aqui, pero la aritmetica tambien es segura)');
  assert.strictEqual(plan.nuevoSaldo, 0);
  assert.strictEqual(plan.nuevoEstado, 'pagado');
});

test('CP-52 pago de cuota sobre credito ya pagado tampoco mueve dinero', () => {
  const yaPagado = {
    ...creditoLibre3M(),
    saldo_pendiente: 0,
    cuotas_pagadas: 12,
    estado: 'pagado',
  };
  const plan = planearPago(yaPagado, 'cuota');
  assert.strictEqual(plan.valor, 0,
    'Math.min(cuotaFija, 0) = 0: la aritmetica es robusta');
  assert.strictEqual(plan.nuevoSaldo, 0);
  assert.strictEqual(plan.nuevoEstado, 'pagado');
});
