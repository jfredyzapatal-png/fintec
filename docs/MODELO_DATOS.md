# FINTEC — Modelo de datos

Cinco tablas en PostgreSQL. El esquema completo vive en
[`api/db/schema.sql`](../api/db/schema.sql). La migración aditiva de la tabla
`creditos` está en [`api/db/schema_creditos.sql`](../api/db/schema_creditos.sql).

---

## 1. Diagrama lógico

```
┌─────────────────────────┐
│ usuarios                │
│─────────────────────────│
│ doc           PK TEXT   │
│ nombre        TEXT      │
│ clave_hash    TEXT      │ ← bcrypt, nunca texto plano
│ correo        TEXT      │
│ tipo          TEXT      │ CC/CE/PA/--
│ nacimiento    DATE      │
│ rol           TEXT      │ usuario/admin/contable
│ cuenta        TEXT UK   │ número 001-234-567
│ disponible    NUMERIC   │ CHECK >= 0 (RN-01)
│ estado        TEXT      │ activa/bloqueada
│ tope_diario   NUMERIC   │ CHECK diario <= mensual
│ tope_mensual  NUMERIC   │
│ intentos_fallidos INT   │ RNF-02
│ bloqueado_hasta TIMESTZ │
│ creado_en     TIMESTAMPZ│
└─────────┬───────────────┘
          │
          │ 1:N
          │
          ▼
┌─────────────────────────┐    ┌──────────────────────────┐
│ bolsillos               │    │ creditos                 │
│─────────────────────────│    │──────────────────────────│
│ id          PK IDENT    │    │ id              PK IDENT │
│ usuario_doc FK          │    │ usuario_doc     FK       │
│ nombre      TEXT        │    │ tipo            TEXT     │ libre/vehiculo/hipoteca
│ saldo       NUMERIC >=0 │    │ monto           NUMERIC  │
│ creado_en   TIMESTAMPZ  │    │ plazo_meses     INT      │
└─────────────────────────┘    │ tasa_mensual    NUMERIC  │
                               │ cuota           NUMERIC  │
          ┌────────────────────│ total_a_pagar   NUMERIC  │
          │ 1:N                │ saldo_pendiente NUMERIC >=0
          │                    │ cuotas_pagadas  INT      │
          │                    │ estado          TEXT     │ activo/pagado
          │                    │ fecha_desembolso TIMESTZ │
┌─────────▼─────────────┐      │ cerrado_en      TIMESTZ  │
│ alertas               │      └──────────────────────────┘
│───────────────────────│
│ id         PK IDENT   │
│ usuario_doc FK        │
│ texto      TEXT       │
│ creado_en  TIMESTAMPZ │
└───────────────────────┘

┌────────────────────────────────────────┐
│ movimientos                            │
│────────────────────────────────────────│
│ id            PK IDENT                 │
│ codigo        TEXT UK   DEFAULT TX-#   │ secuencia desde 8841
│ tipo          TEXT                     │ Transferencia/Pago/Bolsillo/
│                                        │ Reversión/Cancelación/Crédito
│ estado        TEXT                     │ Completada/Rechazada/Cancelada
│ origen        TEXT                     │ cuenta FINTEC o etiqueta externa
│ destino       TEXT                     │ cuenta FINTEC o etiqueta externa
│ valor         NUMERIC > 0              │
│ nota          TEXT                     │ obligatoria si no Completada
│ original_id   FK movimientos.id        │ RN-05
│ revertida     BOOLEAN                  │
│ creado_en     TIMESTAMPZ               │
└────────────────────────────────────────┘
```

**origen y destino son TEXT, no FK a `usuarios.cuenta`**. Esta decisión es
deliberada: un extremo puede ser una cuenta FINTEC válida, pero también:
- Un **convenio** (`'EPM'`, `'Universidad'`, `'Acueducto'`, `'Claro'`).
- El **nombre de un bolsillo** en un aporte/retiro.
- Una **cuenta externa inexistente** en un movimiento `Rechazada` (RN-03
  obliga a dejar el rastro con el motivo, aunque la cuenta no exista).
- Una **cuenta ficticia** del módulo de créditos
  (`'CREDITO-LIBRE'`, `'CREDITO-VEHICULO'`, `'CREDITO-HIPOTECA'`).

Forzar FK haría imposible registrar los rechazos y los pagos a convenios.

---

## 2. Tabla `usuarios`

### Columnas

