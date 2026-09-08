import { useState, useEffect, useCallback } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { TimeFieldValue, badgeStyle } from '../../ui/index.js';

// Active Alerts summary list (top new alerts) with status chips, a View All link,
// and a click-through detail modal with acknowledge. Ported from the legacy
// SiemDashboard left panel. Self-polls + refreshes on the alerts WebSocket.
const SEV_COLOR = { critical: 'var(--severity-critical)', high: 'var(--severity-high)', medium: 'var(--severity-medium)', low: 'var(--severity-low)', info: 'var(--severity-info)' };
const sevColor = (s) => SEV_COLOR[(s || '').toLowerCase()] || 'var(--text-muted)';

const head = { padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)' };
const title = { fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: '10px' };
const btn = { background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', fontFamily: 'var(--font)', fontSize: '11px', padding: '4px 12px', cursor: 'pointer', letterSpacing: '0.04em' };
const row = { display: 'grid', gridTemplateColumns: '80px 1fr 90px 150px', alignItems: 'center', gap: '12px', padding: '7px 12px', borderBottom: '1px solid var(--border-subtle)', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer' };
const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modal = { background: 'var(--bg-primary)', border: '1px solid var(--border)', width: '620px', maxWidth: '95vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column' };
const fieldRow = { display: 'grid', gridTemplateColumns: '150px 1fr', borderBottom: '1px solid var(--border-subtle)', padding: '6px 0', gap: '12px' };

export function AlertsList({ onNavigate }) {
  const { getAccessTokenSilently } = useAuth0();
  const [alerts, setAlerts] = useState([]);
  const [summary, setSummary] = useState([]);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    try {
      const token = await getAccessTokenSilently();
      const headers = { Authorization: `Bearer ${token}` };
      const [alertsRes, countsRes] = await Promise.all([
        fetch('/api/siem/alerts?status=new', { headers }),
        fetch('/api/siem/alerts/counts', { headers }),
      ]);
      if (alertsRes.ok) { const d = await alertsRes.json(); setAlerts(Array.isArray(d) ? d.slice(0, 8) : []); }
      if (countsRes.ok) { const c = await countsRes.json(); setSummary(Array.isArray(c) ? c : []); }
    } catch { /* transient */ }
  }, [getAccessTokenSilently]);

  useEffect(() => { load(); const id = setInterval(load, 15000); return () => clearInterval(id); }, [load]);

  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
    let debounce = null;
    ws.onmessage = (e) => {
      try { const msg = JSON.parse(e.data); if (msg.type === 'new_alerts') { clearTimeout(debounce); debounce = setTimeout(load, 500); } } catch {}
    };
    return () => { clearTimeout(debounce); if (ws.readyState !== WebSocket.CONNECTING) ws.close(); else ws.onopen = () => ws.close(); };
  }, [load]);

  async function ackAlert(id) {
    try {
      const token = await getAccessTokenSilently();
      await fetch(`/api/siem/alerts/${id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'acknowledged' }) });
      setAlerts(prev => prev.filter(a => a.id !== id));
      setSummary(prev => prev.map(r => r.status === 'new' ? { ...r, count: Math.max(0, Number(r.count) - 1) } : r));
    } catch { /* ignore */ }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={head}>
        <div style={title}>
          <span>Active Alerts</span>
          {summary.map(r => (
            <span key={r.status} style={badgeStyle(r.status === 'new' ? 'var(--severity-critical)' : r.status === 'acknowledged' ? 'var(--severity-medium)' : 'var(--text-muted)')}>{r.status} {r.count}</span>
          ))}
        </div>
        <button style={btn} onClick={() => onNavigate?.('alerts')}>View All →</button>
      </div>
      <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
        {alerts.length === 0 && <div style={{ padding: '10px 12px', fontSize: '11px', color: 'var(--text-muted)' }}>No new alerts.</div>}
        {alerts.map(a => (
          <div key={a.id} style={row} onClick={() => setSelected(a)}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-primary)'}
            onMouseLeave={e => e.currentTarget.style.background = ''}
          >
            <span style={badgeStyle(sevColor(a.severity))}>{a.severity}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', minWidth: 0 }}>
              <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
              {a.count > 1 && <span style={badgeStyle('var(--text-muted)')}>{a.count}×</span>}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.host || '-'}</span>
            <span style={{ fontSize: '11px', whiteSpace: 'nowrap', textAlign: 'right' }}>{new Date(a.created_at).toLocaleString()}</span>
          </div>
        ))}
      </div>

      {selected && (
        <div style={overlay} onClick={() => setSelected(null)}>
          <div style={modal} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-primary)', letterSpacing: '0.04em' }}>Alert &nbsp;&nbsp; <span style={{ color: sevColor(selected.severity) }}>{selected.severity}</span></span>
              <button style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '16px', cursor: 'pointer', fontFamily: 'var(--font)' }} onClick={() => setSelected(null)}>✕</button>
            </div>
            <div style={{ padding: '16px', overflow: 'auto', flex: 1 }}>
              {[
                ['Title', selected.title], ['Status', selected.status], ['Severity', selected.severity],
                ['Rule', selected.rule_name], ['Host', selected.host], ['Username', selected.username],
                ['Source IP', selected.source_ip], ['Dest IP', selected.dest_ip], ['Event ID', selected.event_id],
                ['Message', selected.message],
                ['Time', <TimeFieldValue times={selected.occurrence_times} count={selected.count} fallback={selected.created_at ? new Date(selected.created_at).toLocaleString() : null} />],
              ].filter(([, v]) => v != null && v !== '').map(([label, value]) => (
                <div key={label} style={fieldRow}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingTop: '2px' }}>{label}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-primary)', wordBreak: 'break-word', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)' }}>{typeof value === 'object' ? value : String(value)}</div>
                </div>
              ))}
              <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                <button style={{ ...btn, background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }} onClick={() => { ackAlert(selected.id); setSelected(null); }}>Acknowledge</button>
                <button style={btn} onClick={() => { setSelected(null); onNavigate?.('alerts'); }}>Open in Alert Queue →</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
