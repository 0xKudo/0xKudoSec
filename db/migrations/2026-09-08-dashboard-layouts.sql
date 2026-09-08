-- 2026-09-08 — Per-user customizable dashboard layouts.
--
-- WHY: the "My Dashboard" SIEM view lets each user compose a personal grid of
-- widgets (move/resize/add/remove). The layout is data and must persist per user.
--
-- RLS from creation (standing rule — no retrofit): a user reads/writes only their
-- own rows. The app connects via a role that sets app.user_id per request
-- (dbContext middleware), so the user_isolation policy scopes every query. The
-- server ALSO filters by user_id explicitly (defense in depth).
--
-- Run on the VPS as a superuser (postgres) so the ownership/GRANT statements apply,
-- BEFORE restarting the server:
--   psql "$DATABASE_URL" -f db/migrations/2026-09-08-dashboard-layouts.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.dashboard_layouts (
  user_id     text        NOT NULL,
  name        text        NOT NULL DEFAULT 'default',
  layout      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  is_default  boolean     NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, name)
);

ALTER TABLE public.dashboard_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.dashboard_layouts FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'dashboard_layouts' AND policyname = 'user_isolation') THEN
    CREATE POLICY user_isolation ON public.dashboard_layouts
      USING ((user_id = current_setting('app.user_id'::text, true)))
      WITH CHECK ((user_id = current_setting('app.user_id'::text, true)));
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cybertools_app') THEN
    EXECUTE 'ALTER TABLE public.dashboard_layouts OWNER TO cybertools_app';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cybertools_ops') THEN
    EXECUTE 'GRANT ALL ON public.dashboard_layouts TO cybertools_ops';
  END IF;
END $$;

COMMIT;
