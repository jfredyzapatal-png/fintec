/* Bateria de pruebas FINTEC — CP-01 a CP-37
   Los resultados esperados se toman de la especificacion de requisitos
   (RF/RN/RNF y escenarios 1 a 4), no del comportamiento observado del codigo. */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { cargarApp, conSesion, errorDe, toast, pantalla } from './app.mjs';

const MARIA = '1023456789', CARLOS = '1098765432', LAURA = '1076543210';
const CTA_LAURA = '009-441-220', CTA_CARLOS = '001-880-112';

/* Prepara la pantalla de transferencia con los datos indicados */
function llenarTransferencia(app, cuenta, monto, nota) {
  app.go('u-transferir');
  app.el('tr-cuenta').value = cuenta;
  app.el('tr-monto').value = String(monto);
  app.el('tr-nota').value = nota || '';
}

/* La transferencia es en dos pasos: transferir() valida y pide confirmar el
   destinatario, confirmarTransferencia() mueve el dinero. */
function enviar(app, cuenta, monto, nota) {
  llenarTransferencia(app, cuenta, monto, nota);
  app.transferir();
  app.confirmarTransferencia();
}

afterEach(() => { vi.useRealTimers(); });

/* ===================== RF-04 / RN-01 — Escenario 1 ===================== */
describe('RF-04 Transferencias (Escenario 1)', () => {

  it('CP-01 transferencia valida descuenta, acredita y notifica a ambos', async () => {
    const app = await conSesion(MARIA, 'maria123');
    enviar(app, CTA_LAURA, 100000, 'Prueba');

    expect(app.BANCO.usuarios[MARIA].disponible).toBe(2350000);
    expect(app.BANCO.usuarios[LAURA].disponible).toBe(3900000);
    const mov = app.BANCO.movimientos[0];
    expect(mov.estado).toBe('Completada');
    expect(mov.valor).toBe(100000);
    expect(app.BANCO.usuarios[MARIA].alertas[0].texto).toMatch(/Enviada/i);
    expect(app.BANCO.usuarios[LAURA].alertas[0].texto).toMatch(/Recibida/i);
  });

  it('CP-02 monto igual al disponible deja el saldo en cero', async () => {
    const app = await conSesion(MARIA, 'maria123');
    enviar(app, CTA_LAURA, 2450000);

    expect(app.BANCO.usuarios[MARIA].disponible).toBe(0);
    expect(app.BANCO.movimientos[0].estado).toBe('Completada');
  });

  it('CP-03 saldo insuficiente: estado Rechazada, motivo y saldos intactos (RN-01)', async () => {
    const app = await conSesion(MARIA, 'maria123');
    llenarTransferencia(app, CTA_LAURA, 5000000);
    app.transferir();

    expect(app.BANCO.usuarios[MARIA].disponible).toBe(2450000);
    expect(app.BANCO.usuarios[LAURA].disponible).toBe(3800000);
    const mov = app.BANCO.movimientos[0];
    expect(mov.estado).toBe('Rechazada');
    expect(mov.nota).toMatch(/saldo insuficiente/i);
    expect(errorDe(app, 'tr-error')).toMatch(/saldo insuficiente/i);
  });

  it('CP-04 monto cero: mensaje y ningun movimiento', async () => {
    const app = await conSesion(MARIA, 'maria123');
    const antes = app.BANCO.movimientos.length;
    llenarTransferencia(app, CTA_LAURA, 0);
    app.transferir();

    expect(errorDe(app, 'tr-error')).toMatch(/mayor que cero/i);
    expect(app.BANCO.movimientos.length).toBe(antes);
  });

  it('CP-05 monto negativo: mensaje y ningun movimiento', async () => {
    const app = await conSesion(MARIA, 'maria123');
    const antes = app.BANCO.movimientos.length;
    llenarTransferencia(app, CTA_LAURA, -100);
    app.transferir();

    expect(errorDe(app, 'tr-error')).toBeTruthy();
    expect(app.BANCO.movimientos.length).toBe(antes);
  });

  it('CP-06 cuenta destino bloqueada: rechazo sin movimiento (RN-07)', async () => {
    const app = await conSesion(MARIA, 'maria123');
    app.BANCO.usuarios[LAURA].estado = 'bloqueada';
    const antes = app.BANCO.movimientos.length;
    llenarTransferencia(app, CTA_LAURA, 50000);
    app.transferir();

    expect(errorDe(app, 'tr-error')).toMatch(/bloqueada/i);
    expect(app.BANCO.movimientos.length).toBe(antes);
  });

  it('CP-07 cuenta destino inexistente: mensaje y ningun movimiento', async () => {
    const app = await conSesion(MARIA, 'maria123');
    const antes = app.BANCO.movimientos.length;
    llenarTransferencia(app, '000-000-000', 50000);
    app.transferir();

    expect(errorDe(app, 'tr-error')).toMatch(/no existe/i);
    expect(app.BANCO.movimientos.length).toBe(antes);
  });

  it('CP-08 si el admin bloquea la cuenta en sesion, se cierra la sesion (RN-07)', async () => {
    const app = await conSesion(MARIA, 'maria123');
    app.alternarBloqueo(MARIA);
    app.go('u-transferir');

    expect(app.__getSesion()).toBeNull();
    expect(pantalla()).toBe('login');
  });
});

