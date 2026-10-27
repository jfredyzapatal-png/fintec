# FINTEC — API Reference

Contrato completo de la API REST. Base: `https://fintec-api.onrender.com/api`
en producción, `http://localhost:4000/api` en local.

Todas las respuestas son JSON. Errores: `{ "error": "mensaje" }` con el
código HTTP correspondiente.

> La forma `{ error }` es intencional: el front muestra ese mensaje
> directamente al usuario, por lo que los textos están en español natural.

---

## Códigos HTTP

| Código | Significado |
|---|---|
| `200` OK | Lectura exitosa |
| `201` Created | Recurso creado |
| `400` Bad Request | Validación fallida o regla de negocio (saldo insuficiente, tope superado) |
| `401` Unauthorized | Falta token, token inválido o expirado |
| `403` Forbidden | Rol insuficiente o cuenta bloqueada |
| `404` Not Found | Recurso inexistente |
| `409` Conflict | Conflicto de estado (crédito ya pagado, movimiento ya revertido) |
| `500` Internal Server Error | Error inesperado del servidor |

---

## Autenticación

Todas las rutas, **salvo las marcadas como "público"**, exigen la cabecera:

```
Authorization: Bearer <jwt>
```

El token se obtiene de `POST /api/auth/login`. Caduca a los **10 minutos**
(RNF-01). Si una petición responde 401, el front cierra la sesión y vuelve al
login.

---

## 1. Público (sin token)

### `GET /api/health`
Health check con comprobación de conexión a PostgreSQL. **Siempre 200**,
incluso si la base está caída (el estado va en `bd`).

```json
{ "ok": true, "servicio": "fintec-api", "bd": "conectada" }
```

### `GET /api/salud`
Alias simple sin tocar la base.

```json
{ "ok": true, "servicio": "fintec-api" }
```

### `POST /api/auth/registro`
Registra un cliente nuevo.

**Body:**
```json
{
  "doc": "1111222233",
  "nombre": "Persona Nueva",
  "clave": "clave12345",
  "correo": "persona@correo.com",
  "tipo": "CC",
  "nacimiento": "1995-05-10"
}
```

**Validaciones (RF-01):**
- `doc`: 5-15 caracteres alfanuméricos.
- `clave`: mínimo 8 caracteres.
- `correo`: formato válido si se proporciona.
- `nacimiento`: edad >= 18 si se proporciona.

**201:**
```json
{ "doc": "1111222233", "nombre": "Persona Nueva", "cuenta": "001-107-842" }
```

### `POST /api/auth/login`
Inicia sesión.

**Body:** `{ "documento": "1023456789", "clave": "maria123" }`

**200:**
```json
{
  "token": "eyJhbGci...",
  "usuario": {
    "doc": "1023456789",
    "nombre": "María Gómez",
    "rol": "usuario",
    "cuenta": "001-234-567"
  }
}
```

**401:** `Documento o contraseña inválidos.` (mensaje genérico, CA-02.2).

**423:** `Cuenta bloqueada por intentos fallidos. Intenta en N minutos.`

**403:** `Tu cuenta está bloqueada. Contacta al administrador.`

---

## 2. Usuario autenticado (cualquier rol)

### `POST /api/auth/password`
Cambia la contraseña. Deja una alerta con fecha y hora.

**Body:** `{ "actual": "maria123", "nueva": "nuevaClave1" }`

**200:** `{ "ok": true }`

---

## 3. Usuario cliente (rol `usuario`)

### `GET /api/cuenta/me`
Resumen de la cuenta.

**200:**
```json
{
  "cuenta": "001-234-567",
  "disponible": 2450000,
  "bolsillos": [
    { "id": 1, "nombre": "Vacaciones", "saldo": 800000 },
    { "id": 2, "nombre": "Emergencias", "saldo": 350000 }
  ],
  "totalBolsillos": 1150000,
  "topeDiario": 5000000,
  "topeMensual": 20000000,
  "cupoDiario": 5000000,
  "cupoMensual": 19820000,
  "enviadoHoy": 0,
  "enviadoMes": 180000
}
```

### `PUT /api/cuenta/topes`
Actualiza topes. El diario no puede superar al mensual.

**Body:** `{ "topeDiario": 1500000, "topeMensual": 10000000 }`

**200:** `{ "topeDiario": 1500000, "topeMensual": 10000000 }`

