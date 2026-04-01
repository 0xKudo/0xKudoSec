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

// Map Windows event IDs to human-readable categories
const EVENT_ID_CATEGORY = {
  // Authentication
  4624: 'authentication', 4625: 'authentication', 4634: 'authentication',
  4647: 'authentication', 4648: 'authentication', 4672: 'authentication',
  4776: 'authentication', 4768: 'authentication', 4769: 'authentication',
  4771: 'authentication',
  // Account management
  4720: 'account', 4722: 'account', 4723: 'account', 4724: 'account',
  4725: 'account', 4726: 'account', 4728: 'account', 4732: 'account',
  4756: 'account', 4738: 'account',
  // Policy
  4719: 'policy', 4946: 'policy', 4947: 'policy', 1102: 'policy',
  // Process
  4688: 'process', 4689: 'process', 1: 'process', 5: 'process',
  // Network
  3: 'network', 5156: 'network', 5158: 'network', 5152: 'network',
  5154: 'network', 5157: 'network',
  // File
  4663: 'file', 4656: 'file', 11: 'file', 23: 'file',
  // Registry
  4657: 'registry', 12: 'registry', 13: 'registry', 14: 'registry',
  // Firewall
  2004: 'firewall', 2005: 'firewall', 2006: 'firewall',
  // System
  7045: 'system', 7036: 'system', 7040: 'system', 4697: 'system',
  19: 'system', 20: 'system', 21: 'system',
  // DNS
  22: 'dns',
};

function categoryFromEventId(eventId) {
  return eventId ? (EVENT_ID_CATEGORY[Number(eventId)] || null) : null;
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
    source_ip: net.source?.ip || ed.SourceIp || ed.SourceAddress || ed.IpAddress || first(host.ip) || null,
    dest_ip: net.destination?.ip || ed.DestinationIp || ed.DestAddress || ed.DestinationAddress || raw['destination.ip'] || null,
    dest_port: net.destination?.port ? Number(net.destination.port) : (ed.DestinationPort ? Number(ed.DestinationPort) : (ed.DestPort ? Number(ed.DestPort) : null)),
    protocol: net.transport || net.protocol || ed.Protocol || null,
    timestamp: raw['@timestamp'] || null,
    level: String(level || '').toLowerCase() || null,
    severity: normalizeSeverity(level, eventId),
    event_id: eventId ? Number(eventId) : null,
    event_category: categoryFromEventId(eventId) || null,
    message: raw.message || ev.original || null,
    username: ed.SubjectUserName || ed.TargetUserName || user.name || null,
    domain: ed.SubjectDomainName || ed.TargetDomainName || user.domain || null,
    logon_type: ed.LogonType ? Number(ed.LogonType) : null,
    process_name: proc.name || ed.Image || ed.ProcessName || null,
    process_id: proc.pid ? Number(proc.pid) : null,
    parent_process_name: parentProc.name || ed.ParentProcessName || null,
    file_path: file.path || ed.ObjectName || null,
    registry_key: registry.path || ed.ObjectName || null,
    raw,
  };
}
