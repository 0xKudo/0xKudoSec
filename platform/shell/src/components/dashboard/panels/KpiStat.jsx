import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';

// Standalone KPI tile. Mirrors the inline KPI cards in SiemDashboard: the
// critical/high/total values come from /api/siem/stats; the "active alerts"
// value comes from /api/siem/alerts/counts (status = 'new').
const CFG = {
  active:   { label: 'Active Alerts', color: 'var(--severity-critical)' },
  critical: { label: 'Critical',      field: 'critical', color: 'var(--severity-critical)' },
  high:     { label: 'High',          field: 'high',     color: 'var(--severity-high)' },
  events:   { label: 'Total Events',  field: 'total',    color: 'var(--text-primary)' },
};

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString());

export function KpiStat({ metric = 'events' }) {
  const cfg = CFG[metric] || CFG.events;
  const { getAccessTokenSilently } = useAuth0();
  const [val, setVal] = useState(null);

  useEffect(() => {
    let live = true;
    const tick = async () => {
      try {
        const token = await getAccessTokenSilently();
        const headers = { Authorization: `Bearer ${token}` };
        if (metric === 'active') {
          const res = await fetch('/api/siem/alerts/counts', { headers });
          if (!res.ok) return;
          const counts = await res.json();
          const n = Array.isArray(counts) ? (counts.find(r => r.status === 'new')?.count ?? 0) : 0;
          if (live) setVal(n);
        } else {
          const res = await fetch('/api/siem/stats', { headers });
          if (!res.ok) return;
          const data = await res.json();
          if (live) setVal(data[cfg.field] ?? 0);
        }
      } catch { /* transient */ }
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => { live = false; clearInterval(id); };
  }, [getAccessTokenSilently, metric, cfg.field]);

  // Active alerts card only reads critical color when there is at least one.
  const color = metric === 'active' ? (Number(val) > 0 ? cfg.color : undefined) : cfg.color;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px 10px' }}>
      <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{cfg.label}</span>
      <span style={{ fontSize: '28px', lineHeight: 1, color: color || 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{fmt(val)}</span>
    </div>
  );
}
