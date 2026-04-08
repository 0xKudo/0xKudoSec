import { useState, useEffect, useCallback } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useIsMobile } from '../hooks/useIsMobile';

const ACTION_LABELS = {
  // Ingest key
  'ingest_key.create':    'API Key Created',
  'ingest_key.rotate':    'API Key Rotated',
  // Rules
  'rule.create':          'Rule Created',
  'rule.update':          'Rule Updated',
  'rule.toggle':          'Rule Toggled',
  'rule.delete':          'Rule Deleted',
  'rules.import':         'Rules Imported',
  // Alerts
  'alert.status_change':  'Alert Status Changed',
  'alert.delete':         'Alert Deleted',
  'alerts.bulk_delete':   'Alerts Bulk Deleted',
  'alerts.bulk_status':   'Alerts Bulk Status',
  // Cases
  'case.create':          'Case Created',
  'case.update':          'Case Updated',
  'case.status_change':   'Case Status Changed',
  'case.delete':          'Case Deleted',
  // Data
  'export.logs':          'Log Data Exported',
  'ingest.file_upload':   'Log File Uploaded',
  // Settings
  'settings.update':      'Settings Updated',
};

const ACTION_COLOR = {
  // Destructive
  'rule.delete':          'var(--severity-critical)',
  'alerts.bulk_delete':   'var(--severity-high)',
  'alert.delete':         'var(--severity-high)',
  'case.delete':          'var(--severity-high)',
  // Credential changes
  'ingest_key.create':    'var(--severity-medium)',
  'ingest_key.rotate':    'var(--severity-medium)',
  // Data movement
  'export.logs':          'var(--severity-medium)',
  'ingest.file_upload':   'var(--severity-info)',
  // Creates
  'rule.create':          'var(--severity-low)',
  'case.create':          'var(--severity-low)',
  // Updates / status changes
  'rule.update':          'var(--severity-info)',
  'rule.toggle':          'var(--severity-info)',
  'rules.import':         'var(--severity-info)',
  'alert.status_change':  'var(--severity-info)',
  'alerts.bulk_status':   'var(--severity-info)',
  'case.update':          'var(--severity-info)',
  'case.status_change':   'var(--severity-info)',
  'settings.update':      'var(--severity-info)',
};

const styles = {
  page: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  header: {
    padding: '0 20px', height: '45px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0,
  },
  title: { fontSize: '13px', color: 'var(--text-primary)', letterSpacing: '0.04em' },
  subtitle: { fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' },
  filterRow: {
    display: 'flex',
    gap: '8px',
    padding: '12px 24px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
    flexWrap: 'wrap',
  },
  select: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    fontSize: '11px',
    padding: '5px 10px',
    cursor: 'pointer',
  },
  refreshBtn: {
    background: 'none',
    border: '1px solid var(--border)',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font)',
    fontSize: '11px',
    padding: '5px 12px',
    cursor: 'pointer',
    marginLeft: 'auto',
  },
  tableWrap: { flex: 1, overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '11px' },
  card: {
    borderBottom: '1px solid var(--border-subtle)',
    padding: '10px 16px',
  },
  cardTop: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' },
  cardTime: { fontSize: '10px', color: 'var(--text-muted)', marginLeft: 'auto' },
  cardMeta: { fontSize: '10px', color: 'var(--text-subtle)', wordBreak: 'break-all' },
  cardIp: { fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' },
  th: {
    padding: '8px 16px',
    textAlign: 'left',
    color: 'var(--text-subtle)',
    fontSize: '10px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-sidebar)',
    position: 'sticky',
    top: 0,
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '9px 16px',
    borderBottom: '1px solid var(--border-subtle)',
    color: 'var(--text-muted)',
    verticalAlign: 'top',
  },
  actionBadge: (action) => ({
    display: 'inline-block',
    padding: '2px 7px',
    fontSize: '10px',
    color: ACTION_COLOR[action] || 'var(--text-muted)',
    border: `1px solid ${ACTION_COLOR[action] || 'var(--border)'}`,
    whiteSpace: 'nowrap',
  }),
  meta: {
    color: 'var(--text-subtle)',
    fontSize: '10px',
    fontFamily: 'var(--font)',
    wordBreak: 'break-all',
  },
  empty: {
    padding: '48px 24px',
    textAlign: 'center',
    color: 'var(--text-subtle)',
    fontSize: '12px',
  },
};

