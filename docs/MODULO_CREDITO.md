# FINTEC — Módulo de créditos (v1.1.0)

Añadido en la versión 1.1.0. Permite al cliente **solicitar un crédito**,
**recibir el desembolso instantáneo** en su cuenta, y **pagar la cuota del
mes** o **liquidar el crédito totalmente** cuando quiera.

El módulo es un prototipo académico: la tasa, el plazo y el límite de monto
están pensados para la demostración. La aritmética (amortización francesa) y
las garantías transaccionales (atomicidad, bloqueo pesimista, idempotencia de
la migración) sí son realistas.

---

## 1. Tipos de crédito y tasas

Igual que en el simulador público del landing. Si se cambia uno, cambiar el
otro (`api/src/services/creditos.js` y `web/js/app.js`).

| Tipo | Nombre público | Tasa mensual | Equivalente anual aproximado |
|---|---|---|---|
| `libre` | Libre inversión | **2,5 %** | 34,49 % E.A. |
| `vehiculo` | Vehículo | **1,9 %** | 25,34 % E.A. |
| `hipoteca` | Hipoteca | **1,5 %** | 19,56 % E.A. |

Límites comunes:

| Límite | Valor | Dónde se valida |
|---|---|---|
| Monto mínimo | $500.000 | `creditos.js: MONTO_MIN` |
| Monto máximo | $20.000.000 | `creditos.js: MONTO_MAX` |
| Plazos permitidos | 12, 24, 36 o 48 meses | `creditos.js: PLAZOS_OK` |

---

## 2. Fórmula de la cuota (amortización francesa)

Cuota mensual constante:

\[ \text{cuota} = \text{monto} \cdot \dfrac{r}{1 - (1+r)^{-n}} \]

donde:
- `monto` es el principal desembolsado (pesos colombianos enteros).
- `r` es la tasa mensual (0.015, 0.019 o 0.025).
- `n` es el plazo en meses (12, 24, 36 o 48).

El código:

```javascript
export function calcularCuota(monto, plazoMeses, tasaMensual) {
  const r = Number(tasaMensual);
  const n = Number(plazoMeses);
  const cuota = Number(monto) * r / (1 - Math.pow(1 + r, -n));
  return Math.round(cuota);
}
```

**Total a pagar** = `cuota × plazoMeses` (se congela al desembolsar). El
sistema trabaja en pesos enteros: la última cuota puede ser ligeramente menor
que la cuota fija si el redondeo deja un remanente pequeño.

### Ejemplos verificados

| Tipo | Monto | Plazo | Cuota mensual | Total a pagar | Intereses |
|---|---|---|---|---|---|
| Libre inversión | $3.000.000 | 12 m | $292.461 | $3.509.532 | $509.532 |
| Vehículo | $5.000.000 | 24 m | $261.370 | $6.272.880 | $1.272.880 |
| Hipoteca | $10.000.000 | 48 m | $293.750 | $14.100.000 | $4.100.000 |

---

## 3. Flujo de operación

```
Usuario                       API                            PostgreSQL
   │                           │                                  │
   │  POST /api/creditos       │                                  │
   │  {tipo, monto, plazo}     │                                  │
   │─────────────────────────▶ │                                  │
   │                           │  BEGIN                           │
   │                           │  SELECT usuarios FOR UPDATE ────▶│
   │                           │  INSERT creditos ──────────────▶ │
   │                           │  UPDATE usuarios                 │
   │                           │   SET disponible += monto ─────▶ │
   │                           │  INSERT movimientos tipo         │
   │                           │   'Crédito' (desembolso) ──────▶ │
   │                           │  INSERT alertas ──────────────▶  │
   │                           │  COMMIT                          │
   │                           │                                  │
   │ ◀───────────────────── 201 {credito, movimiento, disponible} │
```

Lo mismo para los pagos (cuota o total), con dos candados `FOR UPDATE`
(usuario + crédito) y la validación de disponible dentro de la transacción.

### Reglas que el servidor impone

1. **El desembolso suma el principal al disponible** del usuario, en una sola
   transacción con el `INSERT` del crédito y del movimiento.
2. **La cuota, la tasa y el plazo se congelan** al momento del desembolso. Si
   el admin cambiara las tasas más adelante, los créditos existentes no se
   recalculan.
3. **El pago de cuota** descuenta `min(cuota, saldo_pendiente)` del
   disponible. Si el disponible no alcanza, se rechaza con 400.
4. **El pago total** descuenta todo el saldo pendiente de una vez.
5. Al llegar `saldo_pendiente = 0` el crédito queda en estado `pagado` y no
   admite más pagos (409 `Este crédito ya está pagado.`).
6. Un `UPDATE ... WHERE disponible >= $monto` con comprobación de `rowCount`
   es la **red de seguridad final** contra concurrencia; si no cuadra, hay
   `ROLLBACK`.
7. Un usuario **no puede ver ni pagar** créditos de otro usuario (404
   genérico, no 403, para no revelar la existencia del recurso).

### Movimientos registrados

Cada operación deja un movimiento `tipo = 'Crédito'`, estado `Completada`,
código `TX-####`:

