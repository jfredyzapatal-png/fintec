/* Pruebas de la logica de negocio pura (sin base de datos).
   Runner nativo: node --test test/
   Cada caso cita la regla de la especificacion que verifica. */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizarMonto, validarMonto, validarMeta, cupoDisponible, cupoDiario, cupoMensual,
  validarTopes, evaluarTransferencia, validarRegistro, validarCambioClave,
  edadEn, siguienteIntento, estaBloqueadoPorIntentos, rangoFechas, iso,
  nuevoNumeroCuenta, fechaCorta, fmt,
  TOPE_DIARIO_DEF, TOPE_MENSUAL_DEF, MAX_INTENTOS, CONVENIOS,
} from '../src/lib/reglas.js';

/* Usuario de prueba equivalente a María Gómez del seed. */
function maria(extra = {}) {
  return {
    doc: '1023456789', cuenta: '001-234-567', nombre: 'María Gómez',
    estado: 'activa', disponible: 2450000,
    tope_diario: TOPE_DIARIO_DEF, tope_mensual: TOPE_MENSUAL_DEF,
    ...extra,
  };
}
function laura(extra = {}) {
  return {
    doc: '1076543210', cuenta: '009-441-220', nombre: 'Laura Díaz',
    estado: 'activa', disponible: 3800000,
    tope_diario: TOPE_DIARIO_DEF, tope_mensual: TOPE_MENSUAL_DEF,
    ...extra,
  };
}

/* ===================== montos ===================== */

test('normalizarMonto redondea a pesos enteros', () => {
  assert.equal(normalizarMonto('180000'), 180000);
  assert.equal(normalizarMonto(1000.4), 1000);
  assert.equal(normalizarMonto(1000.6), 1001);
  assert.ok(Number.isNaN(normalizarMonto('no-es-numero')));
});

test('validarMonto rechaza cero, negativo y basura (CP-04, CP-05)', () => {
  assert.match(validarMonto(0), /mayor que cero/i);
  assert.match(validarMonto(-100), /mayor que cero/i);
  assert.match(validarMonto(''), /mayor que cero/i);
  assert.match(validarMonto('abc'), /mayor que cero/i);
  assert.equal(validarMonto(100000), null);
  assert.equal(validarMonto('180000'), null);
});

test('validarMeta acepta vacio como sin meta y rechaza negativos', () => {
  assert.deepEqual(validarMeta(''), { meta: 0 });
  assert.deepEqual(validarMeta(undefined), { meta: 0 });
  assert.deepEqual(validarMeta(1000000), { meta: 1000000 });
  assert.deepEqual(validarMeta('1000000.6'), { meta: 1000001 });
  assert.match(validarMeta(-1).error, /cero o un monto mayor/i);
  assert.match(validarMeta('abc').error, /cero o un monto mayor/i);
});

test('fmt da formato de pesos colombianos', () => {
  assert.equal(fmt(180000), '$180.000');
  assert.equal(fmt(0), '$0');
});

/* ===================== topes y cupos (RF-04) ===================== */

test('cupoDisponible nunca es negativo', () => {
  assert.equal(cupoDisponible(5000000, 1000000), 4000000);
  assert.equal(cupoDisponible(5000000, 5000000), 0);
  assert.equal(cupoDisponible(5000000, 9000000), 0);
});

test('el cupo diario se consume con cada envio (CP-42)', () => {
  const u = maria({ tope_diario: 150000, tope_mensual: 1000000 });
  assert.equal(cupoDiario(u, 0), 150000);
  assert.equal(cupoDiario(u, 100000), 50000);
  assert.equal(cupoMensual(u, 100000), 900000);
});

test('validarTopes exige mayores que cero y diario <= mensual (CP-43)', () => {
  assert.equal(validarTopes(50000, 1000000), null);
  assert.equal(validarTopes(500000, 500000), null, 'diario igual al mensual es válido');
  assert.match(validarTopes(0, 1000000), /mayores que cero/i);
  assert.match(validarTopes(-5, 1000000), /mayores que cero/i);
  assert.match(validarTopes(1000000, 0), /mayores que cero/i);
  assert.match(validarTopes(900000, 500000), /no puede superar/i);
});

/* ===================== decision de transferencia ===================== */

test('CP-01 transferencia valida se aprueba', () => {
  const v = evaluarTransferencia({ origen: maria(), destino: laura(), monto: 100000 });
  assert.equal(v.ok, true);
  assert.equal(v.monto, 100000);
});

test('CP-02 monto igual al disponible se aprueba (valor limite)', () => {
  const v = evaluarTransferencia({ origen: maria(), destino: laura(), monto: 2450000 });
  assert.equal(v.ok, true);
});

test('CP-03 saldo insuficiente: rechazada CON registro y motivo (RN-01, RN-03)', () => {
  const v = evaluarTransferencia({ origen: maria(), destino: laura(), monto: 5000000 });
  assert.equal(v.ok, false);
  assert.equal(v.registrar, true, 'debe quedar un movimiento Rechazada');
  assert.equal(v.motivo, 'Saldo insuficiente');
  assert.match(v.mensaje, /saldo insuficiente/i);
});

