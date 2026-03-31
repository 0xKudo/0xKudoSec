-- docs/schema.sql

CREATE TABLE IF NOT EXISTS logs (
  id               BIGSERIAL PRIMARY KEY,
  source           VARCHAR(32),
  host             VARCHAR(255),
  source_ip        INET,
  dest_ip          INET,
  dest_port        INTEGER,
  protocol         VARCHAR(16),
  timestamp        TIMESTAMPTZ,
  ingested_at      TIMESTAMPTZ DEFAULT NOW(),
  level            VARCHAR(16),
  severity         VARCHAR(16),
  event_id         INTEGER,
  event_category   VARCHAR(64),
  message          TEXT,
  username         VARCHAR(255),
  domain           VARCHAR(255),
  logon_type       INTEGER,
  process_name     VARCHAR(255),
  process_id       INTEGER,
  parent_process_name VARCHAR(255),
  file_path        TEXT,
  registry_key     TEXT,
  raw              JSONB,
  search_vector    TSVECTOR
);

CREATE INDEX IF NOT EXISTS logs_timestamp_idx        ON logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS logs_severity_idx         ON logs (severity);
CREATE INDEX IF NOT EXISTS logs_source_idx           ON logs (source);
CREATE INDEX IF NOT EXISTS logs_event_id_idx         ON logs (event_id);
CREATE INDEX IF NOT EXISTS logs_event_category_idx   ON logs (event_category);
CREATE INDEX IF NOT EXISTS logs_username_idx         ON logs (username);
CREATE INDEX IF NOT EXISTS logs_host_idx             ON logs (host);
CREATE INDEX IF NOT EXISTS logs_dest_ip_idx          ON logs (dest_ip);
CREATE INDEX IF NOT EXISTS logs_dest_port_idx        ON logs (dest_port);
CREATE INDEX IF NOT EXISTS logs_process_name_idx     ON logs (process_name);
CREATE INDEX IF NOT EXISTS logs_search_vector_idx    ON logs USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS logs_raw_idx              ON logs USING GIN (raw);

CREATE OR REPLACE FUNCTION logs_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.message, '') || ' ' ||
    coalesce(NEW.event_category, '') || ' ' ||
    coalesce(NEW.username, '') || ' ' ||
    coalesce(NEW.process_name, '') || ' ' ||
    coalesce(NEW.host, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS logs_search_vector_trigger ON logs;
CREATE TRIGGER logs_search_vector_trigger
  BEFORE INSERT OR UPDATE ON logs
  FOR EACH ROW EXECUTE FUNCTION logs_search_vector_update();

CREATE TABLE IF NOT EXISTS ingest_sources (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255) UNIQUE NOT NULL,
  type        VARCHAR(32),
  last_seen   TIMESTAMPTZ,
  event_count BIGINT DEFAULT 0
);
