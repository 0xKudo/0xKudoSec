import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useWorkspace } from '../../../platform/shell/src/context/WorkspaceContext.jsx';
import { useIsMobile } from '../../../platform/shell/src/hooks/useIsMobile.js';

const THREAT_COLORS = {
  critical: 'var(--severity-critical)',
  high: 'var(--severity-high)',
  medium: 'var(--severity-medium)',
  low: 'var(--severity-low)',
  unknown: 'var(--text-muted)',
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
  title: { fontSize: '13px', color: 'var(--text-primary)', letterSpacing: '0.02em', margin: 0 },
  subtitle: { color: 'var(--text-muted)', fontSize: '11px', margin: 0 },
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
  button: (loading) => ({
    background: loading ? 'var(--bg-surface)' : 'var(--btn-primary-bg)',
    color: loading ? 'var(--text-muted)' : 'var(--btn-primary-text)',
    border: '1px solid var(--border)',
    padding: '4px 12px',
    fontFamily: 'var(--font)',
    fontSize: '11px',
    cursor: loading ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
  }),
  error: { color: 'var(--severity-critical)', fontSize: '13px', marginTop: '12px' },
  results: { marginTop: '24px' },
  summaryCard: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    padding: '20px',
    marginBottom: '16px',
  },
  threatRow: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' },
  threatBadge: (level) => ({
    display: 'inline-block',
    padding: '4px 12px',
    border: `1px solid ${THREAT_COLORS[level] || 'var(--border)'}`,
    color: THREAT_COLORS[level] || 'var(--text-muted)',
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
  flagItem: { padding: '5px 0', color: 'var(--severity-high)', fontSize: '13px', borderBottom: '1px solid var(--border)' },
  actionItem: { padding: '5px 0', color: 'var(--text-primary)', fontSize: '13px', borderBottom: '1px solid var(--border)' },
  sourcesGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  sourceCard: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    padding: '16px',
  },
  sourceTitle: {
    color: 'var(--text-primary)',
    fontSize: '11px',
    marginBottom: '10px',
    paddingBottom: '8px',
    borderBottom: '1px solid var(--border)',
  },
  sourceRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 0',
    fontSize: '12px',
    borderBottom: '1px solid var(--border)',
    gap: '8px',
  },
  sourceKey: { color: 'var(--text-muted)', flexShrink: 0 },
  sourceVal: { color: 'var(--text-primary)', textAlign: 'right', wordBreak: 'break-all' },
  errorText: { color: 'var(--severity-critical)', fontSize: '12px' },
  skippedText: { color: 'var(--text-muted)', fontSize: '12px', fontStyle: 'italic' },
  subLabel: { color: 'var(--text-muted)', fontSize: '10px', marginTop: '8px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' },
  iocItem: { padding: '4px 0', fontSize: '12px', color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' },
};

function SourceRow({ label, value }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div style={styles.sourceRow}>
      <span style={styles.sourceKey}>{label}</span>
      <span style={styles.sourceVal}>{String(value)}</span>
    </div>
  );
}

