import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useIsMobile } from '../hooks/useIsMobile.js';
import { badgeStyle } from './ui/index.js';
import { AttackCoverage } from './AttackCoverage.jsx';

// Sigma Rule Library (Phase 5). Enable SigmaHQ community categories, browse the
// converted catalog, and tune individual rules, all against the global catalog
// kept current by the scheduled sync. Follows ui-component-standards.md; mobile
// via isMobile only. No new visual patterns.

const CATEGORY_LABEL = {
  generic: 'Generic detection',
  threat_hunting: 'Threat hunting',
  emerging_threats: 'Emerging threats',
  compliance: 'Compliance',
  placeholder: 'Placeholder',
};
const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'];
const SIGMA_REPO = 'https://github.com/SigmaHQ/sigma';

const SEV_COLOR = {
  critical: 'var(--severity-critical)', high: 'var(--severity-high)', medium: 'var(--severity-medium)',
  low: 'var(--severity-low)', info: 'var(--severity-info)',
};

// Canonical severity filter pill — matches the SIEM dashboard FilterPanel:
// colored border always, filled with the color when active.
const sevPillStyle = (color, active) => ({
  background: active ? color : 'none',
  border: `1px solid ${color}`,
  color: active ? 'var(--bg-primary)' : color,
  fontFamily: 'var(--font)', fontSize: '11px', padding: '4px 12px',
  cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase',
});
const sevColor = (s0) => SEV_COLOR[s0] || 'var(--text-muted)';

// SigmaHQ titles/descriptions occasionally carry em/en dashes; strip them from
// displayed copy (em dash reads as a comma, en dash as a hyphen) without
// modifying the underlying rule.
const cleanCopy = (str) => typeof str === 'string'
  ? str.replace(/\s*—\s*/g, ', ').replace(/\s*–\s*/g, '-').replace(/\s{2,}/g, ' ').trim()
  : str;

// How each condition operator reads in plain English inside the detection tree.
const OP_LABEL = {
  eq: 'equals', ne: 'does not equal', contains: 'contains',
  startswith: 'starts with', endswith: 'ends with',
  contains_cs: 'contains (case-sensitive)', startswith_cs: 'starts with (case-sensitive)',
  endswith_cs: 'ends with (case-sensitive)', re: 'matches regex', cidr: 'is in CIDR range',
  exists: 'exists', gt: '>', gte: '≥', lt: '<', lte: '≤', in: 'is one of', fieldref: 'equals field',
};

// Collect every distinct log field a condition tree reads, so the modal can show
// which columns of an incoming event actually decide a match.
function collectFields(node, out = new Set()) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node.all)) node.all.forEach(c => collectFields(c, out));
  else if (Array.isArray(node.any)) node.any.forEach(c => collectFields(c, out));
  else if (node.not) collectFields(node.not, out);
  else if (Array.isArray(node.keyword)) out.add('message or raw');
  else if (node.field) out.add(node.field);
  else if (node.raw) out.add(`raw:${node.raw}`);
  else Object.keys(node).forEach(k => out.add(k)); // flat selection object
  return out;
}

