/* Rutas del cliente: cuenta, movimientos, transferencias, pagos,
   bolsillos y alertas. Todas exigen sesion y rol 'usuario'. */

import { Router } from 'express';
import { requiereAuth } from '../middleware/auth.js';
import { requierePermiso, soloLecturaContable } from '../middleware/roles.js';
import * as cuenta from '../services/cuenta.js';
import * as transferencias from '../services/transferencias.js';
import * as pagos from '../services/pagos.js';
import * as bolsillos from '../services/bolsillos.js';

export const rutasCuenta = Router();
// RN-06: red de seguridad: con sesion ya resuelta, el contable no
// puede alcanzar ninguna entrada de escritura de esta seccion.
rutasCuenta.use(requiereAuth, soloLecturaContable);

/* ---------- cuenta ---------- */

/* GET /api/cuenta/me */
rutasCuenta.get('/cuenta/me', requierePermiso('cuenta:leer'), async (req, res, next) => {
  try {
    res.json(await cuenta.resumen(req.usuario));
  } catch (e) { next(e); }
});

/* PUT /api/cuenta/topes */
rutasCuenta.put('/cuenta/topes', requierePermiso('cuenta:topes'), async (req, res, next) => {
  try {
    const { topeDiario, topeMensual } = req.body || {};
    res.json(await cuenta.guardarTopes(req.usuario, { topeDiario, topeMensual }));
  } catch (e) { next(e); }
});

/* GET /api/cuenta/:cuenta/titular — confirmar destinatario */
rutasCuenta.get('/cuenta/:cuenta/titular', requierePermiso('cuenta:leer'), async (req, res, next) => {
  try {
    res.json(await cuenta.titular(req.params.cuenta, req.usuario));
  } catch (e) { next(e); }
});

/* ---------- movimientos y alertas ---------- */

/* GET /api/movimientos?desde&hasta */
rutasCuenta.get('/movimientos', requierePermiso('movimientos:propios'), async (req, res, next) => {
  try {
    const { desde, hasta } = req.query;
    res.json(await cuenta.movimientos(req.usuario, { desde, hasta }));
  } catch (e) { next(e); }
});

/* GET /api/alertas */
rutasCuenta.get('/alertas', requierePermiso('alertas:propias'), async (req, res, next) => {
  try {
    res.json(await cuenta.alertas(req.usuario));
  } catch (e) { next(e); }
});

/* ---------- dinero ---------- */

/* POST /api/transferencias */
rutasCuenta.post('/transferencias', requierePermiso('transferencia:crear'), async (req, res, next) => {
  try {
    const { cuentaDestino, monto, nota } = req.body || {};
    const r = await transferencias.transferir(req.usuario, { cuentaDestino, monto, nota });
    res.status(201).json(r);
  } catch (e) { next(e); }
});

/* POST /api/pagos */
rutasCuenta.post('/pagos', requierePermiso('pago:crear'), async (req, res, next) => {
  try {
    const { convenio, referencia, valor } = req.body || {};
    const r = await pagos.pagar(req.usuario, { convenio, referencia, valor });
    res.status(201).json(r);
  } catch (e) { next(e); }
});

/* ---------- bolsillos ---------- */

rutasCuenta.get('/bolsillos', requierePermiso('cuenta:leer'), async (req, res, next) => {
  try {
    res.json(await bolsillos.listar(req.usuario));
  } catch (e) { next(e); }
});

/* POST /api/bolsillos */
rutasCuenta.post('/bolsillos', requierePermiso('bolsillo:crear'), async (req, res, next) => {
  try {
    const r = await bolsillos.crear(req.usuario, { nombre: req.body?.nombre });
    res.status(201).json(r);
  } catch (e) { next(e); }
});

/* POST /api/bolsillos/:id/aportar */
rutasCuenta.post('/bolsillos/:id/aportar', requierePermiso('bolsillo:mover'), async (req, res, next) => {
  try {
    const r = await bolsillos.aportar(req.usuario, req.params.id, { monto: req.body?.monto });
    res.status(201).json(r);
  } catch (e) { next(e); }
});

/* POST /api/bolsillos/:id/retirar */
rutasCuenta.post('/bolsillos/:id/retirar', requierePermiso('bolsillo:mover'), async (req, res, next) => {
  try {
    const r = await bolsillos.retirar(req.usuario, req.params.id, { monto: req.body?.monto });
    res.status(201).json(r);
  } catch (e) { next(e); }
});
