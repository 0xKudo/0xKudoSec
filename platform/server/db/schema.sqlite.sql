CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  source TEXT,
  severity TEXT,
  message TEXT,
  raw TEXT,
  timestamp DATETIME DEFAULT (datetime('now')),
  process_name TEXT,
  event_id INTEGER,
  hostname TEXT,
  username TEXT,
  file_path TEXT,
  registry_key TEXT,
  network_dst TEXT,
  network_port INTEGER,
  parent_process TEXT,
  hash TEXT,
  last_seen DATETIME,
  count INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  rule_id INTEGER,
  rule_name TEXT,
  severity TEXT,
  status TEXT DEFAULT 'open',
  log_id INTEGER,
  created_at DATETIME DEFAULT (datetime('now')),
  last_seen DATETIME DEFAULT (datetime('now')),
  count INTEGER DEFAULT 1,
  suppressed INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  title TEXT,
  severity TEXT,
  status TEXT DEFAULT 'open',
  description TEXT,
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS case_alerts (
  case_id INTEGER REFERENCES cases(id),
  alert_id INTEGER REFERENCES alerts(id),
  PRIMARY KEY (case_id, alert_id)
);

CREATE TABLE IF NOT EXISTS detection_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  name TEXT,
  description TEXT,
  severity TEXT,
  enabled INTEGER DEFAULT 1,
  rule_type TEXT,
  match_conditions TEXT,
  action TEXT DEFAULT 'alert',
  created_at DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS noise_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  field_signature TEXT,
  event_count INTEGER,
  status TEXT DEFAULT 'pending',
  llm_safe INTEGER,
  llm_explanation TEXT,
  llm_cve_note TEXT,
  is_suppression_conflict INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS realtime_analysis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  log_id INTEGER,
  signal_type TEXT,
  explanation TEXT,
  cve_safe INTEGER,
  cve_note TEXT,
  created_at DATETIME DEFAULT (datetime('now')),
  UNIQUE(user_id, log_id)
);

CREATE TABLE IF NOT EXISTS vuln_kb (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT,
  cve_id TEXT,
  title TEXT,
  description TEXT,
  severity TEXT,
  cvss_score REAL,
  attack_patterns TEXT,
  affected_products TEXT,
  is_kev INTEGER DEFAULT 0,
  published_at DATETIME,
  updated_at DATETIME DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_logs_user_timestamp ON logs(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_logs_severity ON logs(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_user_status ON alerts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_detection_rules_user ON detection_rules(user_id);
