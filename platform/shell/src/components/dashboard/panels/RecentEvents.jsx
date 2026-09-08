import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';

// Standalone Recent Events table. Fed by /api/siem/events/recent. Compact,
// read-only (Time / Severity / Host / Message) so it fits small widget widths;
// the full column set + row modal live in the main SIEM dashboard view.
const SEV_COLOR = {
  critical: 'var(--severity-critical)', high: 'var(--severity-high)', medium: 'var(--severity-medium)',
  low: 'var(--severity-low)', info: 'var(--severity-info)',
};
const sevColor = (s) => SEV_COLOR[(s || '').toLowerCase()] || 'var(--text-muted)';

const th = { textAlign: 'left', padding: '6px 8px', fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 'normal', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', position: 'sticky', top: 0 };
const td = { padding: '6px 8px', fontSize: '11px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '260px' };

export function RecentEvents() {
  const { getAccessTokenSilently } = useAuth0();
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let live = true;
    const tick = async () => {
      try {
        const token = await getAccessTokenSilently();
        const res = await fetch('/api/siem/events/recent?hours=24', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const data = await res.json();
        if (live) setRows(Array.isArray(data) ? data.slice(0, 50) : []);
      } catch { /* transient */ }
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => { live = false; clearInterval(id); };
  }, [getAccessTokenSilently]);

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={th}>Time</th>
          <th style={th}>Severity</th>
          <th style={th}>Host</th>
          <th style={th}>Message</th>
        </tr>
      </thead>
      <tbody>
        {!rows.length && <tr><td colSpan={4} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>No recent events</td></tr>}
        {rows.map(r => (
          <tr key={r.id}>
            <td style={td}>{r.timestamp ? new Date(r.timestamp).toLocaleTimeString() : '-'}</td>
            <td style={{ ...td, color: sevColor(r.severity), textTransform: 'capitalize' }}>{r.severity || '-'}</td>
            <td style={td}>{r.host || '-'}</td>
            <td style={td} title={r.message || ''}>{r.message || '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
