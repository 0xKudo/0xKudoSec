import { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useWorkspace } from '../../../platform/shell/src/context/WorkspaceContext.jsx';

const THREAT_COLORS = {
  critical: 'var(--severity-critical)',
  high: 'var(--severity-high)',
  medium: 'var(--severity-medium)',
  low: 'var(--severity-low)',
  benign: 'var(--severity-low)',
  unknown: 'var(--text-muted)',
};

const ENCODING_HINTS = [
  { value: 'auto',        label: 'Auto-detect' },
  { value: 'base64',      label: 'Base64' },
  { value: 'hex',         label: 'Hex' },
  { value: 'url',         label: 'URL Encoding' },
  { value: 'html',        label: 'HTML Entities' },
  { value: 'unicode',     label: 'Unicode Escapes' },
  { value: 'rot13',       label: 'ROT13' },
  { value: 'powershell',  label: 'PowerShell' },
  { value: 'javascript',  label: 'JavaScript' },
  { value: 'python',      label: 'Python' },
  { value: 'bash',        label: 'Bash' },
  { value: 'binary',      label: 'Binary' },
  { value: 'other',       label: 'Other' },
];

const styles = {
  container: { maxWidth: '900px' },
  header: { marginBottom: '24px' },
  title: { color: 'var(--text-primary)', fontSize: '18px', marginBottom: '6px' },
  subtitle: { color: 'var(--text-muted)', fontSize: '13px' },
  controlRow: { display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' },
  select: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    fontSize: '13px',
    padding: '8px 12px',
    outline: 'none',
  },
  button: (loading) => ({
    background: loading ? 'var(--bg-surface)' : 'var(--btn-primary-bg)',
    color: loading ? 'var(--text-muted)' : 'var(--btn-primary-text)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '8px 20px',
    fontFamily: 'var(--font)',
    fontSize: '13px',
    fontWeight: 'bold',
    cursor: loading ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
  }),
  textarea: {
    width: '100%',
    minHeight: '180px',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    padding: '12px',
    outline: 'none',
    resize: 'vertical',
    boxSizing: 'border-box',
    marginBottom: '8px',
  },
  contextInput: {
    width: '100%',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    fontSize: '13px',
    padding: '8px 12px',
    outline: 'none',
    boxSizing: 'border-box',
    marginBottom: '12px',
  },
  error: { color: 'var(--severity-critical)', fontSize: '13px', marginTop: '12px' },
  results: { marginTop: '24px' },
  summaryCard: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '20px',
    marginBottom: '16px',
  },
  badgeRow: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' },
  badge: (color) => ({
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '4px',
    border: `1px solid ${color}`,
    color,
    fontSize: '12px',
    fontWeight: 'bold',
    textTransform: 'uppercase',
  }),
  label: { color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' },
  sectionBlock: { marginBottom: '16px' },
  explanationText: { color: 'var(--text-primary)', fontSize: '14px', lineHeight: '1.7' },
  intentText: { color: 'var(--text-primary)', fontSize: '14px', lineHeight: '1.6', marginBottom: '16px' },
  codeBlock: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '14px',
    fontFamily: 'var(--font)',
    fontSize: '12px',
    color: 'var(--text-primary)',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    maxHeight: '300px',
    overflowY: 'auto',
  },
  chip: {
    display: 'inline-block',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '3px 10px',
    fontSize: '12px',
    color: 'var(--text-muted)',
    marginRight: '6px',
    marginBottom: '4px',
  },
  indicatorItem: { padding: '5px 0', color: 'var(--severity-high)', fontSize: '13px', borderBottom: '1px solid var(--border)' },
};

export default function PayloadObfuscationExplainer() {
  const { getAccessTokenSilently } = useAuth0();
  const [payload, setPayload] = useState('');
  const [encodingHint, setEncodingHint] = useState('auto');
  const [context, setContext] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { push } = useWorkspace();

  useEffect(() => {
    try {
      const restore = JSON.parse(localStorage.getItem('workspace-restore-payload-obfuscation-explainer') || 'null');
      if (restore) { setResult(restore); localStorage.removeItem('workspace-restore-payload-obfuscation-explainer'); }
    } catch {}
  }, []);

  async function handleAnalyze() {
    if (!payload.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const token = await getAccessTokenSilently();
      const res = await fetch('/api/tools/payload-obfuscation-explainer/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ payload, encodingHint, context }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Analysis failed.');
      } else {
        setResult(data);
        push('payload-obfuscation-explainer', `Payload — ${data.payloadType}`, data, 'payload-obfuscation-explainer');
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
        <h1 style={styles.title}>Payload Obfuscation Explainer</h1>
        <p style={styles.subtitle}>
          Paste an obfuscated or encoded payload. Claude decodes it and explains what it does in plain English.
        </p>
      </div>

      <textarea
        style={styles.textarea}
        placeholder={`Paste payload here...\n\nExamples:\n  cG93ZXJzaGVsbCAtZW5jb2RlZA==  (base64)\n  %70%6f%77%65%72%73%68%65%6c%6c  (URL encoded)\n  powershell -e JABjAD0ATgBlAHcALQBPAGIAagBlAGMAdA...  (PS encoded command)`}
        value={payload}
        onChange={e => setPayload(e.target.value)}
        disabled={loading}
      />

      <input
        style={styles.contextInput}
        placeholder="Optional context (e.g. 'found in phishing email', 'from web server log')"
        value={context}
        onChange={e => setContext(e.target.value)}
        disabled={loading}
      />

      <div style={styles.controlRow}>
        <select style={styles.select} value={encodingHint} onChange={e => setEncodingHint(e.target.value)} disabled={loading}>
          {ENCODING_HINTS.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
        </select>
        <button style={styles.button(loading)} onClick={handleAnalyze} disabled={loading || !payload.trim()}>
          {loading ? 'Analyzing...' : 'Analyze'}
        </button>
      </div>

      {error && <p style={styles.error}>{error}</p>}

      {result && (
        <div style={styles.results}>
          <div style={styles.summaryCard}>
            <div style={styles.badgeRow}>
              <div style={styles.badge(THREAT_COLORS[result.threatLevel] || 'var(--border)')}>
                {result.threatLevel}
              </div>
              <div style={styles.badge(result.isMalicious ? 'var(--severity-critical)' : 'var(--severity-low)')}>
                {result.isMalicious ? 'malicious' : 'not malicious'}
              </div>
              {result.payloadType && (
                <div style={styles.badge('var(--text-muted)')}>{result.payloadType}</div>
              )}
            </div>

            {result.intent && (
              <div style={styles.intentText}>{result.intent}</div>
            )}

            {result.encodingLayers?.length > 0 && (
              <div style={styles.sectionBlock}>
                <div style={styles.label}>Encoding Layers</div>
                <div>
                  {result.encodingLayers.map((layer, i) => (
                    <span key={i} style={styles.chip}>{layer}</span>
                  ))}
                </div>
              </div>
            )}

            {result.decodedPayload && (
              <div style={styles.sectionBlock}>
                <div style={styles.label}>Decoded Payload</div>
                <div style={styles.codeBlock}>{result.decodedPayload}</div>
              </div>
            )}

            {result.indicators?.length > 0 && (
              <div style={styles.sectionBlock}>
                <div style={styles.label}>Indicators of Compromise</div>
                {result.indicators.map((ioc, i) => (
                  <div key={i} style={styles.indicatorItem}>⚠ {ioc}</div>
                ))}
              </div>
            )}

            {result.explanation && (
              <div style={styles.sectionBlock}>
                <div style={styles.label}>Explanation</div>
                <div style={styles.explanationText}>{result.explanation}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
