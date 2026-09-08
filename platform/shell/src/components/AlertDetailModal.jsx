import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { ProcessTreePanel } from './ProcessTreePanel.jsx';
import { TimeFieldValue } from './ui/index.js';

// Canonical alert-detail modal. Shared by the Alert Queue and the dashboard
// Alert Trend drill-down so both open the exact same triage surface: event
// fields, Process Tree, Create/Add-to Case, Mark status, and Delete.
const SEV_COLOR = { critical: 'var(--severity-critical)', high: 'var(--severity-high)', medium: 'var(--severity-medium)', low: 'var(--severity-low)', info: 'var(--severity-info)' };
const sevColor = (sv) => SEV_COLOR[(sv || '').toLowerCase()] || 'var(--text-muted)';
const STATUS_OPTIONS = ['new', 'acknowledged', 'resolved'];

const s = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: 'var(--bg-primary)', border: '1px solid var(--border)', width: '600px', maxWidth: '95vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column' },
  modalHeader: { padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: '12px', color: 'var(--text-primary)', letterSpacing: '0.04em' },
  modalClose: { background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '16px', cursor: 'pointer', fontFamily: 'var(--font)' },
  modalBody: { padding: '16px', overflow: 'auto', flex: 1 },
  fieldRow: { display: 'grid', gridTemplateColumns: '140px 1fr', borderBottom: '1px solid var(--border-subtle)', padding: '6px 0', gap: '12px' },
  fieldLabel: { fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingTop: '2px' },
  fieldValue: { fontSize: '12px', color: 'var(--text-primary)', wordBreak: 'break-word', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)' },
  modalActions: { padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px', background: 'var(--bg-surface)' },
  btn: { background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', fontFamily: 'var(--font)', fontSize: '11px', padding: '4px 12px', cursor: 'pointer', letterSpacing: '0.04em' },
  input: { background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'var(--font)', fontSize: '12px', padding: '6px 10px', outline: 'none', letterSpacing: '0.02em', width: '100%', boxSizing: 'border-box' },
};

// alert: the alert row (id may be `id` or `alert_id`). onClose(); onNavigate(view);
// onStatusChange(id, status) + onDeleted(id) let a parent sync its own list.
export function AlertDetailModal({ alert, onClose, onNavigate, onStatusChange, onDeleted }) {
  const { getAccessTokenSilently } = useAuth0();
  const alertId = alert?.id ?? alert?.alert_id;
  const [status, setStatusLocal] = useState(alert?.status || 'new');
  const [caseTitle, setCaseTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [cases, setCases] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [addingToCase, setAddingToCase] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => { setStatusLocal(alert?.status || 'new'); }, [alertId, alert?.status]);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const token = await getAccessTokenSilently();
        const res = await fetch('/api/siem/cases', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (live) { setCases(Array.isArray(data) ? data : []); setSelectedCaseId(''); }
      } catch {}
    })();
    return () => { live = false; };
  }, [alertId, getAccessTokenSilently]);

  async function setStatus(next) {
    const token = await getAccessTokenSilently();
    await fetch(`/api/siem/alerts/${alertId}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }) });
    setStatusLocal(next);
    onStatusChange?.(alertId, next);
  }
  async function deleteAlert() {
    const token = await getAccessTokenSilently();
    await fetch(`/api/siem/alerts/${alertId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    onDeleted?.(alertId);
    onClose?.();
  }
  async function addToCase() {
    if (!selectedCaseId) return;
    setAddingToCase(true);
    try {
      const token = await getAccessTokenSilently();
      await fetch(`/api/siem/cases/${selectedCaseId}/alerts`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ alert_id: alertId }) });
      setSelectedCaseId('');
    } catch {} finally { setAddingToCase(false); }
  }
  async function createCase() {
    if (!caseTitle.trim()) return;
    setCreating(true);
    try {
      const token = await getAccessTokenSilently();
      const caseRes = await fetch('/api/siem/cases', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ title: caseTitle.trim(), severity: alert.severity }) });
      const newCase = await caseRes.json();
      await fetch(`/api/siem/cases/${newCase.id}/alerts`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ alert_id: alertId }) });
      setCaseTitle('');
      onClose?.();
      onNavigate?.('cases');
    } finally { setCreating(false); }
  }

  if (!alert) return null;

  return (
    <>
      <div style={s.overlay} onClick={onClose}>
        <div style={s.modal} onClick={e => e.stopPropagation()}>
          <div style={s.modalHeader}>
            <span style={s.modalTitle}>{alert.title} &nbsp;&nbsp;&nbsp; <span style={{ color: sevColor(alert.severity) }}>{alert.severity}</span></span>
            <button style={s.modalClose} onClick={onClose}>✕</button>
          </div>
          <div className="kudo-scroll" style={s.modalBody}>
            {[
              ['Time', <TimeFieldValue times={alert.occurrence_times} count={alert.count} fallback={alert.created_at ? new Date(alert.created_at).toLocaleString() : (alert.last_seen ? new Date(alert.last_seen).toLocaleString() : null)} />],
              ['Status', status],
              ['Severity', alert.severity],
              ['Rule', alert.rule_name],
              ['Host', alert.host],
              ['Source IP', alert.source_ip],
              ['Username', alert.username],
              ['Event ID', alert.event_id],
              ['Message', alert.message],
            ].filter(([, v]) => v != null && v !== '').map(([label, value]) => (
              <div key={label} style={s.fieldRow}>
                <div style={s.fieldLabel}>{label}</div>
                <div style={s.fieldValue}>{typeof value === 'object' ? value : String(value)}</div>
              </div>
            ))}

            <ProcessTreePanel event={{ id: alert.log_id || alert.id, process_name: alert.process_name, host: alert.host, message: alert.message }} />

            <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Create Case from Alert</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input style={{ ...s.input, flex: 1 }} placeholder="Case title..." value={caseTitle} onChange={e => setCaseTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && createCase()} />
                <button style={s.btn} onClick={createCase} disabled={creating || !caseTitle.trim()}>{creating ? '...' : 'Create Case'}</button>
              </div>
            </div>
            {cases.length > 0 && (
              <div style={{ marginTop: '10px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Add to Existing Case</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select style={{ ...s.input, flex: 1 }} value={selectedCaseId} onChange={e => setSelectedCaseId(e.target.value)}>
                    <option value="">Select a case...</option>
                    {cases.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                  <button style={s.btn} onClick={addToCase} disabled={addingToCase || !selectedCaseId}>{addingToCase ? '...' : 'Add'}</button>
                </div>
              </div>
            )}
          </div>
          <div style={s.modalActions}>
            {STATUS_OPTIONS.filter(st => st !== status).map(st => (
              <button key={st} style={s.btn} onClick={() => setStatus(st)}>Mark {st}</button>
            ))}
            <button style={{ ...s.btn, marginLeft: 'auto', color: 'var(--severity-critical)', borderColor: 'var(--severity-critical)' }} onClick={() => setConfirmDelete(true)}>Delete</button>
          </div>
        </div>
      </div>

      {confirmDelete && (
        <div style={s.overlay} onClick={() => setConfirmDelete(false)}>
          <div style={{ ...s.modal, width: '380px', maxHeight: 'unset' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-primary)', letterSpacing: '0.04em' }}>Delete Alert</span>
              <button style={s.modalClose} onClick={() => setConfirmDelete(false)}>✕</button>
            </div>
            <div style={{ padding: '20px 16px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Delete <span style={{ color: 'var(--text-primary)' }}>{alert.title}</span>? This cannot be undone.
            </div>
            <div style={s.modalActions}>
              <button style={s.btn} onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button style={{ ...s.btn, color: 'var(--severity-critical)', borderColor: 'var(--severity-critical)' }} onClick={() => { deleteAlert(); setConfirmDelete(false); }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
