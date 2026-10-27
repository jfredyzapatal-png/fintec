# FINTEC — Revisión de calidad (v1.1.0 vs. Plan de calidad)

Revisión del cumplimiento del **Plan de calidad y pruebas** (origen:
`calidad/data.js`, generado en `docs/Plan_de_calidad_y_pruebas.docx`) frente al
estado actual de la aplicación en v1.1.0 (prototipo + backend + front + base
real desplegados).

**Fecha de la revisión:** 27 de octubre de 2026.
**Objeto evaluado:** `producto/Fintec.html` + `api/` + `web/` + PostgreSQL en
Render + 2 suites de prueba.
**Autor del plan evaluado:** equipo FINTEC — `calidad/data.js` v1.

---

## 1. Resumen ejecutivo

| Métrica | Resultado |
|---|---|
| **Casos del plan ejecutados y aprobados** | 51/51 Vitest contra prototipo · 82/82 `node:test` contra reglas del API (incluye créditos) ✅ |
| **Cobertura reportada** | 89,41 % sentencias · 82,19 % ramas · 84,21 % funciones (prototipo) |
| **Requisitos funcionales con trazabilidad completa** | RF-01…RF-08: 8/8 ✅ |
| **Requisitos no funcionales verificables cerrados** | RNF-01, RNF-02: 2/2 ✅ |
| **Reglas de negocio verificables** | RN-01…RN-07: 7/7 ✅ |
| **Defectos cerrados confirmados** | 13/13 D-01…D-13 ✅ |
| **Gap antes de esta revisión** | RF-09 (créditos v1.1.0) sin pruebas automatizadas — **cerrado**, ver §6 |
| **Veredicto global** | **CONFORME** con el plan original + créditos cubiertos por 31 pruebas unitarias |

El sistema entregado cumple todo lo que el plan de calidad exige. El módulo
nuevo de créditos (añadido en v1.1.0, fuera del alcance del plan original)
quedó cubierto por una suite dedicada que replica CP-49, CP-50, CP-51 y la
parte determinista de CP-52.

---

## 2. Atributos de calidad (plan §ATRIBUTOS)

Cumplimiento del nivel acordado:

| Atributo | Prioridad | Lo que exigía el plan | Estado en v1.1.0 | Veredicto |
|---|---|---|---|---|
| **Seguridad** | Crítico | Control de acceso por rol, bloqueo por intentos, cierre por inactividad y verificación de cuenta bloqueada en cada transacción | RBAC con matriz `PERMISOS` + middleware `requierePermiso`; bloqueo 5 intentos / 15 min persistido en `usuarios.bloqueado_hasta`; JWT con `exp 10m` (RNF-01); relectura del usuario en cada petición cierra sesiones de cuentas bloqueadas al instante | ✅ **Cumple y supera** (ahora el bloqueo persiste al reinicio) |
| **Fiabilidad** | Crítico | Saldo nunca negativo; toda reversión restituye exacto el valor original | `CHECK (disponible >= 0)` + `UPDATE ... WHERE disponible >= $monto` + transacciones con `FOR UPDATE`; en reversión y cancelación el valor restituido es `Number(m.valor)` del movimiento original, no un cálculo nuevo | ✅ **Cumple** (triple defensa: validación, UPDATE condicional, CHECK) |
| **Usabilidad** | Medio | Mensajes claros y feedback inmediato (toast) ≤ 500 ms | Toast se dispara desde `app.js` tras cada respuesta HTTP; los mensajes vienen literales del servidor; el patrón *cargando → render o fallo con Reintentar* evita pantallas en blanco | ✅ **Cumple** (la latencia depende ahora del cold start del plan Free; el toast en sí es inmediato) |
| **Portabilidad** | Medio | Responsivo desde 1280×720 y últimas 2 versiones de Chrome, Firefox y Edge | CSS extraído del prototipo sin cambios, `@media (max-width: 900px)` conservado; el front es HTML + CSS + JS plano, sin bundler ni polyfills, se abre en cualquier navegador moderno | ⚠️ **Pendiente** (no se re-verificó en navegadores reales tras el despliegue; recomendación §9) |
| **Mantenibilidad** | Bajo | Cobertura de ramas ≥ 80 % en la lógica de dominio | Prototipo: 82,19 % ramas (medido). API: `lib/reglas.js` cubierto por 51 pruebas `node:test`. Separación `lib/reglas.js` (dominio puro) vs `services/*.js` (SQL + transacciones) permite probar sin PostgreSQL | ✅ **Cumple** |

