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

// --- Fluent Bit winlog input field extractors ---

// Security channel network events (5156, 5157, 5158) embed fields in StringInserts.
// 5156/5157: [pid, appName, direction, srcIP, srcPort, dstIP, dstPort, protocol, ...]
// 5158:      [pid, appName, srcAddr, srcPort, protocol, ...]
function fluentBitNetworkFields(eventId, inserts) {
  if (!Array.isArray(inserts)) return {};
  const id = Number(eventId);
  if (id === 5156 || id === 5157) {
    return {
      source_ip: inserts[3] || null,
      source_port: inserts[4] ? Number(inserts[4]) : null,
      dest_ip: inserts[5] || null,
      dest_port: inserts[6] ? Number(inserts[6]) : null,
      protocol: inserts[7] || null,
      process_id: inserts[0] ? Number(inserts[0]) : null,
      process_name: inserts[1] || null,
    };
  }
  if (id === 5158) {
    return {
      source_ip: inserts[2] || null,
      dest_ip: null,
      dest_port: null,
      protocol: inserts[4] || null,
      process_id: inserts[0] ? Number(inserts[0]) : null,
      process_name: inserts[1] || null,
    };
  }
  return {};
}

// Map Fluent Bit EventType strings to our severity levels.
// SuccessAudit/FailureAudit are audit result types, not severity — treat them as info
// and let the HIGH_SEVERITY_EVENT_IDS override handle promotion.
const FLUENT_BIT_EVENTTYPE_MAP = {
  error: 'high',
  warning: 'medium',
  warningaudit: 'medium',
  failureaudit: 'medium',
  successaudit: 'info',
  information: 'info',
  verbose: 'info',
};

// Sysmon events via Fluent Bit winevtlog input.
// All structured data is in StringInserts at fixed positions per event ID.
// Confirmed from live winevtlog Event ID 1 sample.
//
// Event ID 1 (Process Create) StringInserts positions:
//   [0]=RuleName, [1]=UtcTime, [2]=ProcessGuid, [3]=ProcessId, [4]=Image,
//   [5]=FileVersion, [6]=Description, [7]=Product, [8]=Company, [9]=OriginalFileName,
//   [10]=CommandLine, [11]=CurrentDirectory, [12]=User, [13]=LogonGuid,
//   [14]=LogonId, [15]=TerminalSessionId, [16]=IntegrityLevel, [17]=Hashes,
//   [18]=ParentProcessGuid, [19]=ParentProcessId, [20]=ParentImage,
//   [21]=ParentCommandLine, [22]=ParentUser
//
// Event ID 3 (Network Connect) StringInserts positions (confirmed from Sysmon docs):
//   [0]=RuleName, [1]=UtcTime, [2]=ProcessGuid, [3]=ProcessId, [4]=Image,
//   [5]=User, [6]=Protocol, [7]=Initiated, [8]=SourceIsIpv6, [9]=SourceIp,
//   [10]=SourceHostname, [11]=SourcePort, [12]=SourcePortName, [13]=DestIsIpv6,
//   [14]=DestinationIp, [15]=DestinationHostname, [16]=DestinationPort, [17]=DestinationPortName
//
// Event ID 11 (File Create): [4]=Image, [5]=TargetFilename, [12]=User (approx)
// Event ID 13 (Registry Set): [4]=Image, [5]=TargetObject, [6]=Details
function fluentBitSysmonFields(eventId, inserts) {
  if (!Array.isArray(inserts)) return {};
  const id = Number(eventId);

  if (id === 1) {
    const user = inserts[12] || null;
    const [domain, username] = user ? user.split('\\') : [null, null];
    return {
      process_id: inserts[3] ? Number(inserts[3]) : null,
      process_name: inserts[4] || null,
      process_guid: inserts[2] || null,
      parent_process_id: inserts[19] ? Number(inserts[19]) : null,
      parent_process_name: inserts[20] || null,
      parent_process_guid: inserts[18] || null,
      username: username || user || null,
      domain: domain || null,
      source_ip: null, dest_ip: null, dest_port: null, protocol: null,
      file_path: null, registry_key: null,
    };
  }

  // Event ID 5 (Process Terminate): [0]=RuleName,[1]=UtcTime,[2]=ProcessGuid,[3]=ProcessId,[4]=Image,[5]=User
  if (id === 5) {
    const user = inserts[5] || null;
    const [domain, username] = user ? user.split('\\') : [null, null];
    return {
      process_id: inserts[3] ? Number(inserts[3]) : null,
      process_name: inserts[4] || null,
      process_guid: inserts[2] || null,
      username: username || user || null,
      domain: domain || null,
      source_ip: null, dest_ip: null, dest_port: null, protocol: null,
      parent_process_name: null, parent_process_id: null, parent_process_guid: null,
      file_path: null, registry_key: null,
    };
  }

  if (id === 3) {
    const user = inserts[5] || null;
    const [domain, username] = user ? user.split('\\') : [null, null];
    return {
      process_id: inserts[3] ? Number(inserts[3]) : null,
      process_name: inserts[4] || null,
      process_guid: inserts[2] || null,
      username: username || user || null,
      domain: domain || null,
      protocol: inserts[6] || null,
      source_ip: inserts[9] || null,
      dest_ip: inserts[14] || null,
      dest_port: inserts[16] ? Number(inserts[16]) : null,
      parent_process_name: null, file_path: null, registry_key: null,
    };
  }

  if (id === 11) {
    // [0]=RuleName,[1]=UtcTime,[2]=ProcessGuid,[3]=ProcessId,[4]=Image,[5]=TargetFilename,[6]=CreationUtcTime,[7]=User
    const user11 = inserts[7] || null;
    const [domain11, username11] = user11 ? user11.split('\\') : [null, null];
    return {
      process_id: inserts[3] ? Number(inserts[3]) : null,
      process_name: inserts[4] || null,
      file_path: inserts[5] || null,
      username: username11 || user11 || null,
      domain: domain11 || null,
      source_ip: null, dest_ip: null, dest_port: null, protocol: null,
      parent_process_name: null, registry_key: null,
    };
  }

  if (id === 13) {
    // [0]=RuleName,[1]=EventType,[2]=UtcTime,[3]=ProcessGuid,[4]=ProcessId,
    // [5]=Image,[6]=TargetObject,[7]=Details,[8]=User
    const user13 = inserts[8] || null;
    const [domain13, username13] = user13 ? user13.split('\\') : [null, null];
    return {
      process_id: inserts[4] ? Number(inserts[4]) : null,
      process_name: inserts[5] || null,
      registry_key: inserts[6] || null,
      username: username13 || user13 || null,
      domain: domain13 || null,
      source_ip: null, dest_ip: null, dest_port: null, protocol: null,
      parent_process_name: null, file_path: null,
    };
  }

  return {};
}

