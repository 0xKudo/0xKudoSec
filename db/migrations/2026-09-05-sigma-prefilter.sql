-- Migration: Sigma Rule Library Phase 3 — engine prefilter signatures
--
-- Adds a coarse match signature to each catalog rule, computed at sync time from
-- its top-level selection: the event_id / event_category / source values the
-- selection PINS via eq/in. At ingest the engine evaluates only rules whose
-- signature intersects the batch, instead of running every enabled rule.
--
-- Correctness: an empty signature array means the rule does not pin that dimension
-- (or pins it with a non-exact operator), so that dimension never excludes it. A
-- non-empty array is only produced from eq/in on an exact field, so a batch that
-- lacks those values genuinely cannot match the rule — no false negatives.
--
-- Populated on the NEXT sync; existing rows keep '{}' (always-candidate) until then.
--
-- Run on the VPS as a superuser:
--   cat db/migrations/2026-09-05-sigma-prefilter.sql | sudo -u postgres psql -d cybertools
--
-- Idempotent.

BEGIN;

ALTER TABLE public.sigma_rules
  ADD COLUMN IF NOT EXISTS sig_event_ids integer[] DEFAULT '{}'::integer[] NOT NULL;
ALTER TABLE public.sigma_rules
  ADD COLUMN IF NOT EXISTS sig_categories text[] DEFAULT '{}'::text[] NOT NULL;
ALTER TABLE public.sigma_rules
  ADD COLUMN IF NOT EXISTS sig_sources text[] DEFAULT '{}'::text[] NOT NULL;

-- GIN indexes make the array-overlap (&&) prefilter fast across the catalog.
CREATE INDEX IF NOT EXISTS idx_sigma_rules_sig_event_ids  ON public.sigma_rules USING gin (sig_event_ids);
CREATE INDEX IF NOT EXISTS idx_sigma_rules_sig_categories ON public.sigma_rules USING gin (sig_categories);
CREATE INDEX IF NOT EXISTS idx_sigma_rules_sig_sources    ON public.sigma_rules USING gin (sig_sources);

COMMIT;