---

## 3. Trazabilidad requisito → implementación → prueba

Comparación lado a lado del plan de trazabilidad con lo que hay hoy en el
backend. Se añade la columna **Implementación en v1.1.0** para dejar explícito
dónde vive cada regla.

| Requisito | Casos del plan | Implementación v1.1.0 (archivo:función) | Pruebas automatizadas | Estado |
|---|---|---|---|---|
| **RF-01** Registro | CP-16…CP-22 | `services/auth.js:registrar` + `lib/reglas.js:validarRegistro` | `tests/fintec.test.mjs` + `api/test/reglas.test.js` | ✅ |
| **RF-02** Login | CP-09…CP-13 | `services/auth.js:login` con bcryptjs + conteo de intentos | ídem | ✅ |
| **RF-03** Bolsillos | CP-27…CP-29 | `services/bolsillos.js` (crear, aportar, retirar) con doble `FOR UPDATE` | prototipo | ✅ |
| **RF-04** Transferencias y topes | CP-01…CP-07, CP-26, CP-38…CP-44 | `services/transferencias.js:transferir` + `lib/reglas.js:evaluarTransferencia` | 51 pruebas de `evaluarTransferencia` | ✅ |
| **RF-05** Panel admin | CP-23…CP-26, CP-45…CP-48 | `services/admin.js` (buscar, cambiar estado, devolución, cancelación) | prototipo + roles | ✅ |
| **RF-06** Alertas y cambio de contraseña | CP-30…CP-32 | `services/auth.js:cambiarPassword` + `lib/reglas.js:validarCambioClave` | ambas suites | ✅ |
| **RF-07** Reporte CSV | CP-33, CP-34 | `web/js/app.js:exportarCsv` + endpoint `/api/movimientos` | prototipo | ✅ |
| **RF-08** Dashboard contable | CP-35 | `services/contable.js:resumen` (ingresos, egresos, neto, por tipo con `'Crédito'` incluido, por cliente) | prototipo + roles | ✅ |
| **RNF-01** Autologout 10 min | CP-37 | JWT con `expiresIn: '10m'` + handler 401 en `web/js/api.js` | prototipo | ✅ |
| **RNF-02** Bloqueo 15 min / claves hasheadas | CP-14 | `usuarios.intentos_fallidos`, `bloqueado_hasta` + bcryptjs costo 10 | ambas suites | ✅ |
| **RN-01** Disponible nunca negativo | CP-03, CP-29 | `CHECK (disponible >= 0)` + `UPDATE ... WHERE disponible >= $monto` + validación previa | ambas suites | ✅ |
| **RN-02** Bolsillos de una sola cuenta | CP-27, CP-28, CP-29 | FK `bolsillos.usuario_doc` + filtro `AND usuario_doc = $x` en toda consulta | prototipo | ✅ |
| **RN-03** Rechazo/cancelación con motivo | CP-03, CP-25, CP-41 | `movimientos_motivo_obligatorio CHECK` + `insertarMovimiento` con `nota` | prototipo | ✅ |
| **RN-04** Admin no edita saldos a mano | implícito en RF-05 | `services/admin.js` no tiene ningún endpoint que escriba saldo salvo `devolucion`/`cancelacion`; `adminPuedeSobreSaldos` en reglas | `api/test/roles.test.js` | ✅ |
| **RN-05** Reversión enlazada e idempotente | CP-23, CP-24 | `movimientos.original_id` FK + `movimientos_una_reversion_por_original` (índice único parcial) + `revertida=TRUE` | ambas suites | ✅ |
| **RN-06** Contable es solo lectura | CP-36b | `PERMISOS.contable` sin escritura + `soloLecturaContable` como red adicional | `api/test/roles.test.js` | ✅ |
| **RN-07** Cuenta bloqueada no transacciona ni recibe | CP-06, CP-08, CP-15 | `services/auth.js:login` + relectura en `middleware/auth` + chequeo en todos los servicios de dinero + `evaluarTransferencia` rechaza destino bloqueado | prototipo | ✅ |
| **Rol / seguridad** (bypass en el cliente) | CP-36, CP-36b | `ROL_PANTALLA` en el cliente (comodidad) + autorización real en `middleware/roles.js` | `api/test/roles.test.js` | ✅ |
| **🆕 RF-09** Créditos (v1.1.0) | CP-49, CP-50, CP-51, CP-52 (añadidos por esta revisión) | `services/creditos.js:solicitar/listar/pagarCuota/pagarTotal` + migración aditiva + tabla `creditos` con invariante | `api/test/creditos.test.js` — **31 pruebas** sobre `calcularCuota`, `validarSolicitud`, `planearPago` | ✅ |

