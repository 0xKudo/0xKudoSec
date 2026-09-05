-- Migration: add attack_techniques to detection_rules (XDR Phase 0, Task 0.3)
-- Idempotent. Safe to run on the live VPS against an existing detection_rules table.
-- schema.sql already carries this column for fresh installs; this file is for
-- databases created before 2026-09-05.
--
-- Run on the VPS:  psql "$DATABASE_URL" -f db/migrations/2026-09-05-attack-techniques.sql

ALTER TABLE public.detection_rules
  ADD COLUMN IF NOT EXISTS attack_techniques text[] DEFAULT '{}'::text[] NOT NULL;
