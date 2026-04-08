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

const styles = {
  container: { padding: 0 },
  header: {
    margin: '-24px -24px 0 -24px',
    padding: '12px 20px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  title: { fontSize: '13px', color: 'var(--text-primary)', letterSpacing: '0.02em', margin: 0, fontWeight: 'normal' },
  subtitle: { color: 'var(--text-muted)', fontSize: '11px', margin: 0 },
  tabs: { display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', margin: '0 -24px', paddingLeft: '8px', marginBottom: '20px' },
  tab: (active) => ({
    background: active ? 'var(--btn-primary-bg)' : 'var(--bg-surface)',
    color: active ? 'var(--btn-primary-text)' : 'var(--text-muted)',
    border: '1px solid var(--border)',
    padding: '6px 14px',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    cursor: 'pointer',
  }),
  controlRow: { display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' },
  select: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    padding: '6px 10px',
    outline: 'none',
  },
  button: (loading) => ({
    background: loading ? 'var(--bg-surface)' : 'var(--btn-primary-bg)',
    color: loading ? 'var(--text-muted)' : 'var(--btn-primary-text)',
    border: '1px solid var(--border)',
    padding: '8px 20px',
    fontFamily: 'var(--font)',
    fontSize: '11px',
    cursor: loading ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
  }),
  textarea: {
    width: '100%',
    minHeight: '200px',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    padding: '6px 10px',
    outline: 'none',
    resize: 'vertical',
    boxSizing: 'border-box',
  },
  uploadBox: {
    border: '1px dashed var(--border)',
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
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    padding: '20px',
    marginBottom: '16px',
  },
  threatRow: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' },
  badge: (level) => ({
    display: 'inline-block',
    padding: '4px 12px',
    border: `1px solid ${SEVERITY_COLORS[level] || 'var(--border)'}`,
    color: SEVERITY_COLORS[level] || 'var(--text-muted)',
    fontSize: '12px',
    
    textTransform: 'uppercase',
  }),
  logTypeLabel: { color: 'var(--text-muted)', fontSize: '12px' },
  summaryText: { color: 'var(--text-primary)', fontSize: '14px', lineHeight: '1.6', marginBottom: '16px' },
  label: {
    color: 'var(--text-muted)',
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '6px',
  },
  sectionBlock: { marginBottom: '16px' },
  threatCard: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    padding: '6px 10px',
    marginBottom: '8px',
  },
  threatHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' },
  threatType: { color: 'var(--text-primary)', fontSize: '13px',  },
  threatDetail: { color: 'var(--text-muted)', fontSize: '12px', lineHeight: '1.5' },
  listItem: { padding: '5px 0', color: 'var(--text-primary)', fontSize: '13px', borderBottom: '1px solid var(--border)' },
  flagItem: { padding: '5px 0', color: 'var(--severity-high)', fontSize: '13px', borderBottom: '1px solid var(--border)' },
  ipChips: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
  ipChip: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--severity-high)',
    color: 'var(--severity-high)',
    padding: '3px 10px',
    fontSize: '12px',
  },
};

const LOG_TYPES = [
  { value: 'auto', label: 'Auto-detect' },
  { value: 'firewall', label: 'Firewall Log' },
  { value: 'netflow', label: 'NetFlow' },
  { value: 'zeek', label: 'Zeek' },
  { value: 'suricata', label: 'Suricata' },
  { value: 'pcap-summary', label: 'PCAP Summary' },
  { value: 'syslog', label: 'Syslog' },
  { value: 'other', label: 'Other' },
];