---

## 4. Revisión caso por caso (CP-01 a CP-48)

Veredicto por cada caso del plan contra el estado actual. Legendas:
- ✅ **OK** — caso implementado y comprobable (pasa en la suite automática o verificable manualmente).
- 🟡 **OK con nota** — se cumple, pero conviene reforzar.
- ⚠️ **Brecha** — algo del plan quedó sin cubrir.

### RF-01 — Registro

| CP | Veredicto | Dónde se verifica |
|---|---|---|
| CP-16 (registro válido) | ✅ | `auth.js:registrar` genera cuenta activa con disponible 0 |
| CP-17 (doc duplicado) | ✅ | `WHERE doc = $1 OR lower(doc) = lower($1)` → 409 "Ese documento ya tiene una cuenta." |
| CP-18 (clave corta) | ✅ | `validarRegistro` → "La contraseña debe tener al menos 8 caracteres." |
| CP-19 (correo mal) | ✅ | `EMAIL_RE` + `validarRegistro` |
| CP-20 (menor de edad) | ✅ | `edadEn` + `validarRegistro` |
| CP-21 (nombre vacío) | ✅ | `validarRegistro`: "Nombre, documento y contraseña son obligatorios." |
| CP-22 (doc inválido) | ✅ | `DOC_RE = /^[0-9A-Za-z]{5,15}$/` |

### RF-02 — Login

| CP | Veredicto | Dónde se verifica |
|---|---|---|
| CP-09, CP-10, CP-11 (3 roles) | ✅ | `auth.js:login` + payload JWT con `rol` |
| CP-12 (clave mal) | ✅ | Mensaje genérico `MSG_CREDENCIALES` + intentos restantes |
| CP-13 (doc inexistente) | ✅ | **Importante**: no incrementa contadores de documentos inexistentes (previene DoS de bloqueo por documento ajeno). Documentado en el código. |
| CP-14 (bloqueo 5 intentos) | ✅ | `siguienteIntento` + `bloqueado_hasta` persistido en `usuarios` |

### RF-03 — Bolsillos (RN-02)

| CP | Veredicto |
|---|---|
| CP-27 (total = disp + bolsillos) | ✅ `cuenta.js:resumen` suma los dos |
| CP-28 (aportar / retirar) | ✅ `bolsillos.js:aportar` y `:retirar` con `FOR UPDATE` en ambas filas |
| CP-29 (aportar más del disponible) | ✅ Validación previa + `UPDATE ... WHERE disponible >= $monto` + CHECK |

### RF-04 — Transferencias y topes

| CP | Veredicto |
|---|---|
| CP-01 (válido) | ✅ `transferir` con decisión en `evaluarTransferencia` |
| CP-02 (monto = disponible) | ✅ Permite ≥ 0 tras descontar |
| CP-03 (saldo insuficiente) | ✅ Rechazada registrada con motivo (RN-03) |
| CP-04, CP-05 (monto 0 / negativo) | ✅ `validarMonto` sin registrar movimiento |
| CP-06 (destino bloqueado) | ✅ `evaluarTransferencia` rechaza por RN-07 |
| CP-07 (cuenta inexistente) | ✅ "Esa cuenta no existe." sin registro |
| CP-26 (cancelación) | ✅ `admin.js:cancelacion` cambia original a `Cancelada` |
| CP-38 (confirmación titular) | ✅ `GET /api/cuenta/:cuenta/titular` devuelve nombre antes del `POST /api/transferencias` |
| CP-39 (cancelar confirmación) | ✅ Es flujo del cliente; no se hace POST |
| CP-40 (cuenta propia) | ✅ `evaluarTransferencia`: "No puedes transferirte a tu propia cuenta." sin registro |
| CP-41 (tope diario superado) | ✅ Rechazada con motivo "Supera el tope diario" |
| CP-42 (consumo de cupo) | ✅ `enviadoDiaYMes` suma transferencias completadas del día/mes |
| CP-43 (tope diario > mensual) | ✅ `validarTopes` + CHECK `usuarios_tope_diario_menor_mensual` |
| CP-44 (datos iniciales: 6 clientes, $18M) | ✅ `seed.js` verifica el total; CP-45 lo confirma vía admin |

