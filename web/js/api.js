/* ============================================================
   FINTEC - cliente HTTP
   Unico punto por el que la aplicacion habla con la API. Guarda
   el token JWT, pone la cabecera Authorization y normaliza los
   errores (HTTP y de red) en un solo tipo de excepcion, para que
   las pantallas solo tengan que leer .mensaje.
   ============================================================ */
(function (global) {
  'use strict';

  var CFG = global.FINTEC_CONFIG || {};
  var BASE = (CFG.API_URL || '').replace(/\/+$/, '');
  var TIMEOUT = CFG.TIMEOUT_MS || 10000;
  var CLAVE_TOKEN = 'fintec.token';
  var CLAVE_USUARIO = 'fintec.usuario';

  /* El token vive en memoria y se respalda en sessionStorage, para que
     al recargar la pestana no se pierda la sesion. Al cerrar la pestana
     se va, que es lo que queremos en una app de banca. */
  var token = null;
  var usuario = null;

  function leerSesionGuardada() {
    try {
      token = global.sessionStorage.getItem(CLAVE_TOKEN) || null;
      var crudo = global.sessionStorage.getItem(CLAVE_USUARIO);
      usuario = crudo ? JSON.parse(crudo) : null;
    } catch (e) {
      /* sessionStorage puede no estar disponible (file://, modo privado).
         No es un fallo: seguimos solo con memoria. */
      token = null;
      usuario = null;
    }
  }

  function guardarSesion() {
    try {
      if (token) {
        global.sessionStorage.setItem(CLAVE_TOKEN, token);
      } else {
        global.sessionStorage.removeItem(CLAVE_TOKEN);
      }
      if (usuario) {
        global.sessionStorage.setItem(CLAVE_USUARIO, JSON.stringify(usuario));
      } else {
        global.sessionStorage.removeItem(CLAVE_USUARIO);
      }
    } catch (e) {
      /* sin almacenamiento seguimos funcionando solo en memoria */
    }
  }

  /* ---------- error unificado ---------- */
  function ErrorApi(mensaje, estado, cuerpo) {
    this.name = 'ErrorApi';
    this.mensaje = mensaje;
    this.message = mensaje;
    this.estado = estado || 0;
    this.cuerpo = cuerpo || null;
    this.esRed = !estado;
    this.esAuth = estado === 401 || estado === 403;
  }
  ErrorApi.prototype = Object.create(Error.prototype);
  ErrorApi.prototype.constructor = ErrorApi;

  /* La API puede devolver {mensaje}, {error}, {message} o texto plano.
     Probamos en ese orden antes de caer en un mensaje genérico. */
  function mensajeDe(cuerpo, estado) {
    if (cuerpo && typeof cuerpo === 'object') {
      var m = cuerpo.mensaje || cuerpo.error || cuerpo.message;
      if (typeof m === 'string' && m.trim()) return m.trim();
      if (Array.isArray(cuerpo.errores) && cuerpo.errores.length) {
        return cuerpo.errores
          .map(function (e) { return (e && (e.mensaje || e.message || e.msg)) || String(e); })
          .join(' · ');
      }
    }
    if (typeof cuerpo === 'string' && cuerpo.trim() && cuerpo.length < 300) {
      return cuerpo.trim();
    }
    if (estado === 401) return 'Tu sesión no es válida o expiró. Vuelve a ingresar.';
    if (estado === 403) return 'No tienes permiso para esta operación.';
    if (estado === 404) return 'No encontramos lo que buscabas.';
    if (estado === 409) return 'La operación entra en conflicto con el estado actual.';
    if (estado >= 500) return 'La API tuvo un error interno. Intenta de nuevo en un momento.';
    return 'No pudimos completar la operación (error ' + estado + ').';
  }

  function sinConexion() {
    return new ErrorApi(
      'No pudimos conectar con el servidor de FINTEC. Revisa que la API esté ' +
      'corriendo y que API_URL en config.js apunte a ella.',
      0, null);
  }

  /* ---------- peticion base ---------- */
  function pedir(metodo, ruta, cuerpo) {
    var url = BASE + ruta;
    var opciones = {
      method: metodo,
      headers: { 'Accept': 'application/json' }
    };
    if (cuerpo !== undefined && cuerpo !== null) {
      opciones.headers['Content-Type'] = 'application/json';
      opciones.body = JSON.stringify(cuerpo);
    }
    if (token) {
      opciones.headers['Authorization'] = 'Bearer ' + token;
    }

    /* AbortController corta la espera: sin esto una API caida deja la
       pantalla pensando indefinidamente. */
    var ctrl = null;
    var temporizador = null;
    if (typeof global.AbortController === 'function') {
      ctrl = new global.AbortController();
      opciones.signal = ctrl.signal;
      temporizador = global.setTimeout(function () { ctrl.abort(); }, TIMEOUT);
    }

    return global.fetch(url, opciones)
      .then(function (resp) {
        if (temporizador) global.clearTimeout(temporizador);
        var tipo = resp.headers.get('content-type') || '';
        var lectura = tipo.indexOf('application/json') >= 0
          ? resp.json().catch(function () { return null; })
          : resp.text().catch(function () { return null; });
        return lectura.then(function (datos) {
          if (!resp.ok) {
            throw new ErrorApi(mensajeDe(datos, resp.status), resp.status, datos);
          }
          return datos;
        });
      })
      .catch(function (e) {
        if (temporizador) global.clearTimeout(temporizador);
        if (e instanceof ErrorApi) throw e;
        if (e && e.name === 'AbortError') {
          throw new ErrorApi('El servidor tardó demasiado en responder.', 0, null);
        }
        /* TypeError de fetch = DNS, CORS, servidor apagado, offline */
        throw sinConexion();
      });
  }

  function qs(params) {
    var partes = [];
    Object.keys(params || {}).forEach(function (k) {
      var v = params[k];
      if (v === undefined || v === null || v === '') return;
      partes.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    });
    return partes.length ? '?' + partes.join('&') : '';
  }

  /* ============================================================
     Superficie publica: un metodo por endpoint del contrato.
     ============================================================ */
  var API = {
    ErrorApi: ErrorApi,
    baseUrl: function () { return BASE || '(mismo origen)'; },

    /* ---------- sesion ---------- */
    token: function () { return token; },
    usuario: function () { return usuario; },
    autenticado: function () { return !!token; },
    restaurarSesion: function () { leerSesionGuardada(); return usuario; },
    cerrarSesion: function () { token = null; usuario = null; guardarSesion(); },

    registro: function (datos) {
      return pedir('POST', '/api/auth/registro', {
        doc: datos.doc,
        nombre: datos.nombre,
        clave: datos.clave,
        correo: datos.correo,
        tipo: datos.tipo,
        nacimiento: datos.nacimiento
      });
    },

    login: function (documento, clave) {
      return pedir('POST', '/api/auth/login', { documento: documento, clave: clave })
        .then(function (r) {
          if (!r || !r.token) {
            throw new ErrorApi('La API no devolvió un token de sesión.', 0, r);
          }
          token = r.token;
          usuario = r.usuario || null;
          guardarSesion();
          return usuario;
        });
    },

    cambiarPassword: function (actual, nueva) {
      return pedir('POST', '/api/auth/password', { actual: actual, nueva: nueva });
    },

    /* ---------- cuenta ---------- */
    cuentaMe: function () { return pedir('GET', '/api/cuenta/me'); },
    guardarTopes: function (topeDiario, topeMensual) {
      return pedir('PUT', '/api/cuenta/topes', { topeDiario: topeDiario, topeMensual: topeMensual });
    },
    titular: function (cuenta) {
      return pedir('GET', '/api/cuenta/' + encodeURIComponent(cuenta) + '/titular');
    },

    /* ---------- operaciones ---------- */
    movimientos: function (desde, hasta) {
      return pedir('GET', '/api/movimientos' + qs({ desde: desde, hasta: hasta }));
    },
    transferir: function (cuentaDestino, monto, nota) {
      return pedir('POST', '/api/transferencias', { cuentaDestino: cuentaDestino, monto: monto, nota: nota });
    },
    pagar: function (convenio, referencia, valor) {
      return pedir('POST', '/api/pagos', { convenio: convenio, referencia: referencia, valor: valor });
    },
    cuentasPago: function () { return pedir('GET', '/api/cuentas-pago'); },
    registrarCuentaPago: function (alias, convenio, referencia) {
      return pedir('POST', '/api/cuentas-pago', { alias: alias, convenio: convenio, referencia: referencia });
    },
    eliminarCuentaPago: function (id) {
      return pedir('DELETE', '/api/cuentas-pago/' + encodeURIComponent(id));
    },

    /* ---------- bolsillos ---------- */
    crearBolsillo: function (nombre, meta) {
      return pedir('POST', '/api/bolsillos', { nombre: nombre, meta: meta || 0 });
    },
    configurarMeta: function (id, meta) {
      return pedir('PUT', '/api/bolsillos/' + encodeURIComponent(id) + '/meta', { meta: meta || 0 });
    },
    aportarBolsillo: function (id, monto) {
      return pedir('POST', '/api/bolsillos/' + encodeURIComponent(id) + '/aportar', { monto: monto });
    },
    retirarBolsillo: function (id, monto) {
      return pedir('POST', '/api/bolsillos/' + encodeURIComponent(id) + '/retirar', { monto: monto });
    },

    alertas: function () { return pedir('GET', '/api/alertas'); },
    marcarAlertasLeidas: function () { return pedir('POST', '/api/alertas/leidas', {}); },

    /* ---------- creditos ---------- */
    listarCreditos: function () { return pedir('GET', '/api/creditos'); },
    solicitarCredito: function (tipo, monto, plazo) {
      return pedir('POST', '/api/creditos', { tipo: tipo, monto: monto, plazo: plazo });
    },
    pagarCuotaCredito: function (id) {
      return pedir('POST', '/api/creditos/' + encodeURIComponent(id) + '/pagar-cuota');
    },
    pagarTotalCredito: function (id) {
      return pedir('POST', '/api/creditos/' + encodeURIComponent(id) + '/pagar-total');
    },

    /* ---------- admin ---------- */
    adminUsuarios: function (q) { return pedir('GET', '/api/admin/usuarios' + qs({ q: q })); },
    adminEstado: function (doc, estado) {
      return pedir('PATCH', '/api/admin/usuarios/' + encodeURIComponent(doc) + '/estado', { estado: estado });
    },
    adminMovimientos: function (filtro) {
      filtro = filtro || {};
      return pedir('GET', '/api/admin/movimientos' + qs({
        estado: filtro.estado, tipo: filtro.tipo, cuenta: filtro.cuenta
      }));
    },
    adminDevolucion: function (id) {
      return pedir('POST', '/api/admin/movimientos/' + encodeURIComponent(id) + '/devolucion');
    },
    adminCancelacion: function (id) {
      return pedir('POST', '/api/admin/movimientos/' + encodeURIComponent(id) + '/cancelacion');
    },

    /* ---------- contable ---------- */
    contableResumen: function (desde, hasta) {
      return pedir('GET', '/api/contable/resumen' + qs({ desde: desde, hasta: hasta }));
    },
    /* Historial global de solo lectura. El contable no puede llamar
       /api/admin/movimientos (403). Mismos campos que ese listado. */
    contableMovimientos: function (desde, hasta) {
      return pedir('GET', '/api/contable/movimientos' + qs({ desde: desde, hasta: hasta }));
    }
  };

  leerSesionGuardada();
  global.API = API;
})(window);
