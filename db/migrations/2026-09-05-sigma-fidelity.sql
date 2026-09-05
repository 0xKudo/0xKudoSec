-- 2026-09-05-sigma-fidelity.sql
-- Sigma Full Coverage, Phase 6: record conversion fidelity per catalog rule so
-- honesty scales with coverage.
--   exact       - every field first-class, ops representable
--   approximate - uses the raw accessor, a lossy field map, or a best-effort
--                 modifier decode (base64/windash); still runs, may over/under-match
--   (rejected rules keep convert_status='rejected' and carry no fidelity)

ALTER TABLE public.sigma_rules ADD COLUMN IF NOT EXISTS fidelity text;
CREATE INDEX IF NOT EXISTS idx_sigma_rules_fidelity ON public.sigma_rules USING btree (fidelity);
