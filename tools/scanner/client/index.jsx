import { useState, useEffect, useRef } from 'react';
import { useWorkspace } from '../../../platform/shell/src/context/WorkspaceContext.jsx';
import { useIsMobile } from '../../../platform/shell/src/hooks/useIsMobile.js';
import { Button, Input, EmptyState } from '../../../platform/shell/src/components/ui/index.js';
import DesktopOnly from '../../../platform/shell/src/components/DesktopOnly.jsx';
import { ShieldCheck } from 'lucide-react';

const isElectron = typeof window !== 'undefined' && window.electron?.isElectron === true;

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];
const SEVERITY_COLOR = {
  critical: 'var(--severity-critical)',
  high: 'var(--severity-high)',
  medium: 'var(--severity-medium)',
  low: 'var(--severity-low)',
  info: 'var(--severity-info)',
};

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
  title: { fontSize: '13px', color: 'var(--text-primary)', letterSpacing: '0.02em', margin: 0, fontWeight: 'normal', fontFamily: 'var(--font-display)' },
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
  label: { color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px', display: 'block' },
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
    padding: '6px 10px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    minWidth: '200px',
  }),
  modeTitle: { color: 'var(--text-primary)', fontSize: '13px',  marginBottom: '4px' },
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
  authText: { color: 'var(--text-primary)', fontSize: '12px', lineHeight: '1.5', fontWeight: 'normal' },
  error: { color: 'var(--severity-critical)', fontSize: '13px', marginBottom: '12px' },
  results: { marginTop: '24px' },
  analysisCard: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    padding: '16px',
    marginBottom: '20px',
  },
  analysisHeader: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' },
  analysisTitle: { color: 'var(--text-primary)', fontSize: '14px',  },
  riskBadge: (level) => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: SEVERITY_COLOR[level] || SEVERITY_COLOR.info,
    color: '#fff',
    fontSize: '10px',
    padding: '2px 8px',
    textTransform: 'uppercase',
  }),
  summary: { color: 'var(--text-primary)', fontSize: '13px', lineHeight: '1.6', marginBottom: '10px' },
  listLabel: { color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px', marginTop: '10px' },
  listItem: { color: 'var(--text-primary)', fontSize: '12px', lineHeight: '1.7', marginLeft: '12px' },
  statsRow: { display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' },
  statBadge: (sev) => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: SEVERITY_COLOR[sev],
    color: '#fff',
    fontSize: '12px',
    padding: '3px 10px',
  }),
  findingCard: (sev) => ({
    background: 'var(--bg-surface)',
    border: `1px solid ${SEVERITY_COLOR[sev]}`,
    padding: '12px 14px',
    marginBottom: '8px',
  }),
  findingTitle: { color: 'var(--text-primary)', fontSize: '13px',  marginBottom: '4px' },
  findingDetail: { color: 'var(--text-muted)', fontSize: '12px', lineHeight: '1.5' },
  severityChip: (sev) => ({
    display: 'inline-block',
    background: SEVERITY_COLOR[sev],
    color: '#fff',
    fontSize: '10px',
    padding: '1px 6px',
    textTransform: 'uppercase',
    marginRight: '8px',
  }),
  groupHeader: { color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px', marginTop: '16px' },
  emptyState: { color: 'var(--text-muted)', fontSize: '13px', padding: '20px 0' },
};

