import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';

// The four headline stats as ONE reflowing widget. auto-fit columns collapse
// 4-across → 2×2 → 1-column as the widget narrows (and grow back when widened),
// so a single fetch feeds all four cards. Replaces the four separate kpi-* tiles.
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString());

export function KpiRow() {
  const { getAccessTokenSilently } = useAuth0();
  const [stats, setStats] = useState(null);
  const [activeAlerts, setActiveAlerts] = useState(null);

  useEffect(() => {
    let live = true;
    const tick = async () => {
      try {
        const token = await getAccessTokenSilently();
        const headers = { Authorization: `Bearer ${token}` };
        const [statsRes, countsRes] = await Promise.all([
          fetch('/api/siem/stats', { headers }),
          fetch('/api/siem/alerts/counts', { headers }),
        ]);
        if (statsRes.ok) { const d = await statsRes.json(); if (live) setStats(d); }
        if (countsRes.ok) { const c = await countsRes.json(); const n = Array.isArray(c) ? (c.find(r => r.status === 'new')?.count ?? 0) : 0; if (live) setActiveAlerts(n); }
      } catch { /* transient */ }
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => { live = false; clearInterval(id); };
  }, [getAccessTokenSilently]);

  const cards = [
    { label: 'Active Alerts', value: activeAlerts, sub: 'unacknowledged', color: Number(activeAlerts) > 0 ? 'var(--severity-critical)' : undefined },
    { label: 'Critical', value: stats?.critical, sub: 'severity critical', color: 'var(--severity-critical)' },
    { label: 'High', value: stats?.high, sub: 'severity high', color: 'var(--severity-high)' },
    { label: 'Total Events', value: stats?.total, sub: 'last 24h', color: undefined },
  ];

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      gap: '1px', background: 'var(--border-subtle)', height: '100%', alignContent: 'stretch',
    }}>
      {cards.map(c => (
        <div key={c.label} style={{ background: 'var(--bg-surface)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '4px', justifyContent: 'center', alignItems: 'center', textAlign: 'center', minWidth: 0 }}>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{c.label}</span>
          <span style={{ fontSize: '28px', lineHeight: 1, color: c.color || 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{fmt(c.value)}</span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{c.sub}</span>
        </div>
      ))}
    </div>
  );
}
