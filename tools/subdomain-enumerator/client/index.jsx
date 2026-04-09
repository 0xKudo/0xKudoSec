import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useIsMobile } from '../../../platform/shell/src/hooks/useIsMobile.js';
import { useWorkspace } from '../../../platform/shell/src/context/WorkspaceContext.jsx';

const SOURCE_OPTIONS = [
  { value: 'crtsh', label: 'crt.sh (Certificate Transparency)' },
  { value: 'hackertarget', label: 'HackerTarget API' },
  { value: 'brute', label: 'Brute-force DNS resolution' },
];

const RISK_COLORS = {
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
  title: { fontSize: '13px', color: 'var(--text-primary)', letterSpacing: '0.02em', margin: 0, fontWeight: 'normal' },
  subtitle: { color: 'var(--text-muted)', fontSize: '11px', margin: 0 },
  section: { marginBottom: '16px' },
  label: { color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px', display: 'block' },
  inputRow: { display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '16px' },
  input: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    padding: '6px 10px',
    outline: 'none',
    minWidth: '280px',
  },
  textarea: {
    width: '100%',
    minHeight: '80px',
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
  checkRow: { display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' },
  checkItem: { display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-primary)', fontSize: '13px', cursor: 'pointer', fontWeight: 'normal' },
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
  secondaryBtn: {
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border)',
    padding: '6px 14px',
        fontSize: '12px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
  },
  error: { color: 'var(--severity-critical)', fontSize: '13px', marginTop: '8px' },
  results: { marginTop: '28px' },
  analysisCard: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    padding: '16px',
    marginBottom: '20px',
  },
  riskBadge: (level) => ({
    display: 'inline-block',
    background: RISK_COLORS[level] || RISK_COLORS.info,
    color: '#fff',
    fontSize: '10px',
    
    padding: '2px 8px',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginLeft: '10px',
  }),
  cardTitle: { color: 'var(--text-primary)', fontSize: '14px',  marginBottom: '10px' },
  summary: { color: 'var(--text-primary)', fontSize: '13px', lineHeight: '1.6', marginBottom: '12px' },
  listLabel: { color: 'var(--text-muted)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '10px', marginBottom: '4px' },
  listItem: { color: 'var(--text-primary)', fontSize: '12px', lineHeight: '1.7', marginLeft: '12px' },
  sourcesGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px', marginBottom: '20px' },
  sourceCard: (hasError, skipped) => ({
    background: 'var(--bg-surface)',
    border: `1px solid ${hasError ? 'var(--severity-critical)' : skipped ? 'var(--border)' : 'var(--border)'}`,
    padding: '6px 10px',
    opacity: skipped ? 0.5 : 1,
  }),
  sourceTitle: { color: 'var(--text-primary)', fontSize: '12px',  marginBottom: '4px' },
  sourceMeta: { color: 'var(--text-muted)', fontSize: '11px' },
  subdomainBox: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    padding: '6px 10px',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    color: 'var(--text-primary)',
    maxHeight: '300px',
    overflowY: 'auto',
    whiteSpace: 'pre',
    lineHeight: '1.6',
  },
  resultHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' },
  resultMeta: { color: 'var(--text-muted)', fontSize: '12px' },
  sectionHeader: { color: 'var(--text-primary)', fontSize: '14px',  marginBottom: '12px' },
};