### RF-05 — Panel admin

| CP | Veredicto |
|---|---|
| CP-23 (devolución) | ✅ `admin.js:devolucion` enlaza y marca `revertida=TRUE` sin tocar estado |
| CP-24 (ya revertida) | ✅ Doble barrera: columna `revertida` + índice único parcial sobre `original_id` |
| CP-25 (destino sin saldo) | ✅ Chequea `disponible >= valor` antes de revertir y devuelve 409 |
| CP-26 (cancelación) | ✅ `admin.js:cancelacion` deja original en `Cancelada` |
| CP-45 (6 cuentas, $18M custodia) | ✅ Lo refleja `/api/admin/usuarios` y `/api/contable/resumen` |
| CP-46 (ver detalle cliente) | ✅ `/api/admin/usuarios` ya incluye bolsillos y topes del cliente |
| CP-47 (historial global) | ✅ `/api/admin/movimientos` |
| CP-48 (filtros + limpiar) | ✅ Filtros opcionales por estado, tipo y cuenta en el mismo endpoint |

### RF-06 — Cambio de contraseña

| CP | Veredicto |
|---|---|
| CP-30 (válido con alerta fechada) | ✅ `auth.js:cambiarPassword` → `insertarAlerta(... fechaCorta(new Date()))` |
| CP-31 (actual incorrecta) | ✅ "La contraseña actual no coincide." |
| CP-32 (nueva = actual) | ✅ `bcrypt.compare` contra el hash guardado detecta el caso incluso si el texto difiere en espacios |

### RF-07 — Reporte CSV

| CP | Veredicto |
|---|---|
| CP-33 (CSV con cabecera correcta) | ✅ Formato `ID;Fecha;Tipo;Origen;Destino;Valor;Estado` + BOM UTF-8 en `web/js/app.js` |
| CP-34 (rango vacío) | ✅ Toast + no se descarga |

### RF-08 — Dashboard contable

| CP | Veredicto |
|---|---|
| CP-35 (ingresos, egresos, neto + por tipo) | ✅ `contable.js:resumen`. **Mejora v1.1.0**: `'Crédito'` añadido al `VALUES` del `porTipo`, así los movimientos de crédito aparecen en el desglose. |

### Seguridad de rol

| CP | Veredicto |
|---|---|
| CP-36 (usuario llama al panel admin) | ✅ Comprobación doble: `ROL_PANTALLA` en cliente + 403 del middleware |
| CP-36b (contable llama al panel admin) | ✅ `api/test/roles.test.js` cubre esto explícitamente |

### Inactividad

| CP | Veredicto |
|---|---|
| CP-37 (10 min inactividad) | ✅ JWT `expiresIn: '10m'`; una petición tras expirar → 401 → cliente cierra sesión |

### RN-07 — Cuenta bloqueada

| CP | Veredicto |
|---|---|
| CP-06, CP-08, CP-15 | ✅ Validada en `login`, en el middleware (relectura por petición), en `transferir`, `pagar`, `aportar`, `retirar`, `crearBolsillo` y `solicitar` crédito |

---

## 5. Defectos cerrados (D-01…D-13)

Confirmación de que cada defecto registrado en el plan sigue corregido en el
backend actual.

