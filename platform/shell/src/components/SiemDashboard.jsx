import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { ProcessTreePanel, ContextMenu } from './ProcessTreePanel.jsx';

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

const HOURS_OPTIONS = [1, 6, 24, 48, 168];
const COL_NAMES = ['Time', 'Severity', 'Event ID', 'Category', 'Host', 'Src IP', 'Dest IP', 'User', 'Message'];
const COL_DEFAULTS_W = [110, 110, 80, 110, 110, 120, 120, 110, 260];
const COL_FIELDS = ['timestamp', 'severity', 'event_id', 'event_category', 'host', 'source_ip', 'dest_ip', 'username', 'message'];
const LS_KEY = 'siem_filter_state';

function loadPersistedState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function savePersistedState(state) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {}
}

const ALL_CATEGORIES = ['authentication', 'network', 'process', 'file', 'dns', 'registry', 'system', 'firewall', 'account', 'policy'];

const s = {
  container: { padding: 0, flex: 1, minHeight: 0, overflow: 'auto' },
  pageHeader: {
    padding: '0 20px', height: '45px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0,
  },
  pageTitle: { fontSize: '13px', color: 'var(--text-primary)', letterSpacing: '0.04em' },
  pageSub: { color: 'var(--text-muted)', fontSize: '11px' },
  actions: { marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' },
  btn: {
    background: 'none',
    border: '1px solid var(--border)',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font)',
    fontSize: '11px',
    padding: '4px 12px',
    cursor: 'pointer',
    letterSpacing: '0.04em',
  },
  btnActive: {
    background: 'var(--btn-primary-bg)',
    border: '1px solid var(--border)',
    color: 'var(--btn-primary-text)',
    fontFamily: 'var(--font)',
    fontSize: '11px',
    padding: '4px 12px',
    cursor: 'pointer',
    letterSpacing: '0.04em',
  },
  kpiRow: {
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '1px', background: 'var(--border-subtle)', borderBottom: '1px solid var(--border)',
  },
  kpiCard: { background: 'var(--bg-surface)', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '4px' },
  kpiLabel: { fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' },
  kpiValue: (color) => ({ fontSize: '28px', color: color || 'var(--text-primary)', lineHeight: 1 }),
  kpiSub: { fontSize: '10px', color: 'var(--text-muted)' },
  chartsRow: {
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '1px', background: 'var(--border-subtle)', borderBottom: '1px solid var(--border)',
  },
  chartPanel: { background: 'var(--bg-surface)', padding: '14px', display: 'flex', flexDirection: 'column' },
  chartTitle: { fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' },
  donutWrap: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', height: '100%' },
  legend: { display: 'flex', flexDirection: 'column', gap: '5px' },
  legendItem: (active, color) => ({
    display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px',
    color: active ? color : 'var(--text-muted)',
    cursor: 'pointer',
    fontWeight: active ? 'bold' : 'normal',
  }),
  legendDot: (color) => ({ width: '7px', height: '7px', borderRadius: '50%', background: color, flexShrink: 0 }),
  sourceTable: { width: '100%', fontSize: '11px', borderCollapse: 'collapse' },
  sectionBar: {
    padding: '8px 20px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)',
    fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  table: { borderCollapse: 'collapse', tableLayout: 'fixed' },
  th: {
    textAlign: 'left', padding: '8px 18px 8px 14px', fontSize: '10px',
    letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)',
    borderBottom: '1px solid var(--border)', fontWeight: 'normal', background: 'var(--bg-surface)',
    position: 'relative', overflow: 'hidden', whiteSpace: 'nowrap', userSelect: 'none', verticalAlign: 'middle',
  },
  resizeHandle: {
    position: 'absolute', right: 0, top: 0, bottom: 0,
    width: '5px', cursor: 'col-resize', zIndex: 1, borderRight: '2px solid var(--border)',
  },
  td: {
    padding: '9px 14px', borderBottom: '1px solid var(--border-subtle)', fontSize: '12px',
    color: 'var(--text-muted)', verticalAlign: 'middle', overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 0,
  },
  sevBadge: (color) => ({ fontSize: '10px', width: '64px', textAlign: 'center', padding: '2px 0', letterSpacing: '0.06em', textTransform: 'uppercase', border: `1px solid ${color}`, color, whiteSpace: 'nowrap', display: 'inline-block', boxSizing: 'border-box', flexShrink: 0 }),
  error: { padding: '20px', color: 'var(--severity-high)', fontSize: '12px' },
  muted: { padding: '20px', color: 'var(--text-muted)', fontSize: '12px' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: 'var(--bg-primary)', border: '1px solid var(--border)', width: '680px', maxWidth: '95vw', height: '80vh', display: 'flex', flexDirection: 'column' },
  modalHeader: { padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: '12px', color: 'var(--text-primary)', letterSpacing: '0.04em' },
  modalClose: { background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '16px', cursor: 'pointer', fontFamily: 'var(--font)', lineHeight: 1 },
  modalBody: { padding: '16px', overflow: 'auto', flex: 1 },
  fieldRow: { display: 'grid', gridTemplateColumns: '160px 1fr', borderBottom: '1px solid var(--border-subtle)', padding: '6px 0', gap: '12px' },
  fieldLabel: { fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingTop: '2px' },
  fieldValue: { fontSize: '12px', color: 'var(--text-primary)', wordBreak: 'break-word', whiteSpace: 'pre-wrap' },
  alertsPanelWrap: {
    background: 'var(--bg-surface)',
    borderBottom: '1px solid var(--border-subtle)',
    display: 'flex',
    flexDirection: 'column',
  },
  alertsPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  alertsPanelHeader: {
    padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    borderBottom: '1px solid var(--border-subtle)',
  },
  alertsPanelTitle: { fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: '10px' },
  alertCountChip: (color) => ({ fontSize: '10px', padding: '1px 8px', border: `1px solid ${color}`, color, letterSpacing: '0.04em' }),
  alertRow: {
    display: 'grid', gridTemplateColumns: '80px 1fr 90px 160px',
    alignItems: 'center', gap: '12px',
    padding: '7px 14px', borderBottom: '1px solid var(--border-subtle)',
    fontSize: '12px', color: 'var(--text-muted)',
    cursor: 'pointer',
  },
  searchBar: {
    padding: '10px 20px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  searchInput: {
    flex: 1,
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    padding: '6px 10px',
    outline: 'none',
    letterSpacing: '0.02em',
  },
  searchSelect: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font)',
    fontSize: '11px',
    padding: '6px 8px',
    cursor: 'pointer',
    letterSpacing: '0.04em',
    outline: 'none',
    flexShrink: 0,
  },
  searchClear: {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font)',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '0 4px',
    lineHeight: 1,
  },
  // Filter panel
  panelOverlay: { position: 'fixed', inset: 0, zIndex: 900 },
  panel: {
    position: 'fixed', top: 0, right: 0, bottom: 0, width: '260px',
    background: 'var(--bg-primary)', borderLeft: '1px solid var(--border)',
    zIndex: 901, display: 'flex', flexDirection: 'column', overflowY: 'auto',
  },
  panelHeader: {
    padding: '12px 16px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    fontSize: '12px', color: 'var(--text-primary)', letterSpacing: '0.04em',
  },
  panelSection: { padding: '14px 16px', borderBottom: '1px solid var(--border)' },
  panelSectionTitle: { fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' },
  panelBtnRow: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
  checkRow: { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', cursor: 'pointer', fontSize: '12px', color: 'var(--text-muted)' },
};

function useResizableColumns(defaults) {
  const [widths, setWidths] = useState(defaults);
  const dragging = useRef(null);

  function onMouseDown(e, idx) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = widths[idx];
    dragging.current = { idx, startX, startW };
    function onMove(ev) {
      if (!dragging.current) return;
      const { idx, startX, startW } = dragging.current;
      const newW = Math.max(50, startW + ev.clientX - startX);
      setWidths(prev => { const next = [...prev]; next[idx] = newW; return next; });
    }
    function onUp() {
      dragging.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  return { widths, onMouseDown };
}

function fmt(n) { return n == null ? '—' : Number(n).toLocaleString(); }
function sevColor(sev) { return SEV_COLOR[(sev || '').toLowerCase()] || 'var(--text-muted)'; }
function sevColorHex(sev) { return SEV_COLOR_HEX[(sev || '').toLowerCase()] || '#888'; }

// SVG donut chart — one path per severity slice, interactive
function DonutChart({ severities, sevFilter, onSliceClick, size = 88 }) {
  const [hovered, setHovered] = useState(null);
  const cx = size / 2, cy = size / 2, R = size * 0.41, r = size * 0.25;
  const total = severities.reduce((sum, row) => sum + Number(row.count), 0) || 1;
  const order = ['critical', 'high', 'medium', 'low', 'info'];

  // Build slices
  const slices = [];
  let angle = -Math.PI / 2; // start at top
  for (const sev of order) {
    const row = severities.find(x => x.severity === sev);
    if (!row) continue;
    const share = Number(row.count) / total;
    if (share === 0) continue;
    const sweep = share * 2 * Math.PI;
    const x1 = cx + R * Math.cos(angle);
    const y1 = cy + R * Math.sin(angle);
    const x2 = cx + R * Math.cos(angle + sweep);
    const y2 = cy + R * Math.sin(angle + sweep);
    const ix1 = cx + r * Math.cos(angle);
    const iy1 = cy + r * Math.sin(angle);
    const ix2 = cx + r * Math.cos(angle + sweep);
    const iy2 = cy + r * Math.sin(angle + sweep);
    const large = sweep > Math.PI ? 1 : 0;
    const d = [
      `M ${x1} ${y1}`,
      `A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`,
      `L ${ix2} ${iy2}`,
      `A ${r} ${r} 0 ${large} 0 ${ix1} ${iy1}`,
      'Z',
    ].join(' ');
    slices.push({ sev, d, count: Number(row.count), share, midAngle: angle + sweep / 2 });
    angle += sweep;
  }

  // Single slice — SVG arc can't draw a full circle, render as two rings instead
  if (slices.length === 1) {
    const { sev, count, share } = slices[0];
    return (
      <svg width={size} height={size} style={{ flexShrink: 0, cursor: 'pointer' }} onClick={() => onSliceClick(sev)}>
        <circle cx={cx} cy={cy} r={R} fill={sevColorHex(sev)} opacity={0.8} stroke="var(--bg-surface)" strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r={r} fill="var(--bg-surface)" />
        <title>{sev}: {count.toLocaleString()} ({Math.round(share * 100)}%)</title>
      </svg>
    );
  }

  return (
    <svg width={size} height={size} style={{ flexShrink: 0, cursor: 'pointer' }}>
      {slices.map(({ sev, d, count, share }) => {
        const isHovered = hovered === sev;
        const isActive = sevFilter === sev;
        const dimmed = sevFilter && !isActive;
        const scale = isHovered ? 1.08 : 1;
        return (
          <g key={sev}
            style={{ transformOrigin: '44px 44px', transform: `scale(${scale})`, transition: 'transform 0.15s' }}
            onClick={() => onSliceClick(sev)}
            onMouseEnter={() => setHovered(sev)}
            onMouseLeave={() => setHovered(null)}
          >
            <path
              d={d}
              fill={sevColorHex(sev)}
              opacity={dimmed ? 0.25 : isActive ? 1 : 0.8}
              stroke="var(--bg-surface)"
              strokeWidth="1.5"
            />
            {isHovered && (
              <title>{sev}: {count.toLocaleString()} ({Math.round(share * 100)}%)</title>
            )}
          </g>
        );
      })}
      {/* Center hole */}
      <circle cx={cx} cy={cy} r={r - 1} fill="var(--bg-surface)" />
      {/* Center label */}
      {hovered && severities.find(x => x.severity === hovered) && (
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize="9" fill="var(--text-muted, #888)" fontFamily="var(--font)">
          {Math.round((severities.find(x => x.severity === hovered).count / total) * 100)}%
        </text>
      )}
    </svg>
  );
}

// Alert trend sparkline — bar chart, bucket size adapts to time window
function SparklineChart({ data, hours }) {
  const W = 220, H = 80, BAR_GAP = 2;
  const now = new Date();

  // Determine bucket size in ms and number of slots
  let bucketMs, numSlots;
  if (hours === 1)        { bucketMs = 5 * 60000;  numSlots = 12; }  // 5-min buckets
  else if (hours === 6)   { bucketMs = 30 * 60000; numSlots = 12; }  // 30-min buckets
  else if (hours === 24)  { bucketMs = 60 * 60000; numSlots = 24; }  // 1-hour buckets
  else if (hours === 48)  { bucketMs = 60 * 60000; numSlots = 48; }  // 1-hour buckets
  else                    { bucketMs = 60 * 60000; numSlots = 168; } // 7d, 1-hour

  const slots = Array.from({ length: numSlots }, (_, i) => {
    const slotMs = Math.floor(now.getTime() / bucketMs) * bucketMs - (numSlots - 1 - i) * bucketMs;
    const slotTime = new Date(slotMs);
    const match = data.find(r => {
      const rMs = new Date(r.hour).getTime();
      return Math.abs(rMs - slotMs) < bucketMs / 2;
    });
    return { hour: slotTime, count: match ? Number(match.count) : 0 };
  });

  const max = Math.max(...slots.map(s => s.count), 1);
  const barW = Math.max(1, (W - BAR_GAP * (numSlots - 1)) / numSlots);
  const total = slots.reduce((s, r) => s + r.count, 0);
  const [tooltip, setTooltip] = useState(null);

  const labelFmt = hours <= 6
    ? (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const midLabel = hours === 1 ? '-30m' : hours === 6 ? '-3h' : hours === 24 ? '-12h' : hours === 48 ? '-24h' : '-3.5d';
  const startLabel = hours === 1 ? '-1h' : hours === 6 ? '-6h' : hours === 24 ? '-24h' : hours === 48 ? '-48h' : '-7d';
  const windowLabel = hours === 168 ? '7d' : `${hours}h`;

  return (
    <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      {tooltip && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, textAlign: 'center', fontSize: '10px', color: 'var(--text-muted)', pointerEvents: 'none' }}>
          {labelFmt(tooltip.hour)} - {tooltip.count} alert{tooltip.count !== 1 ? 's' : ''}
        </div>
      )}
      {!tooltip && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, textAlign: 'center', fontSize: '10px', color: 'var(--text-muted)', pointerEvents: 'none' }}>
          {total} alert{total !== 1 ? 's' : ''} in last {windowLabel}
        </div>
      )}
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        {slots.map((slot, i) => {
          const barH = slot.count === 0 ? 1 : Math.max(3, Math.round((slot.count / max) * H));
          const x = i * (barW + BAR_GAP);
          const y = H - barH;
          const isRecent = i >= numSlots - Math.ceil(numSlots / 6);
          return (
            <rect
              key={i}
              x={x} y={y} width={barW} height={barH}
              fill={slot.count === 0 ? 'var(--border)' : isRecent ? 'var(--severity-high)' : 'var(--text-muted)'}
              opacity={slot.count === 0 ? 0.3 : 0.8}
              onMouseEnter={() => setTooltip(slot)}
              onMouseLeave={() => setTooltip(null)}
              style={{ cursor: slot.count > 0 ? 'default' : undefined }}
            />
          );
        })}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-muted)', marginTop: '4px' }}>
        <span>{startLabel}</span>
        <span>{midLabel}</span>
        <span>now</span>
      </div>
    </div>
  );
}

