// platform/server/services/ingest/normalizeEvent.js

const SEVERITY_MAP = {
  critical: 'critical',
  error: 'high',
  warning: 'medium',
  warn: 'medium',
  information: 'info',
  informational: 'info',
  info: 'info',
  debug: 'info',
  verbose: 'info',
};

// Windows Event IDs that are always high severity regardless of level
const HIGH_SEVERITY_EVENT_IDS = new Set([
  4625, // Failed login
  4648, // Explicit credential login
  4719, // System audit policy changed
  4720, // User account created
  4728, // Member added to security group
  4732, // Member added to local group
  4756, // Member added to universal group
  4776, // Credential validation
  4946, // Firewall rule added
  1102, // Audit log cleared
]);

function normalizeSeverity(level, eventId) {
  if (eventId && HIGH_SEVERITY_EVENT_IDS.has(Number(eventId))) return 'high';
  return SEVERITY_MAP[String(level || '').toLowerCase()] || 'info';
}

function first(arr) {
  return Array.isArray(arr) ? arr[0] : arr;
}

export function normalizeEvent(raw) {
  const w = raw.winlog || {};
  const ed = w.event_data || {};
  const ev = raw.event || {};
  const host = raw.host || {};
  const net = raw.network || {};
  const proc = raw.process || {};
  const parentProc = proc.parent || {};
  const file = raw.file || {};
  const registry = raw.registry || {};
  const user = raw.user || {};

  const eventId = w.event_id || ev.code || null;
  const level = raw['log.level'] || ev.severity || first(ev.type) || null;

  return {
    source: raw.agent?.type || 'winlogbeat',
    host: host.name || null,
    source_ip: first(host.ip) || null,
    dest_ip: net.destination?.ip || raw['destination.ip'] || null,
    dest_port: net.destination?.port || raw['destination.port'] || null,
    protocol: net.transport || net.protocol || null,
    timestamp: raw['@timestamp'] || null,
    level: String(level || '').toLowerCase() || null,
    severity: normalizeSeverity(level, eventId),
    event_id: eventId ? Number(eventId) : null,
    event_category: first(ev.category) || w.channel || null,
    message: raw.message || ev.original || null,
    username: ed.SubjectUserName || ed.TargetUserName || user.name || null,
    domain: ed.SubjectDomainName || ed.TargetDomainName || user.domain || null,
    logon_type: ed.LogonType ? Number(ed.LogonType) : null,
    process_name: proc.name || ed.ProcessName || null,
    process_id: proc.pid ? Number(proc.pid) : null,
    parent_process_name: parentProc.name || ed.ParentProcessName || null,
    file_path: file.path || ed.ObjectName || null,
    registry_key: registry.path || ed.ObjectName || null,
    raw,
  };
}
