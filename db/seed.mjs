/**
 * Synthetic SIEM seed — populates logs, detection_rules, alerts, cases (+ links)
 * and realtime_analysis for a single user so the SIEM dashboard renders locally.
 *
 * Usage:
 *   SEED_USER_ID='auth0|xxxxxxxx' npm run db:seed             # add data
 *   SEED_USER_ID='auth0|xxxxxxxx' npm run db:seed -- --reset  # wipe this user's seed data first
 *
 * SEED_USER_ID must be YOUR Auth0 `sub` (see db/README.md for how to find it),
 * otherwise the rows won't be visible to your logged-in account.
 *
 * Column lists mirror the app's own INSERT statements (routes/ingest.js, siem.js,
 * services/detection.js). Load db/schema.sql first. Run against a local DB whose
 * role owns the tables / bypasses RLS (the default `postgres` superuser does).
 */
import 'dotenv/config';
import pg from 'pg';

const userId = process.env.SEED_USER_ID || process.argv.find(a => a.startsWith('auth0') || a.includes('|'));
if (!userId) {
  console.error('ERROR: set SEED_USER_ID to your Auth0 sub, e.g. SEED_USER_ID="auth0|abc123" node db/seed.js');
  process.exit(1);
}
const reset = process.argv.includes('--reset');

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL not set (check your .env).');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const now = Date.now();
const daysAgo = (d) => new Date(now - d * 86400000);
const hoursAgo = (h) => new Date(now - h * 3600000);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

const HOSTS = ['WIN-DC01', 'WIN-WKS07', 'WEB-APP02', 'DB-CORE01', 'FW-EDGE'];
const USERS = ['administrator', 'jsmith', 'svc_backup', 'root', 'guest'];
const SRC_IPS = ['10.0.0.14', '192.168.1.55', '203.0.113.9', '198.51.100.23', '172.16.4.8'];
const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];

// A few representative log templates across common sources
const LOG_TEMPLATES = [
  { source: 'sysmon', event_category: 'process', event_id: 1, level: 'info',
    message: 'Process created: powershell.exe -enc <base64>',
    process_name: 'powershell.exe', parent_process_name: 'winword.exe' },
  { source: 'security', event_category: 'authentication', event_id: 4625, level: 'warning',
    message: 'An account failed to log on (bad password)',
    process_name: 'lsass.exe', parent_process_name: 'services.exe' },
  { source: 'security', event_category: 'authentication', event_id: 4624, level: 'info',
    message: 'An account was successfully logged on',
    process_name: 'winlogon.exe', parent_process_name: 'services.exe' },
  { source: 'firewall', event_category: 'network', event_id: null, level: 'warning',
    message: 'Blocked inbound connection to port 3389 (RDP)',
    process_name: null, parent_process_name: null },
  { source: 'sysmon', event_category: 'network', event_id: 3, level: 'info',
    message: 'Network connection: rundll32.exe -> 203.0.113.9:443',
    process_name: 'rundll32.exe', parent_process_name: 'explorer.exe' },
];

const RULES = [
  { name: 'Failed logon burst', description: '5+ failed logons (4625) from one host', action: 'alert',
    match_category: 'authentication', match_event_id: 4625, match_process: null, match_username: null },
  { name: 'Encoded PowerShell', description: 'powershell.exe with -enc / -EncodedCommand', action: 'alert',
    match_category: 'process', match_event_id: 1, match_process: 'powershell.exe', match_username: null },
  { name: 'Office spawns shell', description: 'Word/Excel spawning a command interpreter', action: 'alert',
    match_category: 'process', match_event_id: 1, match_process: 'powershell.exe', match_username: null },
  { name: 'RDP from external', description: 'Inbound RDP blocked at the edge firewall', action: 'alert',
    match_category: 'network', match_event_id: null, match_process: null, match_username: null },
  { name: 'Service account interactive logon', description: 'svc_* account logging on interactively', action: 'flag',
    match_category: 'authentication', match_event_id: 4624, match_process: null, match_username: 'svc_backup' },
  { name: 'LSASS access', description: 'Suspicious handle to lsass.exe', action: 'alert',
    match_category: 'process', match_event_id: 10, match_process: 'lsass.exe', match_username: null },
];

