import { useState, useEffect, useCallback } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useIsMobile } from '../hooks/useIsMobile.js';

const SEV_COLOR = {
  critical: 'var(--severity-critical)',
  high: 'var(--severity-high)',
  medium: 'var(--severity-medium)',
  low: 'var(--severity-low)',
  info: 'var(--severity-info)',
};

const STATUS_OPTIONS = ['open', 'investigating', 'resolved', 'closed'];
const SEVERITY_OPTIONS = ['critical', 'high', 'medium', 'low', 'info'];

const s = {
  container: { padding: 0 },
  header: {
    padding: '12px 20px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: '12px',
  },
  title: { fontSize: '13px', color: 'var(--text-primary)', letterSpacing: '0.04em' },
  sub: { color: 'var(--text-muted)', fontSize: '11px' },
  actions: { marginLeft: 'auto', display: 'flex', gap: '8px' },
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
  filterBar: {
    padding: '10px 20px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)', display: 'flex', gap: '8px', alignItems: 'center',
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left', padding: '8px 14px', fontSize: '10px', letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)',
    fontWeight: 'normal', background: 'var(--bg-surface)',
  },
  td: {
    padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)',
    fontSize: '12px', color: 'var(--text-muted)', verticalAlign: 'top',
  },
  sevBadge: (color) => ({
    fontSize: '10px', padding: '2px 7px', letterSpacing: '0.06em',
    textTransform: 'uppercase', border: `1px solid ${color}`, color, whiteSpace: 'nowrap',
  }),
  statusBadge: (status) => {
    const colors = { open: 'var(--severity-info)', investigating: 'var(--severity-medium)', resolved: 'var(--severity-low)', closed: 'var(--text-muted)' };
    return { fontSize: '10px', padding: '2px 7px', letterSpacing: '0.06em', textTransform: 'uppercase', border: `1px solid ${colors[status] || 'var(--border)'}`, color: colors[status] || 'var(--text-muted)', whiteSpace: 'nowrap' };
  },
  muted: { padding: '40px 20px', color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: 'var(--bg-primary)', border: '1px solid var(--border)', width: '700px', maxWidth: '95vw', height: '85vh', display: 'flex', flexDirection: 'column' },
  modalHeader: { padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: '12px', color: 'var(--text-primary)', letterSpacing: '0.04em' },
  modalClose: { background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '16px', cursor: 'pointer', fontFamily: 'var(--font)' },
  modalBody: { flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' },
  modalSection: { padding: '14px 16px', borderBottom: '1px solid var(--border)' },
  modalSectionTitle: { fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' },
  modalActions: { padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', gap: '8px' },
  fieldRow: { display: 'grid', gridTemplateColumns: '120px 1fr', alignItems: 'start', gap: '12px', marginBottom: '8px' },
  label: { fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.04em', paddingTop: '6px' },
  input: {
    background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)',
    fontFamily: 'var(--font)', fontSize: '12px', padding: '5px 8px', outline: 'none', width: '100%', boxSizing: 'border-box',
  },
  textarea: {
    background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)',
    fontFamily: 'var(--font)', fontSize: '12px', padding: '5px 8px', outline: 'none', width: '100%', boxSizing: 'border-box',
    resize: 'vertical', minHeight: '80px',
  },
  select: {
    background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)',
    fontFamily: 'var(--font)', fontSize: '12px', padding: '5px 8px', outline: 'none',
  },
  alertRow: {
    padding: '8px 0', borderBottom: '1px solid var(--border-subtle)',
    display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: 'var(--text-muted)',
  },
  newForm: {
    padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px',
  },
};

function sevColor(sev) { return SEV_COLOR[(sev || '').toLowerCase()] || 'var(--text-muted)'; }

