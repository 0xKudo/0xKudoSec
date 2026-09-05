-- Migration: add the missing alerts_dedup UNIQUE constraint.
--
-- detection.js inserts alerts with `ON CONFLICT ON CONSTRAINT alerts_dedup`, but
-- the constraint was never carried into db/schema.sql or the live VPS (it only
-- existed in docs/schema.sql). As a result every rule match threw
--   constraint "alerts_dedup" for table "alerts" does not exist
-- and NO alert was ever created. This restores it.
--
-- Dedup semantics: repeat events of the same rule + event_id collapse into one
-- alert (count++ / occurrence_times append). NULL event_id rows are treated as
-- distinct by UNIQUE, so they never dedup — matching the original design.
--
-- Safe/idempotent. Fails only if duplicate (user_id, rule_id, event_id) rows
-- already exist; de-dupe those first if so (the live alerts table was empty when
-- this was applied 2026-09-05).
--
-- Run on the VPS:  psql "$DATABASE_URL" -f db/migrations/2026-09-05-alerts-dedup-constraint.sql

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.alerts'::regclass AND conname = 'alerts_dedup'
  ) THEN
    ALTER TABLE public.alerts
      ADD CONSTRAINT alerts_dedup UNIQUE (user_id, rule_id, event_id);
  END IF;
END$$;
