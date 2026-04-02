import { describe, it, expect } from 'vitest';
import { normalizeEvent } from '../services/ingest/normalizeEvent.js';

// ---------------------------------------------------------------------------
// Fluent Bit winlog input format
// Flat PascalCase fields, network fields in StringInserts array
// ---------------------------------------------------------------------------
describe('Fluent Bit — Security channel', () => {
  it('detects fluent-bit format and sets source', () => {
    const raw = {
      RecordNumber: 5498046,
      TimeGenerated: '2026-04-01 17:51:08 -0700',
      EventID: 5156,
      EventType: 'SuccessAudit',
      Channel: 'Security',
      SourceName: 'Microsoft-Windows-Security-Auditing',
      ComputerName: 'MSI',
      Message: 'The Windows Filtering Platform has permitted a connection.',
      StringInserts: ['7428', '\\device\\harddiskvolume3\\brave.exe', '%%14593', '127.0.0.1', '38667', '127.0.0.1', '7777', '6'],
    };
    const e = normalizeEvent(raw);
    expect(e.source).toBe('fluent-bit');
  });

  it('extracts network fields from StringInserts for event 5156', () => {
    const raw = {
      EventID: 5156,
      EventType: 'SuccessAudit',
      Channel: 'Security',
      ComputerName: 'MSI',
      TimeGenerated: '2026-04-01 17:51:08 -0700',
      Message: 'permitted connection',
      StringInserts: ['7428', '\\device\\harddiskvolume3\\brave.exe', '%%14593', '10.0.0.5', '49200', '93.184.216.34', '443', '6'],
    };
    const e = normalizeEvent(raw);
    expect(e.event_id).toBe(5156);
    expect(e.event_category).toBe('network');
    expect(e.host).toBe('MSI');
    expect(e.source_ip).toBe('10.0.0.5');
    expect(e.dest_ip).toBe('93.184.216.34');
    expect(e.dest_port).toBe(443);
    expect(e.protocol).toBe('6');
    expect(e.process_name).toBe('\\device\\harddiskvolume3\\brave.exe');
    expect(e.process_id).toBe(7428);
    expect(e.timestamp).toBe('2026-04-01 17:51:08 -0700');
    expect(e.message).toBeTruthy();
  });

  it('extracts network fields from StringInserts for event 5157 (blocked)', () => {
    const raw = {
      EventID: 5157,
      EventType: 'FailureAudit',
      Channel: 'Security',
      ComputerName: 'MSI',
      TimeGenerated: '2026-04-01 18:00:00 -0700',
      Message: 'blocked connection',
      StringInserts: ['4', 'System', '%%14592', '192.168.1.1', '0', '10.0.0.5', '445', '6'],
    };
    const e = normalizeEvent(raw);
    expect(e.event_id).toBe(5157);
    expect(e.source_ip).toBe('192.168.1.1');
    expect(e.dest_ip).toBe('10.0.0.5');
    expect(e.dest_port).toBe(445);
    expect(e.severity).toBe('medium'); // FailureAudit maps to medium
  });

  it('extracts bind fields from StringInserts for event 5158', () => {
    const raw = {
      EventID: 5158,
      EventType: 'SuccessAudit',
      Channel: 'Security',
      ComputerName: 'MSI',
      TimeGenerated: '2026-04-01 18:00:00 -0700',
      Message: 'permitted bind',
      StringInserts: ['5324', '\\device\\brave.exe', '0.0.0.0', '59384', '17'],
    };
    const e = normalizeEvent(raw);
    expect(e.event_id).toBe(5158);
    expect(e.source_ip).toBe('0.0.0.0');
    expect(e.dest_ip).toBeNull();
    expect(e.protocol).toBe('17');
    expect(e.process_id).toBe(5324);
  });

  it('promotes high-severity event IDs regardless of EventType', () => {
    const raw = {
      EventID: 4625,
      EventType: 'FailureAudit',
      Channel: 'Security',
      ComputerName: 'MSI',
      TimeGenerated: '2026-04-01 18:00:00 -0700',
      Message: 'An account failed to log on.',
      StringInserts: [],
    };
    const e = normalizeEvent(raw);
    expect(e.severity).toBe('high');
    expect(e.event_category).toBe('authentication');
  });
});

