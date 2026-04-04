import { useState, useEffect, useRef } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { ProcessTreePanel, ContextMenu } from './ProcessTreePanel.jsx';
import { useIsMobile } from '../hooks/useIsMobile.js';

const SEV_COLOR = {
  critical: 'var(--severity-critical)',
  high: 'var(--severity-high)',
  medium: 'var(--severity-medium)',
  low: 'var(--severity-low)',
  info: 'var(--severity-info)',
};

const HOURS_OPTIONS = [1, 6, 24, 48, 168];
const FIELD_HINTS = ['username:', 'host:', 'src:', 'dst:', 'process:', 'event_id:', 'event:', 'msg:'];

const s = {
  container: { padding: 0, display: 'flex', flexDirection: 'column', height: '100%' },
  header: {
    padding: '12px 20px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0,
  },
  title: { fontSize: '13px', color: 'var(--text-primary)', letterSpacing: '0.04em' },
  sub: { color: 'var(--text-muted)', fontSize: '11px' },
  searchRow: {
    padding: '12px 20px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)', display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0,
  },
  searchInput: {
    flex: 1, background: 'var(--bg-primary)', border: '1px solid var(--border)',
    color: 'var(--text-primary)', fontFamily: 'var(--font)', fontSize: '13px',
    padding: '8px 12px', outline: 'none', letterSpacing: '0.02em',
  },
  btn: {
    background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)',
    fontFamily: 'var(--font)', fontSize: '11px', padding: '4px 12px', cursor: 'pointer',
    letterSpacing: '0.04em', whiteSpace: 'nowrap',
  },
  btnActive: {
    background: 'var(--btn-primary-bg)', border: '1px solid var(--border)', color: 'var(--btn-primary-text)',
    fontFamily: 'var(--font)', fontSize: '11px', padding: '4px 12px', cursor: 'pointer',
    letterSpacing: '0.04em', whiteSpace: 'nowrap',
  },
  filterRow: {
    padding: '8px 20px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)', display: 'flex', gap: '6px', alignItems: 'center',
    flexWrap: 'wrap', flexShrink: 0,
  },
  filterLabel: { fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: '4px' },
  hintsRow: {
    padding: '6px 20px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)', display: 'flex', gap: '6px', alignItems: 'center',
    flexShrink: 0,
  },
  hintChip: {
    fontSize: '10px', padding: '2px 8px', border: '1px solid var(--border)',
    color: 'var(--text-muted)', cursor: 'pointer', letterSpacing: '0.04em',
    fontFamily: 'var(--font)',
  },
  sectionBar: {
    padding: '8px 20px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)',
    fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
  },
  tableWrap: { flex: 1, overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left', padding: '8px 14px', fontSize: '10px', letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)',
    fontWeight: 'normal', background: 'var(--bg-surface)', position: 'sticky', top: 0, zIndex: 1,
  },
  td: {
    padding: '8px 14px', borderBottom: '1px solid var(--border-subtle)',
    fontSize: '12px', color: 'var(--text-muted)', verticalAlign: 'middle',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 0,
  },
  sevBadge: (color) => ({
    fontSize: '10px', padding: '2px 7px', letterSpacing: '0.06em',
    textTransform: 'uppercase', border: `1px solid ${color}`, color, whiteSpace: 'nowrap',
  }),
  muted: { padding: '40px 20px', color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: 'var(--bg-primary)', border: '1px solid var(--border)', width: '680px', maxWidth: '95vw', height: '80vh', display: 'flex', flexDirection: 'column' },
  modalHeader: { padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: '12px', color: 'var(--text-primary)', letterSpacing: '0.04em' },
  modalClose: { background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '16px', cursor: 'pointer', fontFamily: 'var(--font)' },
  modalBody: { padding: '16px', overflow: 'auto', flex: 1 },
  fieldRow: { display: 'grid', gridTemplateColumns: '160px 1fr', borderBottom: '1px solid var(--border-subtle)', padding: '6px 0', gap: '12px' },
  fieldLabel: { fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingTop: '2px' },
  fieldValue: { fontSize: '12px', color: 'var(--text-primary)', wordBreak: 'break-word', whiteSpace: 'pre-wrap' },
  rawSection: { marginTop: '12px', padding: '10px', background: 'var(--bg-surface)', border: '1px solid var(--border)', fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '200px', overflow: 'auto' },
};

function sevColor(sev) { return SEV_COLOR[(sev || '').toLowerCase()] || 'var(--text-muted)'; }

