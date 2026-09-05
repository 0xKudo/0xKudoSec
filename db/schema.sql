--
-- PostgreSQL database dump
--

\restrict WibXmHwGdvMiaTZsihhmkKZXF1x45h6xz7ft0MC6IRnf7haeiI3sQrzWPTeVtMs

-- Dumped from database version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alerts (
    id bigint NOT NULL,
    user_id text NOT NULL,
    rule_id bigint,
    log_id bigint,
    title text NOT NULL,
    severity text NOT NULL,
    status text DEFAULT 'new'::text,
    host text,
    source_ip text,
    username text,
    event_id integer,
    message text,
    count integer DEFAULT 1 NOT NULL,
    last_seen timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    occurrence_times timestamp with time zone[] DEFAULT ARRAY[]::timestamp with time zone[] NOT NULL,
    correlation_rule_id bigint,
    group_key text
);

ALTER TABLE ONLY public.alerts FORCE ROW LEVEL SECURITY;


--
-- Name: alerts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.alerts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: alerts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.alerts_id_seq OWNED BY public.alerts.id;


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id bigint NOT NULL,
    user_id text,
    action text NOT NULL,
    meta text,
    ip text,
    row_hash text,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.audit_log FORCE ROW LEVEL SECURITY;


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;


--
-- Name: case_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.case_alerts (
    case_id bigint NOT NULL,
    alert_id bigint NOT NULL,
    added_at timestamp with time zone DEFAULT now()
);


