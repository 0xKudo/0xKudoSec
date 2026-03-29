import { useState } from 'react';
import { useWorkspace } from '../../../platform/shell/src/context/WorkspaceContext.jsx';

const RISK_COLORS = {
  critical: 'var(--severity-critical)',
  high: 'var(--severity-high)',
  medium: 'var(--severity-medium)',
  low: 'var(--severity-low)',
  unknown: 'var(--text-muted)',
};

const styles = {
  container: { maxWidth: '900px' },
  header: { marginBottom: '24px' },
  title: { color: 'var(--text-primary)', fontSize: '18px', marginBottom: '6px' },
  subtitle: { color: 'var(--text-muted)', fontSize: '13px' },
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
  riskRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '12px',
  },
  riskBadge: (level) => ({
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
  flagItem: {
    padding: '5px 0',
    color: 'var(--severity-high)',
    fontSize: '13px',
    borderBottom: '1px solid var(--border)',
  },
  actionItem: {
    padding: '5px 0',
    color: 'var(--text-primary)',
    fontSize: '13px',
    borderBottom: '1px solid var(--border)',
  },
  sourcesGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
  },
  sourceCard: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '16px',
  },
  sourceTitle: {
    color: 'var(--text-primary)',
    fontSize: '13px',
    fontWeight: 'bold',
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
  if (data.skipped) return (
    <div style={styles.sourceCard}>
      <div style={styles.sourceTitle}>{title}</div>
      {data.ip_str && <SourceRow label="Resolved IP" value={data.ip_str} />}
      <div style={styles.skippedText}>{data.skipped}</div>
    </div>
  );

  const renderContent = () => {
    switch (title) {
      case 'IPInfo':
        return <>
          <SourceRow label="IP" value={data.ip} />
          <SourceRow label="Hostname" value={data.hostname} />
          <SourceRow label="Location" value={[data.city, data.region, data.country].filter(Boolean).join(', ')} />
          <SourceRow label="Organization" value={data.org} />
          <SourceRow label="Timezone" value={data.timezone} />
        </>;
      case 'VirusTotal':
        return <>
          <SourceRow label="Reputation" value={data.reputation} />
          <SourceRow label="Malicious" value={data.lastAnalysisStats?.malicious} />
          <SourceRow label="Suspicious" value={data.lastAnalysisStats?.suspicious} />
          <SourceRow label="Harmless" value={data.lastAnalysisStats?.harmless} />
          <SourceRow label="Undetected" value={data.lastAnalysisStats?.undetected} />
        </>;
      case 'Hunter.io':
        return <>
          <SourceRow label="Organization" value={data.organization} />
          <SourceRow label="Emails Found" value={data.emailCount} />
          <SourceRow label="Disposable" value={data.disposable !== undefined ? String(data.disposable) : undefined} />
          <SourceRow label="Webmail" value={data.webmail !== undefined ? String(data.webmail) : undefined} />
          {data.emails?.map((e, i) => (
            <SourceRow key={i} label={e.type || `Email ${i+1}`} value={`${e.value} (${e.confidence}%)`} />
          ))}
        </>;
      case 'WHOIS':
        return <>
          <SourceRow label="Registrar" value={data.registrar} />
          <SourceRow label="Created" value={data.createdDate} />
          <SourceRow label="Expires" value={data.expiresDate} />
          <SourceRow label="Updated" value={data.updatedDate} />
          <SourceRow label="Registrant Org" value={data.registrantOrg} />
          <SourceRow label="Country" value={data.registrantCountry} />
          <SourceRow label="Name Servers" value={Array.isArray(data.nameServers) ? data.nameServers.join(', ') : data.nameServers} />
        </>;
      case 'Shodan':
        return <>
          <SourceRow label="IP" value={data.ip_str} />
          <SourceRow label="Organization" value={data.org} />
          <SourceRow label="OS" value={data.os} />
          <SourceRow label="Country" value={data.country_name} />
          <SourceRow label="Open Ports" value={data.ports?.join(', ')} />
          <SourceRow label="Vulns" value={data.vulns ? Object.keys(data.vulns).join(', ') : undefined} />
          {!data.ip_str && !data.ports && <div style={styles.skippedText}>No host data returned</div>}
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

export default function OsintReconTool() {
  const [target, setTarget] = useState('');
  const [targetType, setTargetType] = useState('auto');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { push } = useWorkspace();

  async function handleAnalyze() {
    if (!target.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/tools/osint-recon/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: target.trim(), targetType }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Analysis failed.');
      } else {
        setResult(data);
        push('osint-recon', `${data.targetType.toUpperCase()}: ${data.target}`, data, 'osint-recon');
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
        <h1 style={styles.title}>OSINT Recon Dashboard</h1>
        <p style={styles.subtitle}>
          Enter a domain, IP address, or email. Aggregates data from Shodan, VirusTotal, Hunter.io, IPInfo, and WHOIS.
        </p>
      </div>

      <div style={styles.inputRow}>
        <input
          style={styles.input}
          placeholder="example.com, 192.168.1.1, or user@example.com"
          value={target}
          onChange={e => setTarget(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !loading && target.trim() && handleAnalyze()}
          disabled={loading}
        />
        <select
          style={styles.select}
          value={targetType}
          onChange={e => setTargetType(e.target.value)}
          disabled={loading}
        >
          <option value="auto">Auto-detect</option>
          <option value="domain">Domain</option>
          <option value="ip">IP Address</option>
          <option value="email">Email</option>
        </select>
        <button
          style={styles.button(loading)}
          onClick={handleAnalyze}
          disabled={loading || !target.trim()}
        >
          {loading ? 'Scanning...' : 'Run Recon'}
        </button>
      </div>

      {error && <p style={styles.error}>{error}</p>}

      {result && (
        <div style={styles.results}>
          <div style={styles.summaryCard}>
            <div style={styles.riskRow}>
              <div style={styles.riskBadge(result.riskLevel)}>{result.riskLevel} risk</div>
              <span style={styles.targetLabel}>{result.targetType} — {result.target}</span>
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

          <div style={styles.sourcesGrid}>
            <SourceCard title="IPInfo" data={result.sources?.ipInfo} />
            <SourceCard title="VirusTotal" data={result.sources?.virusTotal} />
            <SourceCard title="WHOIS" data={result.sources?.whois} />
            <SourceCard title="Hunter.io" data={result.sources?.hunter} />
            <SourceCard title="Shodan" data={result.sources?.shodan} />
          </div>
        </div>
      )}
    </div>
  );
}