### `GET /api/cuenta/:cuenta/titular`
Confirmación del titular antes de transferir (paso 1 de la transferencia en
dos pasos).

**200:** `{ "nombre": "Laura Díaz", "tipo": "CE", "doc": "1076543210" }`

**404:** `Esa cuenta no existe.`

### `GET /api/movimientos`
Extracto. Acepta `?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`.

**200:** `[ { "id": "TX-8841", "tipo": "Transferencia", "estado": "Completada", "origen": "001-234-567", "destino": "009-441-220", "valor": 100000, "nota": "Prueba", "fecha": "2026-10-27T15:00:00Z" }, ... ]`

### `POST /api/transferencias`
Transferencia entre cuentas (paso 2).

**Body:**
```json
{ "cuentaDestino": "009-441-220", "monto": 100000, "nota": "Para almuerzo" }
```

**201:**
```json
{
  "movimiento": { "id": "TX-8850", "tipo": "Transferencia", ... },
  "disponible": 2350000
}
```

**400** por saldo insuficiente / tope superado / cuenta propia / destino
inexistente / destino bloqueado. Si corresponde, incluye `movimiento` del
rechazo registrado:
```json
{
  "error": "Saldo insuficiente. El movimiento quedó registrado como Rechazado.",
  "movimiento": { "id": "TX-8851", "estado": "Rechazada", "nota": "Saldo insuficiente" }
}
```

### `POST /api/pagos`
Pago a un convenio.

**Body:** `{ "convenio": "EPM", "referencia": "10993821", "valor": 95400 }`

Convenios aceptados: `EPM`, `Universidad`, `Acueducto`, `Claro`.

### `GET /api/bolsillos`
Lista los bolsillos del usuario.

### `POST /api/bolsillos`
Crea un bolsillo.

**Body:** `{ "nombre": "Estudio" }`

### `POST /api/bolsillos/:id/aportar`
Mueve dinero del disponible al bolsillo.

**Body:** `{ "monto": 200000 }`

### `POST /api/bolsillos/:id/retirar`
Mueve dinero del bolsillo al disponible.

**Body:** `{ "monto": 50000 }`

### `GET /api/alertas`
Alertas del usuario, más recientes primero.

---

## 4. Créditos (rol `usuario`) — v1.1.0

Ver [`MODULO_CREDITO.md`](MODULO_CREDITO.md) para fórmulas, tasas y flujo
completo.

### `GET /api/creditos`
Lista los créditos del usuario. Activos primero, luego por fecha descendente.

**200:**
```json
[
  {
    "id": 2,
    "tipo": "vehiculo",
    "tipoNombre": "vehículo",
    "monto": 5000000,
    "plazoMeses": 24,
    "tasaMensual": 0.019,
    "cuota": 261370,
    "totalAPagar": 6272880,
    "saldoPendiente": 6011510,
    "cuotasPagadas": 1,
    "estado": "activo",
    "fechaDesembolso": "2026-10-27T21:13:47.322Z",
    "cerradoEn": null
  }
]
```

### `POST /api/creditos`
Solicita y desembolsa un crédito.

**Body:** `{ "tipo": "libre", "monto": 3000000, "plazo": 12 }`

- `tipo` ∈ `{libre, vehiculo, hipoteca}`
- `monto` entero entre `500000` y `20000000`
- `plazo` ∈ `{12, 24, 36, 48}`

**201:**
```json
{
  "credito": { "id": 1, "cuota": 292461, "totalAPagar": 3509532, ... },
  "movimiento": { "id": "TX-8844", "tipo": "Crédito", "valor": 3000000, ... },
  "disponible": 5450000
}
```

### `POST /api/creditos/:id/pagar-cuota`
Paga la cuota del mes (o el saldo pendiente si es menor).

Sin cuerpo. **200** con el mismo formato que `pagar-total`.

### `POST /api/creditos/:id/pagar-total`
Liquida el saldo pendiente.

Sin cuerpo. **200:**
```json
{
  "credito": { "saldoPendiente": 0, "estado": "pagado", "cerradoEn": "...", ... },
  "movimiento": { "valor": 6011510, ... },
  "disponible": 1177120
}
```

Errores de pagos:
- **400** `Saldo insuficiente. Para pagar $X necesitas al menos ese disponible.`
- **409** `Este crédito ya está pagado.`
- **404** `Ese crédito no existe.` (si no existe o pertenece a otro usuario)