| Operación | `origen` | `destino` | `nota` |
|---|---|---|---|
| Desembolso libre inv. | `CREDITO-LIBRE` | número de cuenta del usuario | `Desembolso crédito libre inversión · 12 meses · cuota $292.461` |
| Desembolso vehículo | `CREDITO-VEHICULO` | ídem | `Desembolso crédito vehículo · 24 meses · cuota $261.370` |
| Desembolso hipoteca | `CREDITO-HIPOTECA` | ídem | `Desembolso crédito hipoteca · 48 meses · cuota $294.157` |
| Pago cuota | número de cuenta | `CREDITO-LIBRE/VEHICULO/HIPOTECA` | `Cuota N/plazo crédito <tipo>` |
| Pago total | ídem | ídem | `Pago total crédito <tipo>` |

Las cuentas ficticias `CREDITO-LIBRE/VEHICULO/HIPOTECA` existen solo como
cadena en `origen/destino` (las columnas son `TEXT`, no FK): sirven para
distinguir los movimientos de crédito en el panel contable.

---

## 4. Estructura de datos

### Tabla `creditos`

```sql
CREATE TABLE creditos (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_doc     TEXT NOT NULL REFERENCES usuarios (doc) ON DELETE RESTRICT,
  tipo            TEXT NOT NULL
                    CHECK (tipo IN ('libre', 'vehiculo', 'hipoteca')),
  monto           NUMERIC(14,2) NOT NULL CHECK (monto > 0),
  plazo_meses     INTEGER       NOT NULL CHECK (plazo_meses > 0),
  tasa_mensual    NUMERIC(6,4)  NOT NULL CHECK (tasa_mensual > 0),
  cuota           NUMERIC(14,2) NOT NULL CHECK (cuota > 0),
  total_a_pagar   NUMERIC(14,2) NOT NULL CHECK (total_a_pagar > 0),
  saldo_pendiente NUMERIC(14,2) NOT NULL
                    CONSTRAINT creditos_saldo_no_negativo CHECK (saldo_pendiente >= 0),
  cuotas_pagadas  INTEGER       NOT NULL DEFAULT 0 CHECK (cuotas_pagadas >= 0),
  estado          TEXT          NOT NULL DEFAULT 'activo'
                    CHECK (estado IN ('activo', 'pagado')),
  fecha_desembolso TIMESTAMPTZ  NOT NULL DEFAULT now(),
  cerrado_en      TIMESTAMPTZ,
  CONSTRAINT creditos_estado_coherente
    CHECK ((estado = 'pagado') = (saldo_pendiente = 0))
);
```

**Restricciones destacadas:**
- `saldo_pendiente >= 0` — invariante de dominio.
- `(estado = 'pagado') = (saldo_pendiente = 0)` — garantiza que estado y
  saldo nunca se contradigan.
- `ON DELETE RESTRICT` en la FK: borrar un usuario con crédito activo falla
  (RN-04 extendido).

### Tabla `movimientos`

El `CHECK` del tipo se amplió para aceptar `'Crédito'`:

```sql
tipo TEXT NOT NULL
  CHECK (tipo IN ('Transferencia', 'Pago', 'Bolsillo',
                  'Reversión', 'Cancelación', 'Crédito'));
```

---

## 5. Migración aditiva (sin perder datos)

El `npm run migrate` original es **destructivo** (`DROP TABLE` + `CREATE`).
Para añadir el módulo de créditos a una base ya en producción con datos, se
creó una migración aditiva idempotente:

- Archivo: `api/db/schema_creditos.sql`
- Runner: `api/db/migrate_creditos.js`
- Script: `npm run migrate:creditos`

Hace dos cosas, ambas seguras de volver a correr:

1. **Reemplaza la restricción `movimientos_tipo_check`** para que incluya
   `'Crédito'`:
   ```sql
   ALTER TABLE movimientos DROP CONSTRAINT IF EXISTS movimientos_tipo_check;
   ALTER TABLE movimientos ADD CONSTRAINT movimientos_tipo_check
     CHECK (tipo IN ('Transferencia', 'Pago', 'Bolsillo',
                     'Reversión', 'Cancelación', 'Crédito'));
   ```
2. **Crea la tabla `creditos` si no existe** (con `CREATE TABLE IF NOT EXISTS`
   y sus índices).

Al terminar imprime el número de créditos existentes como confirmación.

**Aplicarla en producción:**

```powershell
cd api
$env:DATABASE_URL="postgresql://... (external url)"
$env:JWT_SECRET="cualquier-cosa"
npm run migrate:creditos
Remove-Item Env:DATABASE_URL
```

Resultado esperado:
```
[migrate:creditos] aplicando schema_creditos.sql ...
[migrate:creditos] listo. creditos existentes: 0
```

---

## 6. Endpoints REST

Todos exigen `Authorization: Bearer <token>` con rol `usuario`.

### `GET /api/creditos`
Lista los créditos del usuario autenticado, activos primero, luego por fecha.

**200 OK:**
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
Solicita y desembolsa un crédito nuevo.

**Body:**
```json
{ "tipo": "libre", "monto": 3000000, "plazo": 12 }
```