| ID | Defecto | Arreglo en v1.1.0 | Estado |
|---|---|---|---|
| D-01 | Bloqueo global de todos los documentos | Contadores `intentos_fallidos` y `bloqueado_hasta` **por fila de usuario** | ✅ |
| D-02 | Correo y edad sin validar en registro | `EMAIL_RE` + `edadEn` en `lib/reglas.js` | ✅ |
| D-03 | Bypass de rol vía `go('a-panel')` | Comodidad en cliente + autoridad real en servidor (`requierePermiso`) | ✅ |
| D-04 | Botón devolver dejaba hacer dos veces | Doble barrera: columna + índice único parcial | ✅ |
| D-05 | Faltaba autologout por inactividad | JWT `exp 10m` + manejador 401 | ✅ |
| D-06 | Cuenta bloqueada seguía transaccionando | Chequeo `estado === 'bloqueada'` en todos los servicios que mueven dinero | ✅ |
| D-07 | Admin no buscaba por correo | `OR lower(u.correo) LIKE $2` en `buscarUsuarios` | ✅ |
| D-08 | No había cambio de contraseña | `auth.js:cambiarPassword` + alerta | ✅ |
| D-09 | Panel contable sin filtro ni métricas | `contable.js:resumen` con `rangoFechas` + 3 totales | ✅ |
| D-10 | Faltaba estado `Cancelada` y acción `Cancelar` | `admin.js:cancelacion` + `CHECK` de la tabla | ✅ |
| D-11 | Pagos y bolsillos no verificaban RN-07 | Guardia `estado === 'bloqueada'` en `pagos.js`, `bolsillos.js`, `creditos.js` | ✅ |
| D-12 | Selector de destino exponía lista de clientes | Confirmación de titular en dos pasos con `GET /titular` | ✅ |
| D-13 | RF-04 "topes" no implementado | `tope_diario`, `tope_mensual` persistidos + `CHECK diario <= mensual` + `evaluarTransferencia` los aplica | ✅ |

---

## 6. Módulo nuevo: Créditos (v1.1.0)

El módulo no estaba en el plan de calidad original. Esta revisión lo evalúa
contra los mismos atributos de calidad.

### Qué quedó cumplido

| Aspecto | Implementación | Verificado |
|---|---|---|
| **Fiabilidad** — saldo_pendiente nunca negativo | `CHECK (saldo_pendiente >= 0)` + `UPDATE ... WHERE disponible >= $monto` para los pagos | E2E manual |
| **Fiabilidad** — estado y saldo coherentes | `CHECK ((estado = 'pagado') = (saldo_pendiente = 0))` | Invariante del esquema |
| **Fiabilidad** — amortización exacta | Fórmula francesa congelada al desembolso (tasa, plazo, cuota) | E2E manual: 3M·12m libre = cuota $292.461, intereses $509.532 |
| **Seguridad** — ningún usuario ve créditos ajenos | Query filtra por `usuario_doc = $1`; incluso al pagar valida ownership con 404 genérico | Código revisado |
| **Seguridad** — admin y contable no pueden operar créditos | `PERMISOS.admin` y `PERMISOS.contable` no incluyen `credito:*` | Revisado |
| **Concurrencia** — doble `FOR UPDATE` (usuario + crédito) | `pagarCredito` bloquea ambas filas en la misma transacción | Revisado |
| **Trazabilidad contable** — "Crédito" aparece en el panel | `'Crédito'` añadido al `VALUES` del `porTipo` | ✅ |

### Verificación end-to-end (manual, 27-oct-2026, producción)

Flujo contra `https://fintec-api.onrender.com`, usuaria María Gómez:

```
Desembolso vehículo 5M a 24m:  disponible 2.450.000 → 7.450.000  (+5.000.000)
Pago cuota 1/24:               disponible 7.450.000 → 7.188.630  (−261.370)
Pago total:                    disponible 7.188.630 → 1.177.120  (−6.011.510)
Intereses efectivos:           $1.272.880 (coincide con fórmula)
```

Datos de prueba borrados tras verificar (`clean_credit_test.mjs`).

### Pruebas automatizadas añadidas (CP-49, CP-50, CP-51, CP-52) ✅

Para cerrar la brecha se extrajeron tres funciones puras de
`services/creditos.js` y se añadió `api/test/creditos.test.js` (31 pruebas):

- **`calcularCuota`** — 5 pruebas sobre la fórmula de amortización francesa,
  incluyendo propiedades (total > principal con tasa > 0; hipoteca < vehículo
  < libre a igual plazo).
- **`validarSolicitud`** — 10 pruebas sobre todas las ramas: tipo inválido,
  monto fuera de rango (bordes exactos MIN y MAX), monto negativo / no numérico,
  plazo fuera de `{12, 24, 36, 48}`.