export function LogSearch() {
  const isMobile = useIsMobile();
  const { getAccessTokenSilently } = useAuth0();
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [hours, setHours] = useState(24);
  const [sevFilter, setSevFilter] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState(null);
  const [showRaw, setShowRaw] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const inputRef = useRef(null);

  async function search(q, h, sev) {
    const qToUse = q ?? submittedQuery;
    const hToUse = h ?? hours;
    const sevToUse = sev !== undefined ? sev : sevFilter;
    setLoading(true);
    setSearched(true);
    setSubmittedQuery(qToUse);
    try {
      const token = await getAccessTokenSilently();
      const params = new URLSearchParams({ hours: hToUse });
      if (qToUse.trim()) params.set('q', qToUse.trim());
      if (sevToUse) params.set('severity', sevToUse);
      const res = await fetch(`/api/siem/events/recent?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') search(query, hours, sevFilter);
  }

  function appendHint(hint) {
    const newQ = query ? `${query.trimEnd()} ${hint}` : hint;
    setQuery(newQ);
    inputRef.current?.focus();
  }

  function exportCSV() {
    if (!results.length) return;
    const cols = ['timestamp','severity','event_id','event_category','host','source_ip','dest_ip','username','process_name','message'];
    const header = cols.join(',');
    const rows = results.map(r =>
      cols.map(c => {
        const v = String(r[c] ?? '').replace(/\r?\n/g, ' ').replace(/"/g, '""');
        return `"${v}"`;
      }).join(',')
    );
    const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'log-search.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={s.container}>
      <div style={s.header}>
        <span style={s.title}>SIEM &nbsp;<span style={s.sub}>/ Log Search</span></span>
      </div>

      <div style={isMobile ? { ...s.searchRow, flexWrap: 'wrap' } : s.searchRow}>
        <input
          ref={inputRef}
          style={s.searchInput}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search logs… field:value (username:SYSTEM, event_id:4625)"
          spellCheck={false}
          autoFocus={!isMobile}
        />
        <button style={s.btnActive} onClick={() => search(query, hours, sevFilter)} disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </button>
        {results.length > 0 && (
          <button style={s.btn} onClick={exportCSV}>Export CSV</button>
        )}
      </div>

      <div style={{ ...s.filterRow, flexWrap: 'wrap' }}>
        <span style={s.filterLabel}>Time</span>
        {HOURS_OPTIONS.map(h => (
          <button key={h} style={hours === h ? s.btnActive : s.btn} onClick={() => { setHours(h); if (searched) search(query, h, sevFilter); }}>
            {h < 24 ? `${h}h` : h === 24 ? '24h' : h === 48 ? '48h' : '7d'}
          </button>
        ))}
        <span style={{ ...s.filterLabel, marginLeft: isMobile ? 0 : '12px' }}>Severity</span>
        {[null, 'critical', 'high', 'medium', 'low', 'info'].map(sev => (
          <button
            key={sev ?? 'all'}
            style={sevFilter === sev ? s.btnActive : s.btn}
            onClick={() => { setSevFilter(sev); if (searched) search(query, hours, sev); }}
          >
            {sev ?? 'All'}
          </button>
        ))}
      </div>

      <div style={{ ...s.hintsRow, flexWrap: 'wrap' }}>
        <span style={{ ...s.filterLabel, flexShrink: 0 }}>Field syntax</span>
        {FIELD_HINTS.map(hint => (
          <button key={hint} style={s.hintChip} onClick={() => appendHint(hint)}>{hint}</button>
        ))}
      </div>

      <div style={s.sectionBar}>
        <span>{searched ? `Results${submittedQuery ? ` for "${submittedQuery}"` : ''}` : 'Enter a search above'}</span>
        {searched && <span style={{ fontSize: '10px' }}>{results.length} events · last {hours < 24 ? `${hours}h` : hours === 24 ? '24h' : hours === 48 ? '48h' : '7d'}</span>}
      </div>

      {isMobile ? (
        <div style={{ flex: 1, overflow: 'auto' }}>
          {!searched && <div style={s.muted}>Enter a search query and tap Search.</div>}
          {searched && !loading && !results.length && <div style={s.muted}>No results found.</div>}
          {results.map(row => (
            <div
              key={row.id}
              style={{ borderBottom: '1px solid var(--border-subtle)', padding: '10px 16px', cursor: 'pointer' }}
              onClick={() => { setSelected(row); setShowRaw(false); }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={s.sevBadge(sevColor(row.severity))}>{row.severity || '—'}</span>
                {row.event_id && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>ID {row.event_id}</span>}
                {row.event_category && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{row.event_category}</span>}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.message || '—'}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {row.timestamp ? new Date(row.timestamp).toLocaleString() : ''}
                {row.host ? ` · ${row.host}` : ''}
                {row.username ? ` · ${row.username}` : ''}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <colgroup>
              <col style={{ width: '130px' }} />
              <col style={{ width: '90px' }} />
              <col style={{ width: '75px' }} />
              <col style={{ width: '110px' }} />
              <col style={{ width: '120px' }} />
              <col style={{ width: '120px' }} />
              <col style={{ width: '120px' }} />
              <col style={{ width: '110px' }} />
              <col style={{ width: '160px' }} />
              <col />
            </colgroup>
            <thead>
              <tr>
                {['Time','Severity','Event ID','Category','Host','Src IP','Dest IP','User','Process','Message'].map(h => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!searched && (
                <tr><td colSpan={10} style={s.muted}>Enter a search query and press Search or Enter.</td></tr>
              )}
              {searched && !loading && !results.length && (
                <tr><td colSpan={10} style={s.muted}>No results found.</td></tr>
              )}
              {results.map(row => (
                <tr
                  key={row.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => { setSelected(row); setShowRaw(false); }}
                  onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, row }); }}
                  onMouseEnter={e => Array.from(e.currentTarget.cells).forEach(c => c.style.background = 'var(--bg-surface)')}
                  onMouseLeave={e => Array.from(e.currentTarget.cells).forEach(c => c.style.background = '')}
                >
                  <td style={s.td}>{row.timestamp ? new Date(row.timestamp).toLocaleString() : '—'}</td>
                  <td style={s.td}><span style={s.sevBadge(sevColor(row.severity))}>{row.severity || '—'}</span></td>
                  <td style={s.td}>{row.event_id || '—'}</td>
                  <td style={s.td}>{row.event_category || '—'}</td>
                  <td style={s.td}>{row.host || '—'}</td>
                  <td style={s.td}>{row.source_ip || '—'}</td>
                  <td style={s.td}>{row.dest_ip || '—'}</td>
                  <td style={s.td}>{row.username || '—'}</td>
                  <td style={s.td}>{row.process_name || '—'}</td>
                  <td style={s.td}>{row.message || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div style={s.overlay} onClick={() => setSelected(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <span style={s.modalTitle}>
                Event {selected.event_id || '—'} &nbsp;·&nbsp; {selected.host || '—'} &nbsp;·&nbsp;
                <span style={{ color: sevColor(selected.severity) }}>{selected.severity || '—'}</span>
              </span>
              <button style={s.modalClose} onClick={() => setSelected(null)}>✕</button>
            </div>
            <div style={s.modalBody}>
              {[
                ['Time', selected.timestamp ? new Date(selected.timestamp).toLocaleString() : null],
                ['Severity', selected.severity],
                ['Event ID', selected.event_id],
                ['Category', selected.event_category],
                ['Host', selected.host],
                ['Source IP', selected.source_ip],
                ['Dest IP', selected.dest_ip],
                ['Dest Port', selected.dest_port],
                ['Protocol', selected.protocol],
                ['Username', selected.username],
                ['Domain', selected.domain],
                ['Logon Type', selected.logon_type],
                ['Process', selected.process_name],
                ['Process ID', selected.process_id],
                ['Parent Process', selected.parent_process_name],
                ['File Path', selected.file_path],
                ['Registry Key', selected.registry_key],
                ['Source', selected.source],
                ['Message', selected.message],
              ].filter(([, v]) => v != null && v !== '').map(([label, value]) => (
                <div key={label} style={s.fieldRow}>
                  <div style={s.fieldLabel}>{label}</div>
                  <div style={s.fieldValue}>{String(value)}</div>
                </div>
              ))}
              {selected.raw && (
                <div>
                  <button style={{ ...s.btn, marginTop: '12px', fontSize: '10px' }} onClick={() => setShowRaw(v => !v)}>
                    {showRaw ? 'Hide Raw' : 'Show Raw Event'}
                  </button>
                  {showRaw && (
                    <div style={s.rawSection}>{JSON.stringify(selected.raw, null, 2)}</div>
                  )}
                </div>
              )}
              <ProcessTreePanel event={selected} />
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
            { label: 'View Event Detail', onClick: () => { setSelected(contextMenu.row); setShowRaw(false); } },
            ...(contextMenu.row.process_name ? [{
              label: `Process Tree: ${contextMenu.row.process_name}`,
              onClick: () => { setSelected(contextMenu.row); setShowRaw(false); },
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
    </div>
  );
}
