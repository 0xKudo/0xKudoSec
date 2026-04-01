import { useState, useEffect, useCallback } from 'react';
import { useAuth0 } from '@auth0/auth0-react';

const SEV_COLOR = {
  critical: 'var(--severity-critical)',
  high: 'var(--severity-high)',
  medium: 'var(--severity-medium)',
  low: 'var(--severity-low)',
  info: 'var(--severity-info)',
};

const EMPTY_FORM = {
  name: '', description: '', severity: 'high', enabled: true, action: 'alert',
  match_event_id: '', match_category: '', match_severity: '',
  match_username: '', match_host: '', match_message: '',
  match_process: '', match_src_ip: '', match_dest_ip: '',
};

const CATEGORIES = ['', 'authentication', 'network', 'process', 'file', 'dns', 'registry', 'system', 'firewall', 'account', 'policy'];
const SEVERITIES = ['', 'critical', 'high', 'medium', 'low', 'info'];

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
  btnPrimary: {
    background: 'var(--btn-primary-bg)', border: '1px solid var(--border)', color: 'var(--btn-primary-text)',
    fontFamily: 'var(--font)', fontSize: '11px', padding: '4px 12px', cursor: 'pointer',
    letterSpacing: '0.04em',
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left', padding: '8px 14px', fontSize: '10px', letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)',
    fontWeight: 'normal', background: 'var(--bg-surface)',
  },
  td: {
    padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)',
    fontSize: '12px', color: 'var(--text-muted)', verticalAlign: 'middle',
  },
  sevBadge: (color) => ({
    fontSize: '10px', padding: '2px 7px', letterSpacing: '0.06em',
    textTransform: 'uppercase', border: `1px solid ${color}`, color,
  }),
  muted: { padding: '40px 20px', color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: 'var(--bg-primary)', border: '1px solid var(--border)', width: '580px', maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' },
  modalHeader: { padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: '12px', color: 'var(--text-primary)', letterSpacing: '0.04em' },
  modalClose: { background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '16px', cursor: 'pointer', fontFamily: 'var(--font)' },
  modalBody: { padding: '16px', overflow: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' },
  modalActions: { padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px', background: 'var(--bg-surface)', justifyContent: 'flex-end' },
  formRow: { display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', gap: '12px' },
  label: { fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.04em' },
  input: {
    background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)',
    fontFamily: 'var(--font)', fontSize: '12px', padding: '5px 8px', outline: 'none', width: '100%', boxSizing: 'border-box',
  },
  select: {
    background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)',
    fontFamily: 'var(--font)', fontSize: '12px', padding: '5px 8px', outline: 'none', width: '100%',
  },
  sectionDivider: { fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '4px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' },
  hint: { fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' },
};

function sevColor(sev) { return SEV_COLOR[(sev || '').toLowerCase()] || 'var(--text-muted)'; }

function conditionSummary(rule) {
  const parts = [];
  if (rule.match_event_id) parts.push(`event_id=${rule.match_event_id}`);
  if (rule.match_category) parts.push(`category=${rule.match_category}`);
  if (rule.match_severity) parts.push(`severity=${rule.match_severity}`);
  if (rule.match_username) parts.push(`user~${rule.match_username}`);
  if (rule.match_host) parts.push(`host~${rule.match_host}`);
  if (rule.match_message) parts.push(`msg~${rule.match_message}`);
  if (rule.match_process) parts.push(`process~${rule.match_process}`);
  if (rule.match_src_ip) parts.push(`src~${rule.match_src_ip}`);
  if (rule.match_dest_ip) parts.push(`dst~${rule.match_dest_ip}`);
  return parts.length ? parts.join(' AND ') : 'no conditions';
}

export function DetectionRules({ onNavigate }) {
  const { getAccessTokenSilently } = useAuth0();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null); // rule to delete
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAccessTokenSilently();
      const res = await fetch('/api/siem/rules', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setRules(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [getAccessTokenSilently]);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(rule) {
    setEditing(rule);
    setForm({
      name: rule.name || '', description: rule.description || '',
      severity: rule.severity || 'high', enabled: rule.enabled !== false, action: rule.action || 'alert',
      match_event_id: rule.match_event_id ?? '', match_category: rule.match_category ?? '',
      match_severity: rule.match_severity ?? '', match_username: rule.match_username ?? '',
      match_host: rule.match_host ?? '', match_message: rule.match_message ?? '',
      match_process: rule.match_process ?? '', match_src_ip: rule.match_src_ip ?? '',
      match_dest_ip: rule.match_dest_ip ?? '',
    });
    setFormOpen(true);
  }

  function set(key, value) { setForm(prev => ({ ...prev, [key]: value })); }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const token = await getAccessTokenSilently();
      const body = { ...form };
      // Convert empty strings to null for numeric/enum fields
      if (body.match_event_id === '' || body.match_event_id === null) body.match_event_id = null;
      else body.match_event_id = parseInt(body.match_event_id, 10) || null;
      ['match_category','match_severity','match_username','match_host',
       'match_message','match_process','match_src_ip','match_dest_ip'].forEach(k => {
        if (body[k] === '') body[k] = null;
      });

      const url = editing ? `/api/siem/rules/${editing.id}` : '/api/siem/rules';
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const saved = await res.json();
      if (editing) {
        setRules(prev => prev.map(r => r.id === saved.id ? saved : r));
      } else {
        setRules(prev => [saved, ...prev]);
      }
      setFormOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(rule) {
    const token = await getAccessTokenSilently();
    const res = await fetch(`/api/siem/rules/${rule.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    const updated = await res.json();
    setRules(prev => prev.map(r => r.id === updated.id ? updated : r));
  }

  async function deleteRule(rule) {
    const token = await getAccessTokenSilently();
    await fetch(`/api/siem/rules/${rule.id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    });
    setRules(prev => prev.filter(r => r.id !== rule.id));
    setFormOpen(false);
  }

  return (
    <div style={s.container}>
      <div style={s.header}>
        <span style={s.title}>SIEM &nbsp;<span style={s.sub}>/ Detection Rules</span></span>
        <div style={s.actions}>
          <button style={s.btn} onClick={() => onNavigate('alerts')}>Alert Queue</button>
          <button style={s.btnPrimary} onClick={openNew}>+ New Rule</button>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={s.table}>
          <thead>
            <tr>
              {['Name', 'Action', 'Severity', 'Conditions', 'Enabled', ''].map(h => (
                <th key={h} style={s.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading && !rules.length && (
              <tr><td colSpan={6} style={s.muted}>No rules yet. Create a rule to auto-generate alerts when logs match.</td></tr>
            )}
            {rules.map(rule => (
              <tr
                key={rule.id}
                style={{ cursor: 'pointer', opacity: rule.enabled ? 1 : 0.5 }}
                onClick={() => openEdit(rule)}
                onMouseEnter={e => Array.from(e.currentTarget.cells).forEach(c => c.style.background = 'var(--bg-surface)')}
                onMouseLeave={e => Array.from(e.currentTarget.cells).forEach(c => c.style.background = '')}
              >
                <td style={{ ...s.td, color: 'var(--text-primary)' }}>{rule.name}</td>
                <td style={s.td}>
                  <span style={{
                    fontSize: '10px', padding: '2px 7px', letterSpacing: '0.06em', textTransform: 'uppercase',
                    border: `1px solid ${rule.action === 'suppress' ? 'var(--text-muted)' : 'var(--severity-info)'}`,
                    color: rule.action === 'suppress' ? 'var(--text-muted)' : 'var(--severity-info)',
                  }}>{rule.action || 'alert'}</span>
                </td>
                <td style={s.td}><span style={s.sevBadge(sevColor(rule.severity))}>{rule.severity}</span></td>
                <td style={{ ...s.td, fontFamily: 'var(--font)', fontSize: '11px', maxWidth: '340px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {conditionSummary(rule)}
                </td>
                <td style={s.td} onClick={e => { e.stopPropagation(); toggleEnabled(rule); }}>
                  <span style={{ cursor: 'pointer', color: rule.enabled ? 'var(--severity-low)' : 'var(--text-muted)' }}>
                    {rule.enabled ? 'enabled' : 'disabled'}
                  </span>
                </td>
                <td style={s.td}>
                  <button style={{ ...s.btn, padding: '2px 8px' }} onClick={e => { e.stopPropagation(); openEdit(rule); }}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <div style={s.overlay} onClick={() => setFormOpen(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <span style={s.modalTitle}>{editing ? 'Edit Rule' : 'New Detection Rule'}</span>
              <button style={s.modalClose} onClick={() => setFormOpen(false)}>✕</button>
            </div>
            <div style={s.modalBody}>
              <div style={s.formRow}>
                <span style={s.label}>Name *</span>
                <input style={s.input} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Failed Login Spike" />
              </div>
              <div style={s.formRow}>
                <span style={s.label}>Description</span>
                <input style={s.input} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Optional" />
              </div>
              <div style={s.formRow}>
                <span style={s.label}>Action</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {['alert', 'suppress'].map(a => (
                    <label key={a} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', color: form.action === a ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      <input type="radio" name="action" value={a} checked={form.action === a} onChange={() => set('action', a)} />
                      <span style={{ textTransform: 'capitalize' }}>{a}</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        {a === 'alert' ? '— create alert when matched' : '— silently ignore matched events'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div style={s.formRow}>
                <span style={s.label}>Severity</span>
                <select style={s.select} value={form.severity} onChange={e => set('severity', e.target.value)}>
                  {['critical','high','medium','low','info'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div style={s.formRow}>
                <span style={s.label}>Enabled</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.enabled} onChange={e => set('enabled', e.target.checked)} />
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Active</span>
                </label>
              </div>

              <div style={s.sectionDivider}>Match Conditions (all filled fields must match)</div>
              <div style={s.hint}>Leave a field blank to ignore it. All non-blank conditions use AND logic.</div>

              <div style={s.formRow}>
                <span style={s.label}>Event ID</span>
                <input style={s.input} value={form.match_event_id} onChange={e => set('match_event_id', e.target.value)} placeholder="e.g. 4625" type="number" />
              </div>
              <div style={s.formRow}>
                <span style={s.label}>Category</span>
                <select style={s.select} value={form.match_category} onChange={e => set('match_category', e.target.value)}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c || '— any —'}</option>)}
                </select>
              </div>
              <div style={s.formRow}>
                <span style={s.label}>Log Severity</span>
                <select style={s.select} value={form.match_severity} onChange={e => set('match_severity', e.target.value)}>
                  {SEVERITIES.map(sv => <option key={sv} value={sv}>{sv || '— any —'}</option>)}
                </select>
              </div>
              <div style={s.formRow}>
                <span style={s.label}>Username contains</span>
                <input style={s.input} value={form.match_username} onChange={e => set('match_username', e.target.value)} placeholder="e.g. SYSTEM" />
              </div>
              <div style={s.formRow}>
                <span style={s.label}>Host contains</span>
                <input style={s.input} value={form.match_host} onChange={e => set('match_host', e.target.value)} placeholder="e.g. DESKTOP-" />
              </div>
              <div style={s.formRow}>
                <span style={s.label}>Message contains</span>
                <input style={s.input} value={form.match_message} onChange={e => set('match_message', e.target.value)} placeholder="e.g. failed" />
              </div>
              <div style={s.formRow}>
                <span style={s.label}>Process contains</span>
                <input style={s.input} value={form.match_process} onChange={e => set('match_process', e.target.value)} placeholder="e.g. powershell" />
              </div>
              <div style={s.formRow}>
                <span style={s.label}>Source IP contains</span>
                <input style={s.input} value={form.match_src_ip} onChange={e => set('match_src_ip', e.target.value)} placeholder="e.g. 192.168." />
              </div>
              <div style={s.formRow}>
                <span style={s.label}>Dest IP contains</span>
                <input style={s.input} value={form.match_dest_ip} onChange={e => set('match_dest_ip', e.target.value)} placeholder="e.g. 8.8.8" />
              </div>
            </div>
            <div style={s.modalActions}>
              {editing && (
                <button
                  style={{ ...s.btn, color: 'var(--severity-critical)', borderColor: 'var(--severity-critical)', marginRight: 'auto' }}
                  onClick={() => setConfirmDelete(editing)}
                >Delete</button>
              )}
              <button style={s.btn} onClick={() => setFormOpen(false)}>Cancel</button>
              <button style={s.btnPrimary} onClick={save} disabled={saving || !form.name.trim()}>
                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Rule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div style={s.overlay} onClick={() => setConfirmDelete(null)}>
          <div style={{ ...s.modal, width: '380px' }} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <span style={s.modalTitle}>Delete Rule</span>
              <button style={s.modalClose} onClick={() => setConfirmDelete(null)}>✕</button>
            </div>
            <div style={{ padding: '20px 16px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Delete <span style={{ color: 'var(--text-primary)' }}>{confirmDelete.name}</span>?
              <div style={{ marginTop: '8px', color: 'var(--severity-critical)' }}>
                All alerts generated by this rule will also be permanently deleted.
              </div>
            </div>
            <div style={s.modalActions}>
              <button style={s.btn} onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button
                style={{ ...s.btn, color: 'var(--severity-critical)', borderColor: 'var(--severity-critical)' }}
                onClick={() => { deleteRule(confirmDelete); setConfirmDelete(null); setFormOpen(false); }}
              >Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