---

## 5. Admin (rol `admin`)

### `GET /api/admin/usuarios?q=`
Busca clientes por `doc`, `cuenta`, `correo` o `nombre` (RF-05 CA-05.1). Sin
`q`, lista todos.

### `PATCH /api/admin/usuarios/:doc/estado`
Bloquea o reactiva una cuenta (RN-07).

**Body:** `{ "estado": "bloqueada" }` o `{ "estado": "activa" }`

### `GET /api/admin/movimientos`
Historial global. Filtros opcionales: `?estado=Completada&tipo=Transferencia&cuenta=001-234-567`.

### `POST /api/admin/movimientos/:id/devolucion`
Devolución (RN-05): crea un movimiento nuevo tipo `Reversión` enlazado con el
original. El original no se edita, pero queda marcado `revertida=true`.

**Body:** opcional `{ "motivo": "..." }`.

### `POST /api/admin/movimientos/:id/cancelacion`
Cancelación: deja el original en estado `Cancelada` y restituye saldos.

---

## 6. Contable (rol `contable`, solo lectura)

### `GET /api/contable/resumen`
Resumen financiero. `?desde&hasta` opcional (por defecto el mes en curso).

**200:**
```json
{
  "ingresos": 5000000,
  "egresos": 1200000,
  "neto": 3800000,
  "porTipo": [
    { "tipo": "Transferencia", "cantidad": 12, "total": 1800000 },
    { "tipo": "Pago", "cantidad": 3, "total": 180000 },
    { "tipo": "Crédito", "cantidad": 5, "total": 8000000 },
    ...
  ],
  "porCliente": [
    { "doc": "1023456789", "nombre": "María Gómez", "disponible": 2450000, "totalBolsillos": 1150000, "total": 3600000 },
    ...
  ]
}
```

### `GET /api/contable/movimientos`
Historial global en el rango. Mismo formato que `/api/admin/movimientos`. El
admin también puede llamarla.

---

## 7. Resumen por ruta

| Método | Ruta | Rol | Permiso |
|---|---|---|---|
| POST | `/api/auth/registro` | público | — |
| POST | `/api/auth/login` | público | — |
| POST | `/api/auth/password` | cualquiera | `password:cambiar` |
| GET | `/api/cuenta/me` | usuario | `cuenta:leer` |
| PUT | `/api/cuenta/topes` | usuario | `cuenta:topes` |
| GET | `/api/cuenta/:cuenta/titular` | usuario | `cuenta:leer` |
| GET | `/api/movimientos` | usuario | `movimientos:propios` |
| POST | `/api/transferencias` | usuario | `transferencia:crear` |
| POST | `/api/pagos` | usuario | `pago:crear` |
| GET | `/api/bolsillos` | usuario | `cuenta:leer` |
| POST | `/api/bolsillos` | usuario | `bolsillo:crear` |
| POST | `/api/bolsillos/:id/aportar` | usuario | `bolsillo:mover` |
| POST | `/api/bolsillos/:id/retirar` | usuario | `bolsillo:mover` |
| GET | `/api/alertas` | usuario | `alertas:propias` |
| **GET** | **`/api/creditos`** | **usuario** | **`credito:leer`** |
| **POST** | **`/api/creditos`** | **usuario** | **`credito:solicitar`** |
| **POST** | **`/api/creditos/:id/pagar-cuota`** | **usuario** | **`credito:pagar`** |
| **POST** | **`/api/creditos/:id/pagar-total`** | **usuario** | **`credito:pagar`** |
| GET | `/api/admin/usuarios?q=` | admin | `admin:usuarios` |
| PATCH | `/api/admin/usuarios/:doc/estado` | admin | `admin:estado` |
| GET | `/api/admin/movimientos` | admin | `admin:movimientos` |
| POST | `/api/admin/movimientos/:id/devolucion` | admin | `admin:devolucion` |
| POST | `/api/admin/movimientos/:id/cancelacion` | admin | `admin:cancelacion` |
| GET | `/api/contable/resumen` | contable | `contable:resumen` |
| GET | `/api/contable/movimientos` | contable, admin | `contable:movimientos` |
| GET | `/api/health` | público | — |
| GET | `/api/salud` | público | — |

En **negrita** las rutas añadidas en v1.1.0.