/* ===== RF-04 — confirmacion de destinatario y topes configurables ===== */
describe('RF-04 Confirmacion de destinatario y topes', () => {

  it('CP-38 antes de mover dinero se muestra el nombre del titular', async () => {
    const app = await conSesion(MARIA, 'maria123');
    llenarTransferencia(app, CTA_LAURA, 100000);
    app.transferir();

    const panel = app.el('tr-confirma').textContent;
    expect(panel).toContain('Laura Díaz');
    expect(panel).toContain(app.fmt(100000));
    // todavia no se movio nada
    expect(app.BANCO.usuarios[MARIA].disponible).toBe(2450000);
    expect(app.BANCO.usuarios[LAURA].disponible).toBe(3800000);
  });

  it('CP-39 cancelar en la confirmacion no mueve dinero', async () => {
    const app = await conSesion(MARIA, 'maria123');
    const antes = app.BANCO.movimientos.length;
    llenarTransferencia(app, CTA_LAURA, 100000);
    app.transferir();
    app.cancelarTransferencia();

    expect(app.el('tr-confirma').innerHTML).toBe('');
    expect(app.BANCO.usuarios[MARIA].disponible).toBe(2450000);
    expect(app.BANCO.movimientos.length).toBe(antes);
  });

  it('CP-40 no se puede transferir a la propia cuenta', async () => {
    const app = await conSesion(MARIA, 'maria123');
    const antes = app.BANCO.movimientos.length;
    llenarTransferencia(app, '001-234-567', 50000);
    app.transferir();

    expect(errorDe(app, 'tr-error')).toMatch(/propia cuenta/i);
    expect(app.BANCO.movimientos.length).toBe(antes);
  });

  it('CP-41 un monto por encima del tope diario se rechaza y queda registrado', async () => {
    const app = await conSesion(MARIA, 'maria123');
    app.go('u-notificaciones');
    app.el('tp-diario').value = '50000';
    app.el('tp-mensual').value = '1000000';
    app.guardarTopes();
    expect(app.BANCO.usuarios[MARIA].topeDiario).toBe(50000);

    llenarTransferencia(app, CTA_LAURA, 60000);
    app.transferir();

    expect(errorDe(app, 'tr-error')).toMatch(/tope diario/i);
    expect(app.BANCO.movimientos[0].estado).toBe('Rechazada');
    expect(app.BANCO.movimientos[0].nota).toMatch(/tope diario/i);
    expect(app.BANCO.usuarios[MARIA].disponible).toBe(2450000);
  });

  it('CP-42 el cupo diario se consume con cada envio', async () => {
    const app = await conSesion(MARIA, 'maria123');
    app.go('u-notificaciones');
    app.el('tp-diario').value = '150000';
    app.el('tp-mensual').value = '1000000';
    app.guardarTopes();

    expect(app.cupoDiario(app.__getSesion())).toBe(150000);
    enviar(app, CTA_LAURA, 100000);
    expect(app.cupoDiario(app.__getSesion())).toBe(50000);

    // el siguiente envio ya no cabe en el cupo
    llenarTransferencia(app, CTA_LAURA, 60000);
    app.transferir();
    expect(errorDe(app, 'tr-error')).toMatch(/tope diario/i);
  });

  it('CP-43 el tope diario no puede superar al mensual', async () => {
    const app = await conSesion(MARIA, 'maria123');
    app.go('u-notificaciones');
    app.el('tp-diario').value = '900000';
    app.el('tp-mensual').value = '500000';
    app.guardarTopes();

    expect(errorDe(app, 'tp-error')).toMatch(/no puede superar/i);
    expect(app.BANCO.usuarios[MARIA].topeDiario).toBe(app.TOPE_DIARIO_DEF);
  });

  it('CP-44 el sistema arranca con 6 clientes y $18.000.000', async () => {
    const app = await cargarApp();
    const cs = app.clientes();
    const total = cs.reduce((s, u) => s + u.disponible + app.totalBolsillos(u), 0);

    expect(cs).toHaveLength(6);
    expect(total).toBe(18000000);
  });
});

