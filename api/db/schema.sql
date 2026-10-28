-- ============================================================
--  FINTEC — esquema de base de datos (PostgreSQL)
--  Proyecto academico. Traduce a tablas el objeto BANCO que en
--  el prototipo (producto/Fintec.html) vivia en memoria.
--
--  Reglas que el esquema hace cumplir por si mismo:
--    RN-01  disponible nunca negativo       -> CHECK (disponible >= 0)
--    RN-02  bolsillos pertenecen a UNA cuenta -> FK bolsillos.usuario_doc
--    RN-03  todo rechazo/cancelacion con motivo -> CHECK sobre nota
--    RN-05  la reversion se ENLAZA al original -> movimientos.original_id
--  El resto (topes, bloqueos, transacciones con FOR UPDATE) vive
--  en src/services/*.js, siempre dentro de BEGIN/COMMIT.
-- ============================================================

BEGIN;

DROP TABLE IF EXISTS alertas        CASCADE;
DROP TABLE IF EXISTS creditos       CASCADE;
DROP TABLE IF EXISTS movimientos    CASCADE;
DROP TABLE IF EXISTS cuentas_pago   CASCADE;
DROP TABLE IF EXISTS bolsillos      CASCADE;
DROP TABLE IF EXISTS usuarios       CASCADE;
DROP SEQUENCE IF EXISTS movimientos_codigo_seq;

-- ------------------------------------------------------------
-- usuarios
-- Un registro por persona. El rol decide a que puede acceder
-- (RF-02 / RN-06). 'cuenta' es el numero publico 001-234-567 que
-- se usa como origen/destino de los movimientos.
-- ------------------------------------------------------------
CREATE TABLE usuarios (
  doc              TEXT PRIMARY KEY
                     CONSTRAINT usuarios_doc_formato
                     CHECK (doc ~ '^[0-9A-Za-z]{5,15}$'),
  nombre           TEXT        NOT NULL CHECK (length(btrim(nombre)) > 0),
  clave_hash       TEXT        NOT NULL,            -- RNF-02: bcrypt, nunca texto plano
  correo           TEXT        NOT NULL DEFAULT '',
  tipo             TEXT        NOT NULL DEFAULT 'CC'
                     CHECK (tipo IN ('CC', 'CE', 'PA', '--')),
  nacimiento       DATE,
  rol              TEXT        NOT NULL DEFAULT 'usuario'
                     CHECK (rol IN ('usuario', 'admin', 'contable')),
  cuenta           TEXT        NOT NULL UNIQUE,
  disponible       NUMERIC(14,2) NOT NULL DEFAULT 0
                     CONSTRAINT usuarios_disponible_no_negativo CHECK (disponible >= 0),
  estado           TEXT        NOT NULL DEFAULT 'activa'
                     CHECK (estado IN ('activa', 'bloqueada')),
  -- RF-04: topes que el propio usuario configura
  tope_diario      NUMERIC(14,2) NOT NULL DEFAULT 5000000
                     CHECK (tope_diario > 0),
  tope_mensual     NUMERIC(14,2) NOT NULL DEFAULT 20000000
                     CHECK (tope_mensual > 0),
  CONSTRAINT usuarios_tope_diario_menor_mensual CHECK (tope_diario <= tope_mensual),
  -- RNF-02: 5 intentos fallidos -> bloqueo temporal de 15 minutos
  intentos_fallidos INTEGER    NOT NULL DEFAULT 0 CHECK (intentos_fallidos >= 0),
  bloqueado_hasta   TIMESTAMPTZ,
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX usuarios_correo_unico
  ON usuarios (lower(correo)) WHERE correo <> '';
CREATE INDEX usuarios_rol_idx    ON usuarios (rol);
CREATE INDEX usuarios_estado_idx ON usuarios (estado);
-- apoya la busqueda del administrador por nombre/correo (RF-05 CA-05.1)
CREATE INDEX usuarios_nombre_lower_idx ON usuarios (lower(nombre));

-- ------------------------------------------------------------
-- bolsillos
-- RN-02: un bolsillo pertenece a una sola cuenta y el dinero solo
-- se mueve entre el disponible de ESE usuario y sus bolsillos.
-- ------------------------------------------------------------
CREATE TABLE bolsillos (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_doc  TEXT NOT NULL REFERENCES usuarios (doc) ON DELETE CASCADE,
  nombre       TEXT NOT NULL CHECK (length(btrim(nombre)) > 0),
  saldo        NUMERIC(14,2) NOT NULL DEFAULT 0
                 CONSTRAINT bolsillos_saldo_no_negativo CHECK (saldo >= 0),
  -- 0 = sin meta. Si es mayor, la app muestra el % del saldo frente a la meta.
  meta         NUMERIC(14,2) NOT NULL DEFAULT 0
                 CONSTRAINT bolsillos_meta_no_negativa CHECK (meta >= 0),
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX bolsillos_nombre_unico_por_usuario
  ON bolsillos (usuario_doc, lower(btrim(nombre)));
CREATE INDEX bolsillos_usuario_idx ON bolsillos (usuario_doc);

-- ------------------------------------------------------------
-- cuentas_pago
-- Convenios que el usuario deja guardados (EPM, universidad, etc.)
-- para pagarlos despues sin volver a escribir la referencia.
-- ------------------------------------------------------------
CREATE TABLE cuentas_pago (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_doc  TEXT NOT NULL REFERENCES usuarios (doc) ON DELETE CASCADE,
  alias        TEXT NOT NULL CHECK (length(btrim(alias)) > 0),
  convenio     TEXT NOT NULL CHECK (convenio IN ('EPM', 'Universidad', 'Acueducto', 'Claro')),
  referencia   TEXT NOT NULL CHECK (length(btrim(referencia)) > 0),
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX cuentas_pago_alias_unico
  ON cuentas_pago (usuario_doc, lower(btrim(alias)));
CREATE UNIQUE INDEX cuentas_pago_referencia_unica
  ON cuentas_pago (usuario_doc, convenio, lower(btrim(referencia)));
CREATE INDEX cuentas_pago_usuario_idx ON cuentas_pago (usuario_doc);

-- ------------------------------------------------------------
-- movimientos
-- Libro de operaciones del sistema. origen/destino son TEXT porque
-- un extremo puede no ser una cuenta FINTEC: un convenio ('EPM'),
-- el nombre de un bolsillo, o una cuenta externa inexistente.
-- 'codigo' es el id legible TX-#### que ve el usuario.
-- ------------------------------------------------------------
CREATE SEQUENCE movimientos_codigo_seq START WITH 8841 INCREMENT BY 1;

CREATE TABLE movimientos (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  codigo        TEXT NOT NULL UNIQUE
                  DEFAULT ('TX-' || nextval('movimientos_codigo_seq'))
                  CHECK (codigo ~ '^TX-[0-9]+$'),
  tipo          TEXT NOT NULL
                  CHECK (tipo IN ('Transferencia', 'Pago', 'Bolsillo', 'Reversión', 'Cancelación', 'Crédito')),
  estado        TEXT NOT NULL
                  CHECK (estado IN ('Completada', 'Rechazada', 'Cancelada')),
  origen        TEXT NOT NULL,
  destino       TEXT NOT NULL,
  valor         NUMERIC(14,2) NOT NULL
                  CONSTRAINT movimientos_valor_positivo CHECK (valor > 0),
  nota          TEXT NOT NULL DEFAULT '',
  -- RN-03: un movimiento rechazado o cancelado SIEMPRE lleva su motivo
  CONSTRAINT movimientos_motivo_obligatorio
    CHECK (estado = 'Completada' OR length(btrim(nota)) > 0),
  -- RN-05: la reversion/cancelacion se enlaza al movimiento original
  original_id   BIGINT REFERENCES movimientos (id) ON DELETE RESTRICT,
  CONSTRAINT movimientos_enlace_coherente
    CHECK ((tipo IN ('Reversión', 'Cancelación')) = (original_id IS NOT NULL)),
  CONSTRAINT movimientos_no_autoenlace CHECK (original_id IS NULL OR original_id <> id),
  -- marca de que al original ya se le aplico una devolucion o cancelacion
  revertida     BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX movimientos_origen_idx      ON movimientos (origen);
CREATE INDEX movimientos_destino_idx     ON movimientos (destino);
CREATE INDEX movimientos_creado_en_idx   ON movimientos (creado_en DESC);
CREATE INDEX movimientos_estado_idx      ON movimientos (estado);
CREATE INDEX movimientos_tipo_idx        ON movimientos (tipo);
CREATE INDEX movimientos_original_id_idx ON movimientos (original_id);
-- consulta caliente: cupo diario/mensual = transferencias completadas salientes
CREATE INDEX movimientos_cupo_idx
  ON movimientos (origen, creado_en)
  WHERE tipo = 'Transferencia' AND estado = 'Completada';
-- un original no puede tener dos reversiones (RN-05, idempotencia)
CREATE UNIQUE INDEX movimientos_una_reversion_por_original
  ON movimientos (original_id) WHERE original_id IS NOT NULL;

-- ------------------------------------------------------------
-- alertas  (RF-06: notificaciones al usuario)
-- ------------------------------------------------------------
CREATE TABLE alertas (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_doc  TEXT NOT NULL REFERENCES usuarios (doc) ON DELETE CASCADE,
  texto        TEXT NOT NULL CHECK (length(btrim(texto)) > 0),
  leida        BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX alertas_usuario_fecha_idx ON alertas (usuario_doc, creado_en DESC);

-- ------------------------------------------------------------
-- creditos  (RF-09 añadido para la demo: producto académico)
--
-- Cada registro es un credito desembolsado a UNA cuenta. En el
-- desembolso se abona el principal al disponible del usuario y se
-- registra un movimiento tipo 'Crédito'. Las cuotas se descuentan
-- del disponible, tambien como movimiento 'Crédito'. El principal,
-- el plazo y la tasa se congelan al momento del desembolso para que
-- la cuota no cambie si el admin modifica las tasas mas adelante.
--
-- saldo_pendiente = total_a_pagar - sumatoria(pagos realizados).
-- Al llegar a 0 el credito queda en estado 'pagado' y no admite
-- mas pagos. 'cuota' es el valor fijo de una cuota mensual.
-- ------------------------------------------------------------
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

CREATE INDEX creditos_usuario_idx ON creditos (usuario_doc);
CREATE INDEX creditos_estado_idx  ON creditos (estado);

COMMIT;