--
-- Name: cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cases (
    id bigint NOT NULL,
    user_id text NOT NULL,
    title text NOT NULL,
    severity text DEFAULT 'medium'::text,
    status text DEFAULT 'open'::text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.cases FORCE ROW LEVEL SECURITY;


--
-- Name: cases_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cases_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cases_id_seq OWNED BY public.cases.id;


--
-- Name: detection_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.detection_rules (
    id bigint NOT NULL,
    user_id text NOT NULL,
    name text NOT NULL,
    description text,
    severity text DEFAULT 'high'::text,
    enabled boolean DEFAULT true,
    match_event_id integer,
    match_category text,
    match_severity text,
    match_username text,
    match_host text,
    match_message text,
    match_process text,
    match_src_ip text,
    match_dest_ip text,
    match_dest_port integer,
    action text DEFAULT 'alert'::text,
    attack_techniques text[] DEFAULT '{}'::text[] NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.detection_rules FORCE ROW LEVEL SECURITY;


--
-- Name: detection_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.detection_rules_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: detection_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.detection_rules_id_seq OWNED BY public.detection_rules.id;


--
-- Name: ingest_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ingest_sources (
    id bigint NOT NULL,
    user_id text NOT NULL,
    name text NOT NULL,
    type text,
    last_seen timestamp with time zone DEFAULT now(),
    event_count integer DEFAULT 0 NOT NULL
);

ALTER TABLE ONLY public.ingest_sources FORCE ROW LEVEL SECURITY;


--
-- Name: ingest_sources_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.ingest_sources_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ingest_sources_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.ingest_sources_id_seq OWNED BY public.ingest_sources.id;


--
-- Name: logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.logs (
    id bigint NOT NULL,
    user_id text NOT NULL,
    source text,
    host text,
    source_ip text,
    dest_ip text,
    dest_port integer,
    protocol text,
    "timestamp" timestamp with time zone NOT NULL,
    ingested_at timestamp with time zone DEFAULT now(),
    level text,
    severity text,
    event_id integer,
    event_category text,
    message text,
    username text,
    domain text,
    logon_type integer,
    process_name text,
    process_id integer,
    process_guid text,
    parent_process_name text,
    parent_process_id integer,
    parent_process_guid text,
    file_path text,
    registry_key text,
    raw text,
    -- Sigma Full Coverage Phase 4: queryable views of `raw` for unmapped Sigma
    -- fields and keyword search. Generated, so ingest writes only `raw`/`message`.
    raw_json jsonb GENERATED ALWAYS AS (
      CASE WHEN raw IS NOT NULL AND left(btrim(raw), 1) IN ('{', '[')
           THEN raw::jsonb ELSE NULL END
    ) STORED,
    search_text text GENERATED ALWAYS AS (coalesce(message, '') || ' ' || coalesce(raw, '')) STORED
)
PARTITION BY RANGE ("timestamp");

ALTER TABLE ONLY public.logs FORCE ROW LEVEL SECURITY;


--
-- Name: logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.logs_id_seq OWNED BY public.logs.id;


--
-- Name: noise_candidates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.noise_candidates (
    id text DEFAULT lower(replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
    user_id text NOT NULL,
    field_signature text NOT NULL,
    score integer DEFAULT 0 NOT NULL,
    confidence text DEFAULT 'low'::text NOT NULL,
    daily_avg real,
    first_seen timestamp with time zone,
    last_seen timestamp with time zone,
    event_count integer,
    llm_explanation text,
    llm_cve_safe boolean,
    llm_cve_note text,
    llm_checked_at timestamp with time zone,
    status text DEFAULT 'pending'::text NOT NULL,
    suppression_rule_id bigint,
    is_suppression_conflict integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.noise_candidates FORCE ROW LEVEL SECURITY;


--
-- Name: realtime_analysis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.realtime_analysis (
    id bigint NOT NULL,
    user_id text NOT NULL,
    log_id bigint NOT NULL,
    signal_type text NOT NULL,
    explanation text,
    cve_safe integer,
    cve_note text,
    analyzed_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.realtime_analysis FORCE ROW LEVEL SECURITY;


--
-- Name: realtime_analysis_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.realtime_analysis_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: realtime_analysis_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.realtime_analysis_id_seq OWNED BY public.realtime_analysis.id;


--
-- Name: user_ingest_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE SEQUENCE IF NOT EXISTS public.user_ingest_keys_id_seq;

CREATE TABLE public.user_ingest_keys (
    id bigint DEFAULT nextval('public.user_ingest_keys_id_seq'::regclass) NOT NULL,
    user_id text NOT NULL,
    api_key text NOT NULL,
    name text,
    expiry_days integer,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    last_used_at timestamp with time zone
);

ALTER SEQUENCE public.user_ingest_keys_id_seq OWNED BY public.user_ingest_keys.id;

ALTER TABLE ONLY public.user_ingest_keys FORCE ROW LEVEL SECURITY;


--
-- Name: user_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_settings (
    user_id text NOT NULL,
    log_retention_days integer DEFAULT 90 NOT NULL,
    audit_log_retention_enabled boolean DEFAULT true NOT NULL,
    audit_log_retention_days integer DEFAULT 365 NOT NULL,
    noise_auto_suppress text DEFAULT 'off'::text NOT NULL,
    noise_llm_enabled integer DEFAULT 1 NOT NULL,
    noise_llm_trigger text DEFAULT 'manual'::text NOT NULL,
    llm_model text DEFAULT 'phi-3.5-mini-q4'::text NOT NULL,
    llm_custom_model_path text,
    noise_min_score integer DEFAULT 40 NOT NULL,
    noise_learning_days integer DEFAULT 7 NOT NULL,
    noise_learning_events integer DEFAULT 10000 NOT NULL,
    kb_auto_update integer DEFAULT 1 NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.user_settings FORCE ROW LEVEL SECURITY;


--
-- Name: vuln_kb; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vuln_kb (
    id text NOT NULL,
    source text NOT NULL,
    cve_id text,
    title text,
    description text,
    severity text,
    cvss_score real,
    attack_patterns jsonb,
    affected_products jsonb,
    is_kev integer DEFAULT 0 NOT NULL,
    published_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now(),
    ingested_at timestamp with time zone DEFAULT now()
);


--
-- Name: wp_protection_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wp_protection_rules (
    id bigint NOT NULL,
    user_id text NOT NULL,
    rule_type text NOT NULL,
    pattern character varying(512) NOT NULL,
    action text DEFAULT 'block'::text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wp_protection_rules_action_check CHECK ((action = ANY (ARRAY['block'::text, 'log'::text]))),
    CONSTRAINT wp_protection_rules_rule_type_check CHECK ((rule_type = ANY (ARRAY['ip'::text, 'cidr'::text, 'ua'::text, 'uri'::text, 'rate'::text, 'action'::text, 'allow'::text])))
);

ALTER TABLE ONLY public.wp_protection_rules FORCE ROW LEVEL SECURITY;


--
-- Name: wp_protection_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wp_protection_rules_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wp_protection_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wp_protection_rules_id_seq OWNED BY public.wp_protection_rules.id;


--
-- Name: alerts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts ALTER COLUMN id SET DEFAULT nextval('public.alerts_id_seq'::regclass);


--
-- Name: audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('public.audit_log_id_seq'::regclass);


--
-- Name: cases id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases ALTER COLUMN id SET DEFAULT nextval('public.cases_id_seq'::regclass);


--
-- Name: detection_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detection_rules ALTER COLUMN id SET DEFAULT nextval('public.detection_rules_id_seq'::regclass);


--
-- Name: ingest_sources id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingest_sources ALTER COLUMN id SET DEFAULT nextval('public.ingest_sources_id_seq'::regclass);


--
-- Name: logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.logs ALTER COLUMN id SET DEFAULT nextval('public.logs_id_seq'::regclass);


--
-- Name: realtime_analysis id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.realtime_analysis ALTER COLUMN id SET DEFAULT nextval('public.realtime_analysis_id_seq'::regclass);


--
-- Name: wp_protection_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wp_protection_rules ALTER COLUMN id SET DEFAULT nextval('public.wp_protection_rules_id_seq'::regclass);


--
-- Name: alerts alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_pkey PRIMARY KEY (id);


--
-- Name: alerts alerts_dedup; Type: CONSTRAINT; Schema: public; Owner: -
-- Dedup key for detection.js ON CONFLICT: repeat events of the same rule +
-- event_id collapse into one alert (count++ / occurrence_times append).
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_dedup UNIQUE (user_id, rule_id, event_id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: case_alerts case_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_alerts
    ADD CONSTRAINT case_alerts_pkey PRIMARY KEY (case_id, alert_id);


--
-- Name: cases cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_pkey PRIMARY KEY (id);


--
-- Name: detection_rules detection_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detection_rules
    ADD CONSTRAINT detection_rules_pkey PRIMARY KEY (id);


--
-- Name: ingest_sources ingest_sources_name_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingest_sources
    ADD CONSTRAINT ingest_sources_name_user_id_key UNIQUE (name, user_id);


--
-- Name: ingest_sources ingest_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingest_sources
    ADD CONSTRAINT ingest_sources_pkey PRIMARY KEY (id);


--
-- Name: logs logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

-- Partitioned tables require the partition key in every unique/primary key, and
-- the constraint must propagate to partitions (no ONLY).
ALTER TABLE public.logs
    ADD CONSTRAINT logs_pkey PRIMARY KEY (id, "timestamp");


--
-- Name: noise_candidates noise_candidates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.noise_candidates
    ADD CONSTRAINT noise_candidates_pkey PRIMARY KEY (id);


--
-- Name: noise_candidates noise_candidates_user_id_field_signature_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.noise_candidates
    ADD CONSTRAINT noise_candidates_user_id_field_signature_key UNIQUE (user_id, field_signature);


--
-- Name: realtime_analysis realtime_analysis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.realtime_analysis
    ADD CONSTRAINT realtime_analysis_pkey PRIMARY KEY (id);


--
-- Name: realtime_analysis realtime_analysis_user_id_log_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.realtime_analysis
    ADD CONSTRAINT realtime_analysis_user_id_log_id_key UNIQUE (user_id, log_id);


--
-- Name: user_ingest_keys user_ingest_keys_api_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ingest_keys
    ADD CONSTRAINT user_ingest_keys_api_key_key UNIQUE (api_key);


--
-- Name: user_ingest_keys user_ingest_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ingest_keys
    ADD CONSTRAINT user_ingest_keys_pkey PRIMARY KEY (id);


--
-- Name: user_settings user_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_pkey PRIMARY KEY (user_id);


--
-- Name: vuln_kb vuln_kb_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vuln_kb
    ADD CONSTRAINT vuln_kb_pkey PRIMARY KEY (id);


--
-- Name: wp_protection_rules wp_protection_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wp_protection_rules
    ADD CONSTRAINT wp_protection_rules_pkey PRIMARY KEY (id);


--
-- Name: idx_alerts_user_last_seen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alerts_user_last_seen ON public.alerts USING btree (user_id, last_seen DESC);


--
-- Name: idx_user_ingest_keys_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_ingest_keys_user ON public.user_ingest_keys USING btree (user_id);


--
-- Name: idx_alerts_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_alerts_user_status ON public.alerts USING btree (user_id, status);


--
-- Name: idx_audit_log_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_user ON public.audit_log USING btree (user_id, created_at DESC);


--
-- Name: idx_detection_rules_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_detection_rules_user ON public.detection_rules USING btree (user_id);


--
-- Name: idx_ingest_sources_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ingest_sources_user ON public.ingest_sources USING btree (user_id);


--
-- Name: idx_logs_user_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logs_user_event_id ON public.logs USING btree (user_id, event_id);


--
-- Name: idx_logs_user_host; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logs_user_host ON public.logs USING btree (user_id, host);


--
-- Name: idx_logs_user_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logs_user_severity ON public.logs USING btree (user_id, severity);


--
-- Name: idx_logs_user_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_logs_user_timestamp ON public.logs USING btree (user_id, "timestamp" DESC);


--
-- Name: idx_logs_raw_json / idx_logs_search_text_trgm; Type: INDEX; Schema: public; Owner: -
-- Sigma Full Coverage Phase 4: raw-field containment + trigram keyword search.
-- Requires the pg_trgm extension.
--

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_logs_raw_json ON public.logs USING gin (raw_json);
CREATE INDEX idx_logs_search_text_trgm ON public.logs USING gin (search_text gin_trgm_ops);


--
-- Name: logs_ts_brin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX logs_ts_brin ON public.logs USING brin ("timestamp");


--
-- Name: idx_alerts_log_id; Type: INDEX; Schema: public; Owner: -
-- Replaces the dropped alerts.log_id FK's implicit lookup path.
--

CREATE INDEX idx_alerts_log_id ON public.alerts USING btree (log_id);


--
-- Name: idx_realtime_analysis_log_id; Type: INDEX; Schema: public; Owner: -
-- Replaces the dropped realtime_analysis.log_id FK's implicit lookup path.
--

CREATE INDEX idx_realtime_analysis_log_id ON public.realtime_analysis USING btree (log_id);


--
-- Name: idx_noise_candidates_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_noise_candidates_user_status ON public.noise_candidates USING btree (user_id, status);


--
-- Name: idx_realtime_analysis_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_realtime_analysis_user ON public.realtime_analysis USING btree (user_id, analyzed_at DESC);


--
-- Name: wp_protection_rules_user_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX wp_protection_rules_user_enabled ON public.wp_protection_rules USING btree (user_id, enabled);


-- NOTE: alerts.log_id -> logs(id) FK removed. logs is RANGE-partitioned, so its
-- primary key is (id, "timestamp") and id alone is not a UNIQUE target a FK can
-- reference. log_id stays a plain indexed column; integrity is enforced in-app.
-- See db/migrations/2026-09-05-logs-partitioning.sql.

--
-- Name: alerts alerts_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.detection_rules(id) ON DELETE SET NULL;


--
-- Name: case_alerts case_alerts_alert_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_alerts
    ADD CONSTRAINT case_alerts_alert_id_fkey FOREIGN KEY (alert_id) REFERENCES public.alerts(id) ON DELETE CASCADE;


--
-- Name: case_alerts case_alerts_case_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_alerts
    ADD CONSTRAINT case_alerts_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;


--
-- Name: noise_candidates noise_candidates_suppression_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.noise_candidates
    ADD CONSTRAINT noise_candidates_suppression_rule_id_fkey FOREIGN KEY (suppression_rule_id) REFERENCES public.detection_rules(id) ON DELETE SET NULL;


-- NOTE: realtime_analysis.log_id -> logs(id) FK removed (logs is partitioned;
-- see the alerts note above). The former ON DELETE CASCADE is replaced by
-- explicit cleanup: account deletion deletes realtime_analysis before logs, and
-- retention drops orphaned realtime_analysis rows. See routes/siem.js and
-- services/retentionCron.js.


--
-- Name: alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: cases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

--
-- Name: detection_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.detection_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: ingest_sources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ingest_sources ENABLE ROW LEVEL SECURITY;

--
-- Name: logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;

--
-- Name: noise_candidates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.noise_candidates ENABLE ROW LEVEL SECURITY;

--
-- Name: realtime_analysis; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.realtime_analysis ENABLE ROW LEVEL SECURITY;

--
-- Name: user_ingest_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_ingest_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: alerts user_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_isolation ON public.alerts USING ((user_id = current_setting('app.user_id'::text, true))) WITH CHECK ((user_id = current_setting('app.user_id'::text, true)));


--
-- Name: audit_log user_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_isolation ON public.audit_log USING ((user_id = current_setting('app.user_id'::text, true))) WITH CHECK ((user_id = current_setting('app.user_id'::text, true)));


--
-- Name: cases user_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_isolation ON public.cases USING ((user_id = current_setting('app.user_id'::text, true))) WITH CHECK ((user_id = current_setting('app.user_id'::text, true)));


--
-- Name: detection_rules user_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_isolation ON public.detection_rules USING ((user_id = current_setting('app.user_id'::text, true))) WITH CHECK ((user_id = current_setting('app.user_id'::text, true)));


--
-- Name: ingest_sources user_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_isolation ON public.ingest_sources USING ((user_id = current_setting('app.user_id'::text, true))) WITH CHECK ((user_id = current_setting('app.user_id'::text, true)));


--
-- Name: logs user_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_isolation ON public.logs USING ((user_id = current_setting('app.user_id'::text, true))) WITH CHECK ((user_id = current_setting('app.user_id'::text, true)));


--
-- Name: noise_candidates user_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_isolation ON public.noise_candidates USING ((user_id = current_setting('app.user_id'::text, true))) WITH CHECK ((user_id = current_setting('app.user_id'::text, true)));


--
-- Name: realtime_analysis user_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_isolation ON public.realtime_analysis USING ((user_id = current_setting('app.user_id'::text, true))) WITH CHECK ((user_id = current_setting('app.user_id'::text, true)));


--
-- Name: user_ingest_keys user_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_isolation ON public.user_ingest_keys USING ((user_id = current_setting('app.user_id'::text, true))) WITH CHECK ((user_id = current_setting('app.user_id'::text, true)));


--
-- Name: user_settings user_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_isolation ON public.user_settings USING ((user_id = current_setting('app.user_id'::text, true))) WITH CHECK ((user_id = current_setting('app.user_id'::text, true)));


--
-- Name: wp_protection_rules user_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_isolation ON public.wp_protection_rules USING ((user_id = current_setting('app.user_id'::text, true))) WITH CHECK ((user_id = current_setting('app.user_id'::text, true)));


--
-- Name: user_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: wp_protection_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wp_protection_rules ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict WibXmHwGdvMiaTZsihhmkKZXF1x45h6xz7ft0MC6IRnf7haeiI3sQrzWPTeVtMs


--
-- Bootstrap partitions for the RANGE-partitioned `logs` table (XDR Phase 0,
-- Task 0.2). Created after the table, PK, defaults, indexes and RLS above so
-- each PARTITION OF inherits them. Covers the current month plus the next two
-- so ingest works on day one; services/retentionCron.js (ensureLogPartitions)
-- keeps future months provisioned thereafter. logs_default catches any row
-- whose timestamp falls outside the created ranges.
--

DO $$
DECLARE
  m     date := date_trunc('month', now())::date;
  m_end date := (date_trunc('month', now()) + interval '3 month')::date;
  pname text;
BEGIN
  WHILE m < m_end LOOP
    pname := 'logs_y' || to_char(m, 'YYYY') || 'm' || to_char(m, 'MM');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.logs FOR VALUES FROM (%L) TO (%L)',
      pname, m, (m + interval '1 month')::date);
    m := (m + interval '1 month')::date;
  END LOOP;
END$$;

CREATE TABLE IF NOT EXISTS public.logs_default PARTITION OF public.logs DEFAULT;


--
-- Name: correlation_rules; Type: TABLE; Schema: public; Owner: -
-- XDR Phase 1: versioned JSON correlation rule documents. detection_rules stays
-- in place (read via a single_event compatibility shim); this table is additive.
--

CREATE SEQUENCE IF NOT EXISTS public.correlation_rules_id_seq
  START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

CREATE TABLE IF NOT EXISTS public.correlation_rules (
  id                bigint NOT NULL DEFAULT nextval('public.correlation_rules_id_seq'::regclass),
  user_id           text NOT NULL,
  name              text NOT NULL,
  description       text,
  rule              jsonb NOT NULL,
  severity          text DEFAULT 'high'::text,
  enabled           boolean DEFAULT true,
  version           integer DEFAULT 1 NOT NULL,
  attack_techniques text[] DEFAULT '{}'::text[] NOT NULL,
  created_at        timestamp with time zone DEFAULT now(),
  updated_at        timestamp with time zone DEFAULT now()
);

ALTER SEQUENCE public.correlation_rules_id_seq OWNED BY public.correlation_rules.id;

ALTER TABLE ONLY public.correlation_rules
  ADD CONSTRAINT correlation_rules_pkey PRIMARY KEY (id);

CREATE INDEX IF NOT EXISTS idx_correlation_rules_user ON public.correlation_rules USING btree (user_id);

ALTER TABLE public.correlation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.correlation_rules FORCE ROW LEVEL SECURITY;

CREATE POLICY user_isolation ON public.correlation_rules USING ((user_id = current_setting('app.user_id'::text, true))) WITH CHECK ((user_id = current_setting('app.user_id'::text, true)));


--
-- Name: correlation_state; Type: TABLE; Schema: public; Owner: -
-- XDR Phase 1: sliding-window state for stateful correlation rule types.
--

CREATE TABLE IF NOT EXISTS public.correlation_state (
  user_id      text NOT NULL,
  rule_id      bigint NOT NULL,
  state_key    text NOT NULL,
  window_start timestamp with time zone,
  counter      integer DEFAULT 0 NOT NULL,
  payload      jsonb DEFAULT '{}'::jsonb NOT NULL,
  updated_at   timestamp with time zone DEFAULT now()
);

ALTER TABLE ONLY public.correlation_state
  ADD CONSTRAINT correlation_state_pkey PRIMARY KEY (user_id, rule_id, state_key);

CREATE INDEX IF NOT EXISTS idx_correlation_state_updated ON public.correlation_state USING btree (updated_at);

ALTER TABLE ONLY public.correlation_state
  ADD CONSTRAINT correlation_state_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.correlation_rules(id) ON DELETE CASCADE;

ALTER TABLE public.correlation_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.correlation_state FORCE ROW LEVEL SECURITY;

CREATE POLICY user_isolation ON public.correlation_state USING ((user_id = current_setting('app.user_id'::text, true))) WITH CHECK ((user_id = current_setting('app.user_id'::text, true)));


--
-- alerts correlation columns wiring (XDR Phase 1): FK + dedup index. Placed here
-- because it references correlation_rules, created above. The columns themselves
-- are declared inline in the alerts table near the top of this file.
--

ALTER TABLE ONLY public.alerts
  ADD CONSTRAINT alerts_correlation_rule_id_fkey FOREIGN KEY (correlation_rule_id) REFERENCES public.correlation_rules(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS alerts_corr_dedup ON public.alerts (user_id, correlation_rule_id, group_key) WHERE correlation_rule_id IS NOT NULL;



--
-- Name: sigma_rules; Type: TABLE; Schema: public; Owner: -
-- Sigma Rule Library (Phase 1): GLOBAL catalog of converted SigmaHQ community
-- rules, shared across all users and refreshed by services/sigmaCron.js. Public
-- reference data, EXCLUDED from RLS like vuln_kb (no ENABLE ROW LEVEL SECURITY).
--

CREATE SEQUENCE IF NOT EXISTS public.sigma_rules_id_seq
  START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

CREATE TABLE IF NOT EXISTS public.sigma_rules (
  id                bigint PRIMARY KEY DEFAULT nextval('public.sigma_rules_id_seq'::regclass),
  sigma_id          text,
  identity          text NOT NULL UNIQUE,
  title             text,
  category          text NOT NULL,
  path              text NOT NULL,
  rule              jsonb,
  severity          text,
  attack_techniques text[] DEFAULT '{}'::text[] NOT NULL,
  convert_status    text NOT NULL,
  reject_reason     text,
  retired           boolean DEFAULT false NOT NULL,
  source_sha        text,
  sig_event_ids     integer[] DEFAULT '{}'::integer[] NOT NULL,
  sig_categories    text[] DEFAULT '{}'::text[] NOT NULL,
  sig_sources       text[] DEFAULT '{}'::text[] NOT NULL,
  -- Sigma Full Coverage Phase 6: exact | approximate (rejected rows are null).
  fidelity          text,
  updated_at        timestamp with time zone DEFAULT now()
);

ALTER SEQUENCE public.sigma_rules_id_seq OWNED BY public.sigma_rules.id;

CREATE INDEX IF NOT EXISTS idx_sigma_rules_category ON public.sigma_rules USING btree (category);
CREATE INDEX IF NOT EXISTS idx_sigma_rules_status   ON public.sigma_rules USING btree (convert_status);
CREATE INDEX IF NOT EXISTS idx_sigma_rules_retired  ON public.sigma_rules USING btree (retired);
CREATE INDEX IF NOT EXISTS idx_sigma_rules_sig_event_ids  ON public.sigma_rules USING gin (sig_event_ids);
CREATE INDEX IF NOT EXISTS idx_sigma_rules_sig_categories ON public.sigma_rules USING gin (sig_categories);
CREATE INDEX IF NOT EXISTS idx_sigma_rules_sig_sources    ON public.sigma_rules USING gin (sig_sources);
CREATE INDEX IF NOT EXISTS idx_sigma_rules_fidelity        ON public.sigma_rules USING btree (fidelity);


--
-- Name: sigma_sync_state; Type: TABLE; Schema: public; Owner: -
-- Sigma Rule Library (Phase 1): one row per catalog sync (status/history).
-- Global, excluded from RLS like sigma_rules.
--

CREATE SEQUENCE IF NOT EXISTS public.sigma_sync_state_id_seq
  START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

CREATE TABLE IF NOT EXISTS public.sigma_sync_state (
  id              bigint PRIMARY KEY DEFAULT nextval('public.sigma_sync_state_id_seq'::regclass),
  ref             text,
  source_sha      text,
  started_at      timestamp with time zone DEFAULT now(),
  finished_at     timestamp with time zone,
  total           integer DEFAULT 0 NOT NULL,
  converted       integer DEFAULT 0 NOT NULL,
  rejected        integer DEFAULT 0 NOT NULL,
  retired         integer DEFAULT 0 NOT NULL,
  category_counts jsonb,
  reject_reasons  jsonb,
  duration_ms     integer,
  error           text
);

ALTER SEQUENCE public.sigma_sync_state_id_seq OWNED BY public.sigma_sync_state.id;

CREATE INDEX IF NOT EXISTS idx_sigma_sync_state_started ON public.sigma_sync_state USING btree (started_at DESC);


--
-- Sigma Rule Library Phase 2: per-user enablement.
-- user_settings gains coarse toggles; sigma_rule_overrides is per-user (strict RLS);
-- alerts gains sigma_identity so a catalog rule can fire a deduped alert.
--

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS sigma_enabled_categories text[] DEFAULT '{}'::text[] NOT NULL;
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS sigma_auto_update boolean DEFAULT true NOT NULL;

CREATE TABLE IF NOT EXISTS public.sigma_rule_overrides (
  user_id        text NOT NULL,
  sigma_identity text NOT NULL,
  enabled        boolean,
  severity       text,
  updated_at     timestamp with time zone DEFAULT now(),
  PRIMARY KEY (user_id, sigma_identity)
);

ALTER TABLE public.sigma_rule_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.sigma_rule_overrides FORCE ROW LEVEL SECURITY;

CREATE POLICY user_isolation ON public.sigma_rule_overrides USING ((user_id = current_setting('app.user_id'::text, true))) WITH CHECK ((user_id = current_setting('app.user_id'::text, true)));

ALTER TABLE public.alerts ADD COLUMN IF NOT EXISTS sigma_identity text;

CREATE UNIQUE INDEX IF NOT EXISTS alerts_sigma_dedup ON public.alerts (user_id, sigma_identity, group_key) WHERE sigma_identity IS NOT NULL;