async function main() {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    if (reset) {
      await c.query('DELETE FROM case_alerts WHERE case_id IN (SELECT id FROM cases WHERE user_id = $1)', [userId]);
      for (const t of ['realtime_analysis', 'alerts', 'cases', 'detection_rules', 'logs']) {
        await c.query(`DELETE FROM ${t} WHERE user_id = $1`, [userId]);
      }
      console.log(`Reset: cleared seed data for ${userId}`);
    }

    // Detection rules
    const ruleIds = [];
    for (const r of RULES) {
      const { rows } = await c.query(
        `INSERT INTO detection_rules (user_id, name, description, action, enabled, match_category, match_event_id, match_process, match_username)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [userId, r.name, r.description, r.action, true, r.match_category, r.match_event_id, r.match_process, r.match_username]
      );
      ruleIds.push(rows[0].id);
    }

    // Logs (spread across the last 7 days)
    const logIds = [];
    for (let i = 0; i < 60; i++) {
      const t = pick(LOG_TEMPLATES);
      const ts = hoursAgo(randInt(0, 24 * 7));
      const host = pick(HOSTS);
      const username = pick(USERS);
      const src = pick(SRC_IPS);
      const severity = t.event_id === 4625 ? pick(['high', 'medium']) : pick(SEVERITIES);
      const raw = { _seed: true, source: t.source, host, event_id: t.event_id, message: t.message };
      const { rows } = await c.query(
        `INSERT INTO logs (
           source, host, source_ip, dest_ip, dest_port, protocol,
           "timestamp", level, severity, event_id, event_category,
           message, username, domain, logon_type,
           process_name, process_id, process_guid,
           parent_process_name, parent_process_id, parent_process_guid,
           file_path, registry_key, raw, user_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
         RETURNING id`,
        [
          t.source, host, src, '10.0.0.1', t.source === 'firewall' ? 3389 : null, t.event_category === 'network' ? 'tcp' : null,
          ts, t.level, severity, t.event_id, t.event_category,
          t.message, username, 'CORP', t.event_id === 4625 ? 3 : null,
          t.process_name, t.process_name ? randInt(1000, 9000) : null, null,
          t.parent_process_name, t.parent_process_name ? randInt(500, 999) : null, null,
          null, null, JSON.stringify(raw), userId,
        ]
      );
      logIds.push({ id: rows[0].id, host, src, username, severity, event_id: t.event_id, message: t.message, ts });
    }

    // Alerts (reference some logs + rules)
    const alertIds = [];
    const alertCount = 14;
    for (let i = 0; i < alertCount; i++) {
      const lg = pick(logIds);
      const ruleId = pick(ruleIds);
      const severity = pick(['critical', 'high', 'high', 'medium', 'medium', 'low']);
      const title = pick([
        'Failed logon burst on ' + lg.host,
        'Encoded PowerShell on ' + lg.host,
        'Office process spawned a shell',
        'External RDP attempt blocked',
        'Suspicious LSASS access',
      ]);
      // Deduplicated alerts carry one timestamp per occurrence, oldest first,
      // ending at last_seen. The UI lists these in the alert's Time section.
      const count = randInt(1, 12);
      const lastSeen = hoursAgo(randInt(0, 72));
      // Walk backwards from last_seen with a cumulative random gap so the
      // stored array is strictly chronological (oldest first).
      const occurrenceTimes = [];
      let cursor = new Date(lastSeen).getTime();
      for (let k = 0; k < count; k++) {
        occurrenceTimes.unshift(new Date(cursor));
        cursor -= randInt(2, 45) * 60 * 1000;
      }
      const { rows } = await c.query(
        `INSERT INTO alerts (user_id, rule_id, log_id, title, severity, host, source_ip, username, event_id, message, count, last_seen, occurrence_times)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [userId, ruleId, lg.id, title, severity, lg.host, lg.src, lg.username, lg.event_id, lg.message, count, lastSeen, occurrenceTimes]
      );
      alertIds.push(rows[0].id);
    }

    // Cases (link a few alerts each)
    const CASES = [
      { title: 'Suspected credential stuffing — WIN-DC01', description: 'Cluster of failed logons followed by a success. Investigating source IPs.', severity: 'high' },
      { title: 'Phishing-driven PowerShell execution', description: 'Word spawned encoded PowerShell on a workstation. Checking for persistence.', severity: 'critical' },
      { title: 'External RDP exposure review', description: 'Repeated blocked RDP from external addresses. Confirm edge firewall policy.', severity: 'medium' },
    ];
    let ai = 0;
    for (const cs of CASES) {
      const { rows } = await c.query(
        `INSERT INTO cases (user_id, title, description, severity) VALUES ($1,$2,$3,$4) RETURNING id`,
        [userId, cs.title, cs.description, cs.severity]
      );
      const caseId = rows[0].id;
      for (let k = 0; k < randInt(2, 4) && ai < alertIds.length; k++, ai++) {
        await c.query(`INSERT INTO case_alerts (case_id, alert_id) VALUES ($1,$2)`, [caseId, alertIds[ai]]);
      }
    }

    // A couple of realtime analysis rows
    for (let i = 0; i < 3; i++) {
      const lg = pick(logIds);
      await c.query(
        `INSERT INTO realtime_analysis (user_id, log_id, signal_type, explanation, cve_safe, cve_note)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [userId, lg.id, pick(['suspicious', 'informational', 'malicious']),
         'Automated triage: ' + lg.message, 1, null]  // cve_safe is integer (0/1)
      );
    }

    await c.query('COMMIT');
    console.log(`Seeded for ${userId}: ${RULES.length} rules, ${logIds.length} logs, ${alertIds.length} alerts, ${CASES.length} cases.`);
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('Seed failed (roll back). If a column type mismatched, reconcile with db/schema.sql:\n', e.message);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
}

main();
