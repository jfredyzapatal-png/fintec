-- ============================================================
--  FINTEC — migracion aditiva: modulo de creditos
--
--  Este script es IDEMPOTENTE y NO borra datos. Se puede correr
--  sobre una base ya en produccion para habilitar el modulo de
--  creditos sin perder usuarios, saldos ni movimientos.
--
--  Hace dos cosas:
--    1) Reemplaza el CHECK de movimientos.tipo para aceptar
--       'Crédito' ademas de los tipos existentes.
--    2) Crea la tabla 'creditos' si no existe.
-- ============================================================

BEGIN;

-- 1) movimientos.tipo acepta 'Crédito'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'movimientos_tipo_check'
  ) THEN
    ALTER TABLE movimientos DROP CONSTRAINT movimientos_tipo_check;
  END IF;
END$$;

ALTER TABLE movimientos
  ADD CONSTRAINT movimientos_tipo_check
  CHECK (tipo IN ('Transferencia', 'Pago', 'Bolsillo', 'Reversión', 'Cancelación', 'Crédito'));

-- 2) tabla creditos
CREATE TABLE IF NOT EXISTS creditos (
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

CREATE INDEX IF NOT EXISTS creditos_usuario_idx ON creditos (usuario_doc);
CREATE INDEX IF NOT EXISTS creditos_estado_idx  ON creditos (estado);

COMMIT;
