// platform/shared/attack.js
// MITRE ATT&CK Enterprise reference data — tactics and a curated technique set.
// Static data, no API calls. Shared by server (rule validation) and shell (UI badges,
// coverage view). Curated toward Windows endpoint / SIEM detection, not the full ~200
// techniques; extend TECHNIQUES as detections grow. IDs and names follow ATT&CK v15.
//
// A technique's `tactics` lists every tactic it belongs to (some span several).

export const ATTACK_TACTICS = [
  { id: 'TA0043', name: 'Reconnaissance' },
  { id: 'TA0042', name: 'Resource Development' },
  { id: 'TA0001', name: 'Initial Access' },
  { id: 'TA0002', name: 'Execution' },
  { id: 'TA0003', name: 'Persistence' },
  { id: 'TA0004', name: 'Privilege Escalation' },
  { id: 'TA0005', name: 'Defense Evasion' },
  { id: 'TA0006', name: 'Credential Access' },
  { id: 'TA0007', name: 'Discovery' },
  { id: 'TA0008', name: 'Lateral Movement' },
  { id: 'TA0009', name: 'Collection' },
  { id: 'TA0011', name: 'Command and Control' },
  { id: 'TA0010', name: 'Exfiltration' },
  { id: 'TA0040', name: 'Impact' },
];

export const ATTACK_TACTIC_BY_ID = Object.fromEntries(
  ATTACK_TACTICS.map((t) => [t.id, t])
);