/* ===================== RF-02 / RNF-02 — Escenario 2 ===================== */
describe('RF-02 Autenticacion (Escenario 2)', () => {

  it('CP-09 usuario valido entra a su dashboard', async () => {
    const app = await conSesion(MARIA, 'maria123');
    expect(app.__getSesion().nombre).toBe('María Gómez');
    expect(pantalla()).toBe('u-inicio');
  });

  it('CP-10 admin entra al panel administrativo', async () => {
    await conSesion('admin', 'admin123');
    expect(pantalla()).toBe('a-panel');
  });

  it('CP-11 contable entra al panel contable', async () => {
    await conSesion('contable', 'conta123');
    expect(pantalla()).toBe('c-panel');
  });

  it('CP-12 contrasena incorrecta: mensaje generico que no revela el dato (CA-02.2)', async () => {
    const app = await cargarApp();
    app.rellenar(MARIA, 'incorrecta');
    app.entrar();

    const msg = errorDe(app, 'lg-error');
    expect(msg).toMatch(/usuario o contrase/i);
    expect(msg).not.toMatch(/contraseña incorrecta$|documento no existe/i);
    expect(app.__getSesion()).toBeNull();
  });

  it('CP-13 documento inexistente: mismo mensaje generico', async () => {
    const app = await cargarApp();
    app.rellenar('0000000000', 'loquesea');
    app.entrar();

    expect(errorDe(app, 'lg-error')).toMatch(/usuario o contrase/i);
  });

  it('CP-14 bloqueo de 15 min tras 5 intentos, solo para ese documento (RNF-02)', async () => {
    const app = await cargarApp();
    app.rellenar(MARIA, 'mala');
    for (let i = 0; i < 5; i++) app.entrar();
    expect(errorDe(app, 'lg-error')).toMatch(/bloquea/i);
    expect(errorDe(app, 'lg-error')).toMatch(/15/);

    // la cuenta bloqueada no entra ni con la clave correcta
    app.rellenar(MARIA, 'maria123');
    app.entrar();
    expect(app.__getSesion()).toBeNull();

    // otra cuenta no queda afectada
    app.rellenar(CARLOS, 'carlos123');
    app.entrar();
    expect(app.__getSesion().nombre).toBe('Carlos Ruiz');
  });

  it('CP-15 cuenta bloqueada por el administrador no inicia sesion (RN-07)', async () => {
    const app = await cargarApp();
    app.BANCO.usuarios[CARLOS].estado = 'bloqueada';
    app.rellenar(CARLOS, 'carlos123');
    app.entrar();

    expect(errorDe(app, 'lg-error')).toMatch(/bloqueada/i);
    expect(app.__getSesion()).toBeNull();
  });
});

