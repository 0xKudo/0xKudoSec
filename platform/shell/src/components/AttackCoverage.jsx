import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { ATTACK_TACTICS, ATTACK_TECHNIQUES, ATTACK_TACTIC_BY_ID, techniqueLabel } from '../../../shared/attack.js';
import { useIsMobile } from '../hooks/useIsMobile.js';

// Heat ramp: the Field petrol accent (--accent-amber, revalued to petrol) at
// increasing opacity by count. 0 = faint outline only. color-mix keeps it
// theme-aware -- the accent resolves to a different petrol in light vs dark.
function heatBg(count, max) {
  if (!count) return 'transparent';
  const ratio = max > 0 ? count / max : 0;
  const pct = ((0.18 + 0.72 * Math.sqrt(ratio)) * 100).toFixed(1);
  return `color-mix(in srgb, var(--accent-amber) ${pct}%, transparent)`;
}

const WINDOW_OPTIONS = [1, 6, 24, 24 * 7, 24 * 30]; // hours, mapped to days for the API

// Build the technique universe: curated set (nice names + tactic placement) unioned
// with every id present in the coverage data. Unknown ids bucket under "Unmapped".
function buildColumns(rules, alerts) {
  const byId = new Map(ATTACK_TECHNIQUES.map(t => [t.id, t]));
  const ids = new Set([...ATTACK_TECHNIQUES.map(t => t.id), ...Object.keys(rules), ...Object.keys(alerts)]);
  const columns = ATTACK_TACTICS.map(tac => ({ id: tac.id, name: tac.name, techniques: [] }));
  const colById = new Map(columns.map(c => [c.id, c]));
  const unmapped = { id: 'UNMAPPED', name: 'Unmapped', techniques: [] };
  for (const id of ids) {
    const curated = byId.get(id);
    const tactics = curated?.tactics?.length ? curated.tactics : null;
    const entry = { id, name: curated?.name || id };
    if (tactics) {
      for (const ta of tactics) (colById.get(ta) || unmapped).techniques.push(entry);
    } else {
      unmapped.techniques.push(entry);
    }
  }
  const out = columns.filter(c => c.techniques.length);
  if (unmapped.techniques.length) out.push(unmapped);
  // Stable order: highest-covered technique first within each column.
  for (const c of out) c.techniques.sort((a, b) => (rules[b.id] || 0) - (rules[a.id] || 0) || a.id.localeCompare(b.id));
  return out;
}

