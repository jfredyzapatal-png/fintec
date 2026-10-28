-- ============================================================
--  FINTEC — migracion aditiva: filtros, metas, cuentas de pago y 2FA
--
--  IDEMPOTENTE y NO borra datos. Se puede correr sobre una base
--  que ya tiene usuarios, saldos y movimientos.
--
--  Agrega:
--    1) bolsillos.meta          (0 = sin meta)
--    2) alertas.leida           (la campanita cuenta las no leidas)
--    3) tabla cuentas_pago      (convenios guardados para pagar)
--    4) usuarios.doble_factor, ultimo_ingreso, clave_cambiada_en,
--       ultimo_bloqueo y tabla desafios_acceso (codigo de un solo uso)
-- ============================================================

BEGIN;

ALTER TABLE bolsillos
  ADD COLUMN IF NOT EXISTS meta NUMERIC(14,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bolsillos_meta_no_negativa'
  ) THEN
    ALTER TABLE bolsillos
      ADD CONSTRAINT bolsillos_meta_no_negativa CHECK (meta >= 0);
  END IF;
END$$;

ALTER TABLE alertas
  ADD COLUMN IF NOT EXISTS leida BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS cuentas_pago (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_doc  TEXT NOT NULL REFERENCES usuarios (doc) ON DELETE CASCADE,
  alias        TEXT NOT NULL CHECK (length(btrim(alias)) > 0),
  convenio     TEXT NOT NULL CHECK (convenio IN ('EPM', 'Universidad', 'Acueducto', 'Claro')),
  referencia   TEXT NOT NULL CHECK (length(btrim(referencia)) > 0),
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS cuentas_pago_alias_unico
  ON cuentas_pago (usuario_doc, lower(btrim(alias)));
CREATE UNIQUE INDEX IF NOT EXISTS cuentas_pago_referencia_unica
  ON cuentas_pago (usuario_doc, convenio, lower(btrim(referencia)));
CREATE INDEX IF NOT EXISTS cuentas_pago_usuario_idx ON cuentas_pago (usuario_doc);

-- Doble autenticación y actividad de la cuenta.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS doble_factor BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_ingreso TIMESTAMPTZ;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS clave_cambiada_en TIMESTAMPTZ;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_bloqueo TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS desafios_acceso (
  id           TEXT PRIMARY KEY,
  usuario_doc  TEXT NOT NULL REFERENCES usuarios (doc) ON DELETE CASCADE,
  codigo_hash  TEXT NOT NULL,
  expira_en    TIMESTAMPTZ NOT NULL,
  intentos     INTEGER NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS desafios_acceso_usuario_idx ON desafios_acceso (usuario_doc);

COMMIT;
