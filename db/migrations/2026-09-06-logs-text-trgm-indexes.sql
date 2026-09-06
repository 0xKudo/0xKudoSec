-- 2026-09-06-logs-text-trgm-indexes.sql
-- Sigma catalog performance, Phase B: trigram GIN indexes on the hot first-class
-- text columns so ILIKE (contains/startswith/endswith) rules index-scan instead
-- of per-partition seq scanning.
--
-- CONTEXT
-- The scheduled catalog evaluator (catalogCron) runs the enabled Sigma catalog in
-- WINDOW mode (logIds NULL, a lookback window), so each single_event rule scans
-- the recent-rows window. A large share of SigmaHQ rules match on process_name /
-- ParentImage / TargetFilename / CommandLine / registry via ILIKE. Those columns
-- had only btree indexes (idx_logs_user_host, idx_logs_user_event_id, ...), which
-- cannot serve `col ILIKE '%needle%'` or `col ILIKE '%\suffix'`. pg_trgm GIN can.
--
-- pg_trgm is already installed (2026-09-05-logs-raw-jsonb.sql) and already backs
-- idx_logs_search_text_trgm on the generated search_text column. This migration
-- adds per-column trigram indexes for the columns the compiler filters directly
-- (compileLeaf), so a rule that pins process_name/file_path/etc. uses an index.
--
-- RAW-FIELD (`raw_json ->> 'Field' ILIKE ...`) rules are handled separately by the
-- compiler change that AND-prefixes a search_text trigram predicate (which uses
-- idx_logs_search_text_trgm) — see docs/plans/2026-09-06-sigma-catalog-performance.md.
-- No new index is required for those; this file covers first-class columns only.
--
-- PARTITIONING NOTE
-- `logs` is RANGE-partitioned by timestamp. A plain CREATE INDEX on the partitioned
-- parent builds the index on every existing partition and auto-creates it on future
-- partitions. It briefly takes ACCESS EXCLUSIVE on the parent while the per-partition
-- builds run. On this deployment the live window is modest, so the build is short;
-- still, run it in a low-traffic window. CREATE INDEX CONCURRENTLY is NOT supported
-- directly on a partitioned parent, so we mirror the existing (non-concurrent)
-- parent-index pattern already used for idx_logs_raw_json / idx_logs_search_text_trgm.
-- IF NOT EXISTS keeps this idempotent and safe to re-run.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_logs_process_name_trgm
  ON public.logs USING gin (process_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_logs_parent_process_name_trgm
  ON public.logs USING gin (parent_process_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_logs_file_path_trgm
  ON public.logs USING gin (file_path gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_logs_registry_key_trgm
  ON public.logs USING gin (registry_key gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_logs_message_trgm
  ON public.logs USING gin (message gin_trgm_ops);

-- After building, ANALYZE so the planner has trigram selectivity stats.
ANALYZE public.logs;
