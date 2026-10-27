# FINTEC — Changelog

Versionado inspirado en [SemVer](https://semver.org/lang/es/).

---

## v1.1.0 — 27 de octubre de 2026 — Módulo de créditos

Añadido el módulo de créditos de principio a fin: simulador público,
pantalla de usuario autenticado, servicio con amortización francesa,
migración aditiva idempotente contra la base en producción.

### Añadido
- **Simulador público** con tres tipos de crédito en el landing (chips
  seleccionables): libre inversión (2,5 % mensual), vehículo (1,9 %),
  hipoteca (1,5 %). Calcula la cuota mensual en vivo.
- **Pantalla "Crédito"** en el menú del usuario (`#u-creditos`) con:
  - Formulario para solicitar un crédito con vista previa de la cuota.
  - Lista de créditos activos y pagados.
  - Botones para pagar cuota o pagar total.
- **Backend**:
  - `api/src/services/creditos.js` — servicio completo con amortización
    francesa, transacciones con `FOR UPDATE` y manejo de concurrencia.
  - 4 nuevos endpoints:
    - `GET /api/creditos` (listar propios)
    - `POST /api/creditos` (solicitar y desembolsar)
    - `POST /api/creditos/:id/pagar-cuota`
    - `POST /api/creditos/:id/pagar-total`
  - Nueva tabla `creditos` con invariante
    `(estado = 'pagado') = (saldo_pendiente = 0)`.
  - Nuevos permisos `credito:leer`, `credito:solicitar`, `credito:pagar`
    agregados al rol `usuario`.
  - Nuevo valor `'Crédito'` en el `CHECK` de `movimientos.tipo`.
- **Migración aditiva** `api/db/schema_creditos.sql` + runner
  `api/db/migrate_creditos.js` + script `npm run migrate:creditos`.
- **Panel contable**: `'Crédito'` añadido al desglose por tipo
  (`services/contable.js`).
- **Documentación completa** del módulo en `docs/MODULO_CREDITO.md` y
  reorganización global de los documentos (ver abajo).

### Cambiado
- Simulador anterior de cuota única (1,8 %) sustituido por simulador con
  selector de tres tipos.
- Banner "¿Necesitas un crédito?" del dashboard ahora lleva directo a la
  pantalla de solicitud, no al simulador.
- `api/package.json`: `version` bump 1.0.0 → 1.1.0.

### Documentación añadida/reescrita
- `README.md` (raíz) — reescrito con el estado actual, URLs de producción,
  usuarios demo con número de cuenta y pila técnica.
- `docs/MODULO_CREDITO.md` — nuevo. Diseño, fórmulas, flujos, API y
  verificación e2e.
- `docs/MANUAL_USUARIO.md` — nuevo. Qué puede hacer cada rol.
- `docs/ARQUITECTURA.md` — nuevo. Tres capas, decisiones, diagrama.
- `docs/MODELO_DATOS.md` — nuevo. Tablas, invariantes, índices.
- `docs/API_REFERENCE.md` — nuevo. Contrato REST completo.
- `docs/CHANGELOG.md` — este archivo.

### Verificado end-to-end
Flujo probado contra la URL pública con María Gómez
(`crédito vehículo 5M a 24m`):

| Paso | Disponible | Movimiento |
|---|---|---|
| Inicial | $2.450.000 | — |
| Desembolso | $7.450.000 | `TX-8847` +5.000.000 |
| Pago cuota 1/24 | $7.188.630 | `TX-8848` −261.370 |
| Pago total | $1.177.120 | `TX-8849` −6.011.510 |

Intereses: $1.272.880 (coinciden con la fórmula). Datos de prueba limpiados
tras verificar.

### Commits principales
- `385d95c` Modulo de credito: solicitar, desembolsar, pagar cuota y pagar total
- `a8931ba` api: bump v1.1.0 (fuerza redeploy en Render con el modulo de credito)

---

## v1.0.0 — 26 de octubre de 2026 — Backend, front conectado y despliegue

Primera versión en producción. El prototipo pasa a ser referencia; la
aplicación real vive en `api/` + `web/` + PostgreSQL.

### Añadido
- Backend Node 24 + Express 5 + PostgreSQL con `pg` sin ORM.
- Autenticación con `bcryptjs` + JWT (10 min de expiración, RNF-01).
- Autorización RBAC con matriz `PERMISOS` y middlewares `requierePermiso`
  / `soloLecturaContable`.
- Reglas de negocio puras en `api/src/lib/reglas.js` (51 pruebas con
  `node:test`).
- Servicios por recurso: `auth`, `cuenta`, `transferencias`, `pagos`,
  `bolsillos`, `admin`, `contable`.
- Esquema SQL de las 4 tablas iniciales (usuarios, bolsillos, movimientos,
  alertas) con CHECKs, FKs e índices.
- Front en `web/`: HTML + CSS + JS plano conectado al API; mismas 11
  pantallas del prototipo.
- Despliegue en Render: web service, static site, PostgreSQL (plan Free).

### Decisiones técnicas defendibles
- `bcryptjs` en vez de `bcrypt` para evitar compilación nativa en Render
  (commit `397a5b8`).
- TLS obligatorio en la conexión a PostgreSQL con `rejectUnauthorized:
  false` (certificado autofirmado de Render; commit `02b0f25`).
- Front sin bundler para evitar un paso de build en el despliegue.

### Commits principales
- `265d121` Backend, front conectado y despliegue en Render
- `397a5b8` Usar bcryptjs en vez de bcrypt para evitar compilacion en el despliegue
- `02b0f25` Habilitar TLS en la conexion a PostgreSQL
- `f69eb17` Conectar el front a la API real para el despliegue

---

## Prototipo — anterior a v1.0.0

### Añadido
- `producto/Fintec.html` — un único archivo HTML autocontenido con la
  interfaz, el CSS, las reglas de negocio y los datos en memoria.
- 51 pruebas Vitest con jsdom en `calidad/tests/` que corren contra el
  propio archivo entregado (sin copia paralela).
- Plan de calidad en `calidad/data.js` + generador `.docx`.
- RF-01 a RF-08 implementados (RF-04 y RF-07 parciales).

### Limitaciones conocidas que motivaron el incremento v1.0.0
- Todo el estado en memoria del navegador: se perdía al recargar.
- Claves en texto plano, visibles en el HTML (RNF-02 incumplido).
- Autorización por rol se hacía en el cliente (`go()`): un atacante podía
  llamar `go('a-panel')` desde la consola.
- `pintarAdminMovimientos` referenciada pero no definida.
