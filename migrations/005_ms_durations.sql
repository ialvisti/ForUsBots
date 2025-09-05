BEGIN;

-- columnas nuevas en ms (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jobs' AND column_name='queue_ms') THEN
    ALTER TABLE jobs ADD COLUMN queue_ms INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jobs' AND column_name='run_ms') THEN
    ALTER TABLE jobs ADD COLUMN run_ms INTEGER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='jobs' AND column_name='total_ms') THEN
    ALTER TABLE jobs ADD COLUMN total_ms INTEGER;
  END IF;
END $$;

COMMIT;