**Validaciones:**
- `tipo` ∈ `{libre, vehiculo, hipoteca}`.
- `monto` entero entre `MONTO_MIN` y `MONTO_MAX`.
- `plazo` ∈ `{12, 24, 36, 48}`.
- La cuenta no debe estar `bloqueada`.

**201 Created:**
```json
{
  "credito": { "id": 1, "cuota": 292461, "totalAPagar": 3509532, ... },
  "movimiento": { "id": "TX-8844", "tipo": "Crédito", "valor": 3000000, ... },
  "disponible": 5450000
}
```

**400** por tipo/monto/plazo inválidos o cuenta bloqueada.

### `POST /api/creditos/:id/pagar-cuota`
Descuenta la cuota (o el saldo pendiente si es menor) del disponible.

Sin cuerpo. **200 OK** con la misma forma que `/pagar-total`:
```json
{
  "credito": { "saldoPendiente": 3217071, "cuotasPagadas": 1, "estado": "activo", ... },
  "movimiento": { "id": "TX-8845", "valor": 292461, ... },
  "disponible": 5157539
}
```

Errores:
- **400** `Saldo insuficiente. Para pagar $X necesitas al menos ese disponible.`
- **409** `Este crédito ya está pagado.`
- **404** `Ese crédito no existe.` (también si pertenece a otro usuario)

### `POST /api/creditos/:id/pagar-total`
Idéntico al anterior, pero descuenta todo el `saldo_pendiente` y cierra el
crédito (`estado = 'pagado'`, `cerrado_en = now()`).

---

## 7. Permisos

Añadidos al rol `usuario` en `api/src/lib/reglas.js`:

```javascript
export const PERMISOS = {
  usuario: [
    'cuenta:leer', 'cuenta:topes', 'movimientos:propios',
    'transferencia:crear', 'pago:crear', 'bolsillo:crear', 'bolsillo:mover',
    'alertas:propias', 'password:cambiar',
    'credito:leer', 'credito:solicitar', 'credito:pagar',   // <-- nuevos
  ],
  admin: [...],
  contable: [...]  // sigue siendo solo lectura (RN-06)
};
```

Las rutas aplican `requierePermiso('credito:leer' | 'credito:solicitar' | 'credito:pagar')`
antes del handler. El contable **no** puede operar créditos ni verlos (son
privados del cliente). El admin tampoco: no fue parte del alcance.

---

## 8. Interfaz de usuario

### Simulador público (landing, sin login)
Chips para elegir tipo + inputs de monto y plazo. Muestra la cuota mensual
calculada en vivo. Ubicado en `web/index.html` → sección `#home` →
elemento `#simulador`.

### Pantalla "Crédito" (usuario autenticado)
Botón **Crédito** en la nav lateral → `#u-creditos`:

1. **Nuevo crédito**: formulario con selector de tipo, monto y plazo, con
   vista previa de la cuota (`cuotaPreview()` en `web/js/app.js`).
2. **Mis créditos**: lista de créditos activos primero (con botones *Pagar
   cuota* y *Pagar total*) y luego los `pagado` como historial.

Al confirmar un desembolso, un pago o una liquidación, el front:
- Recarga la cuenta (`API.cuentaMe()`).
- Recarga la lista de créditos.
- Muestra un toast con el nombre de la operación y el valor.

---

## 9. Verificación end-to-end

Ejecutada contra la URL pública el 27 de octubre de 2026, con la usuaria
María Gómez. Ver detalles en el commit `385d95c` y los que lo siguen.

Flujo probado (vehículo, 5M, 24 meses):

| Paso | Disponible | Movimiento |
|---|---|---|
| Inicial | $2.450.000 | — |
| Desembolso | $7.450.000 | TX-8847 +5.000.000 |
| Pago cuota 1/24 | $7.188.630 | TX-8848 −261.370 |
| Pago total | $1.177.120 | TX-8849 −6.011.510 |

Costo total del crédito: **$1.272.880** de intereses (coincide con la fórmula).
Datos de prueba limpiados tras verificar (`api/db/clean_credit_test.mjs`).

---

## 10. Qué no está implementado (de propósito)

Está fuera del alcance del incremento y queda como mejora:

- **Mora o intereses de mora**: pagar tarde no cobra extra; no hay fecha
  límite por cuota.
- **Score crediticio o aprobación discrecional**: todo el que solicita y
  cumple los límites recibe el desembolso.
- **Prepago parcial**: solo existen "pagar la cuota" o "pagar el total". No
  se puede pagar, p. ej., dos cuotas y media.
- **Modificación de plazos** una vez desembolsado.
- **Reversión o cancelación de un crédito** por el admin: la devolución de
  movimientos existente no cubre el ciclo complejo de un crédito ya cerrado.
- **Convenios reales**: `CREDITO-LIBRE/VEHICULO/HIPOTECA` son contrapartes
  ficticias, no son cuentas reales ni se compensan en ningún otro lado.

El panel contable sí ve las operaciones de crédito en el desglose por tipo
(se añadió `'Crédito'` al `VALUES` del query de `contable.porTipo`).
