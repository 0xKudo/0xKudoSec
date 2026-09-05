import { useState, useEffect, useRef } from 'react';
import { useIsMobile } from '../../../platform/shell/src/hooks/useIsMobile.js';
import { Button, TextArea, Input } from '../../../platform/shell/src/components/ui/index.js';
import { useWorkspace } from '../../../platform/shell/src/context/WorkspaceContext.jsx';
import DesktopOnly from '../../../platform/shell/src/components/DesktopOnly.jsx';

const isElectron = typeof window !== 'undefined' && window.electron?.isElectron === true;

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
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    padding: '16px',
    marginBottom: '20px',
  },
  riskBadge: (level) => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
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
  const isMobile = useIsMobile();
  const [domain, setDomain] = useState('');
  const [sources, setSources] = useState(['crtsh', 'hackertarget']);
  const [bruteCustom, setBruteCustom] = useState('');
  const [liveSubs, setLiveSubs] = useState([]); // streamed in live
  const [result, setResult] = useState(null);    // full result set on done
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const runIdRef = useRef(null);
  const { push } = useWorkspace();

  // Subscribe to local subdomain-enum IPC events (desktop app only). Dispatch by runId.
  useEffect(() => {
    if (!isElectron) return;
    const offFound = window.electron.subdomainEnum.onFound((d) => {
      if (d.runId !== runIdRef.current) return;
      setLiveSubs(prev => prev.includes(d.subdomain) ? prev : [...prev, d.subdomain]);
    });
    const offDone = window.electron.subdomainEnum.onDone((d) => {
      if (d.runId !== runIdRef.current) return;
      setResult(d);
      setLoading(false);
      runIdRef.current = null;
      push('subdomain-enumerator', `Subdomains: ${d.domain} (${d.totalUnique} found)`,
        { domain: d.domain, subdomains: d.allSubdomains }, 'subdomain-enumerator');
    });
    const offError = window.electron.subdomainEnum.onError((d) => {
      if (d.runId !== runIdRef.current) return;
      setError(d.error);
      setLoading(false);
      runIdRef.current = null;
    });
    return () => { offFound?.(); offDone?.(); offError?.(); };
  }, []);

  function toggleSource(val) {
    setSources(prev => prev.includes(val) ? prev.filter(s => s !== val) : [...prev, val]);
  }

  async function handleEnumerate() {
    setLoading(true);
    setError(null);
    setResult(null);
    setLiveSubs([]);
    setStarted(true);
    runIdRef.current = null;

    const bruteWordlist = bruteCustom.trim()
      ? bruteCustom.split('\n').map(w => w.trim()).filter(Boolean)
      : [];

    const out = await window.electron.subdomainEnum.start({ domain: domain.trim(), sources, bruteWordlist });
    if (out.error) {
      setError(out.error);
      setLoading(false);
      return;
    }
    runIdRef.current = out.runId;
  }

  async function handleStop() {
    if (runIdRef.current) await window.electron.subdomainEnum.cancel(runIdRef.current);
  }

  // Subdomains to display: full sorted set once done, else the live-streamed set.
  const displaySubs = result ? result.allSubdomains : [...liveSubs].sort();

  function handleDownload() {
    if (!displaySubs.length) return;
    const blob = new Blob([displaySubs.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `subdomains-${(result?.domain || domain).trim()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const canEnumerate = !loading && domain.trim().length > 0 && sources.length > 0;

  if (!isElectron) return <DesktopOnly toolName="Subdomain Enumerator" downloadUrl="https://0xkudo.com/download" />;

  return (
    <div style={styles.container}>
      <div style={{ ...styles.header, margin: isMobile ? '-16px -16px 20px -16px' : '-24px -24px 20px -24px' }}>
        <span style={styles.title}>Subdomain Enumerator</span>
        <p style={styles.subtitle}>
          Discover subdomains via Certificate Transparency logs, HackerTarget, and brute-force DNS resolution.
        </p>
      </div>

      <div style={styles.section}>
        <span style={styles.label}>Target Domain</span>
        {isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            <Input
              style={{ width: '100%', minWidth: 0 }}
              placeholder="example.com"
              value={domain}
              onChange={e => setDomain(e.target.value)}
              disabled={loading}
              onKeyDown={e => e.key === 'Enter' && canEnumerate && handleEnumerate()}
            />
            {loading ? (
              <Button variant="danger" style={{ alignSelf: 'flex-start' }} onClick={handleStop}>Stop</Button>
            ) : (
              <Button style={{ alignSelf: 'flex-start' }} onClick={handleEnumerate} disabled={!canEnumerate}>Enumerate</Button>
            )}
          </div>
        ) : (
          <div style={styles.inputRow}>
            <Input
              style={{ minWidth: '280px' }}
              placeholder="example.com"
              value={domain}
              onChange={e => setDomain(e.target.value)}
              disabled={loading}
              onKeyDown={e => e.key === 'Enter' && canEnumerate && handleEnumerate()}
            />
            {loading ? (
              <Button variant="danger" style={{ height: '34px' }} onClick={handleStop}>Stop</Button>
            ) : (
              <Button style={{ height: '34px' }} onClick={handleEnumerate} disabled={!canEnumerate}>Enumerate</Button>
            )}
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
          <TextArea
            label="Custom Brute-force Wordlist (one per line, leave empty to use built-in ~70 prefixes)"
            rows={5}
            placeholder={'api\nwww\ndev\nstaging\nadmin'}
            value={bruteCustom}
            onChange={e => setBruteCustom(e.target.value)}
            disabled={loading}
          />
        </div>
      )}

      {error && <p style={styles.error}>{error}</p>}

      {started && (
        <div style={styles.results}>
          {/* Source cards (populated on completion) */}
          {result && (
            <>
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
                        {skipped ? src.skipped : hasError ? `Error: ${src.error}` : `${src.count} found`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Subdomain list — streams in live as sources resolve */}
          <div style={isMobile
            ? { display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }
            : styles.resultHeader
          }>
            <span style={styles.sectionHeader}>
              Subdomains: {displaySubs.length} unique{loading ? ' (enumerating…)' : ''}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button variant="ghost" onClick={() => navigator.clipboard.writeText(displaySubs.join('\n'))}>
                Copy All
              </Button>
              <Button variant="ghost" onClick={handleDownload}>
                Download .txt
              </Button>
            </div>
          </div>
          {displaySubs.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{loading ? 'Enumerating…' : 'No subdomains found.'}</p>
          ) : (
            <div style={styles.subdomainBox}>
              {displaySubs.join('\n')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
