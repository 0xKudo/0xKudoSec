import { useState, useEffect, useCallback } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { badgeStyle } from '../../ui/index.js';

// AI Alert Analysis feed. Populates only when the user has run local AI analysis
// on triggered alerts (Electron local-AI path) — /api/siem/realtime/results
// returns the LLM verdicts. Empty state when no analysis has run.
const head = { padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' };
const row = { display: 'grid', gridTemplateColumns: '80px 1fr 90px 150px', alignItems: 'center', gap: '12px', padding: '7px 12px', borderBottom: '1px solid var(--border-subtle)', fontSize: '12px', color: 'var(--text-muted)' };

function sigMeta(t) {
  if (t === 'critical') return { color: 'var(--severity-critical)', label: 'CRITICAL' };
  if (t === 'conflict') return { color: 'var(--severity-high)', label: 'CONFLICT' };
  return { color: 'var(--severity-low)', label: 'NOISE' };
}

export function AiAlertAnalysis() {
  const { getAccessTokenSilently } = useAuth0();
  const [results, setResults] = useState([]);

  const load = useCallback(async () => {
    try {
      const token = await getAccessTokenSilently();
      const res = await fetch('/api/siem/realtime/results', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setResults(await res.json());
    } catch { /* transient */ }
  }, [getAccessTokenSilently]);

  useEffect(() => { load(); const id = setInterval(load, 30000); return () => clearInterval(id); }, [load]);

  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
    let debounce = null;
    ws.onmessage = (e) => {
      try { const msg = JSON.parse(e.data); if (msg.type === 'realtime_analysis') { clearTimeout(debounce); debounce = setTimeout(load, 500); } } catch {}
    };
    return () => { clearTimeout(debounce); if (ws.readyState !== WebSocket.CONNECTING) ws.close(); else ws.onopen = () => ws.close(); };
  }, [load]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={head}>AI Alert Analysis</div>
      <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
        {results.length === 0 && (
          <div style={{ padding: '10px 12px', fontSize: '11px', color: 'var(--text-muted)' }}>
            No AI analysis yet. Enable local AI analysis on alert triggers to populate this.
          </div>
        )}
        {results.map(r => {
          const m = sigMeta(r.signal_type);
          return (
            <div key={r.id} style={row}>
              <span style={badgeStyle(m.color)}>{m.label}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)', fontSize: '11px' }}>
                {r.explanation || `${r.event_id || ''}${r.host ? `, ${r.host}` : ''}`}
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '11px' }}>{r.host || '-'}</span>
              <span style={{ fontSize: '11px', whiteSpace: 'nowrap', textAlign: 'right' }}>{r.analyzed_at ? new Date(r.analyzed_at).toLocaleString() : '-'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
