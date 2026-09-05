-- 2026-09-05-rls-strict.sql
-- XDR Phase 0, Task 0.1 — flip RLS from conditional to strict.
--
-- The live policies are conditional:
--   USING ( current_setting('app.user_id', true) IS NULL OR user_id = current_setting('app.user_id', true) )
-- Because no route ever set app.user_id, the IS NULL branch always matched and
-- RLS was a no-op. After the app refactor (every request-scoped query now runs
-- inside a withUser()/withUserPool() transaction that sets app.user_id, and all
-- cross-user maintenance runs on the BYPASSRLS ops/ingest_auth pools), the NULL
-- escape is dropped so a missing context fails closed (zero rows / WITH CHECK
-- violation) instead of leaking across tenants.
--
-- DEPLOY ORDER: ship the app conversion first and verify data still appears
-- (conditional policies still live), THEN apply this migration as a separate,
-- single-transaction step. Idempotent: re-running ALTER POLICY is safe.
--
-- ROLLBACK (restore the NULL escape) if anything breaks:
--   ALTER POLICY user_isolation ON public.<table>
--     USING ((current_setting('app.user_id', true) IS NULL) OR (user_id = current_setting('app.user_id', true)))
--     WITH CHECK ((current_setting('app.user_id', true) IS NULL) OR (user_id = current_setting('app.user_id', true)));

BEGIN;

ALTER POLICY user_isolation ON public.alerts
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));

ALTER POLICY user_isolation ON public.audit_log
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));

ALTER POLICY user_isolation ON public.cases
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));

ALTER POLICY user_isolation ON public.detection_rules
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));

ALTER POLICY user_isolation ON public.ingest_sources
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));

ALTER POLICY user_isolation ON public.logs
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));

ALTER POLICY user_isolation ON public.noise_candidates
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));

ALTER POLICY user_isolation ON public.realtime_analysis
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));

ALTER POLICY user_isolation ON public.user_ingest_keys
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));

ALTER POLICY user_isolation ON public.user_settings
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));

ALTER POLICY user_isolation ON public.wp_protection_rules
  USING (user_id = current_setting('app.user_id', true))
  WITH CHECK (user_id = current_setting('app.user_id', true));

COMMIT;
