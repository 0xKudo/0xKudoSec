-- Migration: Sigma Rule Library Phase 2 — per-user enablement
--
-- Adds:
--   * user_settings.sigma_enabled_categories / sigma_auto_update (coarse toggles)
--   * sigma_rule_overrides (per-user per-rule disable / severity override; RLS)
--   * alerts.sigma_identity + a partial dedup index, so a catalog (community) rule
--     can fire an alert that references its catalog identity. This column is listed
--     under Phase 4 in the spec, but it is pulled forward here because the Phase 2
--     engine cannot fire catalog alerts without it. The Community/Sigma UI badge
--     remains later work.
--
-- Run on the VPS as a superuser (ownership/GRANT/policy statements):
--   cat db/migrations/2026-09-05-sigma-enablement.sql | sudo -u postgres psql -d cybertools
--
-- Idempotent: IF NOT EXISTS throughout; the override policy is dropped-then-created.

BEGIN;

-- ── Coarse per-user toggles on user_settings ─────────────────────────────────
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS sigma_enabled_categories text[] DEFAULT '{}'::text[] NOT NULL;
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS sigma_auto_update boolean DEFAULT true NOT NULL;

-- ── sigma_rule_overrides: per-user per-rule enable/severity override ──────────
CREATE TABLE IF NOT EXISTS public.sigma_rule_overrides (
  user_id        text NOT NULL,
  sigma_identity text NOT NULL,       -- logical ref to sigma_rules.identity (no FK: catalog re-sync is decoupled)
  enabled        boolean,             -- explicit on/off overriding the category default
  severity       text,                -- optional per-user severity override
  updated_at     timestamp with time zone DEFAULT now(),
  PRIMARY KEY (user_id, sigma_identity)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cybertools_app') THEN
    EXECUTE 'ALTER TABLE public.sigma_rule_overrides OWNER TO cybertools_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cybertools_ops') THEN
    EXECUTE 'GRANT ALL ON public.sigma_rule_overrides TO cybertools_ops';
  END IF;
END$$;

ALTER TABLE public.sigma_rule_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sigma_rule_overrides FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_isolation ON public.sigma_rule_overrides;
CREATE POLICY user_isolation ON public.sigma_rule_overrides
  USING (user_id = current_setting('app.user_id'::text, true))
  WITH CHECK (user_id = current_setting('app.user_id'::text, true));

-- ── alerts.sigma_identity + dedup index (catalog-alert firing) ────────────────
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS sigma_identity text;

CREATE UNIQUE INDEX IF NOT EXISTS alerts_sigma_dedup
  ON public.alerts (user_id, sigma_identity, group_key)
  WHERE sigma_identity IS NOT NULL;

COMMIT;
