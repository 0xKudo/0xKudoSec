import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useIsMobile } from '../hooks/useIsMobile.js';

const SEV_COLOR = {
  critical: 'var(--severity-critical)',
  high: 'var(--severity-high)',
  medium: 'var(--severity-medium)',
  low: 'var(--severity-low)',
  info: 'var(--severity-info)',
};

const EMPTY_FORM = (action = 'alert') => ({
  name: '', description: '', severity: 'high', enabled: true, action,
  match_event_id: '', match_category: '', match_severity: '',
  match_username: '', match_host: '', match_message: '',
  match_process: '', match_src_ip: '', match_dest_ip: '', match_dest_port: '',
});

const CATEGORIES = ['', 'authentication', 'network', 'process', 'file', 'dns', 'registry', 'system', 'firewall', 'account', 'policy'];
const SEVERITIES = ['', 'critical', 'high', 'medium', 'low', 'info'];

const s = {
  container: { padding: 0, flex: 1, minHeight: 0, overflow: 'auto' },
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
  tabs: {
    display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)',
  },
  tab: (active) => ({
    padding: '8px 20px', fontSize: '11px', letterSpacing: '0.06em', textTransform: 'uppercase',
    cursor: 'pointer', border: 'none', background: 'none', fontFamily: 'var(--font)',
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    borderBottom: active ? '2px solid var(--text-primary)' : '2px solid transparent',
    marginBottom: '-1px',
  }),
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
  toast: {
    position: 'fixed', bottom: '24px', right: '24px', zIndex: 2000,
    background: 'var(--bg-surface)', border: '1px solid var(--border)',
    padding: '10px 16px', fontSize: '12px', color: 'var(--text-primary)',
  },
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
  if (rule.match_dest_port) parts.push(`port=${rule.match_dest_port}`);
  return parts.length ? parts.join(' AND ') : 'no conditions';
}