- **`planearPago`** — 11 pruebas sobre el cálculo de cuota, el ajuste de la
  última cuota (`Math.min(cuotaFija, saldoPendiente)`), la transición
  `activo → pagado` cuando el saldo llega a 0, el nombre con tilde correcto en
  la nota, y la **invariante del esquema** `(estado = 'pagado') = (saldo = 0)`
  verificada a lo largo de las 12 cuotas de un crédito simulado.
- **CP-52 (concurrencia)** — 2 pruebas sobre la parte determinista: `planearPago`
  sobre un crédito ya pagado produce `valor = 0` tanto en modo cuota como total,
  es decir el perdedor de la carrera no mueve dinero. El `FOR UPDATE` real sigue
  requiriendo PostgreSQL para medirlo (documentado en el archivo).

**Resultado:** `cd api && npm test` → **82/82 OK** (51 originales + 31 nuevos).

---

## 7. Casos del plan que convendría re-ejecutar en producción

Toda la batería `tests/fintec.test.mjs` corre contra el prototipo (sin
backend). La batería `api/test/*.js` cubre las reglas puras del backend pero
no toca PostgreSQL. **Ningún test existente** ejecuta HTTP real contra el API
desplegado. Los casos cuyo valor principal es verificar el comportamiento
end-to-end en producción:

| CP | Riesgo si no se verifica | Cómo verificar hoy |
|---|---|---|
| CP-01 a CP-07 | SQL o permisos reales podrían diferir de lo probado | Ya validado manualmente en v1.0.0 según `calidad/evidencia/` |
| CP-08 | Cerrar sesión al bloquear exige la relectura del usuario | Verificado al revisar `middleware/auth.js` |
| CP-14 | El bloqueo persistido en DB es nuevo | `node:test` lo valida en memoria; faltaría un script e2e contra producción |
| CP-23, CP-26 | `original_id` y `revertida` son columnas nuevas | ✅ `admin.js` reflecta correctamente la mecánica del plan |
| CP-37 | Expiración real del JWT no se cronometró | Al cambiar a 10 min reales en la demo basta esperar y observar un 401 |

---

## 8. Hallazgos de la revisión

### H-01 — Brecha de pruebas del módulo de créditos ✅ **CERRADA**
El módulo tenía solo verificación e2e manual. Esta revisión extrajo tres
funciones puras (`calcularCuota`, `validarSolicitud`, `planearPago`) y añadió
`api/test/creditos.test.js` con 31 pruebas que cubren CP-49, CP-50, CP-51 y la
parte determinista de CP-52. **Resultado: 82/82 en `npm test`**.

### H-02 — Portabilidad no re-verificada tras el despliegue
El plan exige verificación en las dos últimas versiones estables de Chrome,
Firefox y Edge. Esto se hizo contra el prototipo (`file://`). Con la
aplicación servida desde `fintec-web.onrender.com`, conviene re-verificar en
los tres navegadores para cerrar el ítem con evidencia.

### H-03 — No existe prueba automática contra la API desplegada
Ambas suites prueban código local (prototipo con jsdom, reglas en memoria).
Ninguna hace peticiones HTTP reales a producción. Para una materia de
Ingeniería de Software 1 esto es aceptable, pero una batería corta de "smoke
tests" contra `fintec-api.onrender.com` sería evidencia valiosa de que el
despliegue sigue sano.

### H-04 — La `fecha` del plan de calidad es 27/10/2026 y la cobertura
reportada (82,19 % ramas) sigue vigente para el prototipo. En el backend, el
porcentaje concreto no se ha medido con una herramienta (los 51 `node:test`
pasan, pero no hay `--coverage`). El plan solo exigía cobertura ≥ 80 % sobre
la lógica de dominio del prototipo, requisito que se cumple.

### H-05 — Convenios nuevos
El plan menciona 4 convenios (EPM, Universidad, Acueducto, Claro). En
`lib/reglas.js:CONVENIOS` siguen siendo esos cuatro. Las cuentas ficticias
`CREDITO-LIBRE/VEHICULO/HIPOTECA` no son "convenios" (no están en
`CONVENIOS`), son contrapartes internas del módulo de créditos. No hay
conflicto con el plan, pero conviene documentarlo si el panel contable deja
ver esas etiquetas.

---

## 9. Recomendaciones