| Columna | Tipo | Nota |
|---|---|---|
| `doc` | `TEXT PRIMARY KEY` | Documento, 5-15 alfanuméricos |
| `nombre` | `TEXT NOT NULL` | No vacío |
| `clave_hash` | `TEXT NOT NULL` | Hash bcryptjs (RNF-02); nunca `SELECT *` al cliente |
| `correo` | `TEXT NOT NULL DEFAULT ''` | Único insensible a mayúsculas |
| `tipo` | `TEXT NOT NULL DEFAULT 'CC'` | CC, CE, PA (o `--` para admin/contable) |
| `nacimiento` | `DATE` | Opcional, mayor de 18 si se da |
| `rol` | `TEXT NOT NULL DEFAULT 'usuario'` | usuario, admin, contable |
| `cuenta` | `TEXT NOT NULL UNIQUE` | Número público `001-234-567` |
| `disponible` | `NUMERIC(14,2) NOT NULL DEFAULT 0` | **CHECK >= 0** (RN-01) |
| `estado` | `TEXT NOT NULL DEFAULT 'activa'` | activa, bloqueada |
| `tope_diario` | `NUMERIC(14,2) NOT NULL DEFAULT 5000000` | Positivo |
| `tope_mensual` | `NUMERIC(14,2) NOT NULL DEFAULT 20000000` | Positivo |
| `intentos_fallidos` | `INTEGER NOT NULL DEFAULT 0` | 0..5 |
| `bloqueado_hasta` | `TIMESTAMPTZ` | NULL si no bloqueada |
| `creado_en` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | |

### Restricciones

- `usuarios_doc_formato`: `doc` cumple `^[0-9A-Za-z]{5,15}$`.
- `usuarios_disponible_no_negativo`: `disponible >= 0`.
- `usuarios_tope_diario_menor_mensual`: `tope_diario <= tope_mensual`.
- `usuarios_correo_unico` (índice único parcial): `lower(correo)` único cuando no vacío.

### Índices

- Único por `lower(correo)` (parcial).
- Por `rol`, por `estado`, por `lower(nombre)` (RF-05 CA-05.1).

---

## 3. Tabla `bolsillos` (RN-02)

Pertenecen a **una sola cuenta**. El dinero solo se mueve entre el disponible
de ese usuario y sus propios bolsillos. Un bolsillo no puede recibir una
transferencia externa.

| Columna | Tipo |
|---|---|
| `id` | `BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY` |
| `usuario_doc` | `TEXT NOT NULL REFERENCES usuarios(doc) ON DELETE CASCADE` |
| `nombre` | `TEXT NOT NULL` (no vacío) |
| `saldo` | `NUMERIC(14,2) NOT NULL DEFAULT 0` **CHECK >= 0** |
| `creado_en` | `TIMESTAMPTZ NOT NULL DEFAULT now()` |

Índice único por `(usuario_doc, lower(btrim(nombre)))` — un cliente no puede
tener dos bolsillos con el mismo nombre.

---

## 4. Tabla `movimientos`

Libro de operaciones. **Todos los eventos que mueven dinero (o lo intentan)**
quedan registrados aquí.

| Columna | Tipo | Nota |
|---|---|---|
| `id` | `BIGINT IDENTITY PK` | ID interno |
| `codigo` | `TEXT UNIQUE DEFAULT 'TX-' \|\| nextval(...)` | **ID público** `TX-####` |
| `tipo` | `TEXT` | Transferencia, Pago, Bolsillo, Reversión, Cancelación, **Crédito** |
| `estado` | `TEXT` | Completada, Rechazada, Cancelada |
| `origen` | `TEXT NOT NULL` | Cuenta FINTEC o etiqueta externa |
| `destino` | `TEXT NOT NULL` | Cuenta FINTEC o etiqueta externa |
| `valor` | `NUMERIC(14,2) NOT NULL` | **CHECK > 0** |
| `nota` | `TEXT NOT NULL DEFAULT ''` | **Obligatoria** si estado ≠ Completada (RN-03) |
| `original_id` | `BIGINT REFERENCES movimientos(id) ON DELETE RESTRICT` | RN-05: enlace al movimiento revertido |
| `revertida` | `BOOLEAN NOT NULL DEFAULT FALSE` | Marca que el original ya fue revertido |
| `creado_en` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | |

### Restricciones destacadas

- `movimientos_motivo_obligatorio`: si no es Completada, `length(btrim(nota)) > 0`.
- `movimientos_enlace_coherente`: `original_id` **solo** si tipo es Reversión o Cancelación.
- `movimientos_no_autoenlace`: `original_id <> id`.

### Índices