// Slide-in filter panel
function FilterPanel({ open, onClose, hours, setHours, sevFilters, toggleSevFilter, setSevFilters, catFilter, setCatFilter, srcFilter, setSrcFilter, categories, sourcesList, visibleCols, setVisibleCols, showSuppressed, setShowSuppressed }) {
  if (!open) return null;
  // Show categories present in data; fall back to full list if data not loaded yet
  const catOptions = categories.length ? categories : ALL_CATEGORIES;
  return (
    <>
      <div style={s.panelOverlay} onClick={onClose} />
      <div style={s.panel}>
        <div style={s.panelHeader}>
          Filters
          <button style={s.modalClose} onClick={onClose}>✕</button>
        </div>

        {/* Time Range */}
        <div style={s.panelSection}>
          <div style={s.panelSectionTitle}>Time Range</div>
          <div style={s.panelBtnRow}>
            {HOURS_OPTIONS.map(h => (
              <button key={h} style={hours === h ? s.btnActive : s.btn} onClick={() => setHours(h)}>
                {h < 24 ? `${h}h` : h === 24 ? '24h' : h === 48 ? '48h' : '7d'}
              </button>
            ))}
          </div>
        </div>

        {/* Severity */}
        <div style={s.panelSection}>
          <div style={s.panelSectionTitle}>Severity</div>
          <div style={s.panelBtnRow}>
            <button
              style={sevFilters.size === 0 ? s.btnActive : s.btn}
              onClick={() => setSevFilters(new Set())}
            >All</button>
            {['critical', 'high', 'medium', 'low', 'info'].map(sev => (
              <button
                key={sev}
                style={{
                  background: sevFilters.has(sev) ? sevColor(sev) : 'none',
                  border: `1px solid ${sevColor(sev)}`,
                  color: sevFilters.has(sev) ? 'var(--bg-primary)' : sevColor(sev),
                  fontFamily: 'var(--font)', fontSize: '11px', padding: '4px 12px',
                  cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase',
                }}
                onClick={() => toggleSevFilter(sev)}
              >{sev}</button>
            ))}
          </div>
        </div>

        {/* Category — dynamic from actual data */}
        <div style={s.panelSection}>
          <div style={s.panelSectionTitle}>Category</div>
          <div style={s.panelBtnRow}>
            <button key="all" style={catFilter === null ? s.btnActive : s.btn} onClick={() => setCatFilter(null)}>All</button>
            {catOptions.map(cat => (
              <button key={cat} style={catFilter === cat ? s.btnActive : s.btn} onClick={() => setCatFilter(cat)}>
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Source — dynamic from actual data */}
        {sourcesList.length > 0 && (
          <div style={s.panelSection}>
            <div style={s.panelSectionTitle}>Source</div>
            <div style={s.panelBtnRow}>
              <button style={srcFilter === null ? s.btnActive : s.btn} onClick={() => setSrcFilter(null)}>All</button>
              {sourcesList.map(src => (
                <button key={src} style={srcFilter === src ? s.btnActive : s.btn} onClick={() => setSrcFilter(src)}>
                  {src}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Suppressed Events */}
        <div style={s.panelSection}>
          <div style={s.panelSectionTitle}>Suppressed Events</div>
          <label style={{ ...s.checkRow, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showSuppressed}
              onChange={() => setShowSuppressed(v => !v)}
              style={{ accentColor: 'var(--text-muted)', cursor: 'pointer' }}
            />
            Show suppressed events
          </label>
        </div>

        {/* Columns */}
        <div style={s.panelSection}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={s.panelSectionTitle}>Columns</div>
            <button
              style={{ ...s.btn, fontSize: '10px', padding: '2px 8px' }}
              onClick={() => setVisibleCols(COL_NAMES.map(() => true))}
            >
              Reset
            </button>
          </div>
          {COL_NAMES.map((name, i) => (
            <label key={name} style={s.checkRow}>
              <input
                type="checkbox"
                checked={visibleCols[i]}
                onChange={() => setVisibleCols(prev => { const next = [...prev]; next[i] = !next[i]; return next; })}
                style={{ accentColor: 'var(--text-muted)', cursor: 'pointer' }}
              />
              {name}
            </label>
          ))}
        </div>
      </div>
    </>
  );
}

export function SiemDashboard({ onNavigate }) {
  const { getAccessTokenSilently } = useAuth0();

  // Load persisted state
  const persisted = loadPersistedState();

  const [hours, setHoursRaw] = useState(persisted?.hours ?? 24);
  const [sevFilters, setSevFiltersRaw] = useState(() => new Set(persisted?.sevFilters ?? []));
  const [catFilter, setCatFilterRaw] = useState(persisted?.catFilter ?? null);
  const [srcFilter, setSrcFilterRaw] = useState(persisted?.srcFilter ?? null);
  const [visibleCols, setVisibleColsRaw] = useState(persisted?.visibleCols ?? COL_NAMES.map(() => true));
  const [panelOpen, setPanelOpen] = useState(false);

  // Wrap setters to also persist
  function setHours(v) { setHoursRaw(v); savePersistedState({ hours: v, sevFilters: [...sevFilters], catFilter, srcFilter, visibleCols }); }
  function setSevFilters(next) { setSevFiltersRaw(next); savePersistedState({ hours, sevFilters: [...next], catFilter, srcFilter, visibleCols }); }
  function toggleSevFilter(sev) {
    setSevFilters(prev => {
      const next = new Set(prev);
      next.has(sev) ? next.delete(sev) : next.add(sev);
      return next;
    });
  }
  function setCatFilter(v) { setCatFilterRaw(v); savePersistedState({ hours, sevFilters: [...sevFilters], catFilter: v, srcFilter, visibleCols }); }
  function setSrcFilter(v) { setSrcFilterRaw(v); savePersistedState({ hours, sevFilters: [...sevFilters], catFilter, srcFilter: v, visibleCols }); }
  function setVisibleCols(v) {
    const next = typeof v === 'function' ? v(visibleCols) : v;
    setVisibleColsRaw(next);
    savePersistedState({ hours, sevFilters: [...sevFilters], catFilter, srcFilter, visibleCols: next });
  }

  const [stats, setStats] = useState(null);
  const [severities, setSeverities] = useState([]);
  const [sources, setSources] = useState([]);
  const [recent, setRecent] = useState([]);
  // Client-side multi-severity filter (when >1 selected, server only gets one so filter here)
  const filteredRecent = sevFilters.size > 1 ? recent.filter(r => sevFilters.has(r.severity)) : recent;
  const [categories, setCategories] = useState([]);
  const [sourcesList, setSourcesList] = useState([]);
  const [alertSummary, setAlertSummary] = useState([]);
  const [insightTab, setInsightTab] = useState('event-ids');
  const [topEventIds, setTopEventIds] = useState([]);
  const [failedLogins, setFailedLogins] = useState([]);
  const [topUsernames, setTopUsernames] = useState([]);
  const [alertTrend, setAlertTrend] = useState([]);
  const [alertHourly, setAlertHourly] = useState([]);
  const [sparklineHours, setSparklineHours] = useState(24);
  const [ruleHits, setRuleHits] = useState([]);
  const [recentAlerts, setRecentAlerts] = useState([]);   // top 5 new alerts
  const [realtimeResults, setRealtimeResults] = useState([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [contextMenu, setContextMenu] = useState(null); // { x, y, row }
  const [caseTitle, setCaseTitle] = useState('');
  const [cases, setCases] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [creatingCase, setCreatingCase] = useState(false);
  const [addingToCase, setAddingToCase] = useState(false);
  const loadingRef = useRef(false);
  const [showSuppressed, setShowSuppressed] = useState(false);

  // Debounce search input 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const { widths, onMouseDown } = useResizableColumns(COL_DEFAULTS_W);

  // Fast refresh: stats + alerts + recent events — triggered by WebSocket and filter changes
  const loadLive = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const token = await getAccessTokenSilently();
      const headers = { Authorization: `Bearer ${token}` };
      const sup = showSuppressed ? '&showSuppressed=1' : '';
      const h = `?hours=${hours}`;
      const recentParams = new URLSearchParams({ hours });
      if (sevFilters.size === 1) recentParams.set('severity', [...sevFilters][0]);
      if (catFilter) recentParams.set('category', catFilter);
      if (srcFilter) recentParams.set('source', srcFilter);
      if (debouncedSearch.trim()) recentParams.set('q', debouncedSearch.trim());
      if (showSuppressed) recentParams.set('showSuppressed', '1');
      const recentUrl = `/api/siem/events/recent?${recentParams}`;

      const [statsRes, recentRes, alertCountsRes, alertsRes] = await Promise.all([
        fetch(`/api/siem/stats${h}${sup}`, { headers }),
        fetch(recentUrl, { headers }),
        fetch('/api/siem/alerts/counts', { headers }),
        fetch('/api/siem/alerts?status=new', { headers }),
      ]);

      if (!statsRes.ok) throw new Error(`Stats ${statsRes.status}`);

      const [st, rec, alertCounts, alertsNew] = await Promise.all([
        statsRes.json(), recentRes.json(),
        alertCountsRes.ok ? alertCountsRes.json() : Promise.resolve([]),
        alertsRes.ok ? alertsRes.json() : Promise.resolve([]),
      ]);

      setStats(st);
      setRecent(Array.isArray(rec) ? rec : []);
      setAlertSummary(Array.isArray(alertCounts) ? alertCounts : []);
      setRecentAlerts(Array.isArray(alertsNew) ? alertsNew.slice(0, 5) : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [hours, sevFilters, catFilter, srcFilter, debouncedSearch, showSuppressed, getAccessTokenSilently]);

  // Slow refresh: charts + insights — triggered on mount and every 5 minutes
  const loadCharts = useCallback(async () => {
    try {
      const token = await getAccessTokenSilently();
      const headers = { Authorization: `Bearer ${token}` };
      const sup = showSuppressed ? '&showSuppressed=1' : '';
      const h = `?hours=${hours}`;

      const [sevRes, srcRes, catRes, srcListRes, topIdsRes, failedLoginsRes, topUsersRes, alertTrendRes, ruleHitsRes] = await Promise.all([
        fetch(`/api/siem/events/by-severity${h}${sup}`, { headers }),
        fetch(`/api/siem/events/by-source${h}`, { headers }),
        fetch(`/api/siem/events/categories${h}`, { headers }),
        fetch(`/api/siem/events/sources-list${h}`, { headers }),
        fetch(`/api/siem/events/top-event-ids${h}${sup}`, { headers }),
        fetch(`/api/siem/events/failed-logins${h}`, { headers }),
        fetch(`/api/siem/events/top-usernames${h}`, { headers }),
        fetch('/api/siem/alerts/trend', { headers }),
        fetch(`/api/siem/rules/hit-counts${h}`, { headers }),
      ]);

      const [sev, src, cats, srcs, topIds, failedLoginsData, topUsers, trendData, hitsData] = await Promise.all([
        sevRes.ok ? sevRes.json() : Promise.resolve([]),
        srcRes.ok ? srcRes.json() : Promise.resolve([]),
        catRes.ok ? catRes.json() : Promise.resolve([]),
        srcListRes.ok ? srcListRes.json() : Promise.resolve([]),
        topIdsRes.ok ? topIdsRes.json() : Promise.resolve([]),
        failedLoginsRes.ok ? failedLoginsRes.json() : Promise.resolve([]),
        topUsersRes.ok ? topUsersRes.json() : Promise.resolve([]),
        alertTrendRes.ok ? alertTrendRes.json() : Promise.resolve([]),
        ruleHitsRes.ok ? ruleHitsRes.json() : Promise.resolve([]),
      ]);

      setSeverities(Array.isArray(sev) ? sev : []);
      setSources(Array.isArray(src) ? src : []);
      setCategories(Array.isArray(cats) ? cats.map(r => r.category) : []);
      setSourcesList(Array.isArray(srcs) ? srcs.map(r => r.source) : []);
      setTopEventIds(Array.isArray(topIds) ? topIds : []);
      setFailedLogins(Array.isArray(failedLoginsData) ? failedLoginsData : []);
      setTopUsernames(Array.isArray(topUsers) ? topUsers : []);
      setAlertTrend(Array.isArray(trendData) ? trendData : []);
      setRuleHits(Array.isArray(hitsData) ? hitsData : []);
    } catch {}
  }, [hours, showSuppressed, getAccessTokenSilently]);

  const loadSparkline = useCallback(async () => {
    try {
      const token = await getAccessTokenSilently();
      const res = await fetch(`/api/siem/alerts/hourly?hours=${sparklineHours}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setAlertHourly(await res.json());
    } catch {}
  }, [sparklineHours, getAccessTokenSilently]);

  const loadRealtimeResults = useCallback(async () => {
    try {
      const token = await getAccessTokenSilently();
      const res = await fetch('/api/siem/realtime/results', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setRealtimeResults(await res.json());
    } catch {}
  }, [getAccessTokenSilently]);

  // Live data: re-runs on any filter change
  useEffect(() => {
    loadLive();
    const liveInterval = setInterval(loadLive, 15000);
    return () => clearInterval(liveInterval);
  }, [loadLive]);

  // Charts: only re-runs when hours or showSuppressed changes, not on filter changes
  useEffect(() => {
    loadCharts();
    const chartsInterval = setInterval(loadCharts, 300000);
    return () => clearInterval(chartsInterval);
  }, [loadCharts]);

  useEffect(() => {
    loadSparkline();
  }, [loadSparkline]);

  useEffect(() => {
    loadRealtimeResults();
  }, [loadRealtimeResults]);

  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
    let debounce = null;
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'new_events' || msg.type === 'new_alerts') {
          clearTimeout(debounce);
          debounce = setTimeout(loadLive, 500);
        }
        if (msg.type === 'realtime_analysis') {
          clearTimeout(debounce);
          debounce = setTimeout(loadRealtimeResults, 500);
        }
      } catch {}
    };
    return () => { clearTimeout(debounce); if (ws.readyState !== WebSocket.CONNECTING) ws.close(); else ws.onopen = () => ws.close(); };
  }, [loadLive, loadRealtimeResults]);

  const totalSev = severities.reduce((sum, r) => sum + Number(r.count), 0);
  const hasAlerts = recentAlerts.length > 0 || alertSummary.some(r => Number(r.count) > 0);

  // Only render visible columns
  const visibleIdxs = COL_NAMES.map((_, i) => i).filter(i => visibleCols[i]);

  async function ackAlert(alertId) {
    try {
      const token = await getAccessTokenSilently();
      await fetch(`/api/siem/alerts/${alertId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'acknowledged' }),
      });
      setRecentAlerts(prev => prev.filter(a => a.id !== alertId));
      setAlertSummary(prev => prev.map(r => r.status === 'new' ? { ...r, count: Math.max(0, Number(r.count) - 1) } : r));
    } catch (e) { console.error(e); }
  }

  function handleDonutClick(sev) {
    toggleSevFilter(sev);
  }

  const activeFilterCount = [sevFilters.size > 0, catFilter, srcFilter].filter(Boolean).length + visibleCols.filter(v => !v).length;

  async function loadCasesForEvent() {
    try {
      const token = await getAccessTokenSilently();
      const res = await fetch('/api/siem/cases', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setCases(Array.isArray(data) ? data : []);
      setSelectedCaseId('');
    } catch {}
  }

  async function createCaseFromEvent() {
    if (!caseTitle.trim() || !selectedEvent) return;
    setCreatingCase(true);
    try {
      const token = await getAccessTokenSilently();
      const caseRes = await fetch('/api/siem/cases', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: caseTitle.trim(), severity: selectedEvent.severity }),
      });
      const newCase = await caseRes.json();
      if (selectedEvent.alert_id) {
        await fetch(`/api/siem/cases/${newCase.id}/alerts`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ alert_id: selectedEvent.alert_id }),
        });
      }
      setCaseTitle('');
      await loadCasesForEvent();
    } catch {} finally {
      setCreatingCase(false);
    }
  }

  async function addEventToCase() {
    if (!selectedCaseId || !selectedEvent?.alert_id) return;
    setAddingToCase(true);
    try {
      const token = await getAccessTokenSilently();
      await fetch(`/api/siem/cases/${selectedCaseId}/alerts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert_id: selectedEvent.alert_id }),
      });
      setSelectedCaseId('');
    } catch {} finally {
      setAddingToCase(false);
    }
  }

  return (
    <div style={s.container}>
      <div style={s.pageHeader}>
        <span style={s.pageTitle}>SIEM &nbsp;<span style={s.pageSub}>/ Dashboard</span></span>
        <div style={s.actions}>
          <button style={s.btn} onClick={() => { loadLive(); loadCharts(); }} disabled={loading}>{loading ? '...' : 'Refresh'}</button>
          <button
            style={panelOpen ? s.btnActive : { ...s.btn, ...(activeFilterCount > 0 ? { borderColor: 'var(--text-primary)', color: 'var(--text-primary)' } : {}) }}
            onClick={() => setPanelOpen(v => !v)}
          >
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </button>
        </div>
      </div>

      <FilterPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        hours={hours} setHours={setHours}
        sevFilters={sevFilters} toggleSevFilter={toggleSevFilter} setSevFilters={setSevFilters}
        catFilter={catFilter} setCatFilter={setCatFilter}
        srcFilter={srcFilter} setSrcFilter={setSrcFilter}
        categories={categories} sourcesList={sourcesList}
        visibleCols={visibleCols} setVisibleCols={setVisibleCols}
        showSuppressed={showSuppressed} setShowSuppressed={setShowSuppressed}
      />

      {error && <div style={s.error}>Error loading data: {error}</div>}

      {/* KPI Row */}
      <div style={s.kpiRow}>
        <div style={s.kpiCard}>
          <div style={s.kpiLabel}>Active Alerts</div>
          <div style={s.kpiValue(alertSummary.find(r => r.status === 'new')?.count > 0 ? 'var(--severity-critical)' : undefined)}>
            {fmt(alertSummary.find(r => r.status === 'new')?.count ?? 0)}
          </div>
          <div style={s.kpiSub}>unacknowledged</div>
        </div>
        <div style={s.kpiCard}>
          <div style={s.kpiLabel}>Critical</div>
          <div style={s.kpiValue('var(--severity-critical)')}>{fmt(stats?.critical)}</div>
          <div style={s.kpiSub}>severity critical</div>
        </div>
        <div style={s.kpiCard}>
          <div style={s.kpiLabel}>High</div>
          <div style={s.kpiValue('var(--severity-high)')}>{fmt(stats?.high)}</div>
          <div style={s.kpiSub}>severity high</div>
        </div>
        <div style={s.kpiCard}>
          <div style={s.kpiLabel}>Total Events</div>
          <div style={s.kpiValue()}>{fmt(stats?.total)}</div>
          <div style={s.kpiSub}>last {hours < 24 ? `${hours}h` : hours === 24 ? '24h' : hours === 48 ? '48h' : '7d'}</div>
        </div>
      </div>

      {/* Main Charts + Alerts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: (hasAlerts || realtimeResults.length > 0) ? '1fr 1fr' : '1fr', gap: '1px', background: 'var(--border-subtle)', borderBottom: '1px solid var(--border)' }}>

        {/* Left: Alerts + AI Alert Analysis */}
        {(hasAlerts || realtimeResults.length > 0) && (
          <div style={{ background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column' }}>
            {/* Active Alerts */}
            {hasAlerts && (<>
              <div style={s.alertsPanelHeader}>
                <div style={s.alertsPanelTitle}>
                  <span>Active Alerts</span>
                  {alertSummary.map(r => (
                    <span key={r.status} style={s.alertCountChip(r.status === 'new' ? 'var(--severity-critical)' : r.status === 'acknowledged' ? 'var(--severity-medium)' : 'var(--text-muted)')}>
                      {r.status} {r.count}
                    </span>
                  ))}
                </div>
                <button style={s.btn} onClick={() => onNavigate('alerts')}>View All →</button>
              </div>
              {recentAlerts.length === 0 && (
                <div style={{ padding: '10px 14px', fontSize: '11px', color: 'var(--text-muted)' }}>No new alerts.</div>
              )}
              {recentAlerts.map(a => (
                <div key={a.id} style={s.alertRow}
                  onClick={() => setSelectedAlert(a)}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-primary)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <span style={s.sevBadge(sevColor(a.severity))}>{a.severity}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', minWidth: 0 }}>
                    <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</span>
                    {a.count > 1 && <span style={{ fontSize: '10px', padding: '1px 5px', border: '1px solid var(--text-muted)', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>{a.count}×</span>}
                  </span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.host || '—'}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', textAlign: 'right' }}>{new Date(a.created_at).toLocaleString()}</span>
                </div>
              ))}
            </>)}

            {/* AI Alert Analysis */}
            {realtimeResults.length > 0 && (
              <div style={{ borderTop: hasAlerts ? '1px solid var(--border)' : 'none' }}>
                <div style={{ ...s.alertsPanelHeader, borderBottom: '1px solid var(--border-subtle)' }}>
                  <div style={s.alertsPanelTitle}>
                    <span>AI Alert Analysis</span>
                  </div>
                </div>
                {realtimeResults.map(r => {
                  const sigColor = r.signal_type === 'suspicious' ? 'var(--severity-critical)' : r.signal_type === 'suppression_conflict' ? 'var(--severity-high)' : 'var(--severity-medium)';
                  const sigLabel = r.signal_type === 'suspicious' ? 'SUSPICIOUS' : r.signal_type === 'suppression_conflict' ? 'CONFLICT' : 'FIRST SEEN';
                  return (
                    <div key={r.id}
                      style={{ ...s.alertRow, cursor: 'pointer' }}
                      onClick={() => { setSelectedEvent({ id: r.log_id, event_id: r.event_id, severity: r.severity, host: r.host, process_name: r.process_name, username: r.username, message: r.message, timestamp: r.timestamp, _llm: { signal_type: r.signal_type, explanation: r.explanation, cve_safe: r.cve_safe, cve_note: r.cve_note } }); loadCasesForEvent(); }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-primary)'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}
                    >
                      <span style={{ fontSize: '10px', padding: '2px 5px', border: `1px solid ${sigColor}`, color: sigColor, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{sigLabel}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)', fontSize: '11px' }}>
                        {r.explanation || `${r.event_id || ''}${r.host ? ` · ${r.host}` : ''}`}
                      </span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '11px' }}>{r.host || '—'}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', textAlign: 'right' }}>{new Date(r.analyzed_at).toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Right: Severity + Top Sources + Insights tabs */}
        <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: 'var(--border-subtle)' }}>
          <div style={{ ...s.chartPanel, gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={s.chartTitle}>Alert Trend</div>
              <div style={{ display: 'flex', gap: '3px' }}>
                {[1, 6, 24, 48, 168].map(h => (
                  <button
                    key={h}
                    onClick={() => setSparklineHours(h)}
                    style={{
                      background: sparklineHours === h ? 'var(--btn-primary-bg)' : 'none',
                      color: sparklineHours === h ? 'var(--btn-primary-text)' : 'var(--text-muted)',
                      border: '1px solid var(--border)',
                      fontFamily: 'var(--font)', fontSize: '9px', padding: '2px 5px',
                      cursor: 'pointer', letterSpacing: '0.04em',
                    }}
                  >{h === 168 ? '7d' : `${h}h`}</button>
                ))}
              </div>
            </div>
            {alertHourly.length === 0
              ? <div style={{ fontSize: '11px', color: 'var(--text-muted)', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No alerts in window</div>
              : <SparklineChart data={alertHourly} hours={sparklineHours} />
            }
          </div>

          <div style={s.chartPanel}>
            <div style={s.chartTitle}>Top Sources</div>
            <table style={s.sourceTable}>
              <tbody>
                {sources.slice(0, 6).map(row => {
                  const total = sources.reduce((sum, r) => sum + Number(r.count), 0) || 1;
                  const pct = Math.round((Number(row.count) / total) * 100);
                  return (
                    <tr key={row.host} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '5px 0', color: 'var(--text-primary)', fontSize: '11px' }}>{row.host || 'unknown'}</td>
                      <td style={{ padding: '5px 0', color: 'var(--text-muted)', textAlign: 'right', fontSize: '11px' }}>{pct}%</td>
                    </tr>
                  );
                })}
                {!sources.length && <tr><td style={{ padding: '5px 0', color: 'var(--text-muted)', fontSize: '11px' }}>No data</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        {/* Insights Tabbed Panel — inside right column */}
        {(() => {
        const TABS = [
          { id: 'event-ids', label: 'Top Event IDs' },
          { id: 'failed-logins', label: 'Failed Logins' },
          { id: 'top-usernames', label: 'Top Usernames' },
          { id: 'alert-trend', label: 'Alert Trend' },
          { id: 'rule-hits', label: 'Rule Hits' },
        ];
        const tabBtn = (id) => ({
          background: 'none', border: 'none', borderBottom: insightTab === id ? '2px solid var(--text-primary)' : '2px solid transparent',
          color: insightTab === id ? 'var(--text-primary)' : 'var(--text-muted)',
          fontFamily: 'var(--font)', fontSize: '11px', padding: '8px 14px', cursor: 'pointer',
          letterSpacing: '0.04em', textTransform: 'uppercase',
        });
        const rankTable = (rows, keyField, label) => (
          rows.length === 0
            ? <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>No data</div>
            : <table style={{ ...s.sourceTable, maxWidth: '480px' }}>
                <thead>
                  <tr>
                    <th style={{ ...s.th, position: 'static', background: 'none', padding: '4px 0' }}>{label}</th>
                    <th style={{ ...s.th, position: 'static', background: 'none', padding: '4px 0', textAlign: 'right' }}>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td style={{ padding: '5px 0', color: 'var(--text-primary)', fontSize: '11px' }}>{r[keyField] || '—'}</td>
                      <td style={{ padding: '5px 0', color: 'var(--text-muted)', textAlign: 'right', fontSize: '11px' }}>{Number(r.count).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
        );
        return (
          <div style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', paddingLeft: '6px' }}>
              {TABS.map(t => (
                <button key={t.id} style={tabBtn(t.id)} onClick={() => setInsightTab(t.id)}>{t.label}</button>
              ))}
            </div>
            <div style={{ padding: '14px 20px', minHeight: '120px' }}>
              {insightTab === 'event-ids' && (
                topEventIds.length === 0
                  ? <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>No data</div>
                  : <table style={{ ...s.sourceTable, maxWidth: '480px' }}>
                      <thead>
                        <tr>
                          <th style={{ ...s.th, position: 'static', background: 'none', padding: '4px 0' }}>Event ID</th>
                          <th style={{ ...s.th, position: 'static', background: 'none', padding: '4px 0', textAlign: 'right' }}>Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topEventIds.map((r, i) => {
                          const isActive = search === `event_id:${r.event_id}`;
                          return (
                            <tr key={i}
                              style={{ borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', background: isActive ? 'var(--bg-primary)' : '' }}
                              onClick={() => setSearch(isActive ? '' : `event_id:${r.event_id}`)}
                              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-primary)'; }}
                              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = ''; }}
                              title={isActive ? 'Click to clear filter' : `Filter events to event_id:${r.event_id}`}
                            >
                              <td style={{ padding: '5px 0', color: isActive ? 'var(--text-primary)' : 'var(--severity-info)', fontSize: '11px', fontWeight: isActive ? 'bold' : 'normal' }}>
                                {isActive ? '✕ ' : ''}{r.event_id}
                              </td>
                              <td style={{ padding: '5px 0', color: 'var(--text-muted)', textAlign: 'right', fontSize: '11px' }}>{Number(r.count).toLocaleString()}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
              )}
              {insightTab === 'failed-logins' && (
                failedLogins.length === 0
                  ? <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>No failed logins in this window.</div>
                  : <table style={{ ...s.sourceTable, maxWidth: '700px' }}>
                      <thead>
                        <tr>
                          {['Time', 'Username', 'Host', 'Source IP'].map(h => (
                            <th key={h} style={{ ...s.th, position: 'static', background: 'none', padding: '4px 8px 4px 0' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {failedLogins.map((r, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                            <td style={{ padding: '5px 8px 5px 0', color: 'var(--text-muted)', fontSize: '11px', whiteSpace: 'nowrap' }}>{new Date(r.timestamp).toLocaleTimeString()}</td>
                            <td style={{ padding: '5px 8px 5px 0', color: 'var(--text-primary)', fontSize: '11px' }}>{r.username || '—'}</td>
                            <td style={{ padding: '5px 8px 5px 0', color: 'var(--text-muted)', fontSize: '11px' }}>{r.host || '—'}</td>
                            <td style={{ padding: '5px 8px 5px 0', color: 'var(--text-muted)', fontSize: '11px' }}>{r.source_ip || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
              )}
              {insightTab === 'top-usernames' && rankTable(topUsernames, 'username', 'Username')}
              {insightTab === 'alert-trend' && (
                alertTrend.length === 0
                  ? <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>No alert data in the last 7 days.</div>
                  : <table style={{ ...s.sourceTable, maxWidth: '480px' }}>
                      <thead>
                        <tr>
                          <th style={{ ...s.th, position: 'static', background: 'none', padding: '4px 0' }}>Day</th>
                          <th style={{ ...s.th, position: 'static', background: 'none', padding: '4px 0', textAlign: 'right' }}>Alerts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {alertTrend.map((r, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                            <td style={{ padding: '5px 0', color: 'var(--text-primary)', fontSize: '11px' }}>{new Date(r.day).toLocaleDateString()}</td>
                            <td style={{ padding: '5px 0', color: 'var(--text-muted)', textAlign: 'right', fontSize: '11px' }}>{Number(r.count).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
              )}
              {insightTab === 'rule-hits' && (
                ruleHits.length === 0
                  ? <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>No rules configured.</div>
                  : <table style={{ ...s.sourceTable, maxWidth: '700px' }}>
                      <thead>
                        <tr>
                          {['Rule', 'Severity', 'Hits', ''].map(h => (
                            <th key={h} style={{ ...s.th, position: 'static', background: 'none', padding: '4px 8px 4px 0' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {ruleHits.map((r, i) => {
                          const matchParts = [
                            r.match_event_id && `event_id:${r.match_event_id}`,
                            r.match_username && `username:${r.match_username}`,
                            r.match_host && `host:${r.match_host}`,
                            r.match_src_ip && `src_ip:${r.match_src_ip}`,
                            r.match_dest_ip && `dest_ip:${r.match_dest_ip}`,
                            r.match_process && `process:${r.match_process}`,
                            r.match_message && `message:${r.match_message}`,
                            r.match_category && `category:${r.match_category}`,
                            r.match_severity && `severity:${r.match_severity}`,
                          ].filter(Boolean);
                          const filterQuery = matchParts[0] || '';
                          const isActive = filterQuery && search === filterQuery;
                          return (
                            <tr key={i}
                              style={{ borderBottom: '1px solid var(--border-subtle)', cursor: filterQuery ? 'pointer' : 'default', background: isActive ? 'var(--bg-primary)' : '' }}
                              onClick={() => filterQuery && setSearch(isActive ? '' : filterQuery)}
                              onMouseEnter={e => { if (filterQuery && !isActive) e.currentTarget.style.background = 'var(--bg-primary)'; }}
                              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = ''; }}
                              title={filterQuery ? (isActive ? 'Click to clear filter' : `Filter: ${filterQuery}`) : ''}
                            >
                              <td style={{ padding: '5px 8px 5px 0', color: 'var(--text-primary)', fontSize: '11px', fontWeight: isActive ? 'bold' : 'normal' }}>
                                {isActive ? '✕ ' : ''}{r.name}
                              </td>
                              <td style={{ padding: '5px 8px 5px 0', fontSize: '11px' }}><span style={s.sevBadge(sevColor(r.severity))}>{r.severity}</span></td>
                              <td style={{ padding: '5px 8px 5px 0', color: 'var(--text-muted)', fontSize: '11px' }}>{Number(r.hits).toLocaleString()}</td>
                              <td style={{ padding: '5px 0', fontSize: '11px', textAlign: 'right' }}>
                                <button style={{ ...s.btn, fontSize: '10px', padding: '2px 8px' }}
                                  onClick={e => { e.stopPropagation(); onNavigate('rules'); }}
                                >View Rule →</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
              )}
            </div>
          </div>
        );
      })()}
        </div>{/* end right flex column */}
      </div>{/* end outer main grid */}

      {/* Search Bar */}
      <div style={s.searchBar}>
        {sourcesList.length > 0 && (
          <select
            style={{ ...s.searchSelect, color: srcFilter ? 'var(--text-primary)' : 'var(--text-muted)' }}
            value={srcFilter || ''}
            onChange={e => setSrcFilter(e.target.value || null)}
          >
            <option value="">All Sources</option>
            {sourcesList.map(src => <option key={src} value={src}>{src}</option>)}
          </select>
        )}
        <input
          style={s.searchInput}
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search message, event_id, username, host, ip, process… or field:value (e.g. username:SYSTEM, event_id:4625)"
          spellCheck={false}
        />
        {search && (
          <button style={s.searchClear} onClick={() => setSearch('')} title="Clear search">✕</button>
        )}
      </div>

      {/* Recent Events */}
      <div style={s.sectionBar}>
        <span>Recent Events</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '10px' }}>
          <span>
            {filteredRecent.length} shown
            {sevFilters.size > 0 ? ` · ${[...sevFilters].join(',')}` : ''}
            {catFilter ? ` · ${catFilter}` : ''}
            {srcFilter ? ` · ${srcFilter}` : ''}
            {debouncedSearch.trim() ? ` · "${debouncedSearch.trim()}"` : ''}
          </span>
          {(sevFilters.size > 0 || catFilter || srcFilter) && (
            <button
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontFamily: 'var(--font)', fontSize: '10px', cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase', padding: 0 }}
              onClick={() => { setSevFilters(new Set()); setCatFilter(null); setSrcFilter(null); }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              Clear filters
            </button>
          )}
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ ...s.table, width: '100%', minWidth: `${visibleIdxs.reduce((sum, i) => sum + widths[i], 0)}px` }}>
          <colgroup>
            {visibleIdxs.map(i => <col key={i} style={{ width: `${widths[i]}px` }} />)}
          </colgroup>
          <thead>
            <tr>
              {visibleIdxs.map(i => (
                <th key={COL_NAMES[i]} style={s.th}>
                  {COL_NAMES[i]}
                  <div style={s.resizeHandle} onMouseDown={e => onMouseDown(e, i)} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRecent.length === 0 && !loading && (
              <tr><td colSpan={visibleIdxs.length} style={s.muted}>No events yet</td></tr>
            )}
            {filteredRecent.map(row => (
              <tr
                key={row.id}
                style={{ cursor: 'pointer' }}
                onClick={() => { setSelectedEvent(row); loadCasesForEvent(); }}
                onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, row }); }}
                onMouseEnter={e => { Array.from(e.currentTarget.cells).forEach(c => c.style.background = 'var(--bg-surface)'); }}
                onMouseLeave={e => { Array.from(e.currentTarget.cells).forEach(c => c.style.background = ''); }}
              >
                {visibleIdxs.map(i => {
                  const field = COL_FIELDS[i];
                  if (field === 'severity') {
                    return (
                      <td key={i} style={s.td}>
                        <span
                          style={{ ...s.sevBadge(sevColor(row.severity)), cursor: 'pointer' }}
                          onClick={e => { e.stopPropagation(); if (row.severity) toggleSevFilter(row.severity); }}
                        >
                          {row.severity || '—'}
                        </span>
                      </td>
                    );
                  }
                  if (field === 'timestamp') {
                    return <td key={i} style={s.td}>{row.timestamp ? new Date(row.timestamp).toLocaleTimeString() : '—'}</td>;
                  }
                  return <td key={i} style={s.td}>{row[field] || '—'}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedEvent && (
        <div style={s.overlay} onClick={() => { setSelectedEvent(null); setCaseTitle(''); setCases([]); }}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <span style={s.modalTitle}>
                Event {selectedEvent.event_id || '—'} &nbsp;·&nbsp; {selectedEvent.host || '—'} &nbsp;·&nbsp;
                <span style={{ color: sevColor(selectedEvent.severity) }}>{selectedEvent.severity || '—'}</span>
              </span>
              <button style={s.modalClose} onClick={() => { setSelectedEvent(null); setCaseTitle(''); setCases([]); }}>✕</button>
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
              <ProcessTreePanel event={selectedEvent} />
              {selectedEvent._llm && (
                <div style={{ marginTop: '12px', padding: '10px 12px', border: '1px solid var(--border)', background: 'var(--bg-primary)' }}>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '8px' }}>AI Alert Analysis</div>
                  {(() => {
                    const sigColor = selectedEvent._llm.signal_type === 'suspicious' ? 'var(--severity-critical)' : selectedEvent._llm.signal_type === 'suppression_conflict' ? 'var(--severity-high)' : 'var(--severity-medium)';
                    const sigLabel = selectedEvent._llm.signal_type === 'suspicious' ? 'SUSPICIOUS' : selectedEvent._llm.signal_type === 'suppression_conflict' ? 'SUPPRESSION CONFLICT' : 'FIRST SEEN';
                    const cveId = selectedEvent._llm.cve_note?.match(/CVE-\d{4}-\d+/)?.[0];
                    return (<>
                      <div style={{ marginBottom: '6px' }}>
                        <span style={{ fontSize: '10px', padding: '2px 6px', border: `1px solid ${sigColor}`, color: sigColor, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{sigLabel}</span>
                      </div>
                      {selectedEvent._llm.explanation && (
                        <div style={{ fontSize: '11px', color: 'var(--text-primary)', marginBottom: '6px' }}>{selectedEvent._llm.explanation}</div>
                      )}
                      {selectedEvent._llm.cve_note && (
                        <div style={{ fontSize: '11px', color: selectedEvent._llm.cve_safe === false ? 'var(--severity-critical)' : 'var(--text-muted)' }}>
                          {cveId
                            ? <><a href={`https://nvd.nist.gov/vuln/detail/${cveId}`} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>{cveId}</a>{selectedEvent._llm.cve_note.replace(cveId, '').trim() ? ` — ${selectedEvent._llm.cve_note.replace(cveId, '').replace(/^[\s\-—]+/, '')}` : ''}</>
                            : selectedEvent._llm.cve_note}
                        </div>
                      )}
                    </>);
                  })()}
                </div>
              )}
              <>
                  <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Create Case from Alert</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'var(--font)', fontSize: '12px', padding: '6px 10px', outline: 'none', flex: 1 }}
                        placeholder="Case title..."
                        value={caseTitle}
                        onChange={e => setCaseTitle(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && createCaseFromEvent()}
                      />
                      <button style={s.btn} onClick={createCaseFromEvent} disabled={creatingCase || !caseTitle.trim()}>
                        {creatingCase ? '...' : 'Create Case'}
                      </button>
                    </div>
                  </div>
                  {cases.length > 0 && (
                    <div style={{ marginTop: '10px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Add to Existing Case</div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <select
                          style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'var(--font)', fontSize: '12px', padding: '6px 10px', outline: 'none', flex: 1 }}
                          value={selectedCaseId}
                          onChange={e => setSelectedCaseId(e.target.value)}
                        >
                          <option value="">Select a case...</option>
                          {cases.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                        </select>
                        <button style={s.btn} onClick={addEventToCase} disabled={addingToCase || !selectedCaseId}>
                          {addingToCase ? '...' : 'Add'}
                        </button>
                      </div>
                    </div>
                  )}
              </>
            </div>
          </div>
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            { label: 'View Event Detail', onClick: () => setSelectedEvent(contextMenu.row) },
            ...(contextMenu.row.process_name ? [{
              label: `Process Tree: ${contextMenu.row.process_name}`,
              onClick: () => setSelectedEvent(contextMenu.row),
            }] : []),
            ...(contextMenu.row.process_name ? [{
              label: `CVE Lookup: ${contextMenu.row.process_name}`,
              onClick: () => {
                localStorage.setItem('workspace-restore-cve-exploit-mapper', JSON.stringify({ query: contextMenu.row.process_name }));
                window.location.href = '/cve-exploit-mapper';
              },
            }] : []),
          ]}
        />
      )}

      {/* Alert Detail Modal */}
      {selectedAlert && (
        <div style={s.overlay} onClick={() => setSelectedAlert(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <span style={s.modalTitle}>
                Alert &nbsp;·&nbsp; <span style={{ color: sevColor(selectedAlert.severity) }}>{selectedAlert.severity}</span>
              </span>
              <button style={s.modalClose} onClick={() => setSelectedAlert(null)}>✕</button>
            </div>
            <div style={s.modalBody}>
              {[
                ['Title', selectedAlert.title],
                ['Status', selectedAlert.status],
                ['Severity', selectedAlert.severity],
                ['Rule', selectedAlert.rule_name],
                ['Host', selectedAlert.host],
                ['Username', selectedAlert.username],
                ['Source IP', selectedAlert.source_ip],
                ['Dest IP', selectedAlert.dest_ip],
                ['Event ID', selectedAlert.event_id],
                ['Message', selectedAlert.message],
                ['Time', selectedAlert.created_at ? new Date(selectedAlert.created_at).toLocaleString() : null],
              ].filter(([, v]) => v != null && v !== '').map(([label, value]) => (
                <div key={label} style={s.fieldRow}>
                  <div style={s.fieldLabel}>{label}</div>
                  <div style={s.fieldValue}>{String(value)}</div>
                </div>
              ))}
              <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                <button style={s.btnActive} onClick={() => { ackAlert(selectedAlert.id); setSelectedAlert(null); }}>
                  Acknowledge
                </button>
                <button style={s.btn} onClick={() => { setSelectedAlert(null); onNavigate('alerts'); }}>
                  Open in Alert Queue →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
