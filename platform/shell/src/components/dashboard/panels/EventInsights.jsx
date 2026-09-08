import { useState, useEffect, useCallback } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { badgeStyle } from '../../ui/index.js';

// Tabbed insights: Top Event IDs / Failed Logins / Top Usernames / Rule Hits.
// Clicking a row broadcasts a `siem-events-search` window event that the Recent
// Events (EventsExplorer) widget consumes to filter its table — the same
// event-id/username/rule drill-down the legacy dashboard did via shared state.
const SEV_COLOR = { critical: 'var(--severity-critical)', high: 'var(--severity-high)', medium: 'var(--severity-medium)', low: 'var(--severity-low)', info: 'var(--severity-info)' };
const sevColor = (s) => SEV_COLOR[(s || '').toLowerCase()] || 'var(--text-muted)';

export function emitEventsSearch(query) {
  try { window.dispatchEvent(new CustomEvent('siem-events-search', { detail: query })); } catch {}
}

const TABS = [
  { id: 'event-ids', label: 'Top Event IDs' },
  { id: 'failed-logins', label: 'Failed Logins' },
  { id: 'top-usernames', label: 'Top Usernames' },
  { id: 'rule-hits', label: 'Rule Hits' },
];

const tabBtn = (active) => ({
  background: 'none', border: 'none', borderBottom: active ? '2px solid var(--text-primary)' : '2px solid transparent',
  color: active ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: 'var(--font)', fontSize: '11px',
  padding: '8px 12px', cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap',
});
const tbl = { width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: '11px' };
const thCell = { textAlign: 'left', padding: '4px 8px 4px 0', fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 'normal', borderBottom: '1px solid var(--border-subtle)' };
const muted = { fontSize: '11px', color: 'var(--text-muted)', padding: '10px 0' };

