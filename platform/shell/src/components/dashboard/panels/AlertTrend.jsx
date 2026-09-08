import { useState, useEffect, useCallback } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { TimeFieldValue, badgeStyle } from '../../ui/index.js';

const SEV_COLOR = { critical: 'var(--severity-critical)', high: 'var(--severity-high)', medium: 'var(--severity-medium)', low: 'var(--severity-low)', info: 'var(--severity-info)' };
const sevColor = (sv) => SEV_COLOR[(sv || '').toLowerCase()] || 'var(--text-muted)';
const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modalBox = { background: 'var(--bg-primary)', border: '1px solid var(--border)', width: '720px', maxWidth: '95vw', maxHeight: '80vh', display: 'flex', flexDirection: 'column' };
const modalHead = { padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' };
const closeBtn = { background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '16px', cursor: 'pointer', fontFamily: 'var(--font)' };
const fieldRow = { display: 'grid', gridTemplateColumns: '150px 1fr', borderBottom: '1px solid var(--border-subtle)', padding: '6px 0', gap: '12px' };
const smallBtn = { background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', fontFamily: 'var(--font)', fontSize: '11px', padding: '4px 12px', cursor: 'pointer', letterSpacing: '0.04em' };

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

function SparklineChart({ data, hours, onBarClick }) {
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
            <g key={i} onMouseEnter={() => setTooltip(slot)} onMouseLeave={() => setTooltip(null)}
              onClick={() => onBarClick?.(slot.slotMs)} style={{ cursor: onBarClick ? 'pointer' : 'default' }}>
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
  const [bucket, setBucket] = useState(null); // { slotMs, alerts: [] }
  const [bucketLoading, setBucketLoading] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState(null);

  const load = useCallback(async () => {
    try {
      const token = await getAccessTokenSilently();
      const res = await fetch(`/api/siem/alerts/hourly?hours=${hours}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setHourly(await res.json());
    } catch { /* transient */ }
  }, [hours, getAccessTokenSilently]);

  useEffect(() => { load(); const id = setInterval(load, 60000); return () => clearInterval(id); }, [load]);

  const openBucket = useCallback(async (slotMs) => {
    setBucketLoading(true);
    setBucket({ slotMs, alerts: [] });
    try {
      const token = await getAccessTokenSilently();
      const res = await fetch(`/api/siem/alerts/hourly/detail?hours=${hours}&bucket=${slotMs}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setBucket({ slotMs, alerts: await res.json() });
    } catch { /* transient */ } finally { setBucketLoading(false); }
  }, [hours, getAccessTokenSilently]);

  async function ackAlert(id) {
    try {
      const token = await getAccessTokenSilently();
      await fetch(`/api/siem/alerts/${id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'acknowledged' }) });
    } catch { /* ignore */ }
  }

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
        : <SparklineChart data={hourly} hours={hours} onBarClick={openBucket} />
      }

      {bucket && !selectedAlert && (
        <div style={overlay} onClick={() => setBucket(null)}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            <div style={modalHead}>
              <span style={{ fontSize: '12px', color: 'var(--text-primary)', letterSpacing: '0.04em' }}>
                Alert Trend &nbsp;&nbsp; {new Date(bucket.slotMs).toLocaleString()} &nbsp;&nbsp; {bucket.alerts.length} alert{bucket.alerts.length !== 1 ? 's' : ''}
              </span>
              <button style={closeBtn} onClick={() => setBucket(null)}>✕</button>
            </div>
            <div className="kudo-scroll" style={{ padding: '16px', overflow: 'auto', flex: 1 }}>
              {bucketLoading ? <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Loading…</div>
                : bucket.alerts.length === 0 ? <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>No alerts in this window.</div>
                : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                    <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Severity', 'Title', 'Host', 'Count', 'Last Seen'].map(h => <th key={h} style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 400, fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {bucket.alerts.map(a => (
                        <tr key={a.alert_id || a.id} style={{ borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer' }}
                          onClick={() => setSelectedAlert(a)}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface)'}
                          onMouseLeave={e => e.currentTarget.style.background = ''}
                        >
                          <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}><span style={badgeStyle(sevColor(a.severity))}>{a.severity}</span></td>
                          <td style={{ padding: '6px 8px', color: 'var(--text-primary)', maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</td>
                          <td style={{ padding: '6px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{a.host || '-'}</td>
                          <td style={{ padding: '6px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{a.count}</td>
                          <td style={{ padding: '6px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{a.last_seen ? new Date(a.last_seen).toLocaleString() : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
            </div>
          </div>
        </div>
      )}

      {selectedAlert && (
        <div style={overlay} onClick={() => setSelectedAlert(null)}>
          <div style={{ ...modalBox, width: '620px' }} onClick={e => e.stopPropagation()}>
            <div style={modalHead}>
              <span style={{ fontSize: '12px', color: 'var(--text-primary)', letterSpacing: '0.04em' }}>
                {bucket && <span style={{ color: 'var(--text-muted)', cursor: 'pointer', marginRight: '8px' }} onClick={() => setSelectedAlert(null)}>← Back</span>}
                Alert &nbsp;&nbsp; <span style={{ color: sevColor(selectedAlert.severity) }}>{selectedAlert.severity}</span>
              </span>
              <button style={closeBtn} onClick={() => setSelectedAlert(null)}>✕</button>
            </div>
            <div className="kudo-scroll" style={{ padding: '16px', overflow: 'auto', flex: 1 }}>
              {[
                ['Title', selectedAlert.title], ['Status', selectedAlert.status], ['Severity', selectedAlert.severity],
                ['Rule', selectedAlert.rule_name], ['Host', selectedAlert.host], ['Username', selectedAlert.username],
                ['Source IP', selectedAlert.source_ip], ['Dest IP', selectedAlert.dest_ip], ['Event ID', selectedAlert.event_id],
                ['Message', selectedAlert.message],
                ['Time', <TimeFieldValue times={selectedAlert.occurrence_times} count={selectedAlert.count} fallback={selectedAlert.last_seen ? new Date(selectedAlert.last_seen).toLocaleString() : (selectedAlert.created_at ? new Date(selectedAlert.created_at).toLocaleString() : null)} />],
              ].filter(([, v]) => v != null && v !== '').map(([label, value]) => (
                <div key={label} style={fieldRow}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingTop: '2px' }}>{label}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-primary)', wordBreak: 'break-word', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)' }}>{typeof value === 'object' ? value : String(value)}</div>
                </div>
              ))}
              {(selectedAlert.id || selectedAlert.alert_id) && (
                <div style={{ marginTop: '16px' }}>
                  <button style={{ ...smallBtn, background: 'var(--btn-primary-bg)', color: 'var(--btn-primary-text)' }}
                    onClick={() => { ackAlert(selectedAlert.id || selectedAlert.alert_id); setSelectedAlert(null); setBucket(b => b ? { ...b, alerts: b.alerts.filter(x => (x.alert_id || x.id) !== (selectedAlert.alert_id || selectedAlert.id)) } : b); }}>
                    Acknowledge
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