/* ===================== RF-01 — Escenario 3 ===================== */
describe('RF-01 Registro (Escenario 3)', () => {

  function llenarRegistro(app, datos) {
    app.go('registro');
    app.el('rg-doc').value = datos.doc ?? '1111222233';
    app.el('rg-nombre').value = datos.nombre ?? 'Persona Nueva';
    app.el('rg-pass').value = datos.pass ?? 'clave12345';
    app.el('rg-correo').value = datos.correo ?? 'persona@correo.com';
    app.el('rg-nac').value = datos.nac ?? '1995-05-10';
  }

  it('CP-16 registro valido crea la cuenta activa con saldo cero (CA-01.2)', async () => {
    const app = await cargarApp();
    llenarRegistro(app, {});
    app.registrar();

    const u = app.BANCO.usuarios['1111222233'];
    expect(u).toBeDefined();
    expect(u.disponible).toBe(0);
    expect(u.estado).toBe('activa');

    app.rellenar('1111222233', 'clave12345');
    app.entrar();
    expect(app.__getSesion().nombre).toBe('Persona Nueva');
  });

  it('CP-17 documento duplicado: rechaza y no crea cuenta', async () => {
    const app = await cargarApp();
    const antes = Object.keys(app.BANCO.usuarios).length;
    llenarRegistro(app, { doc: MARIA });
    app.registrar();

    expect(errorDe(app, 'rg-error')).toMatch(/ya tiene una cuenta|ya se encuentra registrado/i);
    expect(Object.keys(app.BANCO.usuarios).length).toBe(antes);
  });

  it('CP-18 contrasena menor a 8 caracteres: rechaza', async () => {
    const app = await cargarApp();
    llenarRegistro(app, { pass: 'corta' });
    app.registrar();

    expect(errorDe(app, 'rg-error')).toMatch(/8 caracteres/i);
    expect(app.BANCO.usuarios['1111222233']).toBeUndefined();
  });

  it('CP-19 correo con formato invalido: rechaza', async () => {
    const app = await cargarApp();
    llenarRegistro(app, { correo: 'no-es-correo' });
    app.registrar();

    expect(errorDe(app, 'rg-error')).toMatch(/correo/i);
    expect(app.BANCO.usuarios['1111222233']).toBeUndefined();
  });

  it('CP-20 menor de 18 anios: rechaza (valor limite)', async () => {
    const app = await cargarApp();
    const hoy = new Date();
    const casiMayor = new Date(hoy.getFullYear() - 18, hoy.getMonth(), hoy.getDate() + 1);
    llenarRegistro(app, { nac: app.iso(casiMayor) });
    app.registrar();

    expect(errorDe(app, 'rg-error')).toMatch(/18 a/i);
    expect(app.BANCO.usuarios['1111222233']).toBeUndefined();
  });

  it('CP-21 nombre faltante: rechaza por dato obligatorio', async () => {
    const app = await cargarApp();
    llenarRegistro(app, { nombre: '' });
    app.registrar();

    expect(errorDe(app, 'rg-error')).toMatch(/obligatorio/i);
  });

  it('CP-22 documento con formato invalido: rechaza', async () => {
    const app = await cargarApp();
    llenarRegistro(app, { doc: 'ab' });
    app.registrar();

    expect(errorDe(app, 'rg-error')).toMatch(/documento inv/i);
  });
});