async function fetchCoverage(getToken, windowDays) {
  const token = await getToken();
  const res = await fetch(`/api/siem/attack/coverage?window_days=${windowDays}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('coverage fetch failed');
  return res.json();
}

// ── Full interactive matrix (Rule Library) ─────────────────────────────────────
export function AttackCoverage({ onSelectTechnique }) {
  const { getAccessTokenSilently } = useAuth0();
  const isMobile = useIsMobile();
  const [data, setData] = useState({ rules: {}, alerts: {}, window_days: 30 });
  const [metric, setMetric] = useState('rules'); // 'rules' | 'alerts'
  const [hours, setHours] = useState(24 * 30);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await fetchCoverage(getAccessTokenSilently, Math.max(1, Math.round(hours / 24)))); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [getAccessTokenSilently, hours]);
  useEffect(() => { load(); }, [load]);

  const active = metric === 'rules' ? data.rules : data.alerts;
  const columns = useMemo(() => buildColumns(data.rules, data.alerts), [data]);
  const max = useMemo(() => Math.max(1, ...Object.values(active)), [active]);
  const coveredCount = Object.keys(data.rules).length;
  const totalTech = useMemo(() => columns.reduce((n, c) => n + c.techniques.length, 0), [columns]);
  const tacticsCovered = columns.filter(c => c.techniques.some(t => data.rules[t.id])).length;
  const firedCount = Object.keys(data.alerts).length;

  return (
    <div style={s.wrap}>
      <div style={s.toolbar}>
        <div style={s.metricRow}>
          <button style={metric === 'rules' ? s.pillActive : s.pill} onClick={() => setMetric('rules')}>Rule coverage</button>
          <button style={metric === 'alerts' ? s.pillActive : s.pill} onClick={() => setMetric('alerts')}>Alert activity</button>
          {metric === 'alerts' && (
            <>
              <span style={{ width: '1px', alignSelf: 'stretch', background: 'var(--border)', margin: '0 6px' }} />
              {WINDOW_OPTIONS.map(h => (
                <button key={h} style={hours === h ? s.pillActive : s.pill} onClick={() => setHours(h)}>
                  {h < 24 ? `${h}h` : h === 24 ? '24h' : h === 24 * 7 ? '7d' : '30d'}
                </button>
              ))}
            </>
          )}
        </div>
        <div style={s.summary}>
          Covered <b style={{ color: 'var(--text-primary)' }}>{coveredCount}</b> of {totalTech} techniques across {tacticsCovered} tactics
          {firedCount > 0 && <> · <b style={{ color: 'var(--accent-amber)' }}>{firedCount}</b> fired in the window</>}
        </div>
      </div>

      {loading ? (
        <div style={s.muted}>Loading coverage…</div>
      ) : isMobile ? (
        <div>
          {columns.map(col => (
            <div key={col.id} style={{ borderBottom: '1px solid var(--border-subtle)', padding: '8px 0' }}>
              <div style={s.colHeadMobile}>{col.name}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                {col.techniques.filter(t => active[t.id]).map(t => (
                  <span key={t.id} style={{ ...s.cell, background: heatBg(active[t.id], max), cursor: 'pointer' }}
                        onClick={() => onSelectTechnique?.(t.id)}>{t.id} · {active[t.id]}</span>
                ))}
                {col.techniques.every(t => !active[t.id]) && <span style={s.muted}>none</span>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }} className="kudo-scroll">
          <div style={{ display: 'flex', gap: '8px', minWidth: 'min-content', alignItems: 'flex-start' }}>
            {columns.map(col => (
              <div key={col.id} style={s.col}>
                <div style={s.colHead} title={col.id}>{col.name}</div>
                <div style={s.colCount}>{col.techniques.filter(t => data.rules[t.id]).length}/{col.techniques.length}</div>
                {col.techniques.map(t => {
                  const c = active[t.id] || 0;
                  return (
                    <div
                      key={t.id}
                      style={{ ...s.cell, background: heatBg(c, max), color: c ? 'var(--text-primary)' : 'var(--text-subtle)', cursor: 'pointer' }}
                      title={`${techniqueLabel(t.id)} — ${data.rules[t.id] || 0} rules, ${data.alerts[t.id] || 0} alerts`}
                      onClick={() => onSelectTechnique?.(t.id)}
                    >
                      <span style={s.cellId}>{t.id}</span>
                      <span style={s.cellName}>{t.name}</span>
                      {c > 0 && <span style={s.cellCount}>{c}</span>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  wrap: { padding: '4px 0' },
  toolbar: { display: 'flex', flexWrap: 'wrap', gap: '10px 16px', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' },
  metricRow: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' },
  summary: { fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.02em' },
  pill: {
    background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)',
    fontFamily: 'var(--font)', fontSize: '11px', padding: '4px 12px', cursor: 'pointer', letterSpacing: '0.04em',
  },
  pillActive: {
    background: 'var(--btn-primary-bg)', border: '1px solid var(--border)', color: 'var(--btn-primary-text)',
    fontFamily: 'var(--font)', fontSize: '11px', padding: '4px 12px', cursor: 'pointer', letterSpacing: '0.04em',
  },
  col: { flex: '0 0 auto', width: '132px', display: 'flex', flexDirection: 'column', gap: '3px' },
  colHead: {
    fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em',
    padding: '4px 6px', borderBottom: '1px solid var(--border)', minHeight: '30px', lineHeight: 1.2,
  },
  colCount: { fontSize: '10px', color: 'var(--text-subtle)', padding: '0 6px 3px' },
  colHeadMobile: { fontSize: '11px', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' },
  cell: {
    border: '1px solid var(--border-subtle)', padding: '4px 6px', fontSize: '10px',
    display: 'flex', flexDirection: 'column', gap: '1px', position: 'relative',
  },
  cellId: { fontSize: '10px', fontWeight: 600, color: 'inherit', fontFamily: 'var(--font-mono)' },
  cellName: { fontSize: '9px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  cellCount: { position: 'absolute', top: '3px', right: '5px', fontSize: '10px', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' },
  muted: { fontSize: '11px', color: 'var(--text-muted)', padding: '8px 0' },
};