// ---------------------------------------------------------------------------
// Winlogbeat 7 ECS format
// Nested structure: winlog.*, host.*, event.*, @timestamp
// ---------------------------------------------------------------------------
describe('Winlogbeat 7 — Security channel', () => {
  it('detects winlogbeat format and sets source from agent.type', () => {
    const raw = {
      '@timestamp': '2026-04-01T17:51:08.000Z',
      agent: { type: 'winlogbeat', version: '7.17.0' },
      host: { name: 'MSI', ip: ['10.0.0.2'] },
      winlog: { event_id: 4624, channel: 'Security', computer_name: 'MSI', event_data: {} },
      event: { code: '4624', action: 'logged-in', type: ['start'], outcome: 'success' },
      message: 'An account was successfully logged on.',
      log: { level: 'information' },
    };
    const e = normalizeEvent(raw);
    expect(e.source).toBe('winlogbeat');
  });

  it('extracts core fields from ECS structure', () => {
    const raw = {
      '@timestamp': '2026-04-01T17:51:08.000Z',
      agent: { type: 'winlogbeat' },
      host: { name: 'WORKSTATION1' },
      winlog: {
        event_id: 4624,
        channel: 'Security',
        event_data: {
          TargetUserName: 'jsmith',
          TargetDomainName: 'CORP',
          LogonType: '3',
        },
      },
      event: { code: '4624', type: ['start'] },
      message: 'An account was successfully logged on.',
      'log.level': 'information',
    };
    const e = normalizeEvent(raw);
    expect(e.event_id).toBe(4624);
    expect(e.event_category).toBe('authentication');
    expect(e.host).toBe('WORKSTATION1');
    expect(e.timestamp).toBe('2026-04-01T17:51:08.000Z');
    expect(e.message).toBe('An account was successfully logged on.');
    expect(e.username).toBe('jsmith');
    expect(e.domain).toBe('CORP');
    expect(e.logon_type).toBe(3);
    expect(e.severity).toBe('info');
  });

  it('extracts network fields from ECS network object', () => {
    const raw = {
      '@timestamp': '2026-04-01T18:00:00.000Z',
      agent: { type: 'winlogbeat' },
      host: { name: 'WORKSTATION1' },
      winlog: { event_id: 3, channel: 'Microsoft-Windows-Sysmon/Operational', event_data: {} },
      event: { code: '3' },
      network: {
        source: { ip: '10.0.0.5', port: 49200 },
        destination: { ip: '93.184.216.34', port: 443 },
        transport: 'tcp',
      },
      message: 'Network connection detected.',
      'log.level': 'information',
    };
    const e = normalizeEvent(raw);
    expect(e.event_id).toBe(3);
    expect(e.event_category).toBe('network');
    expect(e.source_ip).toBe('10.0.0.5');
    expect(e.dest_ip).toBe('93.184.216.34');
    expect(e.dest_port).toBe(443);
    expect(e.protocol).toBe('tcp');
  });

  it('extracts process fields from event_data', () => {
    const raw = {
      '@timestamp': '2026-04-01T18:00:00.000Z',
      agent: { type: 'winlogbeat' },
      host: { name: 'WORKSTATION1' },
      winlog: {
        event_id: 4688,
        channel: 'Security',
        event_data: {
          NewProcessName: 'C:\\Windows\\System32\\cmd.exe',
          ProcessId: '0x1234',
          ParentProcessName: 'C:\\Windows\\explorer.exe',
          SubjectUserName: 'jsmith',
        },
      },
      event: { code: '4688' },
      message: 'A new process has been created.',
      'log.level': 'information',
    };
    const e = normalizeEvent(raw);
    expect(e.event_id).toBe(4688);
    expect(e.event_category).toBe('process');
    expect(e.username).toBe('jsmith');
  });

  it('promotes high-severity event IDs', () => {
    const raw = {
      '@timestamp': '2026-04-01T18:00:00.000Z',
      agent: { type: 'winlogbeat' },
      host: { name: 'WORKSTATION1' },
      winlog: { event_id: 4625, channel: 'Security', event_data: { TargetUserName: 'admin' } },
      event: { code: '4625' },
      message: 'An account failed to log on.',
      'log.level': 'information',
    };
    const e = normalizeEvent(raw);
    expect(e.severity).toBe('high');
    expect(e.event_category).toBe('authentication');
    expect(e.username).toBe('admin');
  });
});

// ---------------------------------------------------------------------------
// Manual API — direct JSON POST
// User-constructed JSON, must have at least event_id, message, timestamp.
// No agent wrapper, no ECS nesting — falls through to winlogbeat path
// which handles missing fields gracefully with nulls.
// ---------------------------------------------------------------------------
describe('Manual API — direct JSON POST', () => {
  it('accepts minimal event with just event_id, message, timestamp', () => {
    const raw = {
      '@timestamp': '2026-04-01T18:00:00.000Z',
      winlog: { event_id: 4625 },
      message: 'Failed login attempt for user admin',
    };
    const e = normalizeEvent(raw);
    expect(e.event_id).toBe(4625);
    expect(e.message).toBe('Failed login attempt for user admin');
    expect(e.timestamp).toBe('2026-04-01T18:00:00.000Z');
    expect(e.severity).toBe('high'); // promoted by HIGH_SEVERITY_EVENT_IDS
    expect(e.host).toBeNull();
    expect(e.source_ip).toBeNull();
  });

  it('accepts fully populated manual event', () => {
    const raw = {
      '@timestamp': '2026-04-01T18:00:00.000Z',
      winlog: {
        event_id: 4624,
        event_data: {
          TargetUserName: 'jsmith',
          TargetDomainName: 'CORP',
          LogonType: '2',
        },
      },
      host: { name: 'DESKTOP-ABC' },
      message: 'Successful logon',
      'log.level': 'information',
    };
    const e = normalizeEvent(raw);
    expect(e.event_id).toBe(4624);
    expect(e.host).toBe('DESKTOP-ABC');
    expect(e.username).toBe('jsmith');
    expect(e.domain).toBe('CORP');
    expect(e.logon_type).toBe(2);
    expect(e.event_category).toBe('authentication');
  });

  it('gracefully returns nulls for missing optional fields', () => {
    const raw = {
      '@timestamp': '2026-04-01T18:00:00.000Z',
      winlog: { event_id: 7045 },
      message: 'A service was installed.',
    };
    const e = normalizeEvent(raw);
    expect(e.event_id).toBe(7045);
    expect(e.event_category).toBe('system');
    expect(e.source_ip).toBeNull();
    expect(e.dest_ip).toBeNull();
    expect(e.username).toBeNull();
    expect(e.process_name).toBeNull();
  });
});