- Único por `codigo` (TX-####).
- Por `origen`, `destino`, `estado`, `tipo`, `original_id`.
- Por `creado_en DESC` (ordenación cronológica).
- **Parcial para cupos** (`movimientos_cupo_idx`): `(origen, creado_en) WHERE tipo = 'Transferencia' AND estado = 'Completada'` — acelera el cálculo del cupo diario/mensual.
- **Único por `original_id`** (parcial): un movimiento solo se puede revertir una vez (RN-05).

### Secuencia `movimientos_codigo_seq`

Arranca en `8841`, igual que `BANCO.seq` del prototipo. Lo que ve el usuario
como código `TX-8841` es `nextval('movimientos_codigo_seq')`.

---

## 5. Tabla `alertas` (RF-06)

Notificaciones del usuario. Las más recientes primero.

| Columna | Tipo |
|---|---|
| `id` | `BIGINT IDENTITY PK` |
| `usuario_doc` | `TEXT NOT NULL REFERENCES usuarios(doc) ON DELETE CASCADE` |
| `texto` | `TEXT NOT NULL` (no vacío) |
| `creado_en` | `TIMESTAMPTZ NOT NULL DEFAULT now()` |

Índice por `(usuario_doc, creado_en DESC)`.

---

## 6. Tabla `creditos` (v1.1.0)

Añadida con migración aditiva. Un registro por crédito desembolsado a **una**
cuenta.

| Columna | Tipo | Nota |
|---|---|---|
| `id` | `BIGINT IDENTITY PK` | |
| `usuario_doc` | `TEXT NOT NULL REFERENCES usuarios(doc) ON DELETE RESTRICT` | No se puede borrar un usuario con crédito |
| `tipo` | `TEXT NOT NULL` | libre, vehiculo, hipoteca |
| `monto` | `NUMERIC(14,2) NOT NULL CHECK > 0` | Principal desembolsado |
| `plazo_meses` | `INTEGER NOT NULL CHECK > 0` | 12, 24, 36 o 48 |
| `tasa_mensual` | `NUMERIC(6,4) NOT NULL CHECK > 0` | 0.015, 0.019 o 0.025 |
| `cuota` | `NUMERIC(14,2) NOT NULL CHECK > 0` | Cuota fija (congelada al desembolso) |
| `total_a_pagar` | `NUMERIC(14,2) NOT NULL CHECK > 0` | `cuota × plazo_meses` |
| `saldo_pendiente` | `NUMERIC(14,2) NOT NULL CHECK >= 0` | Lo que falta por pagar |
| `cuotas_pagadas` | `INTEGER NOT NULL DEFAULT 0 CHECK >= 0` | |
| `estado` | `TEXT NOT NULL DEFAULT 'activo'` | activo, pagado |
| `fecha_desembolso` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | |
| `cerrado_en` | `TIMESTAMPTZ` | NULL si activo |

### Invariante

```sql
CONSTRAINT creditos_estado_coherente
  CHECK ((estado = 'pagado') = (saldo_pendiente = 0))
```

Esto garantiza, a nivel de la base, que **estado y saldo nunca se
contradigan**. No es posible marcar un crédito como pagado si queda saldo, ni
dejar `saldo_pendiente = 0` sin cerrar el crédito.

### Índices

- Por `usuario_doc` (listado del cliente).
- Por `estado` (filtro activo vs pagado).

---

## 7. Totales que deben cuadrar

El seed (`npm run seed`) deja el sistema con:

- **6 clientes** + 1 admin + 1 contable.
- Suma total `disponible + bolsillos = $18.000.000` (una verificación del
  seed falla si no cuadra).
- 3 movimientos iniciales de ejemplo.
- 0 créditos (se solicitan desde la aplicación).

CP-44 de la batería de pruebas Vitest exige estos totales.

---

## 8. Cómo evoluciona el esquema

### Migración destructiva — `npm run migrate`
Ejecuta `db/schema.sql`, que empieza con `DROP TABLE IF EXISTS ... CASCADE`
para las 5 tablas. **Borra todo y recrea desde cero**. Útil para pruebas
locales; **nunca para producción con datos reales**.

### Migración aditiva — `npm run migrate:creditos`
Ejecuta `db/schema_creditos.sql`, que es **idempotente**: usa `DROP ... IF
EXISTS` para la constraint vieja, `ADD CONSTRAINT` para la nueva y `CREATE
TABLE IF NOT EXISTS`. Puede correr varias veces sin romper nada ni perder
datos.

Este es el patrón para añadir nuevos módulos a una base ya en producción.

---

## 9. Cómo verificar el estado

```sql
-- Totales del sistema
SELECT
  (SELECT SUM(disponible) FROM usuarios) AS total_disponible,
  (SELECT SUM(saldo) FROM bolsillos) AS total_bolsillos,
  (SELECT SUM(disponible) FROM usuarios) + (SELECT SUM(saldo) FROM bolsillos) AS total;

-- Movimientos por tipo
SELECT tipo, COUNT(*), SUM(valor) FROM movimientos
WHERE estado = 'Completada' GROUP BY tipo;

-- Créditos activos vs pagados
SELECT estado, COUNT(*), SUM(saldo_pendiente)
FROM creditos GROUP BY estado;

-- Siguiente código de movimiento
SELECT last_value FROM movimientos_codigo_seq;
```
