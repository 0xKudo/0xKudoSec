import { useState } from 'react';
import { useWorkspace } from '../../../platform/shell/src/context/WorkspaceContext.jsx';

const RISK_COLORS = {
  critical: 'var(--severity-critical)',
  high: 'var(--severity-high)',
  medium: 'var(--severity-medium)',
  low: 'var(--severity-low)',
  clean: 'var(--severity-low)',
  unknown: 'var(--text-muted)',
};

const SCAN_TYPES = [
  { value: 'ping',    label: 'Ping Scan (host discovery)' },
  { value: 'quick',   label: 'Quick Scan (top 100 ports)' },
  { value: 'full',    label: 'Full Port Scan (all ports)' },
  { value: 'service', label: 'Service Version Detection' },
  { value: 'os',      label: 'OS Detection' },
  { value: 'vuln',    label: 'Vulnerability Scripts' },
];

const styles = {
  container: { maxWidth: '900px' },
  header: { marginBottom: '24px' },
  title: { color: 'var(--text-primary)', fontSize: '18px', marginBottom: '6px' },
  subtitle: { color: 'var(--text-muted)', fontSize: '13px' },
  warning: {
    background: 'var(--bg-surface)',
    border: `1px solid var(--severity-high)`,
    borderRadius: '4px',
    padding: '12px 16px',
    color: 'var(--severity-high)',
    fontSize: '12px',
    marginBottom: '16px',
    lineHeight: '1.6',
  },
  inputRow: { display: 'flex', gap: '8px', marginBottom: '12px' },
  input: {
    flex: 1,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    fontSize: '13px',
    padding: '10px 12px',
    outline: 'none',
  },
  select: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    fontSize: '13px',
    padding: '10px 12px',
    outline: 'none',
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
    whiteSpace: 'nowrap',
  }),
  error: { color: 'var(--severity-critical)', fontSize: '13px', marginTop: '12px' },
  results: { marginTop: '24px' },
  summaryCard: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '20px',
    marginBottom: '16px',
  },
  riskRow: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' },
  badge: (level) => ({
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '4px',
    border: `1px solid ${RISK_COLORS[level] || 'var(--border)'}`,
    color: RISK_COLORS[level] || 'var(--text-muted)',
    fontSize: '12px',
    fontWeight: 'bold',
    textTransform: 'uppercase',
  }),
  targetLabel: { color: 'var(--text-muted)', fontSize: '12px' },
  summaryText: { color: 'var(--text-primary)', fontSize: '14px', lineHeight: '1.6', marginBottom: '16px' },
  label: {
    color: 'var(--text-muted)',
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '6px',
  },
  sectionBlock: { marginBottom: '16px' },
  listItem: { padding: '5px 0', color: 'var(--text-primary)', fontSize: '13px', borderBottom: '1px solid var(--border)' },
  findingItem: { padding: '5px 0', color: 'var(--severity-medium)', fontSize: '13px', borderBottom: '1px solid var(--border)' },
  rawOutput: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '16px',
    fontFamily: 'var(--font)',
    fontSize: '11px',
    color: 'var(--text-muted)',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    maxHeight: '400px',
    overflowY: 'auto',
  },
};

export default function NetworkScanner() {
  const [target, setTarget] = useState('');
  const [scanType, setScanType] = useState('quick');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showRaw, setShowRaw] = useState(false);
  const { push } = useWorkspace();

  async function handleScan() {
    if (!target.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setShowRaw(false);

    try {
      const res = await fetch('/api/tools/network-scanner/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: target.trim(), scanType }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Scan failed.');
      } else {
        setResult(data);
        push('network-scanner', `${data.scanType}: ${data.target}`, data, 'network-scanner');
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
        <h1 style={styles.title}>Network Scanner</h1>
        <p style={styles.subtitle}>
          Run nmap scans against a target. Only scan hosts and networks you own or have explicit authorization to test.
        </p>
      </div>

      <div style={styles.warning}>
        ⚠ Only scan targets you own or have explicit written authorization to test. Unauthorized scanning is illegal in most jurisdictions.
      </div>

      <div style={styles.inputRow}>
        <input
          style={styles.input}
          placeholder="192.168.1.1, 192.168.1.0/24, or hostname"
          value={target}
          onChange={e => setTarget(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !loading && target.trim() && handleScan()}
          disabled={loading}
        />
        <select
          style={styles.select}
          value={scanType}
          onChange={e => setScanType(e.target.value)}
          disabled={loading}
        >
          {SCAN_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <button
          style={styles.button(loading)}
          onClick={handleScan}
          disabled={loading || !target.trim()}
        >
          {loading ? 'Scanning...' : 'Scan'}
        </button>
      </div>

      {error && <p style={styles.error}>{error}</p>}

      {result && (
        <div style={styles.results}>
          <div style={styles.summaryCard}>
            <div style={styles.riskRow}>
              <div style={styles.badge(result.riskLevel)}>{result.riskLevel} risk</div>
              <span style={styles.targetLabel}>{result.scanLabel} — {result.target}</span>
            </div>

            <div style={styles.summaryText}>{result.summary}</div>

            {result.findings?.length > 0 && (
              <div style={styles.sectionBlock}>
                <div style={styles.label}>Findings</div>
                {result.findings.map((f, i) => (
                  <div key={i} style={styles.findingItem}>• {f}</div>
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

          {result.rawOutput && (
            <div>
              <button
                style={{ ...styles.button(false), marginBottom: '8px', fontWeight: 'normal' }}
                onClick={() => setShowRaw(v => !v)}
              >
                {showRaw ? 'Hide' : 'Show'} Raw nmap Output
              </button>
              {showRaw && <div style={styles.rawOutput}>{result.rawOutput}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
