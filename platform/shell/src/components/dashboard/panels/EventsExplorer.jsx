import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { ProcessTreePanel, ContextMenu } from '../../ProcessTreePanel.jsx';
import { TimeFieldValue, badgeStyle } from '../../ui/index.js';

// Full events explorer as a dashboard widget: slide-in filter panel
// (time/severity/category/source/columns/suppressed), field-aware search,
// resizable-column table, event-detail modal with process tree + case
// creation, and a right-click context menu. Ported from the legacy
// SiemDashboard so the customizable Dashboard keeps the full triage flow.

const SEV_COLOR = {
  critical: 'var(--severity-critical)', high: 'var(--severity-high)', medium: 'var(--severity-medium)',
  low: 'var(--severity-low)', info: 'var(--severity-info)',
};
const sevColor = (sev) => SEV_COLOR[(sev || '').toLowerCase()] || 'var(--text-muted)';

const HOURS_OPTIONS = [1, 6, 24, 48, 168];
const COL_NAMES = ['Time', 'Severity', 'Event ID', 'Category', 'Host', 'Src IP', 'Dest IP', 'User', 'Message'];
const COL_DEFAULTS_W = [110, 110, 80, 110, 110, 120, 120, 110, 260];
const COL_FIELDS = ['timestamp', 'severity', 'event_id', 'event_category', 'host', 'source_ip', 'dest_ip', 'username', 'message'];
const ALL_CATEGORIES = ['authentication', 'network', 'process', 'file', 'dns', 'registry', 'system', 'firewall', 'account', 'policy'];
const LS_KEY = 'siem_filter_state';

function loadPersistedState() {
  try { const raw = localStorage.getItem(LS_KEY); if (raw) return JSON.parse(raw); } catch {}
  return null;
}
function savePersistedState(state) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {}
}

