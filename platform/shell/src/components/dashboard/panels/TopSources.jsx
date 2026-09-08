import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';

// Standalone Top Sources list. Lifted from SiemDashboard's Top Sources panel fed
// by /api/siem/events/by-source (rows: { host, count }).
export function TopSources() {
  const { getAccessTokenSilently } = useAuth0();
  const [sources, setSources] = useState([]);

  useEffect(() => {
    let live = true;
    const tick = async () => {
      try {
        const token = await getAccessTokenSilently();
        const res = await fetch('/api/siem/events/by-source?hours=24', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const data = await res.json();
        if (live) setSources(Array.isArray(data) ? data : []);
      } catch { /* transient */ }
    };
    tick();
    const id = setInterval(tick, 300000);
    return () => { live = false; clearInterval(id); };
  }, [getAccessTokenSilently]);

  const total = sources.reduce((sum, r) => sum + Number(r.count), 0) || 1;

  return (
    <div style={{ padding: '10px 12px' }}>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Top Sources</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {sources.slice(0, 10).map(row => {
            const pct = Math.round((Number(row.count) / total) * 100);
            return (
              <tr key={row.host || 'unknown'} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '5px 0', color: 'var(--text-primary)', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>{row.host || 'unknown'}</td>
                <td style={{ padding: '5px 0', color: 'var(--text-muted)', textAlign: 'right', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>{pct}%</td>
              </tr>
            );
          })}
          {!sources.length && <tr><td style={{ padding: '5px 0', color: 'var(--text-muted)', fontSize: '11px' }}>No data</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