test('CP-04/CP-05 monto cero o negativo: NO genera movimiento', () => {
  for (const monto of [0, -100]) {
    const v = evaluarTransferencia({ origen: maria(), destino: laura(), monto });
    assert.equal(v.ok, false);
    assert.equal(v.registrar, false, 'un error de forma no deja movimiento');
  }
});

test('CP-06 cuenta destino bloqueada: rechazo sin movimiento (RN-07)', () => {
  const v = evaluarTransferencia({
    origen: maria(), destino: laura({ estado: 'bloqueada' }), monto: 50000,
  });
  assert.equal(v.ok, false);
  assert.equal(v.registrar, false);
  assert.match(v.mensaje, /bloqueada/i);
});

test('CP-07 cuenta destino inexistente: rechazo sin movimiento', () => {
  const v = evaluarTransferencia({ origen: maria(), destino: null, monto: 50000 });
  assert.equal(v.ok, false);
  assert.equal(v.registrar, false);
  assert.match(v.mensaje, /no existe/i);
});

test('CP-40 no se puede transferir a la propia cuenta', () => {
  const v = evaluarTransferencia({ origen: maria(), destino: maria(), monto: 50000 });
  assert.equal(v.ok, false);
  assert.equal(v.registrar, false);
  assert.match(v.mensaje, /propia cuenta/i);
});

test('CP-41 por encima del tope diario: Rechazada con motivo y registro (RF-04)', () => {
  const u = maria({ tope_diario: 50000, tope_mensual: 1000000 });
  const v = evaluarTransferencia({ origen: u, destino: laura(), monto: 60000 });
  assert.equal(v.ok, false);
  assert.equal(v.registrar, true);
  assert.equal(v.motivo, 'Supera el tope diario');
  assert.match(v.mensaje, /tope diario/i);
});

test('el cupo ya consumido se tiene en cuenta (CP-42)', () => {
  const u = maria({ tope_diario: 150000, tope_mensual: 1000000 });
  assert.equal(
    evaluarTransferencia({ origen: u, destino: laura(), monto: 100000, enviadoHoy: 0 }).ok,
    true,
  );
  const v = evaluarTransferencia({ origen: u, destino: laura(), monto: 60000, enviadoHoy: 100000 });
  assert.equal(v.ok, false);
  assert.equal(v.motivo, 'Supera el tope diario');
});

test('tope mensual excedido se rechaza con su propio motivo (RF-04)', () => {
  const u = maria({ disponible: 20000000, tope_diario: 5000000, tope_mensual: 6000000 });
  const v = evaluarTransferencia({
    origen: u, destino: laura(), monto: 2000000, enviadoHoy: 0, enviadoMes: 5000000,
  });
  assert.equal(v.ok, false);
  assert.equal(v.registrar, true);
  assert.equal(v.motivo, 'Supera el tope mensual');
});

test('el saldo insuficiente se evalua ANTES que los topes', () => {
  // monto que supera disponible Y tope diario: el motivo debe ser el saldo
  const u = maria({ disponible: 1000, tope_diario: 500 });
  const v = evaluarTransferencia({ origen: u, destino: laura(), monto: 900000 });
  assert.equal(v.motivo, 'Saldo insuficiente');
});

/* ===================== registro (RF-01) ===================== */

test('CP-16 registro valido pasa todas las validaciones', () => {
  assert.equal(validarRegistro({
    doc: '1111222233', nombre: 'Persona Nueva', clave: 'clave12345',
    correo: 'persona@correo.com', nacimiento: '1995-05-10',
  }), null);
});

test('CP-18 contrasena menor a 8 caracteres se rechaza', () => {
  const e = validarRegistro({ doc: '1111222233', nombre: 'X Y', clave: 'corta' });
  assert.match(e, /8 caracteres/i);
});

test('CP-19 correo con formato invalido se rechaza', () => {
  const e = validarRegistro({
    doc: '1111222233', nombre: 'X Y', clave: 'clave12345', correo: 'no-es-correo',
  });
  assert.match(e, /correo/i);
});

test('CP-21 nombre faltante: dato obligatorio', () => {
  const e = validarRegistro({ doc: '1111222233', nombre: '', clave: 'clave12345' });
  assert.match(e, /obligatorio/i);
});

test('CP-22 documento con formato invalido se rechaza', () => {
  assert.match(validarRegistro({ doc: 'ab', nombre: 'X Y', clave: 'clave12345' }), /documento inv/i);
  assert.match(validarRegistro({ doc: '1234', nombre: 'X Y', clave: 'clave12345' }), /documento inv/i);
  assert.match(
    validarRegistro({ doc: '1234567890123456', nombre: 'X Y', clave: 'clave12345' }),
    /documento inv/i,
  );
  assert.match(
    validarRegistro({ doc: '123 456', nombre: 'X Y', clave: 'clave12345' }),
    /documento inv/i,
  );
});

