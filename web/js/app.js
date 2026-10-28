/* ============================================================
   FINTEC - navegacion y pintado de pantallas
   Misma interfaz que el prototipo de un solo archivo, pero los
   datos ya no viven en memoria: cada pantalla los pide a la API
   por HTTP a traves de js/api.js.

   Las validaciones de negocio (saldo, topes, estados) las decide
   el servidor. Aqui solo quedan validaciones de formulario para
   no mandar peticiones inutiles; el mensaje que ve el usuario es
   el que responde la API.
   ============================================================ */
'use strict';

/* Sesion: {doc, nombre, rol, cuenta} tal como la devuelve el login. */
let sesion = null;

/* Ultimo GET /api/cuenta/me. Lo cachean las pantallas que lo necesitan
   (saldo, cupos, bolsillos) y se refresca cada vez que se entra a una. */
let cuenta = null;

/* Cuántas alertas no leídas muestra la campanita. campanaGen descarta
   una respuesta vieja que llegue después de marcarlas como leídas. */
let noLeidas = 0;
let campanaGen = 0;

const CONVENIOS = ['EPM', 'Universidad', 'Acueducto', 'Claro'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ---------- utilidades ---------- */
function fmt(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('es-CO'); }
function el(id) { return document.getElementById(id); }
function val(id) { const e = el(id); return e ? e.value.trim() : ''; }
function esc(t) { return String(t === undefined || t === null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function fechaCorta(d) {
  const f = d instanceof Date ? d : new Date(d);
  if (isNaN(f.getTime())) return '—';
  const p = n => ('0' + n).slice(-2);
  return p(f.getDate()) + '/' + p(f.getMonth() + 1) + ' ' + p(f.getHours()) + ':' + p(f.getMinutes());
}
function iso(d) { const p = n => ('0' + n).slice(-2); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
function err(id, msg) { const e = el(id); if (!e) return; e.textContent = msg || ''; e.classList.toggle('on', !!msg); }
function num(v) { const n = Math.round(Number(v)); return isNaN(n) ? 0 : n; }

/* La API puede nombrar un campo de varias formas segun quien lo serialice.
   Esto evita que la pantalla quede en blanco por una diferencia de nombre. */
function primero(obj, claves, porDefecto) {
  for (const k of claves) {
    if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return porDefecto;
}
/* Acepta tanto un array plano como {datos:[...]} / {items:[...]}. */
function comoLista(r, claves) {
  if (Array.isArray(r)) return r;
  if (!r || typeof r !== 'object') return [];
  for (const k of (claves || []).concat(['datos', 'items', 'resultados', 'lista'])) {
    if (Array.isArray(r[k])) return r[k];
  }
  return [];
}
function normMov(m) {
  return {
    id: primero(m, ['id', 'ID', 'codigo'], ''),
    ts: primero(m, ['ts', 'fecha', 'creado', 'createdAt'], null),
    tipo: primero(m, ['tipo'], ''),
    origen: primero(m, ['origen', 'cuentaOrigen'], ''),
    destino: primero(m, ['destino', 'cuentaDestino'], ''),
    valor: num(primero(m, ['valor', 'monto'], 0)),
    estado: primero(m, ['estado'], ''),
    nota: primero(m, ['nota', 'descripcion'], ''),
    revertida: !!primero(m, ['revertida', 'reversada'], false)
  };
}
function normBolsillo(b, i) {
  const saldo = num(primero(b, ['saldo', 'valor', 'monto'], 0));
  const meta = num(primero(b, ['meta'], 0));
  return {
    id: primero(b, ['id', '_id', 'bolsilloId'], i),
    nombre: primero(b, ['nombre'], 'Bolsillo'),
    saldo: saldo,
    meta: meta,
    avance: meta > 0 ? Math.round((saldo / meta) * 100) : null
  };
}
function htmlMeta(b) {
  if (!b.meta) {
    return '<p class="meta-txt">Sin meta. Configúrala para ver cuánto llevas.</p>';
  }
  const real = b.avance == null ? Math.round((b.saldo / b.meta) * 100) : b.avance;
  const ancho = Math.max(0, Math.min(100, real));
  const texto = real >= 100
    ? 'Meta cumplida · ' + real + '% · ' + fmt(b.saldo) + ' de ' + fmt(b.meta)
    : real + '% de la meta · ' + fmt(b.saldo) + ' de ' + fmt(b.meta);
  return '<div class="meta">' +
    '<div class="barra" role="progressbar" aria-valuenow="' + ancho + '" aria-valuemin="0" aria-valuemax="100">' +
      '<span style="width:' + ancho + '%"></span></div>' +
    '<div class="meta-txt">' + esc(texto) + '</div></div>';
}
function pintarBadge() {
  document.querySelectorAll('[data-badge-alertas]').forEach(b => {
    if (noLeidas > 0) {
      b.textContent = noLeidas > 99 ? '99+' : String(noLeidas);
      b.classList.add('on');
    } else {
      b.textContent = '';
      b.classList.remove('on');
    }
  });
}
function refrescarCampana() {
  if (!sesion || sesion.rol !== 'usuario') return;
  const gen = ++campanaGen;
  API.alertas().then(al => {
    if (gen !== campanaGen) return;
    noLeidas = num(primero(al, ['noLeidas'], 0));
    pintarBadge();
  }).catch(() => {});
}
function limpiarCampana() {
  campanaGen++;
  noLeidas = 0;
  pintarBadge();
}

/* ---------- avisos ---------- */
function ping(m) {
  const t = el('toast');
  if (!t) return;
  t.textContent = m; t.style.display = 'block';
  clearTimeout(ping.t);
  ping.t = setTimeout(() => t.style.display = 'none', 2600);
}
function lgError(msg) { err('lg-error', msg); }

/* Mensaje de la excepcion que llega del cliente HTTP. */
function mensajeError(e) {
  if (e && e.mensaje) return e.mensaje;
  if (e && e.message) return e.message;
  return 'Ocurrió un error inesperado.';
}
/* Si el token ya no sirve, la sesion local tampoco: se cierra. */
function sesionVencida(e) {
  if (e && e.estado === 401) {
    ping('Tu sesión expiró. Vuelve a ingresar.');
    salir();
    return true;
  }
  return false;
}
function cargando(idCaja, titulo) {
  const c = el(idCaja);
  if (c) {
    c.innerHTML = (titulo ? '<h2 class="d">' + esc(titulo) + '</h2>' : '') +
      '<div class="card"><p style="color:var(--dim);margin:0">Cargando datos…</p></div>';
  }
}
/* Pantalla que no pudo cargar: en vez de quedarse en blanco, explica
   que paso y deja reintentar. */
function fallo(idCaja, titulo, e, reintentar) {
  const c = el(idCaja);
  if (!c) return;
  c.innerHTML = (titulo ? '<h2 class="d">' + esc(titulo) + '</h2>' : '') +
    '<div class="card">' +
      '<p class="err on" style="margin-top:0">' + esc(mensajeError(e)) + '</p>' +
      '<p style="color:var(--dim);font-size:13px">API configurada: ' + esc(API.baseUrl()) + '</p>' +
      (reintentar ? '<div class="row"><button class="btn mint" data-reintentar="' + esc(reintentar) + '">Reintentar</button></div>' : '') +
    '</div>';
  const b = c.querySelector('[data-reintentar]');
  if (b) b.onclick = () => { const f = PINTORES[b.dataset.reintentar]; if (f) f(); };
}

/* ---------- sesion ---------- */
function entrar() {
  const doc = val('lg-doc');
  const clave = val('lg-pass');
  if (!doc) { lgError('Escribe tu usuario o documento.'); return; }
  if (!clave) { lgError('Escribe tu contraseña.'); return; }
  lgError('');
  /* El bloqueo por intentos fallidos y la cuenta bloqueada por el
     administrador los decide el servidor: aqui solo se muestra. */
  API.login(doc, clave).then(u => {
    if (!u || !u.rol) { lgError('La API no devolvió el rol del usuario.'); return; }
    sesion = u;
    el('lg-pass').value = '';
    ping('Bienvenido, ' + u.nombre);
    reiniciarInactividad();
    go(u.rol === 'admin' ? 'a-panel' : u.rol === 'contable' ? 'c-panel' : 'u-inicio');
  }).catch(e => lgError(mensajeError(e)));
}

function salir() {
  sesion = null;
  cuenta = null;
  pendiente = null;
  limpiarCampana();
  API.cerrarSesion();
  detenerInactividad();
  go('login');
}

function rellenar(u, c) { el('lg-doc').value = u; el('lg-pass').value = c; lgError(''); }

function registrar() {
  const doc = val('rg-doc'), nombre = val('rg-nombre'), clave = val('rg-pass');
  const tipo = val('rg-tipo'), correo = val('rg-correo'), nac = val('rg-nac');
  /* Validaciones de formulario: evitan peticiones que el servidor
     rechazaria igual. La unicidad del documento la decide la API. */
  if (!doc || !nombre || !clave) { err('rg-error', 'Nombre, documento y contraseña son obligatorios.'); return; }
  if (!/^[0-9A-Za-z]{5,15}$/.test(doc)) { err('rg-error', 'Documento inválido: usa de 5 a 15 caracteres sin espacios.'); return; }
  if (clave.length < 8) { err('rg-error', 'La contraseña debe tener al menos 8 caracteres.'); return; }
  if (correo && !EMAIL_RE.test(correo)) { err('rg-error', 'El correo no tiene un formato válido.'); return; }
  if (nac) {
    const f = new Date(nac + 'T00:00:00');
    if (isNaN(f.getTime())) { err('rg-error', 'Fecha de nacimiento inválida.'); return; }
    const hoy = new Date();
    let edad = hoy.getFullYear() - f.getFullYear();
    const m = hoy.getMonth() - f.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < f.getDate())) edad--;
    if (edad < 18) { err('rg-error', 'Debes ser mayor de 18 años para abrir una cuenta.'); return; }
    if (edad > 120) { err('rg-error', 'Revisa la fecha de nacimiento.'); return; }
  }
  err('rg-error', '');
  API.registro({ doc, nombre, clave, correo, tipo, nacimiento: nac }).then(r => {
    const nueva = primero(r || {}, ['cuenta'], '');
    ping(nueva ? 'Cuenta ' + nueva + ' activada con saldo ' + fmt(0) : 'Cuenta activada con saldo ' + fmt(0));
    rellenar(doc, clave);
    go('login');
  }).catch(e => err('rg-error', mensajeError(e)));
}

/* ---------- pantallas de usuario ---------- */
function pintarInicio() {
  cargando('b-inicio');
  Promise.all([API.cuentaMe(), API.movimientos()])
    .then(([c, movs]) => {
      cuenta = c || {};
      const bolsillos = comoLista(primero(cuenta, ['bolsillos'], []), ['bolsillos']).map(normBolsillo);
      const totalBols = bolsillos.reduce((s, b) => s + b.saldo, 0);
      const disponible = num(primero(cuenta, ['disponible', 'saldo'], 0));
      const nroCuenta = primero(cuenta, ['cuenta'], sesion.cuenta || '—');
      const lista = comoLista(movs, ['movimientos']).map(normMov);

      el('b-inicio').innerHTML =
        '<div class="hero-card"><div>' +
          '<div style="color:var(--dim)">Disponible ahora · cuenta ' + esc(nroCuenta) + '</div>' +
          '<div class="d big">' + fmt(disponible) + '</div>' +
          '<div style="color:var(--dim)">Total con bolsillos: ' + fmt(disponible + totalBols) + ' · los bolsillos no se transfieren directo</div>' +
          '<div class="row">' +
            '<button class="btn mint" onclick="go(\'u-transferir\')">Enviar</button>' +
            '<button class="btn ghost" onclick="go(\'u-bolsillos\')">Bolsillos</button>' +
            '<button class="btn ghost" onclick="go(\'u-pagos\')">Pagar</button>' +
          '</div></div>' +
          '<div class="card"><div style="color:var(--dim)">Actividad</div>' +
            (lista.slice(0, 3).map(m => '<p>' + esc(m.id) + ' · ' + esc(m.tipo) + ' · ' + fmt(m.valor) + ' · ' + esc(m.estado) + '</p>').join('') || '<p>Sin movimientos todavía.</p>') +
          '</div></div>' +
        '<div class="grid">' +
          (bolsillos.map(b => '<div class="card"><div style="color:var(--dim)">' + esc(b.nombre) + '</div><div class="d" style="font-size:28px">' + fmt(b.saldo) + '</div>' + htmlMeta(b) + '</div>').join('') ||
           '<div class="card"><div style="color:var(--dim)">Sin bolsillos</div><p>Crea uno para separar plata de tus metas.</p></div>') +
          '<div class="promo"><div style="font-weight:700">¿Necesitas un crédito?</div><p>Libre inversión, vehículo o hipoteca. Desembolso al instante en tu cuenta.</p>' +
          '<button class="btn" onclick="go(\'u-creditos\')">Solicitar crédito</button></div>' +
        '</div>';
    })
    .catch(e => { if (!sesionVencida(e)) fallo('b-inicio', '', e, 'u-inicio'); });
}

function pintarTransferir() {
  cargando('b-transferir', 'Enviar dinero');
  API.cuentaMe().then(c => {
    cuenta = c || {};
    const disponible = num(primero(cuenta, ['disponible', 'saldo'], 0));
    const cupoDia = num(primero(cuenta, ['cupoDiario'], 0));
    const cupoMes = num(primero(cuenta, ['cupoMensual'], 0));
    el('b-transferir').innerHTML =
      '<h2 class="d">Enviar dinero</h2>' +
      '<div class="card">' +
        '<div style="color:var(--dim);font-size:13px">Disponible: <strong>' + fmt(disponible) + '</strong>' +
          ' · cupo de hoy: <strong>' + fmt(cupoDia) + '</strong>' +
          ' · del mes: <strong>' + fmt(cupoMes) + '</strong></div>' +
        '<label for="tr-cuenta">Cuenta destino</label>' +
        '<input id="tr-cuenta" name="cuenta" placeholder="001-880-112" autocomplete="off" />' +
        '<label for="tr-monto">Monto</label><input id="tr-monto" name="monto" inputmode="numeric" placeholder="180000" />' +
        '<label for="tr-nota">Nota</label><textarea id="tr-nota" name="nota" rows="2" placeholder="Arriendo"></textarea>' +
        '<p id="tr-error" class="err" role="alert" aria-live="polite"></p>' +
        '<div class="row"><button class="btn mint" onclick="transferir()">Transferir</button></div>' +
        '<p style="color:var(--dim);font-size:13px">Si el monto supera tu disponible o tus topes, el movimiento queda Rechazado y ningún saldo se mueve.</p>' +
      '</div>' +
      '<div id="tr-confirma"></div>';
  }).catch(e => { if (!sesionVencida(e)) fallo('b-transferir', 'Enviar dinero', e, 'u-transferir'); });
}

/* Transferencia en dos pasos: primero se consulta el titular de la cuenta
   destino y se muestra su nombre; el dinero solo se mueve al confirmar. */
let pendiente = null;

function transferir() {
  const cuentaDestino = val('tr-cuenta');
  const monto = num(val('tr-monto'));
  const nota = val('tr-nota');

  if (!cuentaDestino) { err('tr-error', 'Escribe la cuenta destino.'); return; }
  if (!monto || monto <= 0) { err('tr-error', 'Escribe un monto mayor que cero.'); return; }
  err('tr-error', '');

  /* Paso 1 — el servidor dice de quien es la cuenta. */
  API.titular(cuentaDestino).then(t => {
    const nombre = primero(t || {}, ['nombre'], '');
    if (!nombre) { err('tr-error', 'No pudimos verificar el titular de esa cuenta.'); return; }
    pendiente = { destino: cuentaDestino, monto, nota };
    el('tr-confirma').innerHTML =
      '<div class="card" style="margin-top:12px;border-color:#1757D8">' +
        '<h3>Confirma el destinatario</h3>' +
        '<p style="margin:0 0 4px">Vas a enviar <strong>' + fmt(monto) + '</strong> a:</p>' +
        '<p class="d" style="font-size:22px;margin:4px 0">' + esc(nombre) + '</p>' +
        '<p style="color:var(--dim);font-size:13px;margin:0">Cuenta ' + esc(cuentaDestino) + ' · ' +
          esc(primero(t, ['tipo'], '')) + ' ' + esc(primero(t, ['doc'], '')) + '</p>' +
        '<div class="row">' +
          '<button class="btn mint" onclick="confirmarTransferencia()">Sí, enviar</button>' +
          '<button class="btn ghost" onclick="cancelarTransferencia()">Cancelar</button>' +
        '</div>' +
      '</div>';
  }).catch(e => {
    if (sesionVencida(e)) return;
    cancelarTransferencia();
    err('tr-error', mensajeError(e));
  });
}

function cancelarTransferencia() {
  pendiente = null;
  if (el('tr-confirma')) el('tr-confirma').innerHTML = '';
}

/* Paso 2 — solo aqui se mueve el dinero. El servidor revalida saldo,
   topes y estado de la cuenta destino, y su respuesta es la autoridad. */
function confirmarTransferencia() {
  if (!pendiente) return;
  const p = pendiente;
  pendiente = null;
  API.transferir(p.destino, p.monto, p.nota).then(r => {
    const id = idMovimiento(r);
    cancelarTransferencia();
    ping((id ? id + ' completada · ' : 'Transferencia completada · ') + fmt(p.monto));
    go('u-inicio');
  }).catch(e => {
    if (sesionVencida(e)) return;
    cancelarTransferencia();
    err('tr-error', mensajeError(e));
  });
}

function opcionesConvenio() {
  return CONVENIOS.map(c2 => '<option>' + esc(c2) + '</option>').join('');
}

function pintarPagos() {
  cargando('b-pagos', 'Pagar');
  const cuentasP = API.cuentasPago().then(
    regs => ({ regs: regs, aviso: '' }),
    e => {
      if (e && e.estado === 401) throw e;
      return { regs: [], aviso: mensajeError(e) };
    }
  );
  Promise.all([API.cuentaMe(), cuentasP]).then(([c, pack]) => {
    cuenta = c || {};
    const regs = pack.regs;
    const cuentas = comoLista(regs, ['cuentas', 'cuentasPago']).map(x => ({
      id: primero(x, ['id'], ''),
      alias: primero(x, ['alias', 'nombre'], 'Cuenta'),
      convenio: primero(x, ['convenio'], ''),
      referencia: primero(x, ['referencia'], '')
    }));
    const tarjeta = (x) =>
      '<div class="card">' +
        '<h3 style="margin-bottom:4px">' + esc(x.alias) + '</h3>' +
        '<p style="color:var(--dim);font-size:13px;margin:0 0 8px">' + esc(x.convenio) + ' · ref. ' + esc(x.referencia) + '</p>' +
        '<label for="pg-v' + esc(x.id) + '">Valor a pagar</label>' +
        '<input id="pg-v' + esc(x.id) + '" inputmode="numeric" placeholder="95400" />' +
        '<div class="row">' +
          '<button class="btn mint" data-id="' + esc(x.id) + '" data-convenio="' + esc(x.convenio) + '" data-ref="' + esc(x.referencia) + '" onclick="pagarRegistrada(this)">Pagar</button>' +
          '<button class="btn ghost" data-id="' + esc(x.id) + '" data-alias="' + esc(x.alias) + '" onclick="quitarCuentaPago(this)">Quitar</button>' +
        '</div></div>';

    el('b-pagos').innerHTML =
      '<h2 class="d">Pagar</h2>' +
      '<p style="color:var(--dim)">Disponible: <strong>' + fmt(primero(cuenta, ['disponible', 'saldo'], 0)) + '</strong>. ' +
        'Registra el convenio una vez y después pagas sin volver a escribir el número.</p>' +
      (pack.aviso ? '<p class="err on">' + esc(pack.aviso) + '</p>' : '') +
      '<p id="pg-error" class="err" role="alert" aria-live="polite"></p>' +
      '<h3 class="d" style="font-size:20px">Cuentas registradas</h3>' +
      '<div class="grid">' +
        (cuentas.length ? cuentas.map(tarjeta).join('') :
          '<div class="card"><p style="margin:0">Todavía no tienes cuentas. Registra EPM, la universidad u otro convenio.</p></div>') +
      '</div>' +
      '<div class="card" style="margin-top:16px">' +
        '<h3>Registrar cuenta</h3>' +
        '<label for="pg-alias">Nombre</label><input id="pg-alias" name="alias" placeholder="Ej. EPM de la casa" />' +
        '<label for="pg-convenio-reg">Convenio</label><select id="pg-convenio-reg" name="convenio">' + opcionesConvenio() + '</select>' +
        '<label for="pg-ref-reg">Número o referencia</label><input id="pg-ref-reg" name="referencia" placeholder="10993821" />' +
        '<div class="row"><button class="btn mint" onclick="registrarCuentaPago()">Guardar cuenta</button></div>' +
      '</div>' +
      '<div class="card" style="margin-top:16px">' +
        '<h3>Pagar sin registrar</h3>' +
        '<p style="color:var(--dim);font-size:13px;margin-top:0">Para un convenio que no vas a repetir.</p>' +
        '<label for="pg-convenio">Convenio</label><select id="pg-convenio" name="convenio">' + opcionesConvenio() + '</select>' +
        '<label for="pg-ref">Referencia</label><input id="pg-ref" name="referencia" placeholder="Número del recibo" />' +
        '<label for="pg-valor">Valor</label><input id="pg-valor" name="valor" inputmode="numeric" placeholder="95400" />' +
        '<div class="row"><button class="btn ghost" onclick="pagar()">Pagar esta vez</button></div>' +
      '</div>';
  }).catch(e => { if (!sesionVencida(e)) fallo('b-pagos', 'Pagar', e, 'u-pagos'); });
}

function pagarCon(convenio, ref, valor) {
  if (!ref) { err('pg-error', 'Escribe la referencia del convenio.'); return; }
  if (!valor || valor <= 0) { err('pg-error', 'Escribe un valor mayor que cero.'); return; }
  err('pg-error', '');
  API.pagar(convenio, ref, valor).then(r => {
    const id = idMovimiento(r);
    ping(id ? 'Pago ' + id + ' completado' : 'Pago completado');
    go('u-inicio');
  }).catch(e => { if (!sesionVencida(e)) err('pg-error', mensajeError(e)); });
}

function pagar() {
  pagarCon(val('pg-convenio'), val('pg-ref'), num(val('pg-valor')));
}

function pagarRegistrada(btn) {
  pagarCon(btn.dataset.convenio, btn.dataset.ref, num(val('pg-v' + btn.dataset.id)));
}

function registrarCuentaPago() {
  const alias = val('pg-alias');
  const convenio = val('pg-convenio-reg');
  const referencia = val('pg-ref-reg');
  if (!alias) { err('pg-error', 'Ponle un nombre a la cuenta.'); return; }
  if (!referencia) { err('pg-error', 'Escribe el número o la referencia.'); return; }
  err('pg-error', '');
  API.registrarCuentaPago(alias, convenio, referencia)
    .then(() => { ping('Cuenta "' + alias + '" registrada'); pintarPagos(); })
    .catch(e => { if (!sesionVencida(e)) err('pg-error', mensajeError(e)); });
}

function quitarCuentaPago(btn) {
  if (!confirm('¿Quitar la cuenta "' + (btn.dataset.alias || '') + '"?')) return;
  err('pg-error', '');
  API.eliminarCuentaPago(btn.dataset.id)
    .then(() => { ping('Cuenta quitada'); pintarPagos(); })
    .catch(e => { if (!sesionVencida(e)) err('pg-error', mensajeError(e)); });
}

function pintarBolsillos() {
  cargando('b-bolsillos', 'Bolsillos');
  API.cuentaMe().then(c => {
    cuenta = c || {};
    const disponible = num(primero(cuenta, ['disponible', 'saldo'], 0));
    const bolsillos = comoLista(primero(cuenta, ['bolsillos'], []), ['bolsillos']).map(normBolsillo);
    el('b-bolsillos').innerHTML =
      '<h2 class="d">Bolsillos</h2>' +
      '<p style="color:var(--dim)">Disponible para mover: <strong>' + fmt(disponible) + '</strong>. ' +
        'Al crear uno puedes ponerle una meta: el porcentaje sube cada vez que aportas.</p>' +
      '<p id="bl-error" class="err" role="alert" aria-live="polite"></p>' +
      '<div class="grid">' +
        bolsillos.map((b, i) =>
          '<div class="card"><h3>' + esc(b.nombre) + '</h3>' +
          '<div class="d big" style="font-size:32px">' + fmt(b.saldo) + '</div>' +
          htmlMeta(b) +
          '<label for="bl-meta' + i + '">Meta</label>' +
          '<input id="bl-meta' + i + '" inputmode="numeric" value="' + (b.meta || '') + '" placeholder="1000000" />' +
          '<div class="row"><button class="chip" data-id="' + esc(b.id) + '" data-i="' + i + '" onclick="guardarMeta(this.dataset.id,this.dataset.i)">Guardar meta</button></div>' +
          '<label for="bl-m' + i + '">Monto a mover</label><input id="bl-m' + i + '" inputmode="numeric" placeholder="100000" />' +
          '<div class="row"><button class="chip" data-id="' + esc(b.id) + '" data-i="' + i + '" onclick="aportar(this.dataset.id,this.dataset.i)">Aportar</button>' +
          '<button class="chip" data-id="' + esc(b.id) + '" data-i="' + i + '" onclick="retirar(this.dataset.id,this.dataset.i)">A disponible</button></div></div>').join('') +
        '<div class="card"><h3>Nuevo bolsillo</h3>' +
        '<label for="bl-nombre">Nombre</label>' +
        '<input id="bl-nombre" name="bolsillo" placeholder="Ej. Estudio" />' +
        '<label for="bl-meta-nueva">Meta (opcional)</label>' +
        '<input id="bl-meta-nueva" inputmode="numeric" placeholder="1000000" />' +
        '<button class="btn mint" style="margin-top:12px" onclick="crearBolsillo()">Crear</button></div>' +
      '</div>';
  }).catch(e => { if (!sesionVencida(e)) fallo('b-bolsillos', 'Bolsillos', e, 'u-bolsillos'); });
}

function aportar(id, i) {
  const monto = num(val('bl-m' + i));
  if (!monto || monto <= 0) { err('bl-error', 'Escribe un monto mayor que cero.'); return; }
  err('bl-error', '');
  API.aportarBolsillo(id, monto)
    .then(() => { ping('Aportaste ' + fmt(monto) + ' al bolsillo'); pintarBolsillos(); })
    .catch(e => { if (!sesionVencida(e)) err('bl-error', mensajeError(e)); });
}
function retirar(id, i) {
  const monto = num(val('bl-m' + i));
  if (!monto || monto <= 0) { err('bl-error', 'Escribe un monto mayor que cero.'); return; }
  err('bl-error', '');
  API.retirarBolsillo(id, monto)
    .then(() => { ping('Pasaste ' + fmt(monto) + ' a tu disponible'); pintarBolsillos(); })
    .catch(e => { if (!sesionVencida(e)) err('bl-error', mensajeError(e)); });
}
function leerMeta(idCampo) {
  const raw = val(idCampo);
  if (!raw) return { meta: 0 };
  if (!/^\d+$/.test(raw)) return { error: 'La meta debe ser un número entero. Déjala vacía para quitarla.' };
  return { meta: num(raw) };
}
function crearBolsillo() {
  const nombre = val('bl-nombre');
  const meta = leerMeta('bl-meta-nueva');
  if (!nombre) { err('bl-error', 'Ponle un nombre al bolsillo.'); return; }
  if (meta.error) { err('bl-error', meta.error); return; }
  err('bl-error', '');
  API.crearBolsillo(nombre, meta.meta)
    .then(() => {
      ping(meta.meta ? 'Bolsillo "' + nombre + '" creado con meta de ' + fmt(meta.meta) : 'Bolsillo "' + nombre + '" creado');
      refrescarCampana();
      pintarBolsillos();
    })
    .catch(e => { if (!sesionVencida(e)) err('bl-error', mensajeError(e)); });
}
function guardarMeta(id, i) {
  const meta = leerMeta('bl-meta' + i);
  if (meta.error) { err('bl-error', meta.error); return; }
  err('bl-error', '');
  API.configurarMeta(id, meta.meta)
    .then(() => {
      ping(meta.meta ? 'Meta actualizada a ' + fmt(meta.meta) : 'Meta quitada');
      refrescarCampana();
      pintarBolsillos();
    })
    .catch(e => { if (!sesionVencida(e)) err('bl-error', mensajeError(e)); });
}

/* ---------- creditos ---------- */
const CRED_TASAS = { libre: 0.025, vehiculo: 0.019, hipoteca: 0.015 };
const CRED_NOMBRES = { libre: 'Libre inversión', vehiculo: 'Vehículo', hipoteca: 'Hipoteca' };

function normCredito(c) {
  return {
    id: primero(c, ['id'], 0),
    tipo: primero(c, ['tipo'], 'libre'),
    tipoNombre: primero(c, ['tipoNombre'], CRED_NOMBRES[primero(c, ['tipo'], 'libre')] || 'Crédito'),
    monto: num(primero(c, ['monto'], 0)),
    plazoMeses: num(primero(c, ['plazoMeses', 'plazo_meses'], 0)),
    tasaMensual: Number(primero(c, ['tasaMensual', 'tasa_mensual'], 0)),
    cuota: num(primero(c, ['cuota'], 0)),
    totalAPagar: num(primero(c, ['totalAPagar', 'total_a_pagar'], 0)),
    saldoPendiente: num(primero(c, ['saldoPendiente', 'saldo_pendiente'], 0)),
    cuotasPagadas: num(primero(c, ['cuotasPagadas', 'cuotas_pagadas'], 0)),
    estado: primero(c, ['estado'], 'activo'),
    fechaDesembolso: primero(c, ['fechaDesembolso', 'fecha_desembolso'], null),
  };
}

function cuotaPreview() {
  const tipo = val('cr-tipo') || 'libre';
  const monto = num(val('cr-monto'));
  const plazo = num(val('cr-plazo'));
  const r = CRED_TASAS[tipo] || CRED_TASAS.libre;
  const prev = el('cr-prev');
  if (!prev) return;
  if (!monto || !plazo || plazo <= 0) {
    prev.textContent = 'Completa monto y plazo para ver la cuota.';
    return;
  }
  const cuota = monto * r / (1 - Math.pow(1 + r, -plazo));
  const total = cuota * plazo;
  const pct = (r * 100).toFixed(1).replace('.', ',');
  prev.innerHTML =
    'Cuota mensual aproximada: <strong>' + fmt(cuota) + '</strong>' +
    ' · total a pagar: <strong>' + fmt(total) + '</strong>' +
    ' · tasa ' + pct + '% mensual';
}

function pintarCreditos() {
  cargando('b-creditos', 'Crédito');
  Promise.all([API.cuentaMe(), API.listarCreditos()])
    .then(([c, cs]) => {
      cuenta = c || {};
      const disponible = num(primero(cuenta, ['disponible', 'saldo'], 0));
      const nroCuenta = primero(cuenta, ['cuenta'], (sesion && sesion.cuenta) || '—');
      const lista = comoLista(cs, ['creditos']).map(normCredito);
      const activos = lista.filter(c => c.estado === 'activo');
      const cerrados = lista.filter(c => c.estado !== 'activo');

      const tarjetaCredito = (c) => {
        const avance = c.totalAPagar > 0 ? Math.min(100, Math.round(((c.totalAPagar - c.saldoPendiente) / c.totalAPagar) * 100)) : 0;
        const pct = (c.tasaMensual * 100).toFixed(1).replace('.', ',');
        const activo = c.estado === 'activo';
        return '<div class="card">' +
          '<h3>' + esc(c.tipoNombre) + ' · ' + fmt(c.monto) + ' a ' + c.plazoMeses + 'm</h3>' +
          '<div style="color:var(--dim);font-size:13px">Tasa ' + pct + '% mensual · cuota ' + fmt(c.cuota) + '</div>' +
          '<div class="d" style="font-size:22px;margin-top:6px">Saldo pendiente: ' + fmt(c.saldoPendiente) + '</div>' +
          '<div style="color:var(--dim);font-size:13px">Cuotas pagadas: ' + c.cuotasPagadas + '/' + c.plazoMeses + ' · avance ' + avance + '%</div>' +
          (activo
            ? '<div class="row" style="margin-top:10px">' +
                '<button class="btn mint" data-id="' + esc(c.id) + '" onclick="pagarCuotaCredito(this.dataset.id)">Pagar cuota (' + fmt(Math.min(c.cuota, c.saldoPendiente)) + ')</button>' +
                '<button class="btn ghost" data-id="' + esc(c.id) + '" onclick="pagarTotalCredito(this.dataset.id, ' + c.saldoPendiente + ')">Pagar total (' + fmt(c.saldoPendiente) + ')</button>' +
              '</div>'
            : '<p style="color:var(--dim);margin:10px 0 0">Crédito pagado. Gracias por usar FINTEC.</p>') +
          '</div>';
      };

      el('b-creditos').innerHTML =
        '<h2 class="d">Crédito</h2>' +
        '<p style="color:var(--dim)">Disponible en tu cuenta ' + esc(nroCuenta) + ': <strong>' + fmt(disponible) + '</strong></p>' +
        '<p id="cr-error" class="err" role="alert" aria-live="polite"></p>' +

        '<div class="card">' +
          '<h3>Solicitar un crédito</h3>' +
          '<p style="color:var(--dim);font-size:13px;margin-top:0">El desembolso se abona en el momento a tu cuenta. Después puedes pagar cuota por cuota o cancelar el total.</p>' +
          '<label for="cr-tipo">Tipo</label>' +
          '<select id="cr-tipo" onchange="cuotaPreview()">' +
            '<option value="libre">Libre inversión (2,5% mensual)</option>' +
            '<option value="vehiculo">Vehículo (1,9% mensual)</option>' +
            '<option value="hipoteca">Hipoteca (1,5% mensual)</option>' +
          '</select>' +
          '<label for="cr-monto">Monto (entre $500.000 y $20.000.000)</label>' +
          '<input id="cr-monto" inputmode="numeric" placeholder="5000000" oninput="cuotaPreview()" />' +
          '<label for="cr-plazo">Plazo (meses)</label>' +
          '<select id="cr-plazo" onchange="cuotaPreview()">' +
            '<option value="12">12 meses</option>' +
            '<option value="24" selected>24 meses</option>' +
            '<option value="36">36 meses</option>' +
            '<option value="48">48 meses</option>' +
          '</select>' +
          '<p id="cr-prev" style="color:var(--dim);font-size:13px;margin-top:10px">Completa monto y plazo para ver la cuota.</p>' +
          '<div class="row"><button class="btn mint" onclick="solicitarCredito()">Solicitar y recibir desembolso</button></div>' +
        '</div>' +

        '<h3 class="d" style="margin-top:28px">Mis créditos activos</h3>' +
        '<div class="grid">' +
          (activos.length ? activos.map(tarjetaCredito).join('') : '<div class="card"><p style="color:var(--dim);margin:0">No tienes créditos activos todavía.</p></div>') +
        '</div>' +

        (cerrados.length
          ? '<h3 class="d" style="margin-top:28px">Créditos cerrados</h3>' +
            '<div class="grid">' + cerrados.map(tarjetaCredito).join('') + '</div>'
          : '');

      cuotaPreview();
    })
    .catch(e => { if (!sesionVencida(e)) fallo('b-creditos', 'Crédito', e, 'u-creditos'); });
}

function solicitarCredito() {
  const tipo = val('cr-tipo') || 'libre';
  const monto = num(val('cr-monto'));
  const plazo = num(val('cr-plazo'));
  if (!monto || monto < 500000 || monto > 20000000) {
    err('cr-error', 'El monto debe estar entre $500.000 y $20.000.000.'); return;
  }
  if (![12, 24, 36, 48].includes(plazo)) {
    err('cr-error', 'El plazo debe ser 12, 24, 36 o 48 meses.'); return;
  }
  err('cr-error', '');
  API.solicitarCredito(tipo, monto, plazo)
    .then(r => {
      const desembolso = num(primero(r || {}, ['disponible'], 0));
      ping('Desembolso recibido · nuevo disponible ' + fmt(desembolso));
      pintarCreditos();
    })
    .catch(e => { if (!sesionVencida(e)) err('cr-error', mensajeError(e)); });
}

function pagarCuotaCredito(id) {
  err('cr-error', '');
  API.pagarCuotaCredito(id)
    .then(r => {
      const c = normCredito(primero(r || {}, ['credito'], {}));
      ping(c.estado === 'pagado'
        ? '¡Crédito ' + esc(c.tipoNombre) + ' pagado totalmente!'
        : 'Cuota pagada · saldo pendiente ' + fmt(c.saldoPendiente));
      pintarCreditos();
    })
    .catch(e => { if (!sesionVencida(e)) err('cr-error', mensajeError(e)); });
}

function pagarTotalCredito(id, total) {
  if (!confirm('¿Pagar el total de ' + fmt(total) + ' y cerrar este crédito?')) return;
  err('cr-error', '');
  API.pagarTotalCredito(id)
    .then(() => { ping('Crédito cerrado · pago total ' + fmt(total)); pintarCreditos(); })
    .catch(e => { if (!sesionVencida(e)) err('cr-error', mensajeError(e)); });
}

/* Entró o salió plata de la cuenta. Un bolsillo no sale del patrimonio:
   solo se mueve entre el disponible y la meta, así que no cuenta como flujo. */
function direccionMov(m, propia) {
  if (!propia || !m) return '';
  if (m.tipo === 'Bolsillo') return 'bolsillo';
  if (m.origen === propia) return 'salida';
  if (m.destino === propia) return 'entrada';
  return '';
}
function etiquetaFlujo(m, propia) {
  const d = direccionMov(m, propia);
  if (d === 'entrada') return '<span class="st ok">Entró</span>';
  if (d === 'salida') return '<span class="st bad">Salió</span>';
  if (d === 'bolsillo') return '<span class="st warn">Bolsillo</span>';
  return '—';
}

function filaMov(m, propia) {
  const clase = m.estado === 'Completada' ? 'ok' : m.estado === 'Rechazada' ? 'bad' : 'warn';
  const dir = propia ? direccionMov(m, propia) : '';
  const signo = dir === 'salida' ? '−' : dir === 'entrada' ? '+' : '';
  const flujo = propia ? '<td>' + etiquetaFlujo(m, propia) + '</td>' : '';
  return '<tr><td>' + esc(m.id) + '</td><td>' + fechaCorta(m.ts) + '</td><td>' + esc(m.tipo) + '</td>' + flujo +
    '<td>' + esc(m.origen) + '</td><td>' + esc(m.destino) + '</td><td>' + signo + fmt(m.valor) +
    '</td><td><span class="st ' + clase + '">' + esc(m.estado) + '</span></td></tr>';
}

function pintarMovimientos() {
  if (!window.movFiltro) window.movFiltro = { desde: '', hasta: '', flujo: '' };
  const f = window.movFiltro;
  cargando('b-movimientos', 'Movimientos');
  Promise.all([
    API.cuentaMe().catch(e => { if (e && e.estado === 401) throw e; return cuenta; }),
    API.movimientos(f.desde, f.hasta)
  ]).then(([c, r]) => {
    if (c) cuenta = c;
    const propia = primero(cuenta || {}, ['cuenta'], sesion && sesion.cuenta);
    const todas = comoLista(r, ['movimientos']).map(normMov);
    const entradas = todas.filter(m => direccionMov(m, propia) === 'entrada').length;
    const salidas = todas.filter(m => direccionMov(m, propia) === 'salida').length;
    const lista = f.flujo ? todas.filter(m => direccionMov(m, propia) === f.flujo) : todas;
    const chip = (valor, etiqueta) =>
      '<button type="button" class="chip' + (f.flujo === valor ? ' on' : '') + '" onclick="filtrarFlujo(\'' + valor + '\')">' + etiqueta + '</button>';

    el('b-movimientos').innerHTML =
      '<h2 class="d">Movimientos</h2>' +
      '<div class="card">' +
        '<div class="row" style="margin-top:0">' +
          chip('', 'Todos') + chip('entrada', 'Entró plata') + chip('salida', 'Salió plata') +
        '</div>' +
        '<div class="filtros">' +
          '<div><label for="mv-desde">Desde</label><input id="mv-desde" type="date" value="' + esc(f.desde) + '" /></div>' +
          '<div><label for="mv-hasta">Hasta</label><input id="mv-hasta" type="date" value="' + esc(f.hasta) + '" /></div>' +
        '</div>' +
        '<div class="row">' +
          '<button class="btn mint" onclick="aplicarFiltroFechas()">Filtrar fechas</button>' +
          '<button class="btn ghost" onclick="limpiarFiltroUsuario()">Limpiar</button>' +
        '</div>' +
        '<p style="color:var(--dim);font-size:13px;margin-bottom:0">' + todas.length + ' en el rango · ' +
          entradas + ' entraron · ' + salidas + ' salieron. Los bolsillos se ven en Todos.</p>' +
      '</div>' +
      '<div class="card" style="margin-top:12px"><table><thead><tr><th>ID</th><th>Fecha</th><th>Tipo</th><th>Flujo</th><th>Origen</th><th>Destino</th><th>Valor</th><th>Estado</th></tr></thead><tbody>' +
      (lista.map(m => filaMov(m, propia)).join('') || '<tr><td colspan="8">Ningún movimiento coincide con el filtro.</td></tr>') +
      '</tbody></table></div>';
  }).catch(e => { if (!sesionVencida(e)) fallo('b-movimientos', 'Movimientos', e, 'u-movimientos'); });
}

function filtrarFlujo(flujo) {
  const actual = window.movFiltro || { desde: '', hasta: '', flujo: '' };
  const desde = el('mv-desde') ? val('mv-desde') : actual.desde;
  const hasta = el('mv-hasta') ? val('mv-hasta') : actual.hasta;
  if ((desde && !hasta) || (!desde && hasta)) {
    ping('Elige las dos fechas, o déjalas vacías para ver todo.');
    return;
  }
  if (desde && hasta && new Date(desde) > new Date(hasta)) {
    ping('La fecha "Desde" debe ser menor o igual a "Hasta"');
    return;
  }
  window.movFiltro = { desde: desde, hasta: hasta, flujo: flujo };
  pintarMovimientos();
}
function aplicarFiltroFechas() {
  filtrarFlujo((window.movFiltro && window.movFiltro.flujo) || '');
}
function limpiarFiltroUsuario() {
  window.movFiltro = { desde: '', hasta: '', flujo: '' };
  pintarMovimientos();
}

function pintarAlertas() {
  cargando('b-alertas', 'Alertas');
  API.alertas().then(al => {
    const alertas = comoLista(al, ['alertas']);
    const pendientes = num(primero(al, ['noLeidas'], alertas.filter(a => a.leida === false).length));
    el('b-alertas').innerHTML =
      '<h2 class="d">Alertas</h2>' +
      '<p style="color:var(--dim)">' +
        (pendientes ? pendientes + ' sin leer. Al abrirlas se marcan como vistas.' : 'No tienes alertas nuevas.') +
        ' Los topes y la contraseña están en Configuración.</p>' +
      (alertas.map(a => '<div class="card alerta' + (a.leida === false ? ' nueva' : '') + '">' +
          (a.leida === false ? '<span class="st ok">Nueva</span> ' : '') +
          '<p style="margin:6px 0 0">' + esc(primero(a, ['texto', 'mensaje'], '')) +
          ' · ' + fechaCorta(primero(a, ['ts', 'fecha'], null)) + '</p></div>').join('') ||
       '<div class="card"><p>Sin alertas por ahora.</p></div>');
    API.marcarAlertasLeidas().then(() => limpiarCampana()).catch(() => {});
  }).catch(e => { if (!sesionVencida(e)) fallo('b-alertas', 'Alertas', e, 'u-notificaciones'); });
}

function pintarConfig() {
  cargando('b-config', 'Configuración');
  API.cuentaMe().then(c => {
    cuenta = c || {};
    const topeDiario = num(primero(cuenta, ['topeDiario'], 0));
    const topeMensual = num(primero(cuenta, ['topeMensual'], 0));
    const enviadoDia = Math.max(0, topeDiario - num(primero(cuenta, ['cupoDiario'], 0)));
    const enviadoMes = Math.max(0, topeMensual - num(primero(cuenta, ['cupoMensual'], 0)));
    const correo = primero(cuenta, ['correo'], '');
    const minInact = (window.FINTEC_CONFIG && window.FINTEC_CONFIG.INACTIVIDAD_MIN) || 10;
    const nombre = primero(cuenta, ['nombre'], sesion && sesion.nombre);
    const doc = primero(cuenta, ['doc'], sesion && sesion.doc);
    const tipo = primero(cuenta, ['tipo'], '');
    const nro = primero(cuenta, ['cuenta'], sesion && sesion.cuenta);

    el('b-config').innerHTML =
      '<h2 class="d">Configuración</h2>' +
      '<div class="card">' +
        '<h3>Tu cuenta</h3>' +
        '<p style="margin:0"><strong>' + esc(nombre) + '</strong></p>' +
        '<p style="color:var(--dim);font-size:13px;margin:6px 0 0">' +
          esc(tipo) + ' ' + esc(doc) + ' · cuenta ' + esc(nro) +
          (correo ? ' · ' + esc(correo) : ' · sin correo registrado') + '</p>' +
      '</div>' +
      /* RF-04 — cada usuario define sus propios topes de transferencia */
      '<div class="card" style="margin-top:16px">' +
        '<h3>Topes de transferencia</h3>' +
        '<p style="color:var(--dim);font-size:13px;margin:0 0 6px">Define cuánto puedes enviar como máximo por día y por mes. ' +
          'Hoy llevas ' + fmt(enviadoDia) + ' y este mes ' + fmt(enviadoMes) + '.</p>' +
        '<label for="tp-diario">Tope diario</label>' +
        '<input id="tp-diario" inputmode="numeric" value="' + topeDiario + '" />' +
        '<label for="tp-mensual">Tope mensual</label>' +
        '<input id="tp-mensual" inputmode="numeric" value="' + topeMensual + '" />' +
        '<p id="tp-error" class="err" role="alert" aria-live="polite"></p>' +
        '<div class="row"><button class="btn mint" onclick="guardarTopes()">Guardar topes</button></div>' +
      '</div>' +
      /* RF-06 CA-06.2 — cambio de contraseña con notificación */
      '<div class="card" style="margin-top:16px">' +
        '<h3>Cambiar contraseña</h3>' +
        '<p style="color:var(--dim);font-size:13px;margin:0 0 6px">Te llegará una alerta con la fecha y hora del cambio.</p>' +
        '<label for="cp-actual">Contraseña actual</label>' +
        '<input id="cp-actual" type="password" autocomplete="current-password" />' +
        '<label for="cp-nueva">Nueva contraseña</label>' +
        '<input id="cp-nueva" type="password" autocomplete="new-password" placeholder="Mínimo 8 caracteres" />' +
        '<label for="cp-confirma">Confirmar nueva contraseña</label>' +
        '<input id="cp-confirma" type="password" autocomplete="new-password" />' +
        '<p id="cp-error" class="err" role="alert" aria-live="polite"></p>' +
        '<div class="row"><button class="btn mint" onclick="cambiarPassword()">Guardar</button></div>' +
      '</div>' +
      '<div class="card" style="margin-top:16px">' +
        '<h3>Sesión</h3>' +
        '<p style="color:var(--dim);font-size:13px;margin-top:0">Si dejas de usar la app durante ' + minInact +
          ' minutos, cerramos la sesión solos.</p>' +
        '<div class="row"><button class="btn ghost" onclick="salir()">Cerrar sesión ahora</button></div>' +
      '</div>' +
      /* Queda a la vista para el cierre. No se activa en esta entrega. */
      '<div class="card" style="margin-top:16px">' +
        '<h3>Doble autenticación</h3>' +
        '<p style="color:var(--dim);font-size:13px;margin-top:0">Además de la contraseña, al entrar desde un equipo nuevo ' +
          'FINTEC pedirá un código enviado a tu correo. La dejamos para el cierre del proyecto.</p>' +
        '<p style="margin:0 0 8px"><span class="st warn">Pendiente</span></p>' +
        (correo
          ? '<p style="color:var(--dim);font-size:13px;margin:0">El código iría a ' + esc(correo) + '.</p>'
          : '<p style="color:var(--dim);font-size:13px;margin:0">Esta cuenta no tiene correo. Sin correo no se puede activar.</p>') +
        '<div class="row"><button class="btn ghost" type="button" disabled>Activar más adelante</button></div>' +
      '</div>';
  }).catch(e => { if (!sesionVencida(e)) fallo('b-config', 'Configuración', e, 'u-config'); });
}

function guardarTopes() {
  const diario = num(val('tp-diario'));
  const mensual = num(val('tp-mensual'));
  if (!diario || diario <= 0 || !mensual || mensual <= 0) {
    err('tp-error', 'Los topes deben ser mayores que cero.'); return;
  }
  if (diario > mensual) { err('tp-error', 'El tope diario no puede superar al mensual.'); return; }
  err('tp-error', '');
  API.guardarTopes(diario, mensual)
    .then(() => { ping('Topes actualizados'); refrescarCampana(); pintarConfig(); })
    .catch(e => { if (!sesionVencida(e)) err('tp-error', mensajeError(e)); });
}

function cambiarPassword() {
  const actual = val('cp-actual'), nueva = val('cp-nueva'), confirma = val('cp-confirma');
  if (!actual || !nueva || !confirma) { err('cp-error', 'Completa los tres campos.'); return; }
  if (nueva.length < 8) { err('cp-error', 'La nueva contraseña debe tener al menos 8 caracteres.'); return; }
  if (nueva === actual) { err('cp-error', 'La nueva contraseña debe ser distinta a la actual.'); return; }
  if (nueva !== confirma) { err('cp-error', 'La confirmación no coincide.'); return; }
  err('cp-error', '');
  /* Que la contraseña actual coincida lo verifica el servidor. */
  API.cambiarPassword(actual, nueva)
    .then(() => { ping('Contraseña actualizada'); refrescarCampana(); pintarConfig(); })
    .catch(e => { if (!sesionVencida(e)) err('cp-error', mensajeError(e)); });
}

function pintarReportes() {
  const d = new Date(), desde = new Date(d.getFullYear(), d.getMonth(), 1);
  el('b-reportes').innerHTML =
    '<h2 class="d">Exportar</h2>' +
    '<div class="card">' +
      '<label for="rp-desde">Desde</label><input id="rp-desde" name="desde" type="date" value="' + iso(desde) + '" />' +
      '<label for="rp-hasta">Hasta</label><input id="rp-hasta" name="hasta" type="date" value="' + iso(d) + '" />' +
      '<div class="row"><button class="btn mint" onclick="window.print()">PDF (imprimir)</button>' +
      '<button class="btn ghost" onclick="exportarCSV(\'rp-desde\',\'rp-hasta\',false)">CSV</button></div>' +
    '</div>';
}

/* El rango lo filtra el servidor (?desde&hasta); aqui solo se arma el CSV. */
function exportarCSV(idDesde, idHasta, global) {
  const desde = val(idDesde), hasta = val(idHasta);
  if (!desde || !hasta) { ping('Selecciona ambas fechas'); return; }
  if (new Date(desde) > new Date(hasta)) { ping('La fecha "Desde" debe ser menor o igual a "Hasta"'); return; }
  const aLista = r => comoLista(r, ['movimientos']).map(normMov);
  /* El CSV global del contable no puede usar la ruta de admin (403).
     Esa ruta filtra por fechas en el servidor; la de admin, aqui. */
  const peticion = !global
    ? API.movimientos(desde, hasta).then(aLista)
    : (sesion && sesion.rol === 'contable'
        ? API.contableMovimientos(desde, hasta).then(aLista)
        : API.adminMovimientos({}).then(r => aLista(r).filter(m => enRango(m, desde, hasta))));

  peticion.then(filas => {
    if (!filas.length) { ping('No hay movimientos en ese rango'); return; }
    const csv = ['ID;Fecha;Tipo;Origen;Destino;Valor;Estado']
      .concat(filas.map(m => [m.id, new Date(m.ts).toLocaleString('es-CO'), m.tipo, m.origen, m.destino, m.valor, m.estado].join(';')))
      .join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'fintec-movimientos.csv'; a.click();
    URL.revokeObjectURL(url);
    ping(filas.length + ' movimientos exportados');
  }).catch(e => { if (!sesionVencida(e)) ping(mensajeError(e)); });
}

function enRango(m, desde, hasta) {
  const d = new Date(desde + 'T00:00:00'), h = new Date(hasta + 'T23:59:59');
  const t = new Date(m.ts);
  return !isNaN(t.getTime()) && t >= d && t <= h;
}

/* ---------- admin ---------- */
/* Cache de la ultima lista de usuarios, para el detalle sin repedirla. */
let adminCache = [];

function normUsuario(u) {
  const bolsillos = comoLista(primero(u, ['bolsillos'], []), ['bolsillos']).map(normBolsillo);
  const sumaBolsillos = bolsillos.reduce((s, b) => s + b.saldo, 0);
  return {
    doc: primero(u, ['doc', 'documento'], ''),
    nombre: primero(u, ['nombre'], ''),
    cuenta: primero(u, ['cuenta'], ''),
    disponible: num(primero(u, ['disponible', 'saldo'], 0)),
    estado: primero(u, ['estado'], 'activa'),
    tipo: primero(u, ['tipo'], ''),
    correo: primero(u, ['correo'], ''),
    topeDiario: num(primero(u, ['topeDiario'], 0)),
    topeMensual: num(primero(u, ['topeMensual'], 0)),
    bolsillos: bolsillos,
    totalBolsillos: bolsillos.length ? sumaBolsillos : num(primero(u, ['totalBolsillos', 'total_bolsillos'], 0))
  };
}

/* La API anida el codigo TX-#### en `movimiento`, no en la raiz. */
function idMovimiento(r) {
  if (!r || typeof r !== 'object') return '';
  const directo = primero(r, ['id', 'codigo'], '');
  if (directo) return directo;
  return primero(r.movimiento || {}, ['id', 'codigo'], '');
}

function pintarAdmin() {
  cargando('b-admin', 'Control de cuentas');
  const q = window.adminQ || '';
  /* La busqueda por documento, cuenta, correo o nombre la resuelve el
     servidor con ?q= (RF-05 CA-05.1). */
  Promise.all([
    API.adminUsuarios(q),
    API.adminUsuarios(''),
    API.adminMovimientos({})
  ]).then(([filtrados, todos, movs]) => {
    const lista = comoLista(filtrados, ['usuarios']).map(normUsuario);
    const universo = comoLista(todos, ['usuarios']).map(normUsuario);
    adminCache = universo.slice();
    const movimientos = comoLista(movs, ['movimientos']).map(normMov);
    const reversibles = movimientos.filter(m => m.tipo === 'Transferencia' && m.estado === 'Completada');

    const activas = universo.filter(u => u.estado === 'activa').length;
    const bloqueadas = universo.length - activas;
    const custodia = universo.reduce((t, u) => t + u.disponible + u.totalBolsillos, 0);
    const ahora = new Date();
    const delDia = movimientos.filter(m => {
      const t = new Date(m.ts);
      return !isNaN(t.getTime()) && t.toDateString() === ahora.toDateString();
    }).length;
    const rechazos = movimientos.filter(m => m.estado === 'Rechazada').length;

    el('b-admin').innerHTML =
      '<h2 class="d">Control de cuentas</h2>' +
      '<div class="grid">' +
        '<div class="card"><div style="color:var(--dim)">Cuentas activas</div><div class="d" style="font-size:30px">' + activas + '</div>' +
          '<div style="color:var(--dim);font-size:13px">' + bloqueadas + ' bloqueada' + (bloqueadas === 1 ? '' : 's') + '</div></div>' +
        '<div class="card"><div style="color:var(--dim)">Dinero en custodia</div><div class="d" style="font-size:30px">' + fmt(custodia) + '</div>' +
          '<div style="color:var(--dim);font-size:13px">disponible + bolsillos</div></div>' +
        '<div class="card"><div style="color:var(--dim)">Movimientos de hoy</div><div class="d" style="font-size:30px">' + delDia + '</div>' +
          '<div style="color:var(--dim);font-size:13px">' + rechazos + ' rechazado' + (rechazos === 1 ? '' : 's') + ' en total</div></div>' +
      '</div>' +
      '<div class="row"><button class="btn ghost" onclick="irAHistorial()">Ver historial global</button></div>' +
      '<p style="color:var(--dim)">Buscar · bloquear · devolver o cancelar. El admin no altera saldos a mano.</p>' +
      '<p id="ad-error" class="err" role="alert" aria-live="polite"></p>' +
      '<div class="card">' +
        '<label for="ad-busca">Documento, cuenta, correo o nombre</label>' +
        '<div class="row"><input id="ad-busca" name="busqueda" value="' + esc(q) + '" style="flex:1" onkeydown="if(event.key===\'Enter\')buscar()" />' +
        '<button class="btn mint" onclick="buscar()">Buscar</button></div>' +
        '<table><thead><tr><th>Usuario</th><th>Documento</th><th>Cuenta</th><th>Disponible</th><th>Estado</th><th></th></tr></thead><tbody>' +
        (lista.map(u =>
          '<tr><td>' + esc(u.nombre) + '</td><td>' + esc(u.doc) + '</td><td>' + esc(u.cuenta) + '</td><td>' + fmt(u.disponible) + '</td>' +
          '<td><span class="st ' + (u.estado === 'activa' ? 'ok' : 'bad') + '">' + (u.estado === 'activa' ? 'Activa' : 'Bloqueada') + '</span></td>' +
          '<td><button class="chip" data-doc="' + esc(u.doc) + '" onclick="verUsuario(this.dataset.doc)">Ver</button> ' +
          '<button class="chip" data-doc="' + esc(u.doc) + '" onclick="alternarBloqueo(this.dataset.doc)">' + (u.estado === 'activa' ? 'Bloquear' : 'Desbloquear') + '</button></td></tr>').join('') ||
         '<tr><td colspan="6">Ninguna cuenta coincide con la búsqueda.</td></tr>') +
        '</tbody></table></div>' +
      '<div id="ad-detalle"></div>' +
      '<div class="card" style="margin-top:12px"><h3>Devoluciones y cancelaciones</h3>' +
        '<table><tbody>' +
        (reversibles.map(m =>
          '<tr><td>' + esc(m.id) + ' · ' + fmt(m.valor) + ' · ' + esc(m.origen) + ' → ' + esc(m.destino) +
            (m.revertida ? ' · <span class="st warn">Revertida</span>' : '') + '</td>' +
          '<td>' +
            '<button class="chip" ' + (m.revertida ? 'disabled' : '') + ' data-id="' + esc(m.id) + '" onclick="devolver(this.dataset.id)">Devolver</button> ' +
            '<button class="chip" ' + (m.revertida ? 'disabled' : '') + ' data-id="' + esc(m.id) + '" onclick="cancelar(this.dataset.id)">Cancelar</button>' +
          '</td></tr>').join('') ||
         '<tr><td>No hay transferencias completadas para devolver.</td></tr>') +
        '</tbody></table></div>';
  }).catch(e => { if (!sesionVencida(e)) fallo('b-admin', 'Control de cuentas', e, 'a-panel'); });
}

/* Detalle de una cuenta: datos, topes, bolsillos y sus ultimos movimientos.
   El administrador consulta, no edita saldos (RN-04). */
function verUsuario(doc) {
  const u = adminCache.find(x => String(x.doc) === String(doc));
  if (!u) { err('ad-error', 'No encontramos esa cuenta en la última búsqueda.'); return; }
  const totalBols = u.bolsillos.reduce((s, b) => s + b.saldo, 0);
  const cabeza =
    '<div class="card" style="margin-top:12px;border-color:#1757D8">' +
      '<h3>' + esc(u.nombre) + ' · ' + esc(u.cuenta) + '</h3>' +
      '<div class="grid">' +
        '<div class="card"><div style="color:var(--dim)">Disponible</div><div class="d" style="font-size:26px">' + fmt(u.disponible) + '</div></div>' +
        '<div class="card"><div style="color:var(--dim)">En bolsillos</div><div class="d" style="font-size:26px">' + fmt(totalBols) + '</div></div>' +
        '<div class="card"><div style="color:var(--dim)">Total</div><div class="d" style="font-size:26px">' + fmt(u.disponible + totalBols) + '</div></div>' +
      '</div>' +
      '<p style="color:var(--dim);font-size:13px;margin-top:12px">' +
        esc(u.tipo) + ' ' + esc(u.doc) + (u.correo ? ' · ' + esc(u.correo) : '') +
        ' · estado ' + esc(u.estado) +
        ' · topes ' + fmt(u.topeDiario) + ' diario / ' + fmt(u.topeMensual) + ' mensual</p>' +
      (u.bolsillos.length
        ? '<p style="font-size:13px;margin:0 0 8px">Bolsillos: ' + u.bolsillos.map(b => esc(b.nombre) + ' ' + fmt(b.saldo)).join(' · ') + '</p>'
        : '<p style="font-size:13px;margin:0 0 8px;color:var(--dim)">Sin bolsillos.</p>') +
      '<h3 style="font-size:15px;margin:12px 0 4px">Últimos movimientos</h3>';
  const pie = '<div class="row"><button class="btn ghost" onclick="cerrarDetalle()">Cerrar</button></div></div>';
  const tabla = cuerpo =>
    '<table><thead><tr><th>ID</th><th>Fecha</th><th>Tipo</th><th>Origen</th><th>Destino</th><th>Valor</th><th>Estado</th></tr></thead><tbody>' +
    cuerpo + '</tbody></table>';

  el('ad-detalle').innerHTML = cabeza + tabla('<tr><td colspan="7">Cargando…</td></tr>') + pie;
  API.adminMovimientos({ cuenta: u.cuenta }).then(r => {
    const suyos = comoLista(r, ['movimientos']).map(normMov);
    el('ad-detalle').innerHTML = cabeza +
      tabla(suyos.slice(0, 8).map(m => filaMov(m)).join('') || '<tr><td colspan="7">Sin movimientos.</td></tr>') + pie;
  }).catch(e => {
    if (sesionVencida(e)) return;
    el('ad-detalle').innerHTML = cabeza +
      tabla('<tr><td colspan="7">' + esc(mensajeError(e)) + '</td></tr>') + pie;
  });
}
function cerrarDetalle() { if (el('ad-detalle')) el('ad-detalle').innerHTML = ''; }

/* RF-05 — historial global de operaciones, con filtros que aplica el servidor */
function pintarAdminMovimientos() {
  if (!window.adminFiltro) window.adminFiltro = { estado: '', tipo: '', cuenta: '' };
  const f = window.adminFiltro;
  cargando('b-amovimientos', 'Historial global');
  API.adminMovimientos(f).then(r => {
    const lista = comoLista(r, ['movimientos']).map(normMov);
    const suma = lista.filter(m => m.estado === 'Completada').reduce((t, m) => t + m.valor, 0);
    const d = new Date(), desde = new Date(d.getFullYear(), d.getMonth(), 1);

    el('b-amovimientos').innerHTML =
      '<h2 class="d">Historial global</h2>' +
      '<p style="color:var(--dim)">Todas las operaciones del sistema, de todas las cuentas.</p>' +
      '<div class="card">' +
        '<label for="am-estado">Estado</label>' +
        '<select id="am-estado">' + ['', 'Completada', 'Rechazada', 'Cancelada'].map(e =>
          '<option value="' + e + '"' + (f.estado === e ? ' selected' : '') + '>' + (e || 'Todos') + '</option>').join('') + '</select>' +
        '<label for="am-tipo">Tipo</label>' +
        '<select id="am-tipo">' + ['', 'Transferencia', 'Pago', 'Bolsillo', 'Reversión', 'Cancelación'].map(t =>
          '<option value="' + t + '"' + (f.tipo === t ? ' selected' : '') + '>' + (t || 'Todos') + '</option>').join('') + '</select>' +
        '<label for="am-cuenta">Cuenta (origen o destino)</label>' +
        '<input id="am-cuenta" value="' + esc(f.cuenta) + '" placeholder="001-234-567" />' +
        '<div class="row">' +
          '<button class="btn mint" onclick="filtrarMovimientos()">Filtrar</button>' +
          '<button class="btn ghost" onclick="limpiarFiltroMovimientos()">Limpiar</button>' +
        '</div>' +
      '</div>' +
      '<div class="grid">' +
        '<div class="card"><div style="color:var(--dim)">Operaciones</div><div class="d" style="font-size:28px">' + lista.length + '</div></div>' +
        '<div class="card"><div style="color:var(--dim)">Monto completado</div><div class="d" style="font-size:28px">' + fmt(suma) + '</div></div>' +
        '<div class="card"><div style="color:var(--dim)">Exportar</div>' +
          '<input id="am-desde" type="date" value="' + iso(desde) + '" />' +
          '<input id="am-hasta" type="date" value="' + iso(d) + '" style="margin-top:8px" />' +
          '<div class="row"><button class="btn ghost" onclick="exportarHistorial()">CSV global</button></div>' +
        '</div>' +
      '</div>' +
      '<div class="card" style="margin-top:12px">' +
        '<table><thead><tr><th>ID</th><th>Fecha</th><th>Tipo</th><th>Origen</th><th>Destino</th><th>Valor</th><th>Estado</th></tr></thead><tbody>' +
        (lista.map(m => filaMov(m)).join('') || '<tr><td colspan="7">Ningún movimiento coincide con el filtro.</td></tr>') +
        '</tbody></table>' +
      '</div>';
  }).catch(e => { if (!sesionVencida(e)) fallo('b-amovimientos', 'Historial global', e, 'a-movimientos'); });
}
function irAHistorial() { go('a-movimientos'); }
function exportarHistorial() { exportarCSV('am-desde', 'am-hasta', true); }
function filtrarMovimientos() {
  window.adminFiltro = { estado: val('am-estado'), tipo: val('am-tipo'), cuenta: val('am-cuenta') };
  pintarAdminMovimientos();
}
function limpiarFiltroMovimientos() {
  window.adminFiltro = { estado: '', tipo: '', cuenta: '' };
  pintarAdminMovimientos();
}

function buscar() { window.adminQ = val('ad-busca'); pintarAdmin(); }

function alternarBloqueo(doc) {
  const u = adminCache.find(x => String(x.doc) === String(doc));
  if (!u) { err('ad-error', 'No encontramos esa cuenta.'); return; }
  const nuevo = u.estado === 'activa' ? 'bloqueada' : 'activa';
  err('ad-error', '');
  API.adminEstado(doc, nuevo).then(() => {
    ping(u.nombre + ' · cuenta ' + nuevo);
    pintarAdmin();
  }).catch(e => { if (!sesionVencida(e)) err('ad-error', mensajeError(e)); });
}

/* RF-05 / RN-05 — la reversion de saldos la ejecuta el servidor */
function devolver(id) {
  err('ad-error', '');
  API.adminDevolucion(id).then(r => {
    const nuevo = idMovimiento(r);
    ping(nuevo ? 'Reversión ' + nuevo + ' aplicada' : 'Reversión aplicada');
    pintarAdmin();
  }).catch(e => { if (!sesionVencida(e)) err('ad-error', mensajeError(e)); });
}

function cancelar(id) {
  err('ad-error', '');
  API.adminCancelacion(id).then(r => {
    const nuevo = idMovimiento(r);
    ping(nuevo ? 'Cancelación ' + nuevo + ' registrada' : 'Cancelación registrada');
    pintarAdmin();
  }).catch(e => { if (!sesionVencida(e)) err('ad-error', mensajeError(e)); });
}

/* ---------- contable ---------- */
function pintarContable() {
  /* RF-08 CA-08.1 — el rango de fechas lo filtra el servidor */
  const hoy = new Date();
  if (!window.ctbRango) {
    window.ctbRango = { desde: iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: iso(hoy) };
  }
  const r = window.ctbRango;
  cargando('b-contable', 'Flujo global');
  API.contableResumen(r.desde, r.hasta).then(res => {
    res = res || {};
    const ingresos = num(primero(res, ['ingresos'], 0));
    const egresos = num(primero(res, ['egresos'], 0));
    const neto = primero(res, ['neto'], null) === null ? ingresos - egresos : num(res.neto);
    const porTipo = comoLista(primero(res, ['porTipo'], []), ['porTipo']).map(t => ({
      tipo: primero(t, ['tipo'], ''),
      ops: num(primero(t, ['ops', 'operaciones', 'cantidad', 'conteo'], 0)),
      monto: num(primero(t, ['monto', 'valor', 'total'], 0))
    }));
    const porCliente = comoLista(primero(res, ['porCliente'], []), ['porCliente']).map(c => {
      const disponible = num(primero(c, ['disponible', 'saldo'], 0));
      const bols = num(primero(c, ['bolsillos', 'enBolsillos', 'totalBolsillos'], 0));
      return {
        nombre: primero(c, ['nombre', 'cliente'], ''),
        disponible: disponible,
        bolsillos: bols,
        total: primero(c, ['total'], null) === null ? disponible + bols : num(c.total)
      };
    });
    const completados = primero(res, ['completados', 'movimientos', 'total'], null);
    const cuantos = completados === null ? porTipo.reduce((s, t) => s + t.ops, 0) : num(completados);

    el('b-contable').innerHTML =
      '<h2 class="d">Flujo global</h2>' +
      '<p style="color:var(--dim)">Solo lectura · ' + cuantos + ' movimientos completados en el rango</p>' +
      '<div class="card">' +
        '<label for="ct-desde">Desde</label><input id="ct-desde" type="date" value="' + esc(r.desde) + '" />' +
        '<label for="ct-hasta">Hasta</label><input id="ct-hasta" type="date" value="' + esc(r.hasta) + '" />' +
        '<div class="row"><button class="btn mint" onclick="aplicarRangoContable()">Aplicar</button>' +
        '<button class="btn ghost" onclick="resetRangoContable()">Mes actual</button></div>' +
      '</div>' +
      '<div class="grid" style="margin-top:12px">' +
        '<div class="card"><div style="color:var(--dim)">Ingresos (acreditaciones)</div><div class="d" style="font-size:30px">' + fmt(ingresos) + '</div></div>' +
        '<div class="card"><div style="color:var(--dim)">Egresos (pagos a convenios)</div><div class="d" style="font-size:30px">' + fmt(egresos) + '</div></div>' +
        '<div class="card" style="border-color:#1757D8"><div style="color:var(--blue)">Saldo neto movilizado</div><div class="d" style="font-size:30px">' + fmt(neto) + '</div></div>' +
      '</div>' +
      /* CA-08.2 — desglose por tipo de transacción */
      '<div class="card" style="margin-top:12px"><h3>Desglose por tipo</h3>' +
        '<table><thead><tr><th>Tipo</th><th>Ops</th><th>Monto</th></tr></thead><tbody>' +
        (porTipo.map(t => '<tr><td>' + esc(t.tipo) + '</td><td>' + t.ops + '</td><td>' + fmt(t.monto) + '</td></tr>').join('') ||
         '<tr><td colspan="3">Sin movimientos en el rango.</td></tr>') +
      '</tbody></table></div>' +
      '<div class="card" style="margin-top:12px"><h3>Saldo por cliente (actual)</h3><table><thead><tr><th>Cliente</th><th>Disponible</th><th>Bolsillos</th><th>Total</th></tr></thead><tbody>' +
        (porCliente.map(c => '<tr><td>' + esc(c.nombre) + '</td><td>' + fmt(c.disponible) + '</td><td>' + fmt(c.bolsillos) + '</td><td>' + fmt(c.total) + '</td></tr>').join('') ||
         '<tr><td colspan="4">Sin clientes para mostrar.</td></tr>') +
      '</tbody></table></div>';
  }).catch(e => { if (!sesionVencida(e)) fallo('b-contable', 'Flujo global', e, 'c-panel'); });
}

function aplicarRangoContable() {
  const desde = val('ct-desde'), hasta = val('ct-hasta');
  if (!desde || !hasta) { ping('Selecciona ambas fechas'); return; }
  if (new Date(desde) > new Date(hasta)) { ping('La fecha "Desde" debe ser menor o igual a "Hasta"'); return; }
  window.ctbRango = { desde, hasta };
  pintarContable();
}
function resetRangoContable() {
  const hoy = new Date();
  window.ctbRango = { desde: iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: iso(hoy) };
  pintarContable();
}

function pintarCReportes() {
  const d = new Date(), desde = new Date(d.getFullYear(), d.getMonth(), 1);
  el('b-creportes').innerHTML =
    '<h2 class="d">Reporte financiero</h2>' +
    '<div class="card">' +
      '<label for="cr-desde">Desde</label><input id="cr-desde" name="desde" type="date" value="' + iso(desde) + '" />' +
      '<label for="cr-hasta">Hasta</label><input id="cr-hasta" name="hasta" type="date" value="' + iso(d) + '" />' +
      '<div class="row"><button class="btn mint" onclick="window.print()">PDF (imprimir)</button>' +
      '<button class="btn ghost" onclick="exportarCSV(\'cr-desde\',\'cr-hasta\',true)">CSV global</button></div>' +
      '<p style="color:var(--dim);font-size:13px">El CSV incluye los movimientos de todas las cuentas en el rango.</p>' +
    '</div>';
}

/* ---------- navegacion ---------- */
const CAMPANA =
  '<button data-g="u-notificaciones" class="campana" aria-label="Alertas">' +
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M6 9a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9z" stroke="currentColor" stroke-width="1.8"/>' +
      '<path d="M10 20a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
    '</svg>Alertas<span class="badge" data-badge-alertas></span></button>';

const H = '<div class="d">FINTEC</div>' +
    '<nav>' +
      '<button data-g="u-inicio">Inicio</button>' +
      '<button data-g="u-transferir">Enviar</button>' +
      '<button data-g="u-bolsillos">Bolsillos</button>' +
      '<button data-g="u-pagos">Pagar</button>' +
      '<button data-g="u-creditos">Crédito</button>' +
      '<button data-g="u-movimientos">Movimientos</button>' +
      CAMPANA +
      '<button data-g="u-config">Configuración</button>' +
      '<button data-g="u-reportes">Exportar</button>' +
      '<button data-g="salir">Salir</button>' +
    '</nav>';

const PINTORES = {
  'u-inicio': pintarInicio, 'u-transferir': pintarTransferir, 'u-bolsillos': pintarBolsillos,
  'u-pagos': pintarPagos, 'u-creditos': pintarCreditos,
  'u-movimientos': pintarMovimientos, 'u-notificaciones': pintarAlertas,
  'u-config': pintarConfig,
  'u-reportes': pintarReportes, 'a-panel': pintarAdmin, 'a-movimientos': pintarAdminMovimientos,
  'c-panel': pintarContable, 'c-reportes': pintarCReportes
};
const PRIVADAS = Object.keys(PINTORES);
/* RF-02 / RN-06 / RN-07 — pantalla → rol requerido. Es una comodidad de
   navegacion: la autorizacion real la impone la API en cada peticion. */
const ROL_PANTALLA = {
  'u-inicio': 'usuario', 'u-transferir': 'usuario', 'u-bolsillos': 'usuario',
  'u-pagos': 'usuario', 'u-creditos': 'usuario',
  'u-movimientos': 'usuario', 'u-notificaciones': 'usuario',
  'u-config': 'usuario',
  'u-reportes': 'usuario',
  'a-panel': 'admin', 'a-movimientos': 'admin',
  'c-panel': 'contable', 'c-reportes': 'contable'
};

function cabecera(id) {
  document.querySelectorAll('#u-inicio header, #u-transferir header, #u-bolsillos header, #u-pagos header, #u-creditos header, #u-movimientos header, #u-notificaciones header, #u-config header, #u-reportes header').forEach(h => {
    h.innerHTML = H;
    h.querySelectorAll('[data-g]').forEach(b => {
      if (b.dataset.g === id) b.classList.add('on');
      b.onclick = () => b.dataset.g === 'salir' ? salir() : go(b.dataset.g);
    });
  });
  pintarBadge();
  if (sesion && sesion.rol === 'usuario' && id !== 'u-notificaciones') refrescarCampana();
}

function go(id) {
  if (PRIVADAS.includes(id)) {
    if (!sesion) { id = 'login'; ping('Inicia sesión para continuar'); }
    else {
      const rolReq = ROL_PANTALLA[id];
      if (rolReq && sesion.rol !== rolReq) {
        ping('No tienes acceso a esa sección');
        id = sesion.rol === 'admin' ? 'a-panel' : sesion.rol === 'contable' ? 'c-panel' : 'u-inicio';
      }
    }
  }
  if (id === 'login') { lgError(''); if (el('lg-pass')) el('lg-pass').value = ''; }
  const destino = el(id);
  if (!destino) return;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  destino.classList.add('active');
  cabecera(id);
  /* Se pinta despues de mostrar la pantalla: asi el usuario ve el
     esqueleto y el mensaje "Cargando datos..." mientras llega la API. */
  if (PINTORES[id]) PINTORES[id]();
  scrollTo(0, 0);
  if (sesion) reiniciarInactividad();
}

/* ---------- RNF-01 cierre automático por inactividad (10 min) ---------- */
const INACTIVIDAD_MS = ((window.FINTEC_CONFIG && window.FINTEC_CONFIG.INACTIVIDAD_MIN) || 10) * 60 * 1000;
let temporizadorInactividad = null;
function reiniciarInactividad() {
  clearTimeout(temporizadorInactividad);
  if (!sesion) return;
  temporizadorInactividad = setTimeout(() => {
    if (sesion) { ping('Sesión cerrada por inactividad'); salir(); }
  }, INACTIVIDAD_MS);
}
function detenerInactividad() { clearTimeout(temporizadorInactividad); temporizadorInactividad = null; }
['click', 'keydown', 'scroll', 'mousemove', 'touchstart'].forEach(ev =>
  document.addEventListener(ev, () => { if (sesion) reiniciarInactividad(); }, { passive: true })
);

/* Tasas mensuales por tipo de credito (prototipo academico, no son ofertas reales).
   Los rangos van de 1,5% a 2,5% mensual para quedarse dentro de valores de mercado
   habituales en Colombia: la hipoteca es la mas barata, libre inversion la mas cara. */
const TASAS_CREDITO = { libre: 0.025, vehiculo: 0.019, hipoteca: 0.015 };
const NOMBRES_CREDITO = { libre: 'libre inversión', vehiculo: 'vehículo', hipoteca: 'hipoteca' };
let tipoCreditoSel = 'libre';

function elegirTipo(t) {
  if (!(t in TASAS_CREDITO)) return;
  tipoCreditoSel = t;
  document.querySelectorAll('#tipoCredito .chip').forEach(b => {
    b.setAttribute('aria-pressed', b.dataset.tipo === t ? 'true' : 'false');
  });
  simular();
}

function simular() {
  const monto = +el('monto').value, plazo = +el('plazo').value;
  const r = TASAS_CREDITO[tipoCreditoSel] || 0.025;
  el('montoLbl').textContent = fmt(monto);
  el('plazoLbl').textContent = plazo + ' meses';
  el('cuota').textContent = fmt(monto * r / (1 - Math.pow(1 + r, -plazo)));
  const nota = el('simNota');
  if (nota) {
    const pct = (r * 100).toFixed(1).replace('.', ',');
    const ea  = ((Math.pow(1 + r, 12) - 1) * 100).toFixed(1).replace('.', ',');
    nota.textContent =
      `Crédito de ${NOMBRES_CREDITO[tipoCreditoSel]} · tasa fija de ${pct}% mensual (~${ea}% E.A.). ` +
      `Valor simulado con fines ilustrativos para este prototipo académico; no constituye una oferta real de crédito.`;
  }
}

/* ---------- arranque ---------- */
/* Si quedo un token en sessionStorage (recarga de la pestaña) se reusa
   la sesion; si no sirve, la primera peticion devolvera 401 y se cierra. */
(function iniciar() {
  cabecera('u-inicio');
  simular();
  const guardada = API.restaurarSesion();
  if (guardada && guardada.rol) {
    sesion = guardada;
    reiniciarInactividad();
    go(guardada.rol === 'admin' ? 'a-panel' : guardada.rol === 'contable' ? 'c-panel' : 'u-inicio');
  }
})();
