import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { ProcessTreePanel } from './ProcessTreePanel.jsx';

const SEV_COLOR = {
  critical: 'var(--severity-critical)',
  high: 'var(--severity-high)',
  medium: 'var(--severity-medium)',
  low: 'var(--severity-low)',
  info: 'var(--severity-info)',
};

const STATUS_OPTIONS = ['new', 'acknowledged', 'resolved'];

const s = {
  container: { padding: 0 },
  header: {
    padding: '12px 20px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: '12px',
  },
  title: { fontSize: '13px', color: 'var(--text-primary)', letterSpacing: '0.04em' },
  sub: { color: 'var(--text-muted)', fontSize: '11px' },
  actions: { marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' },
  btn: {
    background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)',
    fontFamily: 'var(--font)', fontSize: '11px', padding: '4px 12px', cursor: 'pointer',
    letterSpacing: '0.04em',
  },
  btnActive: {
    background: 'var(--btn-primary-bg)', border: '1px solid var(--border)', color: 'var(--btn-primary-text)',
    fontFamily: 'var(--font)', fontSize: '11px', padding: '4px 12px', cursor: 'pointer',
    letterSpacing: '0.04em',
  },
  kpiRow: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '1px', background: 'var(--border-subtle)', borderBottom: '1px solid var(--border)',
  },
  kpiCard: { background: 'var(--bg-surface)', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '4px' },
  kpiLabel: { fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' },
  kpiValue: (color) => ({ fontSize: '28px', color: color || 'var(--text-primary)', lineHeight: 1 }),
  filterBar: {
    padding: '10px 20px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)', display: 'flex', gap: '8px', alignItems: 'center',
  },
  bulkBar: {
    padding: '8px 20px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg-primary)', display: 'flex', gap: '8px', alignItems: 'center',
    borderLeft: '2px solid var(--severity-info)',
  },
  sectionBar: {
    padding: '8px 20px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)',
    fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left', padding: '8px 14px', fontSize: '10px', letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)',
    fontWeight: 'normal', background: 'var(--bg-surface)',
  },
  td: {
    padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', fontSize: '12px',
    color: 'var(--text-muted)', verticalAlign: 'middle',
  },
  checkbox: {
    width: '14px', height: '14px', cursor: 'pointer', accentColor: 'var(--text-primary)',
  },
  sevBadge: (color) => ({
    fontSize: '10px', padding: '2px 7px', letterSpacing: '0.06em',
    textTransform: 'uppercase', border: `1px solid ${color}`, color, whiteSpace: 'nowrap',
  }),
  statusBadge: (status) => ({
    fontSize: '10px', padding: '2px 7px', letterSpacing: '0.06em', textTransform: 'uppercase',
    border: '1px solid var(--border)', color: status === 'new' ? 'var(--text-primary)' : 'var(--text-muted)',
    background: status === 'new' ? 'var(--bg-surface)' : 'none',
    whiteSpace: 'nowrap',
  }),
  muted: { padding: '40px 20px', color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center' },
  toast: {
    position: 'fixed', bottom: '24px', right: '24px', zIndex: 2000,
    background: 'var(--bg-surface)', border: '1px solid var(--border)',
    padding: '10px 16px', fontSize: '12px', color: 'var(--text-primary)',
    letterSpacing: '0.02em', pointerEvents: 'none',
    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
  },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: 'var(--bg-primary)', border: '1px solid var(--border)', width: '600px', maxWidth: '95vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column' },
  modalHeader: { padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: '12px', color: 'var(--text-primary)', letterSpacing: '0.04em' },
  modalClose: { background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '16px', cursor: 'pointer', fontFamily: 'var(--font)' },
  modalBody: { padding: '16px', overflow: 'auto', flex: 1 },
  fieldRow: { display: 'grid', gridTemplateColumns: '140px 1fr', borderBottom: '1px solid var(--border-subtle)', padding: '6px 0', gap: '12px' },
  fieldLabel: { fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingTop: '2px' },
  fieldValue: { fontSize: '12px', color: 'var(--text-primary)', wordBreak: 'break-word', whiteSpace: 'pre-wrap' },
  modalActions: { padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px', background: 'var(--bg-surface)' },
  input: {
    background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)',
    fontFamily: 'var(--font)', fontSize: '12px', padding: '6px 10px', outline: 'none',
    letterSpacing: '0.02em', width: '100%', boxSizing: 'border-box',
  },
};

