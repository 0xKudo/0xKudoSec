import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';

// Standalone Alert Trend. Fed by /api/siem/alerts/trend (rows: { day, count } for
// the last 7 days). Simple daily bar chart, self-contained.
export function AlertTrend() {
  const { getAccessTokenSilently } = useAuth0();
  const [trend, setTrend] = useState([]);

  useEffect(() => {
    let live = true;
    const tick = async () => {
      try {
        const token = await getAccessTokenSilently();
        const res = await fetch('/api/siem/alerts/trend', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const data = await res.json();
        if (live) setTrend(Array.isArray(data) ? data : []);
      } catch { /* transient */ }
    };
    tick();
    const id = setInterval(tick, 300000);
    return () => { live = false; clearInterval(id); };
  }, [getAccessTokenSilently]);

  const max = Math.max(1, ...trend.map(r => Number(r.count)));

  return (
    <div style={{ padding: '14px 12px', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      {!trend.length ? (
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>No alert activity in the last 7 days.</div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', flex: 1, minHeight: '80px' }}>
          {trend.map(r => {
            const count = Number(r.count);
            const h = Math.round((count / max) * 100);
            const label = r.day ? new Date(r.day).toLocaleDateString([], { weekday: 'short' }) : '';
            return (
              <div key={r.day || label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }} title={`${label}: ${count}`}>
                <span style={{ fontSize: '10px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{count}</span>
                <div style={{ width: '100%', maxWidth: '34px', height: `${Math.max(2, h)}%`, background: 'var(--accent-amber)', minHeight: '2px' }} />
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