const s = {
  toolbar: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' },
  searchInput: { flex: 1, background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'var(--font)', fontSize: '12px', padding: '6px 10px', outline: 'none', letterSpacing: '0.02em', minWidth: 0 },
  searchClear: { background: 'none', border: 'none', color: 'var(--text-muted)', fontFamily: 'var(--font)', fontSize: '14px', cursor: 'pointer', padding: '0 4px', lineHeight: 1 },
  btn: { background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', fontFamily: 'var(--font)', fontSize: '11px', padding: '4px 12px', cursor: 'pointer', letterSpacing: '0.04em', whiteSpace: 'nowrap' },
  btnActive: { background: 'var(--btn-primary-bg)', border: '1px solid var(--border)', color: 'var(--btn-primary-text)', fontFamily: 'var(--font)', fontSize: '11px', padding: '4px 12px', cursor: 'pointer', letterSpacing: '0.04em', whiteSpace: 'nowrap' },
  sectionBar: { padding: '6px 12px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  table: { borderCollapse: 'collapse', tableLayout: 'fixed', fontFamily: 'var(--font-mono)' },
  th: { textAlign: 'left', padding: '8px 18px 8px 14px', fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', fontWeight: 'normal', background: 'var(--bg-surface)', position: 'relative', overflow: 'hidden', whiteSpace: 'nowrap', userSelect: 'none', verticalAlign: 'middle' },
  resizeHandle: { position: 'absolute', right: 0, top: 0, bottom: 0, width: '5px', cursor: 'col-resize', zIndex: 1, borderRight: '2px solid var(--border)' },
  td: { padding: '9px 14px', borderBottom: '1px solid var(--border-subtle)', fontSize: '12px', color: 'var(--text-muted)', verticalAlign: 'middle', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 0 },
  sevBadge: (color) => badgeStyle(color),
  muted: { padding: '20px', color: 'var(--text-muted)', fontSize: '12px' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: 'var(--bg-primary)', border: '1px solid var(--border)', width: '680px', maxWidth: '95vw', height: '80vh', display: 'flex', flexDirection: 'column' },
  modalHeader: { padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: '12px', color: 'var(--text-primary)', letterSpacing: '0.04em' },
  modalClose: { background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '16px', cursor: 'pointer', fontFamily: 'var(--font)', lineHeight: 1 },
  modalBody: { padding: '16px', overflow: 'auto', flex: 1 },
  fieldRow: { display: 'grid', gridTemplateColumns: '160px 1fr', borderBottom: '1px solid var(--border-subtle)', padding: '6px 0', gap: '12px' },
  fieldLabel: { fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingTop: '2px' },
  fieldValue: { fontSize: '12px', color: 'var(--text-primary)', wordBreak: 'break-word', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)' },
  panelOverlay: { position: 'fixed', inset: 0, zIndex: 900 },
  panel: { position: 'fixed', top: 0, right: 0, bottom: 0, width: '260px', background: 'var(--bg-primary)', borderLeft: '1px solid var(--border)', zIndex: 901, display: 'flex', flexDirection: 'column', overflowY: 'auto' },
  panelHeader: { padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-primary)', letterSpacing: '0.04em' },
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
    dragging.current = { idx, startX: e.clientX, startW: widths[idx] };
    function onMove(ev) {
      if (!dragging.current) return;
      const { idx, startX, startW } = dragging.current;
      const newW = Math.max(50, startW + ev.clientX - startX);
      setWidths(prev => { const next = [...prev]; next[idx] = newW; return next; });
    }
    function onUp() { dragging.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }
  return { widths, onMouseDown };
}

function FilterPanel({ open, onClose, hours, setHours, sevFilters, toggleSevFilter, setSevFilters, catFilter, setCatFilter, srcFilter, setSrcFilter, categories, sourcesList, visibleCols, setVisibleCols, showSuppressed, setShowSuppressed, sigmaOnly, setSigmaOnly }) {
  if (!open) return null;
  const catOptions = categories.length ? categories : ALL_CATEGORIES;
  return (
    <>
      <div style={s.panelOverlay} onClick={onClose} />
      <div style={s.panel}>
        <div style={s.panelHeader}>Filters<button style={s.modalClose} onClick={onClose}>✕</button></div>

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

        <div style={s.panelSection}>
          <div style={s.panelSectionTitle}>Severity</div>
          <div style={s.panelBtnRow}>
            <button style={sevFilters.size === 0 ? s.btnActive : s.btn} onClick={() => setSevFilters(new Set())}>All</button>
            {['critical', 'high', 'medium', 'low', 'info'].map(sev => (
              <button key={sev}
                style={{ background: sevFilters.has(sev) ? sevColor(sev) : 'none', border: `1px solid ${sevColor(sev)}`, color: sevFilters.has(sev) ? 'var(--bg-primary)' : sevColor(sev), fontFamily: 'var(--font)', fontSize: '11px', padding: '4px 12px', cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase' }}
                onClick={() => toggleSevFilter(sev)}
              >{sev}</button>
            ))}
          </div>
        </div>

        <div style={s.panelSection}>
          <div style={s.panelSectionTitle}>Category</div>
          <div style={s.panelBtnRow}>
            <button key="all" style={catFilter === null ? s.btnActive : s.btn} onClick={() => setCatFilter(null)}>All</button>
            {catOptions.map(cat => (
              <button key={cat} style={catFilter === cat ? s.btnActive : s.btn} onClick={() => setCatFilter(cat)}>{cat}</button>
            ))}
          </div>
        </div>

        {sourcesList.length > 0 && (
          <div style={s.panelSection}>
            <div style={s.panelSectionTitle}>Source</div>
            <div style={s.panelBtnRow}>
              <button style={srcFilter === null ? s.btnActive : s.btn} onClick={() => setSrcFilter(null)}>All</button>
              {sourcesList.map(src => (
                <button key={src} style={srcFilter === src ? s.btnActive : s.btn} onClick={() => setSrcFilter(src)}>{src}</button>
              ))}
            </div>
          </div>
        )}

        <div style={s.panelSection}>
          <div style={s.panelSectionTitle}>Sigma</div>
          <div style={s.panelBtnRow}>
            <button style={!sigmaOnly ? s.btnActive : s.btn} onClick={() => setSigmaOnly(false)}>All</button>
            <button
              title="Only events that triggered a Sigma-sourced alert"
              style={sigmaOnly ? { ...s.btnActive } : { ...s.btn, borderColor: 'var(--text-muted)' }}
              onClick={() => setSigmaOnly(true)}
            >Sigma only</button>
          </div>
        </div>

        <div style={s.panelSection}>
          <div style={s.panelSectionTitle}>Suppressed Events</div>
          <label style={s.checkRow}>
            <input type="checkbox" checked={showSuppressed} onChange={() => setShowSuppressed(v => !v)} style={{ accentColor: 'var(--text-muted)', cursor: 'pointer' }} />
            Show suppressed events
          </label>
        </div>

        <div style={s.panelSection}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={s.panelSectionTitle}>Columns</div>
            <button style={{ ...s.btn, fontSize: '10px', padding: '2px 8px' }} onClick={() => setVisibleCols(COL_NAMES.map(() => true))}>Reset</button>
          </div>
          {COL_NAMES.map((name, i) => (
            <label key={name} style={s.checkRow}>
              <input type="checkbox" checked={visibleCols[i]} onChange={() => setVisibleCols(prev => { const next = [...prev]; next[i] = !next[i]; return next; })} style={{ accentColor: 'var(--text-muted)', cursor: 'pointer' }} />
              {name}
            </label>
          ))}
        </div>
      </div>
    </>
  );
}

export function EventsExplorer() {
  const { getAccessTokenSilently } = useAuth0();
  const persisted = loadPersistedState();

  const [hours, setHoursRaw] = useState(persisted?.hours ?? 24);
  const [sevFilters, setSevFiltersRaw] = useState(() => new Set(persisted?.sevFilters ?? []));
  const [catFilter, setCatFilterRaw] = useState(persisted?.catFilter ?? null);
  const [srcFilter, setSrcFilterRaw] = useState(persisted?.srcFilter ?? null);
  const [visibleCols, setVisibleColsRaw] = useState(persisted?.visibleCols ?? COL_NAMES.map(() => true));
  const [showSuppressed, setShowSuppressed] = useState(false);
  const [sigmaOnly, setSigmaOnlyRaw] = useState(persisted?.sigmaOnly ?? false);
  const [pageSize, setPageSize] = useState(persisted?.pageSize ?? 20);
  const [page, setPage] = useState(1);
  const [panelOpen, setPanelOpen] = useState(false);

  function persist(overrides) {
    savePersistedState({ hours, sevFilters: [...sevFilters], catFilter, srcFilter, visibleCols, sigmaOnly, pageSize, ...overrides });
  }
  function setSigmaOnly(v) { setSigmaOnlyRaw(v); persist({ sigmaOnly: v }); }
  function changePageSize(v) { setPageSize(v); persist({ pageSize: v }); }
  function setHours(v) { setHoursRaw(v); persist({ hours: v }); }
  function setSevFilters(next) {
    setSevFiltersRaw(prev => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      persist({ sevFilters: [...resolved] });
      return resolved;
    });
  }
  function toggleSevFilter(sev) {
    setSevFilters(prev => { const n = new Set(prev); n.has(sev) ? n.delete(sev) : n.add(sev); return n; });
  }
  function setCatFilter(v) { setCatFilterRaw(v); persist({ catFilter: v }); }
  function setSrcFilter(v) { setSrcFilterRaw(v); persist({ srcFilter: v }); }
  function setVisibleCols(v) {
    setVisibleColsRaw(prev => { const next = typeof v === 'function' ? v(prev) : v; persist({ visibleCols: next }); return next; });
  }

  const [recent, setRecent] = useState([]);
  const [categories, setCategories] = useState([]);
  const [sourcesList, setSourcesList] = useState([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [cases, setCases] = useState([]);
  const [caseTitle, setCaseTitle] = useState('');
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [creatingCase, setCreatingCase] = useState(false);
  const [addingToCase, setAddingToCase] = useState(false);
  const loadingRef = useRef(false);

  const filteredRecent = sevFilters.size > 1 ? recent.filter(r => sevFilters.has(r.severity)) : recent;
  const totalPages = Math.max(1, Math.ceil(filteredRecent.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRecent = filteredRecent.slice((safePage - 1) * pageSize, safePage * pageSize);
  const { widths, onMouseDown } = useResizableColumns(COL_DEFAULTS_W);
  const visibleIdxs = COL_NAMES.map((_, i) => i).filter(i => visibleCols[i]);
  const activeFilterCount = [sevFilters.size > 0, catFilter, srcFilter, sigmaOnly].filter(Boolean).length + visibleCols.filter(v => !v).length;

  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(search), 300); return () => clearTimeout(t); }, [search]);
  // Any change to the visible set resets to page 1 so the paginator stays coherent.
  useEffect(() => { setPage(1); }, [sevFilters, catFilter, srcFilter, sigmaOnly, debouncedSearch, showSuppressed, pageSize, hours]);

  // Event Insights widget drill-downs (event_id/username/rule) broadcast here.
  useEffect(() => {
    const onSearch = (e) => setSearch(typeof e.detail === 'string' ? e.detail : '');
    window.addEventListener('siem-events-search', onSearch);
    return () => window.removeEventListener('siem-events-search', onSearch);
  }, []);

  const loadRecent = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const token = await getAccessTokenSilently();
      const headers = { Authorization: `Bearer ${token}` };
      const params = new URLSearchParams({ hours });
      if (sevFilters.size === 1) params.set('severity', [...sevFilters][0]);
      if (catFilter) params.set('category', catFilter);
      if (srcFilter) params.set('source', srcFilter);
      if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());
      if (showSuppressed) params.set('showSuppressed', '1');
      if (sigmaOnly) params.set('sigma', '1');
      const res = await fetch(`/api/siem/events/recent?${params}`, { headers });
      if (res.ok) { const data = await res.json(); setRecent(Array.isArray(data) ? data : []); }
    } catch { /* transient */ } finally { setLoading(false); loadingRef.current = false; }
  }, [hours, sevFilters, catFilter, srcFilter, debouncedSearch, showSuppressed, sigmaOnly, getAccessTokenSilently]);

  const loadFacets = useCallback(async () => {
    try {
      const token = await getAccessTokenSilently();
      const headers = { Authorization: `Bearer ${token}` };
      const h = `?hours=${hours}`;
      const [catRes, srcRes] = await Promise.all([
        fetch(`/api/siem/events/categories${h}`, { headers }),
        fetch(`/api/siem/events/sources-list${h}`, { headers }),
      ]);
      const [cats, srcs] = await Promise.all([
        catRes.ok ? catRes.json() : Promise.resolve([]),
        srcRes.ok ? srcRes.json() : Promise.resolve([]),
      ]);
      setCategories(Array.isArray(cats) ? cats.map(r => r.category) : []);
      setSourcesList(Array.isArray(srcs) ? srcs.map(r => r.source) : []);
    } catch {}
  }, [hours, getAccessTokenSilently]);

  useEffect(() => { loadRecent(); const id = setInterval(loadRecent, 15000); return () => clearInterval(id); }, [loadRecent]);
  useEffect(() => { loadFacets(); const id = setInterval(loadFacets, 300000); return () => clearInterval(id); }, [loadFacets]);

  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
    let debounce = null;
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'new_events' || msg.type === 'new_alerts') { clearTimeout(debounce); debounce = setTimeout(loadRecent, 500); }
      } catch {}
    };
    return () => { clearTimeout(debounce); if (ws.readyState !== WebSocket.CONNECTING) ws.close(); else ws.onopen = () => ws.close(); };
  }, [loadRecent]);

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
      const caseRes = await fetch('/api/siem/cases', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ title: caseTitle.trim(), severity: selectedEvent.severity }) });
      const newCase = await caseRes.json();
      if (selectedEvent.alert_id) {
        await fetch(`/api/siem/cases/${newCase.id}/alerts`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ alert_id: selectedEvent.alert_id }) });
      }
      setCaseTitle('');
      await loadCasesForEvent();
    } catch {} finally { setCreatingCase(false); }
  }
  async function addEventToCase() {
    if (!selectedCaseId || !selectedEvent?.alert_id) return;
    setAddingToCase(true);
    try {
      const token = await getAccessTokenSilently();
      await fetch(`/api/siem/cases/${selectedCaseId}/alerts`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ alert_id: selectedEvent.alert_id }) });
      setSelectedCaseId('');
    } catch {} finally { setAddingToCase(false); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={s.toolbar}>
        {sourcesList.length > 0 && (
          <select
            style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: srcFilter ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: 'var(--font)', fontSize: '11px', padding: '6px 8px', cursor: 'pointer', outline: 'none', flexShrink: 0 }}
            value={srcFilter || ''} onChange={e => setSrcFilter(e.target.value || null)}
          >
            <option value="">All Sources</option>
            {sourcesList.map(src => <option key={src} value={src}>{src}</option>)}
          </select>
        )}
        <input style={s.searchInput} type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="search message, event_id, username, host, ip… or field:value" spellCheck={false} />
        {search && <button style={s.searchClear} onClick={() => setSearch('')} title="Clear search">✕</button>}
        <button
          style={panelOpen ? s.btnActive : { ...s.btn, ...(activeFilterCount > 0 ? { borderColor: 'var(--text-primary)', color: 'var(--text-primary)' } : {}) }}
          onClick={() => setPanelOpen(v => !v)}
        >Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</button>
      </div>

      <FilterPanel
        open={panelOpen} onClose={() => setPanelOpen(false)}
        hours={hours} setHours={setHours}
        sevFilters={sevFilters} toggleSevFilter={toggleSevFilter} setSevFilters={setSevFilters}
        catFilter={catFilter} setCatFilter={setCatFilter}
        srcFilter={srcFilter} setSrcFilter={setSrcFilter}
        categories={categories} sourcesList={sourcesList}
        visibleCols={visibleCols} setVisibleCols={setVisibleCols}
        showSuppressed={showSuppressed} setShowSuppressed={setShowSuppressed}
        sigmaOnly={sigmaOnly} setSigmaOnly={setSigmaOnly}
      />

      <div style={s.sectionBar}>
        <span>Recent Events</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span>
            {filteredRecent.length} match
            {sevFilters.size > 0 ? `, ${[...sevFilters].join(',')}` : ''}
            {catFilter ? `, ${catFilter}` : ''}
            {srcFilter ? `, ${srcFilter}` : ''}
            {sigmaOnly ? ', sigma' : ''}
            {debouncedSearch.trim() ? `, "${debouncedSearch.trim()}"` : ''}
          </span>
          {(sevFilters.size > 0 || catFilter || srcFilter || sigmaOnly) && (
            <button
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontFamily: 'var(--font)', fontSize: '10px', cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase', padding: 0 }}
              onClick={() => { setSevFilters(new Set()); setCatFilter(null); setSrcFilter(null); setSigmaOnly(false); }}
            >Clear filters</button>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>Rows</span>
            <select
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontFamily: 'var(--font)', fontSize: '10px', padding: '2px 4px', cursor: 'pointer', outline: 'none' }}
              value={pageSize} onChange={e => changePageSize(parseInt(e.target.value, 10))}
            >
              {[20, 50, 100, 200].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', fontFamily: 'var(--font)', fontSize: '10px', padding: '2px 8px', cursor: safePage <= 1 ? 'default' : 'pointer', opacity: safePage <= 1 ? 0.4 : 1 }} disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>Prev</button>
            <span>{safePage}/{totalPages}</span>
            <button style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', fontFamily: 'var(--font)', fontSize: '10px', padding: '2px 8px', cursor: safePage >= totalPages ? 'default' : 'pointer', opacity: safePage >= totalPages ? 0.4 : 1 }} disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>Next</button>
          </span>
        </span>
      </div>

      <div className="kudo-scroll" style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
        <table style={{ ...s.table, width: '100%', minWidth: `${visibleIdxs.reduce((sum, i) => sum + widths[i], 0)}px` }}>
          <colgroup>{visibleIdxs.map(i => <col key={i} style={{ width: `${widths[i]}px` }} />)}</colgroup>
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
            {pagedRecent.map(row => (
              <tr key={row.id} style={{ cursor: 'pointer' }}
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
                        <span style={{ ...s.sevBadge(sevColor(row.severity)), cursor: 'pointer' }}
                          onClick={e => { e.stopPropagation(); if (row.severity) toggleSevFilter(row.severity); }}
                        >{row.severity || '-'}</span>
                      </td>
                    );
                  }
                  if (field === 'timestamp') {
                    return <td key={i} style={s.td}>{row.timestamp ? new Date(row.timestamp).toLocaleTimeString() : '-'}</td>;
                  }
                  return <td key={i} style={s.td}>{row[field] || '-'}</td>;
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
                Event {selectedEvent.event_id || '-'} &nbsp;&nbsp;&nbsp; {selectedEvent.host || '-'} &nbsp;&nbsp;&nbsp;
                <span style={{ color: sevColor(selectedEvent.severity) }}>{selectedEvent.severity || '-'}</span>
              </span>
              <button style={s.modalClose} onClick={() => { setSelectedEvent(null); setCaseTitle(''); setCases([]); }}>✕</button>
            </div>
            <div style={s.modalBody}>
              {[
                ['Time', <TimeFieldValue times={selectedEvent.occurrence_times} count={selectedEvent.count} fallback={selectedEvent.timestamp ? new Date(selectedEvent.timestamp).toLocaleString() : null} />],
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
                ['HTTP Method', selectedEvent.http_method],
                ['URL', selectedEvent.http_url],
                ['HTTP Status', selectedEvent.http_status],
                ['User-Agent', selectedEvent.http_ua],
                ['Referer', selectedEvent.http_referer],
                ['File Path', selectedEvent.file_path],
                ['Expected Hash', selectedEvent.fim_hash_expected],
                ['Actual Hash', selectedEvent.fim_hash_actual],
                ['WordPress Site', selectedEvent.wp_site],
                ['WP Version', selectedEvent.wp_version],
                ['Registry Key', selectedEvent.registry_key],
                ['Source', selectedEvent.source],
                ['Message', selectedEvent.message],
              ].filter(([, v]) => v != null && v !== '').map(([label, value]) => (
                <div key={label} style={s.fieldRow}>
                  <div style={s.fieldLabel}>{label}</div>
                  <div style={s.fieldValue}>{typeof value === 'object' ? value : String(value)}</div>
                </div>
              ))}
              <ProcessTreePanel event={selectedEvent} />
              <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Create Case from Alert</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '12px', padding: '6px 10px', outline: 'none', flex: 1 }}
                    placeholder="Case title..." value={caseTitle}
                    onChange={e => setCaseTitle(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && createCaseFromEvent()}
                  />
                  <button style={s.btn} onClick={createCaseFromEvent} disabled={creatingCase || !caseTitle.trim()}>{creatingCase ? '...' : 'Create Case'}</button>
                </div>
              </div>
              {cases.length > 0 && (
                <div style={{ marginTop: '10px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Add to Existing Case</div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select
                      style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '12px', padding: '6px 10px', outline: 'none', flex: 1 }}
                      value={selectedCaseId} onChange={e => setSelectedCaseId(e.target.value)}
                    >
                      <option value="">Select a case...</option>
                      {cases.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </select>
                    <button style={s.btn} onClick={addEventToCase} disabled={addingToCase || !selectedCaseId}>{addingToCase ? '...' : 'Add'}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)}
          items={[
            { label: 'View Event Detail', onClick: () => { setSelectedEvent(contextMenu.row); loadCasesForEvent(); } },
            ...(contextMenu.row.process_name ? [{ label: `Process Tree: ${contextMenu.row.process_name}`, onClick: () => { setSelectedEvent(contextMenu.row); loadCasesForEvent(); } }] : []),
            ...(contextMenu.row.process_name ? [{
              label: `CVE Lookup: ${contextMenu.row.process_name}`,
              onClick: () => { localStorage.setItem('workspace-restore-cve-exploit-mapper', JSON.stringify({ query: contextMenu.row.process_name })); window.location.href = '/cve-exploit-mapper'; },
            }] : []),
          ]}
        />
      )}
    </div>
  );
}
