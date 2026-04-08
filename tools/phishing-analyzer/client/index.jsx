import { useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useIsMobile } from '../../../platform/shell/src/hooks/useIsMobile.js';

const VERDICT_COLORS = {
  phishing: 'var(--severity-critical)',
  suspicious: 'var(--severity-high)',
  legitimate: 'var(--severity-low)',
  unknown: 'var(--severity-info)',
};

const INDICATOR_LABELS = {
  'sender-spoofing': 'Sender Spoofing',
  'urgency': 'Urgency Tactic',
  'suspicious-link': 'Suspicious Link',
  'credential-harvesting': 'Credential Harvesting',
  'attachment-risk': 'Attachment Risk',
  'brand-impersonation': 'Brand Impersonation',
  'grammar-issues': 'Grammar Issues',
  'unusual-request': 'Unusual Request',
  'header-anomaly': 'Header Anomaly',
  'lookalike-domain': 'Lookalike Domain',
};

const styles = {
  container: { maxWidth: '800px' },
  header: {
    margin: '-24px -24px 0 -24px',
    padding: '12px 20px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  title: { fontSize: '13px', color: 'var(--text-primary)', letterSpacing: '0.02em', margin: 0 },
  subtitle: { color: 'var(--text-muted)', fontSize: '11px', margin: 0 },
  textarea: {
    width: '100%',
    minHeight: '200px',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
    fontSize: '13px',
    padding: '6px 10px',
    resize: 'vertical',
    outline: 'none',
    marginBottom: '12px',
  },
  button: (loading) => ({
    background: loading ? 'var(--bg-surface)' : 'var(--btn-primary-bg)',
    color: loading ? 'var(--text-muted)' : 'var(--btn-primary-text)',
    border: '1px solid var(--border)',
    padding: '4px 12px',
    fontFamily: 'var(--font)',
    fontSize: '11px',
    cursor: loading ? 'not-allowed' : 'pointer',
  }),
  error: { color: 'var(--severity-critical)', fontSize: '13px', marginTop: '12px' },
  results: {
    marginTop: '24px',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    padding: '20px',
  },
  verdictRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
    paddingBottom: '16px',
    borderBottom: '1px solid var(--border)',
  },
  verdictBadge: (verdict) => ({
    display: 'inline-block',
    padding: '4px 14px',
    border: `1px solid ${VERDICT_COLORS[verdict] || 'var(--border)'}`,
    color: VERDICT_COLORS[verdict] || 'var(--text-muted)',
    fontSize: '10px',
    textTransform: 'uppercase',
  }),
  confidence: {
    color: 'var(--text-muted)',
    fontSize: '12px',
  },
  label: {
    color: 'var(--text-muted)',
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '8px',
  },
  summary: {
    color: 'var(--text-primary)',
    fontSize: '14px',
    lineHeight: '1.6',
    marginBottom: '20px',
  },
  indicatorList: { marginBottom: '20px' },
  indicatorItem: {
    display: 'flex',
    gap: '12px',
    padding: '8px 0',
    borderBottom: '1px solid var(--border)',
    alignItems: 'flex-start',
  },
  indicatorType: {
    color: 'var(--severity-high)',
    fontSize: '10px',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
    minWidth: '160px',
  },
  indicatorDetail: {
    color: 'var(--text-primary)',
    fontSize: '13px',
    lineHeight: '1.5',
  },
  urlList: { marginBottom: '20px' },
  urlItem: {
    padding: '6px 0',
    color: 'var(--severity-critical)',
    fontSize: '12px',
    fontFamily: 'var(--font)',
    borderBottom: '1px solid var(--border)',
    wordBreak: 'break-all',
  },
  actionItem: {
    padding: '6px 0',
    color: 'var(--text-primary)',
    fontSize: '13px',
    borderBottom: '1px solid var(--border)',
  },
  senderBox: {
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    padding: '6px 10px',
    color: 'var(--severity-high)',
    fontFamily: 'var(--font)',
    fontSize: '13px',
    marginBottom: '20px',
    wordBreak: 'break-all',
  },
  tabRow: { display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', margin: '0 -24px', paddingLeft: '8px', marginBottom: '20px' },
  tab: (active) => ({
    padding: '4px 12px',
    fontSize: '11px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    borderBottom: active ? '2px solid var(--accent-amber)' : '2px solid transparent',
    background: 'none',
    border: 'none',
    borderBottomWidth: '2px',
    borderBottomStyle: 'solid',
    borderBottomColor: active ? 'var(--accent-amber)' : 'transparent',
    fontFamily: 'var(--font)',
  }),
  uploadArea: {
    width: '100%',
    minHeight: '120px',
    background: 'var(--bg-surface)',
    border: '1px dashed var(--border)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    marginBottom: '12px',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    fontSize: '13px',
  },
  fileChosen: {
    color: 'var(--text-primary)',
    fontSize: '13px',
    marginBottom: '12px',
  },
};

export default function PhishingAnalyzerTool() {
  const isMobile = useIsMobile();
  const { getAccessTokenSilently } = useAuth0();
  const [tab, setTab] = useState('paste'); // 'paste' | 'upload'
  const [emailText, setEmailText] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.eml')) {
      setError('Only .eml files are accepted');
      return;
    }
    setError(null);
    setSelectedFile(file);
  }

  async function handleUploadAnalyze() {
    if (!selectedFile) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const token = await getAccessTokenSilently();
      const formData = new FormData();
      formData.append('emailFile', selectedFile);

      const res = await fetch('/api/tools/phishing-analyzer/analyze-file', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Analysis failed.');
      } else {
        setResult(data);
      }
    } catch {
      setError('Network error. Is the server running?');
    } finally {
      setLoading(false);
    }
  }

  async function handleAnalyze() {
    if (!emailText.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const token = await getAccessTokenSilently();
      const res = await fetch('/api/tools/phishing-analyzer/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ emailText }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Analysis failed.');
      } else {
        setResult(data);
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
        <span style={styles.title}>Phishing Email Analyzer</span>
        <p style={styles.subtitle}>
          Paste the full email (including headers if available). Get a phishing verdict, indicators, and recommended actions.
        </p>
      </div>

      <div style={styles.tabRow}>
        <button style={styles.tab(tab === 'paste')} onClick={() => setTab('paste')}>Paste Text</button>
        <button style={styles.tab(tab === 'upload')} onClick={() => setTab('upload')}>Upload .eml</button>
      </div>

      {tab === 'paste' && (
        <>
          <textarea
            style={styles.textarea}
            placeholder="Paste email content here (headers, body, links)..."
            value={emailText}
            onChange={e => setEmailText(e.target.value)}
            disabled={loading}
          />
          <button
            style={styles.button(loading)}
            onClick={handleAnalyze}
            disabled={loading || !emailText.trim()}
          >
            {loading ? 'Analyzing...' : 'Analyze Email'}
          </button>
        </>
      )}

      {tab === 'upload' && (
        <>
          <label style={styles.uploadArea}>
            <span>Click to select a .eml file</span>
            <span style={{ fontSize: '11px', color: 'var(--text-subtle)' }}>Max 100kb</span>
            <input
              type="file"
              accept=".eml"
              style={{ display: 'none' }}
              onChange={handleFileChange}
              disabled={loading}
            />
          </label>
          {selectedFile && (
            <div style={styles.fileChosen}>Selected: {selectedFile.name}</div>
          )}
          <button
            style={styles.button(loading)}
            onClick={handleUploadAnalyze}
            disabled={loading || !selectedFile}
          >
            {loading ? 'Analyzing...' : 'Analyze File'}
          </button>
        </>
      )}

      {error && <p style={styles.error}>{error}</p>}

      {result && (
        <div style={styles.results}>
          <div style={styles.verdictRow}>
            <div style={styles.verdictBadge(result.verdict)}>{result.verdict}</div>
            <span style={styles.confidence}>Confidence: {result.confidence}</span>
          </div>

          <div style={styles.label}>Summary</div>
          <div style={styles.summary}>{result.summary}</div>

          {result.suspiciousSender && (
            <>
              <div style={styles.label}>Suspicious Sender</div>
              <div style={styles.senderBox}>{result.suspiciousSender}</div>
            </>
          )}

          {result.indicators?.length > 0 && (
            <>
              <div style={styles.label}>Indicators ({result.indicators.length})</div>
              <div style={styles.indicatorList}>
                {result.indicators.map((ind, i) => (
                  <div key={i} style={{ ...styles.indicatorItem, flexDirection: isMobile ? 'column' : 'row' }}>
                    <span style={{ ...styles.indicatorType, minWidth: isMobile ? 0 : '160px' }}>
                      {INDICATOR_LABELS[ind.type] || ind.type}
                    </span>
                    <span style={styles.indicatorDetail}>{ind.detail}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {result.suspiciousUrls?.length > 0 && (
            <>
              <div style={styles.label}>Suspicious URLs ({result.suspiciousUrls.length})</div>
              <div style={styles.urlList}>
                {result.suspiciousUrls.map((url, i) => (
                  <div key={i} style={styles.urlItem}>{url}</div>
                ))}
              </div>
            </>
          )}

          {result.recommendedActions?.length > 0 && (
            <>
              <div style={styles.label}>Recommended Actions</div>
              <div>
                {result.recommendedActions.map((action, i) => (
                  <div key={i} style={styles.actionItem}>{i + 1}. {action}</div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
