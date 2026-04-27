-- SQLite schema — kept in sync with PostgreSQL schema.
-- Uses IF NOT EXISTS so this file is safe to run on an existing database (migrations via new columns).

CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  source TEXT,
  host TEXT,
  source_ip TEXT,
  dest_ip TEXT,
  dest_port INTEGER,
  protocol TEXT,
  timestamp DATETIME,
  ingested_at DATETIME DEFAULT (datetime('now')),
  level TEXT,
  severity TEXT,
  event_id INTEGER,
  event_category TEXT,
  message TEXT,
  username TEXT,
  domain TEXT,
  logon_type INTEGER,
  process_name TEXT,
  process_id INTEGER,
  process_guid TEXT,
  parent_process_name TEXT,
  parent_process_id INTEGER,
  parent_process_guid TEXT,
  file_path TEXT,
  registry_key TEXT,
  raw TEXT
);

CREATE TABLE IF NOT EXISTS detection_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  severity TEXT DEFAULT 'high',
  enabled INTEGER DEFAULT 1,
  match_event_id INTEGER,
  match_category TEXT,
  match_severity TEXT,
  match_username TEXT,
  match_host TEXT,
  match_message TEXT,
  match_process TEXT,
  match_src_ip TEXT,
  match_dest_ip TEXT,
  match_dest_port INTEGER,
  action TEXT DEFAULT 'alert',
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  rule_id INTEGER REFERENCES detection_rules(id) ON DELETE SET NULL,
  log_id INTEGER REFERENCES logs(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT DEFAULT 'new',
  host TEXT,
  source_ip TEXT,
  username TEXT,
  event_id INTEGER,
  message TEXT,
  count INTEGER NOT NULL DEFAULT 1,
  last_seen DATETIME DEFAULT (datetime('now')),
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  severity TEXT DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  description TEXT,
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS case_alerts (
  case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  alert_id INTEGER NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  added_at DATETIME DEFAULT (datetime('now')),
  PRIMARY KEY (case_id, alert_id)
);

CREATE TABLE IF NOT EXISTS noise_candidates (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,
  field_signature TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  confidence TEXT NOT NULL DEFAULT 'low',
  daily_avg REAL,
  first_seen DATETIME,
  last_seen DATETIME,
  event_count INTEGER,
  llm_explanation TEXT,
  llm_cve_safe INTEGER,
  llm_cve_note TEXT,
  llm_checked_at DATETIME,
  status TEXT NOT NULL DEFAULT 'pending',
  suppression_rule_id INTEGER REFERENCES detection_rules(id) ON DELETE SET NULL,
  is_suppression_conflict INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  UNIQUE(user_id, field_signature)
);

CREATE TABLE IF NOT EXISTS realtime_analysis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  log_id INTEGER NOT NULL REFERENCES logs(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL,
  explanation TEXT,
  cve_safe INTEGER,
  cve_note TEXT,
  analyzed_at DATETIME DEFAULT (datetime('now')),
  UNIQUE(user_id, log_id)
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,
  log_retention_days INTEGER NOT NULL DEFAULT 90,
  audit_log_retention_enabled INTEGER NOT NULL DEFAULT 1,
  audit_log_retention_days INTEGER NOT NULL DEFAULT 365,
  noise_auto_suppress TEXT NOT NULL DEFAULT 'off',
  noise_llm_enabled INTEGER NOT NULL DEFAULT 1,
  noise_llm_trigger TEXT NOT NULL DEFAULT 'manual',
  llm_model TEXT NOT NULL DEFAULT 'phi-3.5-mini-q4',
  llm_custom_model_path TEXT,
  noise_min_score INTEGER NOT NULL DEFAULT 40,
  noise_learning_days INTEGER NOT NULL DEFAULT 7,
  noise_learning_events INTEGER NOT NULL DEFAULT 10000,
  kb_auto_update INTEGER NOT NULL DEFAULT 1,
  updated_at DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ingest_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT,
  last_seen DATETIME DEFAULT (datetime('now')),
  event_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(name, user_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  action TEXT NOT NULL,
  meta TEXT,
  ip TEXT,
  row_hash TEXT,
  created_at DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vuln_kb (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  cve_id TEXT,
  title TEXT,
  description TEXT,
  severity TEXT,
  cvss_score REAL,
  attack_patterns TEXT,
  affected_products TEXT,
  is_kev INTEGER NOT NULL DEFAULT 0,
  published_at DATETIME,
  updated_at DATETIME DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_logs_user_timestamp ON logs(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_user_severity ON logs(user_id, severity);
CREATE INDEX IF NOT EXISTS idx_logs_user_event_id ON logs(user_id, event_id);
CREATE INDEX IF NOT EXISTS idx_logs_user_host ON logs(user_id, host);
CREATE INDEX IF NOT EXISTS idx_alerts_user_status ON alerts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_alerts_user_last_seen ON alerts(user_id, last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_detection_rules_user ON detection_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_noise_candidates_user_status ON noise_candidates(user_id, status);
CREATE INDEX IF NOT EXISTS idx_realtime_analysis_user ON realtime_analysis(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingest_sources_user ON ingest_sources(user_id);