// Curated technique set. `id` is the ATT&CK technique or sub-technique ID.
export const ATTACK_TECHNIQUES = [
  // Initial Access
  { id: 'T1078', name: 'Valid Accounts', tactics: ['TA0001', 'TA0003', 'TA0004', 'TA0005'] },
  { id: 'T1190', name: 'Exploit Public-Facing Application', tactics: ['TA0001'] },
  { id: 'T1566', name: 'Phishing', tactics: ['TA0001'] },
  { id: 'T1133', name: 'External Remote Services', tactics: ['TA0001', 'TA0003'] },

  // Execution
  { id: 'T1059', name: 'Command and Scripting Interpreter', tactics: ['TA0002'] },
  { id: 'T1059.001', name: 'PowerShell', tactics: ['TA0002'] },
  { id: 'T1059.003', name: 'Windows Command Shell', tactics: ['TA0002'] },
  { id: 'T1204', name: 'User Execution', tactics: ['TA0002'] },
  { id: 'T1053', name: 'Scheduled Task/Job', tactics: ['TA0002', 'TA0003', 'TA0004'] },
  { id: 'T1569', name: 'System Services', tactics: ['TA0002'] },
  { id: 'T1047', name: 'Windows Management Instrumentation', tactics: ['TA0002'] },

  // Persistence
  { id: 'T1547', name: 'Boot or Logon Autostart Execution', tactics: ['TA0003', 'TA0004'] },
  { id: 'T1543', name: 'Create or Modify System Process', tactics: ['TA0003', 'TA0004'] },
  { id: 'T1136', name: 'Create Account', tactics: ['TA0003'] },
  { id: 'T1098', name: 'Account Manipulation', tactics: ['TA0003', 'TA0004'] },
  { id: 'T1505', name: 'Server Software Component', tactics: ['TA0003'] },
  { id: 'T1574', name: 'Hijack Execution Flow', tactics: ['TA0003', 'TA0004', 'TA0005'] },

  // Privilege Escalation
  { id: 'T1548', name: 'Abuse Elevation Control Mechanism', tactics: ['TA0004', 'TA0005'] },
  { id: 'T1068', name: 'Exploitation for Privilege Escalation', tactics: ['TA0004'] },

  // Defense Evasion
  { id: 'T1070', name: 'Indicator Removal', tactics: ['TA0005'] },
  { id: 'T1070.001', name: 'Clear Windows Event Logs', tactics: ['TA0005'] },
  { id: 'T1027', name: 'Obfuscated Files or Information', tactics: ['TA0005'] },
  { id: 'T1055', name: 'Process Injection', tactics: ['TA0005', 'TA0004'] },
  { id: 'T1112', name: 'Modify Registry', tactics: ['TA0005'] },
  { id: 'T1562', name: 'Impair Defenses', tactics: ['TA0005'] },
  { id: 'T1218', name: 'System Binary Proxy Execution', tactics: ['TA0005'] },
  { id: 'T1036', name: 'Masquerading', tactics: ['TA0005'] },

  // Credential Access
  { id: 'T1003', name: 'OS Credential Dumping', tactics: ['TA0006'] },
  { id: 'T1110', name: 'Brute Force', tactics: ['TA0006'] },
  { id: 'T1555', name: 'Credentials from Password Stores', tactics: ['TA0006'] },
  { id: 'T1558', name: 'Steal or Forge Kerberos Tickets', tactics: ['TA0006'] },

  // Discovery
  { id: 'T1087', name: 'Account Discovery', tactics: ['TA0007'] },
  { id: 'T1082', name: 'System Information Discovery', tactics: ['TA0007'] },
  { id: 'T1083', name: 'File and Directory Discovery', tactics: ['TA0007'] },
  { id: 'T1046', name: 'Network Service Discovery', tactics: ['TA0007'] },
  { id: 'T1018', name: 'Remote System Discovery', tactics: ['TA0007'] },
  { id: 'T1057', name: 'Process Discovery', tactics: ['TA0007'] },
  { id: 'T1016', name: 'System Network Configuration Discovery', tactics: ['TA0007'] },
  { id: 'T1033', name: 'System Owner/User Discovery', tactics: ['TA0007'] },

  // Lateral Movement
  { id: 'T1021', name: 'Remote Services', tactics: ['TA0008'] },
  { id: 'T1021.001', name: 'Remote Desktop Protocol', tactics: ['TA0008'] },
  { id: 'T1021.002', name: 'SMB/Windows Admin Shares', tactics: ['TA0008'] },
  { id: 'T1570', name: 'Lateral Tool Transfer', tactics: ['TA0008'] },

  // Collection
  { id: 'T1005', name: 'Data from Local System', tactics: ['TA0009'] },
  { id: 'T1560', name: 'Archive Collected Data', tactics: ['TA0009'] },

  // Command and Control
  { id: 'T1071', name: 'Application Layer Protocol', tactics: ['TA0011'] },
  { id: 'T1105', name: 'Ingress Tool Transfer', tactics: ['TA0011'] },
  { id: 'T1573', name: 'Encrypted Channel', tactics: ['TA0011'] },
  { id: 'T1090', name: 'Proxy', tactics: ['TA0011'] },

  // Exfiltration
  { id: 'T1041', name: 'Exfiltration Over C2 Channel', tactics: ['TA0010'] },
  { id: 'T1048', name: 'Exfiltration Over Alternative Protocol', tactics: ['TA0010'] },

  // Impact
  { id: 'T1486', name: 'Data Encrypted for Impact', tactics: ['TA0040'] },
  { id: 'T1490', name: 'Inhibit System Recovery', tactics: ['TA0040'] },
  { id: 'T1489', name: 'Service Stop', tactics: ['TA0040'] },
];

export const ATTACK_TECHNIQUE_BY_ID = Object.fromEntries(
  ATTACK_TECHNIQUES.map((t) => [t.id, t])
);

// Validate a list of technique IDs against the known set.
// Returns { valid: string[], unknown: string[] }.
export function validateTechniqueIds(ids = []) {
  const valid = [];
  const unknown = [];
  for (const id of ids) {
    if (ATTACK_TECHNIQUE_BY_ID[id]) valid.push(id);
    else unknown.push(id);
  }
  return { valid, unknown };
}

// Human label for a technique ID, e.g. "T1059.001 PowerShell".
export function techniqueLabel(id) {
  const t = ATTACK_TECHNIQUE_BY_ID[id];
  return t ? `${t.id} ${t.name}` : id;
}
