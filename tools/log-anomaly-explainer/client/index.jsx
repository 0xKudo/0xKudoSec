import { useState, useRef, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useWorkspace } from '../../../platform/shell/src/context/WorkspaceContext.jsx';
import { useIsMobile } from '../../../platform/shell/src/hooks/useIsMobile.js';

const SEVERITY_COLORS = {
  critical: 'var(--severity-critical)',
  high: 'var(--severity-high)',
  medium: 'var(--severity-medium)',
  low: 'var(--severity-low)',
  clean: 'var(--severity-low)',
  unknown: 'var(--text-muted)',
};

const LOG_SOURCES = [
  { value: 'auto',          label: 'Auto-detect' },
  { value: 'syslog',        label: 'Syslog' },
  { value: 'auth',          label: 'Auth Log (/var/log/auth.log)' },
  { value: 'apache',        label: 'Apache / Nginx' },
  { value: 'windows-event', label: 'Windows Event Log' },
  { value: 'application',   label: 'Application Log' },
  { value: 'docker',        label: 'Docker' },
  { value: 'kubernetes',    label: 'Kubernetes' },
  { value: 'database',      label: 'Database' },
  { value: 'other',         label: 'Other' },
];

const styles = {
  container: { maxWidth: '900px' },
  header: { marginBottom: '24px' },
  title: { color: 'var(--text-primary)', fontSize: '13px', marginBottom: '4px' },
  subtitle: { color: 'var(--text-muted)', fontSize: '13px' },
  tabs: { display: 'flex', gap: '4px', marginBottom: '12px' },
  tab: (active) => ({
    background: active ? 'var(--btn-primary-bg)' : 'var(--bg-surface)',
    color: active ? 'var(--btn-primary-text)' : 'var(--text-muted)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '6px 14px',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    cursor: 'pointer',
  }),
  controlRow: { display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' },
  select: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    fontSize: '13px',
    padding: '8px 12px',
    outline: 'none',
  },
  button: (loading) => ({
    background: loading ? 'var(--bg-surface)' : 'var(--btn-primary-bg)',
    color: loading ? 'var(--text-muted)' : 'var(--btn-primary-text)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '8px 20px',
    fontFamily: 'var(--font)',
    fontSize: '11px',
    cursor: loading ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
  }),
  textarea: {
    width: '100%',
    minHeight: '220px',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    padding: '12px',
    outline: 'none',
    resize: 'vertical',
    boxSizing: 'border-box',
  },
  uploadBox: {
    border: '1px dashed var(--border)',
    borderRadius: '4px',
    padding: '32px',
    textAlign: 'center',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    fontSize: '13px',
    marginBottom: '12px',
  },
  fileName: { color: 'var(--text-primary)', fontSize: '13px', marginBottom: '12px' },
  error: { color: 'var(--severity-critical)', fontSize: '13px', marginTop: '12px' },
  results: { marginTop: '24px' },
  summaryCard: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '20px',
    marginBottom: '16px',
  },
  badgeRow: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' },
  badge: (level) => ({
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '4px',
    border: `1px solid ${SEVERITY_COLORS[level] || 'var(--border)'}`,
    color: SEVERITY_COLORS[level] || 'var(--text-muted)',
    fontSize: '12px',
    fontWeight: 'bold',
    textTransform: 'uppercase',
  }),
  sourceLabel: { color: 'var(--text-muted)', fontSize: '12px' },
  summaryText: { color: 'var(--text-primary)', fontSize: '14px', lineHeight: '1.6', marginBottom: '16px' },
  label: {
    color: 'var(--text-muted)',
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '8px',
  },
  sectionBlock: { marginBottom: '20px' },
  anomalyCard: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '14px',
    marginBottom: '10px',
  },
  anomalyHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  anomalyTitle: { color: 'var(--text-primary)', fontSize: '13px', fontWeight: 'bold' },
  anomalyExplanation: { color: 'var(--text-primary)', fontSize: '13px', lineHeight: '1.6', marginBottom: '8px' },
  lineRefs: { color: 'var(--text-muted)', fontSize: '11px', fontStyle: 'italic' },
  listItem: { padding: '5px 0', color: 'var(--text-primary)', fontSize: '13px', borderBottom: '1px solid var(--border)' },
  cleanBanner: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--severity-low)',
    borderRadius: '4px',
    padding: '16px',
    color: 'var(--severity-low)',
    fontSize: '13px',
    textAlign: 'center',
  },
};