export function Cases({ onNavigate }) {
  const isMobile = useIsMobile();
  const { getAccessTokenSilently } = useAuth0();
  const [cases, setCases] = useState([]);
  const [statusFilter, setStatusFilter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [caseAlerts, setCaseAlerts] = useState([]);
  const [newFormOpen, setNewFormOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', severity: 'medium' });
  const [saving, setSaving] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAccessTokenSilently();
      const res = await fetch('/api/siem/cases', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setCases(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [getAccessTokenSilently]);

  useEffect(() => { load(); }, [load]);

  async function loadCaseAlerts(caseId) {
    const token = await getAccessTokenSilently();
    const res = await fetch(`/api/siem/cases/${caseId}/alerts`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    setCaseAlerts(Array.isArray(data) ? data : []);
  }

  function openCase(c) {
    setSelected(c);
    setEditingDesc(false);
    loadCaseAlerts(c.id);
  }

  async function updateCase(caseId, patch) {
    const token = await getAccessTokenSilently();
    const res = await fetch(`/api/siem/cases/${caseId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const updated = await res.json();
    setCases(prev => prev.map(c => c.id === updated.id ? { ...c, ...updated } : c));
    setSelected(prev => prev?.id === updated.id ? { ...prev, ...updated } : prev);
  }

  async function deleteCase(c) {
    const token = await getAccessTokenSilently();
    await fetch(`/api/siem/cases/${c.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setCases(prev => prev.filter(x => x.id !== c.id));
    setSelected(null);
  }

  async function createCase() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const token = await getAccessTokenSilently();
      const res = await fetch('/api/siem/cases', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const newCase = await res.json();
      setCases(prev => [{ ...newCase, alert_count: 0 }, ...prev]);
      setNewFormOpen(false);
      setForm({ title: '', description: '', severity: 'medium' });
    } finally {
      setSaving(false);
    }
  }

  const filtered = statusFilter ? cases.filter(c => c.status === statusFilter) : cases;
  const statusCounts = {};
  cases.forEach(c => { statusCounts[c.status] = (statusCounts[c.status] || 0) + 1; });

  return (
    <div style={s.container}>
      <div style={isMobile ? { ...s.header, flexWrap: 'wrap', gap: '8px' } : s.header}>
        <span style={s.title}>SIEM &nbsp;<span style={s.sub}>/ Cases</span></span>
        <div style={isMobile ? { display: 'flex', gap: '8px' } : s.actions}>
          <button style={s.btn} onClick={() => onNavigate('alerts')}>Alert Queue</button>
          <button style={s.btnActive} onClick={() => setNewFormOpen(true)}>+ New Case</button>
        </div>
      </div>

      <div style={isMobile ? { ...s.filterBar, flexWrap: 'wrap' } : s.filterBar}>
        {[null, ...STATUS_OPTIONS].map(st => (
          <button key={st ?? 'all'} style={statusFilter === st ? s.btnActive : s.btn} onClick={() => setStatusFilter(st)}>
            {st ?? 'All'}{st && statusCounts[st] ? ` (${statusCounts[st]})` : ''}
          </button>
        ))}
      </div>

      {isMobile ? (
        <div>
          {!loading && !filtered.length && (
            <div style={s.muted}>
              {statusFilter ? `No ${statusFilter} cases.` : 'No cases yet. Cases are created from the Alert Queue or manually.'}
            </div>
          )}
          {filtered.map(c => (
            <div
              key={c.id}
              style={{ borderBottom: '1px solid var(--border-subtle)', padding: '12px 16px', cursor: 'pointer' }}
              onClick={() => openCase(c)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={s.sevBadge(sevColor(c.severity))}>{c.severity}</span>
                <span style={s.statusBadge(c.status)}>{c.status}</span>
                <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted)' }}>{c.alert_count || 0} alerts</span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 500, marginBottom: '4px' }}>{c.title}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{new Date(c.created_at).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={s.table}>
            <thead>
              <tr>
                {['Title', 'Severity', 'Status', 'Alerts', 'Created', 'Updated'].map(h => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!loading && !filtered.length && (
                <tr><td colSpan={6} style={s.muted}>
                  {statusFilter ? `No ${statusFilter} cases.` : 'No cases yet. Cases are created from the Alert Queue or manually.'}
                </td></tr>
              )}
              {filtered.map(c => (
                <tr
                  key={c.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => openCase(c)}
                  onMouseEnter={e => Array.from(e.currentTarget.cells).forEach(td => td.style.background = 'var(--bg-surface)')}
                  onMouseLeave={e => Array.from(e.currentTarget.cells).forEach(td => td.style.background = '')}
                >
                  <td style={{ ...s.td, color: 'var(--text-primary)', fontWeight: 500 }}>{c.title}</td>
                  <td style={s.td}><span style={s.sevBadge(sevColor(c.severity))}>{c.severity}</span></td>
                  <td style={s.td}><span style={s.statusBadge(c.status)}>{c.status}</span></td>
                  <td style={s.td}>{c.alert_count || 0}</td>
                  <td style={s.td}>{new Date(c.created_at).toLocaleDateString()}</td>
                  <td style={s.td}>{new Date(c.updated_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Case detail modal */}
      {selected && (
        <div style={s.overlay} onClick={() => setSelected(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <span style={s.modalTitle}>
                Case #{selected.id} &nbsp;·&nbsp;
                <span style={{ color: sevColor(selected.severity) }}>{selected.severity}</span>
                &nbsp;·&nbsp;
                <span style={{ color: 'var(--text-muted)' }}>{selected.status}</span>
              </span>
              <button style={s.modalClose} onClick={() => setSelected(null)}>✕</button>
            </div>

            <div style={s.modalBody}>
              {/* Title + metadata */}
              <div style={s.modalSection}>
                <div style={{ fontSize: '14px', color: 'var(--text-primary)', marginBottom: '10px', fontWeight: 500 }}>{selected.title}</div>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
                  <div>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginRight: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Status</span>
                    <select
                      style={{ ...s.select, fontSize: '11px', padding: '3px 6px' }}
                      value={selected.status}
                      onChange={e => updateCase(selected.id, { status: e.target.value })}
                    >
                      {STATUS_OPTIONS.map(st => <option key={st} value={st}>{st}</option>)}
                    </select>
                  </div>
                  <div>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginRight: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Severity</span>
                    <select
                      style={{ ...s.select, fontSize: '11px', padding: '3px 6px' }}
                      value={selected.severity}
                      onChange={e => updateCase(selected.id, { severity: e.target.value })}
                    >
                      {SEVERITY_OPTIONS.map(sv => <option key={sv} value={sv}>{sv}</option>)}
                    </select>
                  </div>
                </div>

                {/* Description */}
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Description</div>
                {editingDesc ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <textarea
                      style={s.textarea}
                      value={descDraft}
                      onChange={e => setDescDraft(e.target.value)}
                      autoFocus
                    />
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button style={s.btnActive} onClick={() => { updateCase(selected.id, { description: descDraft }); setEditingDesc(false); }}>Save</button>
                      <button style={s.btn} onClick={() => setEditingDesc(false)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{ fontSize: '12px', color: selected.description ? 'var(--text-primary)' : 'var(--text-muted)', cursor: 'pointer', padding: '4px 0', minHeight: '24px' }}
                    onClick={() => { setDescDraft(selected.description || ''); setEditingDesc(true); }}
                    title="Click to edit"
                  >
                    {selected.description || 'Click to add description...'}
                  </div>
                )}
              </div>

              {/* Linked alerts */}
              <div style={s.modalSection}>
                <div style={s.modalSectionTitle}>Linked Alerts ({caseAlerts.length})</div>
                {!caseAlerts.length && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    No alerts linked. Open an alert from the Alert Queue and use "Create Case" to link it here.
                  </div>
                )}
                {caseAlerts.map(a => (
                  <div key={a.id} style={s.alertRow}>
                    <span style={{ ...s.sevBadge(sevColor(a.severity)), fontSize: '9px' }}>{a.severity}</span>
                    <span style={{ color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
                    <span style={{ fontSize: '11px', flexShrink: 0 }}>{a.host || '—'}</span>
                    <span style={{ fontSize: '11px', flexShrink: 0, color: 'var(--text-muted)' }}>{new Date(a.created_at).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>

              {/* Timeline */}
              <div style={s.modalSection}>
                <div style={s.modalSectionTitle}>Timeline</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div>Created: {new Date(selected.created_at).toLocaleString()}</div>
                  <div>Updated: {new Date(selected.updated_at).toLocaleString()}</div>
                </div>
              </div>
            </div>

            <div style={s.modalActions}>
              <button
                style={{ ...s.btn, color: 'var(--severity-critical)', borderColor: 'var(--severity-critical)' }}
                onClick={() => setConfirmDelete(true)}
              >Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* New case form */}
      {newFormOpen && (
        <div style={s.overlay} onClick={() => setNewFormOpen(false)}>
          <div style={{ ...s.modal, height: 'auto', maxHeight: '60vh' }} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <span style={s.modalTitle}>New Case</span>
              <button style={s.modalClose} onClick={() => setNewFormOpen(false)}>✕</button>
            </div>
            <div style={s.newForm}>
              <div style={isMobile ? { display: 'flex', flexDirection: 'column', gap: '4px' } : s.fieldRow}>
                <span style={s.label}>Title *</span>
                <input style={s.input} value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Suspicious Lateral Movement" autoFocus />
              </div>
              <div style={isMobile ? { display: 'flex', flexDirection: 'column', gap: '4px' } : s.fieldRow}>
                <span style={s.label}>Description</span>
                <textarea style={s.textarea} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional" />
              </div>
              <div style={isMobile ? { display: 'flex', flexDirection: 'column', gap: '4px' } : s.fieldRow}>
                <span style={s.label}>Severity</span>
                <select style={{ ...s.select, width: 'auto' }} value={form.severity} onChange={e => setForm(p => ({ ...p, severity: e.target.value }))}>
                  {SEVERITY_OPTIONS.map(sv => <option key={sv} value={sv}>{sv}</option>)}
                </select>
              </div>
            </div>
            <div style={{ ...s.modalActions, justifyContent: 'flex-end' }}>
              <button style={s.btn} onClick={() => setNewFormOpen(false)}>Cancel</button>
              <button style={s.btnActive} onClick={createCase} disabled={saving || !form.title.trim()}>
                {saving ? 'Creating...' : 'Create Case'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div style={s.overlay} onClick={() => setConfirmDelete(false)}>
          <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', width: '380px', maxWidth: '95vw', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-primary)', letterSpacing: '0.04em' }}>Delete Case</span>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '16px', cursor: 'pointer', fontFamily: 'var(--font)' }} onClick={() => setConfirmDelete(false)}>✕</button>
            </div>
            <div style={{ padding: '20px 16px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Delete <span style={{ color: 'var(--text-primary)' }}>{selected?.title}</span>? This cannot be undone.
            </div>
            <div style={s.modalActions}>
              <button style={s.btn} onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button
                style={{ ...s.btn, color: 'var(--severity-critical)', borderColor: 'var(--severity-critical)' }}
                onClick={() => { deleteCase(selected); setConfirmDelete(false); }}
              >Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
