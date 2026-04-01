import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useWorkspace } from '../../../platform/shell/src/context/WorkspaceContext.jsx';

const SEVERITY_COLORS = {
  critical: 'var(--severity-critical)',
  high: 'var(--severity-high)',
  medium: 'var(--severity-medium)',
  low: 'var(--severity-low)',
  info: 'var(--severity-info)',
};

const styles = {
  container: {
    maxWidth: '800px',
  },
  header: {
    marginBottom: '24px',
  },
  title: {
    color: 'var(--text-primary)',
    fontSize: '18px',
    marginBottom: '6px',
  },
  subtitle: {
    color: 'var(--text-muted)',
    fontSize: '13px',
  },
  textarea: {
    width: '100%',
    minHeight: '160px',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    fontSize: '13px',
    padding: '12px',
    resize: 'vertical',
    outline: 'none',
    marginBottom: '12px',
  },
  button: (loading) => ({
    background: loading ? 'var(--bg-surface)' : 'var(--btn-primary-bg)',
    color: loading ? 'var(--text-muted)' : 'var(--btn-primary-text)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '10px 20px',
    fontFamily: 'var(--font)',
    fontSize: '13px',
    fontWeight: 'bold',
    cursor: loading ? 'not-allowed' : 'pointer',
  }),
  results: {
    marginTop: '24px',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '20px',
  },
  severityBadge: (severity) => ({
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '4px',
    border: `1px solid ${SEVERITY_COLORS[severity] || 'var(--border)'}`,
    color: SEVERITY_COLORS[severity] || 'var(--text-muted)',
    fontSize: '12px',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: '16px',
  }),
  label: {
    color: 'var(--text-muted)',
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '4px',
  },
  value: {
    color: 'var(--text-primary)',
    fontSize: '14px',
    marginBottom: '16px',
    lineHeight: '1.5',
  },
  actionItem: {
    padding: '6px 0',
    color: 'var(--text-primary)',
    fontSize: '13px',
    borderBottom: '1px solid var(--border)',
  },
  error: {
    color: 'var(--severity-critical)',
    fontSize: '13px',
    marginTop: '12px',
  },
};

export default function AlertTriageTool() {
  const { getAccessTokenSilently } = useAuth0();
  const [alertText, setAlertText] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { push } = useWorkspace();

  useEffect(() => {
    try {
      const restore = JSON.parse(localStorage.getItem('workspace-restore-alert-triage') || 'null');
      if (restore) { setResult(restore); localStorage.removeItem('workspace-restore-alert-triage'); }
    } catch {}
  }, []);

  async function handleAnalyze() {
    if (!alertText.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const token = await getAccessTokenSilently();
      const res = await fetch('/api/tools/alert-triage/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ alertText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Analysis failed.');
      } else {
        setResult(data);
        push('alert-triage', `${data.severity.toUpperCase()} — ${data.attackVector}`, data, 'alert-triage');
      }
    } catch {
      setError('Network error. Is the server running?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Alert Triage Assistant</h1>
        <p style={styles.subtitle}>
          Paste a SIEM alert below. Get severity assessment, likely attack vector, and recommended next steps.
        </p>
      </div>

      <textarea
        style={styles.textarea}
        placeholder="Paste alert text here..."
        value={alertText}
        onChange={e => setAlertText(e.target.value)}
        disabled={loading}
      />

      <button
        style={styles.button(loading)}
        onClick={handleAnalyze}
        disabled={loading || !alertText.trim()}
      >
        {loading ? 'Analyzing...' : 'Analyze Alert'}
      </button>

      {error && <p style={styles.error}>{error}</p>}

      {result && (
        <div style={styles.results}>
          <div style={styles.severityBadge(result.severity)}>
            {result.severity} — Confidence: {result.confidence}
          </div>

          <div style={styles.label}>Summary</div>
          <div style={styles.value}>{result.summary}</div>

          <div style={styles.label}>Attack Vector</div>
          <div style={styles.value}>{result.attackVector}</div>

          <div style={styles.label}>Recommended Actions</div>
          <div>
            {result.recommendedActions.map((action, i) => (
              <div key={i} style={styles.actionItem}>{i + 1}. {action}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
