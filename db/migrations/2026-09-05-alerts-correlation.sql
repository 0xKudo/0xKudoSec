-- Migration: alerts columns for correlation alerts (XDR Phase 1, Task 1.4)
--
-- Correlation-rule alerts live in the existing `alerts` table alongside
-- detection-rule alerts. They set correlation_rule_id (not rule_id) and a
-- group_key (the group-by / join value, or the event_id for single_event) which
-- is their dedup discriminator — the existing alerts_dedup constraint is keyed on
-- rule_id and does not apply. A partial unique index gives correlation alerts
-- their own dedup path.
--
-- No hard XOR CHECK on (rule_id, correlation_rule_id): existing alerts may have
-- rule_id NULL (alerts_rule_id_fkey is ON DELETE SET NULL). The "exactly one set"
-- invariant is enforced in application code.
--
-- Run on the VPS as a superuser:
--   cat db/migrations/2026-09-05-alerts-correlation.sql | sudo -u postgres psql -d cybertools
-- Idempotent.

BEGIN;

ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS correlation_rule_id bigint;
ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS group_key text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'alerts_correlation_rule_id_fkey') THEN
    ALTER TABLE public.alerts
      ADD CONSTRAINT alerts_correlation_rule_id_fkey
      FOREIGN KEY (correlation_rule_id) REFERENCES public.correlation_rules(id) ON DELETE SET NULL;
  END IF;
END$$;

-- Dedup path for correlation alerts (only rows where correlation_rule_id is set).
CREATE UNIQUE INDEX IF NOT EXISTS alerts_corr_dedup
  ON public.alerts (user_id, correlation_rule_id, group_key)
  WHERE correlation_rule_id IS NOT NULL;

COMMIT;