function SourceCard({ title, data }) {
  if (!data) return null;
  if (data.error) return (
    <div style={styles.sourceCard}>
      <div style={styles.sourceTitle}>{title}</div>
      <div style={styles.errorText}>Error: {data.error}</div>
    </div>
  );
  if (data.skipped && !data.ip_str && !data.abuseConfidenceScore) return (
    <div style={styles.sourceCard}>
      <div style={styles.sourceTitle}>{title}</div>
      {data.ip_str && <SourceRow label="Resolved IP" value={data.ip_str} />}
      <div style={styles.skippedText}>{data.skipped}</div>
    </div>
  );

  const renderContent = () => {
    switch (title) {
      case 'AbuseIPDB':
        return <>
          <SourceRow label="IP" value={data.ipAddress} />
          <SourceRow label="Abuse Score" value={data.abuseConfidenceScore !== undefined ? `${data.abuseConfidenceScore}%` : undefined} />
          <SourceRow label="Total Reports" value={data.totalReports} />
          <SourceRow label="Last Reported" value={data.lastReportedAt} />
          <SourceRow label="ISP" value={data.isp} />
          <SourceRow label="Usage Type" value={data.usageType} />
          <SourceRow label="Country" value={data.countryCode} />
          <SourceRow label="Tor Exit Node" value={data.isTor !== undefined ? String(data.isTor) : undefined} />
          {data.recentReports?.length > 0 && <>
            <div style={styles.subLabel}>Recent Reports</div>
            {data.recentReports.map((r, i) => (
              <div key={i} style={styles.iocItem}>{r.reportedAt?.slice(0, 10)} — {r.comment || 'No comment'}</div>
            ))}
          </>}
        </>;
      case 'VirusTotal':
        return <>
          <SourceRow label="Reputation" value={data.reputation} />
          <SourceRow label="Malicious" value={data.lastAnalysisStats?.malicious} />
          <SourceRow label="Suspicious" value={data.lastAnalysisStats?.suspicious} />
          <SourceRow label="Harmless" value={data.lastAnalysisStats?.harmless} />
          <SourceRow label="Undetected" value={data.lastAnalysisStats?.undetected} />
          <SourceRow label="Name" value={data.meaningfulName} />
          <SourceRow label="Type" value={data.typeDescription} />
          {data.tags?.length > 0 && <SourceRow label="Tags" value={data.tags.join(', ')} />}
        </>;
      case 'Shodan':
        return <>
          <SourceRow label="IP" value={data.ip_str} />
          <SourceRow label="Organization" value={data.org} />
          <SourceRow label="OS" value={data.os} />
          <SourceRow label="Open Ports" value={data.ports?.join(', ')} />
          <SourceRow label="Vulns" value={data.vulns?.join(', ')} />
          {data.skipped && <div style={styles.skippedText}>{data.skipped}</div>}
        </>;
      case 'IPInfo':
        return <>
          <SourceRow label="IP" value={data.ip} />
          <SourceRow label="Hostname" value={data.hostname} />
          <SourceRow label="Location" value={[data.city, data.region, data.country].filter(Boolean).join(', ')} />
          <SourceRow label="Organization" value={data.org} />
          <SourceRow label="Timezone" value={data.timezone} />
        </>;
      case 'ThreatFox':
        return <>
          <SourceRow label="Matches" value={data.matchCount} />
          {data.iocs?.length > 0 && <>
            <div style={styles.subLabel}>Top IOCs</div>
            {data.iocs.map((ioc, i) => (
              <div key={i} style={styles.iocItem}>
                {ioc.malwarePrintable || 'Unknown'} — Confidence: {ioc.confidence}% ({ioc.firstSeen?.slice(0, 10)})
              </div>
            ))}
          </>}
          {data.skipped && <div style={styles.skippedText}>{data.skipped}</div>}
        </>;
      case 'URLhaus':
        return <>
          <SourceRow label="Status" value={data.queryStatus} />
          <SourceRow label="URLs Found" value={data.urlsCount} />
          {data.blacklists && <>
            <SourceRow label="SURBL" value={data.blacklists.surbl} />
            <SourceRow label="GSBE" value={data.blacklists.gsb} />
          </>}
          {data.urls?.length > 0 && <>
            <div style={styles.subLabel}>Recent URLs</div>
            {data.urls.map((u, i) => (
              <div key={i} style={styles.iocItem}>{u.urlStatus} — {u.threat} ({u.dateAdded?.slice(0, 10)})</div>
            ))}
          </>}
          {data.skipped && <div style={styles.skippedText}>{data.skipped}</div>}
        </>;
      case 'MalwareBazaar':
        return <>
          <SourceRow label="File Name" value={data.fileName} />
          <SourceRow label="File Type" value={data.fileType} />
          <SourceRow label="File Size" value={data.fileSize ? `${data.fileSize} bytes` : undefined} />
          <SourceRow label="Signature" value={data.signature} />
          <SourceRow label="First Seen" value={data.firstSeen} />
          <SourceRow label="Last Seen" value={data.lastSeen} />
          {data.tags?.length > 0 && <SourceRow label="Tags" value={data.tags.join(', ')} />}
          {data.malwareFamilies?.length > 0 && <SourceRow label="Detections" value={[...new Set(data.malwareFamilies)].slice(0, 5).join(', ')} />}
          {data.skipped && <div style={styles.skippedText}>{data.skipped}</div>}
        </>;
      default:
        return <div style={styles.skippedText}>No data</div>;
    }
  };

  return (
    <div style={styles.sourceCard}>
      <div style={styles.sourceTitle}>{title}</div>
      {renderContent()}
    </div>
  );
}

