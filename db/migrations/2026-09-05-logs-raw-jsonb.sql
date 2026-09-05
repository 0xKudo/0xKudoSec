-- 2026-09-05-logs-raw-jsonb.sql
-- Sigma Full Coverage, Phase 4: make logs.raw queryable for unmapped Sigma fields.
--
-- Strategy (spec open question 1, chosen): a GENERATED jsonb column derived from
-- the existing `raw` text, plus a generated `search_text` for keyword/contains
-- search. Ingest is untouched (Postgres derives both at write time). GIN indexes
-- support raw-field containment and trigram substring search.
--
-- `logs` is RANGE-partitioned by timestamp. On PostgreSQL 12+ a generated column
-- added to the partitioned parent propagates to every existing and future
-- partition, and a partitioned index (ON ONLY the parent then per-partition, or
-- a plain CREATE INDEX which Postgres fans out) covers them.
--
-- The raw_json expression guards non-JSON rows: only values that begin with '{'
-- or '[' after trimming are cast, everything else yields NULL (a rule that reads
-- a raw field simply never matches those rows, which is correct).
--
-- Measured (local Docker, 5433): a `raw_json ->> 'Field' ILIKE '%x%'` predicate
-- is a per-partition Seq Scan — the GIN raw_json index serves jsonb containment
-- (@>, ?), not `->>` text match, and the trigram index is on search_text, not on
-- an extracted field. This is expected and acceptable: at ingest the correlation
-- engine scopes single_event/keyword rules to `l.id = ANY($logIds)` (the batch's
-- new rows only), so raw-field rules never scan the whole table on the hot path.
-- Keyword/contains over search_text DOES use the pg_trgm GIN index. Re-measure at
-- VPS volume before enabling very low-selectivity raw categories by default.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE public.logs
  ADD COLUMN IF NOT EXISTS raw_json jsonb
  GENERATED ALWAYS AS (
    CASE WHEN raw IS NOT NULL AND left(btrim(raw), 1) IN ('{', '[')
         THEN raw::jsonb ELSE NULL END
  ) STORED;

ALTER TABLE public.logs
  ADD COLUMN IF NOT EXISTS search_text text
  GENERATED ALWAYS AS (coalesce(message, '') || ' ' || coalesce(raw, '')) STORED;

-- Containment / key-existence lookups on raw fields.
CREATE INDEX IF NOT EXISTS idx_logs_raw_json ON public.logs USING gin (raw_json);
-- Substring (ILIKE %kw%) keyword and contains search.
CREATE INDEX IF NOT EXISTS idx_logs_search_text_trgm
  ON public.logs USING gin (search_text gin_trgm_ops);
