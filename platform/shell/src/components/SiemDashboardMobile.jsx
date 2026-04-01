import { useState, useEffect, useCallback } from 'react';
import { useAuth0 } from '@auth0/auth0-react';

function sevColor(sev) {
  const map = {
    critical: '#ef4444',
    high: '#d97706',
    medium: '#ca8a04',
    low: '#16a34a',
    info: '#60a5fa',
  };
  return map[(sev || '').toLowerCase()] || '#888';
}

const SEV_COLOR = {
  critical: 'var(--severity-critical)',
  high: 'var(--severity-high)',
  medium: 'var(--severity-medium)',
  low: 'var(--severity-low)',
  info: 'var(--severity-info)',
};
const SEV_COLOR_HEX = {
  critical: '#ef4444',
  high: '#d97706',
  medium: '#ca8a04',
  low: '#16a34a',
  info: '#60a5fa',
};

const s = {
  container: { padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' },
  kpiGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' },
  kpiCard: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    padding: '12px 14px',
    display: 'flex', flexDirection: 'column', gap: '4px',
  },
  kpiLabel: { fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' },
  kpiValue: (color) => ({ fontSize: '24px', color: color || 'var(--text-primary)', lineHeight: 1 }),
  panel: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    padding: '12px 14px',
  },
  panelTitle: { fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' },
  donutWrap: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', padding: '4px 0' },
  legend: { display: 'flex', flexDirection: 'column', gap: '6px' },
  legendItem: (color) => ({ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)' }),
  legendDot: (color) => ({ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0 }),
  eventRow: {
    display: 'flex', flexDirection: 'column', gap: '2px',
    padding: '8px 0', borderBottom: '1px solid var(--border-subtle)',
  },
  eventTop: { display: 'flex', alignItems: 'center', gap: '8px' },
  sevBadge: (color) => ({
    fontSize: '9px', padding: '2px 6px', border: `1px solid ${color}`, color, letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0,
  }),
  eventMsg: { fontSize: '11px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  eventMeta: { fontSize: '10px', color: 'var(--text-muted)' },
  muted: { fontSize: '12px', color: 'var(--text-muted)', padding: '8px 0' },
  eventRowTappable: {
    display: 'flex', flexDirection: 'column', gap: '2px',
    padding: '10px 0', borderBottom: '1px solid var(--border-subtle)',
    cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  },
  legendItemClickable: (color, active) => ({
    display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px',
    color: active ? color : 'var(--text-muted)',
    cursor: 'pointer', fontWeight: active ? 'bold' : 'normal',
    WebkitTapHighlightColor: 'transparent',
  }),
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 },
  modal: { background: 'var(--bg-primary)', border: '1px solid var(--border)', borderBottom: 'none', width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' },
  modalHeader: { padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 },
  modalTitle: { fontSize: '12px', color: 'var(--text-primary)', letterSpacing: '0.04em' },
  modalClose: { background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer', fontFamily: 'var(--font)', lineHeight: 1, padding: '0 4px' },
  modalBody: { padding: '12px 16px', overflowY: 'auto', flex: 1 },
  fieldRow: { display: 'grid', gridTemplateColumns: '120px 1fr', borderBottom: '1px solid var(--border-subtle)', padding: '7px 0', gap: '8px' },
  fieldLabel: { fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingTop: '2px' },
  fieldValue: { fontSize: '12px', color: 'var(--text-primary)', wordBreak: 'break-word', whiteSpace: 'pre-wrap' },
};

function Donut({ data, size = 120 }) {
  const total = data.reduce((s, d) => s + Number(d.count), 0);
  if (!total) return <div style={s.muted}>No data</div>;
  const r = 45;
  const cx = size / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  const slices = data.map(d => {
    const pct = Number(d.count) / total;
    const slice = { ...d, offset, pct, dash: pct * circumference };
    offset += pct * circumference;
    return slice;
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      {slices.map((sl, i) => (
        <circle key={i} cx={cx} cy={cx} r={r} fill="none"
          stroke={SEV_COLOR_HEX[sl.severity] || '#555'}
          strokeWidth="18"
          strokeDasharray={`${sl.dash} ${circumference - sl.dash}`}
          strokeDashoffset={-sl.offset}
        />
      ))}
    </svg>
  );
}

export function SiemDashboardMobile({ onNavigate }) {
  const { getAccessTokenSilently } = useAuth0();
  const [stats, setStats] = useState(null);
  const [alertCounts, setAlertCounts] = useState([]);
  const [bySeverity, setBySeverity] = useState([]);
  const [recentEvents, setRecentEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sevFilter, setSevFilter] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);

  const load = useCallback(async () => {
    try {
      const token = await getAccessTokenSilently();
      const h = { Authorization: `Bearer ${token}` };
      const [statsRes, countsRes, sevRes, recentRes] = await Promise.all([
        fetch('/api/siem/stats?hours=24', { headers: h }),
        fetch('/api/siem/alerts/counts', { headers: h }),
        fetch('/api/siem/events/by-severity?hours=24', { headers: h }),
        fetch('/api/siem/events/recent?hours=24', { headers: h }),
      ]);
      const [s, c, sv, r] = await Promise.all([statsRes.json(), countsRes.json(), sevRes.json(), recentRes.json()]);
      setStats(s);
      setAlertCounts(Array.isArray(c) ? c : []);
      setBySeverity(Array.isArray(sv) ? sv : []);
      setRecentEvents(Array.isArray(r) ? r.slice(0, 20) : []);
    } catch {}
    setLoading(false);
  }, [getAccessTokenSilently]);

  useEffect(() => { load(); }, [load]);

  const activeAlerts = alertCounts.find(r => r.status === 'new')?.count || 0;
  const filteredEvents = sevFilter ? recentEvents.filter(e => (e.severity || 'info').toLowerCase() === sevFilter) : recentEvents;

  if (loading) return <div style={{ padding: '24px', color: 'var(--text-muted)', fontSize: '12px' }}>Loading...</div>;

  return (
    <div style={s.container}>
      {/* KPI cards */}
      <div style={s.kpiGrid}>
        <div style={s.kpiCard}>
          <div style={s.kpiLabel}>Active Alerts</div>
          <div style={s.kpiValue(activeAlerts > 0 ? 'var(--severity-critical)' : undefined)}>{activeAlerts}</div>
        </div>
        <div style={s.kpiCard}>
          <div style={s.kpiLabel}>Critical</div>
          <div style={s.kpiValue('var(--severity-critical)')}>{stats?.critical || 0}</div>
        </div>
        <div style={s.kpiCard}>
          <div style={s.kpiLabel}>High</div>
          <div style={s.kpiValue('var(--severity-high)')}>{stats?.high || 0}</div>
        </div>
        <div style={s.kpiCard}>
          <div style={s.kpiLabel}>Total Events</div>
          <div style={s.kpiValue()}>{Number(stats?.total || 0).toLocaleString()}</div>
        </div>
      </div>

      {/* Severity donut */}
      <div style={s.panel}>
        <div style={s.panelTitle}>Events by Severity — 24h</div>
        <div style={s.donutWrap}>
          <Donut data={bySeverity} size={110} />
          <div style={s.legend}>
            {bySeverity.map(d => {
              const active = sevFilter === d.severity;
              const color = SEV_COLOR_HEX[d.severity] || '#555';
              return (
                <div
                  key={d.severity}
                  style={s.legendItemClickable(color, active)}
                  onClick={() => setSevFilter(active ? null : d.severity)}
                >
                  <div style={s.legendDot(color)} />
                  {d.severity} ({Number(d.count).toLocaleString()})
                  {active && <span style={{ fontSize: '9px', marginLeft: '2px' }}>✕</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent events */}
      <div style={s.panel}>
        <div style={{ ...s.panelTitle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Recent Events{sevFilter ? ` — ${sevFilter}` : ''}</span>
          {sevFilter && (
            <span
              style={{ fontSize: '10px', color: 'var(--text-muted)', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em' }}
              onClick={() => setSevFilter(null)}
            >
              Clear filter
            </span>
          )}
        </div>
        {filteredEvents.length === 0 && <div style={s.muted}>No events{sevFilter ? ` for severity: ${sevFilter}` : ' in the last 24h'}.</div>}
        {filteredEvents.map((e, i) => (
          <div key={i} style={s.eventRowTappable} onClick={() => setSelectedEvent(e)}>
            <div style={s.eventTop}>
              <span style={s.sevBadge(SEV_COLOR_HEX[e.severity] || '#555')}>{e.severity || 'info'}</span>
              <span style={s.eventMsg}>{e.message || e.event_category || '—'}</span>
            </div>
            <div style={s.eventMeta}>
              {e.host || '—'} · {e.event_id ? `EID ${e.event_id}` : ''} · {e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : ''}
            </div>
          </div>
        ))}
      </div>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div style={s.overlay} onClick={() => setSelectedEvent(null)}>
          <div style={s.modal} onClick={ev => ev.stopPropagation()}>
            <div style={s.modalHeader}>
              <span style={s.modalTitle}>
                Event {selectedEvent.event_id || '—'} &nbsp;·&nbsp;{' '}
                <span style={{ color: sevColor(selectedEvent.severity) }}>{selectedEvent.severity || '—'}</span>
              </span>
              <button style={s.modalClose} onClick={() => setSelectedEvent(null)}>✕</button>
            </div>
            <div style={s.modalBody}>
              {[
                ['Time', selectedEvent.timestamp ? new Date(selectedEvent.timestamp).toLocaleString() : null],
                ['Severity', selectedEvent.severity],
                ['Event ID', selectedEvent.event_id],
                ['Category', selectedEvent.event_category],
                ['Host', selectedEvent.host],
                ['Source IP', selectedEvent.source_ip],
                ['Dest IP', selectedEvent.dest_ip],
                ['Dest Port', selectedEvent.dest_port],
                ['Protocol', selectedEvent.protocol],
                ['Username', selectedEvent.username],
                ['Domain', selectedEvent.domain],
                ['Logon Type', selectedEvent.logon_type],
                ['Process', selectedEvent.process_name],
                ['Process ID', selectedEvent.process_id],
                ['Parent Process', selectedEvent.parent_process_name],
                ['File Path', selectedEvent.file_path],
                ['Registry Key', selectedEvent.registry_key],
                ['Source', selectedEvent.source],
                ['Message', selectedEvent.message],
              ].filter(([, v]) => v != null && v !== '').map(([label, value]) => (
                <div key={label} style={s.fieldRow}>
                  <div style={s.fieldLabel}>{label}</div>
                  <div style={s.fieldValue}>{String(value)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