export default function SubdomainEnumerator() {
  const { getAccessTokenSilently } = useAuth0();
  const isMobile = useIsMobile();
  const [domain, setDomain] = useState('');
  const [sources, setSources] = useState(['crtsh', 'hackertarget']);
  const [bruteCustom, setBruteCustom] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { push } = useWorkspace();

  useEffect(() => {
    try {
      const restore = JSON.parse(localStorage.getItem('workspace-restore-subdomain-enumerator') || 'null');
      if (restore) {
        setDomain(restore.domain || '');
        // Normalize workspace-restored data to full result shape
        setResult({
          domain: restore.domain || '',
          allSubdomains: restore.allSubdomains || restore.subdomains || [],
          totalUnique: restore.totalUnique ?? (restore.allSubdomains || restore.subdomains || []).length,
          sources: restore.sources || {},
          analysis: restore.analysis || null,
        });
        localStorage.removeItem('workspace-restore-subdomain-enumerator');
      }
    } catch {}
  }, []);

  function toggleSource(val) {
    setSources(prev => prev.includes(val) ? prev.filter(s => s !== val) : [...prev, val]);
  }

  async function handleEnumerate() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const bruteWordlist = bruteCustom.trim()
        ? bruteCustom.split('\n').map(w => w.trim()).filter(Boolean)
        : [];

      const token = await getAccessTokenSilently();
      const res = await fetch('/api/tools/subdomain-enumerator/enumerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ domain: domain.trim(), sources, bruteWordlist }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Enumeration failed.');
      } else {
        setResult(data);
        push(
          'subdomain-enumerator',
          `Subdomains — ${data.domain} (${data.totalUnique} found)`,
          { domain: data.domain, subdomains: data.allSubdomains },
          'subdomain-enumerator'
        );
      }
    } catch {
      setError('Network error. Is the server running?');
    } finally {
      setLoading(false);
    }
  }

  function handleDownload() {
    if (!result) return;
    const blob = new Blob([result.allSubdomains.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `subdomains-${result.domain}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const canEnumerate = !loading && domain.trim().length > 0 && sources.length > 0;

  return (
    <div style={styles.container}>
      <div style={{ ...styles.header, margin: isMobile ? '-16px -16px 20px -16px' : '-24px -24px 20px -24px' }}>
        <span style={styles.title}>Subdomain Enumerator</span>
        <p style={styles.subtitle}>
          Discover subdomains via Certificate Transparency logs, HackerTarget, SecurityTrails, and brute-force DNS resolution.
        </p>
      </div>

      <div style={styles.section}>
        <span style={styles.label}>Target Domain</span>
        {isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            <input
              style={{ ...styles.input, minWidth: 0, width: '100%', boxSizing: 'border-box' }}
              placeholder="example.com"
              value={domain}
              onChange={e => setDomain(e.target.value)}
              disabled={loading}
              onKeyDown={e => e.key === 'Enter' && canEnumerate && handleEnumerate()}
            />
            <button style={{ ...styles.button(!canEnumerate), width: '100%' }} onClick={handleEnumerate} disabled={!canEnumerate}>
              {loading ? 'Enumerating...' : 'Enumerate'}
            </button>
          </div>
        ) : (
          <div style={styles.inputRow}>
            <input
              style={styles.input}
              placeholder="example.com"
              value={domain}
              onChange={e => setDomain(e.target.value)}
              disabled={loading}
              onKeyDown={e => e.key === 'Enter' && canEnumerate && handleEnumerate()}
            />
            <button style={{ ...styles.button(!canEnumerate), width: isMobile ? '100%' : undefined }} onClick={handleEnumerate} disabled={!canEnumerate}>
              {loading ? 'Enumerating...' : 'Enumerate'}
            </button>
          </div>
        )}
      </div>

      <div style={styles.section}>
        <span style={styles.label}>Sources</span>
        <div style={styles.checkRow}>
          {SOURCE_OPTIONS.map(opt => (
            <label key={opt.value} style={styles.checkItem}>
              <input
                type="checkbox"
                checked={sources.includes(opt.value)}
                onChange={() => toggleSource(opt.value)}
                disabled={loading}
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      {sources.includes('brute') && (
        <div style={styles.section}>
          <span style={styles.label}>Custom Brute-force Wordlist (one per line — leave empty to use built-in ~70 prefixes)</span>
          <textarea
            style={styles.textarea}
            placeholder={'api\nwww\ndev\nstaging\nadmin'}
            value={bruteCustom}
            onChange={e => setBruteCustom(e.target.value)}
            disabled={loading}
          />
        </div>
      )}

      {error && <p style={styles.error}>{error}</p>}

      {result && (
        <div style={styles.results}>
          {/* AI Analysis */}
          <div style={styles.analysisCard}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
              <span style={styles.cardTitle}>AI Analysis</span>
              {result.analysis?.riskLevel && (
                <span style={styles.riskBadge(result.analysis.riskLevel)}>
                  {result.analysis.riskLevel}
                </span>
              )}
            </div>
            {result.analysis?.summary && (
              <p style={styles.summary}>{result.analysis.summary}</p>
            )}
            {result.analysis?.flags?.length > 0 && (
              <>
                <div style={styles.listLabel}>Flags</div>
                {result.analysis.flags.map((f, i) => (
                  <div key={i} style={styles.listItem}>• {f}</div>
                ))}
              </>
            )}
            {result.analysis?.interestingSubdomains?.length > 0 && (
              <>
                <div style={styles.listLabel}>Notable Subdomains</div>
                {result.analysis.interestingSubdomains.map((s, i) => (
                  <div key={i} style={styles.listItem}>• {s}</div>
                ))}
              </>
            )}
            {result.analysis?.recommendations?.length > 0 && (
              <>
                <div style={styles.listLabel}>Recommendations</div>
                {result.analysis.recommendations.map((r, i) => (
                  <div key={i} style={styles.listItem}>• {r}</div>
                ))}
              </>
            )}
          </div>

          {/* Source cards */}
          <div style={styles.sectionHeader}>Sources</div>
          <div style={styles.sourcesGrid}>
            {[
              { key: 'crtsh', label: 'crt.sh' },
              { key: 'hackertarget', label: 'HackerTarget' },
              { key: 'brute', label: 'Brute-force DNS' },
            ].map(({ key, label }) => {
              const src = result.sources?.[key];
              if (!src) return null;
              const skipped = !!src.skipped;
              const hasError = !!src.error;
              return (
                <div key={key} style={styles.sourceCard(hasError, skipped)}>
                  <div style={styles.sourceTitle}>{label}</div>
                  <div style={styles.sourceMeta}>
                    {skipped
                      ? src.skipped
                      : hasError
                        ? `Error: ${src.error}`
                        : `${src.count} found`}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Full subdomain list */}
          <div style={isMobile
            ? { display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }
            : styles.resultHeader
          }>
            <span style={styles.sectionHeader}>
              All Subdomains — {result.totalUnique} unique
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button style={styles.secondaryBtn} onClick={() => navigator.clipboard.writeText(result.allSubdomains.join('\n'))}>
                Copy All
              </button>
              <button style={styles.secondaryBtn} onClick={handleDownload}>
                Download .txt
              </button>
            </div>
          </div>
          {result.allSubdomains.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No subdomains found.</p>
          ) : (
            <div style={styles.subdomainBox}>
              {result.allSubdomains.join('\n')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
