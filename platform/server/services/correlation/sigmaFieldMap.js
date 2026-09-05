// platform/server/services/correlation/sigmaFieldMap.js
// Sigma (Windows taxonomy) → our `logs` columns. This mapping is the real work of
// Sigma import (XDR Phase 1, Task 1.5.3) and is deliberately its own reviewed file.
//
// Keys are Sigma field names (case-sensitive as they appear in SigmaHQ Windows
// rules). Values are keys of LOG_FIELDS (platform/shared/correlationRule.js). A
// Sigma field absent from this map is rejected at import with its name — never
// silently dropped or passed through.
//
// Notes:
//  * We have no dedicated command-line column; CommandLine/ParentCommandLine map to
//    `message` (which is where Fluent Bit puts the rendered event text). Matches are
//    substring (contains), which is how Sigma uses them anyway.
//  * OriginalFileName has no exact column; mapping to process_name is a best-effort
//    approximation and is documented as lossy.

export const SIGMA_FIELD_MAP = {
  // Process / Sysmon EID 1
  Image: 'process_name',
  OriginalFileName: 'process_name', // lossy approximation
  ParentImage: 'parent_process_name',
  CommandLine: 'message',
  ParentCommandLine: 'message', // lossy: both map to message
  ProcessId: 'process_id',
  ParentProcessId: 'parent_process_id',
  ProcessGuid: 'process_guid',
  ParentProcessGuid: 'parent_process_guid',

  // Identity
  User: 'username',
  TargetUserName: 'username',
  SubjectUserName: 'username',
  AccountName: 'username',
  TargetDomainName: 'domain',
  SubjectDomainName: 'domain',
  LogonType: 'logon_type',

  // Host / event
  Computer: 'host',
  ComputerName: 'host',
  Hostname: 'host',
  EventID: 'event_id',
  Channel: 'source',
  Provider_Name: 'source',

  // Network (Sysmon EID 3, Security 5156/5158)
  SourceIp: 'source_ip',
  SourceAddress: 'source_ip',
  IpAddress: 'source_ip',
  DestinationIp: 'dest_ip',
  DestinationPort: 'dest_port',
  DestPort: 'dest_port',
  Protocol: 'protocol',

  // File / registry
  TargetFilename: 'file_path',
  Filename: 'file_path',
  TargetObject: 'registry_key',
  ObjectName: 'registry_key',

  // Additional cleanly-mappable Windows fields (Phase 4 first-class expansion).
  DestinationHostname: 'host',
  SourceHostname: 'host',
  Application: 'process_name',
  ServiceName: 'process_name',
  SourcePort: 'dest_port', // best-effort; no dedicated source_port column
  User_Name: 'username',
  AccountDomain: 'domain',
};

// First-class mappings that lose information (a Sigma field collapsed onto a
// coarser column). A rule using any of these converts but is fidelity
// "approximate" — it may over- or under-match relative to the Sigma intent.
export const LOSSY_FIELDS = new Set([
  'OriginalFileName', 'CommandLine', 'ParentCommandLine', 'SourcePort',
]);

// A raw field name is used only through a bound `->>` parameter, never
// interpolated, but we still require a conservative identifier so obviously
// malformed field names are rejected at convert time.
export const RAW_FIELD_RE = /^[A-Za-z0-9_.\-]+$/;

// Resolve a Sigma field name (already stripped of |modifiers) to our field key,
// or null if unmapped. Kept for backward compatibility with the flat-selection
// path; new code prefers resolveField.
export function mapSigmaField(name) {
  return SIGMA_FIELD_MAP[name] || null;
}

// Two-tier resolution (Phase 4):
//   * a mapped field → { kind: 'column', field: <LOG_FIELDS key> } (fast path)
//   * any other syntactically valid field → { kind: 'raw', name } (raw_json ->>)
//   * an unsafe identifier → null (rejected at convert time)
export function resolveField(name) {
  const mapped = SIGMA_FIELD_MAP[name];
  if (mapped) return { kind: 'column', field: mapped };
  if (typeof name === 'string' && RAW_FIELD_RE.test(name)) return { kind: 'raw', name };
  return null;
}