/* ===================== RF-05 / RN-05 — Escenario 4 ===================== */
describe('RF-05 Gestion administrativa (Escenario 4)', () => {

  async function adminConTransferencia() {
    const app = await conSesion(MARIA, 'maria123');
    enviar(app, CTA_LAURA, 100000, 'Para devolver');
    const tx = app.BANCO.movimientos.find(m => m.tipo === 'Transferencia' && m.estado === 'Completada' && !m.revertida);
    app.salir();
    app.rellenar('admin', 'admin123');
    app.entrar();
    return { app, tx };
  }

  it('CP-23 devolucion crea reversion enlazada y restablece saldos (RN-05)', async () => {
    const { app, tx } = await adminConTransferencia();
    app.devolver(tx.id);

    expect(app.BANCO.usuarios[MARIA].disponible).toBe(2450000);
    expect(app.BANCO.usuarios[LAURA].disponible).toBe(3800000);
    const rev = app.BANCO.movimientos[0];
    expect(rev.tipo).toBe('Reversión');
    expect(rev.origenReversion).toBe(tx.id);
    expect(tx.estado).toBe('Completada');          // RN-05: el original no se edita
    expect(app.BANCO.usuarios[MARIA].alertas[0].texto).toMatch(/devoluci/i);
    expect(app.BANCO.usuarios[LAURA].alertas[0].texto).toMatch(/devolvi/i);
  });

  it('CP-24 devolver dos veces: mensaje de la especificacion y boton deshabilitado', async () => {
    const { app, tx } = await adminConTransferencia();
    app.devolver(tx.id);
    app.devolver(tx.id);

    expect(errorDe(app, 'ad-error')).toBe('Este movimiento ya fue revertido.');
    const botones = [...document.querySelectorAll('#b-admin button')];
    expect(botones.some(b => b.disabled)).toBe(true);
  });

  it('CP-25 destino sin saldo suficiente: rechaza y no mueve dinero', async () => {
    const { app, tx } = await adminConTransferencia();
    app.BANCO.usuarios[LAURA].disponible = 0;
    const saldoMaria = app.BANCO.usuarios[MARIA].disponible;
    app.devolver(tx.id);

    expect(errorDe(app, 'ad-error')).toMatch(/saldo suficiente/i);
    expect(app.BANCO.usuarios[MARIA].disponible).toBe(saldoMaria);
    expect(app.BANCO.usuarios[LAURA].disponible).toBe(0);
  });

  it('CP-26 cancelacion deja el original en estado Cancelada (CA-04.1)', async () => {
    const { app, tx } = await adminConTransferencia();
    app.cancelar(tx.id);

    expect(tx.estado).toBe('Cancelada');
    const canc = app.BANCO.movimientos[0];
    expect(canc.tipo).toBe('Cancelación');
    expect(canc.origenReversion).toBe(tx.id);
    expect(app.BANCO.usuarios[MARIA].disponible).toBe(2450000);
    expect(app.BANCO.usuarios[LAURA].disponible).toBe(3800000);
  });

  it('CP-23b el administrador busca por documento, cuenta y correo (CA-05.1)', async () => {
    const app = await conSesion('admin', 'admin123');
    const nombres = () => [...document.querySelectorAll('#b-admin tbody tr')]
      .map(t => t.cells[0].textContent);

    app.el('ad-busca').value = 'laura.diaz@correo.com'; app.buscar();
    expect(nombres()).toContain('Laura Díaz');

    app.el('ad-busca').value = CTA_CARLOS; app.buscar();
    expect(nombres()).toContain('Carlos Ruiz');

    app.el('ad-busca').value = MARIA; app.buscar();
    expect(nombres()).toContain('María Gómez');
  });
});

/* ========== RF-05 — resumen, detalle e historial del administrador ========== */
describe('RF-05 Panel del administrador: ver', () => {

  it('CP-45 el resumen muestra cuentas activas y el dinero en custodia', async () => {
    const app = await conSesion('admin', 'admin123');
    const tarjetas = [...document.querySelectorAll('#b-admin .grid .card .d')].map(x => x.textContent);

    expect(tarjetas[0]).toBe('6');                 // 6 clientes activos
    expect(tarjetas[1]).toBe(app.fmt(18000000));   // dinero en custodia
  });

  it('CP-46 el detalle de una cuenta muestra saldos, topes y sus movimientos', async () => {
    const app = await conSesion('admin', 'admin123');
    app.verUsuario(MARIA);
    const t = app.el('ad-detalle').textContent;

    expect(t).toContain('María Gómez');
    expect(t).toContain(app.fmt(2450000));      // disponible
    expect(t).toContain(app.fmt(1150000));      // en bolsillos
    expect(t).toContain('maria.gomez@correo.com');
    expect(t).toContain(app.fmt(app.TOPE_DIARIO_DEF));
    expect(t).toContain('TX-');                 // al menos un movimiento

    app.cerrarDetalle();
    expect(app.el('ad-detalle').innerHTML).toBe('');
  });

  it('CP-47 el historial global lista las operaciones de todas las cuentas', async () => {
    const app = await conSesion('admin', 'admin123');
    app.go('a-movimientos');
    const filas = () => [...document.querySelectorAll('#b-amovimientos tbody tr')];

    expect(filas().length).toBe(app.BANCO.movimientos.length);
  });

  it('CP-48 el historial se filtra por estado y por cuenta', async () => {
    const app = await conSesion('admin', 'admin123');
    app.go('a-movimientos');

    app.el('am-estado').value = 'Rechazada';
    app.filtrarMovimientos();
    const rechazadas = [...document.querySelectorAll('#b-amovimientos tbody tr')];
    expect(rechazadas.length).toBe(app.BANCO.movimientos.filter(m => m.estado === 'Rechazada').length);
    expect(rechazadas.every(t => t.textContent.includes('Rechazada'))).toBe(true);

    app.limpiarFiltroMovimientos();
    expect([...document.querySelectorAll('#b-amovimientos tbody tr')].length)
      .toBe(app.BANCO.movimientos.length);

    app.el('am-cuenta').value = '000-000-000';
    app.filtrarMovimientos();
    expect(app.el('b-amovimientos').textContent).toMatch(/Ningún movimiento coincide/i);
  });
});