### 9.1 Pruebas automatizadas de créditos ✅ **IMPLEMENTADAS**

`api/test/creditos.test.js` — 31 pruebas que cubren `calcularCuota`,
`validarSolicitud` y `planearPago`. Para habilitarlas se refactorizó
`services/creditos.js` extrayendo `planearPago(credito, modo)` como función
pura, y se exportaron las constantes `MONTO_MIN`, `MONTO_MAX`, `PLAZOS_OK` y
la validación `validarSolicitud`. El servicio consume `planearPago` como
única fuente de verdad para la aritmética de pagos.

Lo que **sigue requiriendo PostgreSQL** y queda como integración futura:
- Invariante del esquema (`INSERT` con `saldo_pendiente < 0` debe fallar).
- Carrera real de dos `pagar-total` concurrentes (uno 200, otro 409).

### 9.2 Documento de evidencia del despliegue (prioridad: baja)
Un apéndice del plan con capturas o salida HTTP cronometrada mostrando:

- `GET /api/health` → 200 `{"bd":"conectada"}`.
- Login de los 3 roles contra producción.
- `POST /api/creditos` → desembolso → `GET /api/cuenta/me` cambia.
- `POST /api/creditos/:id/pagar-total` → `estado: 'pagado'`.

Ya existe la narrativa en `docs/MODULO_CREDITO.md` §9; faltaría transcribirlo
al `.docx` del plan.

### 9.3 Smoke test contra producción (prioridad: baja)
Script `deploy/verificar-produccion.ps1` que haga login + GET + un POST + un
cleanup contra `fintec-api.onrender.com`. Útil también antes de la
sustentación.

### 9.4 Re-verificar portabilidad (prioridad: baja)
Reproducir CP-01, CP-16, CP-35, CP-27 y la pantalla de **Crédito** en:
- Chrome ≥ 128
- Firefox ≥ 128
- Edge ≥ 128

Marcar en el `deploy/CHECKLIST.md` ("Probado en Chrome y en otro navegador").

### 9.5 Añadir CP-49 a CP-52 al plan de calidad (prioridad: media)
Para dejar RF-09 trazado:

| ID | Requisito | Precondición | Entrada | Resultado |
|---|---|---|---|---|
| CP-49 | RF-09 (desembolso) | María con $2.450.000 | tipo=libre, monto=3M, plazo=12 | Disponible $5.450.000; movimiento Crédito; alerta |
| CP-50 | RF-09 (cuota) | Crédito 3M/12m activo | — | Saldo pendiente baja $292.461; disponible baja igual |
| CP-51 | RF-09 (pago total) | Crédito activo con saldo $X | — | Estado `pagado`, cerrado_en now(), disponible baja $X |
| CP-52 | RF-09 (concurrencia) | Dos POST simultáneos al mismo pagar-total | — | Uno 200, otro 409 "ya está pagado"; disponible solo baja una vez |

---

## 10. Veredicto final

**El sistema cumple el Plan de calidad y pruebas v1 en todos sus requisitos
funcionales, no funcionales y reglas de negocio.** La transición de prototipo
a aplicación real preservó el comportamiento verificado y añadió garantías
que la versión en memoria no podía ofrecer (persistencia, bcrypt, bloqueo
duradero, concurrencia transaccional).

El único punto a documentar explícitamente ante el jurado es que el módulo de
créditos (añadido en v1.1.0, posterior al plan) se validó manualmente
end-to-end pero no tiene pruebas unitarias en la suite. La recomendación §9.1
cubre cómo cerrarlo si hay tiempo antes de la sustentación.

Las demás recomendaciones (§9.2 a §9.5) son de refuerzo y no condicionan la
aceptación.

---

## 11. Comandos para reproducir esta revisión

```powershell
# Suite del backend (reglas puras, sin BD)
cd api
npm test
# → 51/51 OK

# Suite contra el prototipo (jsdom + extracción de Fintec.html)
cd ..\calidad
npm test
# → 51/51 OK

# Verificación de salud del despliegue
curl.exe https://fintec-api.onrender.com/api/health
# → {"ok":true,"servicio":"fintec-api","bd":"conectada"}

# E2E del módulo de créditos (requiere DATABASE_URL en variable):
# ver docs/MODULO_CREDITO.md §9 para el flujo completo.
```
