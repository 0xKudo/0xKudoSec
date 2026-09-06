-- 2026-09-06 — Fix noise_candidates.field_signature: text -> jsonb.
--
-- WHY: every consumer of this column treats it as jsonb, but the column was text,
-- so node-pg returned a raw JSON *string* instead of a parsed object. Consequences
-- seen in the Tuning Center:
--   * The candidates table read `field_signature.event_category` on a string ->
--     undefined, so patterns showed blank/"0" instead of the event description.
--   * Approving a candidate read `sig.event_category` / `sig.source` on a string ->
--     undefined, creating suppression rules named "[Auto] Suppress undefined from
--     undefined" with NO match conditions.
--   * scoreSuppressConflicts (noiseCron.js) and the LLM /context endpoint (noise.js)
--     use the jsonb `->>` operator, which does not exist for text and was erroring
--     outright, so suppression-conflict scoring and LLM context silently failed.
-- The Electron LLM path worked only because it defensively JSON.parse'd the string
-- (llmProcess.js), which is why LLM analysis showed the event while the UI did not.
--
-- All stored values are canonical JSON (written via jsonb_build_object / JSON.stringify
-- with a ::jsonb cast), so the conversion is lossless. The (user_id, field_signature)
-- unique index is rebuilt automatically by ALTER COLUMN TYPE and keeps working
-- (jsonb supports equality). No code change is required — the app already assumes
-- jsonb everywhere.
--
-- Rollback (not recommended): ALTER COLUMN field_signature TYPE text USING field_signature::text;

ALTER TABLE public.noise_candidates
  ALTER COLUMN field_signature TYPE jsonb USING field_signature::jsonb;
