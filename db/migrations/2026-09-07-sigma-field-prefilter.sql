-- Migration: Sigma Rule Library Phase C — high-selectivity field prefilter
--
-- The coarse Phase 3 signature (sig_event_ids/categories/sources) is empty for the
-- ~90% of Sigma rules that pin process_name / parent_process_name / file_path /
-- registry_key instead of event_id/category/source. Phase C records those pinned
-- terms so the scheduled window pass can skip a rule whose required field values
-- are absent from recent telemetry (the "only run rules relevant to what the logs
-- touched" prefilter), and flags regex rules so pure-regex-unprefilterable rules
-- (no SQL-index answer) can be deferred to the in-memory matcher (Phase D).
--
-- sig_terms shape: { "<log column>": [ { "op": "eq|contains|startswith|endswith",
--                                        "v": "<lowercased literal>" } , ... ] }
-- Only GUARANTEED (AND-required) pins are recorded, so skipping is never a false
-- negative. Populated on the NEXT sync; existing rows keep the defaults until then.
--
-- Run on the VPS as a superuser:
--   cat db/migrations/2026-09-07-sigma-field-prefilter.sql | sudo -u postgres psql -d cybertools
--
-- Idempotent.

BEGIN;

ALTER TABLE public.sigma_rules
  ADD COLUMN IF NOT EXISTS sig_terms jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE public.sigma_rules
  ADD COLUMN IF NOT EXISTS has_regex boolean DEFAULT false NOT NULL;

-- The window pass loads the enabled catalog and skips in application code, so no
-- functional index is needed on sig_terms. A btree on has_regex helps the count
-- queries that report the deferred-regex population in the Rule Library status.
CREATE INDEX IF NOT EXISTS idx_sigma_rules_has_regex ON public.sigma_rules (has_regex);

COMMIT;