function formatMeta(meta) {
  if (!meta || !Object.keys(meta).length) return '—';
  return Object.entries(meta).map(([k, v]) => `${k}: ${v}`).join('  ·  ');
}

function formatTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function AuditLog() {
  const { getAccessTokenSilently } = useAuth0();
  const isMobile = useIsMobile();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [limitFilter, setLimitFilter] = useState('100');
  const [retentionPolicy, setRetentionPolicy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAccessTokenSilently();
      const [logsRes, settingsRes] = await Promise.all([
        fetch(`/api/siem/audit-log?${new URLSearchParams({ limit: limitFilter, ...(actionFilter && { action: actionFilter }) })}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/siem/settings', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const data = await logsRes.json();
      const settings = await settingsRes.json();
      setRows(Array.isArray(data) ? data : []);
      setRetentionPolicy({
        enabled: settings.audit_log_retention_enabled ?? true,
        days: settings.audit_log_retention_days ?? 365,
      });
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [getAccessTokenSilently, actionFilter, limitFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>Audit Log</div>
          <div style={styles.subtitle}>
            Privileged user actions, append-only record
            {retentionPolicy && (
              <span style={{ marginLeft: '12px', color: retentionPolicy.enabled && retentionPolicy.days < 365 ? 'var(--severity-high)' : 'var(--text-subtle)' }}>
                {retentionPolicy.enabled
                  ? `· retained ${retentionPolicy.days} days${retentionPolicy.days < 365 ? ' (below PCI DSS minimum)' : ''}`
                  : '· auto-purge disabled, retained indefinitely'}
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={styles.filterRow}>
        <select style={styles.select} value={actionFilter} onChange={e => setActionFilter(e.target.value)}>
          <option value="">All actions</option>
          {Object.entries(ACTION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select style={styles.select} value={limitFilter} onChange={e => setLimitFilter(e.target.value)}>
          <option value="50">Last 50</option>
          <option value="100">Last 100</option>
          <option value="250">Last 250</option>
          <option value="500">Last 500</option>
        </select>
        <button style={styles.refreshBtn} onClick={load}>↻ Refresh</button>
      </div>

      <div style={styles.tableWrap}>
        {loading ? (
          <div style={styles.empty}>Loading...</div>
        ) : rows.length === 0 ? (
          <div style={styles.empty}>No audit events found.</div>
        ) : isMobile ? (
          <div>
            {rows.map(row => (
              <div key={row.id} style={styles.card}>
                <div style={styles.cardTop}>
                  <span style={styles.actionBadge(row.action)}>
                    {ACTION_LABELS[row.action] || row.action}
                  </span>
                  <span style={styles.cardTime}>{formatTime(row.created_at)}</span>
                </div>
                {row.ip && <div style={styles.cardIp}>{row.ip}</div>}
                <div style={styles.cardMeta}>{formatMeta(row.meta)}</div>
              </div>
            ))}
          </div>
        ) : (
          <table style={styles.table}>
            <colgroup>
              <col style={{ width: '160px' }} />
              <col style={{ width: '180px' }} />
              <col style={{ width: '120px' }} />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th style={styles.th}>Time</th>
                <th style={styles.th}>Action</th>
                <th style={styles.th}>IP</th>
                <th style={styles.th}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id}>
                  <td style={styles.td}>{formatTime(row.created_at)}</td>
                  <td style={styles.td}>
                    <span style={styles.actionBadge(row.action)}>
                      {ACTION_LABELS[row.action] || row.action}
                    </span>
                  </td>
                  <td style={styles.td}>{row.ip || '—'}</td>
                  <td style={styles.td}>
                    <span style={styles.meta}>{formatMeta(row.meta)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
