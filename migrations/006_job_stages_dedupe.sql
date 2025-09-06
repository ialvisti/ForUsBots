BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'u_job_stages_once'
  ) THEN
    ALTER TABLE job_stages
      ADD CONSTRAINT u_job_stages_once
      UNIQUE (job_id, stage_name, status, started_at, ended_at);
  END IF;
END $$;

COMMIT;