test('CP-20 menor de 18 anios se rechaza (valor limite exacto)', () => {
  const hoy = new Date(2026, 5, 15);
  const base = { doc: '1111222233', nombre: 'X Y', clave: 'clave12345' };

  // cumple 18 manana -> rechazado
  const casiMayor = iso(new Date(hoy.getFullYear() - 18, hoy.getMonth(), hoy.getDate() + 1));
  assert.match(validarRegistro({ ...base, nacimiento: casiMayor }, hoy), /18 a/i);

  // cumple 18 justo hoy -> aceptado
  const hoyCumple = iso(new Date(hoy.getFullYear() - 18, hoy.getMonth(), hoy.getDate()));
  assert.equal(validarRegistro({ ...base, nacimiento: hoyCumple }, hoy), null);
});

test('edad imposible o fecha invalida se rechazan', () => {
  const base = { doc: '1111222233', nombre: 'X Y', clave: 'clave12345' };
  assert.match(validarRegistro({ ...base, nacimiento: '1800-01-01' }), /fecha de nacimiento/i);
  assert.match(validarRegistro({ ...base, nacimiento: 'no-es-fecha' }), /inválida/i);
});

test('edadEn calcula bien el cumpleanios no cumplido en el anio', () => {
  const hoy = new Date(2026, 0, 10); // 10 de enero de 2026
  assert.equal(edadEn('1996-04-12', hoy), 29);
  assert.equal(edadEn('1996-01-10', hoy), 30);
  assert.equal(edadEn('1996-01-11', hoy), 29);
});

/* ===================== cambio de clave (RF-06) ===================== */

test('CP-32 la nueva contrasena debe ser distinta de la actual', () => {
  assert.match(validarCambioClave({ actual: 'maria123', nueva: 'maria123' }), /distinta/i);
});

test('la nueva contrasena debe tener al menos 8 caracteres', () => {
  assert.match(validarCambioClave({ actual: 'maria123', nueva: 'corta' }), /8 caracteres/i);
});

test('cambio valido pasa la validacion pura', () => {
  assert.equal(validarCambioClave({ actual: 'maria123', nueva: 'nuevaClave1' }), null);
});

/* ===================== bloqueo por intentos (RNF-02) ===================== */

test('CP-14 el quinto intento fallido bloquea 15 minutos', () => {
  const ahora = Date.now();
  let intentos = 0;
  for (let i = 1; i < MAX_INTENTOS; i++) {
    const paso = siguienteIntento(intentos, ahora);
    intentos = paso.intentos;
    assert.equal(paso.bloqueado, false, `el intento ${i} no debe bloquear`);
    assert.equal(paso.restantes, MAX_INTENTOS - i);
  }
  const quinto = siguienteIntento(intentos, ahora);
  assert.equal(quinto.bloqueado, true);
  const minutos = Math.round((quinto.bloqueadoHasta.getTime() - ahora) / 60000);
  assert.equal(minutos, 15);
  assert.equal(quinto.intentos, 0, 'el contador se reinicia al bloquear');
});

test('estaBloqueadoPorIntentos respeta la ventana de tiempo', () => {
  const ahora = Date.now();
  assert.equal(estaBloqueadoPorIntentos(null, ahora), false);
  assert.equal(estaBloqueadoPorIntentos(new Date(ahora + 60000), ahora), true);
  assert.equal(estaBloqueadoPorIntentos(new Date(ahora - 60000), ahora), false);
});

/* ===================== fechas y rangos (RF-07, RF-08) ===================== */

test('rangoFechas cubre el dia completo de "hasta"', () => {
  const r = rangoFechas('2026-01-01', '2026-01-31');
  assert.equal(r.error, undefined);
  assert.equal(r.desde.getHours(), 0);
  assert.equal(r.hasta.getHours(), 23);
  assert.equal(r.hasta.getMinutes(), 59);
});

test('rangoFechas rechaza desde > hasta (CA-08.1)', () => {
  assert.match(rangoFechas('2026-02-01', '2026-01-01').error, /menor o igual/i);
});

test('rangoFechas sin parametros usa el mes en curso', () => {
  const hoy = new Date(2026, 5, 15);
  const r = rangoFechas(undefined, undefined, hoy);
  assert.equal(iso(r.desde), '2026-06-01');
  assert.equal(iso(r.hasta), '2026-06-15');
});

test('fechaCorta tiene el formato dd/mm hh:mm que exige CP-30', () => {
  assert.match(fechaCorta(new Date(2026, 3, 9, 7, 5)), /^\d{2}\/\d{2}\s\d{2}:\d{2}$/);
});

test('nuevoNumeroCuenta respeta el patron del prototipo', () => {
  const c = nuevoNumeroCuenta(6, () => 0.5);
  assert.match(c, /^001-\d{3}-\d{3}$/);
  assert.equal(c, '001-106-550');
});

test('los convenios son los cuatro del prototipo', () => {
  assert.deepEqual(CONVENIOS, ['EPM', 'Universidad', 'Acueducto', 'Claro']);
});
