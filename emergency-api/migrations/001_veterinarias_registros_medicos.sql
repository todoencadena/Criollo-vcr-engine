-- Veterinary clinics and medical VCR records linked to emergency_reports (animals).
-- Applied automatically on server start (see ensureSchema in server.js); safe to re-run.

CREATE TABLE IF NOT EXISTS veterinarias (
  id             SERIAL PRIMARY KEY,
  nombre         TEXT NOT NULL,
  ciudad         TEXT NOT NULL,
  wallet_address TEXT UNIQUE,
  verificada     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- animal_id uses the same type as emergency_reports.id.
DO $$
DECLARE
  animal_id_type TEXT;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod) INTO animal_id_type
  FROM pg_attribute a
  WHERE a.attrelid = 'emergency_reports'::regclass AND a.attname = 'id';

  EXECUTE format($sql$
    CREATE TABLE IF NOT EXISTS registros_medicos (
      id             SERIAL PRIMARY KEY,
      animal_id      %s NOT NULL REFERENCES emergency_reports(id) ON DELETE CASCADE,
      veterinaria_id INTEGER NOT NULL REFERENCES veterinarias(id),
      tipo           TEXT NOT NULL CHECK (tipo IN (
                       'vaccination', 'surgery', 'treatment', 'checkup',
                       'diagnosis', 'medication', 'lab_test', 'emergency')),
      descripcion    TEXT,
      fecha_atencion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      vcr_tx_hash    TEXT UNIQUE,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )$sql$, animal_id_type);
END $$;

CREATE INDEX IF NOT EXISTS idx_registros_medicos_animal_id ON registros_medicos (animal_id);
CREATE INDEX IF NOT EXISTS idx_registros_medicos_veterinaria_id ON registros_medicos (veterinaria_id);
