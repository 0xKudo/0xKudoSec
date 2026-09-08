import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';

// Standalone severity donut. Lifted from SiemDashboard's DonutChart (self-drawn
// SVG, one arc per severity slice) fed by /api/siem/events/by-severity. Read-only
// here (no slice-click filtering — that belongs to the full dashboard view).
const SEV_COLOR_HEX = {
  critical: 'var(--severity-critical)', high: 'var(--severity-high)', medium: 'var(--severity-medium)',
  low: 'var(--severity-low)', info: 'var(--severity-info)',
};
const sevColorHex = (sev) => SEV_COLOR_HEX[(sev || '').toLowerCase()] || '#888';
const ORDER = ['critical', 'high', 'medium', 'low', 'info'];

function Donut({ severities, size = 120 }) {
  const [hovered, setHovered] = useState(null);
  const cx = size / 2, cy = size / 2, R = size * 0.41, r = size * 0.25;
  const total = severities.reduce((sum, row) => sum + Number(row.count), 0) || 1;

  const slices = [];
  let angle = -Math.PI / 2;
  for (const sev of ORDER) {
    const row = severities.find(x => x.severity === sev);
    if (!row) continue;
    const share = Number(row.count) / total;
    if (share === 0) continue;
    const sweep = share * 2 * Math.PI;
    const x1 = cx + R * Math.cos(angle), y1 = cy + R * Math.sin(angle);
    const x2 = cx + R * Math.cos(angle + sweep), y2 = cy + R * Math.sin(angle + sweep);
    const ix1 = cx + r * Math.cos(angle), iy1 = cy + r * Math.sin(angle);
    const ix2 = cx + r * Math.cos(angle + sweep), iy2 = cy + r * Math.sin(angle + sweep);
    const large = sweep > Math.PI ? 1 : 0;
    const d = [`M ${x1} ${y1}`, `A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`, `L ${ix2} ${iy2}`, `A ${r} ${r} 0 ${large} 0 ${ix1} ${iy1}`, 'Z'].join(' ');
    slices.push({ sev, d, count: Number(row.count), share });
    angle += sweep;
  }

  if (slices.length === 1) {
    const { sev, count, share } = slices[0];
    return (
      <svg width={size} height={size} style={{ flexShrink: 0 }}>
        <circle cx={cx} cy={cy} r={R} fill={sevColorHex(sev)} opacity={0.8} stroke="var(--bg-surface)" strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r={r} fill="var(--bg-surface)" />
        <title>{sev}: {count.toLocaleString()} ({Math.round(share * 100)}%)</title>
      </svg>
    );
  }

  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      {slices.map(({ sev, d, count, share }) => (
        <g key={sev} onMouseEnter={() => setHovered(sev)} onMouseLeave={() => setHovered(null)}>
          <path d={d} fill={sevColorHex(sev)} opacity={hovered && hovered !== sev ? 0.4 : 0.85} stroke="var(--bg-surface)" strokeWidth="1.5" />
          <title>{sev}: {count.toLocaleString()} ({Math.round(share * 100)}%)</title>
        </g>
      ))}
      <circle cx={cx} cy={cy} r={r - 1} fill="var(--bg-surface)" />
    </svg>
  );
}

export function SeverityDonut() {
  const { getAccessTokenSilently } = useAuth0();
  const [severities, setSeverities] = useState([]);

  useEffect(() => {
    let live = true;
    const tick = async () => {
      try {
        const token = await getAccessTokenSilently();
        const res = await fetch('/api/siem/events/by-severity?hours=24', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const data = await res.json();
        if (live) setSeverities(Array.isArray(data) ? data : []);
      } catch { /* transient */ }
    };
    tick();
    const id = setInterval(tick, 300000);
    return () => { live = false; clearInterval(id); };
  }, [getAccessTokenSilently]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '12px', flexWrap: 'wrap' }}>
      <Donut severities={severities} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {ORDER.map(sev => {
          const row = severities.find(x => x.severity === sev);
          if (!row) return null;
          return (
            <div key={sev} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px' }}>
              <span style={{ width: '9px', height: '9px', background: sevColorHex(sev), display: 'inline-block' }} />
              <span style={{ color: 'var(--text-muted)', textTransform: 'capitalize', minWidth: '58px' }}>{sev}</span>
              <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{Number(row.count).toLocaleString()}</span>
            </div>
          );
        })}
        {!severities.length && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>No data</span>}
      </div>
    </div>
  );
}
