import { useState, useEffect, useRef } from 'react';
import { useWorkspace } from '../../../platform/shell/src/context/WorkspaceContext.jsx';
import { useIsMobile } from '../../../platform/shell/src/hooks/useIsMobile.js';
import { Button, Input, AuthGate } from '../../../platform/shell/src/components/ui/index.js';
import DesktopOnly from '../../../platform/shell/src/components/DesktopOnly.jsx';

const isElectron = typeof window !== 'undefined' && window.electron?.isElectron === true;

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
    background: 'rgba(239,68,68,0.08)',
    border: '1px solid var(--severity-critical)',
    padding: '10px 14px',
    color: 'var(--severity-critical)',
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
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    padding: '20px',
    marginBottom: '16px',
  },
  riskRow: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' },
  badge: (level) => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
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
        fontSize: '12px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    marginBottom: '8px',
  },
};

export default function NetworkScanner() {
  const isMobile = useIsMobile();
  const [target, setTarget] = useState('');
  const [scanType, setScanType] = useState('quick');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [liveLines, setLiveLines] = useState([]);
  const [error, setError] = useState(null);
  const [authorized, setAuthorized] = useState(false);
  const [nmapMissing, setNmapMissing] = useState(false);
  const runIdRef = useRef(null);
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

  // Subscribe to local nmap IPC events (desktop app only)
  useEffect(() => {
    if (!isElectron) return;
    window.electron.networkScanner.onLine(({ runId, line }) => {
      if (runId !== runIdRef.current) return;
      setLiveLines(prev => [...prev, line]);
    });
    window.electron.networkScanner.onDone((data) => {
      if (data.runId !== runIdRef.current) return;
      setResult(data);
      setLoading(false);
      push('network-scanner', `${data.scanType}: ${data.target}`, data, 'network-scanner');
      runIdRef.current = null;
    });
    window.electron.networkScanner.onError(({ runId, error: err }) => {
      if (runId !== runIdRef.current) return;
      setError(err);
      setLoading(false);
      runIdRef.current = null;
    });
  }, []);

  async function handleScan() {
    // Require the authorization agreement before any scan fires.
    if (!target.trim() || !authorized) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setLiveLines([]);
    runIdRef.current = null;

    // nmap must be present on this machine
    const nmapState = await window.electron.nmap.status();
    if (!nmapState.installed) {
      setNmapMissing(true);
      setLoading(false);
      return;
    }
    setNmapMissing(false);

    const out = await window.electron.networkScanner.start(target.trim(), scanType);
    if (out.error) {
      setError(out.error);
      setLoading(false);
      return;
    }
    runIdRef.current = out.runId;
  }

  async function handleStop() {
    if (runIdRef.current) {
      await window.electron.networkScanner.cancel(runIdRef.current);
      runIdRef.current = null;
    }
    setLoading(false);
    setError('Scan stopped.');
  }

  if (!isElectron) return <DesktopOnly toolName="Network Scanner" downloadUrl="https://0xkudo.com/download" />;

  return (
    <div style={styles.container}>
      <div style={{ ...styles.header, margin: isMobile ? '-16px -16px 20px -16px' : '-24px -24px 20px -24px' }}>
        <span style={styles.title}>Network Scanner</span>
        <p style={styles.subtitle}>
          Run nmap scans against a target. Only scan hosts and networks you own or have explicit authorization to test.
        </p>
      </div>

      <div style={styles.warning}>
        ⚠ Only scan targets you own or have explicit written authorization to test. Unauthorized scanning may be illegal in your jurisdiction.
      </div>

      <div style={{ marginBottom: '14px' }}>
        <AuthGate checked={authorized} onChange={setAuthorized} disabled={loading} />
      </div>

      {nmapMissing && (
        <div style={styles.warning}>
          nmap is required for Network Scanner and was not found on this machine.
          <div style={{ marginTop: 8 }}>
            <Button onClick={async () => { const r = await window.electron.nmap.install(); if (r.ok) setNmapMissing(false); }}>
              Install nmap
            </Button>
          </div>
        </div>
      )}

      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
          <Input
            style={{ width: '100%' }}
            placeholder="192.168.1.1, 192.168.1.0/24, or hostname"
            value={target}
            onChange={e => setTarget(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !loading && target.trim() && authorized && handleScan()}
            disabled={loading}
          />
          <select
            className="kudo-input kudo-select" style={{ alignSelf: 'flex-start' }}
            value={scanType}
            onChange={e => setScanType(e.target.value)}
            disabled={loading}
          >
            {SCAN_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          {loading ? (
            <Button variant="danger" style={{ alignSelf: 'flex-start' }} onClick={handleStop}>Stop</Button>
          ) : (
            <Button style={{ alignSelf: 'flex-start' }} onClick={handleScan} disabled={!target.trim() || !authorized}>Scan</Button>
          )}
        </div>
      ) : (
        <div style={styles.inputRow}>
          <Input
            style={{ flex: 1 }}
            placeholder="192.168.1.1, 192.168.1.0/24, or hostname"
            value={target}
            onChange={e => setTarget(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !loading && target.trim() && authorized && handleScan()}
            disabled={loading}
          />
          <select
            className="kudo-input kudo-select"
            value={scanType}
            onChange={e => setScanType(e.target.value)}
            disabled={loading}
          >
            {SCAN_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          {loading ? (
            <Button variant="danger" onClick={handleStop}>Stop</Button>
          ) : (
            <Button onClick={handleScan} disabled={!target.trim() || !authorized}>Scan</Button>
          )}
        </div>
      )}

      {error && <p style={styles.error}>{error}</p>}

      {result && (
        <div style={styles.summaryCard}>
          <div style={styles.riskRow}>
            <span style={styles.targetLabel}>{result.scanLabel}: {result.target}</span>
          </div>
        </div>
      )}

      {/* Output panel: streams live as nmap runs, and stays visible after completion */}
      {(loading || liveLines.length > 0 || result?.rawOutput) && (
        <div style={styles.livePanel}>
          <div style={styles.livePanelHeader}>
            {loading ? <><div style={styles.pulse} />Live output</> : 'Output'}
          </div>
          <div style={styles.liveOutput} ref={outputRef}>
            {result?.rawOutput || liveLines.join('\n')}
          </div>
        </div>
      )}

    </div>
  );
}