export default function Scanner() {
  const isMobile = useIsMobile();
  const [url, setUrl] = useState('');
  const [activeMode, setActiveMode] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [findings, setFindings] = useState([]); // streamed live
  const [risk, setRisk] = useState(null);        // rule-based summary, set on done
  const [mode, setMode] = useState('passive');
  const [scanUrl, setScanUrl] = useState('');
  const [started, setStarted] = useState(false);
  const runIdRef = useRef(null);
  const { push } = useWorkspace();

  useEffect(() => {
    try {
      const imp = JSON.parse(localStorage.getItem('payload-generator-import') || 'null');
      if (imp?.target === 'scanner' && imp?.payload) {
        setUrl(imp.payload);
        localStorage.removeItem('payload-generator-import');
      }
    } catch {}
  }, []);

  // Subscribe to local vuln-scanner IPC events (desktop app only). Dispatch by runId.
  useEffect(() => {
    if (!isElectron) return;
    const offFinding = window.electron.vulnScanner.onFinding((d) => {
      if (d.runId !== runIdRef.current) return;
      const { runId, ...f } = d;
      setFindings(prev => [...prev, f]);
    });
    const offDone = window.electron.vulnScanner.onDone((d) => {
      if (d.runId !== runIdRef.current) return;
      setFindings(d.findings);
      setRisk(d.risk);
      setMode(d.mode);
      setLoading(false);
      runIdRef.current = null;
      push('scanner', `Scan: ${d.url} (${d.findings.length} findings)`,
        { url: d.url, findings: d.findings, risk: d.risk }, 'scanner');
    });
    const offError = window.electron.vulnScanner.onError((d) => {
      if (d.runId !== runIdRef.current) return;
      setError(d.error);
      setLoading(false);
      runIdRef.current = null;
    });
    return () => { offFinding?.(); offDone?.(); offError?.(); };
  }, []);

  async function handleScan() {
    setLoading(true);
    setError(null);
    setFindings([]);
    setRisk(null);
    setStarted(true);
    setScanUrl(url.trim());
    setMode(activeMode ? 'active' : 'passive');
    runIdRef.current = null;

    const out = await window.electron.vulnScanner.start({ url: url.trim(), activeMode, authorized });
    if (out.error) {
      setError(out.error);
      setLoading(false);
      return;
    }
    runIdRef.current = out.runId;
  }

  async function handleStop() {
    if (runIdRef.current) await window.electron.vulnScanner.cancel(runIdRef.current);
  }

  const canScan = !loading && url.trim().length > 0 && (!activeMode || authorized);

  const findingsBySeverity = SEVERITY_ORDER.reduce((acc, sev) => {
    const group = findings.filter(f => f.severity === sev);
    if (group.length > 0) acc[sev] = group;
    return acc;
  }, {});

  const severityCounts = SEVERITY_ORDER.reduce((acc, sev) => {
    const count = findings.filter(f => f.severity === sev).length;
    if (count > 0) acc[sev] = count;
    return acc;
  }, {});

  if (!isElectron) return <DesktopOnly toolName="Vulnerability Scanner" downloadUrl="https://0xkudo.com/download" />;

  return (
    <div style={styles.container}>
      <div style={{ ...styles.header, margin: isMobile ? '-16px -16px 20px -16px' : '-24px -24px 20px -24px' }}>
        <span style={styles.title}>Vulnerability Scanner</span>
        <p style={styles.subtitle}>
          Passive: checks headers, cookies, forms, and info leakage. Active: probes inputs with XSS and SQLi payloads.
        </p>
      </div>

      <div style={styles.section}>
        <span style={styles.label}>Target URL</span>
        <div style={{ ...styles.inputRow, flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : undefined }}>
          <Input
            style={isMobile ? { width: '100%', minWidth: 0 } : { flex: 1, minWidth: '280px' }}
            placeholder="https://example.com"
            value={url}
            onChange={e => setUrl(e.target.value)}
            disabled={loading}
            onKeyDown={e => e.key === 'Enter' && canScan && handleScan()}
          />
          {loading ? (
            <Button variant="danger" onClick={handleStop}>Stop</Button>
          ) : (
            <Button onClick={handleScan} disabled={!canScan}>Scan</Button>
          )}
        </div>
      </div>

      <div style={styles.section}>
        <span style={styles.label}>Scan Mode</span>
        <div style={{ ...styles.modeRow, flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : undefined }}>
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

      {started && (
        <div style={styles.results}>
          {/* Risk summary (rule-based, populated on completion) */}
          <div style={styles.analysisCard}>
            <div style={styles.analysisHeader}>
              <span style={styles.analysisTitle}>Risk Summary</span>
              {risk?.riskLevel && (
                <span style={styles.riskBadge(risk.riskLevel)}>{risk.riskLevel}</span>
              )}
              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                {mode === 'active' ? 'Active scan' : 'Passive scan'}: {findings.length} finding{findings.length !== 1 ? 's' : ''}
                {loading ? ' (scanning…)' : ''}
              </span>
            </div>
            {risk?.summary && (
              <p style={styles.summary}>{risk.summary}</p>
            )}
            {risk?.topPriorities?.length > 0 && (
              <>
                <div style={styles.listLabel}>Top Priorities</div>
                {risk.topPriorities.map((p, i) => (
                  <div key={i} style={styles.listItem}>• {p}</div>
                ))}
              </>
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

          {/* Findings grouped by severity — stream in live */}
          {findings.length === 0 ? (
            <EmptyState icon={<ShieldCheck size={24} />} text={loading ? 'Scanning…' : 'No issues found.'} />
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
