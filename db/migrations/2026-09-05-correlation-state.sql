-- Migration: correlation_state table (XDR Phase 1, Task 1.3)
--
-- Sliding-window state for stateful correlation rule types (threshold, sequence,
-- join, absence). One row per (user_id, rule_id, state_key) — the state_key is
-- the group-by / join value. `counter` and `payload` hold the window's progress
-- so the engine survives restarts without replaying history.
--
-- rule_id references correlation_rules(id); detection_rules evaluated through the
-- single_event shim are stateless and never write here. RLS strict per Phase 0.
--
-- Run on the VPS as a superuser:
--   cat db/migrations/2026-09-05-correlation-state.sql | sudo -u postgres psql -d cybertools
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS public.correlation_state (
  user_id      text NOT NULL,
  rule_id      bigint NOT NULL,
  state_key    text NOT NULL,
  window_start timestamp with time zone,
  counter      integer DEFAULT 0 NOT NULL,
  payload      jsonb DEFAULT '{}'::jsonb NOT NULL,
  updated_at   timestamp with time zone DEFAULT now(),
  PRIMARY KEY (user_id, rule_id, state_key)
);

-- Prune by updated_at (expiry job); index it.
CREATE INDEX IF NOT EXISTS idx_correlation_state_updated
  ON public.correlation_state (updated_at);

-- FK to correlation_rules so deleting a rule clears its state.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'correlation_state_rule_id_fkey'
  ) THEN
    ALTER TABLE public.correlation_state
      ADD CONSTRAINT correlation_state_rule_id_fkey
      FOREIGN KEY (rule_id) REFERENCES public.correlation_rules(id) ON DELETE CASCADE;
  END IF;
END$$;

-- Ownership + ops grant, guarded so a fresh Docker DB (postgres-owned) is unaffected.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cybertools_app') THEN
    EXECUTE 'ALTER TABLE public.correlation_state OWNER TO cybertools_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cybertools_ops') THEN
    EXECUTE 'GRANT ALL ON public.correlation_state TO cybertools_ops';
  END IF;
END$$;

ALTER TABLE public.correlation_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.correlation_state FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_isolation ON public.correlation_state;
CREATE POLICY user_isolation ON public.correlation_state
  USING (user_id = current_setting('app.user_id'::text, true))
  WITH CHECK (user_id = current_setting('app.user_id'::text, true));

COMMIT;
