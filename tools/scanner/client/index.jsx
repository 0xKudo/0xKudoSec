import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useWorkspace } from '../../../platform/shell/src/context/WorkspaceContext.jsx';
import { useIsMobile } from '../../../platform/shell/src/hooks/useIsMobile.js';

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];
const SEVERITY_COLOR = {
  critical: 'var(--severity-critical)',
  high: 'var(--severity-high)',
  medium: 'var(--severity-medium)',
  low: 'var(--severity-low)',
  info: 'var(--severity-info)',
};

const styles = {
  container: { maxWidth: '960px' },
  header: {
    margin: '-24px -24px 20px -24px',
    padding: '12px 20px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  title: { fontSize: '13px', color: 'var(--text-primary)', letterSpacing: '0.02em', margin: 0 },
  subtitle: { color: 'var(--text-muted)', fontSize: '11px', margin: 0 },
  warning: {
    background: 'rgba(239,68,68,0.08)',
    border: '1px solid var(--severity-critical)',
    padding: '10px 14px',
    color: 'var(--severity-critical)',
    fontSize: '12px',
    marginBottom: '20px',
  },
  section: { marginBottom: '16px' },
  label: { color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px', display: 'block' },
  inputRow: { display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '14px' },
  input: {
    flex: 1,
    minWidth: '280px',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    fontSize: '13px',
    padding: '6px 10px',
    outline: 'none',
  },
  button: (disabled) => ({
    background: disabled ? 'var(--bg-surface)' : 'var(--btn-primary-bg)',
    color: disabled ? 'var(--text-muted)' : 'var(--btn-primary-text)',
    border: '1px solid var(--border)',
    padding: '8px 20px',
    fontFamily: 'var(--font)',
    fontSize: '11px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
  }),
  modeRow: { display: 'flex', gap: '20px', alignItems: 'flex-start', marginBottom: '14px', flexWrap: 'wrap' },
  modeCard: (active) => ({
    background: active ? 'rgba(232,230,227,0.06)' : 'var(--bg-surface)',
    border: `1px solid ${active ? 'var(--text-primary)' : 'var(--border)'}`,
    borderRadius: '6px',
    padding: '6px 10px',
    cursor: 'pointer',
    minWidth: '200px',
  }),
  modeTitle: { color: 'var(--text-primary)', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' },
  modeDesc: { color: 'var(--text-muted)', fontSize: '11px', lineHeight: '1.5' },
  authBox: {
    background: 'rgba(239,68,68,0.06)',
    border: '1px solid var(--severity-critical)',
    padding: '10px 14px',
    marginBottom: '14px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
  },
  authText: { color: 'var(--text-primary)', fontSize: '12px', lineHeight: '1.5' },
  error: { color: 'var(--severity-critical)', fontSize: '13px', marginBottom: '12px' },
  results: { marginTop: '24px' },
  analysisCard: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    padding: '16px',
    marginBottom: '20px',
  },
  analysisHeader: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' },
  analysisTitle: { color: 'var(--text-primary)', fontSize: '14px', fontWeight: 'bold' },
  riskBadge: (level) => ({
    display: 'inline-block',
    background: SEVERITY_COLOR[level] || SEVERITY_COLOR.info,
    color: '#fff',
    fontSize: '11px',
    fontWeight: 'bold',
    padding: '2px 8px',
    borderRadius: '3px',
    textTransform: 'uppercase',
  }),
  summary: { color: 'var(--text-primary)', fontSize: '13px', lineHeight: '1.6', marginBottom: '10px' },
  listLabel: { color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px', marginTop: '10px' },
  listItem: { color: 'var(--text-primary)', fontSize: '12px', lineHeight: '1.7', marginLeft: '12px' },
  statsRow: { display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' },
  statBadge: (sev) => ({
    background: SEVERITY_COLOR[sev],
    color: '#fff',
    fontSize: '12px',
    fontWeight: 'bold',
    padding: '3px 10px',
    borderRadius: '3px',
  }),
  findingCard: (sev) => ({
    background: 'var(--bg-surface)',
    border: `1px solid ${SEVERITY_COLOR[sev]}`,
    padding: '12px 14px',
    marginBottom: '8px',
  }),
  findingTitle: { color: 'var(--text-primary)', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' },
  findingDetail: { color: 'var(--text-muted)', fontSize: '12px', lineHeight: '1.5' },
  severityChip: (sev) => ({
    display: 'inline-block',
    background: SEVERITY_COLOR[sev],
    color: '#fff',
    fontSize: '10px',
    fontWeight: 'bold',
    padding: '1px 6px',
    borderRadius: '2px',
    textTransform: 'uppercase',
    marginRight: '8px',
  }),
  groupHeader: { color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px', marginTop: '16px' },
  emptyState: { color: 'var(--text-muted)', fontSize: '13px', padding: '20px 0' },
};

export default function Scanner() {
  const isMobile = useIsMobile();
  const { getAccessTokenSilently } = useAuth0();
  const [url, setUrl] = useState('');
  const [activeMode, setActiveMode] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const { push } = useWorkspace();

  useEffect(() => {
    try {
      const imp = JSON.parse(localStorage.getItem('payload-generator-import') || 'null');
      if (imp?.target === 'scanner' && imp?.payload) {
        setUrl(imp.payload);
        localStorage.removeItem('payload-generator-import');
      }
    } catch {}
    try {
      const restore = JSON.parse(localStorage.getItem('workspace-restore-scanner') || 'null');
      if (restore) {
        setUrl(restore.url || '');
        setResult(restore);
        localStorage.removeItem('workspace-restore-scanner');
      }
    } catch {}
  }, []);

  async function handleScan() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const token = await getAccessTokenSilently();
      const res = await fetch('/api/tools/scanner/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ url: url.trim(), activeMode, authorized }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Scan failed.');
      } else {
        setResult(data);
        push(
          'scanner',
          `Scan — ${data.url} (${data.findings.length} findings)`,
          { url: data.url, findings: data.findings, analysis: data.analysis },
          'scanner'
        );
      }
    } catch {
      setError('Network error. Is the server running?');
    } finally {
      setLoading(false);
    }
  }

  const canScan = !loading && url.trim().length > 0 && (!activeMode || authorized);

  const findingsBySeverity = result
    ? SEVERITY_ORDER.reduce((acc, sev) => {
        const group = result.findings.filter(f => f.severity === sev);
        if (group.length > 0) acc[sev] = group;
        return acc;
      }, {})
    : {};

  const severityCounts = result
    ? SEVERITY_ORDER.reduce((acc, sev) => {
        const count = result.findings.filter(f => f.severity === sev).length;
        if (count > 0) acc[sev] = count;
        return acc;
      }, {})
    : {};

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Vulnerability Scanner</h1>
        <p style={styles.subtitle}>
          Passive: checks headers, cookies, forms, and info leakage. Active: probes inputs with XSS and SQLi payloads.
        </p>
      </div>

      <div style={styles.section}>
        <span style={styles.label}>Target URL</span>
        <div style={{ ...styles.inputRow, flexDirection: isMobile ? 'column' : 'row' }}>
          <input
            style={isMobile ? { ...styles.input, minWidth: 0 } : styles.input}
            placeholder="https://example.com"
            value={url}
            onChange={e => setUrl(e.target.value)}
            disabled={loading}
            onKeyDown={e => e.key === 'Enter' && canScan && handleScan()}
          />
          <button style={styles.button(!canScan)} onClick={handleScan} disabled={!canScan}>
            {loading ? 'Scanning...' : 'Scan'}
          </button>
        </div>
      </div>

      <div style={styles.section}>
        <span style={styles.label}>Scan Mode</span>
        <div style={{ ...styles.modeRow, flexDirection: isMobile ? 'column' : 'row' }}>
          <div style={styles.modeCard(!activeMode)} onClick={() => { setActiveMode(false); setAuthorized(false); }}>
            <div style={styles.modeTitle}>Passive</div>
            <div style={styles.modeDesc}>Headers, cookies, forms, info leakage. No attack traffic sent.</div>
          </div>
          <div style={styles.modeCard(activeMode)} onClick={() => setActiveMode(true)}>
            <div style={styles.modeTitle}>Active</div>
            <div style={styles.modeDesc}>Passive checks + XSS and SQLi probes on discovered inputs.</div>
          </div>
        </div>
      </div>

      {activeMode && (
        <div style={styles.authBox}>
          <input
            type="checkbox"
            id="auth-check"
            checked={authorized}
            onChange={e => setAuthorized(e.target.checked)}
            disabled={loading}
            style={{ marginTop: '2px', flexShrink: 0 }}
          />
          <label htmlFor="auth-check" style={styles.authText}>
            I confirm I own this target or have explicit written authorization to perform active security testing against it.
          </label>
        </div>
      )}

      {error && <p style={styles.error}>{error}</p>}

      {result && (
        <div style={styles.results}>
          {/* AI Analysis */}
          <div style={styles.analysisCard}>
            <div style={styles.analysisHeader}>
              <span style={styles.analysisTitle}>AI Analysis</span>
              {result.analysis?.riskLevel && (
                <span style={styles.riskBadge(result.analysis.riskLevel)}>
                  {result.analysis.riskLevel}
                </span>
              )}
              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                {result.mode === 'active' ? 'Active scan' : 'Passive scan'} — {result.findings.length} finding{result.findings.length !== 1 ? 's' : ''}
              </span>
            </div>
            {result.analysis?.summary && (
              <p style={styles.summary}>{result.analysis.summary}</p>
            )}
            {result.analysis?.topPriorities?.length > 0 && (
              <>
                <div style={styles.listLabel}>Top Priorities</div>
                {result.analysis.topPriorities.map((p, i) => (
                  <div key={i} style={styles.listItem}>• {p}</div>
                ))}
              </>
            )}
            {result.analysis?.notes && (
              <div style={{ ...styles.listItem, marginTop: '8px', color: 'var(--text-muted)' }}>{result.analysis.notes}</div>
            )}
          </div>

          {/* Severity summary */}
          {Object.keys(severityCounts).length > 0 && (
            <div style={styles.statsRow}>
              {SEVERITY_ORDER.filter(s => severityCounts[s]).map(sev => (
                <span key={sev} style={styles.statBadge(sev)}>
                  {sev}: {severityCounts[sev]}
                </span>
              ))}
            </div>
          )}

          {/* Findings grouped by severity */}
          {result.findings.length === 0 ? (
            <p style={styles.emptyState}>No issues found.</p>
          ) : (
            SEVERITY_ORDER.filter(s => findingsBySeverity[s]).map(sev => (
              <div key={sev}>
                <div style={styles.groupHeader}>{sev} ({findingsBySeverity[sev].length})</div>
                {findingsBySeverity[sev].map((f, i) => (
                  <div key={i} style={styles.findingCard(sev)}>
                    <div style={styles.findingTitle}>
                      <span style={styles.severityChip(sev)}>{sev}</span>
                      {f.title}
                    </div>
                    <div style={styles.findingDetail}>{f.detail}</div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
