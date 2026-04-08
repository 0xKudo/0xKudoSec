import { useState, useEffect, useRef } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useWorkspace } from '../../../platform/shell/src/context/WorkspaceContext.jsx';
import { useIsMobile } from '../../../platform/shell/src/hooks/useIsMobile.js';

const RISK_COLORS = {
  critical: 'var(--severity-critical)',
  high:     'var(--severity-high)',
  medium:   'var(--severity-medium)',
  low:      'var(--severity-low)',
  clean:    'var(--severity-low)',
  unknown:  'var(--text-muted)',
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
  container: { padding: 0 },
  header: {
    margin: '-24px -24px 20px -24px',
    padding: '12px 20px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  title: { fontSize: '13px', color: 'var(--text-primary)', letterSpacing: '0.02em', margin: 0, fontWeight: 'normal' },
  subtitle: { color: 'var(--text-muted)', fontSize: '11px', margin: 0 },
  warning: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--severity-high)',
    padding: '6px 10px',
    color: 'var(--severity-high)',
    fontSize: '12px',
    marginBottom: '16px',
    lineHeight: '1.6',
  },
  inputRow: { display: 'flex', gap: '8px', marginBottom: '12px' },
  input: {
    flex: 1,
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    padding: '6px 10px',
    outline: 'none',
  },
  select: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    padding: '6px 10px',
    outline: 'none',
  },
  scanBtn: {
    background: 'var(--btn-primary-bg)',
    color: 'var(--btn-primary-text)',
    border: '1px solid var(--border)',
    padding: '4px 12px',
    fontFamily: 'var(--font)',
    fontSize: '11px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    whiteSpace: 'nowrap',
  },
  stopBtn: {
    background: 'none',
    color: 'var(--severity-critical)',
    border: '1px solid var(--severity-critical)',
    padding: '4px 12px',
    fontFamily: 'var(--font)',
    fontSize: '11px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    whiteSpace: 'nowrap',
  },
  error: { color: 'var(--severity-critical)', fontSize: '13px', marginTop: '12px' },
  livePanel: {
    marginTop: '20px',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
  },
  livePanelHeader: {
    padding: '8px 14px',
    borderBottom: '1px solid var(--border)',
    fontSize: '10px',
    color: 'var(--text-muted)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  pulse: {
    width: '7px',
    height: '7px',
    background: 'var(--severity-low)',
    flexShrink: 0,
  },
  analyzing: {
    width: '7px',
    height: '7px',
    background: 'var(--accent-amber)',
    flexShrink: 0,
  },
  liveOutput: {
    padding: '12px 14px',
    fontFamily: 'var(--font)',
    fontSize: '11px',
    color: 'var(--text-muted)',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    maxHeight: '300px',
    overflowY: 'auto',
    lineHeight: '1.6',
  },
  results: { marginTop: '24px' },
  summaryCard: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    padding: '20px',
    marginBottom: '16px',
  },
  riskRow: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' },
  badge: (level) => ({
    display: 'inline-block',
    padding: '4px 12px',
    border: `1px solid ${RISK_COLORS[level] || 'var(--border)'}`,
    color: RISK_COLORS[level] || 'var(--text-muted)',
    fontSize: '12px',
    
    textTransform: 'uppercase',
  }),
  targetLabel: { color: 'var(--text-muted)', fontSize: '12px' },
  summaryText: { color: 'var(--text-primary)', fontSize: '14px', lineHeight: '1.6', marginBottom: '16px' },
  label: {
    color: 'var(--text-muted)',
    fontSize: '10px',
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
    padding: '16px',
    fontFamily: 'var(--font)',
    fontSize: '11px',
    color: 'var(--text-muted)',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    maxHeight: '400px',
    overflowY: 'auto',
  },
  toggleBtn: {
    background: 'none',
    border: '1px solid var(--border)',
    color: 'var(--text-muted)',
    padding: '8px 16px',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    marginBottom: '8px',
  },
};