// A window of at least 5 page numbers centered on the current page, clamped to
// [1, totalPages]. First/last jumps are rendered separately when out of window.
function pageWindow(current, totalPages, span = 5) {
  if (totalPages <= span) return Array.from({ length: totalPages }, (_, i) => i + 1);
  let start = Math.max(1, current - Math.floor(span / 2));
  const end = Math.min(totalPages, start + span - 1);
  start = Math.max(1, end - span + 1);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

const s = {
  container: { padding: 0, flex: 1, minHeight: 0, overflow: 'auto' },
  header: {
    padding: '0 20px', height: '45px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: '12px',
  },
  title: { fontSize: '13px', color: 'var(--text-primary)', letterSpacing: '0.02em', fontFamily: 'var(--font-display)' },
  sub: { color: 'var(--text-muted)', fontSize: '11px' },
  actions: { marginLeft: 'auto', display: 'flex', gap: '8px' },
  btn: {
    background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)',
    fontFamily: 'var(--font)', fontSize: '11px', padding: '4px 12px', cursor: 'pointer', letterSpacing: '0.04em',
  },
  btnPrimary: {
    background: 'var(--btn-primary-bg)', border: '1px solid var(--border)', color: 'var(--btn-primary-text)',
    fontFamily: 'var(--font)', fontSize: '11px', padding: '4px 12px', cursor: 'pointer', letterSpacing: '0.04em',
  },
  section: { padding: '16px 20px', borderBottom: '1px solid var(--border)' },
  sectionTitle: {
    fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase',
    color: 'var(--text-muted)', marginBottom: '12px',
  },
  banner: {
    padding: '8px 12px', marginBottom: '12px', fontSize: '11px',
    border: '1px solid var(--accent-amber)', color: 'var(--text-primary)', background: 'var(--bg-surface)',
  },
  catGrid: { display: 'flex', flexWrap: 'wrap', gap: '10px' },
  catCard: (on) => ({
    display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', cursor: 'pointer',
    border: `1px solid ${on ? 'var(--accent-amber)' : 'var(--border)'}`,
    background: on ? 'var(--bg-surface)' : 'transparent', fontSize: '12px', color: 'var(--text-primary)',
  }),
  meta: { fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px', lineHeight: 1.6 },
  attribution: { fontSize: '10px', color: 'var(--text-muted)', marginTop: '10px' },
  link: { color: 'var(--accent-amber)', textDecoration: 'none' },
  mitreLink: { color: 'var(--accent-amber)', textDecoration: 'none', borderBottom: '1px dotted var(--accent-amber)', fontSize: '12px' },
  filterBar: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' },
  // Match the app's shared input/select styling (DetectionRules): bg-surface + text-primary.
  input: {
    background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)',
    fontFamily: 'var(--font)', fontSize: '12px', padding: '5px 8px', outline: 'none', minWidth: '140px', boxSizing: 'border-box',
  },
  select: {
    background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)',
    fontFamily: 'var(--font)', fontSize: '12px', padding: '5px 8px', outline: 'none', cursor: 'pointer',
  },
  checkbox: { width: '14px', height: '14px', cursor: 'pointer', accentColor: 'var(--text-muted)' },
  pageBtn: (active) => ({
    fontFamily: 'var(--font)', fontSize: '11px', padding: '4px 10px', cursor: 'pointer', letterSpacing: '0.04em',
    border: `1px solid ${active ? 'var(--accent-amber)' : 'var(--border)'}`,
    color: active ? 'var(--accent-amber)' : 'var(--text-muted)', background: 'none', minWidth: '30px',
  }),
  tableWrap: { overflowX: 'auto', maxWidth: '100%' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: '760px', fontFamily: 'var(--font-mono)' },
  th: {
    textAlign: 'left', padding: '8px 14px', fontSize: '10px', letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)',
    fontWeight: 'normal', background: 'var(--bg-surface)', whiteSpace: 'nowrap',
  },
  td: { padding: '10px 14px', fontSize: '12px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)', verticalAlign: 'middle' },
  muted: { padding: '30px 20px', color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center' },
  toggle: (on) => ({
    fontFamily: 'var(--font)', fontSize: '10px', letterSpacing: '0.04em', padding: '2px 8px', cursor: 'pointer',
    border: `1px solid ${on ? 'var(--accent-amber)' : 'var(--border)'}`,
    color: on ? 'var(--accent-amber)' : 'var(--text-muted)', background: 'none',
  }),
  toast: {
    position: 'fixed', bottom: '24px', right: '24px', zIndex: 2000, background: 'var(--bg-surface)',
    border: '1px solid var(--border)', padding: '10px 16px', fontSize: '12px', color: 'var(--text-primary)',
  },
  // Detail modal — mirrors the SIEM event info card (SiemDashboard) exactly.
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: 'var(--bg-primary)', border: '1px solid var(--border)', width: '720px', maxWidth: '95vw', height: '82vh', display: 'flex', flexDirection: 'column' },
  modalHeader: { padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' },
  modalTitle: { fontSize: '12px', color: 'var(--text-primary)', letterSpacing: '0.04em' },
  modalClose: { background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '16px', cursor: 'pointer', fontFamily: 'var(--font)', lineHeight: 1 },
  modalBody: { padding: '16px', overflow: 'auto', flex: 1 },
  fieldRow: { display: 'grid', gridTemplateColumns: '150px 1fr', borderBottom: '1px solid var(--border-subtle)', padding: '6px 0', gap: '12px' },
  fieldLabel: { fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingTop: '2px' },
  fieldValue: { fontSize: '12px', color: 'var(--text-primary)', wordBreak: 'break-word', whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)' },
  block: { marginTop: '16px', border: '1px solid var(--border)', background: 'var(--bg-primary)' },
  blockHead: { fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' },
  blockBody: { padding: '12px' },
  english: { fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.55, marginBottom: '12px' },
  treeGroup: { fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--accent-amber)', margin: '2px 0' },
  treeIndent: { marginLeft: '14px', borderLeft: '1px solid var(--border-subtle)', paddingLeft: '10px' },
  leaf: { fontSize: '12px', color: 'var(--text-primary)', padding: '2px 0', lineHeight: 1.5 },
  code: { color: 'var(--accent-amber)' },
  val: { color: 'var(--text-primary)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', padding: '0 4px' },
};

// Render a converted condition tree as an indented, human-readable outline.
// Groups (ALL/ANY/NOT) nest; leaves read as "field  operator  value".
function WhereTree({ node, depth = 0, k = 'r' }) {
  if (!node || typeof node !== 'object') return null;
  const group = (label, children) => (
    <div key={k}>
      <div style={s.treeGroup}>{label}</div>
      <div style={s.treeIndent}>{children}</div>
    </div>
  );
  if (Array.isArray(node.all)) return group('ALL of', node.all.map((c, i) => <WhereTree key={i} node={c} depth={depth + 1} k={`${k}.a${i}`} />));
  if (Array.isArray(node.any)) return group('ANY of', node.any.map((c, i) => <WhereTree key={i} node={c} depth={depth + 1} k={`${k}.o${i}`} />));
  if (node.not) return group('NOT', <WhereTree node={node.not} depth={depth + 1} k={`${k}.n`} />);
  if (Array.isArray(node.keyword)) {
    return (
      <div style={s.leaf}>
        <span style={s.code}>message or raw</span> contains any of{' '}
        {node.keyword.map((v, i) => <span key={i}><span style={s.val}>{String(v)}</span>{i < node.keyword.length - 1 ? ', ' : ''}</span>)}
      </div>
    );
  }
  const leaf = (field, op, value, isRaw) => {
    const opTxt = OP_LABEL[op] || op;
    const vals = Array.isArray(value) ? value : (value === undefined ? [] : [value]);
    return (
      <div style={s.leaf} key={`${k}-${field}`}>
        <span style={s.code}>{field}</span>{isRaw && <span style={s.sub}> (raw field)</span>} {opTxt}
        {vals.length > 0 && ' '}
        {vals.map((v, i) => <span key={i}><span style={s.val}>{String(v)}</span>{i < vals.length - 1 ? ', ' : ''}</span>)}
      </div>
    );
  };
  if (node.field) return leaf(node.field, node.op || 'eq', node.value, false);
  if (node.raw) return leaf(node.raw, node.op || 'eq', node.value, true);
  // Flat legacy selection object: { field: value, ... } → each pair is an equals leaf.
  return <>{Object.entries(node).map(([f, v]) => leaf(f, Array.isArray(v) ? 'in' : 'eq', v))}</>;
}

export function RuleLibrary({ embedded = false }) {
  const { getAccessTokenSilently } = useAuth0();
  const isMobile = useIsMobile();

  const [status, setStatus] = useState(null);   // { last_sync, catalog, ref, running }
  const [settings, setSettings] = useState({ sigma_enabled_categories: [], sigma_auto_update: true, categories: [] });
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ category: '', status: '', fidelity: '', technique: '', q: '', severity: [] });
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [detail, setDetail] = useState(null);       // full rule doc for the modal
  const [detailLoading, setDetailLoading] = useState(false);
  const pollRef = useRef(null);

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 3000); };
  const authHeaders = useCallback(async () => ({ Authorization: `Bearer ${await getAccessTokenSilently()}` }), [getAccessTokenSilently]);

  const loadStatus = useCallback(async () => {
    const h = await authHeaders();
    const res = await fetch('/api/siem/rules/sigma/status', { headers: h });
    if (res.ok) setStatus(await res.json());
  }, [authHeaders]);

  const loadSettings = useCallback(async () => {
    const h = await authHeaders();
    const res = await fetch('/api/siem/rules/sigma/settings', { headers: h });
    if (res.ok) setSettings(await res.json());
  }, [authHeaders]);

  const loadCatalog = useCallback(async (pg = 1) => {
    setLoading(true);
    try {
      const h = await authHeaders();
      const p = new URLSearchParams({ page: String(pg), limit: '50' });
      if (filters.category) p.set('category', filters.category);
      if (filters.status) p.set('status', filters.status);
      if (filters.fidelity) p.set('fidelity', filters.fidelity);
      if (filters.technique) p.set('technique', filters.technique);
      if (filters.severity?.length) p.set('severity', filters.severity.join(','));
      if (filters.q) p.set('q', filters.q);
      const res = await fetch(`/api/siem/rules/sigma/catalog?${p}`, { headers: h });
      const data = await res.json();
      setRows(Array.isArray(data.rules) ? data.rules : []);
      setHasMore(!!data.has_more);
      setTotalPages(data.total_pages || 1);
      setTotal(data.total || 0);
      setPage(pg);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, filters]);

  useEffect(() => { loadStatus(); loadSettings(); }, [loadStatus, loadSettings]);
  useEffect(() => { loadCatalog(1); }, [loadCatalog]);

  // Poll status while a sync is running, then refresh the catalog once it settles.
  useEffect(() => {
    if (status?.running && !pollRef.current) {
      pollRef.current = setInterval(loadStatus, 4000);
    } else if (!status?.running && pollRef.current) {
      clearInterval(pollRef.current); pollRef.current = null;
      loadCatalog(page);
    }
    return () => { if (pollRef.current && !status?.running) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [status?.running, loadStatus, loadCatalog, page]);

  async function saveSettings(next) {
    const h = { ...(await authHeaders()), 'Content-Type': 'application/json' };
    const res = await fetch('/api/siem/rules/sigma/settings', {
      method: 'PUT', headers: h,
      body: JSON.stringify({
        sigma_enabled_categories: next.sigma_enabled_categories,
        sigma_auto_update: next.sigma_auto_update,
      }),
    });
    if (res.ok) { setSettings(s0 => ({ ...s0, ...next })); loadCatalog(page); }
    else showToast('Could not save settings');
  }

  function toggleCategory(cat) {
    const set = new Set(settings.sigma_enabled_categories);
    set.has(cat) ? set.delete(cat) : set.add(cat);
    saveSettings({ ...settings, sigma_enabled_categories: [...set] });
  }

  async function syncNow() {
    const h = await authHeaders();
    const res = await fetch('/api/siem/rules/sigma/sync', { method: 'POST', headers: h });
    if (res.status === 202) { showToast('Sync started'); setStatus(st => ({ ...st, running: true })); loadStatus(); }
    else if (res.status === 409) showToast('A sync is already running');
    else showToast('Could not start sync');
  }

  async function setOverride(row, body) {
    const h = { ...(await authHeaders()), 'Content-Type': 'application/json' };
    const res = await fetch(`/api/siem/rules/sigma/overrides/${encodeURIComponent(row.identity)}`, {
      method: 'PUT', headers: h, body: JSON.stringify(body),
    });
    if (res.ok) loadCatalog(page); else showToast('Could not update rule');
  }

  async function clearOverride(row) {
    const h = await authHeaders();
    const res = await fetch(`/api/siem/rules/sigma/overrides/${encodeURIComponent(row.identity)}`, { method: 'DELETE', headers: h });
    if (res.ok) loadCatalog(page); else showToast('Could not reset rule');
  }

  async function openDetail(identity) {
    setDetail({ identity, loading: true });
    setDetailLoading(true);
    try {
      const h = await authHeaders();
      const res = await fetch(`/api/siem/rules/sigma/catalog/${encodeURIComponent(identity)}`, { headers: h });
      if (res.ok) setDetail(await res.json());
      else { setDetail(null); showToast('Could not load rule detail'); }
    } catch {
      setDetail(null); showToast('Could not load rule detail');
    } finally {
      setDetailLoading(false);
    }
  }

  const last = status?.last_sync;
  const catalogCounts = status?.catalog || [];
  const totalConverted = catalogCounts.reduce((n, c) => n + Number(c.converted || 0), 0);
  const categories = settings.categories?.length ? settings.categories : Object.keys(CATEGORY_LABEL);

  const syncBtn = (
    <button style={s.btnPrimary} onClick={syncNow} disabled={status?.running}>
      {status?.running ? 'Syncing…' : 'Sync now'}
    </button>
  );

  return (
    <div style={s.container}>
      {!embedded && (
        <div style={s.header}>
          <span style={s.title}>SIEM &nbsp;<span style={s.sub}>/ Rule Library</span></span>
          <div style={s.actions}>{syncBtn}</div>
        </div>
      )}

      {/* 1. Sync and sources */}
      <div style={s.section}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <span style={s.sectionTitle} >Sources</span>
          <div style={{ marginLeft: 'auto' }}>{syncBtn}</div>
        </div>
        {status?.running && <div style={s.banner}>Syncing the SigmaHQ catalog… this takes about a minute. Counts update when it finishes.</div>}

        <div style={s.catGrid}>
          {categories.map(cat => {
            const on = settings.sigma_enabled_categories.includes(cat);
            const c = catalogCounts.find(x => x.category === cat);
            return (
              <label key={cat} style={s.catCard(on)}>
                <input type="checkbox" checked={on} onChange={() => toggleCategory(cat)} style={s.checkbox} />
                <span>{CATEGORY_LABEL[cat] || cat}</span>
                {c && <span style={s.sub}>({c.converted} rules)</span>}
              </label>
            );
          })}
        </div>

        <div style={s.meta}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!settings.sigma_auto_update}
              onChange={e => saveSettings({ ...settings, sigma_auto_update: e.target.checked })}
              style={s.checkbox} />
            Auto-update daily
          </label>
          {last?.finished_at ? (
            <>
              <div>Last synced {new Date(last.finished_at).toLocaleString()}</div>
              <div>{totalConverted} rules live at ref <code>{status?.ref}</code>{last.source_sha ? ` (commit ${String(last.source_sha).slice(0, 7)})` : ''}</div>
            </>
          ) : (
            <div>Not synced yet. Enable a category and click "Sync now".</div>
          )}
          {settings.sigma_enabled_categories.length > 1 && (
            <div style={{ color: 'var(--severity-medium)' }}>
              Multiple categories enabled. Expect higher alert volume; tune noisy rules below or in the Tuning Center.
            </div>
          )}
        </div>

        <div style={s.attribution}>
          Detection content from the <a href={SIGMA_REPO} target="_blank" rel="noreferrer" style={s.link}>SigmaHQ</a> community
          project, licensed under the Detection Rule License 1.1. See{' '}
          <a href="/security" target="_blank" rel="noreferrer" style={s.link}>Security Practices</a>.
        </div>
      </div>

      {/* 2. Catalog browser */}
      <div style={s.section} id="rule-catalog">
        <div style={s.sectionTitle}>Catalog</div>
        <div style={s.filterBar}>
          <input style={s.input} placeholder="Search title…" value={filters.q}
            onChange={e => setFilters(f => ({ ...f, q: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') loadCatalog(1); }} />
          <select style={s.select} value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}>
            <option value="">All categories</option>
            {categories.map(c => <option key={c} value={c}>{CATEGORY_LABEL[c] || c}</option>)}
          </select>
          <select style={s.select} value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
            <option value="">All</option>
            <option value="converted">Supported</option>
            <option value="rejected">Unsupported</option>
          </select>
          <select style={s.select} value={filters.fidelity} onChange={e => setFilters(f => ({ ...f, fidelity: e.target.value }))}>
            <option value="">Any fidelity</option>
            <option value="exact">Exact</option>
            <option value="approximate">Approximate</option>
          </select>
          <input style={{ ...s.input, minWidth: '90px' }} placeholder="Txxxx" value={filters.technique}
            onChange={e => setFilters(f => ({ ...f, technique: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') loadCatalog(1); }} />
          <span style={{ width: '1px', alignSelf: 'stretch', background: 'var(--border)', margin: '0 2px' }} />
          {Object.keys(SEV_COLOR).map(sev => (
            <button
              key={sev}
              style={sevPillStyle(SEV_COLOR[sev], filters.severity.includes(sev))}
              onClick={() => setFilters(f => ({
                ...f,
                severity: f.severity.includes(sev) ? f.severity.filter(x => x !== sev) : [...f.severity, sev],
              }))}
            >{sev}</button>
          ))}
          <button style={s.btn} onClick={() => loadCatalog(1)}>Apply</button>
        </div>

        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Title</th>
                <th style={s.th}>Category</th>
                <th style={s.th}>Severity</th>
                <th style={s.th}>ATT&CK</th>
                <th style={s.th}>Enabled</th>
              </tr>
            </thead>
            <tbody>
              {!loading && !rows.length && (
                <tr><td colSpan={5} style={s.muted}>No catalog rules. Enable a category and sync, or adjust filters.</td></tr>
              )}
              {rows.map(r => {
                const rejected = r.convert_status === 'rejected';
                const effSev = r.override_severity || r.severity;
                return (
                  <tr key={r.identity}
                    style={{ cursor: 'pointer' }}
                    onClick={() => openDetail(r.identity)}
                    onMouseEnter={e => Array.from(e.currentTarget.cells).forEach(c => c.style.background = 'var(--bg-surface)')}
                    onMouseLeave={e => Array.from(e.currentTarget.cells).forEach(c => c.style.background = '')}>
                    <td style={{ ...s.td, color: 'var(--text-primary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span>{cleanCopy(r.title) || r.identity}</span>
                        {!rejected && r.fidelity === 'approximate' && (
                          <span style={{ ...badgeStyle('var(--severity-medium)'), fontSize: '9px' }} title="Converted with a raw-field accessor, a lossy mapping, or a best-effort decode; may over- or under-match.">approx</span>
                        )}
                      </div>
                      {rejected && r.reject_reason && (
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px' }}>Unsupported: {r.reject_reason}</div>
                      )}
                    </td>
                    <td style={s.td}>{CATEGORY_LABEL[r.category] || r.category}</td>
                    <td style={s.td}>
                      {rejected ? '-' : (
                        <select style={s.select}
                          value={effSev || 'medium'}
                          onClick={e => e.stopPropagation()}
                          onChange={e => setOverride(r, { severity: e.target.value })}>
                          {SEVERITIES.map(sv => <option key={sv} value={sv}>{sv}</option>)}
                        </select>
                      )}
                    </td>
                    <td style={s.td}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                        {(r.attack_techniques || []).map(id => (
                          <a key={id} href={`https://attack.mitre.org/techniques/${id.replace('.', '/')}/`} target="_blank" rel="noreferrer"
                             onClick={e => e.stopPropagation()} style={{ ...s.mitreLink, fontSize: '10px' }}>{id}</a>
                        ))}
                      </div>
                    </td>
                    <td style={s.td}>
                      {rejected ? <span style={s.sub}>Unsupported</span> : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button style={s.toggle(r.effective_enabled)}
                            onClick={e => { e.stopPropagation(); setOverride(r, { enabled: !r.effective_enabled }); }}>
                            {r.effective_enabled ? 'On' : 'Off'}
                          </button>
                          {(r.override_enabled !== null || r.override_severity) && (
                            <button style={s.btn} title="Reset to category default" onClick={e => { e.stopPropagation(); clearOverride(r); }}>reset</button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap', marginTop: '12px' }}>
            <button style={s.btn} disabled={page <= 1} onClick={() => loadCatalog(page - 1)}>Prev</button>
            {(() => {
              const win = pageWindow(page, totalPages);
              const nodes = [];
              if (win[0] > 1) {
                nodes.push(<button key="first" style={s.pageBtn(false)} onClick={() => loadCatalog(1)}>1</button>);
                if (win[0] > 2) nodes.push(<span key="e1" style={s.sub}>…</span>);
              }
              for (const n of win) nodes.push(
                <button key={n} style={s.pageBtn(n === page)} onClick={() => loadCatalog(n)}>{n}</button>
              );
              if (win[win.length - 1] < totalPages) {
                if (win[win.length - 1] < totalPages - 1) nodes.push(<span key="e2" style={s.sub}>…</span>);
                nodes.push(<button key="last" style={s.pageBtn(false)} onClick={() => loadCatalog(totalPages)}>{totalPages}</button>);
              }
              return nodes;
            })()}
            <button style={s.btn} disabled={!hasMore} onClick={() => loadCatalog(page + 1)}>Next</button>
            <span style={{ ...s.sub, marginLeft: '8px' }}>{total} rules</span>
          </div>
        )}
      </div>

      <div style={s.section} id="attack-coverage">
        <div style={s.sectionTitle}>ATT&amp;CK Coverage</div>
        <AttackCoverage onSelectTechnique={(id) => {
          setFilters(f => ({ ...f, technique: id }));
          document.getElementById('rule-catalog')?.scrollIntoView({ behavior: 'smooth' });
        }} />
      </div>

      {detail && (
        <div style={s.overlay} onClick={() => setDetail(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <span style={s.modalTitle}>
                {cleanCopy(detail.title) || detail.identity}
                {detail.category && <span style={{ ...s.sub, marginLeft: '14px' }}>{CATEGORY_LABEL[detail.category] || detail.category}</span>}
                {detail.rule && <span style={{ color: sevColor(detail.override_severity || detail.severity), marginLeft: '14px' }}>{detail.override_severity || detail.severity}</span>}
              </span>
              <button style={s.modalClose} onClick={() => setDetail(null)}>✕</button>
            </div>
            <div style={s.modalBody}>
              {detail.loading || detailLoading ? (
                <div style={s.muted}>Loading…</div>
              ) : (() => {
                const doc = detail.rule || {};
                const tree = doc.where ?? doc.selection;
                const fields = tree ? [...collectFields(tree)] : [];
                const rejected = detail.convert_status === 'rejected';
                const pf = [
                  detail.sig_event_ids?.length ? `event IDs ${detail.sig_event_ids.join(', ')}` : null,
                  detail.sig_categories?.length ? `categories ${detail.sig_categories.join(', ')}` : null,
                  detail.sig_sources?.length ? `sources ${detail.sig_sources.join(', ')}` : null,
                ].filter(Boolean);
                const summary = rejected
                  ? `This rule could not be converted to the engine's format, so it never runs. Reason: ${detail.reject_reason || 'unsupported construct'}.`
                  : doc.type === 'threshold'
                    ? `Fires when at least ${doc.count} events matching the condition below share the same ${(doc.group_by || []).join(', ')} within ${doc.window}. Counted with sliding-window state as events arrive.`
                    : 'Fires an alert the moment a single incoming log event matches the condition tree below. Every new event is checked at ingest against this rule; repeat matches on the same event are deduplicated into one alert.';
                return (
                  <>
                    {[
                      ['Description', cleanCopy(doc.description)],
                      ['Detection type', rejected ? 'unsupported' : (doc.type || 'single_event')],
                      ['Fidelity', detail.fidelity],
                      ['Enabled for you', detail.effective_enabled ? 'Yes' : 'No'],
                      ['Sigma source', detail.path],
                    ].filter(([, v]) => v != null && v !== '').map(([label, value]) => (
                      <div key={label} style={s.fieldRow}>
                        <div style={s.fieldLabel}>{label}</div>
                        <div style={s.fieldValue}>{String(value)}</div>
                      </div>
                    ))}
                    {(detail.attack_techniques || []).length > 0 && (
                      <div style={s.fieldRow}>
                        <div style={s.fieldLabel}>ATT&CK</div>
                        <div style={{ ...s.fieldValue, display: 'flex', flexWrap: 'wrap', gap: '14px' }}>
                          {detail.attack_techniques.map(id => (
                            <a key={id} href={`https://attack.mitre.org/techniques/${id.replace('.', '/')}/`} target="_blank" rel="noreferrer"
                               style={s.mitreLink}>{id}</a>
                          ))}
                        </div>
                      </div>
                    )}

                    <div style={s.block}>
                      <div style={s.blockHead}>How it's detected</div>
                      <div style={s.blockBody}>
                        <div style={s.english}>{summary}</div>
                        {!rejected && tree && <WhereTree node={tree} />}
                      </div>
                    </div>

                    {!rejected && (
                      <div style={s.block}>
                        <div style={s.blockHead}>How the SIEM triggers it</div>
                        <div style={s.blockBody}>
                          <div style={s.english}>
                            {fields.length > 0 && <>Log fields evaluated: {fields.map((f, i) => <span key={f}><span style={s.code}>{f}</span>{i < fields.length - 1 ? ', ' : ''}</span>)}.<br /></>}
                            {pf.length > 0
                              ? <>For speed, this rule is only evaluated when the incoming batch contains {pf.join('; ')}. Batches without any of those are skipped.</>
                              : <>No coarse prefilter, so this rule is evaluated against every ingested batch.</>}
                            <br />
                            {detail.effective_enabled
                              ? 'It is currently enabled for your account, so a matching event will raise a Sigma-badged alert in the Alerts queue.'
                              : 'It is currently disabled for you. Enable its category or toggle it On below to have matching events raise alerts.'}
                          </div>
                        </div>
                      </div>
                    )}

                    <div style={s.attribution}>
                      From <a href={`${SIGMA_REPO}/blob/master/${detail.path || ''}`} target="_blank" rel="noreferrer" style={s.link}>SigmaHQ</a>
                      {detail.sigma_id ? `, rule id ${detail.sigma_id}` : ''}, licensed under DRL 1.1
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {toast && <div style={s.toast}>{toast}</div>}
    </div>
  );
}