/* ===================== RF-03 / RN-02 Bolsillos ===================== */
describe('RF-03 y RN-02 Saldos y bolsillos', () => {

  it('CP-27 el total suma disponible mas bolsillos, sin mezclarlos (CA-03.1/03.2)', async () => {
    const app = await conSesion(MARIA, 'maria123');
    const u = app.__getSesion();

    expect(u.disponible).toBe(2450000);
    expect(app.totalBolsillos(u)).toBe(1150000);
    expect(u.disponible + app.totalBolsillos(u)).toBe(3600000);
  });

  it('CP-28 aportar y retirar mueven dinero solo dentro de la misma cuenta', async () => {
    const app = await conSesion(MARIA, 'maria123');
    app.go('u-bolsillos');
    app.el('bl-m0').value = '200000';
    app.aportar(0);

    expect(app.__getSesion().disponible).toBe(2250000);
    expect(app.__getSesion().bolsillos[0].saldo).toBe(1000000);

    app.el('bl-m0').value = '50000';
    app.retirar(0);
    expect(app.__getSesion().disponible).toBe(2300000);
    expect(app.__getSesion().bolsillos[0].saldo).toBe(950000);
  });

  it('CP-29 aportar mas que el disponible: rechaza sin cambios', async () => {
    const app = await conSesion(MARIA, 'maria123');
    app.go('u-bolsillos');
    app.el('bl-m0').value = '99999999';
    app.aportar(0);

    expect(errorDe(app, 'bl-error')).toMatch(/no tienes ese disponible/i);
    expect(app.__getSesion().disponible).toBe(2450000);
    expect(app.__getSesion().bolsillos[0].saldo).toBe(800000);
  });
});

/* ===================== RF-06 Notificaciones ===================== */
describe('RF-06 Cambio de contrasena y notificacion (CA-06.2)', () => {

  function llenarPass(app, actual, nueva, confirma) {
    app.go('u-notificaciones');
    app.el('cp-actual').value = actual;
    app.el('cp-nueva').value = nueva;
    app.el('cp-confirma').value = confirma;
  }

  it('CP-30 cambio valido actualiza la clave y notifica con fecha y hora', async () => {
    const app = await conSesion(MARIA, 'maria123');
    llenarPass(app, 'maria123', 'nuevaClave1', 'nuevaClave1');
    app.cambiarPassword();

    expect(app.BANCO.usuarios[MARIA].clave).toBe('nuevaClave1');
    const alerta = app.BANCO.usuarios[MARIA].alertas[0].texto;
    expect(alerta).toMatch(/contrase/i);
    expect(alerta).toMatch(/\d{2}\/\d{2}\s\d{2}:\d{2}/);   // fecha y hora
  });

  it('CP-31 contrasena actual incorrecta: no cambia nada', async () => {
    const app = await conSesion(MARIA, 'maria123');
    llenarPass(app, 'equivocada', 'nuevaClave1', 'nuevaClave1');
    app.cambiarPassword();

    expect(errorDe(app, 'cp-error')).toMatch(/actual/i);
    expect(app.BANCO.usuarios[MARIA].clave).toBe('maria123');
  });

  it('CP-32 la nueva contrasena debe ser distinta de la actual', async () => {
    const app = await conSesion(MARIA, 'maria123');
    llenarPass(app, 'maria123', 'maria123', 'maria123');
    app.cambiarPassword();

    expect(errorDe(app, 'cp-error')).toMatch(/distinta/i);
    expect(app.BANCO.usuarios[MARIA].clave).toBe('maria123');
  });
});

