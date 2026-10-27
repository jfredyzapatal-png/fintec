# FINTEC — Manual del usuario

Guía corta y clara de qué puede hacer cada persona que entre a la aplicación.

**URL del front:** https://fintec-web.onrender.com
**URL del API:** https://fintec-api.onrender.com

> La primera carga puede tardar hasta un minuto. El plan gratuito de Render
> suspende los servicios por inactividad. Si no abre, denle refrescar.

---

## 1. Sin iniciar sesión (público)

Al abrir la URL, cualquier persona puede:

- **Ver la landing** con la descripción del producto.
- **Simular un crédito**: eligen un tipo (libre inversión 2,5 % · vehículo
  1,9 % · hipoteca 1,5 % mensual), escriben monto y plazo, y la aplicación
  calcula la cuota mensual al instante.
- **Registrarse** como cliente nuevo (`Crear cuenta`).
- **Iniciar sesión** con un documento y una clave.

Clicar en "Crear un bolsillo", "Ver convenios" o cualquier acción privada
redirige al login.

### Registro de un cliente nuevo

Campos obligatorios: documento (5-15 caracteres alfanuméricos), nombre, clave
(mínimo 8 caracteres) y correo. La fecha de nacimiento es opcional pero si se
da, se exige mayor de 18 años.

Tras el registro queda con **saldo $0**, cuenta activa y topes por defecto
($5.000.000 diario / $20.000.000 mensual).

---

## 2. Usuario cliente

Ocho pantallas, accesibles desde la barra superior:

### 2.1 Inicio
Resumen de la cuenta:
- Saldo disponible.
- Total ahorrado en bolsillos.
- Últimos 5 movimientos.
- Accesos directos a transferir, crear bolsillo y solicitar crédito.

### 2.2 Enviar (transferencias)
Transferir dinero a otra cuenta FINTEC en **dos pasos**:

1. Escribo el número de cuenta destino y el monto. Pulso *Transferir*.
2. La aplicación consulta al servidor y muestra el **nombre del titular**.
3. Si es correcto, pulso *Sí, enviar*. Si no, pulso *Cancelar*.

Reglas que el servidor valida:
- No se puede transferir a la propia cuenta.
- No se puede transferir a una cuenta bloqueada (ni enviar, ni recibir).
- Si el monto supera el disponible → se rechaza y queda registrado como
  *Rechazada*, con el motivo "Saldo insuficiente".
- Si el monto supera el tope diario o mensual del remitente → rechazado y
  registrado con el motivo correspondiente.

### 2.3 Bolsillos
Sub-cuentas de ahorro **dentro de la misma cuenta**. El dinero de un bolsillo
no se puede transferir a otra persona; para gastarlo primero hay que retirarlo
al disponible.

Operaciones:
- **Crear bolsillo** con un nombre único.
- **Aportar** desde el disponible al bolsillo.
- **Retirar** del bolsillo al disponible.

### 2.4 Pagar (convenios)
Pago de servicios a cuatro convenios: **EPM, Universidad, Acueducto, Claro**.
Se escribe la referencia (número que llega en la factura) y el valor. Si no
hay disponible → se rechaza y queda registrado.

### 2.5 Crédito (nuevo en v1.1.0)

**Solicitar un crédito nuevo:**
1. Elegir tipo: *Libre inversión* (2,5 % mensual), *Vehículo* (1,9 %) o
   *Hipoteca* (1,5 %).
2. Escribir monto (entre $500.000 y $20.000.000) y plazo (12, 24, 36 o 48
   meses).
3. La aplicación muestra la **cuota mensual** calculada en vivo.
4. Pulsar *Solicitar crédito*. El principal cae al disponible al instante y
   queda registrado un movimiento de tipo "Crédito".

**Pagar un crédito activo:**
- *Pagar cuota*: descuenta solo la cuota del mes. Al llegar al final del
  plazo o si el saldo es menor que la cuota regular, se cobra únicamente lo
  que falte.
- *Pagar total*: liquida el saldo pendiente de una sola vez. El crédito pasa
  a estado `pagado` y se guarda en el historial.

Si no hay disponible suficiente, el pago se rechaza con un mensaje claro
("Saldo insuficiente. Para pagar $X necesitas al menos ese disponible.").

Detalle completo del módulo: [`MODULO_CREDITO.md`](MODULO_CREDITO.md).

### 2.6 Movimientos
Extracto de operaciones en orden descendente de fecha. Filtro opcional por
rango de fechas. Cada movimiento muestra:
- Código legible `TX-####`.
- Tipo (Transferencia, Pago, Bolsillo, Crédito, Reversión, Cancelación).
- Estado (Completada, Rechazada, Cancelada).
- Origen, destino, valor, nota.

### 2.7 Alertas
Notificaciones de cada operación: desembolsos, transferencias enviadas y
recibidas, pagos, créditos pagados, cambios de contraseña, modificaciones de
topes. Las más recientes van primero.

### 2.8 Exportar
Descarga del extracto propio en formato **CSV con separador `;` y BOM UTF-8**.
La cabecera es exactamente:
```
ID;Fecha;Tipo;Origen;Destino;Valor;Estado
```