export default function NetworkThreatAnalyzer() {
  const isMobile = useIsMobile();
  const { getAccessTokenSilently } = useAuth0();
  const [tab, setTab] = useState('paste');
  const [logData, setLogData] = useState('');
  const [logType, setLogType] = useState('auto');
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const { push } = useWorkspace();

  useEffect(() => {
    try {
      const restore = JSON.parse(localStorage.getItem('workspace-restore-network-threat-analyzer') || 'null');
      if (restore) { setResult(restore); localStorage.removeItem('workspace-restore-network-threat-analyzer'); }
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
        res = await fetch('/api/tools/network-threat-analyzer/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ logData, logType }),
        });
      } else {
        const form = new FormData();
        form.append('file', file);
        form.append('logType', logType);
        res = await fetch('/api/tools/network-threat-analyzer/analyze-file', {
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
        push('network-threat-analyzer', `Network Log — ${data.logType}`, data, 'network-threat-analyzer');
      }
    } catch {
      setError('Network error. Is the server running?');
    } finally {
      setLoading(false);
    }
  }

  const canAnalyze = !loading && (tab === 'paste' ? logData.trim().length > 0 : file !== null);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Network Threat Analyzer</span>
        <p style={styles.subtitle}>
          Paste or upload firewall logs, NetFlow, Zeek, Suricata, or syslog data. Claude analyzes for threats, anomalies, and suspicious activity.
        </p>
      </div>

      <div style={styles.tabs}>
        <button style={styles.tab(tab === 'paste')} onClick={() => setTab('paste')}>Paste Logs</button>
        <button style={styles.tab(tab === 'upload')} onClick={() => setTab('upload')}>Upload File</button>
      </div>

      <div style={{ ...styles.controlRow, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
        <select style={isMobile ? { ...styles.select, width: '100%' } : styles.select} value={logType} onChange={e => setLogType(e.target.value)} disabled={loading}>
          {LOG_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <button style={styles.button(loading)} onClick={handleAnalyze} disabled={!canAnalyze}>
          {loading ? 'Analyzing...' : 'Analyze'}
        </button>
      </div>

      {tab === 'paste' ? (
        <textarea
          style={styles.textarea}
          placeholder={`Paste log data here...\n\nExamples:\n  Apr 29 10:23:01 fw kernel: IN=eth0 SRC=1.2.3.4 DST=10.0.0.1 PROTO=TCP DPT=22\n  {"timestamp":"2024-01-01","src_ip":"192.168.1.5","dst_port":443,"bytes":15000}\n  conn.log: 1234567890 CxYz1 1.2.3.4 4567 10.0.0.1 80 tcp ...`}
          value={logData}
          onChange={e => setLogData(e.target.value)}
          disabled={loading}
        />
      ) : (
        <>
          <div
            style={styles.uploadBox}
            onClick={() => fileInputRef.current?.click()}
          >
            Click to select a log file (.log, .txt, .csv, .json, .pcap, .cap) — max 500kb
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".log,.txt,.csv,.json,.pcap,.cap"
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
            <div style={styles.threatRow}>
              <div style={styles.badge(result.threatLevel)}>{result.threatLevel} threat</div>
              <span style={styles.logTypeLabel}>log type: {result.logType}</span>
            </div>

            <div style={styles.summaryText}>{result.summary}</div>

            {result.threats?.length > 0 && (
              <div style={styles.sectionBlock}>
                <div style={styles.label}>Detected Threats</div>
                {result.threats.map((threat, i) => (
                  <div key={i} style={styles.threatCard}>
                    <div style={styles.threatHeader}>
                      <span style={styles.threatType}>{threat.type}</span>
                      <span style={styles.badge(threat.severity)}>{threat.severity}</span>
                    </div>
                    <div style={styles.threatDetail}>
                      {threat.source && <span>Src: {threat.source} </span>}
                      {threat.destination && <span>Dst: {threat.destination} </span>}
                      {threat.detail && <div>{threat.detail}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {result.anomalies?.length > 0 && (
              <div style={styles.sectionBlock}>
                <div style={styles.label}>Anomalies</div>
                {result.anomalies.map((a, i) => (
                  <div key={i} style={styles.flagItem}>⚠ {a}</div>
                ))}
              </div>
            )}

            {result.suspiciousIPs?.length > 0 && (
              <div style={styles.sectionBlock}>
                <div style={styles.label}>Suspicious IPs</div>
                <div style={styles.ipChips}>
                  {result.suspiciousIPs.map((ip, i) => (
                    <span key={i} style={styles.ipChip}>{ip}</span>
                  ))}
                </div>
              </div>
            )}

            {result.recommendations?.length > 0 && (
              <div style={styles.sectionBlock}>
                <div style={styles.label}>Recommendations</div>
                {result.recommendations.map((rec, i) => (
                  <div key={i} style={styles.listItem}>{i + 1}. {rec}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