export function DetectionRules({ onNavigate }) {
  const isMobile = useIsMobile();
  const { getAccessTokenSilently } = useAuth0();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('alert'); // 'alert' | 'suppress'
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM('alert'));
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const importRef = useRef(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

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

  const visibleRules = rules.filter(r => (r.action || 'alert') === tab);

  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM(tab));
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
      match_dest_ip: rule.match_dest_ip ?? '', match_dest_port: rule.match_dest_port ?? '',
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
      if (body.match_event_id === '' || body.match_event_id === null) body.match_event_id = null;
      else body.match_event_id = parseInt(body.match_event_id, 10) || null;
      if (body.match_dest_port === '' || body.match_dest_port === null) body.match_dest_port = null;
      else body.match_dest_port = parseInt(body.match_dest_port, 10) || null;
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

  async function exportRules() {
    const token = await getAccessTokenSilently();
    const res = await fetch('/api/siem/rules/export', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'detection-rules.json'; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      showToast('Invalid JSON file.');
      return;
    }
    if (!Array.isArray(parsed)) { showToast('File must contain a JSON array of rules.'); return; }
    const token = await getAccessTokenSilently();
    const res = await fetch('/api/siem/rules/import', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed),
    });
    const result = await res.json();
    if (result.error) { showToast(result.error); return; }
    showToast(`Imported ${result.imported} rule${result.imported !== 1 ? 's' : ''}${result.skipped ? `, ${result.skipped} skipped (duplicate names)` : ''}.`);
    load();
  }

  const alertCount = rules.filter(r => (r.action || 'alert') === 'alert').length;
  const suppressCount = rules.filter(r => r.action === 'suppress').length;

  // Search + filter state
  const [searchInput, setSearchInput] = useState('');
  const [searchTerms, setSearchTerms] = useState([]); // committed terms
  const [sevFilters, setSevFilters] = useState(new Set()); // active severity filters

  function commitSearch() {
    const term = searchInput.trim();
    if (term && !searchTerms.includes(term)) {
      setSearchTerms(prev => [...prev, term]);
    }
    setSearchInput('');
  }

  function removeTerm(term) { setSearchTerms(prev => prev.filter(t => t !== term)); }

  function toggleSev(sev) {
    setSevFilters(prev => {
      const next = new Set(prev);
      next.has(sev) ? next.delete(sev) : next.add(sev);
      return next;
    });
  }

  const filteredRules = visibleRules.filter(rule => {
    if (sevFilters.size > 0 && !sevFilters.has(rule.severity)) return false;
    if (searchTerms.length === 0) return true;
    const haystack = [
      rule.name, rule.description, rule.match_process, rule.match_message,
      rule.match_username, rule.match_host, rule.match_src_ip, rule.match_dest_ip,
      rule.match_category, String(rule.match_event_id ?? ''),
    ].join(' ').toLowerCase();
    return searchTerms.every(t => haystack.includes(t.toLowerCase()));
  });

  return (
    <div style={s.container}>
      <div style={isMobile ? { ...s.header, flexWrap: 'wrap', gap: '8px' } : s.header}>
        <span style={s.title}>SIEM &nbsp;<span style={s.sub}>/ Detection Rules</span></span>
        <div style={isMobile ? { display: 'flex', gap: '8px', flexWrap: 'wrap' } : s.actions}>
          <button style={s.btn} onClick={() => onNavigate('alerts')}>Alert Queue</button>
          <button style={s.btn} onClick={exportRules}>Export JSON</button>
          <button style={s.btn} onClick={() => importRef.current?.click()}>Import JSON</button>
          <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
          <button style={s.btnPrimary} onClick={openNew}>+ New Rule</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={s.tabs}>
        <button style={s.tab(tab === 'alert')} onClick={() => setTab('alert')}>
          Alerts {alertCount > 0 && `(${alertCount})`}
        </button>
        <button style={s.tab(tab === 'suppress')} onClick={() => setTab('suppress')}>
          Suppression {suppressCount > 0 && `(${suppressCount})`}
        </button>
      </div>

      {/* Search + filter bar */}
      <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            style={{ ...s.input, flex: 1, minWidth: '180px', padding: '6px 10px' }}
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitSearch(); }}
            placeholder="Search rules… press Enter to add term"
            spellCheck={false}
          />
          <button style={s.btn} onClick={commitSearch}>Add</button>
          {searchTerms.length > 0 && (
            <button style={s.btn} onClick={() => setSearchTerms([])}>Clear</button>
          )}
        </div>
        {searchTerms.length > 0 && (
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: '4px' }}>Terms</span>
            {searchTerms.map(t => (
              <span
                key={t}
                style={{ fontSize: '11px', padding: '2px 8px', background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                onClick={() => removeTerm(t)}
              >{t} ✕</span>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: '4px' }}>Severity</span>
          {['critical','high','medium','low','info'].map(sev => (
            <button
              key={sev}
              style={{
                background: sevFilters.has(sev) ? sevColor(sev) : 'none',
                border: `1px solid ${sevColor(sev)}`,
                color: sevFilters.has(sev) ? 'var(--bg-primary)' : sevColor(sev),
                fontFamily: 'var(--font)', fontSize: '10px', padding: '2px 8px',
                cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase',
              }}
              onClick={() => toggleSev(sev)}
            >{sev}</button>
          ))}
          {sevFilters.size > 0 && (
            <button style={{ ...s.btn, fontSize: '10px', padding: '2px 8px' }} onClick={() => setSevFilters(new Set())}>Clear</button>
          )}
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
          {filteredRules.length} of {visibleRules.length} {tab} rules
        </div>
      </div>

      {isMobile ? (
        <div>
          {!loading && !filteredRules.length && (
            <div style={s.muted}>{visibleRules.length === 0 ? `No ${tab} rules yet. Tap "+ New Rule" to create one.` : 'No rules match your search.'}</div>
          )}
          {filteredRules.map(rule => (
            <div
              key={rule.id}
              style={{ borderBottom: '1px solid var(--border-subtle)', padding: '12px 16px', opacity: rule.enabled ? 1 : 0.5, cursor: 'pointer' }}
              onClick={() => openEdit(rule)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={s.sevBadge(sevColor(rule.severity))}>{rule.severity}</span>
                <span
                  style={{ marginLeft: 'auto', fontSize: '11px', cursor: 'pointer', color: rule.enabled ? 'var(--severity-low)' : 'var(--text-muted)' }}
                  onClick={e => { e.stopPropagation(); toggleEnabled(rule); }}
                >{rule.enabled ? 'enabled' : 'disabled'}</span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginBottom: '4px' }}>{rule.name}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {conditionSummary(rule)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={s.table}>
            <thead>
              <tr>
                {['Name', 'Severity', 'Conditions', 'Enabled', ''].map(h => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!loading && !filteredRules.length && (
                <tr><td colSpan={5} style={s.muted}>
                  {visibleRules.length === 0
                    ? (tab === 'alert'
                        ? 'Create a rule to auto-generate alerts when logs match.'
                        : 'Create a suppression rule to hide noisy benign events from the log feed.')
                    : 'No rules match your search.'}
                </td></tr>
              )}
              {filteredRules.map(rule => (
                <tr
                  key={rule.id}
                  style={{ cursor: 'pointer', opacity: rule.enabled ? 1 : 0.5 }}
                  onClick={() => openEdit(rule)}
                  onMouseEnter={e => Array.from(e.currentTarget.cells).forEach(c => c.style.background = 'var(--bg-surface)')}
                  onMouseLeave={e => Array.from(e.currentTarget.cells).forEach(c => c.style.background = '')}
                >
                  <td style={{ ...s.td, color: 'var(--text-primary)' }}>{rule.name}</td>
                  <td style={s.td}><span style={s.sevBadge(sevColor(rule.severity))}>{rule.severity}</span></td>
                  <td style={{ ...s.td, fontFamily: 'var(--font)', fontSize: '11px', maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
      )}

      {formOpen && (
        <div style={s.overlay} onClick={() => setFormOpen(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <span style={s.modalTitle}>{editing ? 'Edit Rule' : 'New Detection Rule'}</span>
              <button style={s.modalClose} onClick={() => setFormOpen(false)}>✕</button>
            </div>
            <div style={s.modalBody}>
              <div style={isMobile ? { display: 'flex', flexDirection: 'column', gap: '4px' } : s.formRow}>
                <span style={s.label}>Name *</span>
                <input style={s.input} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Failed Login Spike" />
              </div>
              <div style={isMobile ? { display: 'flex', flexDirection: 'column', gap: '4px' } : s.formRow}>
                <span style={s.label}>Description</span>
                <input style={s.input} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Optional" />
              </div>
              <div style={isMobile ? { display: 'flex', flexDirection: 'column', gap: '4px' } : s.formRow}>
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
              <div style={isMobile ? { display: 'flex', flexDirection: 'column', gap: '4px' } : s.formRow}>
                <span style={s.label}>Severity</span>
                <select style={s.select} value={form.severity} onChange={e => set('severity', e.target.value)}>
                  {['critical','high','medium','low','info'].map(sv => <option key={sv} value={sv}>{sv}</option>)}
                </select>
              </div>
              <div style={isMobile ? { display: 'flex', flexDirection: 'column', gap: '4px' } : s.formRow}>
                <span style={s.label}>Enabled</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.enabled} onChange={e => set('enabled', e.target.checked)} />
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Active</span>
                </label>
              </div>

              <div style={s.sectionDivider}>Match Conditions (all filled fields must match)</div>
              <div style={s.hint}>Leave a field blank to ignore it. All non-blank conditions use AND logic.</div>

              <div style={isMobile ? { display: 'flex', flexDirection: 'column', gap: '4px' } : s.formRow}>
                <span style={s.label}>Event ID</span>
                <input style={s.input} value={form.match_event_id} onChange={e => set('match_event_id', e.target.value)} placeholder="e.g. 4625" type="number" />
              </div>
              <div style={isMobile ? { display: 'flex', flexDirection: 'column', gap: '4px' } : s.formRow}>
                <span style={s.label}>Category</span>
                <select style={s.select} value={form.match_category} onChange={e => set('match_category', e.target.value)}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c || '— any —'}</option>)}
                </select>
              </div>
              <div style={isMobile ? { display: 'flex', flexDirection: 'column', gap: '4px' } : s.formRow}>
                <span style={s.label}>Log Severity</span>
                <select style={s.select} value={form.match_severity} onChange={e => set('match_severity', e.target.value)}>
                  {SEVERITIES.map(sv => <option key={sv} value={sv}>{sv || '— any —'}</option>)}
                </select>
              </div>
              <div style={isMobile ? { display: 'flex', flexDirection: 'column', gap: '4px' } : s.formRow}>
                <span style={s.label}>Username contains</span>
                <input style={s.input} value={form.match_username} onChange={e => set('match_username', e.target.value)} placeholder="e.g. SYSTEM" />
              </div>
              <div style={isMobile ? { display: 'flex', flexDirection: 'column', gap: '4px' } : s.formRow}>
                <span style={s.label}>Host contains</span>
                <input style={s.input} value={form.match_host} onChange={e => set('match_host', e.target.value)} placeholder="e.g. DESKTOP-" />
              </div>
              <div style={isMobile ? { display: 'flex', flexDirection: 'column', gap: '4px' } : s.formRow}>
                <span style={s.label}>Message contains</span>
                <input style={s.input} value={form.match_message} onChange={e => set('match_message', e.target.value)} placeholder="e.g. failed" />
              </div>
              <div style={isMobile ? { display: 'flex', flexDirection: 'column', gap: '4px' } : s.formRow}>
                <span style={s.label}>Process contains</span>
                <input style={s.input} value={form.match_process} onChange={e => set('match_process', e.target.value)} placeholder="e.g. powershell" />
              </div>
              <div style={isMobile ? { display: 'flex', flexDirection: 'column', gap: '4px' } : s.formRow}>
                <span style={s.label}>Source IP contains</span>
                <input style={s.input} value={form.match_src_ip} onChange={e => set('match_src_ip', e.target.value)} placeholder="e.g. 192.168." />
              </div>
              <div style={isMobile ? { display: 'flex', flexDirection: 'column', gap: '4px' } : s.formRow}>
                <span style={s.label}>Dest IP contains</span>
                <input style={s.input} value={form.match_dest_ip} onChange={e => set('match_dest_ip', e.target.value)} placeholder="e.g. 8.8.8" />
              </div>
              <div style={isMobile ? { display: 'flex', flexDirection: 'column', gap: '4px' } : s.formRow}>
                <span style={s.label}>Dest Port</span>
                <input style={s.input} type="number" min="1" max="65535" value={form.match_dest_port} onChange={e => set('match_dest_port', e.target.value)} placeholder="e.g. 4444" />
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

      {toast && <div style={s.toast}>{toast}</div>}
    </div>
  );
}