function normalizeFluentBit(raw) {
  const eventId = raw.EventID;
  const channel = raw.Channel || '';
  const isSysmon = channel.toLowerCase().includes('sysmon') && raw.ProviderName === 'Microsoft-Windows-Sysmon';

  // winevtlog uses Level (number) instead of EventType (string)
  // Level: 1=critical, 2=error, 3=warning, 4=information, 5=verbose
  const levelNum = raw.Level;
  const eventType = raw.EventType; // winlog plugin (fallback)
  let severityLevel;
  if (levelNum !== undefined) {
    const LEVEL_MAP = { 1: 'critical', 2: 'high', 3: 'medium', 4: 'info', 5: 'info' };
    severityLevel = LEVEL_MAP[levelNum] || 'info';
  } else {
    severityLevel = FLUENT_BIT_EVENTTYPE_MAP[String(eventType || '').toLowerCase()] || 'info';
  }
  if (eventId && HIGH_SEVERITY_EVENT_IDS.has(Number(eventId))) severityLevel = 'high';

  let fields = {};
  if (isSysmon) {
    fields = fluentBitSysmonFields(eventId, raw.StringInserts);
  } else {
    fields = fluentBitNetworkFields(eventId, raw.StringInserts);
  }

  // winevtlog uses Computer, TimeCreated; winlog uses ComputerName, TimeGenerated
  const host = raw.Computer || raw.ComputerName || null;
  const timestamp = raw.TimeCreated || raw.TimeGenerated || null;
  const levelStr = levelNum !== undefined
    ? ({ 1: 'critical', 2: 'error', 3: 'warning', 4: 'information', 5: 'verbose' }[levelNum] || 'info')
    : String(eventType || '').toLowerCase();

  return {
    source: 'fluent-bit',
    host,
    source_ip: fields.source_ip || null,
    dest_ip: fields.dest_ip || null,
    dest_port: fields.dest_port || null,
    protocol: fields.protocol || null,
    timestamp,
    level: levelStr,
    severity: severityLevel,
    event_id: eventId ? Number(eventId) : null,
    event_category: categoryFromEventId(eventId) || null,
    message: raw.Message || null,
    username: fields.username || null,
    domain: fields.domain || null,
    logon_type: null,
    process_name: fields.process_name || null,
    process_id: fields.process_id || null,
    process_guid: fields.process_guid || null,
    parent_process_name: fields.parent_process_name || null,
    parent_process_id: fields.parent_process_id || null,
    parent_process_guid: fields.parent_process_guid || null,
    file_path: fields.file_path || null,
    registry_key: fields.registry_key || null,
    raw,
  };
}

// --- Winlogbeat ECS format normalizer (original) ---

function normalizeWinlogbeat(raw) {
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
    process_guid: proc.entity_id || ed.ProcessGuid || null,
    parent_process_name: parentProc.name || ed.ParentProcessName || null,
    parent_process_id: parentProc.pid ? Number(parentProc.pid) : null,
    parent_process_guid: parentProc.entity_id || ed.ParentProcessGuid || null,
    file_path: file.path || ed.ObjectName || null,
    registry_key: registry.path || ed.ObjectName || null,
    raw,
  };
}

// Detect format by presence of Fluent Bit-specific top-level fields.
// Fluent Bit winlog input uses PascalCase top-level keys (EventID, ComputerName, etc.).
// Winlogbeat uses ECS nesting (winlog.event_id, host.name, etc.).
export function normalizeEvent(raw) {
  if (raw.EventID !== undefined || raw.ComputerName !== undefined) {
    return normalizeFluentBit(raw);
  }
  return normalizeWinlogbeat(raw);
}