export default function NetworkScanner() {
  const { getAccessTokenSilently } = useAuth0();
  const isMobile = useIsMobile();
  const [target, setTarget] = useState('');
  const [scanType, setScanType] = useState('quick');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [liveLines, setLiveLines] = useState([]);
  const [error, setError] = useState(null);
  const [showRaw, setShowRaw] = useState(false);
  const scanIdRef = useRef(null);
  const esRef = useRef(null);
  const outputRef = useRef(null);
  const { push } = useWorkspace();

  useEffect(() => {
    try {
      const restore = JSON.parse(localStorage.getItem('workspace-restore-network-scanner') || 'null');
      if (restore) {
        setTarget(restore.target || '');
        setResult(restore);
        localStorage.removeItem('workspace-restore-network-scanner');
      }
    } catch {}
  }, []);

  // Auto-scroll live output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [liveLines]);

  async function handleScan() {
    if (!target.trim()) return;

    setLoading(true);
    setAnalyzing(false);
    setError(null);
    setResult(null);
    setLiveLines([]);
    setShowRaw(false);
    scanIdRef.current = null;

    // Step 1 — initiate scan, get scanId
    let scanId;
    try {
      const token = await getAccessTokenSilently();
      const res = await fetch('/api/tools/network-scanner/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ target: target.trim(), scanType }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to start scan.');
        setLoading(false);
        return;
      }
      scanId = data.scanId;
      scanIdRef.current = scanId;
    } catch {
      setError('Network error. Is the server running?');
      setLoading(false);
      return;
    }

    // Step 2 — open SSE stream (EventSource can't send headers, token goes in query param)
    const streamToken = await getAccessTokenSilently();
    const es = new EventSource(`/api/tools/network-scanner/scan-stream/${scanId}?token=${encodeURIComponent(streamToken)}`);
    esRef.current = es;

    es.addEventListener('line', e => {
      const { line } = JSON.parse(e.data);
      setLiveLines(prev => [...prev, line]);
    });

    es.addEventListener('analyzing', () => {
      setAnalyzing(true);
    });

    es.addEventListener('done', e => {
      const data = JSON.parse(e.data);
      setResult(data);
      setLoading(false);
      setAnalyzing(false);
      push('network-scanner', `${data.scanType}: ${data.target}`, data, 'network-scanner');
      es.close();
      esRef.current = null;
    });

    es.addEventListener('cancelled', () => {
      setLoading(false);
      setAnalyzing(false);
      setError('Scan stopped.');
      es.close();
      esRef.current = null;
    });

    es.addEventListener('error', e => {
      try {
        const data = JSON.parse(e.data);
        setError(data.error || 'Scan error.');
      } catch {
        // SSE connection error (e.g. server closed) — only show if still loading
        setError(prev => prev || null);
      }
      setLoading(false);
      setAnalyzing(false);
      es.close();
      esRef.current = null;
    });
  }

  async function handleStop() {
    // Close the SSE connection (server will detect close and kill nmap)
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    // Belt-and-suspenders: also hit cancel endpoint
    if (scanIdRef.current) {
      try {
        const token = await getAccessTokenSilently().catch(() => '');
      await fetch(`/api/tools/network-scanner/cancel/${scanIdRef.current}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      } catch {}
      scanIdRef.current = null;
    }
    setLoading(false);
    setAnalyzing(false);
    setError('Scan stopped.');
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Network Scanner</span>
        <p style={styles.subtitle}>
          Run nmap scans against a target. Only scan hosts and networks you own or have explicit authorization to test.
        </p>
      </div>

      <div style={styles.warning}>
        ⚠ Only scan targets you own or have explicit written authorization to test. Unauthorized scanning is illegal in most jurisdictions.
      </div>

      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
          <input
            style={{ ...styles.input, width: '100%', boxSizing: 'border-box' }}
            placeholder="192.168.1.1, 192.168.1.0/24, or hostname"
            value={target}
            onChange={e => setTarget(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !loading && target.trim() && handleScan()}
            disabled={loading}
          />
          <select
            style={{ ...styles.select, width: '100%', boxSizing: 'border-box' }}
            value={scanType}
            onChange={e => setScanType(e.target.value)}
            disabled={loading}
          >
            {SCAN_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          {loading ? (
            <button style={{ ...styles.stopBtn, width: '100%' }} onClick={handleStop}>Stop</button>
          ) : (
            <button style={{ ...styles.scanBtn, width: '100%' }} onClick={handleScan} disabled={!target.trim()}>
              Scan
            </button>
          )}
        </div>
      ) : (
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
          {loading ? (
            <button style={styles.stopBtn} onClick={handleStop}>Stop</button>
          ) : (
            <button style={styles.scanBtn} onClick={handleScan} disabled={!target.trim()}>
              Scan
            </button>
          )}
        </div>
      )}

      {error && <p style={styles.error}>{error}</p>}

      {/* Live output panel — visible while scanning */}
      {(loading || liveLines.length > 0) && !result && (
        <div style={styles.livePanel}>
          <div style={styles.livePanelHeader}>
            {analyzing ? (
              <><div style={styles.analyzing} />Analyzing with Claude...</>
            ) : (
              <><div style={styles.pulse} />Live output</>
            )}
          </div>
          <div style={styles.liveOutput} ref={outputRef}>
            {liveLines.join('\n')}
          </div>
        </div>
      )}

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
              <button style={styles.toggleBtn} onClick={() => setShowRaw(v => !v)}>
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