export function EventInsights({ onNavigate }) {
  const { getAccessTokenSilently } = useAuth0();
  const [tab, setTab] = useState('event-ids');
  const [hours] = useState(24);
  const [topEventIds, setTopEventIds] = useState([]);
  const [failedLogins, setFailedLogins] = useState([]);
  const [topUsernames, setTopUsernames] = useState([]);
  const [ruleHits, setRuleHits] = useState([]);
  const [activeQuery, setActiveQuery] = useState('');

  const load = useCallback(async () => {
    try {
      const token = await getAccessTokenSilently();
      const headers = { Authorization: `Bearer ${token}` };
      const h = `?hours=${hours}`;
      const [idsRes, flRes, usersRes, hitsRes] = await Promise.all([
        fetch(`/api/siem/events/top-event-ids${h}`, { headers }),
        fetch(`/api/siem/events/failed-logins${h}`, { headers }),
        fetch(`/api/siem/events/top-usernames${h}`, { headers }),
        fetch(`/api/siem/rules/hit-counts${h}`, { headers }),
      ]);
      const [ids, fl, users, hits] = await Promise.all([
        idsRes.ok ? idsRes.json() : [], flRes.ok ? flRes.json() : [],
        usersRes.ok ? usersRes.json() : [], hitsRes.ok ? hitsRes.json() : [],
      ]);
      setTopEventIds(Array.isArray(ids) ? ids : []);
      setFailedLogins(Array.isArray(fl) ? fl : []);
      setTopUsernames(Array.isArray(users) ? users : []);
      setRuleHits(Array.isArray(hits) ? hits : []);
    } catch { /* transient */ }
  }, [hours, getAccessTokenSilently]);

  useEffect(() => { load(); const id = setInterval(load, 300000); return () => clearInterval(id); }, [load]);

  function applyQuery(q) {
    const next = activeQuery === q ? '' : q;
    setActiveQuery(next);
    emitEventsSearch(next);
  }

  const rankTable = (rows, keyField, label) => (
    rows.length === 0 ? <div style={muted}>No data</div> : (
      <table style={tbl}>
        <thead><tr><th style={thCell}>{label}</th><th style={{ ...thCell, textAlign: 'right' }}>Count</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <td style={{ padding: '5px 8px 5px 0', color: 'var(--text-primary)' }}>{r[keyField] || '-'}</td>
              <td style={{ padding: '5px 0', color: 'var(--text-muted)', textAlign: 'right' }}>{Number(r.count).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', overflowX: 'auto', flex: '0 0 auto' }}>
        {TABS.map(t => <button key={t.id} style={tabBtn(tab === t.id)} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>
      <div style={{ padding: '10px 12px', overflow: 'auto', flex: 1, minHeight: 0 }}>
        {tab === 'event-ids' && (
          topEventIds.length === 0 ? <div style={muted}>No data</div> : (
            <table style={tbl}>
              <thead><tr><th style={thCell}>Event ID</th><th style={{ ...thCell, textAlign: 'right' }}>Count</th></tr></thead>
              <tbody>
                {topEventIds.map((r, i) => {
                  const q = `event_id:${r.event_id}`;
                  const isActive = activeQuery === q;
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', background: isActive ? 'var(--bg-primary)' : '' }}
                      onClick={() => applyQuery(q)}
                      title={isActive ? 'Click to clear filter' : `Filter events to ${q}`}
                    >
                      <td style={{ padding: '5px 8px 5px 0', color: isActive ? 'var(--text-primary)' : 'var(--severity-info)', fontWeight: isActive ? 'bold' : 'normal' }}>{isActive ? '✕ ' : ''}{r.event_id}</td>
                      <td style={{ padding: '5px 0', color: 'var(--text-muted)', textAlign: 'right' }}>{Number(r.count).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        )}
        {tab === 'failed-logins' && (
          failedLogins.length === 0 ? <div style={muted}>No failed logins in this window.</div> : (
            <table style={tbl}>
              <thead><tr>{['Time', 'Username', 'Host', 'Source IP'].map(h => <th key={h} style={thCell}>{h}</th>)}</tr></thead>
              <tbody>
                {failedLogins.map((r, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer' }}
                    onClick={() => r.username && applyQuery(`username:${r.username}`)}
                    title={r.username ? `Filter events to username:${r.username}` : ''}
                  >
                    <td style={{ padding: '5px 8px 5px 0', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{new Date(r.timestamp).toLocaleTimeString()}</td>
                    <td style={{ padding: '5px 8px 5px 0', color: 'var(--text-primary)' }}>{r.username || '-'}</td>
                    <td style={{ padding: '5px 8px 5px 0', color: 'var(--text-muted)' }}>{r.host || '-'}</td>
                    <td style={{ padding: '5px 8px 5px 0', color: 'var(--text-muted)' }}>{r.source_ip || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
        {tab === 'top-usernames' && (
          topUsernames.length === 0 ? <div style={muted}>No data</div> : (
            <table style={tbl}>
              <thead><tr><th style={thCell}>Username</th><th style={{ ...thCell, textAlign: 'right' }}>Count</th></tr></thead>
              <tbody>
                {topUsernames.map((r, i) => {
                  const q = `username:${r.username}`;
                  const isActive = activeQuery === q;
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', background: isActive ? 'var(--bg-primary)' : '' }}
                      onClick={() => r.username && applyQuery(q)}
                    >
                      <td style={{ padding: '5px 8px 5px 0', color: isActive ? 'var(--text-primary)' : 'var(--text-primary)', fontWeight: isActive ? 'bold' : 'normal' }}>{isActive ? '✕ ' : ''}{r.username || '-'}</td>
                      <td style={{ padding: '5px 0', color: 'var(--text-muted)', textAlign: 'right' }}>{Number(r.count).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        )}
        {tab === 'rule-hits' && (
          ruleHits.length === 0 ? <div style={muted}>No rules configured.</div> : (
            <table style={{ ...tbl, tableLayout: 'fixed' }}>
              <colgroup><col style={{ width: 'auto' }} /><col style={{ width: '80px' }} /><col style={{ width: '48px' }} /><col style={{ width: '80px' }} /></colgroup>
              <thead><tr>{['Rule', 'Severity', 'Hits', ''].map(h => <th key={h} style={thCell}>{h}</th>)}</tr></thead>
              <tbody>
                {ruleHits.map((r, i) => {
                  const matchParts = [
                    r.match_event_id && `event_id:${r.match_event_id}`, r.match_username && `username:${r.match_username}`,
                    r.match_host && `host:${r.match_host}`, r.match_src_ip && `src_ip:${r.match_src_ip}`,
                    r.match_dest_ip && `dest_ip:${r.match_dest_ip}`, r.match_process && `process:${r.match_process}`,
                    r.match_message && `message:${r.match_message}`, r.match_category && `category:${r.match_category}`,
                    r.match_severity && `severity:${r.match_severity}`,
                  ].filter(Boolean);
                  const q = matchParts[0] || '';
                  const isActive = q && activeQuery === q;
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)', cursor: q ? 'pointer' : 'default', background: isActive ? 'var(--bg-primary)' : '' }}
                      onClick={() => q && applyQuery(q)} title={r.name}
                    >
                      <td style={{ padding: '5px 8px 5px 0', color: 'var(--text-primary)', fontWeight: isActive ? 'bold' : 'normal', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isActive ? '✕ ' : ''}{r.name}</td>
                      <td style={{ padding: '5px 8px 5px 0' }}><span style={badgeStyle(sevColor(r.severity))}>{r.severity}</span></td>
                      <td style={{ padding: '5px 8px 5px 0', color: 'var(--text-muted)' }}>{Number(r.hits).toLocaleString()}</td>
                      <td style={{ padding: '5px 0', textAlign: 'right' }}>
                        <button style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)', fontFamily: 'var(--font)', fontSize: '10px', padding: '2px 8px', cursor: 'pointer' }}
                          onClick={e => { e.stopPropagation(); onNavigate?.('rules'); }}>View →</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  );
}