export default function ThreatIntelTool() {
  const isMobile = useIsMobile();
  const { getAccessTokenSilently } = useAuth0();
  const [indicator, setIndicator] = useState('');
  const [indicatorType, setIndicatorType] = useState('auto');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { push } = useWorkspace();

  useEffect(() => {
    try {
      const restore = JSON.parse(localStorage.getItem('workspace-restore-threat-intel') || 'null');
      if (restore) {
        setIndicator(restore.indicator || '');
        setResult(restore);
        localStorage.removeItem('workspace-restore-threat-intel');
      }
    } catch {}
  }, []);

  async function handleAnalyze() {
    if (!indicator.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const token = await getAccessTokenSilently();
      const res = await fetch('/api/tools/threat-intel/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ indicator: indicator.trim(), indicatorType }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Analysis failed.');
      } else {
        setResult(data);
        push('threat-intel', `${data.indicatorType.toUpperCase()}: ${data.indicator}`, data, 'threat-intel');
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
        <span style={styles.title}>Threat Intelligence Aggregator</span>
        <p style={styles.subtitle}>
          Enter an IP, domain, URL, or file hash. Aggregates data from AbuseIPDB, VirusTotal, Shodan, IPInfo, ThreatFox, URLhaus, and MalwareBazaar.
        </p>
      </div>

      <div style={{ ...styles.inputRow, flexDirection: isMobile ? 'column' : 'row' }}>
        <input
          style={styles.input}
          placeholder="1.2.3.4, example.com, https://..., or md5/sha256 hash"
          value={indicator}
          onChange={e => setIndicator(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !loading && indicator.trim() && handleAnalyze()}
          disabled={loading}
        />
        <select
          style={isMobile ? { ...styles.select, width: '100%' } : styles.select}
          value={indicatorType}
          onChange={e => setIndicatorType(e.target.value)}
          disabled={loading}
        >
          <option value="auto">Auto-detect</option>
          <option value="ip">IP Address</option>
          <option value="domain">Domain</option>
          <option value="url">URL</option>
          <option value="hash">File Hash</option>
        </select>
        <button
          style={styles.button(loading)}
          onClick={handleAnalyze}
          disabled={loading || !indicator.trim()}
        >
          {loading ? 'Scanning...' : 'Analyze'}
        </button>
      </div>

      {error && <p style={styles.error}>{error}</p>}

      {result && (
        <div style={styles.results}>
          <div style={styles.summaryCard}>
            <div style={styles.threatRow}>
              <div style={styles.threatBadge(result.threatLevel)}>{result.threatLevel} threat</div>
              <span style={styles.targetLabel}>{result.indicatorType} — {result.indicator}</span>
            </div>

            <div style={styles.summaryText}>{result.summary}</div>

            {result.flags?.length > 0 && (
              <>
                <div style={styles.label}>Flags</div>
                <div style={{ marginBottom: '16px' }}>
                  {result.flags.map((flag, i) => (
                    <div key={i} style={styles.flagItem}>⚠ {flag}</div>
                  ))}
                </div>
              </>
            )}

            {result.recommendations?.length > 0 && (
              <>
                <div style={styles.label}>Recommendations</div>
                <div>
                  {result.recommendations.map((rec, i) => (
                    <div key={i} style={styles.actionItem}>{i + 1}. {rec}</div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div style={{ ...styles.sourcesGrid, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
            <SourceCard title="AbuseIPDB" data={result.sources?.abuseipdb} />
            <SourceCard title="VirusTotal" data={result.sources?.virusTotal} />
            <SourceCard title="Shodan" data={result.sources?.shodan} />
            <SourceCard title="IPInfo" data={result.sources?.ipInfo} />
            <SourceCard title="ThreatFox" data={result.sources?.threatFox} />
            <SourceCard title="URLhaus" data={result.sources?.urlhaus} />
            <SourceCard title="MalwareBazaar" data={result.sources?.malwareBazaar} />
          </div>
        </div>
      )}
    </div>
  );
}
