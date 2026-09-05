-- Migration: partition `logs` by month (XDR Phase 0, Task 0.2)
--
-- Converts the single unpartitioned `logs` table into a declarative
-- RANGE-partitioned table keyed on `timestamp`, one partition per month, so that:
--   * Phase 1 windowed correlation queries prune to the relevant months.
--   * Retention becomes DROP PARTITION (instant) instead of a mass row DELETE.
--
-- Design decisions (see docs/plans/2026-09-05-xdr-phase0-foundations.md Task 0.2):
--   * A partitioned table's PK/UNIQUE must include the partition key, so the PK
--     becomes (id, timestamp). `id` alone can no longer be UNIQUE.
--   * That makes the FKs alerts.log_id -> logs(id) and
--     realtime_analysis.log_id -> logs(id) impossible to keep. Per the chosen
--     strategy they are DROPPED; log_id stays a plain indexed column and
--     integrity is enforced in-app. Retention (DROP PARTITION) also cleans
--     orphaned realtime_analysis rows in the same maintenance pass.
--   * `timestamp` must be NOT NULL (partition key). NULLs are backfilled from
--     ingested_at; a DEFAULT partition catches any out-of-range strays.
--
-- Idempotent-ish: uses IF NOT EXISTS / IF EXISTS. Run inside one transaction.
-- REHEARSE on the Docker DB (port 5433) before the VPS. Keep `logs_old` until
-- verified, then drop it separately.
--
-- Run:  psql "$DATABASE_URL" -f db/migrations/2026-09-05-logs-partitioning.sql

BEGIN;

-- 1. Partition key cannot be NULL.
UPDATE logs SET timestamp = COALESCE(timestamp, ingested_at, now()) WHERE timestamp IS NULL;

-- 1b. Free the canonical PK/index names: rename the old table's objects aside
--     (renaming a table does NOT rename its indexes, and logs_old is kept until
--     verified, so its objects would otherwise squat on the canonical names).
ALTER TABLE logs RENAME CONSTRAINT logs_pkey TO logs_old_pkey;
ALTER INDEX idx_logs_user_timestamp RENAME TO idx_logs_old_user_timestamp;
ALTER INDEX idx_logs_user_event_id  RENAME TO idx_logs_old_user_event_id;
ALTER INDEX idx_logs_user_host      RENAME TO idx_logs_old_user_host;
ALTER INDEX idx_logs_user_severity  RENAME TO idx_logs_old_user_severity;

-- 2. New partitioned table: same columns/defaults as logs, PK includes the key.
CREATE TABLE logs_partitioned (LIKE public.logs INCLUDING DEFAULTS INCLUDING COMMENTS)
  PARTITION BY RANGE ("timestamp");
ALTER TABLE logs_partitioned ALTER COLUMN "timestamp" SET NOT NULL;
ALTER TABLE logs_partitioned ADD CONSTRAINT logs_pkey PRIMARY KEY (id, "timestamp");

-- 3. Monthly partitions covering existing data through next month, plus a DEFAULT
--    safety partition for anything outside the created ranges.
DO $$
DECLARE
  m       date := date_trunc('month', (SELECT COALESCE(min(timestamp), now()) FROM logs))::date;
  m_end   date := (date_trunc('month', now()) + interval '2 month')::date;
  pname   text;
BEGIN
  WHILE m < m_end LOOP
    pname := 'logs_y' || to_char(m,'YYYY') || 'm' || to_char(m,'MM');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.logs_partitioned FOR VALUES FROM (%L) TO (%L)',
      pname, m, (m + interval '1 month')::date);
    m := (m + interval '1 month')::date;
  END LOOP;
END$$;
CREATE TABLE IF NOT EXISTS public.logs_default PARTITION OF public.logs_partitioned DEFAULT;

-- 4. Indexes on the parent (propagate to every partition).
CREATE INDEX logs_ts_brin        ON logs_partitioned USING brin ("timestamp");
CREATE INDEX idx_logs_user_timestamp ON logs_partitioned (user_id, "timestamp" DESC);
CREATE INDEX idx_logs_user_event_id  ON logs_partitioned (user_id, event_id);
CREATE INDEX idx_logs_user_host      ON logs_partitioned (user_id, host);
CREATE INDEX idx_logs_user_severity  ON logs_partitioned (user_id, severity);

-- 5. Ownership, ops grant, and RLS (same policy as the original logs table).
ALTER TABLE logs_partitioned OWNER TO cybertools_app;
GRANT ALL ON logs_partitioned TO cybertools_ops;
-- The monthly partition-creation job runs as cybertools_app (only the parent's
-- owner may create partitions of it), which needs CREATE on the schema.
GRANT CREATE ON SCHEMA public TO cybertools_app;
ALTER TABLE logs_partitioned ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs_partitioned FORCE ROW LEVEL SECURITY;
CREATE POLICY user_isolation ON logs_partitioned
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));

-- 6. Backfill (run as a superuser/BYPASSRLS role so the WITH CHECK does not block).
INSERT INTO logs_partitioned SELECT * FROM logs;

-- 7. Drop the child FKs (Option A) — log_id becomes a plain indexed column.
ALTER TABLE alerts             DROP CONSTRAINT IF EXISTS alerts_log_id_fkey;
ALTER TABLE realtime_analysis  DROP CONSTRAINT IF EXISTS realtime_analysis_log_id_fkey;

-- 8. Swap names; re-own the sequence to the new table.
ALTER TABLE logs             RENAME TO logs_old;
ALTER TABLE logs_partitioned RENAME TO logs;
-- Reassign the sequence to the new table's column so DROP TABLE logs_old later
-- does not cascade-drop it. Order matters: unlink from logs_old first (can't
-- change owner while linked), then match the table's role-owner (the "sequence
-- must have same owner" gotcha), then relink to the new column.
ALTER SEQUENCE logs_id_seq OWNED BY NONE;
ALTER SEQUENCE logs_id_seq OWNER TO cybertools_app;
ALTER SEQUENCE logs_id_seq OWNED BY logs.id;

-- Preserve log_id lookup performance now that the FK indexes are gone.
CREATE INDEX IF NOT EXISTS idx_alerts_log_id            ON alerts (log_id);
CREATE INDEX IF NOT EXISTS idx_realtime_analysis_log_id ON realtime_analysis (log_id);

COMMIT;

-- Verify, then in a separate step:  DROP TABLE logs_old;