/* ===================== RF-07 Reportes ===================== */
describe('RF-07 Reporte descargable (CA-07.1/07.2)', () => {

  it('CP-33 exporta CSV con las columnas exigidas por CA-07.2', async () => {
    const app = await conSesion(MARIA, 'maria123');
    /* jsdom no permite leer el Blob, asi que se captura el contenido en el
       momento de construirlo */
    let contenido = null;
    const BlobReal = globalThis.Blob;
    globalThis.Blob = class extends BlobReal {
      constructor(partes, opts) { super(partes, opts); contenido = partes.join(''); }
    };
    let descargado = false;
    globalThis.URL.createObjectURL = () => { descargado = true; return 'blob:test'; };
    globalThis.URL.revokeObjectURL = () => {};

    app.go('u-reportes');
    app.el('rp-desde').value = '2000-01-01';
    app.el('rp-hasta').value = '2100-01-01';
    app.exportarCSV('rp-desde', 'rp-hasta', false);
    globalThis.Blob = BlobReal;

    expect(descargado).toBe(true);
    expect(contenido).not.toBeNull();
    const lineas = contenido.trim().split('\n');
    expect(lineas[0]).toContain('ID;Fecha;Tipo;Origen;Destino;Valor;Estado');
    expect(lineas.length).toBeGreaterThan(1);
  });

  it('CP-34 rango sin movimientos: avisa y no descarga', async () => {
    const app = await conSesion(MARIA, 'maria123');
    let llamadas = 0;
    globalThis.URL.createObjectURL = () => { llamadas++; return 'blob:test'; };

    app.go('u-reportes');
    app.el('rp-desde').value = '2000-01-01';
    app.el('rp-hasta').value = '2000-12-31';
    app.exportarCSV('rp-desde', 'rp-hasta', false);

    expect(toast(app)).toMatch(/no hay movimientos/i);
    expect(llamadas).toBe(0);
  });
});

/* ===================== RF-08 Dashboard contable ===================== */
describe('RF-08 Dashboard contable (CA-08.1/08.2)', () => {

  it('CP-35 muestra ingresos, egresos y neto, y desglosa por tipo', async () => {
    const app = await conSesion('contable', 'conta123');

    app.el('ct-desde').value = '2000-01-01';
    app.el('ct-hasta').value = '2100-01-01';
    app.aplicarRangoContable();

    const kpis = [...document.querySelectorAll('#b-contable .grid .card .d')].map(x => x.textContent);
    expect(kpis).toHaveLength(3);
    expect(kpis[0]).toBe(app.fmt(180000));   // transferencia acreditada del historial
    expect(kpis[1]).toBe(app.fmt(95400));    // pago a convenio
    expect(kpis[2]).toBe(app.fmt(84600));    // neto

    const tipos = [...document.querySelectorAll('#b-contable table tbody tr')]
      .map(t => t.cells[0].textContent);
    expect(tipos).toEqual(expect.arrayContaining(['Transferencia', 'Pago', 'Bolsillo']));
  });

  it('CP-35b el rango filtra realmente los movimientos', async () => {
    const app = await conSesion('contable', 'conta123');
    app.el('ct-desde').value = '2000-01-01';
    app.el('ct-hasta').value = '2000-12-31';
    app.aplicarRangoContable();

    const kpis = [...document.querySelectorAll('#b-contable .grid .card .d')].map(x => x.textContent);
    expect(kpis.every(k => k === app.fmt(0))).toBe(true);
  });
});

/* ===================== Seguridad de rol y sesion ===================== */
describe('Control de acceso y sesion', () => {

  it('CP-36 un usuario no alcanza el panel admin aunque invoque la navegacion', async () => {
    const app = await conSesion(MARIA, 'maria123');
    app.go('a-panel');

    expect(pantalla()).toBe('u-inicio');
    expect(toast(app)).toMatch(/no tienes acceso/i);
  });

  it('CP-36b el contable no alcanza el panel admin (RN-06)', async () => {
    const app = await conSesion('contable', 'conta123');
    app.go('a-panel');

    expect(pantalla()).toBe('c-panel');
  });

  it('CP-37 la sesion se cierra automaticamente a los 10 minutos (RNF-01)', async () => {
    vi.useFakeTimers();
    const app = await conSesion(MARIA, 'maria123');
    expect(app.__getSesion()).not.toBeNull();

    vi.advanceTimersByTime(app.INACTIVIDAD_MS + 1000);

    expect(app.__getSesion()).toBeNull();
    expect(pantalla()).toBe('login');
  });
});
