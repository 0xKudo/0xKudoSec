import { useState, useEffect, useCallback } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useIsMobile } from '../hooks/useIsMobile';

const API = '/api/siem/noise';

const s = {
  container: { padding: '24px', fontFamily: 'var(--font)' },
  containerMobile: { padding: '16px', fontFamily: 'var(--font)' },
  header: {
    padding: '0 20px', height: '45px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0,
    margin: '-24px -24px 20px -24px',
  },
  headerMobile: {
    padding: '0 16px', height: '45px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0,
    margin: '-16px -16px 16px -16px',
  },
  title: { fontSize: '13px', color: 'var(--text-primary)', letterSpacing: '0.04em' },
  tabRow: { display: 'flex', gap: '4px', marginLeft: 'auto' },
  tabBtn: (active) => ({
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid var(--accent-amber)' : '2px solid transparent',
    color: active ? 'var(--accent-amber)' : 'var(--text-muted)',
    padding: '4px 10px',
    fontSize: '11px',
    fontFamily: 'var(--font)',
    cursor: 'pointer',
    letterSpacing: '0.04em',
  }),
  settingsBar: { display: 'flex', gap: '16px', alignItems: 'center', padding: '10px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border)', marginBottom: '20px', flexWrap: 'wrap' },
  label: { fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' },
  select: { background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '12px', padding: '4px 8px', fontFamily: 'var(--font)' },
  btn: { background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)', border: 'none', padding: '6px 14px', fontSize: '11px', fontFamily: 'var(--font)', cursor: 'pointer', letterSpacing: '0.04em' },
  btnSmall: { background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', padding: '4px 10px', fontSize: '11px', fontFamily: 'var(--font)', cursor: 'pointer' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
  th: { textAlign: 'left', padding: '8px 12px', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid var(--border)' },
  td: { padding: '10px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text-primary)', verticalAlign: 'top' },
  badge: (color) => ({ display: 'inline-block', padding: '2px 8px', fontSize: '10px', border: `1px solid ${color}`, color, letterSpacing: '0.06em' }),
  progress: { width: '100%', height: '4px', background: 'var(--border)', marginTop: '6px' },
  progressFill: (pct) => ({ height: '100%', width: `${Math.min(pct, 100)}%`, background: 'var(--accent-amber)', transition: 'width 0.3s' }),
  empty: { padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px' },
  section: { marginBottom: '32px' },
  thresholdBlock: { padding: '16px', background: 'var(--bg-surface)', border: '1px solid var(--border)', marginBottom: '20px' },
  thresholdLabel: { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' },
  thresholdHint: { fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px', fontStyle: 'italic' },
  bulkBar: { display: 'flex', gap: '8px', marginBottom: '12px' },
  card: { background: 'var(--bg-surface)', border: '1px solid var(--border)', padding: '12px', marginBottom: '10px' },
  cardTitle: { fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' },
  cardMeta: { fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' },
  cardActions: { display: 'flex', gap: '6px' },
};

export default function NoiseAdvisor() {
  const { getAccessTokenSilently } = useAuth0();
  const isMobile = useIsMobile();
  const [status, setStatus] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [activity, setActivity] = useState([]);
  const [settings, setSettings] = useState({ noise_auto_suppress: 'off' });
  const [view, setView] = useState('candidates');
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const authHeaders = useCallback(async () => {
    const token = await getAccessTokenSilently();
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }, [getAccessTokenSilently]);

  const load = useCallback(async () => {
    try {
      const h = await authHeaders();
      const [statusRes, candidatesRes, activityRes, settingsRes] = await Promise.all([
        fetch(`${API}/status`, { headers: h }),
        fetch(`${API}/candidates`, { headers: h }),
        fetch(`${API}/activity`, { headers: h }),
        fetch(`${API}/settings`, { headers: h }),
      ]);
      setStatus(await statusRes.json());
      setCandidates(await candidatesRes.json());
      setActivity(await activityRes.json());
      setSettings(await settingsRes.json());
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => { load(); }, [load]);

  const saveSetting = async (key, value) => {
    setSaving(true);
    const h = await authHeaders();
    await fetch(`${API}/settings`, { method: 'PATCH', headers: h, body: JSON.stringify({ [key]: value }) });
    setSettings(prev => ({ ...prev, [key]: value }));
    setSaving(false);
  };

  const updateStatus = async (id, newStatus) => {
    const h = await authHeaders();
    await fetch(`${API}/candidates/${id}`, { method: 'PATCH', headers: h, body: JSON.stringify({ status: newStatus }) });
    load();
  };

  const bulkUpdate = async (newStatus) => {
    const h = await authHeaders();
    await fetch(`${API}/candidates/bulk`, { method: 'POST', headers: h, body: JSON.stringify({ ids: [...selected], status: newStatus }) });
    setSelected(new Set());
    load();
  };

  const undo = async (id) => {
    const h = await authHeaders();
    await fetch(`${API}/candidates/${id}/undo`, { method: 'POST', headers: h });
    load();
  };

  const runAnalysis = async () => {
    setRunning(true);
    const h = await authHeaders();
    await fetch(`${API}/run`, { method: 'POST', headers: h });
    await load();
    setRunning(false);
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (loading) return <div style={s.empty}>Loading...</div>;

  const eventsPct = Math.min(((status?.total_events || 0) / 10000) * 100, 100);
  const daysPct = Math.min(((status?.days_ingested || 0) / 7) * 100, 100);
  const thresholdMet = status?.threshold_met;

  return (
    <div style={isMobile ? s.containerMobile : s.container}>
      <div style={isMobile ? s.headerMobile : s.header}>
        <div style={s.title}>Noise Advisor</div>
        <button style={{ ...s.btnSmall, marginLeft: '8px', opacity: running ? 0.5 : 1 }} onClick={runAnalysis} disabled={running}>
          {running ? 'Running...' : 'Run Analysis'}
        </button>
        <div style={s.tabRow}>
          <button style={s.tabBtn(view === 'candidates')} onClick={() => setView('candidates')}>Candidates</button>
          <button style={s.tabBtn(view === 'activity')} onClick={() => setView('activity')}>Activity Log</button>
        </div>
      </div>

      {/* Settings bar */}
      <div style={s.settingsBar}>
        <span style={s.label}>Auto-suppress{saving ? ' — saving...' : ''}</span>
        <select
          style={s.select}
          value={settings.noise_auto_suppress}
          onChange={e => saveSetting('noise_auto_suppress', e.target.value)}
        >
          <option value="off">Suggest only</option>
          <option value="high_only">Auto-create (high confidence)</option>
          <option value="all">Auto-create (all)</option>
        </select>
      </div>

      {/* Threshold progress */}
      {!thresholdMet && (
        <div style={s.thresholdBlock}>
          <div style={s.thresholdLabel}>Events ingested: {(status?.total_events || 0).toLocaleString()} / 10,000</div>
          <div style={s.progress}><div style={s.progressFill(eventsPct)} /></div>
          <div style={{ ...s.thresholdLabel, marginTop: '12px' }}>Days active: {Math.floor(status?.days_ingested || 0)} / 7</div>
          <div style={s.progress}><div style={s.progressFill(daysPct)} /></div>
          <div style={s.thresholdHint}>Noise candidates appear when either threshold is met.</div>
        </div>
      )}

      {/* Candidates view */}
      {view === 'candidates' && (
        <div style={s.section}>
          {selected.size > 0 && (
            <div style={s.bulkBar}>
              <button style={s.btn} onClick={() => bulkUpdate('approved')}>Approve {selected.size}</button>
              <button style={s.btnSmall} onClick={() => bulkUpdate('rejected')}>Reject {selected.size}</button>
            </div>
          )}
          {candidates.length === 0 ? (
            <div style={s.empty}>
              {thresholdMet
                ? 'No noise candidates found. Check back after the next daily analysis.'
                : 'Candidates will appear here once the learning threshold is met.'}
            </div>
          ) : isMobile ? (
            candidates.map(c => (
              <div key={c.id} style={s.card}>
                <div style={s.cardTitle}>{c.field_signature.event_category}</div>
                <div style={s.cardMeta}>
                  {c.field_signature.source} / {c.field_signature.host} — {parseFloat(c.daily_avg).toFixed(1)}/day
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <span style={s.badge(c.confidence === 'high' ? 'var(--severity-critical)' : 'var(--severity-medium)')}>
                    {c.confidence.toUpperCase()}
                  </span>
                  <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>score {c.score}</span>
                </div>
                <div style={s.cardActions}>
                  <button style={s.btnSmall} onClick={() => updateStatus(c.id, 'approved')}>Approve</button>
                  <button style={s.btnSmall} onClick={() => updateStatus(c.id, 'rejected')}>Reject</button>
                </div>
              </div>
            ))
          ) : (
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}></th>
                  <th style={s.th}>Pattern</th>
                  <th style={s.th}>Daily Avg</th>
                  <th style={s.th}>Confidence</th>
                  <th style={s.th}>Score</th>
                  <th style={s.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map(c => (
                  <tr key={c.id}>
                    <td style={s.td}>
                      <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} />
                    </td>
                    <td style={s.td}>
                      <div style={{ fontWeight: 600 }}>{c.field_signature.event_category}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{c.field_signature.source} / {c.field_signature.host}</div>
                    </td>
                    <td style={s.td}>{parseFloat(c.daily_avg).toFixed(1)}/day</td>
                    <td style={s.td}>
                      <span style={s.badge(c.confidence === 'high' ? 'var(--severity-critical)' : 'var(--severity-medium)')}>
                        {c.confidence.toUpperCase()}
                      </span>
                    </td>
                    <td style={s.td}>{c.score}</td>
                    <td style={s.td}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button style={s.btnSmall} onClick={() => updateStatus(c.id, 'approved')}>Approve</button>
                        <button style={s.btnSmall} onClick={() => updateStatus(c.id, 'rejected')}>Reject</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Activity log view */}
      {view === 'activity' && (
        <div style={s.section}>
          {activity.length === 0 ? (
            <div style={s.empty}>No suppression activity in the last 30 days.</div>
          ) : isMobile ? (
            activity.map(c => (
              <div key={c.id} style={s.card}>
                <div style={s.cardTitle}>{c.field_signature.event_category}</div>
                <div style={s.cardMeta}>{c.field_signature.source} — {c.rule_name || 'No rule'}</div>
                <div style={{ marginBottom: '8px' }}>
                  <span style={s.badge('var(--severity-low)')}>{c.status}</span>
                  <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    {new Date(c.updated_at).toLocaleDateString()}
                  </span>
                </div>
                <div style={s.cardActions}>
                  <button style={s.btnSmall} onClick={() => undo(c.id)}>Undo</button>
                </div>
              </div>
            ))
          ) : (
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>Pattern</th>
                  <th style={s.th}>Rule Created</th>
                  <th style={s.th}>Status</th>
                  <th style={s.th}>Date</th>
                  <th style={s.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {activity.map(c => (
                  <tr key={c.id}>
                    <td style={s.td}>
                      <div>{c.field_signature.event_category}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{c.field_signature.source}</div>
                    </td>
                    <td style={s.td}>{c.rule_name || 'None'}</td>
                    <td style={s.td}><span style={s.badge('var(--severity-low)')}>{c.status}</span></td>
                    <td style={s.td}>{new Date(c.updated_at).toLocaleDateString()}</td>
                    <td style={s.td}><button style={s.btnSmall} onClick={() => undo(c.id)}>Undo</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