function sevColor(sev) { return SEV_COLOR[(sev || '').toLowerCase()] || 'var(--text-muted)'; }

export function AlertQueue({ onNavigate }) {
  const { getAccessTokenSilently } = useAuth0();
  const [alerts, setAlerts] = useState([]);
  const [counts, setCounts] = useState({});
  const [statusFilter, setStatusFilter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false); // single
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [caseTitle, setCaseTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  function showToast(msg) {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAccessTokenSilently();
      const headers = { Authorization: `Bearer ${token}` };
      const params = statusFilter ? `?status=${statusFilter}` : '';
      const [alertsRes, countsRes] = await Promise.all([
        fetch(`/api/siem/alerts${params}`, { headers }),
        fetch('/api/siem/alerts/counts', { headers }),
      ]);
      const [alertsData, countsData] = await Promise.all([alertsRes.json(), countsRes.json()]);
      setAlerts(Array.isArray(alertsData) ? alertsData : []);
      const c = {};
      if (Array.isArray(countsData)) countsData.forEach(r => { c[r.status] = Number(r.count); });
      setCounts(c);
      setSelectedIds(new Set());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, getAccessTokenSilently]);

  useEffect(() => { load(); }, [load]);

  async function runRules() {
    setRunning(true);
    try {
      const token = await getAccessTokenSilently();
      const res = await fetch('/api/siem/rules/run', {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      const { created, deduped, suppressed } = await res.json();
      await load();
      const parts = [];
      if (created > 0) parts.push(`${created} new alert${created !== 1 ? 's' : ''}`);
      if (deduped > 0) parts.push(`${deduped} deduplicated`);
      if (suppressed > 0) parts.push(`${suppressed} suppressed`);
      showToast(parts.length ? parts.join(', ') + '.' : 'No new matches found.');
    } catch (e) {
      console.error(e);
    } finally {
      setRunning(false);
    }
  }

  async function setStatus(alert, status) {
    const token = await getAccessTokenSilently();
    await fetch(`/api/siem/alerts/${alert.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, status } : a));
    if (selected?.id === alert.id) setSelected(prev => ({ ...prev, status }));
  }

  async function deleteAlert(alert) {
    const token = await getAccessTokenSilently();
    await fetch(`/api/siem/alerts/${alert.id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    });
    setAlerts(prev => prev.filter(a => a.id !== alert.id));
    setSelected(null);
  }

  async function bulkAction(action, status) {
    const ids = [...selectedIds];
    const token = await getAccessTokenSilently();
    await fetch('/api/siem/alerts/bulk', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, action, status }),
    });
    if (action === 'delete') {
      setAlerts(prev => prev.filter(a => !selectedIds.has(a.id)));
      showToast(`${ids.length} alert${ids.length !== 1 ? 's' : ''} deleted.`);
    } else {
      setAlerts(prev => prev.map(a => selectedIds.has(a.id) ? { ...a, status } : a));
      showToast(`${ids.length} alert${ids.length !== 1 ? 's' : ''} marked ${status}.`);
    }
    setSelectedIds(new Set());
  }

  async function createCase() {
    if (!caseTitle.trim()) return;
    setCreating(true);
    try {
      const token = await getAccessTokenSilently();
      const caseRes = await fetch('/api/siem/cases', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: caseTitle.trim(), severity: selected.severity }),
      });
      const newCase = await caseRes.json();
      await fetch(`/api/siem/cases/${newCase.id}/alerts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert_id: selected.id }),
      });
      setCaseTitle('');
      setSelected(null);
      onNavigate('cases');
    } finally {
      setCreating(false);
    }
  }

  const total = Object.values(counts).reduce((s, v) => s + v, 0);
  const allChecked = alerts.length > 0 && alerts.every(a => selectedIds.has(a.id));
  const someChecked = !allChecked && alerts.some(a => selectedIds.has(a.id));

  function toggleAll() {
    if (allChecked) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(alerts.map(a => a.id)));
    }
  }

  function toggleOne(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div style={s.container}>
      <div style={s.header}>
        <span style={s.title}>SIEM &nbsp;<span style={s.sub}>/ Alert Queue</span></span>
        <div style={s.actions}>
          <button style={s.btn} onClick={load} disabled={loading}>{loading ? '...' : 'Refresh'}</button>
          <button style={s.btn} onClick={runRules} disabled={running}>
            {running ? 'Running...' : 'Run Rules'}
          </button>
          <button style={s.btn} onClick={() => onNavigate('rules')}>Manage Rules</button>
        </div>
      </div>

      <div style={s.kpiRow}>
        <div style={s.kpiCard}>
          <div style={s.kpiLabel}>Total</div>
          <div style={s.kpiValue()}>{total}</div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>all alerts</div>
        </div>
        <div style={s.kpiCard}>
          <div style={s.kpiLabel}>New</div>
          <div style={s.kpiValue('var(--severity-critical)')}>{counts.new || 0}</div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>needs triage</div>
        </div>
        <div style={s.kpiCard}>
          <div style={s.kpiLabel}>Acknowledged</div>
          <div style={s.kpiValue('var(--severity-medium)')}>{counts.acknowledged || 0}</div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>in progress</div>
        </div>
      </div>

      <div style={s.filterBar}>
        {[null, ...STATUS_OPTIONS].map(st => (
          <button key={st ?? 'all'} style={statusFilter === st ? s.btnActive : s.btn} onClick={() => setStatusFilter(st)}>
            {st ?? 'All'}{st && counts[st] ? ` (${counts[st]})` : ''}
          </button>
        ))}
      </div>

      {selectedIds.size > 0 && (
        <div style={s.bulkBar}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginRight: '4px' }}>
            {selectedIds.size} selected
          </span>
          <button style={s.btn} onClick={() => bulkAction('status', 'acknowledged')}>Mark Acknowledged</button>
          <button style={s.btn} onClick={() => bulkAction('status', 'resolved')}>Mark Resolved</button>
          <button
            style={{ ...s.btn, color: 'var(--severity-critical)', borderColor: 'var(--severity-critical)' }}
            onClick={() => setConfirmBulkDelete(true)}
          >Delete Selected</button>
          <button style={{ ...s.btn, marginLeft: 'auto' }} onClick={() => setSelectedIds(new Set())}>Clear Selection</button>
        </div>
      )}

      <div style={s.sectionBar}>
        <span>Alerts</span>
        <span style={{ fontSize: '10px' }}>{alerts.length} shown{statusFilter ? ` · ${statusFilter}` : ''}</span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={{ ...s.th, width: '40px', textAlign: 'center' }}>
                <input
                  type="checkbox"
                  style={s.checkbox}
                  checked={allChecked}
                  ref={el => { if (el) el.indeterminate = someChecked; }}
                  onChange={toggleAll}
                />
              </th>
              {['Time', 'Severity', 'Title', 'Rule', 'Host', 'User', 'Event ID', 'Status', ''].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading && !alerts.length && (
              <tr><td colSpan={10} style={s.muted}>No alerts. Click "Run Rules" to scan logs against detection rules.</td></tr>
            )}
            {alerts.map(a => {
              const isChecked = selectedIds.has(a.id);
              return (
                <tr
                  key={a.id}
                  style={{ cursor: 'pointer', background: isChecked ? 'var(--bg-surface)' : '' }}
                  onClick={() => setSelected(a)}
                  onMouseEnter={e => { if (!isChecked) Array.from(e.currentTarget.cells).forEach(c => c.style.background = 'var(--bg-surface)'); }}
                  onMouseLeave={e => { if (!isChecked) Array.from(e.currentTarget.cells).forEach(c => c.style.background = ''); }}
                >
                  <td style={{ ...s.td, textAlign: 'center' }} onClick={e => { e.stopPropagation(); toggleOne(a.id); }}>
                    <input type="checkbox" style={s.checkbox} checked={isChecked} onChange={() => toggleOne(a.id)} />
                  </td>
                  <td style={s.td}>{new Date(a.created_at).toLocaleString()}</td>
                  <td style={s.td}><span style={s.sevBadge(sevColor(a.severity))}>{a.severity}</span></td>
                  <td style={{ ...s.td, color: 'var(--text-primary)', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.title}
                    {a.count > 1 && <span style={{ marginLeft: '6px', fontSize: '10px', padding: '1px 5px', border: '1px solid var(--text-muted)', color: 'var(--text-muted)' }}>{a.count}×</span>}
                  </td>
                  <td style={s.td}>{a.rule_name || '—'}</td>
                  <td style={s.td}>{a.host || '—'}</td>
                  <td style={s.td}>{a.username || '—'}</td>
                  <td style={s.td}>{a.event_id || '—'}</td>
                  <td style={s.td}><span style={s.statusBadge(a.status)}>{a.status}</span></td>
                  <td style={s.td} onClick={e => e.stopPropagation()}>
                    <select
                      style={{ ...s.btn, padding: '2px 6px', cursor: 'pointer' }}
                      value={a.status}
                      onChange={e => setStatus(a, e.target.value)}
                    >
                      {STATUS_OPTIONS.map(st => <option key={st} value={st}>{st}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <div style={s.overlay} onClick={() => setSelected(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <span style={s.modalTitle}>
                {selected.title} &nbsp;·&nbsp;
                <span style={{ color: sevColor(selected.severity) }}>{selected.severity}</span>
              </span>
              <button style={s.modalClose} onClick={() => setSelected(null)}>✕</button>
            </div>
            <div style={s.modalBody}>
              {[
                ['Time', new Date(selected.created_at).toLocaleString()],
                ['Status', selected.status],
                ['Severity', selected.severity],
                ['Rule', selected.rule_name],
                ['Host', selected.host],
                ['Source IP', selected.source_ip],
                ['Username', selected.username],
                ['Event ID', selected.event_id],
                ['Message', selected.message],
              ].filter(([, v]) => v != null && v !== '').map(([label, value]) => (
                <div key={label} style={s.fieldRow}>
                  <div style={s.fieldLabel}>{label}</div>
                  <div style={s.fieldValue}>{String(value)}</div>
                </div>
              ))}

              <ProcessTreePanel event={{ id: selected.log_id || selected.id, process_name: selected.process_name, host: selected.host, message: selected.message }} />

              <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Create Case from Alert</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    style={{ ...s.input, flex: 1 }}
                    placeholder="Case title..."
                    value={caseTitle}
                    onChange={e => setCaseTitle(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && createCase()}
                  />
                  <button style={s.btn} onClick={createCase} disabled={creating || !caseTitle.trim()}>
                    {creating ? '...' : 'Create Case'}
                  </button>
                </div>
              </div>
            </div>
            <div style={s.modalActions}>
              {STATUS_OPTIONS.filter(st => st !== selected.status).map(st => (
                <button key={st} style={s.btn} onClick={() => setStatus(selected, st)}>
                  Mark {st}
                </button>
              ))}
              <button
                style={{ ...s.btn, marginLeft: 'auto', color: 'var(--severity-critical)', borderColor: 'var(--severity-critical)' }}
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div style={s.overlay} onClick={() => setConfirmDelete(false)}>
          <div style={{ ...s.modal, width: '380px', maxHeight: 'unset' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-primary)', letterSpacing: '0.04em' }}>Delete Alert</span>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '16px', cursor: 'pointer', fontFamily: 'var(--font)' }} onClick={() => setConfirmDelete(false)}>✕</button>
            </div>
            <div style={{ padding: '20px 16px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Delete <span style={{ color: 'var(--text-primary)' }}>{selected?.title}</span>? This cannot be undone.
            </div>
            <div style={s.modalActions}>
              <button style={s.btn} onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button
                style={{ ...s.btn, color: 'var(--severity-critical)', borderColor: 'var(--severity-critical)' }}
                onClick={() => { deleteAlert(selected); setConfirmDelete(false); }}
              >Delete</button>
            </div>
          </div>
        </div>
      )}

      {confirmBulkDelete && (
        <div style={s.overlay} onClick={() => setConfirmBulkDelete(false)}>
          <div style={{ ...s.modal, width: '380px', maxHeight: 'unset' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-primary)', letterSpacing: '0.04em' }}>Delete Alerts</span>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '16px', cursor: 'pointer', fontFamily: 'var(--font)' }} onClick={() => setConfirmBulkDelete(false)}>✕</button>
            </div>
            <div style={{ padding: '20px 16px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Delete <span style={{ color: 'var(--text-primary)' }}>{selectedIds.size} alert{selectedIds.size !== 1 ? 's' : ''}</span>? This cannot be undone.
            </div>
            <div style={s.modalActions}>
              <button style={s.btn} onClick={() => setConfirmBulkDelete(false)}>Cancel</button>
              <button
                style={{ ...s.btn, color: 'var(--severity-critical)', borderColor: 'var(--severity-critical)' }}
                onClick={() => { bulkAction('delete'); setConfirmBulkDelete(false); }}
              >Delete</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={s.toast}>{toast}</div>}
    </div>
  );
}
