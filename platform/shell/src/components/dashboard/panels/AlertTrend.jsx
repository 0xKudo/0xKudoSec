import { useState, useEffect, useCallback } from 'react';
import { useAuth0 } from '@auth0/auth0-react';

// Alert Trend sparkline with a 1h/6h/24h/48h/7d window selector. Ported from the
// legacy SiemDashboard: bar buckets adapt to the window, recent bars use the
// accent, older bars are muted. Fed by /api/siem/alerts/hourly?hours=.
const SPARKLINE_CONFIG = {
  1:   { bucketMs: 5 * 60000,        numSlots: 12, mid: '-30m', start: '-1h',  label: '1h'  },
  6:   { bucketMs: 15 * 60000,       numSlots: 24, mid: '-3h',  start: '-6h',  label: '6h'  },
  24:  { bucketMs: 2 * 60 * 60000,   numSlots: 12, mid: '-12h', start: '-24h', label: '24h' },
  48:  { bucketMs: 4 * 60 * 60000,   numSlots: 12, mid: '-24h', start: '-48h', label: '48h' },
  168: { bucketMs: 24 * 60 * 60000,  numSlots: 7,  mid: '-3d',  start: '-7d',  label: '7d'  },
};
const HOURS = [1, 6, 24, 48, 168];

const sectionHead = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '10px 12px 6px' };
const sectionTitle = { fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' };

function SparklineChart({ data, hours }) {
  const cfg = SPARKLINE_CONFIG[hours] || SPARKLINE_CONFIG[24];
  const { bucketMs, numSlots, mid, start, label } = cfg;
  const fmtTime = (d) => hours === 168 ? d.toLocaleDateString([], { weekday: 'short' }) : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const W = 220, H = 72, BAR_GAP = 3;
  const now = new Date();
  const [tooltip, setTooltip] = useState(null);

  const slots = Array.from({ length: numSlots }, (_, i) => {
    const slotMs = Math.floor(now.getTime() / bucketMs) * bucketMs - (numSlots - 1 - i) * bucketMs;
    const match = data.find(r => Math.abs(new Date(r.hour).getTime() - slotMs) < bucketMs / 2);
    return { hour: new Date(slotMs), slotMs, count: match ? Number(match.count) : 0 };
  });
  const max = Math.max(...slots.map(s => s.count), 1);
  const barW = Math.max(4, (W - BAR_GAP * (numSlots - 1)) / numSlots);
  const total = slots.reduce((s, r) => s + r.count, 0);
  const recentThreshold = numSlots - Math.ceil(numSlots / 4);

  return (
    <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '0 12px 10px' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, textAlign: 'center', fontSize: '10px', color: 'var(--text-muted)', pointerEvents: 'none', minHeight: '14px' }}>
        {tooltip ? <>{fmtTime(tooltip.hour)} - {tooltip.count} alert{tooltip.count !== 1 ? 's' : ''}</> : <>{total} alert{total !== 1 ? 's' : ''} in last {label}</>}
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block', marginTop: '18px' }}>
        <line x1="0" y1={H} x2={W} y2={H} stroke="var(--border)" strokeWidth="1" opacity="0.4" />
        {slots.map((slot, i) => {
          const barH = slot.count === 0 ? 0 : Math.max(4, Math.round((slot.count / max) * (H - 2)));
          if (barH === 0) return null;
          const x = i * (barW + BAR_GAP);
          const isRecent = i >= recentThreshold;
          return (
            <g key={i} onMouseEnter={() => setTooltip(slot)} onMouseLeave={() => setTooltip(null)}>
              <rect x={x} y={H - barH} width={barW} height={barH} fill={isRecent ? 'var(--accent-amber)' : 'var(--text-muted)'} opacity={isRecent ? 0.9 : 0.5} rx="1" />
            </g>
          );
        })}
        {slots.map((slot, i) => {
          if (slot.count > 0) return null;
          const x = i * (barW + BAR_GAP);
          return <rect key={`e${i}`} x={x} y={H - 2} width={barW} height={2} fill="var(--border)" opacity="0.25" />;
        })}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-muted)', marginTop: '4px' }}>
        <span>{start}</span><span>{mid}</span><span>now</span>
      </div>
    </div>
  );
}

export function AlertTrend() {
  const { getAccessTokenSilently } = useAuth0();
  const [hours, setHours] = useState(24);
  const [hourly, setHourly] = useState([]);

  const load = useCallback(async () => {
    try {
      const token = await getAccessTokenSilently();
      const res = await fetch(`/api/siem/alerts/hourly?hours=${hours}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setHourly(await res.json());
    } catch { /* transient */ }
  }, [hours, getAccessTokenSilently]);

  useEffect(() => { load(); const id = setInterval(load, 60000); return () => clearInterval(id); }, [load]);

  const pill = (active) => ({
    background: active ? 'var(--btn-primary-bg)' : 'none', color: active ? 'var(--btn-primary-text)' : 'var(--text-muted)',
    border: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: '9px', padding: '2px 6px', cursor: 'pointer', letterSpacing: '0.04em',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={sectionHead}>
        <span style={sectionTitle}>Alert Trend</span>
        <div style={{ display: 'flex', gap: '3px' }}>
          {HOURS.map(h => (
            <button key={h} style={pill(hours === h)} onClick={() => setHours(h)}>{h === 168 ? '7d' : `${h}h`}</button>
          ))}
        </div>
      </div>
      {hourly.length === 0
        ? <div style={{ fontSize: '11px', color: 'var(--text-muted)', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No alerts in window</div>
        : <SparklineChart data={hourly} hours={hours} />
      }
    </div>
  );
}
