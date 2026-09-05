-- Migration: sigma_rules catalog + sigma_sync_state (Sigma Rule Library, Phase 1)
--
-- One GLOBAL catalog of converted SigmaHQ community rules, shared across all
-- users and refreshed by a scheduled tarball sync (services/sigmaCron.js), plus
-- a sync-history/status table. Both are public reference data, NOT user-scoped:
-- they are EXCLUDED from RLS exactly like vuln_kb. Per-user enablement and
-- overrides land in a later phase (user_settings + sigma_rule_overrides).
--
-- Run on the VPS as a superuser so the ownership/GRANT statements apply:
--   cat db/migrations/2026-09-05-sigma-catalog.sql | sudo -u postgres psql -d cybertools
--
-- Idempotent: IF NOT EXISTS throughout; role grants are guarded.

BEGIN;

-- ── sigma_rules: the global converted-rule catalog ────────────────────────────

CREATE SEQUENCE IF NOT EXISTS public.sigma_rules_id_seq
  START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

CREATE TABLE IF NOT EXISTS public.sigma_rules (
  id                bigint PRIMARY KEY DEFAULT nextval('public.sigma_rules_id_seq'::regclass),
  sigma_id          text,                                  -- Sigma rule UUID (may repeat/absent)
  identity          text NOT NULL UNIQUE,                  -- sigma_id, else sha1(path)
  title             text,
  category          text NOT NULL,                         -- generic|threat_hunting|emerging_threats|compliance|placeholder
  path              text NOT NULL,                         -- source path within the repo
  rule              jsonb,                                 -- converted correlation rule doc (null when rejected)
  severity          text,
  attack_techniques text[] DEFAULT '{}'::text[] NOT NULL,
  convert_status    text NOT NULL,                         -- 'converted' | 'rejected'
  reject_reason     text,                                  -- named construct when rejected
  retired           boolean DEFAULT false NOT NULL,        -- true when absent from the latest sync
  source_sha        text,                                  -- commit the row was last synced from
  updated_at        timestamp with time zone DEFAULT now()
);

ALTER SEQUENCE public.sigma_rules_id_seq OWNED BY public.sigma_rules.id;

CREATE INDEX IF NOT EXISTS idx_sigma_rules_category ON public.sigma_rules (category);
CREATE INDEX IF NOT EXISTS idx_sigma_rules_status   ON public.sigma_rules (convert_status);
CREATE INDEX IF NOT EXISTS idx_sigma_rules_retired  ON public.sigma_rules (retired);

-- ── sigma_sync_state: one row per sync (status/history) ───────────────────────

CREATE SEQUENCE IF NOT EXISTS public.sigma_sync_state_id_seq
  START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

CREATE TABLE IF NOT EXISTS public.sigma_sync_state (
  id              bigint PRIMARY KEY DEFAULT nextval('public.sigma_sync_state_id_seq'::regclass),
  ref             text,                                    -- branch/tag synced (e.g. 'master')
  source_sha      text,
  started_at      timestamp with time zone DEFAULT now(),
  finished_at     timestamp with time zone,
  total           integer DEFAULT 0 NOT NULL,
  converted       integer DEFAULT 0 NOT NULL,
  rejected        integer DEFAULT 0 NOT NULL,
  retired         integer DEFAULT 0 NOT NULL,
  category_counts jsonb,                                   -- {generic: n, ...}
  reject_reasons  jsonb,                                   -- {reasonBucket: n, ...}
  duration_ms     integer,
  error           text
);

ALTER SEQUENCE public.sigma_sync_state_id_seq OWNED BY public.sigma_sync_state.id;

CREATE INDEX IF NOT EXISTS idx_sigma_sync_state_started ON public.sigma_sync_state (started_at DESC);

-- ── Ownership + ops grant (guarded; no-ops on a fresh Docker DB) ───────────────
-- These tables are GLOBAL and excluded from RLS (like vuln_kb): no ENABLE ROW
-- LEVEL SECURITY. The app role owns them so the cron (running as owner) can write.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cybertools_app') THEN
    EXECUTE 'ALTER TABLE public.sigma_rules OWNER TO cybertools_app';
    EXECUTE 'ALTER SEQUENCE public.sigma_rules_id_seq OWNER TO cybertools_app';
    EXECUTE 'ALTER TABLE public.sigma_sync_state OWNER TO cybertools_app';
    EXECUTE 'ALTER SEQUENCE public.sigma_sync_state_id_seq OWNER TO cybertools_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cybertools_ops') THEN
    EXECUTE 'GRANT ALL ON public.sigma_rules TO cybertools_ops';
    EXECUTE 'GRANT ALL ON SEQUENCE public.sigma_rules_id_seq TO cybertools_ops';
    EXECUTE 'GRANT ALL ON public.sigma_sync_state TO cybertools_ops';
    EXECUTE 'GRANT ALL ON SEQUENCE public.sigma_sync_state_id_seq TO cybertools_ops';
  END IF;
END$$;

COMMIT;