export default function LogAnomalyExplainer() {
  const isMobile = useIsMobile();
  const { getAccessTokenSilently } = useAuth0();
  const [tab, setTab] = useState('paste');
  const [logText, setLogText] = useState('');
  const [logSource, setLogSource] = useState('auto');
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const { push } = useWorkspace();

  useEffect(() => {
    try {
      const restore = JSON.parse(localStorage.getItem('workspace-restore-log-anomaly-explainer') || 'null');
      if (restore) { setResult(restore); localStorage.removeItem('workspace-restore-log-anomaly-explainer'); }
    } catch {}
  }, []);

  async function handleAnalyze() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const token = await getAccessTokenSilently();
      let res;
      if (tab === 'paste') {
        res = await fetch('/api/tools/log-anomaly-explainer/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ logText, logSource }),
        });
      } else {
        const form = new FormData();
        form.append('file', file);
        form.append('logSource', logSource);
        res = await fetch('/api/tools/log-anomaly-explainer/analyze-file', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: form,
        });
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Analysis failed.');
      } else {
        setResult(data);
        push('log-anomaly-explainer', `Log Analysis — ${data.logSource}`, data, 'log-anomaly-explainer');
      }
    } catch {
      setError('Network error. Is the server running?');
    } finally {
      setLoading(false);
    }
  }

  const canAnalyze = !loading && (tab === 'paste' ? logText.trim().length > 0 : file !== null);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Log Anomaly Explainer</h1>
        <p style={styles.subtitle}>
          Paste or upload system, auth, web server, or application logs. Claude identifies anomalies and explains them in plain English.
        </p>
      </div>

      <div style={styles.tabs}>
        <button style={styles.tab(tab === 'paste')} onClick={() => setTab('paste')}>Paste Logs</button>
        <button style={styles.tab(tab === 'upload')} onClick={() => setTab('upload')}>Upload File</button>
      </div>

      <div style={{ ...styles.controlRow, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
        <select style={isMobile ? { ...styles.select, width: '100%' } : styles.select} value={logSource} onChange={e => setLogSource(e.target.value)} disabled={loading}>
          {LOG_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <button style={styles.button(loading)} onClick={handleAnalyze} disabled={!canAnalyze}>
          {loading ? 'Analyzing...' : 'Analyze'}
        </button>
      </div>

      {tab === 'paste' ? (
        <textarea
          style={styles.textarea}
          placeholder={`Paste log lines here...\n\nExamples:\n  Mar 29 10:01:32 server sshd[1234]: Failed password for root from 1.2.3.4 port 52411 ssh2\n  192.168.1.5 - - [29/Mar/2026:10:00:01 +0000] "GET /admin HTTP/1.1" 403 512\n  ERROR 2026-03-29 kernel: Out of memory: Kill process 1234`}
          value={logText}
          onChange={e => setLogText(e.target.value)}
          disabled={loading}
        />
      ) : (
        <>
          <div style={styles.uploadBox} onClick={() => fileInputRef.current?.click()}>
            Click to select a log file (.log, .txt, .csv, .json) — max 500kb
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".log,.txt,.csv,.json"
            style={{ display: 'none' }}
            onChange={e => setFile(e.target.files[0] || null)}
          />
          {file && <div style={styles.fileName}>Selected: {file.name} ({(file.size / 1024).toFixed(1)} kb)</div>}
        </>
      )}

      {error && <p style={styles.error}>{error}</p>}

      {result && (
        <div style={styles.results}>
          <div style={styles.summaryCard}>
            <div style={styles.badgeRow}>
              <div style={styles.badge(result.severityLevel)}>{result.severityLevel}</div>
              <span style={styles.sourceLabel}>source: {result.logSource}</span>
            </div>

            <div style={styles.summaryText}>{result.summary}</div>

            {result.anomalies?.length === 0 && (
              <div style={styles.cleanBanner}>No anomalies detected — logs appear normal.</div>
            )}

            {result.anomalies?.length > 0 && (
              <div style={styles.sectionBlock}>
                <div style={styles.label}>Anomalies ({result.anomalies.length})</div>
                {result.anomalies.map((a, i) => (
                  <div key={i} style={styles.anomalyCard}>
                    <div style={styles.anomalyHeader}>
                      <span style={styles.anomalyTitle}>{a.title}</span>
                      <span style={styles.badge(a.severity)}>{a.severity}</span>
                    </div>
                    <div style={styles.anomalyExplanation}>{a.explanation}</div>
                    {a.lineRefs?.length > 0 && (
                      <div style={styles.lineRefs}>Referenced: {a.lineRefs.join(' | ')}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {result.recommendations?.length > 0 && (
              <div style={styles.sectionBlock}>
                <div style={styles.label}>Recommendations</div>
                {result.recommendations.map((r, i) => (
                  <div key={i} style={styles.listItem}>{i + 1}. {r}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
