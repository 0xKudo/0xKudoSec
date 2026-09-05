-- Migration: correlation_rules table (XDR Phase 1, Task 1.1.3)
--
-- Holds versioned JSON correlation rule documents (single_event / threshold /
-- sequence / join / absence). The engine compiles `rule` to SQL at runtime.
-- detection_rules stays in place and is read through a compatibility shim, so
-- this table is additive with no forced migration.
--
-- RLS is enabled at creation per the Phase 0 standing rule (strict
-- user_isolation, matching every other per-user table). Run on the VPS as a
-- superuser so the ownership/GRANT/policy statements apply:
--   cat db/migrations/2026-09-05-correlation-rules.sql | sudo -u postgres psql -d cybertools
--
-- Idempotent: IF NOT EXISTS throughout; the policy is dropped-then-created.

BEGIN;

CREATE SEQUENCE IF NOT EXISTS public.correlation_rules_id_seq
  START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

CREATE TABLE IF NOT EXISTS public.correlation_rules (
  id                bigint PRIMARY KEY DEFAULT nextval('public.correlation_rules_id_seq'::regclass),
  user_id           text NOT NULL,
  name              text NOT NULL,
  description       text,
  rule              jsonb NOT NULL,
  severity          text DEFAULT 'high',
  enabled           boolean DEFAULT true,
  version           integer DEFAULT 1 NOT NULL,
  attack_techniques text[] DEFAULT '{}'::text[] NOT NULL,
  created_at        timestamp with time zone DEFAULT now(),
  updated_at        timestamp with time zone DEFAULT now()
);

ALTER SEQUENCE public.correlation_rules_id_seq OWNED BY public.correlation_rules.id;

CREATE INDEX IF NOT EXISTS idx_correlation_rules_user
  ON public.correlation_rules (user_id);

-- Ownership + ops grant (BYPASSRLS maintenance role), mirroring the other tables.
-- No-ops on a fresh Docker DB where everything is owned by postgres and these
-- roles may not exist — guarded so the migration still runs there.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cybertools_app') THEN
    EXECUTE 'ALTER TABLE public.correlation_rules OWNER TO cybertools_app';
    EXECUTE 'ALTER SEQUENCE public.correlation_rules_id_seq OWNER TO cybertools_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cybertools_ops') THEN
    EXECUTE 'GRANT ALL ON public.correlation_rules TO cybertools_ops';
    EXECUTE 'GRANT ALL ON SEQUENCE public.correlation_rules_id_seq TO cybertools_ops';
  END IF;
END$$;

-- Strict RLS: rows are visible/writable only when app.user_id matches (fail-closed).
ALTER TABLE public.correlation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.correlation_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_isolation ON public.correlation_rules;
CREATE POLICY user_isolation ON public.correlation_rules
  USING (user_id = current_setting('app.user_id'::text, true))
  WITH CHECK (user_id = current_setting('app.user_id'::text, true));

COMMIT;