Abre bien directamente en Excel.

### 2.9 Ajustes (dentro del menú del usuario)
- **Topes diario y mensual** (el diario no puede superar al mensual).
- **Cambio de contraseña** (longitud ≥ 8, distinta de la actual). Deja una
  alerta con la fecha y hora del cambio.

---

## 3. Administrador

Login con `admin` / `admin123`. Dos pantallas:

### 3.1 Panel admin
Tabla con **todos los clientes**. Buscador por documento, cuenta, correo o
nombre. Por cada cliente ve: nombre, documento, cuenta, estado (activa /
bloqueada), rol.

Acciones:
- **Bloquear** una cuenta: la cuenta no puede iniciar sesión, no puede
  transferir ni recibir dinero (RN-07). Si tiene una sesión abierta en ese
  momento, la siguiente petición le devuelve 403 y la aplicación la cierra.
- **Reactivar** una cuenta bloqueada.

Lo que el admin **no** puede hacer:
- Editar saldos a mano (RN-04). La única forma de mover dinero por el admin
  es a través de devoluciones o cancelaciones de transferencias ya hechas.
- Ver, solicitar o pagar créditos de los clientes.

### 3.2 Movimientos (admin)
Historial **global** de todas las cuentas, con filtros por estado, tipo y
cuenta. Desde aquí:

- **Devolución** de una transferencia completada (RN-05): crea un movimiento
  nuevo tipo `Reversión` enlazado con el original; el original **no se edita**
  pero queda marcado como `revertida = true`. Si el destino ya no tiene saldo,
  la devolución se rechaza.
- **Cancelación** de una transferencia completada: deja el movimiento
  original en estado `Cancelada` y restituye saldos.

Un movimiento ya revertido no se puede volver a revertir
(`movimientos_una_reversion_por_original` lo garantiza en la base).

---

## 4. Contable

Login con `contable` / `conta123`. **Solo lectura** (RN-06). Dos pantallas:

### 4.1 Panel contable
Resumen financiero por rango de fechas (por defecto el mes en curso):
- **Ingresos** (sumatoria de transferencias recibidas).
- **Egresos** (sumatoria de transferencias enviadas + pagos + créditos).
- **Neto** = ingresos − egresos.
- **Por tipo** — desglose por categoría: Transferencia, Pago, Bolsillo,
  Crédito, Reversión, Cancelación.
- **Por cliente** — saldo actual, bolsillos y total por cliente.

### 4.2 Reportes (contable)
Igual al extracto global del admin, pero de **solo lectura**. Puede exportar
el historial completo en CSV.

Cualquier intento del contable de escribir (POST / PUT / PATCH / DELETE)
recibe un `403 Forbidden` del middleware `soloLecturaContable`, sin importar
qué ruta sea.

---

## 5. Reglas que valen para todos

| Comportamiento | Dónde |
|---|---|
| Sesión expira a los **10 minutos** de inactividad | JWT `exp 10m` + renovación en cada respuesta exitosa (RNF-01) |
| Tras **5 intentos fallidos** de login, la cuenta se bloquea 15 minutos | `intentos_fallidos` + `bloqueado_hasta` en `usuarios` (RNF-02) |
| Las contraseñas **nunca viajan ni se guardan en texto plano** | `bcryptjs` con costo 10 (RNF-02) |
| El token JWT **no viaja** entre pestañas; vive en `sessionStorage` | `web/js/api.js` |
| Toda operación que mueve dinero ocurre dentro de **una transacción SQL** | `enTransaccion()` en `api/src/db.js` |
| Dos operaciones simultáneas sobre la misma cuenta **se serializan** | `SELECT ... FOR UPDATE` ordenado |
| **El disponible nunca queda negativo** (RN-01) | `CHECK (disponible >= 0)` + `UPDATE ... WHERE disponible >= $monto` |

---

## 6. Resolución de problemas

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| La página tarda ~1 minuto en abrir | Primera petición después de inactividad: el servicio dormía | Esperar; si pasa un minuto largo y no responde, refrescar |
| "No pudimos conectar con el servidor" | API caída o despertando | Esperar 30 s y pulsar *Reintentar* |
| 401 "Falta el token de sesión" | Sesión caducó o cerraron la pestaña | Volver a iniciar sesión |
| "Esa cuenta no existe" al transferir | Número de cuenta mal escrito | Verificar formato `001-234-567` |
| "La cuenta destino está bloqueada" | El admin bloqueó esa cuenta | Avisar al admin |
| "Tu cuenta está bloqueada" al iniciar sesión | 5 intentos fallidos o bloqueo administrativo | Esperar 15 min o pedirle al admin que reactive |
| El crédito dice "ya está pagado" al pagar cuota | Se completó con un pago total previo | Está correcto, el crédito ya cerró |

---

## 7. Para preguntas

El código fuente del front está en `web/`. Cualquier mensaje de error visible
en la pantalla viene literal de la respuesta del servidor (`api/src/`), lo que
hace fácil rastrear el origen.
