/* Pruebas de autorizacion por rol (RF-02, RN-04, RN-06).
   No tocan la base de datos: se le pasa al middleware un req falso. */

import test from 'node:test';
import assert from 'node:assert/strict';

import { puede, adminPuedeSobreSaldos, PERMISOS } from '../src/lib/reglas.js';
import { requiereRol, requierePermiso, soloLecturaContable } from '../src/middleware/roles.js';
import { ErrorApp } from '../src/lib/errores.js';

/* Ejecuta un middleware y devuelve el error que paso a next(), o null. */
function correr(middleware, req) {
  let capturado = null;
  let paso = false;
  middleware(req, {}, (e) => { if (e) capturado = e; else paso = true; });
  return { error: capturado, paso };
}

/* ===================== matriz de permisos ===================== */

test('RN-06 el contable no tiene ningun permiso de escritura', () => {
  const escrituras = [
    'transferencia:crear', 'pago:crear', 'bolsillo:crear', 'bolsillo:mover',
    'cuenta:topes', 'admin:estado', 'admin:devolucion', 'admin:cancelacion',
  ];
  for (const p of escrituras) {
    assert.equal(puede('contable', p), false, `contable NO debe poder ${p}`);
  }
  assert.equal(puede('contable', 'contable:resumen'), true);
});

test('el historial global contable lo leen contable y admin, no el cliente', () => {
  assert.equal(puede('contable', 'contable:movimientos'), true);
  assert.equal(puede('admin', 'contable:movimientos'), true);
  assert.equal(puede('usuario', 'contable:movimientos'), false);
});

test('requiereRol admite varios roles a la vez', () => {
  const mw = requiereRol('contable', 'admin');
  assert.equal(correr(mw, { usuario: { rol: 'contable' } }).paso, true);
  assert.equal(correr(mw, { usuario: { rol: 'admin' } }).paso, true);
  assert.equal(correr(mw, { usuario: { rol: 'usuario' } }).error.estado, 403);
});

test('el usuario cliente no alcanza los permisos de admin (CP-36)', () => {
  for (const p of PERMISOS.admin.filter((x) => x.startsWith('admin:'))) {
    assert.equal(puede('usuario', p), false);
  }
});

test('el admin no tiene permisos de cliente sobre dinero (RN-04)', () => {
  for (const p of ['transferencia:crear', 'pago:crear', 'bolsillo:mover', 'cuenta:topes']) {
    assert.equal(puede('admin', p), false, `admin NO debe poder ${p}`);
  }
});

test('un rol inventado no tiene permisos', () => {
  assert.equal(puede('superusuario', 'admin:estado'), false);
  assert.equal(puede(undefined, 'cuenta:leer'), false);
});

test('RN-04 lo unico que el admin hace sobre saldos es devolver o cancelar', () => {
  assert.equal(adminPuedeSobreSaldos('devolucion'), true);
  assert.equal(adminPuedeSobreSaldos('cancelacion'), true);
  for (const accion of ['editar', 'sumar', 'ajustar', 'fijarSaldo', '']) {
    assert.equal(adminPuedeSobreSaldos(accion), false);
  }
});

/* ===================== requiereRol ===================== */

test('requiereRol deja pasar al rol correcto y niega al resto', () => {
  const mw = requiereRol('admin');
  assert.equal(correr(mw, { usuario: { rol: 'admin' } }).paso, true);

  for (const rol of ['usuario', 'contable']) {
    const r = correr(mw, { usuario: { rol } });
    assert.ok(r.error instanceof ErrorApp);
    assert.equal(r.error.estado, 403);
  }
});

test('requiereRol exige sesion', () => {
  const r = correr(requiereRol('admin'), {});
  assert.equal(r.error.estado, 403);
});

/* ===================== requierePermiso ===================== */

test('CP-36 un cliente que invoque una ruta de admin recibe 403', () => {
  const r = correr(requierePermiso('admin:estado'), { usuario: { rol: 'usuario' } });
  assert.equal(r.error.estado, 403);
});

test('CP-36b el contable que invoque una ruta de admin recibe 403 (RN-06)', () => {
  const r = correr(requierePermiso('admin:movimientos'), { usuario: { rol: 'contable' } });
  assert.equal(r.error.estado, 403);
});

test('el cliente si puede transferir y consultar lo suyo', () => {
  for (const p of ['transferencia:crear', 'cuenta:leer', 'movimientos:propios', 'alertas:propias']) {
    assert.equal(correr(requierePermiso(p), { usuario: { rol: 'usuario' } }).paso, true);
  }
});

/* ===================== soloLecturaContable ===================== */

test('RN-06 el contable es bloqueado en cualquier metodo de escritura', () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    const r = correr(soloLecturaContable, {
      usuario: { rol: 'contable' }, method, originalUrl: '/api/transferencias', path: '/transferencias',
    });
    assert.ok(r.error, `${method} debe ser rechazado`);
    assert.equal(r.error.estado, 403);
    assert.match(r.error.message, /solo lectura/i);
  }
});

test('el contable si puede leer (GET) y cambiar su propia contrasena', () => {
  const lectura = correr(soloLecturaContable, {
    usuario: { rol: 'contable' }, method: 'GET', originalUrl: '/api/contable/resumen',
  });
  assert.equal(lectura.paso, true);

  const clave = correr(soloLecturaContable, {
    usuario: { rol: 'contable' }, method: 'POST', originalUrl: '/api/auth/password',
  });
  assert.equal(clave.paso, true);
});

test('soloLecturaContable no estorba a los otros roles', () => {
  for (const rol of ['usuario', 'admin']) {
    const r = correr(soloLecturaContable, {
      usuario: { rol }, method: 'POST', originalUrl: '/api/transferencias',
    });
    assert.equal(r.paso, true);
  }
});
