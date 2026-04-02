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
const COL_DEFAULTS_W = [110, 90, 80, 110, 110, 120, 120, 110, 260];
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
  container: { padding: 0 },
  pageHeader: {
    padding: '12px 20px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
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
  sevBadge: (color) => ({ fontSize: '10px', padding: '2px 7px', letterSpacing: '0.06em', textTransform: 'uppercase', border: `1px solid ${color}`, color, whiteSpace: 'nowrap' }),
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
    display: 'grid', gridTemplateColumns: '80px 1fr 110px 90px',
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

// Slide-in filter panel
function FilterPanel({ open, onClose, hours, setHours, sevFilter, setSevFilter, catFilter, setCatFilter, srcFilter, setSrcFilter, categories, sourcesList, visibleCols, setVisibleCols, showSuppressed, setShowSuppressed }) {
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
            {[null, 'critical', 'high', 'medium', 'low', 'info'].map(sev => (
              <button
                key={sev ?? 'all'}
                style={sevFilter === sev
                  ? { ...s.btnActive, ...(sev ? { background: 'none', border: `1px solid ${sevColor(sev)}`, color: sevColor(sev) } : {}) }
                  : s.btn}
                onClick={() => setSevFilter(sev)}
              >
                {sev ?? 'All'}
              </button>
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
  const [sevFilter, setSevFilterRaw] = useState(persisted?.sevFilter ?? null);
  const [catFilter, setCatFilterRaw] = useState(persisted?.catFilter ?? null);
  const [srcFilter, setSrcFilterRaw] = useState(persisted?.srcFilter ?? null);
  const [visibleCols, setVisibleColsRaw] = useState(persisted?.visibleCols ?? COL_NAMES.map(() => true));
  const [panelOpen, setPanelOpen] = useState(false);

  // Wrap setters to also persist
  function setHours(v) { setHoursRaw(v); savePersistedState({ hours: v, sevFilter, catFilter, srcFilter, visibleCols }); }
  function setSevFilter(v) { setSevFilterRaw(v); savePersistedState({ hours, sevFilter: v, catFilter, srcFilter, visibleCols }); }
  function setCatFilter(v) { setCatFilterRaw(v); savePersistedState({ hours, sevFilter, catFilter: v, srcFilter, visibleCols }); }
  function setSrcFilter(v) { setSrcFilterRaw(v); savePersistedState({ hours, sevFilter, catFilter, srcFilter: v, visibleCols }); }
  function setVisibleCols(v) {
    const next = typeof v === 'function' ? v(visibleCols) : v;
    setVisibleColsRaw(next);
    savePersistedState({ hours, sevFilter, catFilter, srcFilter, visibleCols: next });
  }

  const [stats, setStats] = useState(null);
  const [severities, setSeverities] = useState([]);
  const [sources, setSources] = useState([]);
  const [recent, setRecent] = useState([]);
  const [categories, setCategories] = useState([]);
  const [sourcesList, setSourcesList] = useState([]);
  const [alertSummary, setAlertSummary] = useState([]);
  const [insightTab, setInsightTab] = useState('event-ids');
  const [topEventIds, setTopEventIds] = useState([]);
  const [failedLogins, setFailedLogins] = useState([]);
  const [topUsernames, setTopUsernames] = useState([]);
  const [alertTrend, setAlertTrend] = useState([]);
  const [ruleHits, setRuleHits] = useState([]);
  const [recentAlerts, setRecentAlerts] = useState([]);   // top 5 new alerts
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [contextMenu, setContextMenu] = useState(null); // { x, y, row }
  const loadingRef = useRef(false);
  const [showSuppressed, setShowSuppressed] = useState(false);

  // Debounce search input 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const { widths, onMouseDown } = useResizableColumns(COL_DEFAULTS_W);

  const load = useCallback(async () => {
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
      if (sevFilter) recentParams.set('severity', sevFilter);
      if (catFilter) recentParams.set('category', catFilter);
      if (srcFilter) recentParams.set('source', srcFilter);
      if (debouncedSearch.trim()) recentParams.set('q', debouncedSearch.trim());
      if (showSuppressed) recentParams.set('showSuppressed', '1');
      const recentUrl = `/api/siem/events/recent?${recentParams}`;

      const [statsRes, sevRes, srcRes, recentRes, catRes, srcListRes, alertCountsRes, alertsRes,
             topIdsRes, failedLoginsRes, topUsersRes, alertTrendRes, ruleHitsRes] = await Promise.all([
        fetch(`/api/siem/stats${h}${sup}`, { headers }),
        fetch(`/api/siem/events/by-severity${h}${sup}`, { headers }),
        fetch(`/api/siem/events/by-source${h}`, { headers }),
        fetch(recentUrl, { headers }),
        fetch(`/api/siem/events/categories${h}`, { headers }),
        fetch(`/api/siem/events/sources-list${h}`, { headers }),
        fetch('/api/siem/alerts/counts', { headers }),
        fetch('/api/siem/alerts?status=new', { headers }),
        fetch(`/api/siem/events/top-event-ids${h}${sup}`, { headers }),
        fetch(`/api/siem/events/failed-logins${h}`, { headers }),
        fetch(`/api/siem/events/top-usernames${h}`, { headers }),
        fetch('/api/siem/alerts/trend', { headers }),
        fetch(`/api/siem/rules/hit-counts${h}`, { headers }),
      ]);

      if (!statsRes.ok) throw new Error(`Stats ${statsRes.status}`);

      const [st, sev, src, rec, cats, srcs, alertCounts, alertsNew,
             topIds, failedLoginsData, topUsers, trendData, hitsData] = await Promise.all([
        statsRes.json(), sevRes.json(), srcRes.json(), recentRes.json(),
        catRes.json(), srcListRes.json(),
        alertCountsRes.ok ? alertCountsRes.json() : Promise.resolve([]),
        alertsRes.ok ? alertsRes.json() : Promise.resolve([]),
        topIdsRes.ok ? topIdsRes.json() : Promise.resolve([]),
        failedLoginsRes.ok ? failedLoginsRes.json() : Promise.resolve([]),
        topUsersRes.ok ? topUsersRes.json() : Promise.resolve([]),
        alertTrendRes.ok ? alertTrendRes.json() : Promise.resolve([]),
        ruleHitsRes.ok ? ruleHitsRes.json() : Promise.resolve([]),
      ]);

      setStats(st);
      setSeverities(Array.isArray(sev) ? sev : []);
      setSources(Array.isArray(src) ? src : []);
      setRecent(Array.isArray(rec) ? rec : []);
      setCategories(Array.isArray(cats) ? cats.map(r => r.category) : []);
      setSourcesList(Array.isArray(srcs) ? srcs.map(r => r.source) : []);
      setAlertSummary(Array.isArray(alertCounts) ? alertCounts : []);
      setRecentAlerts(Array.isArray(alertsNew) ? alertsNew.slice(0, 5) : []);
      setTopEventIds(Array.isArray(topIds) ? topIds : []);
      setFailedLogins(Array.isArray(failedLoginsData) ? failedLoginsData : []);
      setTopUsernames(Array.isArray(topUsers) ? topUsers : []);
      setAlertTrend(Array.isArray(trendData) ? trendData : []);
      setRuleHits(Array.isArray(hitsData) ? hitsData : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [hours, sevFilter, catFilter, srcFilter, debouncedSearch, showSuppressed, getAccessTokenSilently]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
    let debounce = null;
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'new_events') { clearTimeout(debounce); debounce = setTimeout(load, 1000); }
      } catch {}
    };
    return () => { clearTimeout(debounce); if (ws.readyState !== WebSocket.CONNECTING) ws.close(); else ws.onopen = () => ws.close(); };
  }, [load]);

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
    setSevFilter(sevFilter === sev ? null : sev);
  }

  const activeFilterCount = [sevFilter, catFilter, srcFilter].filter(Boolean).length + visibleCols.filter(v => !v).length;

  return (
    <div style={s.container}>
      <div style={s.pageHeader}>
        <span style={s.pageTitle}>SIEM &nbsp;<span style={s.pageSub}>/ Dashboard</span></span>
        <div style={s.actions}>
          <button style={s.btn} onClick={load} disabled={loading}>{loading ? '...' : 'Refresh'}</button>
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
        sevFilter={sevFilter} setSevFilter={setSevFilter}
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
      <div style={{ display: 'grid', gridTemplateColumns: hasAlerts ? '1fr 1fr' : '1fr', gap: '1px', background: 'var(--border-subtle)', borderBottom: '1px solid var(--border)' }}>

        {/* Left: Alerts panel (only when alerts exist) */}
        {hasAlerts && (
          <div style={{ background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column' }}>
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
                <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.title}
                  {a.count > 1 && <span style={{ marginLeft: '6px', fontSize: '10px', padding: '1px 5px', border: '1px solid var(--text-muted)', color: 'var(--text-muted)' }}>{a.count}×</span>}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.host || '—'}</span>
                <span style={{ fontSize: '11px' }}>{new Date(a.created_at).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        )}

        {/* Right: Severity + Top Sources side by side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: 'var(--border-subtle)' }}>
          <div style={s.chartPanel}>
            <div style={s.chartTitle}>By Severity</div>
            <div style={s.donutWrap}>
              <DonutChart severities={severities} sevFilter={sevFilter} onSliceClick={handleDonutClick} size={160} />
              <div style={s.legend}>
                {['critical', 'high', 'medium', 'low', 'info'].map(sev => {
                  const row = severities.find(r => r.severity === sev);
                  if (!row) return null;
                  const pct = totalSev ? Math.round((Number(row.count) / totalSev) * 100) : 0;
                  const isActive = sevFilter === sev;
                  return (
                    <div key={sev} style={s.legendItem(isActive, sevColor(sev))} onClick={() => handleDonutClick(sev)}>
                      <div style={s.legendDot(sevColor(sev))} />
                      {sev} {pct}%
                    </div>
                  );
                })}
              </div>
            </div>
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
      </div>

      {/* Insights Tabbed Panel */}
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
            {recent.length} shown
            {sevFilter ? ` · ${sevFilter}` : ''}
            {catFilter ? ` · ${catFilter}` : ''}
            {srcFilter ? ` · ${srcFilter}` : ''}
            {debouncedSearch.trim() ? ` · "${debouncedSearch.trim()}"` : ''}
          </span>
          {(sevFilter || catFilter || srcFilter) && (
            <button
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontFamily: 'var(--font)', fontSize: '10px', cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase', padding: 0 }}
              onClick={() => { setSevFilter(null); setCatFilter(null); setSrcFilter(null); }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              Clear filters
            </button>
          )}
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ ...s.table, width: `${visibleIdxs.reduce((sum, i) => sum + widths[i], 0)}px` }}>
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
            {recent.length === 0 && !loading && (
              <tr><td colSpan={visibleIdxs.length} style={s.muted}>No events yet</td></tr>
            )}
            {recent.map(row => (
              <tr
                key={row.id}
                style={{ cursor: 'pointer' }}
                onClick={() => setSelectedEvent(row)}
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
                          onClick={e => { e.stopPropagation(); setSevFilter(row.severity || null); }}
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
        <div style={s.overlay} onClick={() => setSelectedEvent(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <span style={s.modalTitle}>
                Event {selectedEvent.event_id || '—'} &nbsp;·&nbsp; {selectedEvent.host || '—'} &nbsp;·&nbsp;
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
              <ProcessTreePanel event={selectedEvent} />
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
